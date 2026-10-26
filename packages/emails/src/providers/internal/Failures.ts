import { Result, Schema } from "effect";

import { ProviderCode } from "#/delivery/EmailReceipt.js";
import type { SubmissionReference } from "#/delivery/EmailReceipt.js";
import {
  AuthenticationError,
  EmailError,
  InvalidMessageError,
  PermissionDeniedError,
  ProviderError,
  ProviderUnavailableError,
  RateLimitedError,
  TimeoutError,
  UnexpectedResponseError,
} from "#/errors/EmailError.js";
import type { EmailErrorReason } from "#/errors/EmailError.js";

const Status = Schema.Int.check(Schema.isBetween({ minimum: 100, maximum: 599 }));
export interface FailureDetails {
  readonly status?: unknown;
  readonly code?: unknown;
  readonly reason?: EmailErrorReason;
  readonly acceptance?: EmailError["acceptance"];
  readonly references?: ReadonlyArray<SubmissionReference>;
}

/** Only allowlisted metadata crosses the SDK boundary; rejected SDK objects never become causes. */
export const providerFailure = (provider: string, details: FailureDetails = {}): EmailError => {
  const status = Schema.decodeUnknownResult(Status)(details.status);
  const code = Schema.decodeUnknownResult(ProviderCode)(details.code);
  const statusCode = Result.isSuccess(status) ? status.success : undefined;
  const reason =
    details.reason ??
    (statusCode === 401
      ? new AuthenticationError()
      : statusCode === 403
        ? new PermissionDeniedError()
        : statusCode === 429
          ? new RateLimitedError()
          : statusCode === 400 || statusCode === 422
            ? new InvalidMessageError({ paths: [] })
            : statusCode !== undefined && statusCode >= 500
              ? new ProviderUnavailableError()
              : new ProviderError());
  return new EmailError({
    provider,
    operation: "send",
    reason,
    acceptance:
      details.acceptance ??
      (statusCode !== undefined && statusCode >= 400 && statusCode < 500 && statusCode !== 409
        ? "rejected"
        : "unknown"),
    ...(statusCode === undefined ? {} : { statusCode }),
    ...(Result.isSuccess(code) ? { providerCode: code.success } : {}),
    ...(details.references === undefined ? {} : { references: details.references }),
  });
};
export const unexpectedResponse = (
  provider: string,
  references?: ReadonlyArray<SubmissionReference>,
) =>
  providerFailure(provider, {
    reason: new UnexpectedResponseError(),
    ...(references === undefined ? {} : { references }),
  });
export const timedOut = (provider: string, references?: ReadonlyArray<SubmissionReference>) =>
  providerFailure(provider, {
    reason: new TimeoutError(),
    ...(references === undefined ? {} : { references }),
  });
