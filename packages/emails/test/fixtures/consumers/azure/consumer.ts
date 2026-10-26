import { Effect } from "effect";

import { Email } from "@effect-kit/emails";
import * as Provider from "@effect-kit/emails/azure";
const result = await Effect.runPromise(
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
      Provider.layerClient({
        beginSend: async () => ({
          pollUntilDone: async () => ({ id: "offline-id", status: "Succeeded" }),
          getResult: () => ({ id: "offline-id", status: "Running" }),
          stopPolling: () => undefined,
        }),
      }),
    ),
  ),
);
if (result.references[0]?.value !== "offline-id") throw new Error("Packed adapter contract failed");
