import { Effect } from "effect";

import { Email } from "@effect-kit/emails";
import * as Lettermint from "@effect-kit/emails/lettermint";
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
      Lettermint.layerClient({
        emails: { send: async () => ({ message_id: "offline-id", status: "pending" }) },
      }),
    ),
  ),
);
if (receipt.references[0]?.value !== "offline-id")
  throw new Error("Packed Lettermint adapter failed");
