// oxlint-disable no-map-spread -- Copy normalized recipient fields and add provider visibility.
import { Config, Duration, Effect, Layer, Redacted } from "effect";
import { Base64 } from "effect/encoding";

import createClient from "@mailchimp/mailchimp_transactional";

import type { NormalizedEmailMessage } from "#/message/EmailMessage.js";
import { standardCapabilities } from "#/providers/internal/Capabilities.js";
import { formatMailbox } from "#/providers/internal/Mailboxes.js";
import {
  httpFailure,
  ProviderConfigurationError,
  settings,
  submission,
} from "#/providers/internal/Submission.js";
import { outcome } from "#/providers/mailchimp-transactional/Outcomes.js";
import { Email } from "#/service/Email.js";

export interface MailchimpTransactionalClient {
  messages: { send(body: unknown): Promise<unknown> };
}
export interface ClientOptions {
  readonly timeout?: Duration.Duration;
}
export interface MailchimpTransactionalConfig extends ClientOptions {
  readonly apiKey: Redacted.Redacted<string>;
  readonly baseUrl?: URL;
}
const payload = (message: NormalizedEmailMessage) => ({
  message: {
    from_email: message.from.email,
    ...(message.from.name === undefined ? {} : { from_name: message.from.name }),
    subject: message.subject,
    to: (["to", "cc", "bcc"] as const).flatMap((type) =>
      (message[type] ?? []).map((address) => ({
        email: address.email,
        ...(address.name === undefined ? {} : { name: address.name }),
        type,
      })),
    ),
    preserve_recipients: true,
    ...(message.text === undefined ? {} : { text: message.text }),
    ...(message.html === undefined ? {} : { html: message.html }),
    headers: {
      ...message.headers,
      ...(message.replyTo === undefined
        ? {}
        : { "Reply-To": message.replyTo.map(formatMailbox).join(", ") }),
    },
    attachments: message.attachments
      ?.filter((attachment) => attachment.contentId === undefined)
      .map((attachment) => ({
        name: attachment.filename,
        type: attachment.contentType,
        content: Base64.encode(attachment.content),
      })),
  },
});
const make = Effect.fnUntraced(function* (
  client: MailchimpTransactionalClient,
  options: ClientOptions,
) {
  const timeout = yield* settings("mailchimp-transactional", undefined, options.timeout);
  return Email.make({
    provider: "mailchimp-transactional",
    capabilities: { ...standardCapabilities, inlineAttachments: false },
    send: Effect.fnUntraced(function* (message) {
      const request = payload(message);
      const response = yield* submission(
        "mailchimp-transactional",
        timeout,
        () => client.messages.send(request),
        (cause) => httpFailure("mailchimp-transactional", cause),
      );
      return yield* Effect.fromResult(outcome(response, message));
    }),
  });
});
export const layerClient = (
  client: MailchimpTransactionalClient,
  options: ClientOptions = {},
): Layer.Layer<Email, ProviderConfigurationError> => Layer.effect(Email, make(client, options));
export const layer = (
  options: MailchimpTransactionalConfig,
): Layer.Layer<Email, ProviderConfigurationError> =>
  Layer.effect(
    Email,
    Effect.gen(function* () {
      const timeout = yield* settings("mailchimp-transactional", options.apiKey, options.timeout);
      const url = options.baseUrl ?? new URL("https://mandrillapp.com/api/1.4");
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        return yield* new ProviderConfigurationError({
          provider: "mailchimp-transactional",
          field: "baseUrl",
        });
      const client = createClient(Redacted.value(options.apiKey));
      client.basePath = url.href.replace(/\/$/, "");
      // setDefaultTimeoutMs mutates shared Axios state; this per-client request config avoids that.
      client.requestConfig.timeout = Duration.toMillis(timeout);
      return yield* make(client, options);
    }),
  );
export const layerConfig = (
  config: Config.Config<MailchimpTransactionalConfig> = Config.all({
    apiKey: Config.Redacted("MAILCHIMP_TRANSACTIONAL_API_KEY"),
  }),
): Layer.Layer<Email, Config.ConfigError | ProviderConfigurationError> =>
  Layer.unwrap(Effect.map(config, layer));
export { ProviderConfigurationError } from "#/providers/internal/Submission.js";
