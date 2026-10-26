// oxlint-disable no-control-regex -- Message metadata must reject control-character injection.
import { Schema } from "effect";

const Metadata = Schema.String.check(
  Schema.isPattern(/\S/),
  Schema.makeFilter((value) => !/[\u0000-\u001f\u007f]/.test(value)),
);

/** Bare ASCII dot-atom addresses and DNS domains; display names use Mailbox objects. */
export const EmailAddress = Metadata.check(
  Schema.isMaxLength(254),
  Schema.isPattern(
    /^(?=.{1,64}@)[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/,
  ),
);
export type EmailAddress = typeof EmailAddress.Type;

export const Mailbox = Schema.Struct({ email: EmailAddress, name: Schema.optionalKey(Metadata) });
export type Mailbox = typeof Mailbox.Type;

export const Address = Schema.Union([EmailAddress, Mailbox]);
export type Address = typeof Address.Type;

/** Dynamic arrays are accepted statically and checked for emptiness when decoded. */
export const Recipients = Schema.Union([
  Address,
  Schema.Array(Address).check(Schema.isMinLength(1)),
]);
export type Recipients = typeof Recipients.Type;

export const Attachment = Schema.Struct({
  filename: Metadata,
  content: Schema.Uint8Array,
  contentType: Metadata.check(
    Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*$/),
  ),
  contentId: Schema.optionalKey(Metadata.check(Schema.isPattern(/^[^\s<>]+$/))),
});
export type Attachment = typeof Attachment.Type;

const reservedHeaders = new Set([
  "from",
  "sender",
  "to",
  "cc",
  "bcc",
  "reply-to",
  "subject",
  "date",
  "message-id",
  "mime-version",
  "return-path",
  "received",
  "authentication-results",
  "dkim-signature",
  "authorization",
  "proxy-authorization",
  "host",
  "idempotency-key",
  "x-smtpapi",
]);

const HeaderName = Metadata.check(
  Schema.isPattern(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/),
  Schema.makeFilter((name) => {
    const lower = name.toLowerCase();
    return (
      !reservedHeaders.has(lower) &&
      !/^(?:content-|resent-|resend-|x-ses-|x-mc-|x-mailgun-|x-mailin-|x-pm-)/.test(lower)
    );
  }),
);

// A filtered record key can silently discard unmatched keys during decoding.
export const CustomHeaders = Schema.Record(
  Schema.String,
  Schema.String.check(Schema.makeFilter((value) => !/[\u0000-\u001f\u007f]/.test(value))),
).check(
  Schema.makeFilter((headers) => {
    const names = Object.keys(headers).map((name) => name.toLowerCase());
    return (
      Object.keys(headers).every(Schema.is(HeaderName)) && new Set(names).size === names.length
    );
  }),
);
export type CustomHeaders = typeof CustomHeaders.Type;

const Body = Schema.String.check(Schema.isPattern(/\S/), Schema.isPattern(/^[^\u0000]*$/));
const fields = {
  from: Address,
  to: Recipients,
  cc: Schema.optionalKey(Recipients),
  bcc: Schema.optionalKey(Recipients),
  replyTo: Schema.optionalKey(Recipients),
  subject: Metadata,
  headers: Schema.optionalKey(CustomHeaders),
  attachments: Schema.optionalKey(Schema.Array(Attachment)),
};

export const EmailMessage = Schema.Union([
  Schema.Struct({ ...fields, text: Body, html: Schema.optionalKey(Body) }),
  Schema.Struct({ ...fields, html: Body, text: Schema.optionalKey(Body) }),
]).check(
  Schema.makeFilter((message) => {
    const ids =
      message.attachments?.flatMap((attachment) =>
        attachment.contentId === undefined ? [] : [attachment.contentId],
      ) ?? [];
    return new Set(ids).size === ids.length;
  }),
);
export type EmailMessage = typeof EmailMessage.Type;

/** Adapter input: mailbox objects and recipient lists, with private copies of attachment bytes. */
type NormalizeMessage<Message extends EmailMessage> = Message extends EmailMessage
  ? Omit<Message, "from" | "to" | "cc" | "bcc" | "replyTo"> & {
      readonly from: Mailbox;
      readonly to: ReadonlyArray<Mailbox>;
      readonly cc?: ReadonlyArray<Mailbox>;
      readonly bcc?: ReadonlyArray<Mailbox>;
      readonly replyTo?: ReadonlyArray<Mailbox>;
    }
  : never;
export type NormalizedEmailMessage = NormalizeMessage<EmailMessage>;

export const SendOptions = Schema.Struct({ idempotencyKey: Schema.optionalKey(Metadata) });
export type SendOptions = typeof SendOptions.Type;
