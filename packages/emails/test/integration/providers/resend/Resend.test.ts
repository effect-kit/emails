import { assert, describe, it } from "@effect/vitest";
import { ConfigProvider, Deferred, Duration, Effect, Fiber, Layer, Redacted, Result } from "effect";
import { TestClock } from "effect/testing";

import { Email } from "@effect-kit/emails";
import * as Resend from "@effect-kit/emails/resend";
import { Resend as ResendSdk } from "resend";
import { afterEach, vi } from "vitest";

import { repeatedSubmission } from "#/test/fixtures/conformance/email-contract.js";
import { message } from "#/test/fixtures/email.js";

afterEach(() => vi.restoreAllMocks());
const live = () => Resend.layer({ apiKey: Redacted.make("offline-test-key") });

describe("real Resend SDK transport", () => {
  it.effect(
    "preserves wire recipients, quoted names, byte attachments and explicit keys without retries",
    () => {
      const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(
        async () =>
          new Response(JSON.stringify({ id: "provider-id" }), {
            headers: { "x-request-id": "request-id" },
          }),
      );
      return Effect.gen(function* () {
        const email = yield* Email;
        const bytes = new Uint8Array([0, 255, 128]);
        const input = {
          ...message,
          from: { email: "sender@example.com", name: 'Équipe, "Acme"' },
          to: ["Ada@example.com", "Ada@example.com"],
          cc: "copy@example.com",
          bcc: "private@example.com",
          replyTo: ["reply@example.com", "other@example.com"],
          html: '<img src="cid:logo">',
          headers: { "X-Workflow": "welcome" },
          attachments: [
            {
              filename: "logo.bin",
              contentType: "application/octet-stream",
              content: bytes,
              contentId: "logo",
            },
          ],
        };
        const send = email.send(input, { idempotencyKey: "welcome/1" });
        const [receipt] = yield* repeatedSubmission(
          send,
          Effect.sync(() => fetch.mock.calls.length),
        );
        const [url, options] = fetch.mock.calls[0] ?? [];
        assert.strictEqual(url, "https://api.resend.com/emails");
        const payload = JSON.parse(String(options?.body));
        assert.strictEqual(payload.from, '"Équipe, \\"Acme\\"" <sender@example.com>');
        assert.deepStrictEqual(payload.to, ["Ada@example.com", "Ada@example.com"]);
        assert.deepStrictEqual(payload.cc, ["copy@example.com"]);
        assert.deepStrictEqual(payload.bcc, ["private@example.com"]);
        assert.deepStrictEqual(payload.reply_to, ["reply@example.com", "other@example.com"]);
        assert.deepStrictEqual(payload.attachments, [
          {
            filename: "logo.bin",
            content: "AP+A",
            content_type: "application/octet-stream",
            content_id: "logo",
          },
        ]);
        assert.strictEqual(new Headers(options?.headers).get("Idempotency-Key"), "welcome/1");
        assert.strictEqual(payload.text, message.text);
        assert.deepStrictEqual(bytes, new Uint8Array([0, 255, 128]));
        assert.deepStrictEqual(receipt.references, [
          { kind: "providerMessageId", value: "provider-id" },
        ]);
        assert.strictEqual(receipt.requestId, "request-id");
      }).pipe(Effect.provide(live()));
    },
  );

  it.effect("maps fulfilled API errors safely and suppresses owned SDK raw-error logging", () => {
    const logger = vi.spyOn(console, "error");
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          name: "validation_error",
          statusCode: 403,
          message: "private-unverified-sender",
        }),
        { status: 403 },
      ),
    );
    return Effect.gen(function* () {
      const email = yield* Email;
      const result = yield* email.send(message).pipe(Effect.result);
      assert.isTrue(Result.isFailure(result));
      if (Result.isFailure(result)) {
        assert.strictEqual(result.failure.reason._tag, "PermissionDeniedError");
        assert.notInclude(JSON.stringify(result.failure), "private-unverified-sender");
      }
      assert.strictEqual(fetch.mock.calls.length, 1);
      assert.strictEqual(logger.mock.calls.length, 0);
    }).pipe(Effect.provide(live()));
  });

  it.effect(
    "classifies SDK-swallowed network rejections as uncertain and submits only once",
    () => {
      const fetch = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValue(new TypeError("private-socket"));
      return Effect.gen(function* () {
        const email = yield* Email;
        const result = yield* email.send(message).pipe(Effect.result);
        assert.isTrue(Result.isFailure(result));
        if (Result.isFailure(result)) {
          assert.strictEqual(result.failure.reason._tag, "TransportError");
          assert.strictEqual(result.failure.acceptance, "unknown");
          assert.notInclude(JSON.stringify(result.failure), "private-socket");
        }
        assert.strictEqual(fetch.mock.calls.length, 1);
      }).pipe(Effect.provide(live()));
    },
  );

  it.effect("rejects invalid message/key options before invoking the SDK", () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    return Effect.gen(function* () {
      const email = yield* Email;
      for (const [input, options] of [
        [{ ...message, to: [] }, {}],
        [message, { idempotencyKey: "x".repeat(257) }],
      ] as const) {
        const result = yield* email.send(input, options).pipe(Effect.result);
        assert.isTrue(Result.isFailure(result));
        if (Result.isFailure(result)) assert.strictEqual(result.failure.acceptance, "notSubmitted");
      }
      assert.strictEqual(fetch.mock.calls.length, 0);
    }).pipe(Effect.provide(live()));
  });

  it.effect("passes interruption to a borrowed SDK without mutating it", () =>
    Effect.gen(function* () {
      let signal: AbortSignal | undefined;
      const nativeStarted = Promise.withResolvers<void>();
      vi.spyOn(globalThis, "fetch").mockImplementation((_url, options) => {
        signal = options?.signal ?? undefined;
        nativeStarted.resolve();
        return new Promise((_resolve, reject) =>
          signal?.addEventListener("abort", () => reject(signal?.reason), { once: true }),
        );
      });
      const client = new ResendSdk("offline-test-key");
      const logger = Reflect.get(client, "logError");
      // Caller-owned SDK logging is caller policy; suppress it on this test's instance.
      Object.defineProperty(client, "logError", { value: () => undefined });
      const configuredLogger = Reflect.get(client, "logError");
      yield* Effect.gen(function* () {
        const email = yield* Email;
        const fiber = yield* Effect.forkChild(email.send(message));
        yield* Effect.promise(() => nativeStarted.promise);
        yield* Fiber.interrupt(fiber);
        assert.isTrue(signal?.aborted);
        assert.strictEqual(Reflect.get(client, "logError"), configuredLogger);
      }).pipe(Effect.provide(Resend.layerClient(client)));
      assert.notStrictEqual(logger, configuredLogger);
    }),
  );

  it.effect("bounds a stalled borrowed operation with a typed uncertain timeout", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      const client: Resend.ResendClient = {
        emails: {
          send: () =>
            Effect.runPromise(Deferred.succeed(started, undefined)).then(
              () => new Promise(() => undefined),
            ),
        },
      };
      yield* Effect.gen(function* () {
        const email = yield* Email;
        const fiber = yield* Effect.forkChild(email.send(message).pipe(Effect.result));
        yield* Deferred.await(started);
        yield* TestClock.adjust("1 second");
        const result = yield* Fiber.join(fiber);
        assert.isTrue(Result.isFailure(result));
        if (Result.isFailure(result)) {
          assert.strictEqual(result.failure.reason._tag, "TimeoutError");
          assert.strictEqual(result.failure.acceptance, "unknown");
        }
      }).pipe(Effect.provide(Resend.layerClient(client, { timeout: Duration.seconds(1) })));
    }),
  );

  it.effect(
    "resolves Config during acquisition and fails missing credentials before any request",
    () => {
      const fetch = vi.spyOn(globalThis, "fetch");
      return Effect.gen(function* () {
        const missing = yield* Layer.build(Resend.layerConfig()).pipe(
          Effect.result,
          Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromUnknown({})),
        );
        assert.isTrue(Result.isFailure(missing));
        const invalid = yield* Layer.build(Resend.layer({ apiKey: Redacted.make("") })).pipe(
          Effect.result,
        );
        assert.isTrue(Result.isFailure(invalid));
        if (Result.isFailure(invalid))
          assert.strictEqual(invalid.failure._tag, "ResendConfigurationError");
        assert.strictEqual(fetch.mock.calls.length, 0);
      });
    },
  );
});
