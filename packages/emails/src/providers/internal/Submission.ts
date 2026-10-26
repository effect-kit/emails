import { Duration, Effect, Redacted, Result, Schema } from "effect";

import { TimeoutError, TransportError } from "#/errors/EmailError.js";
import type { EmailError } from "#/errors/EmailError.js";
import { PositiveDuration, SecretToken } from "#/providers/internal/Configuration.js";
import { providerFailure, timedOut } from "#/providers/internal/Failures.js";

export class ProviderConfigurationError extends Schema.TaggedError<ProviderConfigurationError>()(
  "ProviderConfigurationError",
  {
    provider: Schema.String,
    field: Schema.String,
  },
) {}

export const settings = Effect.fnUntraced(function* (
  provider: string,
  token: Redacted.Redacted<string> | undefined,
  duration?: Duration.Duration,
) {
  const timeout = duration ?? Duration.seconds(30);
  if (!Schema.is(PositiveDuration)(timeout))
    return yield* new ProviderConfigurationError({ provider, field: "timeout" });
  if (token !== undefined && !Schema.is(SecretToken)(Redacted.value(token)))
    return yield* new ProviderConfigurationError({ provider, field: "token" });
  return timeout;
});

export const submission = (
  provider: string,
  timeout: Duration.Duration,
  request: (signal: AbortSignal) => Promise<unknown>,
  failure: (cause: unknown) => EmailError,
) =>
  Effect.tryPromise({ try: request, catch: failure }).pipe(
    Effect.timeout(timeout),
    Effect.catchTag("TimeoutError", () => Effect.fail(timedOut(provider))),
  );

const Failure = Schema.Struct({
  statusCode: Schema.optionalKey(Schema.Number),
  status: Schema.optionalKey(Schema.Number),
  code: Schema.optionalKey(Schema.Union([Schema.String, Schema.Number])),
  response: Schema.optionalKey(
    Schema.Struct({
      status: Schema.optionalKey(Schema.Number),
      statusCode: Schema.optionalKey(Schema.Number),
    }),
  ),
});

/** HTTP client rejections are sanitized here; unfamiliar programmer exceptions remain defects. */
export const httpFailure = (provider: string, cause: unknown): EmailError => {
  const decoded = Schema.decodeUnknownResult(Failure)(cause);
  if (Result.isSuccess(decoded)) {
    const failure = decoded.success;
    const status =
      failure.statusCode ??
      failure.status ??
      failure.response?.status ??
      failure.response?.statusCode;
    if (status !== undefined || failure.code !== undefined)
      return providerFailure(provider, {
        status,
        code: failure.code === undefined ? undefined : String(failure.code),
        ...(["ETIMEDOUT", "ECONNABORTED"].includes(String(failure.code))
          ? { reason: new TimeoutError() }
          : {}),
      });
  }
  if (cause instanceof TypeError || cause instanceof DOMException)
    return providerFailure(provider, { reason: new TransportError() });
  throw cause;
};

export const header = (headers: unknown, name: string): unknown => {
  if (headers instanceof Headers) return headers.get(name) ?? undefined;
  const decoded = Schema.decodeUnknownResult(Schema.Record(Schema.String, Schema.Unknown))(headers);
  if (Result.isFailure(decoded)) return undefined;
  return Object.entries(decoded.success).find(
    ([key]) => key.toLowerCase() === name.toLowerCase(),
  )?.[1];
};
