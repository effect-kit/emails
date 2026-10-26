import { Effect, Layer, Redacted } from "effect";

import { Email } from "@effect-kit/emails";
import * as SendGrid from "@effect-kit/emails/sendgrid";
await Effect.runPromise(
  Effect.scoped(Layer.build(SendGrid.layer({ apiKey: Redacted.make("SG.offline-key") }))),
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
      SendGrid.layerClient({
        send: async () => [{ statusCode: 202, headers: { "X-Message-ID": "offline-id" } }, {}],
      }),
    ),
  ),
);
if (receipt.references[0]?.value !== "offline-id")
  throw new Error("Packed SendGrid adapter failed");
