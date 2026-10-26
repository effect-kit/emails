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
