import { Result, Schema } from "effect";

import {
  AuthenticationError,
  InvalidMessageError,
  MessageRejectedError,
  PermissionDeniedError,
  QuotaExceededError,
  RateLimitedError,
  TransportError,
} from "#/errors/EmailError.js";
import { providerFailure } from "#/providers/internal/Failures.js";

const Failure = Schema.Struct({
  name: Schema.String,
  $metadata: Schema.optionalKey(
    Schema.Struct({ httpStatusCode: Schema.optionalKey(Schema.Number) }),
  ),
});

export const fromSesFailure = (cause: unknown) => {
  const decoded = Schema.decodeUnknownResult(Failure)(cause);
  if (Result.isFailure(decoded)) {
    if (cause instanceof TypeError || cause instanceof DOMException)
      return providerFailure("ses", { reason: new TransportError() });
    throw cause;
  }
  const { name, $metadata } = decoded.success;
  const reason = [
    "CredentialsProviderError",
    "TokenProviderError",
    "InvalidClientTokenId",
    "ExpiredToken",
    "UnrecognizedClientException",
  ].includes(name)
    ? new AuthenticationError()
    : name === "TooManyRequestsException"
      ? new RateLimitedError()
      : name === "LimitExceededException"
        ? new QuotaExceededError()
        : name === "MessageRejected"
          ? new MessageRejectedError()
          : name === "BadRequestException"
            ? new InvalidMessageError({ paths: [] })
            : [
                  "MailFromDomainNotVerifiedException",
                  "SendingPausedException",
                  "AccountSuspendedException",
                  "AccessDeniedException",
                ].includes(name)
              ? new PermissionDeniedError()
              : undefined;
  return providerFailure("ses", {
    code: name,
    status: $metadata?.httpStatusCode,
    ...(reason === undefined ? {} : { reason }),
    ...(["CredentialsProviderError", "TokenProviderError"].includes(name)
      ? { acceptance: "notSubmitted" as const }
      : {}),
  });
};
