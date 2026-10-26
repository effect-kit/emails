import { Config, type Duration, Effect, Layer, Redacted, Result, Schema } from "effect";
import { Base64 } from "effect/encoding";

import {
  SendMailClient,
  AuthenticationError as NativeAuth,
  NetworkError,
  TimeoutError as NativeTimeout,
  ApiError,
  ValidationError,
} from "zeptomail";

import {
  AuthenticationError,
  InvalidMessageError,
  TimeoutError,
  TransportError,
} from "#/errors/EmailError.js";
import type { Mailbox, NormalizedEmailMessage } from "#/message/EmailMessage.js";
import { standardCapabilities } from "#/providers/internal/Capabilities.js";
import { providerFailure, unexpectedResponse } from "#/providers/internal/Failures.js";
import { accepted } from "#/providers/internal/Receipts.js";
import {
  httpFailure,
  ProviderConfigurationError,
  settings,
  submission,
} from "#/providers/internal/Submission.js";
import { Email } from "#/service/Email.js";

export interface ZeptoMailClient {
  sendMail(message: unknown): Promise<unknown>;
}
export interface ClientOptions {
  readonly timeout?: Duration.Duration;
}
export interface ZeptoMailConfig extends ClientOptions {
  readonly token: Redacted.Redacted<string>;
  readonly url: URL;
}
const address = (mailbox: Mailbox) => ({ address: mailbox.email, name: mailbox.name ?? "" });
const payload = (message: NormalizedEmailMessage) => ({
  from: address(message.from),
  to: message.to.map((mailbox) => ({ email_address: address(mailbox) })),
  subject: message.subject,
  ...(message.text === undefined ? {} : { textbody: message.text }),
  ...(message.html === undefined ? {} : { htmlbody: message.html }),
  ...(message.cc === undefined
    ? {}
    : { cc: message.cc.map((mailbox) => ({ email_address: address(mailbox) })) }),
  ...(message.bcc === undefined
    ? {}
    : { bcc: message.bcc.map((mailbox) => ({ email_address: address(mailbox) })) }),
  ...(message.replyTo === undefined ? {} : { reply_to: message.replyTo.map(address) }),
  ...(message.headers === undefined ? {} : { mime_headers: { ...message.headers } }),
  attachments: message.attachments
    ?.filter((attachment) => attachment.contentId === undefined)
    .map((attachment) => ({
      name: attachment.filename,
      mime_type: attachment.contentType,
      content: Base64.encode(attachment.content),
    })),
  inline_images: message.attachments
    ?.filter((attachment) => attachment.contentId !== undefined)
    .map((attachment) => ({
      name: attachment.filename,
      mime_type: attachment.contentType,
      content: Base64.encode(attachment.content),
      cid: attachment.contentId,
    })),
});
const Response = Schema.Struct({
  data: Schema.NonEmptyArray(Schema.Struct({ code: Schema.Literal("EM_104") })),
  request_id: Schema.String,
});
const ApiFailure = Schema.Struct({ error: Schema.Struct({ code: Schema.String }) });
const CpaasFailure = Schema.Struct({ data: Schema.Struct({ error_code: Schema.String }) });
const FetchFailure = Schema.Struct({ name: Schema.Literal("FetchError") });
const failure = (cause: unknown) => {
  // Both network/timeout classes inherit AuthenticationError in the published SDK.
  if (cause instanceof NetworkError)
    return providerFailure("zeptomail", { reason: new TransportError() });
  if (cause instanceof NativeTimeout)
    return providerFailure("zeptomail", { reason: new TimeoutError() });
  if (cause instanceof NativeAuth)
    return providerFailure("zeptomail", {
      reason: new AuthenticationError(),
      code: cause.code,
      acceptance: "rejected",
    });
  if (cause instanceof ValidationError)
    return providerFailure("zeptomail", {
      reason: new InvalidMessageError({ paths: [] }),
      acceptance: "notSubmitted",
    });
  if (cause instanceof ApiError) return providerFailure("zeptomail", { status: cause.statusCode });
  const decoded = Schema.decodeUnknownResult(ApiFailure)(cause);
  const cpaas = Schema.decodeUnknownResult(CpaasFailure)(cause);
  const code = Result.isSuccess(decoded)
    ? decoded.success.error.code
    : Result.isSuccess(cpaas)
      ? cpaas.success.data.error_code
      : undefined;
  if (code !== undefined)
    return providerFailure("zeptomail", {
      code,
      acceptance: "rejected",
      ...(code === "TM_3004" ? { reason: new InvalidMessageError({ paths: [] }) } : {}),
    });
  if (cause instanceof SyntaxError) return unexpectedResponse("zeptomail");
  if (Schema.is(FetchFailure)(cause))
    return providerFailure("zeptomail", { reason: new TransportError() });
  // SendMailClient locally rejects validation as a string, without a public error class.
  if (typeof cause === "string")
    return providerFailure("zeptomail", {
      reason: new InvalidMessageError({ paths: [] }),
      acceptance: "notSubmitted",
    });
  return httpFailure("zeptomail", cause);
};
const make = Effect.fnUntraced(function* (client: ZeptoMailClient, options: ClientOptions) {
  const timeout = yield* settings("zeptomail", undefined, options.timeout);
  return Email.make({
    provider: "zeptomail",
    capabilities: standardCapabilities,
    send: Effect.fnUntraced(function* (message) {
      const request = payload(message);
      const response = yield* submission(
        "zeptomail",
        timeout,
        () => client.sendMail(request),
        failure,
      );
      const decoded = Schema.decodeUnknownResult(Response)(response);
      if (Result.isFailure(decoded)) return yield* unexpectedResponse("zeptomail");
      return yield* Effect.fromResult(
        accepted("zeptomail", [], { requestId: decoded.success.request_id }),
      );
    }),
  });
});
export const layerClient = (
  client: ZeptoMailClient,
  options: ClientOptions = {},
): Layer.Layer<Email, ProviderConfigurationError> => Layer.effect(Email, make(client, options));
export const layer = (options: ZeptoMailConfig): Layer.Layer<Email, ProviderConfigurationError> =>
  Layer.effect(
    Email,
    Effect.gen(function* () {
      yield* settings("zeptomail", options.token, options.timeout);
      if (
        !["http:", "https:"].includes(options.url.protocol) ||
        options.url.username ||
        options.url.password ||
        options.url.search ||
        options.url.hash ||
        options.url.pathname !== "/v1.1/email"
      )
        return yield* new ProviderConfigurationError({ provider: "zeptomail", field: "url" });
      return yield* make(
        new SendMailClient(
          {
            token: `Zoho-enczapikey ${Redacted.value(options.token)}`,
            url: options.url.href,
            debug: false,
          },
          { useHttps: false },
        ),
        options,
      );
    }),
  );
export const layerConfig = (
  config: Config.Config<ZeptoMailConfig> = Config.all({
    token: Config.Redacted("ZEPTOMAIL_TOKEN"),
    url: Config.URL("ZEPTOMAIL_URL"),
  }),
): Layer.Layer<Email, Config.ConfigError | ProviderConfigurationError> =>
  Layer.unwrap(Effect.map(config, layer));
export { ProviderConfigurationError } from "#/providers/internal/Submission.js";
