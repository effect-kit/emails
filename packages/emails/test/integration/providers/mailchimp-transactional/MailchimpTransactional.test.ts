// oxlint-disable no-underscore-dangle -- The native response contract names its message identifier _id.
import { assert, describe, it } from "@effect/vitest";
import { Effect, Redacted, Result } from "effect";

import { Email } from "@effect-kit/emails";
import * as MailchimpTransactional from "@effect-kit/emails/mailchimp-transactional";

import { message } from "#/test/fixtures/email.js";
import { httpServer } from "#/test/fixtures/http/server.js";

const live = (url: URL) =>
  MailchimpTransactional.layer({ apiKey: Redacted.make("offline-secret"), baseUrl: url });
describe("Mailchimp Transactional SDK", () => {
  it.effect("retains mixed per-recipient outcomes and explicit role visibility", () =>
    Effect.gen(function* () {
      const server = yield* httpServer(() => ({
        body: [
          {
            email: "private@example.com",
            status: "rejected",
            _id: "rejected-id",
            reject_reason: "hard-bounce",
          },
          { email: message.to, status: "queued", _id: "accepted-id" },
        ],
      }));
      yield* Effect.gen(function* () {
        const email = yield* Email;
        const receipt = yield* email.send({
          ...message,
          bcc: "private@example.com",
          replyTo: "reply@example.com",
          attachments: [
            {
              filename: "bytes.bin",
              contentType: "application/octet-stream",
              content: new Uint8Array([0, 255, 128]),
            },
          ],
        });
        assert.strictEqual(receipt.status, "partiallyAccepted");
        assert.deepStrictEqual(receipt.recipients, [
          {
            role: "to",
            index: 0,
            status: "accepted",
            references: [{ kind: "providerMessageId", value: "accepted-id" }],
          },
          {
            role: "bcc",
            index: 0,
            status: "rejected",
            references: [{ kind: "providerMessageId", value: "rejected-id" }],
            rejectionCode: "hard_bounce",
          },
        ]);
      }).pipe(Effect.provide(live(server.url)));
      const request = server.requests[0];
      assert.strictEqual(request?.path, "/messages/send");
      const payload = JSON.parse(request?.body.toString() ?? "{}");
      assert.strictEqual(payload.key, "offline-secret");
      assert.strictEqual(payload.message.preserve_recipients, true);
      assert.deepStrictEqual(payload.message.to, [
        { email: message.to, type: "to" },
        { email: "private@example.com", type: "bcc" },
      ]);
      assert.strictEqual(payload.message.attachments[0].content, "AP+A");
      assert.strictEqual(payload.message.headers["Reply-To"], "reply@example.com");
    }),
  );
  it.effect(
    "detects HTTP errors returned as fulfilled AxiosError values without exposing body credentials",
    () =>
      Effect.gen(function* () {
        const server = yield* httpServer(() => ({
          status: 401,
          body: { status: "error", name: "Invalid_Key", message: "offline-secret private-body" },
        }));
        yield* Effect.gen(function* () {
          const email = yield* Email;
          const result = yield* email.send(message).pipe(Effect.result);
          assert.isTrue(Result.isFailure(result));
          if (Result.isFailure(result)) {
            assert.strictEqual(result.failure.reason._tag, "AuthenticationError");
            assert.notInclude(JSON.stringify(result.failure), "offline-secret");
            assert.notInclude(JSON.stringify(result.failure), "private-body");
          }
        }).pipe(Effect.provide(live(server.url)));
        assert.strictEqual(server.requests.length, 1);
      }),
  );
  it.effect.each([
    [[{ email: message.to, status: "invalid", _id: "" }], "MessageRejectedError"],
    [[{ email: message.to, status: "delivered", _id: "unknown-id" }], "UnexpectedResponseError"],
    [
      [{ email: "foreign@example.com", status: "sent", _id: "foreign-id" }],
      "UnexpectedResponseError",
    ],
    [[], "UnexpectedResponseError"],
  ] as const)("keeps all-rejected or unassociated responses explicit: %s", ([response, tag]) =>
    Effect.gen(function* () {
      const server = yield* httpServer(() => ({ body: response }));
      yield* Effect.gen(function* () {
        const email = yield* Email;
        const result = yield* email.send(message).pipe(Effect.result);
        assert.isTrue(Result.isFailure(result));
        if (Result.isFailure(result)) assert.strictEqual(result.failure.reason._tag, tag);
      }).pipe(Effect.provide(live(server.url)));
    }),
  );
});
