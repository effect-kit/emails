import type { EmailCapabilities } from "#/delivery/EmailCapabilities.js";

export const standardCapabilities: EmailCapabilities = {
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
};
