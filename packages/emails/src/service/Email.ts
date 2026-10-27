import { Context, Effect, Result, Schema } from "effect";

import { EmailCapabilities } from "#/delivery/EmailCapabilities.js";
import { ProviderName, SendReceipt } from "#/delivery/EmailReceipt.js";
import type { BatchError } from "#/errors/BatchError.js";
import {
  EmailError,
  InvalidMessageError,
  UnexpectedResponseError,
  UnsupportedFeatureError,
} from "#/errors/EmailError.js";
import { EmailMessage, SendOptions } from "#/message/EmailMessage.js";
import type { NormalizedEmailMessage } from "#/message/EmailMessage.js";
import { sendManyWith } from "#/service/batch/SendMany.js";
import type { BatchOptions, EmailRequest, SendOutcome } from "#/service/batch/SendMany.js";
import { invalidPaths, snapshotMessage, unsupportedFeature } from "#/service/MessagePreparation.js";

export interface EmailService {
  readonly provider: string;
  readonly capabilities: EmailCapabilities;
  readonly send: (
    message: EmailMessage,
    options?: SendOptions,
  ) => Effect.Effect<SendReceipt, EmailError>;
}

/** Capture infrastructure in the owning Layer; submission itself has no hidden requirements. */
export interface EmailAdapter {
  readonly provider: string;
  readonly capabilities: EmailCapabilities;
  readonly send: (
    message: NormalizedEmailMessage,
    options: SendOptions,
  ) => Effect.Effect<SendReceipt, EmailError>;
}

const decodeMessage = Schema.decodeUnknownEffect(EmailMessage);
const decodeOptions = Schema.decodeUnknownEffect(SendOptions);
const decodeReceipt = Schema.decodeUnknownEffect(SendReceipt);
const decodeConfiguration = Schema.decodeUnknownResult(
  Schema.Struct({ provider: ProviderName, capabilities: EmailCapabilities }),
);
const parseOptions = { onExcessProperty: "error", errors: "all" } as const;

export class Email extends Context.Service<Email, EmailService>()("@effect-kit/emails/Email") {
  /** Bounded independent sends; expected errors stay in ordered per-entry results. */
  static readonly sendMany = Effect.fnUntraced(function* (
    requests: ReadonlyArray<EmailRequest>,
    options: BatchOptions = {},
  ): Effect.fn.Return<ReadonlyArray<SendOutcome>, BatchError, Email> {
    const email = yield* Email;
    return yield* sendManyWith(email, requests, options);
  });

  /** Apply validation, capability enforcement and one submission span to a custom adapter. */
  static make(adapter: EmailAdapter): EmailService {
    const configuration = decodeConfiguration(
      { provider: adapter.provider, capabilities: adapter.capabilities },
      parseOptions,
    );
    if (Result.isFailure(configuration)) {
      throw new TypeError("Invalid email adapter provider or capabilities");
    }

    const { provider } = configuration.success;
    const capabilities = Object.freeze({
      ...configuration.success.capabilities,
      idempotency: Object.freeze({ ...configuration.success.capabilities.idempotency }),
    });
    const submit = adapter.send;
    const invalidMessage = (error: Schema.SchemaError) =>
      new EmailError({
        provider,
        operation: "send",
        acceptance: "notSubmitted",
        reason: new InvalidMessageError({ paths: invalidPaths(error) }),
      });
    const unexpectedResponse = () =>
      new EmailError({
        provider,
        operation: "send",
        acceptance: "unknown",
        reason: new UnexpectedResponseError(),
      });

    const send = Effect.fn("Email.send")(
      function* (
        message: EmailMessage,
        options: SendOptions = {},
      ): Effect.fn.Return<SendReceipt, EmailError> {
        yield* Effect.annotateCurrentSpan({
          "email.provider": provider,
          "email.operation": "send",
        });

        const decoded = yield* decodeMessage(message, parseOptions).pipe(
          Effect.mapError(invalidMessage),
        );
        const sendOptions = yield* decodeOptions(options, parseOptions).pipe(
          Effect.mapError(invalidMessage),
        );
        const prepared = snapshotMessage(decoded);
        const feature = unsupportedFeature(prepared, sendOptions, capabilities);
        if (feature !== undefined) {
          return yield* new EmailError({
            provider,
            operation: "send",
            acceptance: "notSubmitted",
            reason: new UnsupportedFeatureError({ feature }),
          });
        }

        const recipientCounts = {
          to: prepared.to.length,
          cc: prepared.cc?.length ?? 0,
          bcc: prepared.bcc?.length ?? 0,
        };
        yield* Effect.annotateCurrentSpan({
          "email.recipient_count": recipientCounts.to + recipientCounts.cc + recipientCounts.bcc,
          "email.attachment_count": prepared.attachments?.length ?? 0,
        });
        const response = yield* submit(prepared, sendOptions);
        const receipt = yield* decodeReceipt(response, parseOptions).pipe(
          Effect.mapError(unexpectedResponse),
        );

        if (
          receipt.provider !== provider ||
          receipt.recipients?.some(({ role, index }) => index >= recipientCounts[role])
        ) {
          return yield* unexpectedResponse();
        }

        yield* Effect.annotateCurrentSpan("email.outcome", receipt.status);
        return receipt;
      },
      Effect.tapError((error) =>
        Effect.annotateCurrentSpan({
          "email.outcome": "failed",
          "email.reason": error.reason._tag,
        }),
      ),
    );

    return Email.of(Object.freeze({ provider, capabilities, send }));
  }
}
