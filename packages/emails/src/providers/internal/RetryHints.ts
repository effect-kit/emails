import { Duration, Schema } from "effect";

import { RetryAfter } from "#/delivery/EmailCapabilities.js";

const Seconds = Schema.Number.check(Schema.isFinite(), Schema.isGreaterThanOrEqualTo(0));

/** Converting finite seconds can overflow milliseconds; malformed hints must not defect a send. */
export const retryAfterSeconds = (
  seconds: unknown,
): { readonly retryAfter?: Duration.Duration } => {
  if (!Schema.is(Seconds)(seconds)) return {};
  const retryAfter = Duration.seconds(seconds);
  return Schema.is(RetryAfter)(retryAfter) ? { retryAfter } : {};
};
