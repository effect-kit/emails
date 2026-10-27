import { assert, describe, it } from "@effect/vitest";
import { Effect, Result } from "effect";

import { Email } from "@effect-kit/emails";
import { EmailTest } from "@effect-kit/emails/testing";

import { message } from "#/test/fixtures/email.js";

describe("batch validation", () => {
  it.effect("handles empty input and rejects unsafe limits before submitting", () =>
    Effect.gen(function* () {
      const recorder = yield* EmailTest;
      assert.deepStrictEqual(yield* Email.sendMany([]), []);
      for (const concurrency of [0, -1, 1.5, Number.NaN, Infinity, 1001]) {
        const invalid = yield* Email.sendMany([{ message }], { concurrency }).pipe(Effect.result);
        assert.isTrue(Result.isFailure(invalid));
        if (Result.isFailure(invalid)) assert.strictEqual(invalid.failure.reason, "InvalidOptions");
      }
      const oversized = yield* Email.sendMany(
        Array.from({ length: 1001 }, () => ({ message })),
      ).pipe(Effect.result);
      assert.isTrue(Result.isFailure(oversized));
      if (Result.isFailure(oversized))
        assert.strictEqual(oversized.failure.reason, "InvalidRequests");
      assert.strictEqual((yield* recorder.messages).length, 0);
    }).pipe(Effect.provide(EmailTest.layer())),
  );

  it.effect(
    "rejects misspelled envelope/options fields without leaking caller keys or silently losing dedupe",
    () =>
      Effect.gen(function* () {
        const recorder = yield* EmailTest;
        // @ts-expect-error Exercise untyped callers with a misplaced send option.
        const outcomes = yield* Email.sendMany([{ message, idempotencyKey: "private-key" }]);
        const invalid = outcomes[0];
        assert.isTrue(invalid !== undefined && Result.isFailure(invalid));
        if (invalid !== undefined && Result.isFailure(invalid)) {
          assert.strictEqual(invalid.failure.reason._tag, "InvalidMessageError");
          assert.strictEqual(invalid.failure.acceptance, "notSubmitted");
          assert.notInclude(JSON.stringify(invalid.failure), "private-key");
        }
        // @ts-expect-error Extra batch options must fail rather than be silently ignored.
        const invalidOptions = yield* Email.sendMany([{ message }], { concurency: 2 }).pipe(
          Effect.result,
        );
        assert.isTrue(Result.isFailure(invalidOptions));
        if (Result.isFailure(invalidOptions))
          assert.strictEqual(invalidOptions.failure.reason, "InvalidOptions");
        assert.strictEqual((yield* recorder.messages).length, 0);
      }).pipe(Effect.provide(EmailTest.layer())),
  );
});
