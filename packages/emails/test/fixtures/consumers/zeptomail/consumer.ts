import { Effect } from "effect";

import { Email } from "@effect-kit/emails";
import * as ZeptoMail from "@effect-kit/emails/zeptomail";
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
      ZeptoMail.layerClient({
        sendMail: async () => ({ data: [{ code: "EM_104" }], request_id: "offline-request" }),
      }),
    ),
  ),
);
if (receipt.requestId !== "offline-request") throw new Error("Packed ZeptoMail adapter failed");
