import { Config, Duration, Effect, Layer, Redacted, Result, Schema } from "effect";

import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

import { standardCapabilities } from "#/providers/internal/Capabilities.js";
import { PositiveDuration } from "#/providers/internal/Configuration.js";
import { timedOut, unexpectedResponse } from "#/providers/internal/Failures.js";
import { accepted } from "#/providers/internal/Receipts.js";
import { fromSesFailure } from "#/providers/ses/Failure.js";
import { toSesMessage } from "#/providers/ses/Message.js";
import { Email } from "#/service/Email.js";

export interface SesClient {
  send(
    command: { readonly input: unknown },
    options?: { abortSignal?: AbortSignal },
  ): Promise<unknown>;
}
export interface ClientOptions {
  readonly timeout?: Duration.Duration;
  readonly configurationSetName?: string;
}
export interface AwsCredentials {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly sessionToken?: string;
}
export interface SesConfig extends ClientOptions {
  readonly region: string;
  readonly credentials?:
    | (() => Promise<AwsCredentials>)
    | {
        readonly accessKeyId: string;
        readonly secretAccessKey: Redacted.Redacted<string>;
        readonly sessionToken?: Redacted.Redacted<string>;
      };
  readonly endpoint?: URL;
}
export class SesConfigurationError extends Schema.TaggedError<SesConfigurationError>()(
  "SesConfigurationError",
  { field: Schema.Literals(["region", "timeout", "endpoint", "configurationSetName"]) },
) {}
const Response = Schema.Struct({
  MessageId: Schema.String,
  $metadata: Schema.optionalKey(Schema.Struct({ requestId: Schema.optionalKey(Schema.String) })),
});

const make = Effect.fnUntraced(function* (client: SesClient, options: ClientOptions) {
  const timeout = options.timeout ?? Duration.seconds(30);
  if (!Schema.is(PositiveDuration)(timeout))
    return yield* new SesConfigurationError({ field: "timeout" });
  if (
    options.configurationSetName !== undefined &&
    !/^[A-Za-z0-9_-]{1,64}$/.test(options.configurationSetName)
  )
    return yield* new SesConfigurationError({ field: "configurationSetName" });
  return Email.make({
    provider: "ses",
    capabilities: standardCapabilities,
    send: Effect.fnUntraced(function* (message) {
      const command = new SendEmailCommand(toSesMessage(message, options.configurationSetName));
      const response = yield* Effect.tryPromise({
        try: (abortSignal) => client.send(command, { abortSignal }),
        catch: fromSesFailure,
      }).pipe(
        Effect.timeout(timeout),
        Effect.catchTag("TimeoutError", () => Effect.fail(timedOut("ses"))),
      );
      const decoded = Schema.decodeUnknownResult(Response)(response);
      if (Result.isFailure(decoded)) return yield* unexpectedResponse("ses");
      return yield* Effect.fromResult(
        accepted("ses", [decoded.success.MessageId], {
          requestId: decoded.success.$metadata?.requestId,
        }),
      );
    }),
  });
});
export const layerClient = (
  client: SesClient,
  options: ClientOptions = {},
): Layer.Layer<Email, SesConfigurationError> => Layer.effect(Email, make(client, options));
export const layer = (options: SesConfig): Layer.Layer<Email, SesConfigurationError> =>
  Layer.effect(
    Email,
    Effect.gen(function* () {
      if (!/^[a-z0-9-]+$/.test(options.region))
        return yield* new SesConfigurationError({ field: "region" });
      if (
        options.endpoint !== undefined &&
        (!["http:", "https:"].includes(options.endpoint.protocol) ||
          options.endpoint.username ||
          options.endpoint.password)
      )
        return yield* new SesConfigurationError({ field: "endpoint" });
      const credentials =
        typeof options.credentials === "function" || options.credentials === undefined
          ? options.credentials
          : {
              accessKeyId: options.credentials.accessKeyId,
              secretAccessKey: Redacted.value(options.credentials.secretAccessKey),
              ...(options.credentials.sessionToken === undefined
                ? {}
                : { sessionToken: Redacted.value(options.credentials.sessionToken) }),
            };
      const client = yield* Effect.acquireRelease(
        Effect.sync(
          () =>
            new SESv2Client({
              region: options.region,
              maxAttempts: 1,
              ...(credentials === undefined ? {} : { credentials }),
              ...(options.endpoint === undefined ? {} : { endpoint: options.endpoint.href }),
            }),
        ),
        (resource) => Effect.sync(() => resource.destroy()),
      );
      return yield* make(client, options);
    }),
  );
export const layerConfig = (
  config: Config.Config<SesConfig> = Config.all({ region: Config.String("AWS_REGION") }),
): Layer.Layer<Email, Config.ConfigError | SesConfigurationError> =>
  Layer.unwrap(Effect.map(config, layer));
