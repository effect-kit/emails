export { EmailCapabilities, Idempotency, RetryAfter } from "./delivery/EmailCapabilities.js";
export { Email } from "./service/Email.js";
export type { EmailAdapter, EmailService } from "./service/Email.js";
export {
  AuthenticationError,
  EmailError,
  EmailErrorReason,
  EmailFeature,
  IdempotencyConflictError,
  InvalidMessageError,
  MessageRejectedError,
  PermissionDeniedError,
  ProviderError,
  ProviderUnavailableError,
  QuotaExceededError,
  RateLimitedError,
  RecipientRejectedError,
  TimeoutError,
  TransportError,
  UnexpectedResponseError,
  UnsupportedFeatureError,
} from "./errors/EmailError.js";
export {
  Address,
  Attachment,
  CustomHeaders,
  EmailAddress,
  EmailMessage,
  Mailbox,
  Recipients,
  SendOptions,
} from "./message/EmailMessage.js";
export type { NormalizedEmailMessage } from "./message/EmailMessage.js";
export {
  ProviderCode,
  ProviderName,
  RecipientOutcome,
  RecipientPosition,
  SendReceipt,
  SubmissionReference,
} from "./delivery/EmailReceipt.js";
