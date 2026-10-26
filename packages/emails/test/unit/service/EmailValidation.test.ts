import { assert, describe, it } from "@effect/vitest";
import { Effect, Result } from "effect";

import type {
  EmailCapabilities,
  EmailFeature,
  EmailMessage,
  SendOptions,
} from "@effect-kit/emails";

import { capabilities, makeCustomEmail, message, receipt } from "#/test/fixtures/email.js";

describe("send validation", () => {
  it.effect(
    "rejects invalid input and options without invoking the adapter or exposing rejected values",
    () =>
      Effect.gen(function* () {
        let calls = 0;
        const email = makeCustomEmail({
          send: () =>
            Effect.sync(() => {
              calls++;
              return receipt;
            }),
        });
        const invalid = [
          { ...message, to: [] },
          { ...message, to: "secret-person@example.com\n" },
          { ...message, secretToken: "do-not-expose" },
          { ...message, headers: { "X-Secret-Customer": "do-not-expose\n" } },
        ];

        for (const input of invalid) {
          const result = yield* email.send(input).pipe(Effect.result);
          assert.isTrue(Result.isFailure(result));
          if (Result.isFailure(result)) {
            assert.strictEqual(result.failure.reason._tag, "InvalidMessageError");
            assert.strictEqual(result.failure.acceptance, "notSubmitted");
            const diagnostic = JSON.stringify(result.failure);
            for (const secret of [
              "secret-person",
              "do-not-expose",
              "secretToken",
              "X-Secret-Customer",
            ]) {
              assert.notInclude(diagnostic, secret);
            }
          }
        }

        const unexpectedOptions = { idempotencyKey: "key", sendAt: "secret" };
        const options = yield* email.send(message, unexpectedOptions).pipe(Effect.result);
        assert.isTrue(Result.isFailure(options));
        assert.strictEqual(calls, 0);
      }),
  );

  const featureCases: ReadonlyArray<{
    feature: EmailFeature;
    capabilities: Partial<EmailCapabilities>;
    message: EmailMessage;
    options?: SendOptions;
  }> = [
    { feature: "text", capabilities: { text: false, htmlAndText: false }, message },
    {
      feature: "html",
      capabilities: { html: false, htmlAndText: false },
      message: { ...message, html: "<p>Hello</p>" },
    },
    {
      feature: "htmlAndText",
      capabilities: { htmlAndText: false },
      message: { ...message, html: "<p>Hello</p>" },
    },
    {
      feature: "senderName",
      capabilities: { senderName: false },
      message: { ...message, from: { email: message.from, name: "Acme" } },
    },
    {
      feature: "cc",
      capabilities: { cc: false },
      message: { ...message, cc: "other@example.com" },
    },
    {
      feature: "bcc",
      capabilities: { bcc: false },
      message: { ...message, bcc: "other@example.com" },
    },
    {
      feature: "replyTo",
      capabilities: { replyTo: "none" },
      message: { ...message, replyTo: "reply@example.com" },
    },
    {
      feature: "multipleReplyTo",
      capabilities: { replyTo: "single" },
      message: { ...message, replyTo: ["a@example.com", "b@example.com"] },
    },
    {
      feature: "headers",
      capabilities: { headers: false },
      message: { ...message, headers: { "X-Workflow": "welcome" } },
    },
    {
      feature: "attachments",
      capabilities: { attachments: false, inlineAttachments: false },
      message: {
        ...message,
        attachments: [{ filename: "a.txt", contentType: "text/plain", content: new Uint8Array() }],
      },
    },
    {
      feature: "inlineAttachments",
      capabilities: { inlineAttachments: false },
      message: {
        ...message,
        attachments: [
          {
            filename: "a.txt",
            contentType: "text/plain",
            contentId: "a",
            content: new Uint8Array(),
          },
        ],
      },
    },
    { feature: "idempotency", capabilities: {}, message, options: { idempotencyKey: "welcome-1" } },
  ];

  it.effect.each(featureCases)("rejects unsupported $feature before submission", (test) =>
    Effect.gen(function* () {
      let called = false;
      const email = makeCustomEmail({
        capabilities: { ...capabilities, ...test.capabilities },
        send: () =>
          Effect.sync(() => {
            called = true;
            return receipt;
          }),
      });

      const result = yield* email.send(test.message, test.options).pipe(Effect.result);
      assert.isTrue(Result.isFailure(result));
      if (Result.isFailure(result) && result.failure.reason._tag === "UnsupportedFeatureError") {
        assert.strictEqual(result.failure.reason.feature, test.feature);
        assert.strictEqual(result.failure.acceptance, "notSubmitted");
      } else {
        assert.fail("Expected an unsupported feature error");
      }
      assert.isFalse(called);
    }),
  );

  it("rejects invalid adapter configuration safely and snapshots valid capabilities", () => {
    assert.throws(() => makeCustomEmail({ provider: "secret\n" }), "Invalid email adapter");
    assert.throws(
      () => makeCustomEmail({ capabilities: { ...capabilities, attachments: false } }),
      "Invalid email adapter",
    );

    const mutable = { ...capabilities, cc: true };
    const email = makeCustomEmail({ capabilities: mutable });
    mutable.cc = false;
    assert.isTrue(email.capabilities.cc);
    assert.isTrue(Object.isFrozen(email.capabilities));
    assert.isTrue(Object.isFrozen(email.capabilities.idempotency));
  });
});
