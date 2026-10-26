import { Config, Duration, Effect, Layer, Redacted, Schema } from "effect";

import { Resend as ResendSdk } from "resend";

import type { EmailCapabilities } from "#/delivery/EmailCapabilities.js";
import { EmailError, InvalidMessageError } from "#/errors/EmailError.js";
import type { ResendMessage } from "#/providers/resend/Message.js";
import { toResendMessage } from "#/providers/resend/Message.js";
import { fromResendResponse, timeoutError, transportError } from "#/providers/resend/Response.js";
import { Email } from "#/service/Email.js";

/** Structural SDK boundary keeps React and Node declarations out of the public adapter API. */
export interface ResendClient {
  readonly emails: {
    send(
      message: ResendMessage,
      options?: { signal?: AbortSignal; idempotencyKey?: string },
    ): Promise<unknown>;
  };
}
export interface ClientOptions {
  readonly timeout?: Duration.Duration;
}
export interface ResendConfig extends ClientOptions {
  readonly apiKey: Redacted.Redacted<string>;
  readonly baseUrl?: URL;
}
export class ResendConfigurationError extends Schema.TaggedError<ResendConfigurationError>()(
  "ResendConfigurationError",
  {
    field: Schema.Literals(["apiKey", "baseUrl", "timeout"]),
  },
) {}

const features: EmailCapabilities = {
  text: true,
  html: true,
  htmlAndText: true,
  senderName: true,
  cc: true,
  bcc: true,
  replyTo: "multiple",
  headers: true,
  attachments: true,
  inlineAttachments: true,
  idempotency: { mode: "replay", retention: Duration.hours(24) },
};
const PositiveDuration = Schema.Duration.check(
  Schema.makeFilter((value) => Duration.isFinite(value) && Duration.toMillis(value) > 0),
);

const make = Effect.fnUntraced(function* (client: ResendClient, options: ClientOptions) {
  const timeout = options.timeout ?? Duration.seconds(30);
  if (!Schema.is(PositiveDuration)(timeout))
    return yield* new ResendConfigurationError({ field: "timeout" });
  return Email.make({
    provider: "resend",
    capabilities: features,
    send: Effect.fnUntraced(function* (message, sendOptions) {
      if ((sendOptions.idempotencyKey?.length ?? 0) > 256) {
        return yield* new EmailError({
          provider: "resend",
          operation: "send",
          acceptance: "notSubmitted",
          reason: new InvalidMessageError({ paths: [["idempotencyKey"]] }),
        });
      }
      const payload = toResendMessage(message);
      const response = yield* Effect.tryPromise({
        try: (signal) => client.emails.send(payload, { ...sendOptions, signal }),
        catch: transportError,
      }).pipe(
        Effect.timeout(timeout),
        Effect.catchTag("TimeoutError", () => Effect.fail(timeoutError())),
      );
      return yield* Effect.fromResult(fromResendResponse(response));
    }),
  });
});

export const layerClient = (
  client: ResendClient,
  options: ClientOptions = {},
): Layer.Layer<Email, ResendConfigurationError> => Layer.effect(Email, make(client, options));

export const layer = (options: ResendConfig): Layer.Layer<Email, ResendConfigurationError> =>
  Layer.effect(
    Email,
    Effect.gen(function* () {
      const key = Redacted.value(options.apiKey);
      if (!/^[!-~]+$/.test(key)) return yield* new ResendConfigurationError({ field: "apiKey" });
      const url = options.baseUrl ?? new URL("https://api.resend.com");
      if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) {
        return yield* new ResendConfigurationError({ field: "baseUrl" });
      }
      const client = new ResendSdk(key, {
        baseUrl: url.href.replace(/\/$/, ""),
        userAgent: "effect-kit-emails",
      });
      // SDK 6.34.1 logs raw API errors outside production. Only our owned instance is modified.
      Object.defineProperty(client, "logError", { value: () => undefined });
      return yield* make(client, options);
    }),
  );

export const layerConfig = (
  config: Config.Config<ResendConfig> = Config.all({ apiKey: Config.Redacted("RESEND_API_KEY") }),
): Layer.Layer<Email, Config.ConfigError | ResendConfigurationError> =>
  Layer.unwrap(Effect.map(config, layer));
