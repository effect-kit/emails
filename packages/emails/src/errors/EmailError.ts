import { Schema } from "effect";

import { RetryAfter } from "#/delivery/EmailCapabilities.js";
import {
  ProviderCode,
  ProviderName,
  RecipientPosition,
  SubmissionReference,
} from "#/delivery/EmailReceipt.js";

export const MessageField = Schema.Literals([
  "from",
  "to",
  "cc",
  "bcc",
  "replyTo",
  "email",
  "name",
  "subject",
  "html",
  "text",
  "headers",
  "attachments",
  "filename",
  "content",
  "contentType",
  "contentId",
  "idempotencyKey",
  "*",
]);

export class InvalidMessageError extends Schema.TaggedError<InvalidMessageError>()(
  "InvalidMessageError",
  {
    paths: Schema.Array(Schema.Array(Schema.Union([MessageField, Schema.Int]))),
  },
) {}

export const EmailFeature = Schema.Literals([
  "text",
  "html",
  "htmlAndText",
  "senderName",
  "cc",
  "bcc",
  "replyTo",
  "multipleReplyTo",
  "headers",
  "attachments",
  "inlineAttachments",
  "idempotency",
]);
export type EmailFeature = typeof EmailFeature.Type;

export class UnsupportedFeatureError extends Schema.TaggedError<UnsupportedFeatureError>()(
  "UnsupportedFeatureError",
  {
    feature: EmailFeature,
  },
) {}

export class AuthenticationError extends Schema.TaggedError<AuthenticationError>()(
  "AuthenticationError",
  {},
) {}
export class PermissionDeniedError extends Schema.TaggedError<PermissionDeniedError>()(
  "PermissionDeniedError",
  {},
) {}
export class RateLimitedError extends Schema.TaggedError<RateLimitedError>()("RateLimitedError", {
  retryAfter: Schema.optionalKey(RetryAfter),
}) {}
export class QuotaExceededError extends Schema.TaggedError<QuotaExceededError>()(
  "QuotaExceededError",
  {
    retryAfter: Schema.optionalKey(RetryAfter),
  },
) {}
export class RecipientRejectedError extends Schema.TaggedError<RecipientRejectedError>()(
  "RecipientRejectedError",
  {
    recipients: Schema.Array(RecipientPosition),
  },
) {}
export class MessageRejectedError extends Schema.TaggedError<MessageRejectedError>()(
  "MessageRejectedError",
  {},
) {}
export class IdempotencyConflictError extends Schema.TaggedError<IdempotencyConflictError>()(
  "IdempotencyConflictError",
  {},
) {}
export class TransportError extends Schema.TaggedError<TransportError>()("TransportError", {}) {}
export class TimeoutError extends Schema.TaggedError<TimeoutError>()("TimeoutError", {}) {}
export class ProviderUnavailableError extends Schema.TaggedError<ProviderUnavailableError>()(
  "ProviderUnavailableError",
  {
    retryAfter: Schema.optionalKey(RetryAfter),
  },
) {}
export class UnexpectedResponseError extends Schema.TaggedError<UnexpectedResponseError>()(
  "UnexpectedResponseError",
  {},
) {}
export class ProviderError extends Schema.TaggedError<ProviderError>()("ProviderError", {}) {}

export const EmailErrorReason = Schema.Union([
  InvalidMessageError,
  UnsupportedFeatureError,
  AuthenticationError,
  PermissionDeniedError,
  RateLimitedError,
  QuotaExceededError,
  RecipientRejectedError,
  MessageRejectedError,
  IdempotencyConflictError,
  TransportError,
  TimeoutError,
  ProviderUnavailableError,
  UnexpectedResponseError,
  ProviderError,
]);
export type EmailErrorReason = typeof EmailErrorReason.Type;

export class EmailError extends Schema.TaggedError<EmailError>()("EmailError", {
  provider: ProviderName,
  operation: Schema.Literal("send"),
  acceptance: Schema.Literals(["notSubmitted", "rejected", "unknown"]),
  reason: EmailErrorReason,
  statusCode: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 100, maximum: 599 })),
  ),
  providerCode: Schema.optionalKey(ProviderCode),
  references: Schema.optionalKey(Schema.Array(SubmissionReference)),
}) {
  override get message(): string {
    return `Email submission: ${this.reason._tag}`;
  }
}
