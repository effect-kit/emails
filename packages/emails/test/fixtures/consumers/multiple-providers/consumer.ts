import { Effect } from "effect";

import { Email } from "@effect-kit/emails";
import * as Resend from "@effect-kit/emails/resend";
import * as SendGrid from "@effect-kit/emails/sendgrid";

const send = Effect.gen(function* () {
  const email = yield* Email;
  return yield* email.send({
    from: "hello@example.com",
    to: "ada@example.com",
    subject: "Offline",
    text: "Two providers",
  });
});
const receipts = await Effect.runPromise(
  Effect.all(
    [
      send.pipe(
        Effect.provide(
          Resend.layerClient({
            emails: {
              send: async () => ({ data: { id: "resend-id" }, error: null, headers: null }),
            },
          }),
        ),
      ),
      send.pipe(
        Effect.provide(
          SendGrid.layerClient({
            send: async () => [{ statusCode: 202, headers: { "x-message-id": "sendgrid-id" } }, {}],
          }),
        ),
      ),
    ],
    { concurrency: 2 },
  ),
);
if (
  receipts[0].provider !== "resend" ||
  receipts[0].references[0]?.value !== "resend-id" ||
  receipts[1].provider !== "sendgrid" ||
  receipts[1].references[0]?.value !== "sendgrid-id"
)
  throw new Error("Selected providers interfered with each other's service or receipt");
