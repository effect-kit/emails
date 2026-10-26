import { Base64 } from "effect/encoding";

import type { Mailbox, NormalizedEmailMessage } from "../../message/EmailMessage.js";

export type ResendMessage = {
  readonly from: string;
  readonly to: string[];
  readonly subject: string;
  readonly cc?: string[];
  readonly bcc?: string[];
  readonly replyTo?: string[];
  readonly headers?: Record<string, string>;
  readonly attachments?: Array<{
    filename: string;
    content: string;
    contentType: string;
    contentId?: string;
  }>;
} & (
  | { readonly text: string; readonly html?: string }
  | { readonly html: string; readonly text?: string }
);

const mailbox = ({ email, name }: Mailbox): string =>
  name === undefined ? email : `"${name.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}" <${email}>`;

export const toResendMessage = (message: NormalizedEmailMessage): ResendMessage => {
  const { from, to, cc, bcc, replyTo, attachments, ...content } = message;
  return {
    ...content,
    from: mailbox(from),
    to: to.map(mailbox),
    ...(cc === undefined ? {} : { cc: cc.map(mailbox) }),
    ...(bcc === undefined ? {} : { bcc: bcc.map(mailbox) }),
    ...(replyTo === undefined ? {} : { replyTo: replyTo.map(mailbox) }),
    ...(attachments === undefined
      ? {}
      : {
          // oxlint-disable-next-line oxc/no-map-spread -- Build a provider request without mutating canonical metadata.
          attachments: attachments.map(({ content: bytes, ...metadata }) => ({
            ...metadata,
            content: Base64.encode(bytes),
          })),
        }),
  };
};
