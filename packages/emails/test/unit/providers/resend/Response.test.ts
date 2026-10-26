import { Duration, Result } from "effect";

import { expect, it } from "vitest";

import { fromResendResponse } from "../../../../src/providers/resend/Response.js";

it.each([
  ["validation_error", 401, "AuthenticationError", "rejected"],
  ["validation_error", 403, "PermissionDeniedError", "rejected"],
  ["validation_error", 422, "InvalidMessageError", "rejected"],
  ["daily_quota_exceeded", 429, "QuotaExceededError", "rejected"],
  ["monthly_quota_exceeded", 429, "QuotaExceededError", "rejected"],
  ["rate_limit_exceeded", 429, "RateLimitedError", "rejected"],
  ["invalid_idempotent_request", 409, "IdempotencyConflictError", "unknown"],
  ["concurrent_idempotent_requests", 409, "IdempotencyConflictError", "unknown"],
  ["application_error", 503, "ProviderUnavailableError", "unknown"],
  ["application_error", null, "TransportError", "unknown"],
  ["future_error", 409, "ProviderError", "unknown"],
])("maps %s/%s without exposing raw provider messages", (name, statusCode, tag, acceptance) => {
  const result = fromResendResponse({
    data: null,
    headers: { "retry-after": "2" },
    error: { name, statusCode, message: "private-provider-body" },
  });
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) {
    expect(result.failure.reason._tag).toBe(tag);
    expect(result.failure.acceptance).toBe(acceptance);
    expect(JSON.stringify(result.failure)).not.toContain("private-provider-body");
    if (result.failure.reason._tag === "RateLimitedError") {
      expect(Duration.toMillis(result.failure.reason.retryAfter ?? Duration.zero)).toBe(2000);
    }
  }
});

it.each([
  { data: {}, error: null, headers: null },
  { data: { id: "" }, error: null, headers: null },
  { data: { id: "id" }, error: { name: "validation_error" }, headers: null },
  { data: null, error: { name: "private\ncode" }, headers: null },
])("does not invent success or rejection evidence from malformed envelopes", (response) => {
  const result = fromResendResponse(response);
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) {
    expect(result.failure.reason._tag).toBe("UnexpectedResponseError");
    expect(result.failure.acceptance).toBe("unknown");
  }
});
