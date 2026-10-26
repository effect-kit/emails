import { Effect } from "effect";

import { Email } from "@effect-kit/emails";
import * as Eusend from "@effect-kit/emails/eusend";
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
      Eusend.layerClient({
        emails: { send: async () => ({ data: { id: "offline-id" }, error: null, headers: null }) },
      }),
    ),
  ),
);
if (receipt.references[0]?.value !== "offline-id") throw new Error("Packed Eusend adapter failed");
