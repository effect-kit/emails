import { Duration, Result, Schema } from "effect";

import { ProviderCode, SubmissionReference } from "#/delivery/EmailReceipt.js";
import type { SendReceipt } from "#/delivery/EmailReceipt.js";
import {
  AuthenticationError,
  EmailError,
  IdempotencyConflictError,
  InvalidMessageError,
  PermissionDeniedError,
  ProviderError,
  ProviderUnavailableError,
  QuotaExceededError,
  RateLimitedError,
  TimeoutError,
  TransportError,
  UnexpectedResponseError,
} from "#/errors/EmailError.js";
import { diagnosticCode } from "#/providers/internal/DiagnosticCodes.js";

const Envelope = Schema.Struct({
  data: Schema.Unknown,
  error: Schema.Unknown,
  headers: Schema.NullOr(Schema.Record(Schema.String, Schema.String)),
});
const Failure = Schema.Struct({
  name: ProviderCode,
  statusCode: Schema.optionalKey(
    Schema.NullOr(Schema.Int.check(Schema.isBetween({ minimum: 100, maximum: 599 }))),
  ),
});
const Success = Schema.Struct({ id: SubmissionReference.fields.value });
const Seconds = Schema.NumberFromString.check(Schema.isFinite(), Schema.isGreaterThanOrEqualTo(0));

export const unexpectedResponse = () =>
  new EmailError({
    provider: "resend",
    operation: "send",
    acceptance: "unknown",
    reason: new UnexpectedResponseError(),
  });

export const timeoutError = () =>
  new EmailError({
    provider: "resend",
    operation: "send",
    acceptance: "unknown",
    reason: new TimeoutError(),
  });

/** Mapping bugs remain defects; only recognizable Promise transport failures cross this boundary. */
export const transportError = (cause: unknown): EmailError => {
  if (cause instanceof TypeError || cause instanceof DOMException) {
    return new EmailError({
      provider: "resend",
      operation: "send",
      acceptance: "unknown",
      reason:
        cause instanceof DOMException && cause.name === "TimeoutError"
          ? new TimeoutError()
          : new TransportError(),
    });
  }
  throw cause;
};

export const fromResendResponse = (response: unknown): Result.Result<SendReceipt, EmailError> => {
  const envelope = Schema.decodeUnknownResult(Envelope)(response);
  if (Result.isFailure(envelope)) return Result.fail(unexpectedResponse());
  const { data, error, headers } = envelope.success;
  const requestId = Schema.decodeUnknownResult(SubmissionReference.fields.value)(
    headers?.["x-request-id"],
  );
  const correlation = Result.isSuccess(requestId) ? { requestId: requestId.success } : {};

  if (error === null) {
    const success = Schema.decodeUnknownResult(Success)(data);
    if (Result.isFailure(success)) return Result.fail(unexpectedResponse());
    return Result.succeed({
      provider: "resend",
      status: "accepted",
      ...correlation,
      references: [{ kind: "providerMessageId", value: success.success.id }],
    });
  }
  if (data !== null) return Result.fail(unexpectedResponse());
  const failure = Schema.decodeUnknownResult(Failure)(error);
  if (Result.isFailure(failure)) return Result.fail(unexpectedResponse());
  const { name, statusCode } = failure.success;
  const seconds = Schema.decodeUnknownResult(Seconds)(headers?.["retry-after"]);
  const retryAfter = Result.isSuccess(seconds)
    ? { retryAfter: Duration.seconds(seconds.success) }
    : {};
  let acceptance: EmailError["acceptance"] = "rejected";
  let reason: EmailError["reason"];
  if ((statusCode ?? 0) >= 500) {
    reason = new ProviderUnavailableError(retryAfter);
    acceptance = "unknown";
  } else if (name === "invalid_idempotent_request" || name === "concurrent_idempotent_requests") {
    reason = new IdempotencyConflictError();
    acceptance = "unknown";
  } else if (statusCode === 401 || name === "missing_api_key" || name === "invalid_api_key") {
    reason = new AuthenticationError();
  } else if (
    ["daily_quota_exceeded", "monthly_quota_exceeded", "email_above_quota"].includes(name)
  ) {
    reason = new QuotaExceededError(retryAfter);
  } else if (
    statusCode === 403 ||
    [
      "restricted_api_key",
      "invalid_permission",
      "suspended_api_key",
      "invalid_access",
      "security_error",
    ].includes(name)
  ) {
    reason = new PermissionDeniedError();
  } else if (name === "rate_limit_exceeded" || statusCode === 429) {
    reason = new RateLimitedError(retryAfter);
  } else if (
    [
      "validation_error",
      "invalid_idempotency_key",
      "invalid_attachment",
      "invalid_from_address",
      "invalid_parameter",
      "missing_required_field",
      "missing_required_parameter",
    ].includes(name)
  ) {
    reason = new InvalidMessageError({ paths: [] });
  } else if (
    (statusCode ?? 0) >= 500 ||
    ["service_unavailable", "internal_server_error"].includes(name)
  ) {
    reason = new ProviderUnavailableError(retryAfter);
    acceptance = "unknown";
  } else if (name === "application_error" && (statusCode === null || statusCode === undefined)) {
    reason = new TransportError();
    acceptance = "unknown";
  } else {
    reason = new ProviderError();
    acceptance = "unknown";
  }
  const code = diagnosticCode("resend", name);
  return Result.fail(
    new EmailError({
      provider: "resend",
      operation: "send",
      acceptance,
      reason,
      ...(code === undefined ? {} : { providerCode: code }),
      ...(statusCode === null || statusCode === undefined ? {} : { statusCode }),
    }),
  );
};
