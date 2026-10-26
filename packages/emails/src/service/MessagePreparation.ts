import { Array, Schema, SchemaIssue } from "effect";

import type { EmailCapabilities } from "../delivery/EmailCapabilities.js";
import { MessageField } from "../errors/EmailError.js";
import type { EmailFeature, InvalidMessageError } from "../errors/EmailError.js";
import type {
  Address,
  EmailMessage,
  Mailbox,
  NormalizedEmailMessage,
  Recipients,
  SendOptions,
} from "../message/EmailMessage.js";

const formatIssues = SchemaIssue.makeFormatterStandardSchemaV1({
  leafHook: () => "Invalid field",
  checkHook: () => "Invalid field",
});

/** Keep schema ASTs, rejected values and caller-controlled record keys out of public errors. */
export const invalidPaths = (error: Schema.SchemaError): InvalidMessageError["paths"] =>
  formatIssues(error.issue)
    .issues.slice(0, 16)
    .map(({ path }) =>
      (path ?? [])
        .slice(0, 8)
        .map((segment) =>
          typeof segment === "number" ? segment : Schema.is(MessageField)(segment) ? segment : "*",
        ),
    );

const mailbox = (address: Address): Mailbox =>
  typeof address === "string" ? { email: address } : { ...address };
const recipients = (addresses: Recipients): ReadonlyArray<Mailbox> =>
  Array.ensure<Address>(addresses).map(mailbox);

export const snapshotMessage = (message: EmailMessage): NormalizedEmailMessage => {
  const { from, to, cc, bcc, replyTo, headers, attachments, ...content } = message;

  return {
    ...content,
    from: mailbox(from),
    to: recipients(to),
    ...(cc === undefined ? {} : { cc: recipients(cc) }),
    ...(bcc === undefined ? {} : { bcc: recipients(bcc) }),
    ...(replyTo === undefined ? {} : { replyTo: recipients(replyTo) }),
    ...(headers === undefined ? {} : { headers: { ...headers } }),
    ...(attachments === undefined
      ? {}
      : {
          // oxlint-disable-next-line oxc/no-map-spread -- Snapshot attachment metadata/bytes without mutating caller inputs.
          attachments: attachments.map((attachment) => ({
            ...attachment,
            content: new Uint8Array(attachment.content),
          })),
        }),
  };
};

export const unsupportedFeature = (
  message: NormalizedEmailMessage,
  options: SendOptions,
  capabilities: EmailCapabilities,
): EmailFeature | undefined => {
  if (message.text !== undefined && !capabilities.text) return "text";
  if (message.html !== undefined && !capabilities.html) return "html";
  if (message.text !== undefined && message.html !== undefined && !capabilities.htmlAndText)
    return "htmlAndText";
  if (message.from.name !== undefined && !capabilities.senderName) return "senderName";
  if (message.cc !== undefined && !capabilities.cc) return "cc";
  if (message.bcc !== undefined && !capabilities.bcc) return "bcc";
  if (message.replyTo !== undefined && capabilities.replyTo === "none") return "replyTo";
  if ((message.replyTo?.length ?? 0) > 1 && capabilities.replyTo === "single")
    return "multipleReplyTo";
  if (Object.keys(message.headers ?? {}).length > 0 && !capabilities.headers) return "headers";
  if ((message.attachments?.length ?? 0) > 0 && !capabilities.attachments) return "attachments";
  if (
    message.attachments?.some((attachment) => attachment.contentId !== undefined) &&
    !capabilities.inlineAttachments
  )
    return "inlineAttachments";
  if (options.idempotencyKey !== undefined && capabilities.idempotency.mode === "unsupported")
    return "idempotency";
  return undefined;
};
