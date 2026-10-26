import { assert, describe, it } from "@effect/vitest";
import { Duration, Effect, Redacted, Result } from "effect";

import { Email } from "@effect-kit/emails";
import * as Lettermint from "@effect-kit/emails/lettermint";
import { afterEach, vi } from "vitest";

import { repeatedSubmission } from "#/test/fixtures/conformance/email-contract.js";
import { message } from "#/test/fixtures/email.js";

afterEach(() => vi.restoreAllMocks());
const live = () => Lettermint.layer({ sendingToken: Redacted.make("lm_offline-token") });
describe("Lettermint direct SDK", () => {
  it.effect("preserves direct payload, qualified CID and explicit request keys", () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(JSON.stringify({ message_id: "lm-id", status: "pending" }), {
          status: 202,
          headers: { "content-type": "application/json" },
        }),
    );
    return Effect.gen(function* () {
      const email = yield* Email;
      yield* repeatedSubmission(
        email.send(
          {
            ...message,
            html: '<img src="cid:logo@example.com">',
            bcc: "private@example.com",
            attachments: [
              {
                filename: "logo.bin",
                contentType: "application/octet-stream",
                content: new Uint8Array([0, 255, 128]),
                contentId: "logo@example.com",
              },
            ],
          },
          { idempotencyKey: "welcome/one" },
        ),
        Effect.sync(() => fetch.mock.calls.length),
      );
      const [, options] = fetch.mock.calls[0] ?? [];
      const payload = JSON.parse(String(options?.body));
      assert.strictEqual(new Headers(options?.headers).get("Idempotency-Key"), "welcome/one");
      assert.strictEqual(payload.attachments[0].content, "AP+A");
      assert.strictEqual(payload.attachments[0].content_type, "application/octet-stream");
      assert.strictEqual(payload.attachments[0].content_id, "logo@example.com");
      assert.deepStrictEqual(payload.bcc, ["private@example.com"]);
    }).pipe(Effect.provide(live()));
  });
  it.effect.each([
    [401, "AuthenticationError"],
    [403, "PermissionDeniedError"],
    [409, "IdempotencyConflictError"],
    [429, "RateLimitedError"],
    [503, "ProviderUnavailableError"],
  ] as const)("maps HTTP %s safely without replay", ([status, tag]) => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(JSON.stringify({ error: { code: "SAFE_CODE", message: "private-body" } }), {
          status,
          headers: { "content-type": "application/json", "Retry-After": "2" },
        }),
    );
    return Effect.gen(function* () {
      const email = yield* Email;
      const result = yield* email.send(message).pipe(Effect.result);
      assert.isTrue(Result.isFailure(result));
      if (Result.isFailure(result)) {
        assert.strictEqual(result.failure.reason._tag, tag);
        assert.notInclude(JSON.stringify(result.failure), "private-body");
        if (result.failure.reason._tag === "RateLimitedError")
          assert.strictEqual(
            Duration.toMillis(result.failure.reason.retryAfter ?? Duration.zero),
            2000,
          );
      }
      assert.strictEqual(fetch.mock.calls.length, 1);
    }).pipe(Effect.provide(live()));
  });
});
