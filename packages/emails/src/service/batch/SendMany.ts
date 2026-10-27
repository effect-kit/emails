import { Effect, Result, Schema } from "effect";

import type { SendReceipt } from "#/delivery/EmailReceipt.js";
import { BatchError } from "#/errors/BatchError.js";
import { EmailError, InvalidMessageError } from "#/errors/EmailError.js";
import { EmailMessage, SendOptions } from "#/message/EmailMessage.js";
import type { EmailService } from "#/service/Email.js";
import { invalidPaths, snapshotMessage } from "#/service/MessagePreparation.js";

const maximumRequests = 1_000;
const RequestList = Schema.Array(Schema.Unknown).check(Schema.isMaxLength(maximumRequests));

export const EmailRequest = Schema.Struct({
  message: EmailMessage,
  options: Schema.optionalKey(SendOptions),
});
export type EmailRequest = typeof EmailRequest.Type;

export const BatchOptions = Schema.Struct({
  concurrency: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: maximumRequests })),
  ),
});
export type BatchOptions = typeof BatchOptions.Type;
export type SendOutcome = Result.Result<SendReceipt, EmailError>;

/** The service is captured by Email.sendMany; adapters still implement only single sends. */
export const sendManyWith = Effect.fnUntraced(function* (
  email: EmailService,
  requests: ReadonlyArray<EmailRequest>,
  options: BatchOptions,
): Effect.fn.Return<ReadonlyArray<SendOutcome>, BatchError> {
  const configuration = Schema.decodeUnknownResult(BatchOptions)(options, {
    onExcessProperty: "error",
  });
  if (Result.isFailure(configuration)) return yield* new BatchError({ reason: "InvalidOptions" });
  if (!Schema.is(RequestList)(requests))
    return yield* new BatchError({ reason: "InvalidRequests" });

  // Snapshot all valid requests before any asynchronous work. Queueing must not change a logical
  // message, attachment bytes or its explicit key while earlier submissions are in flight.
  const prepared = Array.from(requests, (request): Result.Result<EmailRequest, EmailError> => {
    const decoded = Schema.decodeUnknownResult(EmailRequest)(request, {
      onExcessProperty: "error",
    });
    if (Result.isFailure(decoded)) {
      return Result.fail(
        new EmailError({
          provider: email.provider,
          operation: "send",
          acceptance: "notSubmitted",
          reason: new InvalidMessageError({ paths: invalidPaths(decoded.failure) }),
        }),
      );
    }

    return Result.succeed({
      message: snapshotMessage(decoded.success.message),
      ...(decoded.success.options === undefined ? {} : { options: { ...decoded.success.options } }),
    });
  });

  return yield* Effect.forEach(
    prepared,
    (request): Effect.Effect<SendOutcome> =>
      Result.isFailure(request)
        ? Effect.succeed(Result.fail(request.failure))
        : email.send(request.success.message, request.success.options).pipe(Effect.result),
    { concurrency: configuration.success.concurrency ?? 5 },
  );
});
