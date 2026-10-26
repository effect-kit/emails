import { assert, describe, it } from "@effect/vitest";
import { Effect, Redacted, Result } from "effect";

import { Email } from "@effect-kit/emails";
import * as MailerSend from "@effect-kit/emails/mailersend";
import { afterEach, vi } from "vitest";

import { message } from "#/test/fixtures/email.js";

afterEach(() => vi.restoreAllMocks());
const live = () => MailerSend.layer({ apiKey: Redacted.make("offline-key") });

describe("MailerSend SDK", () => {
  it.effect("builds independent requests and reads empty asynchronous acceptance headers", () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        async () => new Response("", { status: 202, headers: { "X-Message-ID": "ms-id" } }),
      );
    return Effect.gen(function* () {
      const email = yield* Email;
      const receipts = yield* Effect.all(
        [
          email.send({ ...message, bcc: "private@example.com" }),
          email.send({ ...message, subject: "Other" }),
        ],
        { concurrency: "unbounded" },
      );
      assert.isTrue(receipts.every((receipt) => receipt.references[0]?.value === "ms-id"));
      const payloads = fetch.mock.calls.map(([, options]) => JSON.parse(String(options?.body)));
      assert.strictEqual(payloads[0]?.bcc[0].email, "private@example.com");
      assert.isUndefined(payloads[1]?.bcc);
      assert.strictEqual(payloads[1]?.subject, "Other");
    }).pipe(Effect.provide(live()));
  });
  it.effect.each(["SOME_SUPPRESSED", "ALL_SUPPRESSED"] as const)(
    "handles %s rather than assuming 202 success",
    (type) => {
      vi.spyOn(globalThis, "fetch").mockImplementation(
        async () =>
          new Response(
            JSON.stringify({
              warnings: [{ type, recipients: [{ email: "private@example.com" }] }],
            }),
            { status: 202, headers: type === "SOME_SUPPRESSED" ? { "x-message-id": "ms-id" } : {} },
          ),
      );
      return Effect.gen(function* () {
        const email = yield* Email;
        const result = yield* email
          .send({ ...message, bcc: "private@example.com" })
          .pipe(Effect.result);
        if (type === "ALL_SUPPRESSED") {
          assert.isTrue(Result.isFailure(result));
          if (Result.isFailure(result))
            assert.strictEqual(result.failure.reason._tag, "MessageRejectedError");
        } else {
          assert.isTrue(Result.isSuccess(result));
          if (Result.isSuccess(result)) {
            assert.strictEqual(result.success.status, "partiallyAccepted");
            assert.deepStrictEqual(result.success.recipients, [
              { role: "to", index: 0, status: "accepted" },
              { role: "bcc", index: 0, status: "rejected" },
            ]);
          }
        }
      }).pipe(Effect.provide(live()));
    },
  );
  it.effect.each([401, 422, 429, 503])(
    "maps HTTP %s without response bodies or replay",
    (status) => {
      const fetch = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(
          async () => new Response(JSON.stringify({ message: "private-body" }), { status }),
        );
      return Effect.gen(function* () {
        const email = yield* Email;
        const result = yield* email.send(message).pipe(Effect.result);
        assert.isTrue(Result.isFailure(result));
        if (Result.isFailure(result)) {
          assert.strictEqual(result.failure.statusCode, status);
          assert.notInclude(JSON.stringify(result.failure), "private-body");
        }
        assert.strictEqual(fetch.mock.calls.length, 1);
      }).pipe(Effect.provide(live()));
    },
  );
});
