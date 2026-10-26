import { Array, Result, Schema } from "effect";

import { SubmissionReference } from "../../delivery/EmailReceipt.js";
import type { RecipientOutcome, SendReceipt } from "../../delivery/EmailReceipt.js";
import {
  EmailError,
  RecipientRejectedError,
  UnexpectedResponseError,
} from "../../errors/EmailError.js";
import type { NormalizedEmailMessage } from "../../message/EmailMessage.js";
import { Recipient, recipientKey, recipientPositions } from "./Recipients.js";

const Receipt = Schema.Struct({
  messageId: Schema.optionalKey(SubmissionReference.fields.value),
  accepted: Schema.Array(Recipient),
  rejected: Schema.Array(Recipient),
  rejectedErrors: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        recipient: Recipient,
        responseCode: Schema.Int.check(Schema.isBetween({ minimum: 400, maximum: 599 })),
      }),
    ),
  ),
});

export const unexpectedResponse = () =>
  new EmailError({
    provider: "nodemailer",
    operation: "send",
    acceptance: "unknown",
    reason: new UnexpectedResponseError(),
  });

export const fromNodemailerResponse = (
  response: unknown,
  message: NormalizedEmailMessage,
): Result.Result<SendReceipt, EmailError> => {
  const decoded = Schema.decodeUnknownResult(Receipt)(response);
  if (Result.isFailure(decoded)) return Result.fail(unexpectedResponse());
  const { messageId, accepted, rejected, rejectedErrors } = decoded.success;
  const accept = new Set(accepted.map(recipientKey));
  const reject = new Set(rejected.map(recipientKey));
  const positions = recipientPositions(message);
  const requested = new Set(positions.map(({ key }) => key));
  if (
    [...accept, ...reject].some((key) => !requested.has(key)) ||
    [...accept].some((key) => reject.has(key))
  ) {
    return Result.fail(unexpectedResponse());
  }
  const codes = new Map(
    rejectedErrors?.map(({ recipient, responseCode }) => [
      recipientKey(recipient),
      `SMTP_${responseCode}`,
    ]),
  );
  // oxlint-disable-next-line oxc/no-map-spread -- Outcomes are new immutable records, not mutable recipient inputs.
  const recipients: RecipientOutcome[] = positions.map(({ key, role, index }) => {
    const rejectionCode = reject.has(key) ? codes.get(key) : undefined;
    return {
      role,
      index,
      status: accept.has(key) ? "accepted" : reject.has(key) ? "rejected" : "unknown",
      ...(rejectionCode === undefined ? {} : { rejectionCode }),
    };
  });
  if (accept.size === 0) {
    if (reject.size === 0) return Result.fail(unexpectedResponse());
    return Result.fail(
      new EmailError({
        provider: "nodemailer",
        operation: "send",
        acceptance: recipients.every(({ status }) => status === "rejected")
          ? "rejected"
          : "unknown",
        reason: new RecipientRejectedError({
          recipients: recipients
            .filter(({ status }) => status === "rejected")
            .map(({ role, index }) => ({ role, index })),
        }),
      }),
    );
  }
  if (!Array.isReadonlyArrayNonEmpty(recipients)) return Result.fail(unexpectedResponse());
  return Result.succeed({
    provider: "nodemailer",
    status: reject.size > 0 ? "partiallyAccepted" : "accepted",
    recipients,
    references: messageId === undefined ? [] : [{ kind: "smtpMessageId", value: messageId }],
  });
};
