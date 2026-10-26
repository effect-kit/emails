import { Config, type Duration, Effect, Layer, Redacted, Result, Schema } from "effect";

import { EmailParams, MailerSend, Recipient, Sender } from "mailersend";

import type { RecipientOutcome, SendReceipt } from "#/delivery/EmailReceipt.js";
import { InvalidMessageError, MessageRejectedError } from "#/errors/EmailError.js";
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

export interface MailerSendClient {
  email: { send(message: unknown): Promise<unknown> };
}
export interface ClientOptions {
  readonly timeout?: Duration.Duration;
}
export interface MailerSendConfig extends ClientOptions {
  readonly apiKey: Redacted.Redacted<string>;
}
const payload = (message: NormalizedEmailMessage) => {
  const params = new EmailParams()
    .setFrom(new Sender(message.from.email, message.from.name))
    .setTo(message.to.map((address) => new Recipient(address.email, address.name)))
    .setSubject(message.subject);
  if (message.text !== undefined) params.setText(message.text);
  if (message.html !== undefined) params.setHtml(message.html);
  if (message.cc !== undefined)
    params.setCc(message.cc.map((address) => new Recipient(address.email, address.name)));
  if (message.bcc !== undefined)
    params.setBcc(message.bcc.map((address) => new Recipient(address.email, address.name)));
  const reply = message.replyTo?.[0];
  if (reply !== undefined) params.setReplyTo(new Recipient(reply.email, reply.name));
  if (message.headers !== undefined)
    params.setHeaders(Object.entries(message.headers).map(([name, value]) => ({ name, value })));
  return params;
};
const Response = Schema.Struct({
  statusCode: Schema.Number,
  headers: Schema.Unknown,
  body: Schema.optionalKey(Schema.Unknown),
});
const Warnings = Schema.Struct({
  warnings: Schema.Array(
    Schema.Struct({
      type: Schema.String,
      recipients: Schema.optionalKey(Schema.Array(Schema.Struct({ email: Schema.String }))),
    }),
  ),
});
const make = Effect.fnUntraced(function* (client: MailerSendClient, options: ClientOptions) {
  const timeout = yield* settings("mailersend", undefined, options.timeout);
  return Email.make({
    provider: "mailersend",
    capabilities: {
      ...standardCapabilities,
      replyTo: "single",
      attachments: false,
      inlineAttachments: false,
    },
    send: Effect.fnUntraced(function* (message) {
      if (Object.keys(message.headers ?? {}).some((name) => !/^[A-Za-z0-9-]+$/.test(name)))
        return yield* providerFailure("mailersend", {
          reason: new InvalidMessageError({ paths: [["headers"]] }),
          acceptance: "notSubmitted",
        });
      const request = payload(message);
      const response = yield* submission(
        "mailersend",
        timeout,
        () => client.email.send(request),
        (cause) => httpFailure("mailersend", cause),
      );
      const decoded = Schema.decodeUnknownResult(Response)(response);
      if (Result.isFailure(decoded) || decoded.success.statusCode !== 202)
        return yield* unexpectedResponse("mailersend");
      const warnings = Schema.decodeUnknownResult(Warnings)(decoded.success.body);
      if (
        Result.isSuccess(warnings) &&
        warnings.success.warnings.some((warning) => warning.type === "ALL_SUPPRESSED")
      )
        return yield* providerFailure("mailersend", {
          reason: new MessageRejectedError(),
          acceptance: "rejected",
        });
      const receipt = yield* Effect.fromResult(
        accepted("mailersend", [header(decoded.success.headers, "x-message-id")]),
      );
      if (
        decoded.success.body === undefined ||
        decoded.success.body === null ||
        decoded.success.body === ""
      )
        return receipt;
      if (Result.isFailure(warnings) || warnings.success.warnings.length === 0)
        return yield* unexpectedResponse("mailersend", receipt.references);
      if (
        warnings.success.warnings.some(
          (warning) => warning.type !== "SOME_SUPPRESSED" || warning.recipients === undefined,
        )
      )
        return yield* unexpectedResponse("mailersend", receipt.references);
      const suppressed = warnings.success.warnings
        .flatMap((warning) => warning.recipients ?? [])
        .map((recipient) => recipient.email);
      const positions = (["to", "cc", "bcc"] as const).flatMap((role) =>
        (message[role] ?? []).map((address, index) => ({ role, index, email: address.email })),
      );
      if (
        suppressed.length === 0 ||
        suppressed.some(
          (address) => positions.filter((position) => position.email === address).length !== 1,
        )
      )
        return yield* unexpectedResponse("mailersend", receipt.references);
      const recipients: RecipientOutcome[] = positions.map(({ role, index, email }) => ({
        role,
        index,
        status: suppressed.includes(email) ? "rejected" : "accepted",
      }));
      if (!recipients.some((recipient) => recipient.status === "accepted"))
        return yield* providerFailure("mailersend", {
          reason: new MessageRejectedError(),
          acceptance: "rejected",
          references: receipt.references,
        });
      const [first, ...rest] = recipients;
      if (first === undefined) return yield* unexpectedResponse("mailersend", receipt.references);
      return {
        ...receipt,
        status: "partiallyAccepted",
        recipients: [first, ...rest],
      } satisfies SendReceipt;
    }),
  });
});
export const layerClient = (
  client: MailerSendClient,
  options: ClientOptions = {},
): Layer.Layer<Email, ProviderConfigurationError> => Layer.effect(Email, make(client, options));
export const layer = (options: MailerSendConfig): Layer.Layer<Email, ProviderConfigurationError> =>
  Layer.effect(
    Email,
    Effect.gen(function* () {
      yield* settings("mailersend", options.apiKey, options.timeout);
      return yield* make(new MailerSend({ apiKey: Redacted.value(options.apiKey) }), options);
    }),
  );
export const layerConfig = (
  config: Config.Config<MailerSendConfig> = Config.all({
    apiKey: Config.Redacted("MAILERSEND_API_KEY"),
  }),
): Layer.Layer<Email, Config.ConfigError | ProviderConfigurationError> =>
  Layer.unwrap(Effect.map(config, layer));
export { ProviderConfigurationError } from "#/providers/internal/Submission.js";
