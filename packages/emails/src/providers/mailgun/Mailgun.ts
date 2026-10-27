import { Buffer } from "node:buffer";

import { Config, Duration, Effect, Layer, Redacted, Result, Schema } from "effect";

import FormData from "form-data";
import Mailgun from "mailgun.js";

import type { NormalizedEmailMessage } from "#/message/EmailMessage.js";
import { standardCapabilities } from "#/providers/internal/Capabilities.js";
import { unexpectedResponse } from "#/providers/internal/Failures.js";
import { formatMailbox } from "#/providers/internal/Mailboxes.js";
import { accepted } from "#/providers/internal/Receipts.js";
import {
  httpFailure,
  ProviderConfigurationError,
  settings,
  submission,
} from "#/providers/internal/Submission.js";
import { Email } from "#/service/Email.js";

export interface MailgunClient {
  messages: { create(domain: string, message: unknown): Promise<unknown> };
}
export interface ClientOptions {
  readonly domain: string;
  readonly timeout?: Duration.Duration;
}
export interface MailgunConfig extends ClientOptions {
  readonly apiKey: Redacted.Redacted<string>;
  readonly region: "us" | "eu";
  readonly endpoint?: URL;
}
const payload = (message: NormalizedEmailMessage) => ({
  from: formatMailbox(message.from),
  to: message.to.map(formatMailbox),
  subject: message.subject,
  ...(message.text === undefined ? {} : { text: message.text }),
  ...(message.html === undefined ? {} : { html: message.html }),
  ...(message.cc === undefined ? {} : { cc: message.cc.map(formatMailbox) }),
  ...(message.bcc === undefined ? {} : { bcc: message.bcc.map(formatMailbox) }),
  ...(message.replyTo === undefined
    ? {}
    : { "h:Reply-To": message.replyTo.map(formatMailbox).join(", ") }),
  ...Object.fromEntries(
    Object.entries(message.headers ?? {}).map(([name, value]) => [`h:${name}`, value]),
  ),
  attachment: message.attachments?.map((attachment) => ({
    data: Buffer.from(attachment.content),
    filename: attachment.filename,
    contentType: attachment.contentType,
  })),
});
const Response = Schema.Struct({ id: Schema.String });
const make = Effect.fnUntraced(function* (client: MailgunClient, options: ClientOptions) {
  const { domain } = options;
  const timeout = yield* settings("mailgun", undefined, options.timeout);
  if (!/^(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z0-9-]+$/.test(domain))
    return yield* new ProviderConfigurationError({ provider: "mailgun", field: "domain" });
  return Email.make({
    provider: "mailgun",
    capabilities: { ...standardCapabilities, inlineAttachments: false },
    send: Effect.fnUntraced(function* (message) {
      const request = payload(message);
      const response = yield* submission(
        "mailgun",
        timeout,
        () => client.messages.create(domain, request),
        (cause) => httpFailure("mailgun", cause),
      );
      const decoded = Schema.decodeUnknownResult(Response)(response);
      if (Result.isFailure(decoded)) return yield* unexpectedResponse("mailgun");
      return yield* Effect.fromResult(accepted("mailgun", [decoded.success.id]));
    }),
  });
});
export const layerClient = (
  client: MailgunClient,
  options: ClientOptions,
): Layer.Layer<Email, ProviderConfigurationError> => Layer.effect(Email, make(client, options));
export const layer = (options: MailgunConfig): Layer.Layer<Email, ProviderConfigurationError> =>
  Layer.effect(
    Email,
    Effect.gen(function* () {
      const timeout = yield* settings("mailgun", options.apiKey, options.timeout);
      if (options.region !== "us" && options.region !== "eu")
        return yield* new ProviderConfigurationError({ provider: "mailgun", field: "region" });
      if (
        options.endpoint !== undefined &&
        (!["http:", "https:"].includes(options.endpoint.protocol) ||
          options.endpoint.username ||
          options.endpoint.password ||
          options.endpoint.pathname !== "/" ||
          options.endpoint.search ||
          options.endpoint.hash)
      )
        return yield* new ProviderConfigurationError({ provider: "mailgun", field: "endpoint" });
      const client = new Mailgun(FormData).client({
        username: "api",
        key: Redacted.value(options.apiKey),
        url:
          options.endpoint?.origin ??
          (options.region === "eu" ? "https://api.eu.mailgun.net" : "https://api.mailgun.net"),
        timeout: Duration.toMillis(timeout),
      });
      return yield* make(client, options);
    }),
  );
export const layerConfig = (
  config: Config.Config<MailgunConfig> = Config.all({
    apiKey: Config.Redacted("MAILGUN_API_KEY"),
    domain: Config.String("MAILGUN_DOMAIN"),
    region: Config.Literals(["us", "eu"], "MAILGUN_REGION"),
  }),
): Layer.Layer<Email, Config.ConfigError | ProviderConfigurationError> =>
  Layer.unwrap(Effect.map(config, layer));
export { ProviderConfigurationError } from "#/providers/internal/Submission.js";
