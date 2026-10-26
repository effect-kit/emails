import { assert, describe, it } from "@effect/vitest";
import { Effect, Redacted, Result } from "effect";

import { Email } from "@effect-kit/emails";
import * as Postmark from "@effect-kit/emails/postmark";
import { afterEach, vi } from "vitest";

import { repeatedSubmission } from "#/test/fixtures/conformance/email-contract.js";
import { message } from "#/test/fixtures/email.js";

afterEach(() => vi.restoreAllMocks());
const live = () =>
  Postmark.layer({ serverToken: Redacted.make("offline-token"), messageStream: "transactional" });

describe("Postmark SDK", () => {
  it.effect("preserves PascalCase content, stream and binary CID without retries", () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        async () => new Response(JSON.stringify({ ErrorCode: 0, MessageID: "postmark-id" })),
      );
    return Effect.gen(function* () {
      const email = yield* Email;
      yield* repeatedSubmission(
        email.send({
          ...message,
          bcc: "private@example.com",
          headers: { "X-Workflow": "welcome" },
          attachments: [
            {
              filename: "logo.bin",
              contentType: "application/octet-stream",
              content: new Uint8Array([0, 255, 128]),
              contentId: "logo",
            },
          ],
        }),
        Effect.sync(() => fetch.mock.calls.length),
      );
      const payload = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
      assert.strictEqual(payload.MessageStream, "transactional");
      assert.strictEqual(payload.TextBody, message.text);
      assert.strictEqual(payload.Bcc, "private@example.com");
      assert.deepStrictEqual(payload.Attachments, [
        {
          Name: "logo.bin",
          Content: "AP+A",
          ContentType: "application/octet-stream",
          ContentID: "cid:logo",
        },
      ]);
    }).pipe(Effect.provide(live()));
  });

  it.effect.each([
    [422, 406, "MessageRejectedError"],
    [422, 401, "InvalidMessageError"],
    [401, 10, "AuthenticationError"],
    [429, 429, "RateLimitedError"],
    [503, 0, "ProviderUnavailableError"],
  ] as const)("maps HTTP %s and separate provider code %s safely", ([status, code, tag]) => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(JSON.stringify({ ErrorCode: code, Message: "private@example.com" }), {
          status,
        }),
    );
    return Effect.gen(function* () {
      const email = yield* Email;
      const result = yield* email.send(message).pipe(Effect.result);
      assert.isTrue(Result.isFailure(result));
      if (Result.isFailure(result)) {
        assert.strictEqual(result.failure.reason._tag, tag);
        assert.strictEqual(result.failure.providerCode, String(code));
        assert.notInclude(JSON.stringify(result.failure), "private@example.com");
      }
      assert.strictEqual(fetch.mock.calls.length, 1);
    }).pipe(Effect.provide(live()));
  });
});
