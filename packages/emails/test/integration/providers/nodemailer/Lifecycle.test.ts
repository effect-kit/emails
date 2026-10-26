import { assert, describe, it } from "@effect/vitest";
import { Cause, ConfigProvider, Duration, Effect, Exit, Fiber, Layer, Result } from "effect";

import { Email } from "@effect-kit/emails";
import * as Nodemailer from "@effect-kit/emails/nodemailer";
import { createTransport } from "nodemailer";
import { afterEach, vi } from "vitest";

import { message } from "../../../fixtures/email.js";
import { smtpServer } from "../../../fixtures/smtp/server.js";

afterEach(() => vi.restoreAllMocks());

describe("SMTP ownership and local failures", () => {
  it.effect(
    "a borrowed pool remains usable after our Layer closes and is closed only by its owner",
    () =>
      Effect.gen(function* () {
        const fixture = yield* smtpServer();
        let closes = 0;
        yield* Effect.gen(function* () {
          const client = yield* Effect.acquireRelease(
            Effect.sync(() =>
              createTransport({
                host: "127.0.0.1",
                port: fixture.port,
                pool: true,
                maxRequeues: 0,
              }),
            ),
            (resource) =>
              Effect.sync(() => {
                closes++;
                resource.close();
              }),
          );
          const close = vi.spyOn(client, "close");
          yield* Effect.gen(function* () {
            const email = yield* Email;
            yield* Effect.all([email.send(message), email.send(message)], { concurrency: 2 });
          }).pipe(Effect.provide(Nodemailer.layerClient(client)));
          assert.strictEqual(close.mock.calls.length, 0);
          yield* Effect.promise(() =>
            client.sendMail({
              from: message.from,
              to: message.to,
              subject: "Still owned",
              text: "Offline",
            }),
          );
          assert.lengthOf(fixture.messages, 3);
        }).pipe(Effect.scoped);
        yield* Effect.promise(() => fixture.closed);
        assert.strictEqual(closes, 1);
      }),
  );

  it.effect(
    "an owned pool is shared for concurrent submissions and closes on scope completion",
    () =>
      Effect.gen(function* () {
        const fixture = yield* smtpServer();
        yield* Effect.gen(function* () {
          const email = yield* Email;
          yield* Effect.all(
            Array.from({ length: 4 }, (_, index) =>
              email.send({ ...message, subject: `Message ${index}` }),
            ),
            { concurrency: 4 },
          );
          assert.lengthOf(fixture.messages, 4);
          assert.strictEqual(fixture.server.connections.size, 1);
        }).pipe(
          Effect.provide(
            Nodemailer.layer({
              transport: { host: "127.0.0.1", port: fixture.port, pool: true, maxConnections: 1 },
            }),
          ),
        );
        yield* Effect.promise(() => fixture.closed);
        assert.strictEqual(fixture.server.connections.size, 0);
      }),
  );

  it.effect(
    "owned scope interruption drains the already submitted operation and closes its pool",
    () =>
      Effect.gen(function* () {
        const data = Promise.withResolvers<() => void>();
        let submissions = 0;
        const fixture = yield* smtpServer({
          onData: (stream, _session, callback) => {
            stream.resume();
            stream.once("end", () => {
              submissions++;
              data.resolve(() => callback(null, "queued offline"));
            });
          },
        });
        const program = Effect.gen(function* () {
          const email = yield* Email;
          return yield* email.send(message);
        }).pipe(
          Effect.provide(
            Nodemailer.layer({ transport: { host: "127.0.0.1", port: fixture.port, pool: true } }),
          ),
        );
        const fiber = yield* Effect.forkChild(program);
        const acknowledge = yield* Effect.promise(() => data.promise);
        const cancel = yield* Effect.forkChild(Fiber.interrupt(fiber));
        yield* Effect.yieldNow;
        acknowledge();
        yield* Fiber.join(cancel);
        const exit = yield* Fiber.await(fiber);
        assert.isTrue(Exit.isFailure(exit));
        if (Exit.isFailure(exit)) assert.isTrue(Cause.hasInterruptsOnly(exit.cause));
        yield* Effect.promise(() => fixture.closed);
        assert.strictEqual(submissions, 1);
        assert.strictEqual(fixture.server.connections.size, 0);
      }),
  );

  it.effect.each([
    ["/effect-emails-fixture-does-not-exist", "File access rejected"],
    ["http://127.0.0.1:1/offline-fixture", "Url access rejected"],
  ] as const)("blocks file/URL reads introduced by a borrowed plugin %j", ([path, denial]) =>
    Effect.gen(function* () {
      const fixture = yield* smtpServer();
      const client = yield* Effect.acquireRelease(
        Effect.sync(() => createTransport({ host: "127.0.0.1", port: fixture.port })),
        (resource) => Effect.sync(() => resource.close()),
      );
      client.use("compile", (mail, callback) => {
        mail.data.attachments = [{ path }];
        callback();
      });
      let blocked: unknown;
      const observed: Nodemailer.NodemailerClient = {
        sendMail: async (payload) => {
          try {
            return await client.sendMail(payload);
          } catch (error) {
            blocked = error;
            throw error;
          }
        },
      };
      yield* Effect.gen(function* () {
        const email = yield* Email;
        const result = yield* email.send(message).pipe(Effect.result);
        assert.isTrue(Result.isFailure(result));
        if (Result.isFailure(result)) {
          assert.strictEqual(result.failure.providerCode, "ESTREAM");
          assert.notInclude(JSON.stringify(result.failure), path);
        }
        // The SMTP layer wraps the access-denial code as ESTREAM. Verify the original denial too.
        assert.include(String(blocked), denial);
        assert.lengthOf(fixture.messages, 0);
      }).pipe(Effect.provide(Nodemailer.layerClient(observed)));
    }),
  );

  it.effect(
    "rejects unsafe borrowed retry policy, invalid configuration and idempotency before submission",
    () =>
      Effect.gen(function* () {
        const fixture = yield* smtpServer();
        const client = yield* Effect.acquireRelease(
          Effect.sync(() => createTransport({ host: "127.0.0.1", port: fixture.port, pool: true })),
          (resource) => Effect.sync(() => resource.close()),
        );
        const unsafe = yield* Layer.build(Nodemailer.layerClient(client)).pipe(Effect.result);
        assert.isTrue(Result.isFailure(unsafe));
        if (Result.isFailure(unsafe)) assert.strictEqual(unsafe.failure.field, "retries");
        const invalid = yield* Layer.build(
          Nodemailer.layer({
            transport: { host: "127.0.0.1", port: fixture.port },
            timeout: Duration.infinity,
          }),
        ).pipe(Effect.result);
        assert.isTrue(Result.isFailure(invalid));
        const missing = yield* Layer.build(Nodemailer.layerConfig()).pipe(
          Effect.result,
          Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromUnknown({})),
        );
        assert.isTrue(Result.isFailure(missing));
        yield* Effect.gen(function* () {
          const email = yield* Email;
          const result = yield* email
            .send(message, { idempotencyKey: "unsupported" })
            .pipe(Effect.result);
          assert.isTrue(Result.isFailure(result));
          if (Result.isFailure(result)) {
            assert.strictEqual(result.failure.reason._tag, "UnsupportedFeatureError");
            assert.strictEqual(result.failure.acceptance, "notSubmitted");
          }
        }).pipe(
          Effect.provide(
            Nodemailer.layer({ transport: { host: "127.0.0.1", port: fixture.port } }),
          ),
        );
        assert.lengthOf(fixture.messages, 0);
        assert.strictEqual(fixture.server.connections.size, 0);
      }),
  );

  it.effect("uses a native greeting deadline to establish non-submission", () =>
    Effect.gen(function* () {
      const fixture = yield* smtpServer({ onConnect: () => undefined });
      yield* Effect.gen(function* () {
        const email = yield* Email;
        const result = yield* email.send(message).pipe(Effect.result);
        assert.isTrue(Result.isFailure(result));
        if (Result.isFailure(result)) {
          assert.strictEqual(result.failure.reason._tag, "TimeoutError");
          assert.strictEqual(result.failure.acceptance, "notSubmitted");
        }
      }).pipe(
        Effect.provide(
          Nodemailer.layer({
            transport: {
              host: "127.0.0.1",
              port: fixture.port,
              greetingTimeout: Duration.millis(30),
            },
          }),
        ),
      );
    }),
  );
});
