import { Schema } from "effect";

import { ProviderCode } from "#/delivery/EmailReceipt.js";

const transportCodes = new Set([
  "ETIMEDOUT",
  "ECONNABORTED",
  "ECONNRESET",
  "ECONNREFUSED",
  "EPIPE",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ERR_BAD_REQUEST",
  "ERR_BAD_RESPONSE",
  "ERR_NETWORK",
  "ERR_CANCELED",
]);

// Keep only codes reviewed by the implemented mappings/tests. A character/length filter alone
// still permits echoed subjects or tokens. Unknown codes remain useful typed failures without text.
const providerCodes: Readonly<Record<string, ReadonlySet<string>>> = {
  resend: new Set([
    "invalid_idempotent_request",
    "concurrent_idempotent_requests",
    "missing_api_key",
    "invalid_api_key",
    "daily_quota_exceeded",
    "monthly_quota_exceeded",
    "email_above_quota",
    "restricted_api_key",
    "invalid_permission",
    "suspended_api_key",
    "invalid_access",
    "security_error",
    "rate_limit_exceeded",
    "validation_error",
    "invalid_idempotency_key",
    "invalid_attachment",
    "invalid_from_address",
    "invalid_parameter",
    "missing_required_field",
    "missing_required_parameter",
    "service_unavailable",
    "internal_server_error",
    "application_error",
  ]),
  ses: new Set([
    "TimeoutError",
    "AbortError",
    "CredentialsProviderError",
    "TokenProviderError",
    "InvalidClientTokenId",
    "ExpiredToken",
    "UnrecognizedClientException",
    "TooManyRequestsException",
    "LimitExceededException",
    "MessageRejected",
    "BadRequestException",
    "MailFromDomainNotVerifiedException",
    "SendingPausedException",
    "AccountSuspendedException",
    "AccessDeniedException",
    "InternalServiceErrorException",
  ]),
  azure: new Set(["ServiceUnavailable", "REQUEST_SEND_ERROR"]),
  postmark: new Set(["0", "10", "401", "406", "429"]),
  brevo: new Set([
    "duplicate_parameter",
    "not_enough_credits",
    "insufficient_credits",
    "quota_exceeded",
    "permission_denied",
    "recipient_blacklisted",
    "recipient_rejected",
  ]),
  eusend: new Set([
    "UNAUTHORIZED",
    "FORBIDDEN",
    "DOMAIN_NOT_VERIFIED",
    "SENDING_SUSPENDED",
    "ACCOUNT_RESTRICTED",
    "WORKSPACE_INACTIVE",
    "SENDER_NOT_PERMITTED",
    "MONTHLY_LIMIT_EXCEEDED",
    "DAILY_LIMIT_EXCEEDED",
    "PLAN_LIMIT_EXCEEDED",
    "ALL_SUPPRESSED",
    "RECIPIENT_DOMAIN_UNDELIVERABLE",
    "RATE_LIMITED",
    "CONFLICT",
    "application_error",
    "SERVICE_PAUSED",
    "ATTACHMENT_STORAGE_ERROR",
    "INTERNAL_ERROR",
  ]),
  zeptomail: new Set(["TM_3004", "AUTHENTICATION_ERROR"]),
  "mailchimp-transactional": new Set(["Invalid_Key", "PaymentRequired"]),
};

export const diagnosticCode = (provider: string, code: unknown): string | undefined =>
  Schema.is(ProviderCode)(code) &&
  (transportCodes.has(code) || providerCodes[provider.split("/")[0] ?? ""]?.has(code))
    ? code
    : undefined;
