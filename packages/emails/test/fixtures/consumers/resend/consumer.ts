import { Effect, Redacted } from "effect";

import { Email } from "@effect-kit/emails";
import * as Resend from "@effect-kit/emails/resend";

const original = globalThis.fetch;
let calls = 0;
globalThis.fetch = async () => {
  calls++;
  return new Response(JSON.stringify({ id: "offline-id" }));
};
try {
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const email = yield* Email;
      return yield* email.send({
        from: "hello@example.com",
        to: "ada@example.com",
        subject: "Offline",
        text: "Packed SDK consumer",
      });
    }).pipe(Effect.provide(Resend.layer({ apiKey: Redacted.make("offline-test-key") }))),
  );
  if (calls !== 1 || result.references[0]?.value !== "offline-id")
    throw new Error("Packed Resend adapter did not execute the SDK");
} finally {
  globalThis.fetch = original;
}
