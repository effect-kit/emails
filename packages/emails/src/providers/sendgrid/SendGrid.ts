import { Config, Duration, Effect, Layer, Redacted, Result, Schema } from "effect";
import { Base64 } from "effect/encoding";

import sendgrid from "@sendgrid/mail";

import type { NormalizedEmailMessage } from "#/message/EmailMessage.js";
import { standardCapabilities } from "#/providers/internal/Capabilities.js";
import { providerFailure, unexpectedResponse } from "#/providers/internal/Failures.js";
import { accepted } from "#/providers/internal/Receipts.js";
import {
  header,
  httpFailure,
  type ProviderConfigurationError,
  settings,
  submission,
} from "#/providers/internal/Submission.js";
import { Email } from "#/service/Email.js";

const payload = (message: NormalizedEmailMessage) => ({
  from: { ...message.from },
  to: message.to.map((address) => ({ ...address })),
  subject: message.subject,
  ...(message.cc === undefined ? {} : { cc: message.cc.map((address) => ({ ...address })) }),
  ...(message.bcc === undefined ? {} : { bcc: message.bcc.map((address) => ({ ...address })) }),
  ...(message.replyTo === undefined ? {} : { replyTo: message.replyTo[0] }),
  // content avoids the SDK's weak intersection of text/html body alternatives.
  content: [
    ...(message.text === undefined ? [] : [{ type: "text/plain", value: message.text }]),
    ...(message.html === undefined ? [] : [{ type: "text/html", value: message.html }]),
  ],
  ...(message.headers === undefined ? {} : { headers: { ...message.headers } }),
  attachments: message.attachments?.map((attachment) => ({
    filename: attachment.filename,
    type: attachment.contentType,
    content: Base64.encode(attachment.content),
    disposition: attachment.contentId === undefined ? ("attachment" as const) : ("inline" as const),
    ...(attachment.contentId === undefined ? {} : { content_id: attachment.contentId }),
  })),
});
export interface SendGridClient {
  send(message: ReturnType<typeof payload>): Promise<unknown>;
}
// The CJS runtime exports this constructor; the published entry declaration types only the singleton.
const { MailService } = sendgrid as unknown as {
  MailService: new () => SendGridClient & {
    setApiKey(key: string): void;
    setTimeout(milliseconds: number): void;
  };
};

export interface ClientOptions {
  readonly timeout?: Duration.Duration;
}
export interface SendGridConfig extends ClientOptions {
  readonly apiKey: Redacted.Redacted<string>;
}
const Response = Schema.Tuple([
  Schema.Struct({ statusCode: Schema.Number, headers: Schema.optionalKey(Schema.Unknown) }),
  Schema.Unknown,
]);
const make = Effect.fnUntraced(function* (client: SendGridClient, options: ClientOptions) {
  const timeout = yield* settings("sendgrid", undefined, options.timeout);
  return Email.make({
    provider: "sendgrid",
    capabilities: { ...standardCapabilities, replyTo: "single" },
    send: Effect.fnUntraced(function* (message) {
      const response = yield* submission(
        "sendgrid",
        timeout,
        () => client.send(payload(message)),
        (cause) => {
          const code = Schema.decodeUnknownResult(Schema.Struct({ code: Schema.Number }))(cause);
          return Result.isSuccess(code)
            ? providerFailure("sendgrid", { status: code.success.code })
            : httpFailure("sendgrid", cause);
        },
      );
      const decoded = Schema.decodeUnknownResult(Response)(response);
      if (Result.isFailure(decoded) || decoded.success[0].statusCode !== 202)
        return yield* unexpectedResponse("sendgrid");
      const id = header(decoded.success[0].headers, "x-message-id");
      return yield* Effect.fromResult(accepted("sendgrid", id === undefined ? [] : [id]));
    }),
  });
});
export const layerClient = (
  client: SendGridClient,
  options: ClientOptions = {},
): Layer.Layer<Email, ProviderConfigurationError> => Layer.effect(Email, make(client, options));
export const layer = (options: SendGridConfig): Layer.Layer<Email, ProviderConfigurationError> =>
  Layer.effect(
    Email,
    Effect.gen(function* () {
      const timeout = yield* settings("sendgrid", options.apiKey, options.timeout);
      const client = new MailService();
      client.setApiKey(Redacted.value(options.apiKey));
      client.setTimeout(Duration.toMillis(timeout));
      return yield* make(client, options);
    }),
  );
export const layerConfig = (
  config: Config.Config<SendGridConfig> = Config.all({
    apiKey: Config.Redacted("SENDGRID_API_KEY"),
  }),
): Layer.Layer<Email, Config.ConfigError | ProviderConfigurationError> =>
  Layer.unwrap(Effect.map(config, layer));
export { ProviderConfigurationError } from "#/providers/internal/Submission.js";
