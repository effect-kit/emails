import { Effect } from "effect";

import { EmailTest } from "@effect-kit/emails/testing";

const messages = await Effect.runPromise(
  Effect.gen(function* () {
    const recorder = yield* EmailTest;
    return yield* recorder.messages;
  }).pipe(Effect.provide(EmailTest.layer())),
);
if (messages.length !== 0) throw new Error("Isolated testing Layer did not initialize");
