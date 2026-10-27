import { assert, describe, it } from "@effect/vitest";
import { Cause, Deferred, Effect, Exit, Fiber, Layer, Result } from "effect";

import { Email, EmailError, TransportError } from "@effect-kit/emails";
import type { SendReceipt } from "@effect-kit/emails";
import { EmailTest } from "@effect-kit/emails/testing";

import { capabilities, message } from "#/test/fixtures/email.js";

const accepted: SendReceipt = {
  provider: "test",
  status: "accepted",
  references: [{ kind: "providerMessageId", value: "known-id" }],
};

describe("batch outcomes", () => {
  it.effect(
    "continues expected failures and retains partial receipts at their original indexes",
    () => {
      const failure = new EmailError({
        provider: "test",
        operation: "send",
        acceptance: "unknown",
        reason: new TransportError(),
      });
      const partial: SendReceipt = {
        provider: "test",
        status: "partiallyAccepted",
        references: [{ kind: "providerMessageId", value: "partial-id" }],
        recipients: [
          { role: "to", index: 0, status: "accepted" },
          { role: "to", index: 1, status: "rejected" },
        ],
      };
      return Effect.gen(function* () {
        const recorder = yield* EmailTest;
        const outcomes = yield* Email.sendMany(
          [
            { message },
            { message: { ...message, to: [] } },
            { message },
            { message: { ...message, to: [message.to, "other@example.com"] } },
          ],
          { concurrency: 1 },
        );
        assert.strictEqual(outcomes.length, 4);
        assert.deepStrictEqual(outcomes[0], Result.succeed(accepted));
        const invalid = outcomes[1];
        assert.isTrue(invalid !== undefined && Result.isFailure(invalid));
        if (invalid !== undefined && Result.isFailure(invalid)) {
          assert.strictEqual(invalid.failure.reason._tag, "InvalidMessageError");
          assert.strictEqual(invalid.failure.acceptance, "notSubmitted");
        }
        const failed = outcomes[2];
        assert.isTrue(failed !== undefined && Result.isFailure(failed));
        if (failed !== undefined && Result.isFailure(failed))
          assert.strictEqual(failed.failure, failure);
        assert.deepStrictEqual(outcomes[3], Result.succeed(partial));
        assert.strictEqual((yield* recorder.messages).length, 3);
      }).pipe(
        Effect.provide(
          EmailTest.layer({
            responses: [Effect.succeed(accepted), Effect.fail(failure), Effect.succeed(partial)],
          }),
        ),
      );
    },
  );

  it.effect(
    "preserves defects after earlier acceptance and does not invent an all-failed batch",
    () =>
      Effect.gen(function* () {
        const defect = new Error("Component-independent submission bug");
        const attempts: string[] = [];
        const acknowledgements: SendReceipt[] = [];
        const live = Layer.succeed(
          Email,
          Email.make({
            provider: "test",
            capabilities,
            send: Effect.fnUntraced(function* (input) {
              attempts.push(input.subject);
              if (input.subject === "broken") return yield* Effect.die(defect);
              acknowledgements.push(accepted);
              return accepted;
            }),
          }),
        );
        const exit = yield* Email.sendMany(
          [
            { message },
            { message: { ...message, subject: "broken" } },
            { message: { ...message, subject: "queued" } },
          ],
          { concurrency: 1 },
        ).pipe(Effect.provide(live), Effect.exit);
        assert.isTrue(Exit.isFailure(exit));
        if (Exit.isFailure(exit)) {
          const die = Cause.findDie(exit.cause);
          assert.isTrue(Result.isSuccess(die));
          if (Result.isSuccess(die)) assert.strictEqual(die.success.defect, defect);
        }
        assert.deepStrictEqual(attempts, [message.subject, "broken"]);
        assert.deepStrictEqual(acknowledgements, [accepted]);
      }),
  );

  it.effect(
    "interrupts in-flight local work, skips queued entries and returns no fabricated list",
    () =>
      Effect.gen(function* () {
        const bothStarted = yield* Deferred.make<void>();
        let attempts = 0;
        let finalized = 0;
        const live = Layer.succeed(
          Email,
          Email.make({
            provider: "test",
            capabilities,
            send: Effect.fnUntraced(function* () {
              attempts++;
              if (attempts === 2) yield* Deferred.succeed(bothStarted, undefined);
              return yield* Effect.never.pipe(
                Effect.ensuring(
                  Effect.sync(() => {
                    finalized++;
                  }),
                ),
              );
            }),
          }),
        );
        const fiber = yield* Effect.forkChild(
          Email.sendMany([{ message }, { message }, { message }], { concurrency: 2 }).pipe(
            Effect.provide(live),
          ),
        );
        yield* Deferred.await(bothStarted);
        yield* Fiber.interrupt(fiber);
        const exit = yield* Fiber.await(fiber);
        assert.isTrue(Exit.isFailure(exit));
        if (Exit.isFailure(exit)) assert.isTrue(Cause.hasInterruptsOnly(exit.cause));
        assert.strictEqual(attempts, 2);
        assert.strictEqual(finalized, 2);
      }),
  );
});
