import { Effect } from "effect";

import { Email } from "@effect-kit/emails";
import type { EmailAdapter, SendReceipt } from "@effect-kit/emails";

export const message = {
  from: "Sender@example.com",
  to: "ada@example.com",
  subject: "Hello",
  text: "Welcome\nBienvenue 🌍",
};

export const capabilities = {
  text: true,
  html: true,
  htmlAndText: true,
  senderName: true,
  cc: true,
  bcc: true,
  replyTo: "multiple",
  headers: true,
  attachments: true,
  inlineAttachments: true,
  idempotency: { mode: "unsupported" },
} as const;

export const receipt: SendReceipt = { provider: "custom", status: "accepted", references: [] };

export const makeCustomEmail = (overrides: Partial<EmailAdapter> = {}) =>
  Email.make({
    provider: "custom",
    capabilities,
    send: () => Effect.succeed(receipt),
    ...overrides,
  });
