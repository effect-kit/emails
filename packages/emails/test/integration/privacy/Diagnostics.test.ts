import { inspect } from "node:util";

import { assert, describe, it } from "@effect/vitest";
import { Effect, Result, Schema } from "effect";
import type { Layer } from "effect";

import { Email, EmailError } from "@effect-kit/emails";
import * as Mailchimp from "@effect-kit/emails/mailchimp-transactional";
import * as Mailgun from "@effect-kit/emails/mailgun";
import * as Nodemailer from "@effect-kit/emails/nodemailer";
import * as Resend from "@effect-kit/emails/resend";

import { message } from "#/test/fixtures/email.js";
import { captureSpans, serializeSpan } from "#/test/fixtures/observability/Spans.js";

const privateCode = "sk_private_token_0123456789";
const privateBody = "private-subject-and-body";
const rawFailure = {
  code: privateCode,
  status: 503,
  message: privateBody,
  config: { headers: { Authorization: privateCode }, data: privateBody },
};
const cases: ReadonlyArray<{
  name: string;
  layer: Layer.Layer<Email, unknown>;
  reason: EmailError["reason"]["_tag"];
}> = [
  {
    name: "resolved provider error name",
    layer: Resend.layerClient({
      emails: {
        send: async () => ({
          data: null,
          error: { name: privateCode, statusCode: 422, message: privateBody },
          headers: null,
        }),
      },
    }),
    reason: "ProviderError",
  },
  {
    name: "HTTP error code and credential-bearing config",
    layer: Mailgun.layerClient(
      { messages: { create: async () => Promise.reject(rawFailure) } },
      { domain: "mail.example.com" },
    ),
    reason: "ProviderUnavailableError",
  },
  {
    name: "unfamiliar structured SMTP code",
    layer: Nodemailer.layerClient({ sendMail: async () => Promise.reject(rawFailure) }),
    reason: "ProviderError",
  },
];

describe("safe provider diagnostics", () => {
  it.effect.each(cases)("omits private code-shaped text from $name", ({ layer, reason }) =>
    Effect.gen(function* () {
      const { spans, tracer } = captureSpans();
      const email = yield* Email;
      const result = yield* email
        .send({ ...message, subject: privateBody })
        .pipe(Effect.withTracer(tracer), Effect.result);
      assert.isTrue(Result.isFailure(result));
      if (Result.isFailure(result)) {
        assert.strictEqual(result.failure.reason._tag, reason);
        assert.isUndefined(result.failure.providerCode);
        for (const diagnostic of [
          JSON.stringify(result.failure),
          JSON.stringify(Schema.encodeSync(EmailError)(result.failure)),
          inspect(result.failure, { depth: 10 }),
          ...spans.map(serializeSpan),
        ]) {
          assert.notInclude(diagnostic, privateCode);
          assert.notInclude(diagnostic, privateBody);
        }
      }
    }).pipe(Effect.provide(layer)),
  );

  it.effect(
    "omits unfamiliar rejection codes without losing recipient positions or references",
    () =>
      Effect.gen(function* () {
        const email = yield* Email;
        const receipt = yield* email.send({ ...message, bcc: "private@example.com" });
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
          },
        ]);
        assert.notInclude(JSON.stringify(receipt), privateCode);
      }).pipe(
        Effect.provide(
          Mailchimp.layerClient({
            messages: {
              send: async () => [
                { email: message.to, status: "queued", _id: "accepted-id" },
                {
                  email: "private@example.com",
                  status: "rejected",
                  _id: "rejected-id",
                  reject_reason: privateCode,
                },
              ],
            },
          }),
        ),
      ),
  );
});
