import { Base64 } from "effect/encoding";

import type { Mailbox, NormalizedEmailMessage } from "../../message/EmailMessage.js";

export interface NodemailerMessage {
  from: { name: string; address: string };
  to: Array<{ name: string; address: string }>;
  cc: Array<{ name: string; address: string }>;
  bcc: Array<{ name: string; address: string }>;
  replyTo: Array<{ name: string; address: string }>;
  envelope: { from: string; to: string[] };
  subject: string;
  text: string | undefined;
  html: string | undefined;
  headers: Record<string, string>;
  attachments: Array<{
    filename: string;
    content: string;
    encoding: "base64";
    contentType: string;
    cid?: string;
  }>;
  disableFileAccess: true;
  disableUrlAccess: true;
  keepBcc: false;
  raw: undefined;
  alternatives: [];
  amp: undefined;
  watchHtml: undefined;
  icalEvent: undefined;
}

const mailbox = ({ email, name }: Mailbox) => ({ name: name ?? "", address: email });

export const toNodemailerMessage = (message: NormalizedEmailMessage): NodemailerMessage => ({
  from: mailbox(message.from),
  to: message.to.map(mailbox),
  cc: message.cc?.map(mailbox) ?? [],
  bcc: message.bcc?.map(mailbox) ?? [],
  replyTo: message.replyTo?.map(mailbox) ?? [],
  envelope: {
    from: message.from.email,
    to: [...message.to, ...(message.cc ?? []), ...(message.bcc ?? [])].map(({ email }) => email),
  },
  subject: message.subject,
  text: message.text,
  html: message.html,
  headers: { ...message.headers },
  attachments:
    message.attachments?.map((attachment) => ({
      filename: attachment.filename,
      content: Base64.encode(attachment.content),
      encoding: "base64" as const,
      contentType: attachment.contentType,
      ...(attachment.contentId === undefined ? {} : { cid: attachment.contentId }),
    })) ?? [],
  disableFileAccess: true,
  disableUrlAccess: true,
  keepBcc: false,
  // Block content defaults from supplying raw MIME or additional file/URL-bearing alternatives.
  raw: undefined,
  alternatives: [],
  amp: undefined,
  watchHtml: undefined,
  icalEvent: undefined,
});
