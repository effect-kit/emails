import { Effect, Result } from "effect";

import { Email } from "@effect-kit/emails";
import type { EmailRequest } from "@effect-kit/emails";
import { EmailTest } from "@effect-kit/emails/testing";

const requests: ReadonlyArray<EmailRequest> = ["ada@example.com", "grace@example.com"].map(
  (to) => ({
    message: {
      from: "hello@example.com",
      to,
      subject: "Welcome",
      text: "Your account is ready.",
    },
    // With a supporting provider, attach the logical email's stable key here:
    // options: { idempotencyKey: persistedJobKey },
  }),
);

// Offline example; a production worker supplies its selected provider Layer instead.
export const batchExample = Effect.gen(function* () {
  const outcomes = yield* Email.sendMany(requests, { concurrency: 2 });
  return outcomes.map((outcome, index) =>
    Result.isSuccess(outcome)
      ? { index, receipt: outcome.success }
      : { index, failure: outcome.failure },
  );
}).pipe(Effect.provide(EmailTest.layer()));
