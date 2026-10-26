import { assert, describe, it } from "@effect/vitest";
import { Cause, Deferred, Effect, Exit, Fiber, Result } from "effect";

import { EmailError, TransportError } from "@effect-kit/emails";
import type { NormalizedEmailMessage, SendOptions, SendReceipt } from "@effect-kit/emails";

import { capabilities, makeCustomEmail, message, receipt } from "../../fixtures/email.js";

describe("submission boundary", () => {
  it.effect("takes a fresh input snapshot on each execution", () =>
    Effect.gen(function* () {
      const subjects: string[] = [];
      const input = { ...message };
      const email = makeCustomEmail({
        send: (prepared) =>
          Effect.sync(() => {
            subjects.push(prepared.subject);
            return receipt;
          }),
      });
      const send = email.send(input);
      input.subject = "First execution";
      yield* send;
      input.subject = "Second execution";
      yield* send;

      assert.deepStrictEqual(subjects, ["First execution", "Second execution"]);
    }),
  );
  it.effect("is cold and repeats only when executed, forwarding unchanged explicit keys", () =>
    Effect.gen(function* () {
      const options: SendOptions[] = [];
      const email = makeCustomEmail({
        capabilities: { ...capabilities, idempotency: { mode: "replay" } },
        send: (_message, requested) =>
          Effect.sync(() => {
            options.push(requested);
            return receipt;
          }),
      });
      const send = email.send(message, { idempotencyKey: "welcome-1" });
      assert.lengthOf(options, 0);

      yield* send;
      yield* send;
      yield* email.send(message);
      assert.deepStrictEqual(options, [
        { idempotencyKey: "welcome-1" },
        { idempotencyKey: "welcome-1" },
        {},
      ]);
    }),
  );

  it.effect("snapshots metadata, roles and attachment bytes before asynchronous submission", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      const resume = yield* Deferred.make<void>();
      let captured: NormalizedEmailMessage | undefined;
      const email = makeCustomEmail({
        send: (input) =>
          Effect.gen(function* () {
            captured = input;
            yield* Deferred.succeed(started, undefined);
            yield* Deferred.await(resume);
            return receipt;
          }),
      });
      const to = [{ email: "Ada@example.com", name: "Ada" }];
      const bytes = new Uint8Array([0, 255]);
      const headers = { "X-Workflow": "welcome" };
      const input = {
        ...message,
        to,
        bcc: "private@example.com",
        headers,
        attachments: [
          { filename: "file.bin", contentType: "application/octet-stream", content: bytes },
        ],
      };
      const fiber = yield* Effect.forkChild(email.send(input));
      yield* Deferred.await(started);

      const firstRecipient = to[0];
      if (firstRecipient) firstRecipient.name = "Changed";
      to.push({ email: "extra@example.com", name: "Extra" });
      headers["X-Workflow"] = "changed";
      bytes[0] = 123;
      assert.deepStrictEqual(captured?.to, [{ email: "Ada@example.com", name: "Ada" }]);
      assert.deepStrictEqual(captured?.bcc, [{ email: "private@example.com" }]);
      assert.strictEqual(captured?.headers?.["X-Workflow"], "welcome");
      assert.deepStrictEqual(captured?.attachments?.[0]?.content, new Uint8Array([0, 255]));

      yield* Deferred.succeed(resume, undefined);
      yield* Fiber.join(fiber);
    }),
  );

  it.effect("keeps caller bytes intact even if an adapter changes its private copy", () =>
    Effect.gen(function* () {
      const bytes = new Uint8Array([1]);
      const email = makeCustomEmail({
        send: (input) =>
          Effect.sync(() => {
            const attachment = input.attachments?.[0];
            if (attachment) attachment.content[0] = 99;
            return receipt;
          }),
      });

      yield* email.send({
        ...message,
        attachments: [
          { filename: "a.bin", contentType: "application/octet-stream", content: bytes },
        ],
      });
      assert.strictEqual(bytes[0], 1);
    }),
  );

  it.effect("retains a partial receipt without retrying accepted recipients", () =>
    Effect.gen(function* () {
      const partial: SendReceipt = {
        ...receipt,
        status: "partiallyAccepted",
        recipients: [
          {
            role: "to",
            index: 0,
            status: "accepted",
            references: [{ kind: "providerMessageId", value: "accepted-1" }],
          },
          { role: "bcc", index: 0, status: "rejected", rejectionCode: "SUPPRESSED" },
        ],
      };
      let calls = 0;
      const email = makeCustomEmail({
        send: () =>
          Effect.sync(() => {
            calls++;
            return partial;
          }),
      });

      assert.deepStrictEqual(
        yield* email.send({ ...message, bcc: "private@example.com" }),
        partial,
      );
      assert.strictEqual(calls, 1);
    }),
  );

  it.effect("preserves typed failures and never retries an uncertain submission", () =>
    Effect.gen(function* () {
      const failure = new EmailError({
        provider: "custom",
        operation: "send",
        acceptance: "unknown",
        reason: new TransportError(),
      });
      let calls = 0;
      const email = makeCustomEmail({
        send: () =>
          Effect.sync(() => {
            calls++;
          }).pipe(Effect.andThen(Effect.fail(failure))),
      });

      const result = yield* email.send(message).pipe(Effect.result);
      assert.isTrue(Result.isFailure(result));
      if (Result.isFailure(result)) assert.strictEqual(result.failure, failure);
      assert.strictEqual(calls, 1);
    }),
  );

  it.effect.each([
    { ...receipt, provider: "another-provider" },
    { ...receipt, recipients: [{ role: "to", index: 2, status: "accepted" }] },
    { ...receipt, responseBody: "secret" },
    { ...receipt, references: [{ kind: "unexpected", value: "secret" }] },
  ])("treats invalid adapter responses as unknown outcomes", (response) =>
    Effect.gen(function* () {
      const email = makeCustomEmail({ send: () => Effect.succeed(response as SendReceipt) });
      const result = yield* email.send(message).pipe(Effect.result);
      assert.isTrue(Result.isFailure(result));
      if (Result.isFailure(result)) {
        assert.strictEqual(result.failure.reason._tag, "UnexpectedResponseError");
        assert.strictEqual(result.failure.acceptance, "unknown");
        assert.notInclude(JSON.stringify(result.failure), "secret");
      }
    }),
  );

  it.effect("preserves programmer defects instead of labeling them provider failures", () =>
    Effect.gen(function* () {
      const defect = new Error("mapper bug");
      const email = makeCustomEmail({
        send: () => {
          throw defect;
        },
      });
      const exit = yield* email.send(message).pipe(Effect.exit);
      assert.isTrue(Exit.isFailure(exit));
      if (Exit.isFailure(exit)) {
        const found = Cause.findDie(exit.cause);
        assert.isTrue(Result.isSuccess(found));
        if (Result.isSuccess(found)) assert.strictEqual(found.success.defect, defect);
      }
    }),
  );
});
