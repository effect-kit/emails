import { Agent } from "node:http";

import { assert, describe, it } from "@effect/vitest";
import { Cause, Effect, Exit, Fiber, Layer, Redacted, Result } from "effect";

import { Email } from "@effect-kit/emails";
import * as Mailtrap from "@effect-kit/emails/mailtrap";
import { MailtrapClient } from "mailtrap";
import { afterEach, vi } from "vitest";

import { message } from "#/test/fixtures/email.js";

afterEach(() => vi.restoreAllMocks());

describe("Mailtrap agent ownership", () => {
  it.effect("destroys both owned agents on normal close and late acquisition failure", () =>
    Effect.gen(function* () {
      const destroy = vi.spyOn(Agent.prototype, "destroy");
      yield* Effect.scoped(
        Layer.build(Mailtrap.layer({ token: Redacted.make("offline-key"), mode: "production" })),
      );
      assert.strictEqual(destroy.mock.calls.length, 2);
      const invalid = yield* Effect.scoped(
        // @ts-expect-error Exercise failed configuration after native resource acquisition.
        Layer.build(Mailtrap.layer({ token: Redacted.make("offline-key"), mode: "invalid" })),
      ).pipe(Effect.result);
      assert.isTrue(Result.isFailure(invalid));
      if (Result.isFailure(invalid)) assert.strictEqual(invalid.failure.field, "mode");
      assert.strictEqual(destroy.mock.calls.length, 4);
      assert.strictEqual(new Set(destroy.mock.contexts).size, 4);
    }),
  );

  it.effect("destroys owned agents when an in-flight submission is interrupted", () =>
    Effect.gen(function* () {
      const started = Promise.withResolvers<void>();
      const completion = Promise.withResolvers<never>();
      const destroy = vi.spyOn(Agent.prototype, "destroy");
      const send = vi.spyOn(MailtrapClient.prototype, "send").mockImplementation(async () => {
        started.resolve();
        return completion.promise;
      });
      const fiber = yield* Effect.forkChild(
        Effect.gen(function* () {
          const email = yield* Email;
          return yield* email.send(message);
        }).pipe(
          Effect.provide(
            Mailtrap.layer({ token: Redacted.make("offline-key"), mode: "production" }),
          ),
        ),
      );
      yield* Effect.promise(() => started.promise);
      yield* Fiber.interrupt(fiber);
      const exit = yield* Fiber.await(fiber);
      assert.isTrue(Exit.isFailure(exit));
      if (Exit.isFailure(exit)) assert.isTrue(Cause.hasInterruptsOnly(exit.cause));
      assert.strictEqual(send.mock.calls.length, 1);
      assert.strictEqual(destroy.mock.calls.length, 2);
      completion.reject(new Error("offline operation closed"));
    }),
  );

  it.effect("leaves borrowed native agents open until their owner releases them", () =>
    Effect.gen(function* () {
      const destroy = vi.spyOn(Agent.prototype, "destroy");
      yield* Effect.scoped(
        Effect.gen(function* () {
          const client = yield* Effect.acquireRelease(
            Effect.sync(() => new MailtrapClient({ token: "offline-key" })),
            (native) =>
              Effect.sync(() => {
                // SDK 5.0.0 exposes no disposal method; this owner uses the same pinned transport seam.
                const transport = (
                  native as unknown as {
                    axios: { defaults: { httpAgent: Agent; httpsAgent: Agent } };
                  }
                ).axios.defaults;
                transport.httpAgent.destroy();
                transport.httpsAgent.destroy();
              }),
          );
          yield* Effect.scoped(Layer.build(Mailtrap.layerClient(client, { mode: "production" })));
          assert.strictEqual(destroy.mock.calls.length, 0);
        }),
      );
      assert.strictEqual(destroy.mock.calls.length, 2);
    }),
  );
});
