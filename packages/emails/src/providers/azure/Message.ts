import { Base64 } from "effect/encoding";

import type { Mailbox, NormalizedEmailMessage } from "#/message/EmailMessage.js";

const address = ({ email, name }: Mailbox) => ({
  address: email,
  ...(name === undefined ? {} : { displayName: name }),
});
const body = (message: NormalizedEmailMessage) => {
  if (message.text !== undefined)
    return {
      plainText: message.text,
      ...(message.html === undefined ? {} : { html: message.html }),
    };
  if (message.html !== undefined) return { html: message.html };
  throw new Error("Normalized message requires content");
};

export const toAzureMessage = (message: NormalizedEmailMessage) => ({
  senderAddress: message.from.email,
  content: { subject: message.subject, ...body(message) },
  recipients: {
    to: message.to.map(address),
    ...(message.cc === undefined ? {} : { cc: message.cc.map(address) }),
    ...(message.bcc === undefined ? {} : { bcc: message.bcc.map(address) }),
  },
  ...(message.replyTo === undefined ? {} : { replyTo: message.replyTo.map(address) }),
  ...(message.headers === undefined ? {} : { headers: { ...message.headers } }),
  ...(message.attachments === undefined
    ? {}
    : {
        attachments: message.attachments.map((attachment) => ({
          name: attachment.filename,
          contentType: attachment.contentType,
          contentInBase64: Base64.encode(attachment.content),
          ...(attachment.contentId === undefined ? {} : { contentId: attachment.contentId }),
        })),
      }),
});
export type AzureMessage = ReturnType<typeof toAzureMessage>;
