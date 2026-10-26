import { Duration, Schema } from "effect";

/** Finite, nonnegative Effect Duration; no ambiguous seconds/milliseconds number. */
export const RetryAfter = Schema.Duration.check(
  Schema.makeFilter((duration) => Duration.isFinite(duration) && !Duration.isNegative(duration)),
);

export const Idempotency = Schema.Union([
  Schema.Struct({ mode: Schema.Literal("unsupported") }),
  Schema.Struct({
    mode: Schema.Literals(["replay", "reject"]),
    retention: Schema.optionalKey(RetryAfter),
  }),
]);
export type Idempotency = typeof Idempotency.Type;

/** Features this implementation can actually honor, rather than a provider's entire API. */
export const EmailCapabilities = Schema.Struct({
  text: Schema.Boolean,
  html: Schema.Boolean,
  htmlAndText: Schema.Boolean,
  senderName: Schema.Boolean,
  cc: Schema.Boolean,
  bcc: Schema.Boolean,
  replyTo: Schema.Literals(["none", "single", "multiple"]),
  headers: Schema.Boolean,
  attachments: Schema.Boolean,
  inlineAttachments: Schema.Boolean,
  idempotency: Idempotency,
}).check(
  Schema.makeFilter(
    (capabilities) =>
      (capabilities.text || capabilities.html) &&
      (!capabilities.htmlAndText || (capabilities.text && capabilities.html)) &&
      (!capabilities.inlineAttachments || capabilities.attachments),
  ),
);
export type EmailCapabilities = typeof EmailCapabilities.Type;
