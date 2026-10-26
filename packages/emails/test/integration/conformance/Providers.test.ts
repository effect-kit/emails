import { assert, describe, it } from "@effect/vitest";
import { Cause, Duration, Effect, Exit, Fiber, Result } from "effect";
import { TestClock } from "effect/testing";

import { Email } from "@effect-kit/emails";

import { repeatedSubmission } from "#/test/fixtures/conformance/email-contract.js";
import { providerCases } from "#/test/fixtures/conformance/providers.js";

const portableMessage = {
  from: "sender@example.com",
  to: "ada@example.com",
  subject: "Portable",
  html: "<p>Welcome</p>",
};
for (const provider of providerCases) {
  describe(`${provider.name} shared boundary`, () => {
    it.effect("runs the same public workflow cold with one attempt per execution", () => {
      let attempts = 0;
      return Effect.gen(function* () {
        const email = yield* Email;
        yield* repeatedSubmission(
          email.send(portableMessage),
          Effect.sync(() => attempts),
        );
      }).pipe(
        Effect.provide(
          provider.layer(async () => {
            attempts++;
            return provider.response;
          }, Duration.seconds(1)),
        ),
      );
    });
    it.effect("keeps malformed success uncertain and preserves unstructured defects", () => {
      const defect = Symbol("SDK programmer defect");
      let attempts = 0;
      return Effect.gen(function* () {
        const email = yield* Email;
        const result = yield* email.send(portableMessage).pipe(Effect.result);
        assert.isTrue(Result.isFailure(result));
        if (Result.isFailure(result)) {
          assert.strictEqual(result.failure.reason._tag, "UnexpectedResponseError");
          assert.strictEqual(result.failure.acceptance, "unknown");
        }
        const exit = yield* email.send(portableMessage).pipe(Effect.exit);
        assert.isTrue(Exit.isFailure(exit));
        if (Exit.isFailure(exit)) {
          const found = Cause.findDie(exit.cause);
          assert.isTrue(Result.isSuccess(found));
          if (Result.isSuccess(found)) assert.strictEqual(found.success.defect, defect);
        }
      }).pipe(
        Effect.provide(
          provider.layer(async () => {
            attempts++;
            if (attempts === 1) return {};
            throw defect;
          }, Duration.seconds(1)),
        ),
      );
    });
    it.effect("bounds waiting without resubmission and propagates supported abort signals", () => {
      let attempts = 0;
      let signal: AbortSignal | undefined;
      const started = Promise.withResolvers<void>();
      return Effect.gen(function* () {
        const email = yield* Email;
        const fiber = yield* Effect.forkChild(email.send(portableMessage).pipe(Effect.result));
        yield* Effect.promise(() => started.promise);
        yield* TestClock.adjust("1 second");
        const result = yield* Fiber.join(fiber);
        assert.isTrue(Result.isFailure(result));
        if (Result.isFailure(result)) {
          assert.strictEqual(result.failure.reason._tag, "TimeoutError");
          assert.strictEqual(result.failure.acceptance, "unknown");
        }
        assert.strictEqual(attempts, 1);
        if (provider.signal) assert.isTrue(signal?.aborted);
      }).pipe(
        Effect.provide(
          provider.layer(async (nativeSignal) => {
            attempts++;
            signal = nativeSignal;
            started.resolve();
            return new Promise(() => undefined);
          }, Duration.seconds(1)),
        ),
      );
    });
  });
}
