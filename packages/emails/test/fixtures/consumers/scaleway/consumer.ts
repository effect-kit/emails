import { Effect } from "effect";

import { Email } from "@effect-kit/emails";
import * as Scaleway from "@effect-kit/emails/scaleway";
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
      Scaleway.layerClient(
        { createEmail: async () => ({ emails: [{ id: "offline-id" }] }) },
        { projectId: "00000000-0000-4000-8000-000000000001", region: "fr-par" },
      ),
    ),
  ),
);
if (receipt.references[0]?.value !== "offline-id")
  throw new Error("Packed Scaleway adapter failed");
