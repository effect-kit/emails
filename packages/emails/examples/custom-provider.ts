import { Context, Effect, Layer } from "effect";

import { Email } from "@effect-kit/emails";
import type { EmailAdapter, EmailCapabilities } from "@effect-kit/emails";

export const textCapabilities = {
  text: true,
  html: false,
  htmlAndText: false,
  senderName: false,
  cc: false,
  bcc: false,
  replyTo: "none",
  headers: false,
  attachments: false,
  inlineAttachments: false,
  idempotency: { mode: "unsupported" },
} as const satisfies EmailCapabilities;

/** Offline acknowledgment only: this example does not deliver an email. */
export const offlineLayer = Layer.succeed(
  Email,
  Email.make({
    provider: "example",
    capabilities: textCapabilities,
    send: () => Effect.succeed({ provider: "example", status: "accepted", references: [] }),
  }),
);

/** Applications supply this client; it may wrap their existing transport or SDK. */
export class CompanyMailClient extends Context.Service<
  CompanyMailClient,
  {
    readonly submit: EmailAdapter["send"];
  }
>()("example/CompanyMailClient") {}

export const companyLayer = Layer.effect(
  Email,
  Effect.gen(function* () {
    const client = yield* CompanyMailClient;
    return Email.make({
      provider: "company",
      capabilities: textCapabilities,
      send: (message, options) => client.submit(message, options),
    });
  }),
);

export const sendWelcome = Effect.gen(function* () {
  const email = yield* Email;
  return yield* email.send({
    from: "hello@example.com",
    to: "ada@example.com",
    subject: "Welcome",
    text: "Your account is ready.",
  });
});
