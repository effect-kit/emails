import { Config, type Duration, Effect, Layer, Redacted, Result, Schema } from "effect";

import plunk from "@plunk/node";
import { NotFoundError } from "@plunk/node/dist/errors/NotFound.js";
import { TokenError } from "@plunk/node/dist/errors/TokenError.js";

import {
  AuthenticationError,
  InvalidMessageError,
  MessageRejectedError,
  ProviderError,
} from "#/errors/EmailError.js";
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

export interface PlunkClient {
  emails: {
    send(message: {
      to: string;
      from: string;
      name?: string;
      subject: string;
      body: string;
    }): Promise<unknown>;
  };
}
export interface ClientOptions {
  readonly timeout?: Duration.Duration;
}
export interface PlunkConfig extends ClientOptions {
  readonly apiKey: Redacted.Redacted<string>;
  readonly baseUrl?: URL;
}
// The CJS entry wraps its constructor in .default; declarations expose a default class.
const NativeClient =
  typeof plunk === "function" ? plunk : (plunk as unknown as { default: typeof plunk }).default;
const Response = Schema.Struct({
  success: Schema.Literal(true),
  data: Schema.Struct({
    emails: Schema.Array(
      Schema.Struct({ email: Schema.optionalKey(Schema.String), status: Schema.String }),
    ),
  }),
});
const failure = (cause: unknown) => {
  if (cause instanceof TokenError)
    return providerFailure("plunk", {
      reason: new AuthenticationError(),
      status: 401,
      acceptance: "rejected",
    });
  if (cause instanceof NotFoundError) return providerFailure("plunk", { status: 404 });
  if (cause instanceof Error && cause.constructor === Error)
    return providerFailure("plunk", { reason: new ProviderError() });
  return httpFailure("plunk", cause);
};
const make = Effect.fnUntraced(function* (client: PlunkClient, options: ClientOptions) {
  const timeout = yield* settings("plunk", undefined, options.timeout);
  return Email.make({
    provider: "plunk",
    capabilities: {
      ...standardCapabilities,
      text: false,
      htmlAndText: false,
      cc: false,
      bcc: false,
      replyTo: "none",
      headers: false,
      attachments: false,
      inlineAttachments: false,
    },
    send: Effect.fnUntraced(function* (message) {
      const recipient = message.to[0];
      if (
        message.to.length !== 1 ||
        recipient === undefined ||
        recipient.name !== undefined ||
        message.html === undefined
      )
        return yield* providerFailure("plunk", {
          reason: new InvalidMessageError({ paths: [["to"]] }),
          acceptance: "notSubmitted",
        });
      // Do not pass subscribed, data, events or arrays: the current API upserts each contact separately.
      const response = yield* submission(
        "plunk",
        timeout,
        () =>
          client.emails.send({
            from: message.from.email,
            ...(message.from.name === undefined ? {} : { name: message.from.name }),
            to: recipient.email,
            subject: message.subject,
            body: message.html ?? "",
          }),
        failure,
      );
      const decoded = Schema.decodeUnknownResult(Response)(response);
      if (Result.isFailure(decoded) || decoded.success.data.emails.length !== 1)
        return yield* unexpectedResponse("plunk");
      const outcome = decoded.success.data.emails[0];
      if (outcome?.status === "throttled" || outcome?.status === "skipped")
        return yield* providerFailure("plunk", {
          reason: new MessageRejectedError(),
          acceptance: "rejected",
        });
      if (outcome?.status !== "queued") return yield* unexpectedResponse("plunk");
      return yield* Effect.fromResult(accepted("plunk", [outcome.email]));
    }),
  });
});
export const layerClient = (
  client: PlunkClient,
  options: ClientOptions = {},
): Layer.Layer<Email, ProviderConfigurationError> => Layer.effect(Email, make(client, options));
export const layer = (options: PlunkConfig): Layer.Layer<Email, ProviderConfigurationError> =>
  Layer.effect(
    Email,
    Effect.gen(function* () {
      yield* settings("plunk", options.apiKey, options.timeout);
      if (!Redacted.value(options.apiKey).startsWith("sk_"))
        return yield* new ProviderConfigurationError({ provider: "plunk", field: "apiKey" });
      const url = options.baseUrl ?? new URL("https://next-api.useplunk.com/v1/");
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        !url.pathname.endsWith("/")
      )
        return yield* new ProviderConfigurationError({ provider: "plunk", field: "baseUrl" });
      return yield* make(
        new NativeClient(Redacted.value(options.apiKey), { baseUrl: url.href }),
        options,
      );
    }),
  );
export const layerConfig = (
  config: Config.Config<PlunkConfig> = Config.all({ apiKey: Config.Redacted("PLUNK_API_KEY") }),
): Layer.Layer<Email, Config.ConfigError | ProviderConfigurationError> =>
  Layer.unwrap(Effect.map(config, layer));
export { ProviderConfigurationError } from "#/providers/internal/Submission.js";
