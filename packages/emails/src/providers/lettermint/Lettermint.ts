import { Config, Duration, Effect, Layer, Redacted, Result, Schema } from "effect";
import { Base64 } from "effect/encoding";

import {
  Lettermint as NativeClient,
  ApiError,
  ConflictError,
  ConnectionError,
  LettermintConfigError,
  LettermintValidationError,
  RateLimitError,
  TimeoutError as NativeTimeout,
  UnexpectedResponseError as NativeUnexpected,
  RedirectError,
} from "lettermint";

import {
  AuthenticationError,
  IdempotencyConflictError,
  InvalidMessageError,
  RateLimitedError,
  TimeoutError,
  TransportError,
} from "#/errors/EmailError.js";
import type { NormalizedEmailMessage } from "#/message/EmailMessage.js";
import { standardCapabilities } from "#/providers/internal/Capabilities.js";
import { IdempotencyKey } from "#/providers/internal/Configuration.js";
import { providerFailure, unexpectedResponse } from "#/providers/internal/Failures.js";
import { formatMailbox } from "#/providers/internal/Mailboxes.js";
import { accepted } from "#/providers/internal/Receipts.js";
import {
  httpFailure,
  ProviderConfigurationError,
  settings,
  submission,
} from "#/providers/internal/Submission.js";
import { Email } from "#/service/Email.js";

export interface LettermintClient {
  emails: {
    send(
      message: unknown,
      options?: { signal?: AbortSignal; timeout?: number; idempotencyKey?: string },
    ): Promise<unknown>;
  };
}
export interface ClientOptions {
  readonly timeout?: Duration.Duration;
  readonly sandbox?: boolean;
}
export interface LettermintConfig extends ClientOptions {
  readonly sendingToken: Redacted.Redacted<string>;
}
const payload = (message: NormalizedEmailMessage) => ({
  from: formatMailbox(message.from),
  to: message.to.map(formatMailbox),
  subject: message.subject,
  ...(message.text === undefined ? {} : { text: message.text }),
  ...(message.html === undefined ? {} : { html: message.html }),
  ...(message.cc === undefined ? {} : { cc: message.cc.map(formatMailbox) }),
  ...(message.bcc === undefined ? {} : { bcc: message.bcc.map(formatMailbox) }),
  ...(message.replyTo === undefined ? {} : { reply_to: message.replyTo.map(formatMailbox) }),
  ...(message.headers === undefined ? {} : { headers: { ...message.headers } }),
  attachments: message.attachments?.map((attachment) => ({
    filename: attachment.filename,
    content: Base64.encode(attachment.content),
    content_type: attachment.contentType,
    ...(attachment.contentId === undefined ? {} : { content_id: attachment.contentId }),
  })),
});
const Response = Schema.Struct({
  message_id: Schema.String,
  status: Schema.Literal("pending"),
  sandbox: Schema.optionalKey(Schema.Boolean),
});
const failure = (provider: string, cause: unknown) => {
  if (cause instanceof NativeTimeout)
    return providerFailure(provider, { reason: new TimeoutError() });
  if (cause instanceof ConnectionError)
    return providerFailure(provider, { reason: new TransportError() });
  if (cause instanceof NativeUnexpected || cause instanceof RedirectError)
    return unexpectedResponse(provider);
  if (cause instanceof LettermintConfigError)
    return providerFailure(provider, {
      reason: new AuthenticationError(),
      acceptance: "notSubmitted",
    });
  if (cause instanceof LettermintValidationError)
    return providerFailure(provider, {
      reason: new InvalidMessageError({ paths: [] }),
      acceptance: "notSubmitted",
    });
  if (cause instanceof ApiError)
    return providerFailure(provider, {
      status: cause.status,
      code: cause.code,
      ...(cause instanceof ConflictError ? { reason: new IdempotencyConflictError() } : {}),
      ...(cause instanceof RateLimitError
        ? {
            reason: new RateLimitedError(
              cause.retryAfter !== undefined &&
                Number.isFinite(cause.retryAfter) &&
                cause.retryAfter >= 0
                ? { retryAfter: Duration.seconds(cause.retryAfter) }
                : {},
            ),
          }
        : {}),
    });
  return httpFailure(provider, cause);
};
const make = Effect.fnUntraced(function* (client: LettermintClient, options: ClientOptions) {
  const { sandbox } = options;
  const timeout = yield* settings("lettermint", undefined, options.timeout);
  const provider = sandbox ? "lettermint/sandbox" : "lettermint";
  return Email.make({
    provider,
    capabilities: {
      ...standardCapabilities,
      idempotency: { mode: "replay", retention: Duration.hours(24) },
    },
    send: Effect.fnUntraced(function* (message, sendOptions) {
      if (
        sendOptions.idempotencyKey !== undefined &&
        !Schema.is(IdempotencyKey)(sendOptions.idempotencyKey)
      )
        return yield* providerFailure(provider, {
          reason: new InvalidMessageError({ paths: [["idempotencyKey"]] }),
          acceptance: "notSubmitted",
        });
      // The API appends @lm to bare CIDs. Require fully qualified IDs to preserve caller identity.
      if (
        message.attachments?.some(
          (attachment) => attachment.contentId !== undefined && !attachment.contentId.includes("@"),
        )
      )
        return yield* providerFailure(provider, {
          reason: new InvalidMessageError({ paths: [["attachments"]] }),
          acceptance: "notSubmitted",
        });
      const request = payload(message);
      const response = yield* submission(
        provider,
        timeout,
        (signal) =>
          client.emails.send(request, {
            signal,
            timeout: Duration.toMillis(timeout),
            ...sendOptions,
          }),
        (cause) => failure(provider, cause),
      );
      const decoded = Schema.decodeUnknownResult(Response)(response);
      if (Result.isFailure(decoded) || Boolean(decoded.success.sandbox) !== Boolean(sandbox))
        return yield* unexpectedResponse(provider);
      return yield* Effect.fromResult(accepted(provider, [decoded.success.message_id]));
    }),
  });
});
export const layerClient = (
  client: LettermintClient,
  options: ClientOptions = {},
): Layer.Layer<Email, ProviderConfigurationError> => Layer.effect(Email, make(client, options));
export const layer = (options: LettermintConfig): Layer.Layer<Email, ProviderConfigurationError> =>
  Layer.effect(
    Email,
    Effect.gen(function* () {
      const timeout = yield* settings("lettermint", options.sendingToken, options.timeout);
      const client = yield* Effect.try({
        try: () =>
          new NativeClient({
            sendingToken: Redacted.value(options.sendingToken),
            timeout: Duration.toMillis(timeout),
          }),
        catch: () =>
          new ProviderConfigurationError({ provider: "lettermint", field: "sendingToken" }),
      });
      return yield* make(client, options);
    }),
  );
export const layerConfig = (
  config: Config.Config<LettermintConfig> = Config.all({
    sendingToken: Config.Redacted("LETTERMINT_SENDING_TOKEN"),
  }),
): Layer.Layer<Email, Config.ConfigError | ProviderConfigurationError> =>
  Layer.unwrap(Effect.map(config, layer));
export { ProviderConfigurationError } from "#/providers/internal/Submission.js";
