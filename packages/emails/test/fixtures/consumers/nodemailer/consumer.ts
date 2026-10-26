import { Effect } from "effect";

import { Email } from "@effect-kit/emails";
import * as Nodemailer from "@effect-kit/emails/nodemailer";

// This smoke runs the real SDK with a local transport plugin; protocol cases run in integration tests.
// Dynamic loading keeps upstream Node-only declarations out of this public adapter declaration check.
const sdkName = "nodemailer";
const { createTransport } = await import(sdkName);
let calls = 0;
const client: Nodemailer.NodemailerClient & { close(): void } = createTransport({
  name: "offline-fixture",
  version: "1",
  send(
    mail: { message: { messageId(): string } },
    callback: (error: null, receipt: unknown) => void,
  ) {
    calls++;
    callback(null, {
      messageId: mail.message.messageId(),
      accepted: ["ada@example.com"],
      rejected: [],
    });
  },
});
try {
  const receipt = await Effect.runPromise(
    Effect.gen(function* () {
      const email = yield* Email;
      return yield* email.send({
        from: "hello@example.com",
        to: "ada@example.com",
        subject: "Offline",
        text: "SDK smoke",
      });
    }).pipe(Effect.provide(Nodemailer.layerClient(client))),
  );
  if (calls !== 1 || receipt.references[0]?.kind !== "smtpMessageId")
    throw new Error("Packed Nodemailer adapter did not run SDK composition");
  // Acquiring the owned SMTP factory must remain cold; this never opens a connection.
  await Effect.runPromise(
    Effect.void.pipe(
      Effect.provide(Nodemailer.layer({ transport: { host: "127.0.0.1", port: 1 } })),
    ),
  );
} finally {
  client.close();
}
