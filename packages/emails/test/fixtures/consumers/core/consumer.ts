import { Effect, Result } from "effect";

import { Email, EmailError, RateLimitedError } from "@effect-kit/emails";
import type { SendReceipt } from "@effect-kit/emails";
import { EmailTest } from "@effect-kit/emails/testing";

const message = {
  from: "hello@example.com",
  to: "ada@example.com",
  subject: "Packed consumer",
  text: "Offline only",
};

const program = Effect.gen(function* () {
  const email = yield* Email;
  const recorder = yield* EmailTest;
  const receipt: SendReceipt = yield* email.send(message);
  if (receipt.provider !== "test" || receipt.status !== "accepted") {
    throw new Error("Packed testing Layer did not provide the public Email service");
  }

  const invalid = yield* email
    .send({ ...message, to: [] })
    .pipe(
      Effect.catchReason("EmailError", "InvalidMessageError", () =>
        Effect.succeed("invalid" as const),
      ),
    );
  if (invalid !== "invalid") throw new Error("Packed input validation was bypassed");
  const captured = yield* recorder.messages;
  if (captured.length !== 1 || captured[0]?.to[0]?.email !== message.to) {
    throw new Error("Packed capture lost recipient identity or captured invalid input");
  }
}).pipe(Effect.provide(EmailTest.layer()));

await Effect.runPromise(program);

await Effect.runPromise(
  Effect.gen(function* () {
    const outcomes = yield* Email.sendMany([{ message }, { message: { ...message, to: [] } }]);
    const accepted = outcomes[0];
    const invalid = outcomes[1];
    if (
      accepted === undefined ||
      !Result.isSuccess(accepted) ||
      accepted.success.status !== "accepted" ||
      invalid === undefined ||
      !Result.isFailure(invalid) ||
      invalid.failure.reason._tag !== "InvalidMessageError"
    ) {
      throw new Error("Packed batch outcomes lost their input positions or error contract");
    }
    const invalidBatch = yield* Email.sendMany([{ message }], { concurrency: 0 }).pipe(
      Effect.catchTag("BatchError", (error) => Effect.succeed(error.reason)),
    );
    if (invalidBatch !== "InvalidOptions") throw new Error("Packed batch validation failed");
  }).pipe(Effect.provide(EmailTest.layer())),
);

const limited = new EmailError({
  provider: "test",
  operation: "send",
  acceptance: "rejected",
  reason: new RateLimitedError(),
});
const recovered = await Effect.runPromise(
  Effect.gen(function* () {
    const email = yield* Email;
    return yield* email
      .send(message)
      .pipe(
        Effect.catchReason("EmailError", "RateLimitedError", () =>
          Effect.succeed("limited" as const),
        ),
      );
  }).pipe(Effect.provide(EmailTest.layer({ responses: [Effect.fail(limited)] }))),
);
if (recovered !== "limited") throw new Error("Packed error reasons did not recover");

// A selected peer that is absent must fail normally, while core/testing stay importable.
const absentPeer = "@effect-kit/emails/resend";
try {
  await import(absentPeer);
  throw new Error("An unused provider SDK leaked into the isolated consumer");
} catch (error) {
  if (!(error instanceof Error) || !("code" in error) || error.code !== "ERR_MODULE_NOT_FOUND") {
    throw error;
  }
}
