import { Effect } from "effect";

import { Email } from "@effect-kit/emails";
import * as MailchimpTransactional from "@effect-kit/emails/mailchimp-transactional";
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
      MailchimpTransactional.layerClient({
        messages: {
          send: async () => [{ email: "ada@example.com", status: "sent", _id: "offline-id" }],
        },
      }),
    ),
  ),
);
if (receipt.references[0]?.value !== "offline-id")
  throw new Error("Packed MailchimpTransactional adapter failed");
