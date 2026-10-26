import { Buffer } from "node:buffer";

import { assert, describe, it } from "@effect/vitest";
import { Effect, Redacted, Result } from "effect";

import { Email } from "@effect-kit/emails";
import * as Mailgun from "@effect-kit/emails/mailgun";

import { message } from "#/test/fixtures/email.js";
import { httpServer } from "#/test/fixtures/http/server.js";

describe("Mailgun multipart SDK", () => {
  it.effect("sends real binary multipart parts to the configured domain", () =>
    Effect.gen(function* () {
      const server = yield* httpServer(() => ({ body: { id: "<mailgun-id>" } }));
      yield* Effect.gen(function* () {
        const email = yield* Email;
        const receipt = yield* email.send({
          ...message,
          html: "<p>Bienvenue</p>",
          bcc: "private@example.com",
          headers: { "X-Workflow": "welcome" },
          attachments: [
            {
              filename: "bytes.bin",
              contentType: "application/octet-stream",
              content: new Uint8Array([0, 255, 128]),
            },
          ],
        });
        assert.strictEqual(receipt.references[0]?.value, "<mailgun-id>");
      }).pipe(
        Effect.provide(
          Mailgun.layer({
            apiKey: Redacted.make("offline-key"),
            region: "eu",
            domain: "mail.example.com",
            endpoint: server.url,
          }),
        ),
      );
      const request = server.requests[0];
      assert.strictEqual(request?.path, "/v3/mail.example.com/messages");
      assert.include(request?.headers["content-type"], "multipart/form-data");
      assert.include(request?.body.toString(), 'name="bcc"');
      assert.include(request?.body.toString(), 'name="h:X-Workflow"');
      assert.include(request?.body.toString(), 'filename="bytes.bin"');
      assert.isTrue(request?.body.includes(Buffer.from([0, 255, 128])));
      assert.strictEqual(server.requests.length, 1);
    }),
  );
  it.effect.each([401, 403, 429, 503])("keeps HTTP %s failure safe and does not retry", (status) =>
    Effect.gen(function* () {
      const server = yield* httpServer(() => ({ status, body: { message: "private-body" } }));
      yield* Effect.gen(function* () {
        const email = yield* Email;
        const result = yield* email.send(message).pipe(Effect.result);
        assert.isTrue(Result.isFailure(result));
        if (Result.isFailure(result)) {
          assert.strictEqual(result.failure.statusCode, status);
          assert.notInclude(JSON.stringify(result.failure), "private-body");
        }
      }).pipe(
        Effect.provide(
          Mailgun.layer({
            apiKey: Redacted.make("offline-key"),
            region: "us",
            domain: "mail.example.com",
            endpoint: server.url,
          }),
        ),
      );
      assert.strictEqual(server.requests.length, 1);
    }),
  );
});
