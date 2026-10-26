import { Effect, Redacted } from "effect";

import { Email } from "@effect-kit/emails";
import * as MailerSend from "@effect-kit/emails/mailersend";
const original = globalThis.fetch;
globalThis.fetch = async () =>
  new Response("", { status: 202, headers: { "x-message-id": "offline-id" } });
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
    }).pipe(Effect.provide(MailerSend.layer({ apiKey: Redacted.make("offline-key") }))),
  );
  if (receipt.references[0]?.value !== "offline-id")
    throw new Error("Packed MailerSend SDK failed");
} finally {
  globalThis.fetch = original;
}
