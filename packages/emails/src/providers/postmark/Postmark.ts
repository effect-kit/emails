import { Config, Duration, Effect, Layer, Redacted, Result, Schema } from "effect";
import { Base64 } from "effect/encoding";

import { ServerClient, Errors } from "postmark";

import { MessageRejectedError, TimeoutError, TransportError } from "#/errors/EmailError.js";
import type { NormalizedEmailMessage } from "#/message/EmailMessage.js";
import { standardCapabilities } from "#/providers/internal/Capabilities.js";
import { providerFailure, unexpectedResponse } from "#/providers/internal/Failures.js";
import { formatMailbox } from "#/providers/internal/Mailboxes.js";
import { accepted } from "#/providers/internal/Receipts.js";
import {
  ProviderConfigurationError,
  settings,
  submission,
} from "#/providers/internal/Submission.js";
import { Email } from "#/service/Email.js";

const payload = (message: NormalizedEmailMessage, stream?: string) => ({
  From: formatMailbox(message.from),
  To: message.to.map(formatMailbox).join(", "),
  Subject: message.subject,
  ...(message.cc === undefined ? {} : { Cc: message.cc.map(formatMailbox).join(", ") }),
  ...(message.bcc === undefined ? {} : { Bcc: message.bcc.map(formatMailbox).join(", ") }),
  ...(message.replyTo === undefined
    ? {}
    : { ReplyTo: message.replyTo.map(formatMailbox).join(", ") }),
  ...(message.text === undefined ? {} : { TextBody: message.text }),
  ...(message.html === undefined ? {} : { HtmlBody: message.html }),
  ...(stream === undefined ? {} : { MessageStream: stream }),
  Headers: Object.entries(message.headers ?? {}).map(([Name, Value]) => ({ Name, Value })),
  Attachments:
    message.attachments?.map((attachment) => ({
      Name: attachment.filename,
      Content: Base64.encode(attachment.content),
      ContentType: attachment.contentType,
      ContentID: attachment.contentId === undefined ? null : `cid:${attachment.contentId}`,
    })) ?? [],
});
export interface PostmarkClient {
  sendEmail(message: ReturnType<typeof payload>): Promise<unknown>;
}
export interface ClientOptions {
  readonly timeout?: Duration.Duration;
  readonly messageStream?: string;
}
export interface PostmarkConfig extends ClientOptions {
  readonly serverToken: Redacted.Redacted<string>;
}
const Response = Schema.Struct({
  MessageID: Schema.String,
  ErrorCode: Schema.optionalKey(Schema.Number),
});
const failure = (cause: unknown) => {
  if (!(cause instanceof Errors.PostmarkError)) throw cause;
  return providerFailure("postmark", {
    status: cause.statusCode,
    code: String(cause.code),
    ...(cause instanceof Errors.InactiveRecipientsError
      ? { reason: new MessageRejectedError() }
      : {}),
    ...(cause.statusCode === 0
      ? { reason: cause.name.includes("Timeout") ? new TimeoutError() : new TransportError() }
      : {}),
  });
};
const make = Effect.fnUntraced(function* (client: PostmarkClient, options: ClientOptions) {
  const { messageStream } = options;
  const timeout = yield* settings("postmark", undefined, options.timeout);
  if (messageStream !== undefined && !/^[A-Za-z0-9_-]+$/.test(messageStream))
    return yield* new ProviderConfigurationError({ provider: "postmark", field: "messageStream" });
  return Email.make({
    provider: "postmark",
    capabilities: standardCapabilities,
    send: Effect.fnUntraced(function* (message) {
      const request = payload(message, messageStream);
      const response = yield* submission(
        "postmark",
        timeout,
        () => client.sendEmail(request),
        failure,
      );
      const decoded = Schema.decodeUnknownResult(Response)(response);
      if (Result.isFailure(decoded)) return yield* unexpectedResponse("postmark");
      if (decoded.success.ErrorCode !== undefined && decoded.success.ErrorCode !== 0)
        return yield* providerFailure("postmark", {
          code: String(decoded.success.ErrorCode),
          acceptance: "rejected",
        });
      return yield* Effect.fromResult(accepted("postmark", [decoded.success.MessageID]));
    }),
  });
});
export const layerClient = (
  client: PostmarkClient,
  options: ClientOptions = {},
): Layer.Layer<Email, ProviderConfigurationError> => Layer.effect(Email, make(client, options));
export const layer = (options: PostmarkConfig): Layer.Layer<Email, ProviderConfigurationError> =>
  Layer.effect(
    Email,
    Effect.gen(function* () {
      const timeout = yield* settings("postmark", options.serverToken, options.timeout);
      const client = new ServerClient(Redacted.value(options.serverToken), {
        timeout: Duration.toSeconds(timeout),
      });
      return yield* make(client, options);
    }),
  );
export const layerConfig = (
  config: Config.Config<PostmarkConfig> = Config.all({
    serverToken: Config.Redacted("POSTMARK_SERVER_TOKEN"),
  }),
): Layer.Layer<Email, Config.ConfigError | ProviderConfigurationError> =>
  Layer.unwrap(Effect.map(config, layer));
export { ProviderConfigurationError } from "#/providers/internal/Submission.js";
