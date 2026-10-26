import { Effect } from "effect";

import { Email } from "@effect-kit/emails";
import * as Plunk from "@effect-kit/emails/plunk";
const receipt = await Effect.runPromise(
  Effect.gen(function* () {
    const email = yield* Email;
    return yield* email.send({
      from: "hello@example.com",
      to: "ada@example.com",
      subject: "Offline",
      html: "<p>Packed consumer</p>",
    });
  }).pipe(
    Effect.provide(
      Plunk.layerClient({
        emails: {
          send: async () => ({
            success: true,
            data: { emails: [{ status: "queued", email: "offline-id" }] },
          }),
        },
      }),
    ),
  ),
);
if (receipt.references[0]?.value !== "offline-id") throw new Error("Packed Plunk adapter failed");
