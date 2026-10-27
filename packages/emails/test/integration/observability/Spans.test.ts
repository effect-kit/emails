import { assert, describe, it } from "@effect/vitest";
import { Cause, Deferred, Effect, Exit, Fiber, Result } from "effect";

import { Email, EmailError, ProviderUnavailableError } from "@effect-kit/emails";
import { EmailTest } from "@effect-kit/emails/testing";

import { capabilities, makeCustomEmail, message } from "#/test/fixtures/email.js";
import { captureSpans, serializeSpan } from "#/test/fixtures/observability/Spans.js";

describe("Email.send telemetry", () => {
  it.effect(
    "records safe outcomes, acceptance evidence and counts with one span per invocation",
    () =>
      Effect.gen(function* () {
        const { spans, tracer } = captureSpans();
        const privateInput = {
          ...message,
          to: "private-to@example.com",
          bcc: "private-bcc@example.com",
          subject: "private-subject",
          html: "<p>private-html</p>",
          text: "private-text",
          attachments: [
            {
              filename: "private-filename.bin",
              contentType: "application/octet-stream",
              content: new Uint8Array([0, 255, 128]),
            },
          ],
        };
        const failure = new EmailError({
          provider: "test",
          operation: "send",
          acceptance: "unknown",
          reason: new ProviderUnavailableError(),
        });
        yield* Effect.gen(function* () {
          const email = yield* Email;
          yield* email.send(privateInput, { idempotencyKey: "private-key" });
          yield* email.send(privateInput);
          yield* email.send(privateInput).pipe(Effect.result);
          yield* email.send({ ...privateInput, to: [] }).pipe(Effect.result);
          yield* email
            .send({ ...privateInput, headers: { "X-Private-Customer": "private-header" } })
            .pipe(Effect.result);
        }).pipe(
          Effect.provide(
            EmailTest.layer({
              capabilities: { ...capabilities, headers: false, idempotency: { mode: "replay" } },
              responses: [
                Effect.succeed({ provider: "test", status: "accepted", references: [] }),
                Effect.succeed({
                  provider: "test",
                  status: "partiallyAccepted",
                  references: [],
                  recipients: [
                    { role: "to", index: 0, status: "accepted" },
                    { role: "bcc", index: 0, status: "rejected" },
                  ],
                }),
                Effect.fail(failure),
              ],
            }),
          ),
          Effect.withTracer(tracer),
        );

        const sends = spans.filter((span) => span.name === "Email.send");
        assert.lengthOf(sends, 5);
        assert.deepStrictEqual(
          sends.map((span) => span.attributes.get("email.outcome")),
          ["accepted", "partiallyAccepted", "failed", "failed", "failed"],
        );
        assert.strictEqual(sends[0]?.attributes.get("email.recipient_count"), 2);
        assert.strictEqual(sends[0]?.attributes.get("email.attachment_count"), 1);
        assert.strictEqual(sends[2]?.attributes.get("email.acceptance"), "unknown");
        assert.strictEqual(sends[3]?.attributes.get("email.reason"), "InvalidMessageError");
        assert.strictEqual(sends[4]?.attributes.get("email.reason"), "UnsupportedFeatureError");
        assert.strictEqual(sends[4]?.attributes.get("email.acceptance"), "notSubmitted");
        for (const span of sends) {
          assert.strictEqual(span.attributes.get("email.provider"), "test");
          assert.strictEqual(span.attributes.get("email.operation"), "send");
          assert.notInclude(serializeSpan(span), "private-");
        }
      }),
  );

  it.effect("labels defects without replacing their Cause or copying them into attributes", () =>
    Effect.gen(function* () {
      const { spans, tracer } = captureSpans();
      const defect = new Error("private-programmer-defect");
      const email = makeCustomEmail({ send: () => Effect.die(defect) });
      const exit = yield* email.send(message).pipe(Effect.withTracer(tracer), Effect.exit);
      assert.isTrue(Exit.isFailure(exit));
      if (Exit.isFailure(exit)) {
        const found = Cause.findDie(exit.cause);
        assert.isTrue(Result.isSuccess(found));
        if (Result.isSuccess(found)) assert.strictEqual(found.success.defect, defect);
      }
      assert.lengthOf(spans, 1);
      assert.strictEqual(spans[0]?.attributes.get("email.outcome"), "defect");
      assert.notInclude(
        JSON.stringify([...(spans[0]?.attributes ?? [])]),
        "private-programmer-defect",
      );
    }),
  );

  it.effect(
    "labels interrupted sends and closes their span without turning them into failures",
    () =>
      Effect.gen(function* () {
        const { spans, tracer } = captureSpans();
        const started = yield* Deferred.make<void>();
        const email = makeCustomEmail({
          send: Effect.fnUntraced(function* () {
            yield* Deferred.succeed(started, undefined);
            return yield* Effect.never;
          }),
        });
        const fiber = yield* Effect.forkChild(email.send(message).pipe(Effect.withTracer(tracer)));
        yield* Deferred.await(started);
        yield* Fiber.interrupt(fiber);
        const exit = yield* Fiber.await(fiber);
        assert.isTrue(Exit.isFailure(exit));
        if (Exit.isFailure(exit)) assert.isTrue(Cause.hasInterruptsOnly(exit.cause));
        assert.lengthOf(spans, 1);
        assert.strictEqual(spans[0]?.attributes.get("email.outcome"), "interrupted");
        assert.strictEqual(spans[0]?.status._tag, "Ended");
        assert.isUndefined(spans[0]?.attributes.get("email.reason"));
      }),
  );
});
