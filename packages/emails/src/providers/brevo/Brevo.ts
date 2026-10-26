import { Config, Duration, Effect, Layer, Redacted, Result, Schema } from "effect";

import { BrevoClient as NativeClient, BrevoError, BrevoTimeoutError } from "@getbrevo/brevo";

import {
  IdempotencyConflictError,
  InvalidMessageError,
  MessageRejectedError,
  PermissionDeniedError,
  QuotaExceededError,
  TimeoutError,
} from "#/errors/EmailError.js";
import type { NormalizedEmailMessage, SendOptions } from "#/message/EmailMessage.js";
import { standardCapabilities } from "#/providers/internal/Capabilities.js";
import { providerFailure, unexpectedResponse } from "#/providers/internal/Failures.js";
import { accepted } from "#/providers/internal/Receipts.js";
import {
  httpFailure,
  type ProviderConfigurationError,
  settings,
  submission,
} from "#/providers/internal/Submission.js";
import { Email } from "#/service/Email.js";

export interface BrevoClient {
  transactionalEmails: {
    sendTransacEmail(
      message: unknown,
      options?: { maxRetries?: number; timeoutInSeconds?: number; abortSignal?: AbortSignal },
    ): Promise<unknown>;
  };
}
export interface ClientOptions {
  readonly timeout?: Duration.Duration;
}
export interface BrevoConfig extends ClientOptions {
  readonly apiKey: Redacted.Redacted<string>;
}
const payload = (message: NormalizedEmailMessage, options: SendOptions) => ({
  sender: { ...message.from },
  to: message.to.map((address) => ({ ...address })),
  subject: message.subject,
  ...(message.text === undefined ? {} : { textContent: message.text }),
  ...(message.html === undefined ? {} : { htmlContent: message.html }),
  ...(message.cc === undefined ? {} : { cc: message.cc.map((address) => ({ ...address })) }),
  ...(message.bcc === undefined ? {} : { bcc: message.bcc.map((address) => ({ ...address })) }),
  ...(message.replyTo === undefined ? {} : { replyTo: message.replyTo[0] }),
  headers: {
    ...message.headers,
    ...(options.idempotencyKey === undefined ? {} : { idempotencyKey: options.idempotencyKey }),
  },
});
const Failure = Schema.Struct({ code: Schema.String });
const Response = Schema.Struct({ messageId: Schema.String });
const failure = (cause: unknown) => {
  if (cause instanceof BrevoTimeoutError)
    return providerFailure("brevo", { reason: new TimeoutError() });
  if (!(cause instanceof BrevoError)) return httpFailure("brevo", cause);
  const decoded = Schema.decodeUnknownResult(Failure)(cause.body);
  const code = Result.isSuccess(decoded) ? decoded.success.code : undefined;
  const reason =
    code === "duplicate_parameter"
      ? new IdempotencyConflictError()
      : ["not_enough_credits", "insufficient_credits", "quota_exceeded"].includes(code ?? "")
        ? new QuotaExceededError()
        : code === "permission_denied"
          ? new PermissionDeniedError()
          : ["recipient_blacklisted", "recipient_rejected"].includes(code ?? "")
            ? new MessageRejectedError()
            : undefined;
  return providerFailure("brevo", {
    status: cause.statusCode,
    code,
    ...(reason === undefined ? {} : { reason }),
    ...(code === "duplicate_parameter" ? { acceptance: "unknown" } : {}),
  });
};
const make = Effect.fnUntraced(function* (client: BrevoClient, options: ClientOptions) {
  const timeout = yield* settings("brevo", undefined, options.timeout);
  return Email.make({
    provider: "brevo",
    capabilities: {
      ...standardCapabilities,
      replyTo: "single",
      attachments: false,
      inlineAttachments: false,
      idempotency: { mode: "reject", retention: Duration.minutes(30) },
    },
    send: Effect.fnUntraced(function* (message, sendOptions) {
      if (
        sendOptions.idempotencyKey !== undefined &&
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          sendOptions.idempotencyKey,
        )
      )
        return yield* providerFailure("brevo", {
          reason: new InvalidMessageError({ paths: [["idempotencyKey"]] }),
          acceptance: "notSubmitted",
        });
      if (
        Object.keys(message.headers ?? {}).some((name) => name.toLowerCase() === "idempotencykey")
      )
        return yield* providerFailure("brevo", {
          reason: new InvalidMessageError({ paths: [["headers"]] }),
          acceptance: "notSubmitted",
        });
      const request = payload(message, sendOptions);
      const response = yield* submission(
        "brevo",
        timeout,
        (abortSignal) =>
          client.transactionalEmails.sendTransacEmail(request, {
            abortSignal,
            maxRetries: 0,
            timeoutInSeconds: Duration.toSeconds(timeout),
          }),
        failure,
      );
      const decoded = Schema.decodeUnknownResult(Response)(response);
      if (Result.isFailure(decoded)) return yield* unexpectedResponse("brevo");
      return yield* Effect.fromResult(accepted("brevo", [decoded.success.messageId]));
    }),
  });
});
export const layerClient = (
  client: BrevoClient,
  options: ClientOptions = {},
): Layer.Layer<Email, ProviderConfigurationError> => Layer.effect(Email, make(client, options));
export const layer = (options: BrevoConfig): Layer.Layer<Email, ProviderConfigurationError> =>
  Layer.effect(
    Email,
    Effect.gen(function* () {
      const timeout = yield* settings("brevo", options.apiKey, options.timeout);
      return yield* make(
        new NativeClient({
          apiKey: Redacted.value(options.apiKey),
          maxRetries: 0,
          timeoutInSeconds: Duration.toSeconds(timeout),
        }),
        options,
      );
    }),
  );
export const layerConfig = (
  config: Config.Config<BrevoConfig> = Config.all({ apiKey: Config.Redacted("BREVO_API_KEY") }),
): Layer.Layer<Email, Config.ConfigError | ProviderConfigurationError> =>
  Layer.unwrap(Effect.map(config, layer));
export { ProviderConfigurationError } from "#/providers/internal/Submission.js";
