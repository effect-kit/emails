import { assert, describe, it } from "@effect/vitest";
import { Effect, Redacted, Result } from "effect";

import { Email } from "@effect-kit/emails";
import * as SendGrid from "@effect-kit/emails/sendgrid";
import sendgrid from "@sendgrid/mail";
import { afterEach, vi } from "vitest";

import { message } from "#/test/fixtures/email.js";
import { httpServer } from "#/test/fixtures/http/server.js";

afterEach(() => vi.restoreAllMocks());
interface NativeClient extends SendGrid.SendGridClient {
  setApiKey(key: string): void;
  client: { setDefaultRequest(name: string, value: string): void };
}
const { MailService } = sendgrid as unknown as { MailService: new () => NativeClient };
const endpoint = (url: URL) => {
  const original = MailService.prototype.setApiKey;
  vi.spyOn(MailService.prototype, "setApiKey").mockImplementation(function (
    this: NativeClient,
    key,
  ) {
    original.call(this, key);
    this.client.setDefaultRequest("baseUrl", url.href);
  });
};

describe("SendGrid SDK", () => {
  it.effect(
    "isolates owned credentials and emits one shared-recipient message with valid empty 202",
    () =>
      Effect.gen(function* () {
        const server = yield* httpServer(() => ({
          status: 202,
          headers: { "X-Message-ID": "sg-id" },
        }));
        endpoint(server.url);
        // oxlint-disable-next-line consistent-function-scoping -- Keep the concurrent submission scenario together.
        const send = (key: string) =>
          Effect.gen(function* () {
            const email = yield* Email;
            return yield* email.send({
              ...message,
              cc: "copy@example.com",
              bcc: "private@example.com",
              attachments: [
                {
                  filename: "logo.bin",
                  contentType: "application/octet-stream",
                  content: new Uint8Array([0, 255, 128]),
                  contentId: "logo",
                },
              ],
            });
          }).pipe(Effect.provide(SendGrid.layer({ apiKey: Redacted.make(key) })));
        const receipts = yield* Effect.all([send("SG.offline-one"), send("SG.offline-two")], {
          concurrency: "unbounded",
        });
        assert.deepStrictEqual(
          server.requests.map((request) => request.headers.authorization).toSorted(),
          ["Bearer SG.offline-one", "Bearer SG.offline-two"],
        );
        assert.isTrue(receipts.every((receipt) => receipt.references[0]?.value === "sg-id"));
        const payload = JSON.parse(server.requests[0]?.body.toString() ?? "{}");
        assert.strictEqual(payload.personalizations.length, 1);
        assert.deepStrictEqual(payload.personalizations[0].bcc, [{ email: "private@example.com" }]);
        assert.strictEqual(payload.attachments[0].content, "AP+A");
        assert.strictEqual(payload.attachments[0].content_id, "logo");
        assert.strictEqual(payload.content[0].value, message.text);
      }),
  );

  it.effect.each([401, 403, 429, 503])("sanitizes HTTP %s and submits once", (status) =>
    Effect.gen(function* () {
      const server = yield* httpServer(() => ({
        status,
        body: { errors: [{ message: "private-body" }] },
      }));
      endpoint(server.url);
      yield* Effect.gen(function* () {
        const email = yield* Email;
        const result = yield* email.send(message).pipe(Effect.result);
        assert.isTrue(Result.isFailure(result));
        if (Result.isFailure(result)) {
          assert.strictEqual(result.failure.statusCode, status);
          assert.notInclude(JSON.stringify(result.failure), "private-body");
        }
      }).pipe(Effect.provide(SendGrid.layer({ apiKey: Redacted.make("SG.offline-key") })));
      assert.strictEqual(server.requests.length, 1);
    }),
  );
});
