import { assert, describe, it } from "@effect/vitest";
import { Effect, Redacted, Result } from "effect";

import { Email } from "@effect-kit/emails";
import * as Eusend from "@effect-kit/emails/eusend";
import { afterEach, vi } from "vitest";

import { message } from "#/test/fixtures/email.js";

afterEach(() => vi.restoreAllMocks());
const live = () => Eusend.layer({ apiKey: Redacted.make("eu_offline-key") });
describe("eusend SDK result envelopes", () => {
  it.effect("passes header keys and byte/CID metadata without requiring React", () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        async () => new Response(JSON.stringify({ id: "eu-id" }), { status: 201 }),
      );
    return Effect.gen(function* () {
      const email = yield* Email;
      const receipt = yield* email.send(
        {
          ...message,
          bcc: "private@example.com",
          attachments: [
            {
              filename: "logo.bin",
              contentType: "application/octet-stream",
              content: new Uint8Array([0, 255, 128]),
              contentId: "logo",
            },
          ],
        },
        { idempotencyKey: "welcome/one" },
      );
      assert.strictEqual(receipt.references[0]?.value, "eu-id");
      const [, options] = fetch.mock.calls[0] ?? [];
      const payload = JSON.parse(String(options?.body));
      assert.strictEqual(new Headers(options?.headers).get("Idempotency-Key"), "welcome/one");
      assert.strictEqual(payload.attachments[0].content, "AP+A");
      assert.strictEqual(payload.attachments[0].content_type, "application/octet-stream");
      assert.strictEqual(payload.attachments[0].content_id, "logo");
    }).pipe(Effect.provide(live()));
  });
  it.effect.each([
    [401, "UNAUTHORIZED", "AuthenticationError"],
    [403, "DOMAIN_NOT_VERIFIED", "PermissionDeniedError"],
    [429, "DAILY_LIMIT_EXCEEDED", "QuotaExceededError"],
    [400, "ALL_SUPPRESSED", "MessageRejectedError"],
    [429, "RATE_LIMITED", "RateLimitedError"],
    [409, "CONFLICT", "IdempotencyConflictError"],
  ] as const)("maps fulfilled %s/%s before status fallback", ([status, code, tag]) => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        async () => new Response(JSON.stringify({ code, error: "private-body" }), { status }),
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
  it.effect(
    "maps SDK-swallowed network errors with null headers to uncertain transport failure",
    () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("private-socket"));
      return Effect.gen(function* () {
        const email = yield* Email;
        const result = yield* email.send(message).pipe(Effect.result);
        assert.isTrue(Result.isFailure(result));
        if (Result.isFailure(result)) {
          assert.strictEqual(result.failure.reason._tag, "TransportError");
          assert.strictEqual(result.failure.acceptance, "unknown");
          assert.notInclude(JSON.stringify(result.failure), "private-socket");
        }
      }).pipe(Effect.provide(live()));
    },
  );
});
