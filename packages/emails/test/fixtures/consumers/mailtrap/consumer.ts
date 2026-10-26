import { Effect } from "effect";

import { Email } from "@effect-kit/emails";
import * as Mailtrap from "@effect-kit/emails/mailtrap";
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
      Mailtrap.layerClient(
        { send: async () => ({ success: true, message_ids: ["offline-id"] }) },
        { mode: "sandbox" },
      ),
    ),
  ),
);
if (receipt.provider !== "mailtrap/sandbox") throw new Error("Packed Mailtrap adapter failed");
