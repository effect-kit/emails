import { Config, Duration, Effect, Layer, Redacted, Result, Schema } from "effect";

import { EmailClient } from "@azure/communication-email";

import { SubmissionReference } from "#/delivery/EmailReceipt.js";
import { MessageRejectedError, TransportError } from "#/errors/EmailError.js";
import { toAzureMessage } from "#/providers/azure/Message.js";
import type { AzureMessage } from "#/providers/azure/Message.js";
import { standardCapabilities } from "#/providers/internal/Capabilities.js";
import { PositiveDuration } from "#/providers/internal/Configuration.js";
import { providerFailure, timedOut, unexpectedResponse } from "#/providers/internal/Failures.js";
import { accepted } from "#/providers/internal/Receipts.js";
import { Email } from "#/service/Email.js";

export interface AzurePoller {
  pollUntilDone(options?: { abortSignal?: AbortSignal }): Promise<unknown>;
  stopPolling(): void;
  getResult(): unknown;
}
export interface AzureClient {
  beginSend(
    message: AzureMessage,
    options?: {
      abortSignal?: AbortSignal;
      updateIntervalInMs?: number;
      onResponse?: (response: unknown) => void;
    },
  ): Promise<AzurePoller>;
}
export interface ClientOptions {
  readonly timeout?: Duration.Duration;
  readonly pollInterval?: Duration.Duration;
}
export interface AzureConfig extends ClientOptions {
  readonly connectionString: Redacted.Redacted<string>;
}
export class AzureConfigurationError extends Schema.TaggedError<AzureConfigurationError>()(
  "AzureConfigurationError",
  { field: Schema.Literals(["connectionString", "timeout", "pollInterval"]) },
) {}

const Operation = Schema.Struct({ id: SubmissionReference.fields.value, status: Schema.String });
const Observation = Schema.Struct({ parsedBody: Schema.Unknown });
const Failure = Schema.Struct({
  name: Schema.optionalKey(Schema.String),
  code: Schema.optionalKey(Schema.String),
  statusCode: Schema.optionalKey(Schema.Number),
});

const make = Effect.fnUntraced(function* (client: AzureClient, options: ClientOptions) {
  const timeout = options.timeout ?? Duration.seconds(60);
  const pollInterval = options.pollInterval ?? Duration.seconds(1);
  if (!Schema.is(PositiveDuration)(timeout))
    return yield* new AzureConfigurationError({ field: "timeout" });
  if (!Schema.is(PositiveDuration)(pollInterval))
    return yield* new AzureConfigurationError({ field: "pollInterval" });
  return Email.make({
    provider: "azure",
    capabilities: { ...standardCapabilities, senderName: false },
    send: Effect.fnUntraced(function* (message) {
      const payload = toAzureMessage(message);
      let operationId: string | undefined;
      let observedStatus: string | undefined;
      let identityChanged = false;
      const references = (): SubmissionReference[] =>
        operationId === undefined ? [] : [{ kind: "operationId", value: operationId }];
      const observe = (raw: unknown) => {
        const observation = Schema.decodeUnknownResult(Observation)(raw);
        if (Result.isFailure(observation)) return;
        const state = Schema.decodeUnknownResult(Operation)(observation.success.parsedBody);
        if (Result.isSuccess(state)) {
          if (operationId !== undefined && operationId !== state.success.id) {
            identityChanged = true;
            return;
          }
          operationId ??= state.success.id;
          observedStatus = state.success.status;
        }
      };
      const result = yield* Effect.tryPromise({
        try: async (abortSignal) => {
          const poller = await client.beginSend(payload, {
            abortSignal,
            updateIntervalInMs: Duration.toMillis(pollInterval),
            onResponse: observe,
          });
          const stop = () => poller.stopPolling();
          abortSignal.addEventListener("abort", stop, { once: true });
          try {
            const initial = Schema.decodeUnknownResult(Operation)(poller.getResult());
            if (Result.isSuccess(initial)) {
              if (operationId !== undefined && operationId !== initial.success.id) {
                identityChanged = true;
                return initial.success;
              }
              operationId ??= initial.success.id;
            }
            try {
              return await poller.pollUntilDone({ abortSignal });
            } catch (cause) {
              const terminal = Schema.decodeUnknownResult(Operation)(poller.getResult());
              if (
                Result.isSuccess(terminal) &&
                ["Failed", "Canceled"].includes(terminal.success.status)
              )
                return terminal.success;
              throw cause;
            }
          } finally {
            abortSignal.removeEventListener("abort", stop);
            poller.stopPolling();
          }
        },
        catch: (cause) => {
          if (identityChanged) return unexpectedResponse("azure", references());
          if (observedStatus === "Failed" || observedStatus === "Canceled")
            return providerFailure("azure", {
              reason: new MessageRejectedError(),
              acceptance: "rejected",
              references: references(),
            });
          const decoded = Schema.decodeUnknownResult(Failure)(cause);
          if (
            Result.isSuccess(decoded) &&
            (decoded.success.code !== undefined ||
              decoded.success.statusCode !== undefined ||
              decoded.success.name === "RestError")
          ) {
            return providerFailure("azure", {
              code: decoded.success.code,
              status: decoded.success.statusCode,
              references: references(),
              ...(operationId === undefined ? {} : { acceptance: "unknown" }),
            });
          }
          if (cause instanceof TypeError || cause instanceof DOMException)
            return providerFailure("azure", {
              reason: new TransportError(),
              references: references(),
            });
          throw cause;
        },
      }).pipe(
        Effect.timeout(timeout),
        Effect.catchTag("TimeoutError", () => Effect.fail(timedOut("azure", references()))),
      );
      const state = Schema.decodeUnknownResult(Operation)(result);
      if (Result.isFailure(state)) return yield* unexpectedResponse("azure", references());
      if (identityChanged || (operationId !== undefined && operationId !== state.success.id))
        return yield* unexpectedResponse("azure", references());
      operationId ??= state.success.id;
      if (["Failed", "Canceled"].includes(state.success.status))
        return yield* providerFailure("azure", {
          reason: new MessageRejectedError(),
          acceptance: "rejected",
          references: references(),
        });
      if (state.success.status !== "Succeeded")
        return yield* unexpectedResponse("azure", references());
      return yield* Effect.fromResult(
        accepted("azure", [state.success.id], { kind: "operationId" }),
      );
    }),
  });
});
export const layerClient = (
  client: AzureClient,
  options: ClientOptions = {},
): Layer.Layer<Email, AzureConfigurationError> => Layer.effect(Email, make(client, options));
export const layer = (options: AzureConfig): Layer.Layer<Email, AzureConfigurationError> =>
  Layer.effect(
    Email,
    Effect.gen(function* () {
      const client = yield* Effect.try({
        try: () =>
          new EmailClient(Redacted.value(options.connectionString), {
            retryOptions: { maxRetries: 0 },
          }),
        catch: () => new AzureConfigurationError({ field: "connectionString" }),
      });
      return yield* make(client, options);
    }),
  );
export const layerConfig = (
  config: Config.Config<AzureConfig> = Config.all({
    connectionString: Config.Redacted("AZURE_EMAIL_CONNECTION_STRING"),
  }),
): Layer.Layer<Email, Config.ConfigError | AzureConfigurationError> =>
  Layer.unwrap(Effect.map(config, layer));
