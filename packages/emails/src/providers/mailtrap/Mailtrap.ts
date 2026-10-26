import { type Config, Duration, Effect, Layer, Redacted, Result, Schema } from "effect";
import { Base64 } from "effect/encoding";

import { MailtrapClient as NativeClient } from "mailtrap";

import type { NormalizedEmailMessage } from "#/message/EmailMessage.js";
import { standardCapabilities } from "#/providers/internal/Capabilities.js";
import { unexpectedResponse } from "#/providers/internal/Failures.js";
import { accepted } from "#/providers/internal/Receipts.js";
import {
  httpFailure,
  ProviderConfigurationError,
  settings,
  submission,
} from "#/providers/internal/Submission.js";
import { Email } from "#/service/Email.js";

export interface MailtrapClient {
  send(message: unknown): Promise<unknown>;
}
export interface ClientOptions {
  readonly timeout?: Duration.Duration;
  readonly mode: "production" | "sandbox" | "bulk";
}
export type MailtrapConfig = {
  readonly token: Redacted.Redacted<string>;
  readonly timeout?: Duration.Duration;
} & (
  | { readonly mode: "production" | "bulk"; readonly inboxId?: never }
  | { readonly mode: "sandbox"; readonly inboxId: number }
);
const payload = (message: NormalizedEmailMessage) => ({
  from: { ...message.from },
  to: message.to.map((address) => ({ ...address })),
  subject: message.subject,
  ...(message.text === undefined ? {} : { text: message.text }),
  ...(message.html === undefined ? {} : { html: message.html }),
  ...(message.cc === undefined ? {} : { cc: message.cc.map((address) => ({ ...address })) }),
  ...(message.bcc === undefined ? {} : { bcc: message.bcc.map((address) => ({ ...address })) }),
  ...(message.replyTo === undefined ? {} : { reply_to: message.replyTo[0] }),
  ...(message.headers === undefined ? {} : { headers: { ...message.headers } }),
  attachments: message.attachments?.map((attachment) => ({
    filename: attachment.filename,
    type: attachment.contentType,
    content: Base64.encode(attachment.content),
    disposition: attachment.contentId === undefined ? "attachment" : "inline",
    ...(attachment.contentId === undefined ? {} : { content_id: attachment.contentId }),
  })),
});
const Response = Schema.Struct({
  success: Schema.Literal(true),
  message_ids: Schema.NonEmptyArray(Schema.String),
});
const NestedFailure = Schema.Struct({ cause: Schema.Unknown });
const make = Effect.fnUntraced(function* (client: MailtrapClient, options: ClientOptions) {
  const timeout = yield* settings("mailtrap", undefined, options.timeout);
  if (!["production", "sandbox", "bulk"].includes(options.mode))
    return yield* new ProviderConfigurationError({ provider: "mailtrap", field: "mode" });
  const provider =
    options.mode === "sandbox"
      ? "mailtrap/sandbox"
      : options.mode === "bulk"
        ? "mailtrap/bulk"
        : "mailtrap";
  return Email.make({
    provider,
    capabilities: { ...standardCapabilities, replyTo: "single" },
    send: Effect.fnUntraced(function* (message) {
      const request = payload(message);
      const response = yield* submission(
        provider,
        timeout,
        () => client.send(request),
        (cause) => {
          const nested = Schema.decodeUnknownResult(NestedFailure)(cause);
          return httpFailure(provider, Result.isSuccess(nested) ? nested.success.cause : cause);
        },
      );
      const decoded = Schema.decodeUnknownResult(Response)(response);
      if (Result.isFailure(decoded)) return yield* unexpectedResponse(provider);
      return yield* Effect.fromResult(accepted(provider, decoded.success.message_ids));
    }),
  });
});
export const layerClient = (
  client: MailtrapClient,
  options: ClientOptions,
): Layer.Layer<Email, ProviderConfigurationError> => Layer.effect(Email, make(client, options));

// SDK 5.0.0 owns keep-alive agents but exposes no disposal/timeout method. Keep this version-pinned
// ownership seam private; borrowed clients are never inspected or mutated.
interface OwnedTransport {
  axios: {
    defaults: { timeout: number; httpAgent: { destroy(): void }; httpsAgent: { destroy(): void } };
  };
}
export const layer = (options: MailtrapConfig): Layer.Layer<Email, ProviderConfigurationError> =>
  Layer.effect(
    Email,
    Effect.gen(function* () {
      const timeout = yield* settings("mailtrap", options.token, options.timeout);
      if (
        options.mode === "sandbox" &&
        (!Number.isSafeInteger(options.inboxId) || options.inboxId <= 0)
      )
        return yield* new ProviderConfigurationError({ provider: "mailtrap", field: "inboxId" });
      if (options.mode !== "sandbox" && options.inboxId !== undefined)
        return yield* new ProviderConfigurationError({ provider: "mailtrap", field: "inboxId" });
      const client = yield* Effect.acquireRelease(
        Effect.sync(() => {
          const native = new NativeClient({
            token: Redacted.value(options.token),
            sandbox: options.mode === "sandbox",
            bulk: options.mode === "bulk",
            ...(options.mode === "sandbox" ? { testInboxId: options.inboxId } : {}),
          });
          (native as unknown as OwnedTransport).axios.defaults.timeout = Duration.toMillis(timeout);
          return native;
        }),
        (native) =>
          Effect.sync(() => {
            const transport = (native as unknown as OwnedTransport).axios.defaults;
            transport.httpAgent.destroy();
            transport.httpsAgent.destroy();
          }),
      );
      return yield* make(client, options);
    }),
  );
export const layerConfig = (
  config: Config.Config<MailtrapConfig>,
): Layer.Layer<Email, Config.ConfigError | ProviderConfigurationError> =>
  Layer.unwrap(Effect.map(config, layer));
export { ProviderConfigurationError } from "#/providers/internal/Submission.js";
