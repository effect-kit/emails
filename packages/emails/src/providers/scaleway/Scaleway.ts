import { Config, Duration, Effect, Layer, Redacted, Result, Schema } from "effect";
import { Base64 } from "effect/encoding";

import {
  createAdvancedClient,
  withProfile,
  withHTTPClient,
  withTimeout,
  Errors,
  AbortError,
} from "@scaleway/sdk-client";
import { Temv1alpha1 } from "@scaleway/sdk-tem";

import { QuotaExceededError, TransportError } from "#/errors/EmailError.js";
import type { NormalizedEmailMessage } from "#/message/EmailMessage.js";
import { standardCapabilities } from "#/providers/internal/Capabilities.js";
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

export interface ScalewayClient {
  createEmail(message: unknown, options?: { signal?: AbortSignal }): Promise<unknown>;
}
export interface ClientOptions {
  readonly projectId: string;
  readonly region: "fr-par";
  readonly timeout?: Duration.Duration;
}
export interface ScalewayConfig extends ClientOptions {
  readonly accessKey: string;
  readonly secretKey: Redacted.Redacted<string>;
}
const payload = (message: NormalizedEmailMessage, options: ClientOptions) => ({
  region: options.region,
  projectId: options.projectId,
  from: { ...message.from },
  to: message.to.map((address) => ({ ...address })),
  subject: message.subject,
  text: message.text ?? "",
  html: message.html ?? "",
  ...(message.cc === undefined ? {} : { cc: message.cc.map((address) => ({ ...address })) }),
  ...(message.bcc === undefined ? {} : { bcc: message.bcc.map((address) => ({ ...address })) }),
  additionalHeaders: [
    ...Object.entries(message.headers ?? {}).map(([key, value]) => ({ key, value })),
    ...(message.replyTo === undefined
      ? []
      : [{ key: "Reply-To", value: message.replyTo.map(formatMailbox).join(", ") }]),
  ],
  attachments: message.attachments?.map((attachment) => ({
    name: attachment.filename,
    type: attachment.contentType,
    content: Base64.encode(attachment.content),
  })),
});
const Response = Schema.Struct({
  emails: Schema.NonEmptyArray(Schema.Struct({ id: Schema.String })),
});
const make = Effect.fnUntraced(function* (client: ScalewayClient, options: ClientOptions) {
  const timeout = yield* settings("scaleway", undefined, options.timeout);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(options.projectId))
    return yield* new ProviderConfigurationError({ provider: "scaleway", field: "projectId" });
  if (!["fr-par"].includes(options.region))
    return yield* new ProviderConfigurationError({ provider: "scaleway", field: "region" });
  return Email.make({
    provider: "scaleway",
    capabilities: { ...standardCapabilities, inlineAttachments: false },
    send: Effect.fnUntraced(function* (message) {
      const request = payload(message, options);
      const response = yield* submission(
        "scaleway",
        timeout,
        (signal) => client.createEmail(request, { signal }),
        (cause) =>
          cause instanceof Errors.QuotasExceededError
            ? providerFailure("scaleway", {
                status: cause.status,
                reason: new QuotaExceededError(),
              })
            : cause instanceof AbortError
              ? providerFailure("scaleway", { reason: new TransportError() })
              : httpFailure("scaleway", cause),
      );
      const decoded = Schema.decodeUnknownResult(Response)(response);
      if (Result.isFailure(decoded)) return yield* unexpectedResponse("scaleway");
      return yield* Effect.fromResult(
        accepted(
          "scaleway",
          decoded.success.emails.map((email) => email.id),
        ),
      );
    }),
  });
});
export const layerClient = (
  client: ScalewayClient,
  options: ClientOptions,
): Layer.Layer<Email, ProviderConfigurationError> => Layer.effect(Email, make(client, options));
export const layer = (options: ScalewayConfig): Layer.Layer<Email, ProviderConfigurationError> =>
  Layer.effect(
    Email,
    Effect.gen(function* () {
      const timeout = yield* settings("scaleway", options.secretKey, options.timeout);
      if (!/^[A-Za-z0-9]+$/.test(options.accessKey))
        return yield* new ProviderConfigurationError({ provider: "scaleway", field: "accessKey" });
      const client = yield* Effect.try({
        try: () =>
          createAdvancedClient(
            withProfile({
              accessKey: options.accessKey,
              secretKey: Redacted.value(options.secretKey),
            }),
            withHTTPClient(globalThis.fetch),
            withTimeout(Duration.toMillis(timeout)),
          ),
        catch: () => new ProviderConfigurationError({ provider: "scaleway", field: "credentials" }),
      });
      return yield* make(new Temv1alpha1.API(client), options);
    }),
  );
export const layerConfig = (
  config: Config.Config<ScalewayConfig> = Config.all({
    accessKey: Config.String("SCW_ACCESS_KEY"),
    secretKey: Config.Redacted("SCW_SECRET_KEY"),
    projectId: Config.String("SCW_PROJECT_ID"),
    region: Config.Literals(["fr-par"], "SCW_REGION"),
  }),
): Layer.Layer<Email, Config.ConfigError | ProviderConfigurationError> =>
  Layer.unwrap(Effect.map(config, layer));
export { ProviderConfigurationError } from "#/providers/internal/Submission.js";
