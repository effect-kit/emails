import { Effect, Redacted } from "effect";

import { Email } from "@effect-kit/emails";
import * as Postmark from "@effect-kit/emails/postmark";
const original = globalThis.fetch;
globalThis.fetch = async () =>
  new Response(JSON.stringify({ ErrorCode: 0, MessageID: "offline-id" }));
try {
  const receipt = await Effect.runPromise(
    Effect.gen(function* () {
      const email = yield* Email;
      return yield* email.send({
        from: "hello@example.com",
        to: "ada@example.com",
        subject: "Offline",
        text: "Packed consumer",
      });
    }).pipe(Effect.provide(Postmark.layer({ serverToken: Redacted.make("offline-token") }))),
  );
  if (receipt.references[0]?.value !== "offline-id") throw new Error("Packed Postmark SDK failed");
} finally {
  globalThis.fetch = original;
}
