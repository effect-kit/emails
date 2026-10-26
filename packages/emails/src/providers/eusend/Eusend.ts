import { Config, type Duration, Effect, Layer, Redacted, Result, Schema } from "effect";
import { Base64 } from "effect/encoding";

import { Eusend as NativeClient } from "@eusend_dev/sdk";

import {
  AuthenticationError,
  IdempotencyConflictError,
  InvalidMessageError,
  MessageRejectedError,
  PermissionDeniedError,
  ProviderUnavailableError,
  QuotaExceededError,
  RateLimitedError,
  TransportError,
} from "#/errors/EmailError.js";
import type { NormalizedEmailMessage } from "#/message/EmailMessage.js";
import { standardCapabilities } from "#/providers/internal/Capabilities.js";
import { IdempotencyKey } from "#/providers/internal/Configuration.js";
import { providerFailure, unexpectedResponse } from "#/providers/internal/Failures.js";
import { formatMailbox } from "#/providers/internal/Mailboxes.js";
import { accepted } from "#/providers/internal/Receipts.js";
import {
  header,
  httpFailure,
  ProviderConfigurationError,
  settings,
  submission,
} from "#/providers/internal/Submission.js";
import { Email } from "#/service/Email.js";

export interface EusendClient {
  emails: { send(message: unknown, options?: { idempotencyKey?: string }): Promise<unknown> };
}
export interface ClientOptions {
  readonly timeout?: Duration.Duration;
}
export interface EusendConfig extends ClientOptions {
  readonly apiKey: Redacted.Redacted<string>;
  readonly baseUrl?: URL;
}
const payload = (message: NormalizedEmailMessage) => ({
  from: formatMailbox(message.from),
  to: message.to.map(formatMailbox),
  subject: message.subject,
  ...(message.text === undefined ? {} : { text: message.text }),
  ...(message.html === undefined ? {} : { html: message.html }),
  ...(message.cc === undefined ? {} : { cc: message.cc.map(formatMailbox) }),
  ...(message.bcc === undefined ? {} : { bcc: message.bcc.map(formatMailbox) }),
  ...(message.replyTo === undefined ? {} : { replyTo: message.replyTo.map(formatMailbox) }),
  ...(message.headers === undefined ? {} : { headers: { ...message.headers } }),
  attachments: message.attachments?.map((attachment) => ({
    filename: attachment.filename,
    content: Base64.encode(attachment.content),
    contentType: attachment.contentType,
    ...(attachment.contentId === undefined ? {} : { contentId: attachment.contentId }),
  })),
});
const Response = Schema.Union([
  Schema.Struct({
    data: Schema.Struct({ id: Schema.String }),
    error: Schema.Null,
    headers: Schema.Unknown,
  }),
  Schema.Struct({
    data: Schema.Null,
    error: Schema.Struct({ name: Schema.String, statusCode: Schema.NullOr(Schema.Number) }),
    headers: Schema.Unknown,
  }),
]);
const make = Effect.fnUntraced(function* (client: EusendClient, options: ClientOptions) {
  const timeout = yield* settings("eusend", undefined, options.timeout);
  return Email.make({
    provider: "eusend",
    capabilities: { ...standardCapabilities, idempotency: { mode: "replay" } },
    send: Effect.fnUntraced(function* (message, sendOptions) {
      if (
        sendOptions.idempotencyKey !== undefined &&
        !Schema.is(IdempotencyKey)(sendOptions.idempotencyKey)
      )
        return yield* providerFailure("eusend", {
          reason: new InvalidMessageError({ paths: [["idempotencyKey"]] }),
          acceptance: "notSubmitted",
        });
      const request = payload(message);
      const response = yield* submission(
        "eusend",
        timeout,
        () => client.emails.send(request, sendOptions),
        (cause) => httpFailure("eusend", cause),
      );
      const decoded = Schema.decodeUnknownResult(Response)(response);
      if (Result.isFailure(decoded)) return yield* unexpectedResponse("eusend");
      const result = decoded.success;
      if (result.error !== null) {
        const { name, statusCode } = result.error;
        const reason =
          name === "UNAUTHORIZED"
            ? new AuthenticationError()
            : [
                  "FORBIDDEN",
                  "DOMAIN_NOT_VERIFIED",
                  "SENDING_SUSPENDED",
                  "ACCOUNT_RESTRICTED",
                  "WORKSPACE_INACTIVE",
                  "SENDER_NOT_PERMITTED",
                ].includes(name)
              ? new PermissionDeniedError()
              : ["MONTHLY_LIMIT_EXCEEDED", "DAILY_LIMIT_EXCEEDED", "PLAN_LIMIT_EXCEEDED"].includes(
                    name,
                  )
                ? new QuotaExceededError()
                : ["ALL_SUPPRESSED", "RECIPIENT_DOMAIN_UNDELIVERABLE"].includes(name)
                  ? new MessageRejectedError()
                  : name === "RATE_LIMITED"
                    ? new RateLimitedError()
                    : name === "CONFLICT"
                      ? new IdempotencyConflictError()
                      : name === "application_error"
                        ? new TransportError()
                        : ["SERVICE_PAUSED", "ATTACHMENT_STORAGE_ERROR", "INTERNAL_ERROR"].includes(
                              name,
                            )
                          ? new ProviderUnavailableError()
                          : undefined;
        return yield* providerFailure("eusend", {
          status: statusCode,
          code: name,
          ...(reason === undefined ? {} : { reason }),
        });
      }
      return yield* Effect.fromResult(
        accepted("eusend", [result.data.id], { requestId: header(result.headers, "x-request-id") }),
      );
    }),
  });
});
export const layerClient = (
  client: EusendClient,
  options: ClientOptions = {},
): Layer.Layer<Email, ProviderConfigurationError> => Layer.effect(Email, make(client, options));
export const layer = (options: EusendConfig): Layer.Layer<Email, ProviderConfigurationError> =>
  Layer.effect(
    Email,
    Effect.gen(function* () {
      yield* settings("eusend", options.apiKey, options.timeout);
      if (
        options.baseUrl !== undefined &&
        (!["http:", "https:"].includes(options.baseUrl.protocol) ||
          options.baseUrl.username ||
          options.baseUrl.password ||
          options.baseUrl.search ||
          options.baseUrl.hash)
      )
        return yield* new ProviderConfigurationError({ provider: "eusend", field: "baseUrl" });
      return yield* make(
        new NativeClient(Redacted.value(options.apiKey), {
          baseUrl: options.baseUrl?.href.replace(/\/$/, "") ?? "https://api.eusend.dev",
        }),
        options,
      );
    }),
  );
export const layerConfig = (
  config: Config.Config<EusendConfig> = Config.all({ apiKey: Config.Redacted("EUSEND_API_KEY") }),
): Layer.Layer<Email, Config.ConfigError | ProviderConfigurationError> =>
  Layer.unwrap(Effect.map(config, layer));
export { ProviderConfigurationError } from "#/providers/internal/Submission.js";
