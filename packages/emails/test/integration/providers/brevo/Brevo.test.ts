import { assert, describe, it } from "@effect/vitest";
import { Effect, Redacted, Result } from "effect";

import { Email } from "@effect-kit/emails";
import * as Brevo from "@effect-kit/emails/brevo";
import { afterEach, vi } from "vitest";

import { message } from "#/test/fixtures/email.js";

afterEach(() => vi.restoreAllMocks());
const live = () => Brevo.layer({ apiKey: Redacted.make("offline-key") });
const key = "00000000-0000-4000-8000-000000000001";
describe("Brevo SDK", () => {
  it.effect(
    "places immutable UUID keys in body headers and classifies duplicate rejection before HTTP 400",
    () => {
      const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
        fetch.mock.calls.length === 1
          ? new Response(JSON.stringify({ messageId: "brevo-id" }), {
              status: 201,
              headers: { "content-type": "application/json" },
            })
          : new Response(JSON.stringify({ code: "duplicate_parameter", message: "private-body" }), {
              status: 400,
              headers: { "content-type": "application/json" },
            }),
      );
      return Effect.gen(function* () {
        const email = yield* Email;
        const send = email.send(
          { ...message, html: "<p>Welcome</p>", bcc: "private@example.com" },
          { idempotencyKey: key },
        );
        const receipt = yield* send;
        assert.strictEqual(receipt.references[0]?.value, "brevo-id");
        const result = yield* send.pipe(Effect.result);
        assert.isTrue(Result.isFailure(result));
        if (Result.isFailure(result))
          assert.strictEqual(result.failure.reason._tag, "IdempotencyConflictError");
        const payloads = fetch.mock.calls.map(([, options]) => JSON.parse(String(options?.body)));
        assert.deepStrictEqual(payloads[0], payloads[1]);
        assert.strictEqual(payloads[0].headers.idempotencyKey, key);
        assert.strictEqual(payloads[0].textContent, message.text);
        assert.deepStrictEqual(payloads[0].bcc, [{ email: "private@example.com" }]);
        assert.strictEqual(fetch.mock.calls.length, 2);
      }).pipe(Effect.provide(live()));
    },
  );
  it.effect.each([
    [401, "unauthorized", "AuthenticationError"],
    [429, "too_many_requests", "RateLimitedError"],
    [400, "not_enough_credits", "QuotaExceededError"],
    [503, "internal_error", "ProviderUnavailableError"],
  ] as const)("maps %s/%s once", ([status, code, tag]) => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(JSON.stringify({ code, message: "private-body" }), {
          status,
          headers: { "content-type": "application/json" },
        }),
    );
    return Effect.gen(function* () {
      const email = yield* Email;
      const result = yield* email.send(message).pipe(Effect.result);
      assert.isTrue(Result.isFailure(result));
      if (Result.isFailure(result)) {
        assert.strictEqual(result.failure.reason._tag, tag);
        assert.notInclude(JSON.stringify(result.failure), "private-body");
      }
      assert.strictEqual(fetch.mock.calls.length, 1);
    }).pipe(Effect.provide(live()));
  });
});
