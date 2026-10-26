import { Config, Duration, Effect, Layer, Redacted, Result, Schema } from "effect";

import { createTransport } from "nodemailer";

import type { EmailCapabilities } from "#/delivery/EmailCapabilities.js";
import { EmailError, TimeoutError } from "#/errors/EmailError.js";
import { fromNodemailerFailure } from "#/providers/nodemailer/Failure.js";
import type { NodemailerMessage } from "#/providers/nodemailer/Message.js";
import { toNodemailerMessage } from "#/providers/nodemailer/Message.js";
import { fromNodemailerResponse } from "#/providers/nodemailer/Response.js";
import { Email } from "#/service/Email.js";

export interface NodemailerClient {
  sendMail(message: NodemailerMessage): Promise<unknown>;
  readonly options?: unknown;
}
export interface ClientOptions {
  readonly timeout?: Duration.Duration;
}
export interface SmtpTransportConfig {
  readonly host: string;
  readonly port?: number;
  readonly secure?: boolean;
  readonly requireTLS?: boolean;
  readonly auth?: { readonly user: string; readonly pass: Redacted.Redacted<string> };
  readonly pool?: boolean;
  readonly maxConnections?: number;
  readonly maxMessages?: number;
  readonly connectionTimeout?: Duration.Duration;
  readonly greetingTimeout?: Duration.Duration;
  readonly socketTimeout?: Duration.Duration;
}
export interface NodemailerConfig extends ClientOptions {
  readonly transport: SmtpTransportConfig;
}
export class NodemailerConfigurationError extends Schema.TaggedError<NodemailerConfigurationError>()(
  "NodemailerConfigurationError",
  {
    field: Schema.Literals(["transport", "timeout", "retries"]),
  },
) {}

const PositiveDuration = Schema.Duration.check(
  Schema.makeFilter((value) => Duration.isFinite(value) && Duration.toMillis(value) > 0),
);
const Transport = Schema.Struct({
  host: Schema.String.check(Schema.isPattern(/^[A-Za-z0-9._:-]+$/)),
  port: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65535 }))),
  secure: Schema.optionalKey(Schema.Boolean),
  requireTLS: Schema.optionalKey(Schema.Boolean),
  auth: Schema.optionalKey(
    Schema.Struct({ user: Schema.NonEmptyString, pass: Schema.Redacted(Schema.NonEmptyString) }),
  ),
  pool: Schema.optionalKey(Schema.Boolean),
  maxConnections: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThan(0))),
  maxMessages: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThan(0))),
  connectionTimeout: Schema.optionalKey(PositiveDuration),
  greetingTimeout: Schema.optionalKey(PositiveDuration),
  socketTimeout: Schema.optionalKey(PositiveDuration),
});
const PoolPolicy = Schema.Struct({
  pool: Schema.optionalKey(Schema.Boolean),
  maxRequeues: Schema.optionalKey(Schema.Number),
});
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
  idempotency: { mode: "unsupported" },
};

const make = Effect.fnUntraced(function* (client: NodemailerClient, options: ClientOptions) {
  const timeout = options.timeout ?? Duration.seconds(30);
  if (!Schema.is(PositiveDuration)(timeout))
    return yield* new NodemailerConfigurationError({ field: "timeout" });
  if (client.options !== undefined) {
    const policy = Schema.decodeUnknownResult(PoolPolicy)(client.options);
    if (
      Result.isFailure(policy) ||
      (policy.success.pool === true && policy.success.maxRequeues !== 0)
    ) {
      return yield* new NodemailerConfigurationError({ field: "retries" });
    }
  }
  return Email.make({
    provider: "nodemailer",
    capabilities: features,
    send: Effect.fnUntraced(function* (message) {
      const payload = toNodemailerMessage(message);
      const response = yield* Effect.tryPromise({
        try: () => client.sendMail(payload),
        catch: (cause) => fromNodemailerFailure(cause, message),
      }).pipe(
        Effect.timeout(timeout),
        Effect.catchTag("TimeoutError", () =>
          Effect.fail(
            new EmailError({
              provider: "nodemailer",
              operation: "send",
              acceptance: "unknown",
              reason: new TimeoutError(),
            }),
          ),
        ),
      );
      return yield* Effect.fromResult(fromNodemailerResponse(response, message));
    }),
  });
});

export const layerClient = (
  client: NodemailerClient,
  options: ClientOptions = {},
): Layer.Layer<Email, NodemailerConfigurationError> => Layer.effect(Email, make(client, options));

export const layer = (
  options: NodemailerConfig,
): Layer.Layer<Email, NodemailerConfigurationError> =>
  Layer.effect(
    Email,
    Effect.gen(function* () {
      const decoded = Schema.decodeUnknownResult(Transport)(options.transport, {
        onExcessProperty: "error",
      });
      if (Result.isFailure(decoded))
        return yield* new NodemailerConfigurationError({ field: "transport" });
      const { connectionTimeout, greetingTimeout, socketTimeout, auth, ...transportOptions } =
        decoded.success;
      const owned = yield* Effect.acquireRelease(
        Effect.sync(() => {
          const transporter = createTransport({
            ...transportOptions,
            maxRequeues: 0,
            connectionTimeout: Duration.toMillis(connectionTimeout ?? Duration.seconds(10)),
            greetingTimeout: Duration.toMillis(greetingTimeout ?? Duration.seconds(10)),
            socketTimeout: Duration.toMillis(socketTimeout ?? Duration.seconds(30)),
            ...(auth === undefined
              ? {}
              : { auth: { user: auth.user, pass: Redacted.value(auth.pass) } }),
            disableFileAccess: true,
            disableUrlAccess: true,
            logger: false,
            debug: false,
          });
          const pending = new Set<Promise<unknown>>();
          const client: NodemailerClient = {
            sendMail: (message) => {
              const submitted = transporter.sendMail(message);
              pending.add(submitted);
              void submitted.then(
                () => pending.delete(submitted),
                () => pending.delete(submitted),
              );
              return submitted;
            },
          };
          return { client, transporter, pending };
        }),
        (resource) =>
          Effect.promise(async () => {
            resource.transporter.close();
            // Nodemailer cannot cancel one SMTP send. Drain owned in-flight operations before releasing scope.
            await Promise.allSettled(resource.pending);
          }),
      );
      return yield* make(owned.client, options);
    }),
  );

export const layerConfig = (
  config: Config.Config<NodemailerConfig> = Config.all({
    transport: Config.all({
      host: Config.String("SMTP_HOST"),
      port: Config.Int("SMTP_PORT").pipe(Config.withDefault(587)),
      secure: Config.Boolean("SMTP_SECURE").pipe(Config.withDefault(false)),
      auth: Config.all({
        user: Config.String("SMTP_USER"),
        pass: Config.Redacted("SMTP_PASSWORD"),
      }),
    }),
  }),
): Layer.Layer<Email, Config.ConfigError | NodemailerConfigurationError> =>
  Layer.unwrap(Effect.map(config, layer));
