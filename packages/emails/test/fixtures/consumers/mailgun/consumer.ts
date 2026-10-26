import { Effect, Layer, Redacted } from "effect";

import { Email } from "@effect-kit/emails";
import * as Mailgun from "@effect-kit/emails/mailgun";
await Effect.runPromise(
  Effect.scoped(
    Layer.build(
      Mailgun.layer({
        apiKey: Redacted.make("offline-key"),
        region: "eu",
        domain: "mail.example.com",
      }),
    ),
  ),
);
const receipt = await Effect.runPromise(
  Effect.gen(function* () {
    const email = yield* Email;
    return yield* email.send({
      from: "hello@example.com",
      to: "ada@example.com",
      subject: "Offline",
      text: "Packed consumer",
    });
  }).pipe(
    Effect.provide(
      Mailgun.layerClient(
        { messages: { create: async () => ({ id: "offline-id" }) } },
        { domain: "mail.example.com" },
      ),
    ),
  ),
);
if (receipt.references[0]?.value !== "offline-id") throw new Error("Packed Mailgun adapter failed");
