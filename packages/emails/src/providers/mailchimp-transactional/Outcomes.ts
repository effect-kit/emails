// oxlint-disable no-underscore-dangle -- The provider uses _id as its documented response field.
import { Result, Schema } from "effect";

import { ProviderCode, SubmissionReference } from "#/delivery/EmailReceipt.js";
import type { RecipientOutcome, SendReceipt } from "#/delivery/EmailReceipt.js";
import {
  AuthenticationError,
  MessageRejectedError,
  QuotaExceededError,
} from "#/errors/EmailError.js";
import type { EmailError } from "#/errors/EmailError.js";
import type { NormalizedEmailMessage } from "#/message/EmailMessage.js";
import { providerFailure, unexpectedResponse } from "#/providers/internal/Failures.js";
import { accepted } from "#/providers/internal/Receipts.js";
import { httpFailure } from "#/providers/internal/Submission.js";

const provider = "mailchimp-transactional";
const Recipient = Schema.Struct({
  email: Schema.String,
  status: Schema.String,
  _id: Schema.optionalKey(Schema.String),
  reject_reason: Schema.optionalKey(Schema.NullOr(Schema.String)),
});
const Failure = Schema.Struct({ status: Schema.Literal("error"), name: Schema.String });
const AxiosFailure = Schema.Struct({
  isAxiosError: Schema.Literal(true),
  response: Schema.optionalKey(
    Schema.Struct({ status: Schema.Number, data: Schema.optionalKey(Schema.Unknown) }),
  ),
});
const addressKey = (email: string) => {
  const at = email.lastIndexOf("@");
  return email.slice(0, at) + email.slice(at).toLowerCase();
};

export const outcome = (
  response: unknown,
  message: NormalizedEmailMessage,
): Result.Result<SendReceipt, EmailError> => {
  const transport = Schema.decodeUnknownResult(AxiosFailure)(response);
  if (Result.isSuccess(transport)) return Result.fail(httpFailure(provider, response));
  const failure = Schema.decodeUnknownResult(Failure)(response);
  if (Result.isSuccess(failure))
    return Result.fail(
      providerFailure(provider, {
        code: failure.success.name,
        acceptance: "rejected",
        ...(failure.success.name === "Invalid_Key"
          ? { reason: new AuthenticationError() }
          : failure.success.name === "PaymentRequired"
            ? { reason: new QuotaExceededError() }
            : {}),
      }),
    );
  const decoded = Schema.decodeUnknownResult(Schema.NonEmptyArray(Recipient))(response);
  if (Result.isFailure(decoded)) return Result.fail(unexpectedResponse(provider));

  const ids = decoded.success.flatMap((recipient) =>
    Schema.is(SubmissionReference.fields.value)(recipient._id) ? [recipient._id] : [],
  );
  const base = accepted(provider, ids);
  if (Result.isFailure(base)) return base;
  const positions = (["to", "cc", "bcc"] as const).flatMap((role) =>
    (message[role] ?? []).map((address, index) => ({
      role,
      index,
      key: addressKey(address.email),
    })),
  );
  if (
    positions.length !== decoded.success.length ||
    new Set(positions.map((position) => position.key)).size !== positions.length
  )
    return Result.fail(unexpectedResponse(provider, base.success.references));
  const recipients: RecipientOutcome[] = [];
  for (const position of positions) {
    const matches = decoded.success.filter(
      (recipient) => addressKey(recipient.email) === position.key,
    );
    const recipient = matches[0];
    if (matches.length !== 1 || recipient === undefined)
      return Result.fail(unexpectedResponse(provider, base.success.references));
    const status = ["sent", "queued", "scheduled"].includes(recipient.status)
      ? "accepted"
      : ["rejected", "invalid"].includes(recipient.status)
        ? "rejected"
        : undefined;
    if (status === undefined)
      return Result.fail(unexpectedResponse(provider, base.success.references));
    const id = Schema.decodeUnknownResult(SubmissionReference.fields.value)(recipient._id);
    if (status === "accepted" && Result.isFailure(id))
      return Result.fail(unexpectedResponse(provider, base.success.references));
    const code = Schema.decodeUnknownResult(ProviderCode)(
      recipient.reject_reason?.replaceAll("-", "_"),
    );
    recipients.push({
      role: position.role,
      index: position.index,
      status,
      ...(Result.isSuccess(id)
        ? { references: [{ kind: "providerMessageId", value: id.success }] }
        : {}),
      ...(status === "rejected" && Result.isSuccess(code) ? { rejectionCode: code.success } : {}),
    });
  }
  if (recipients.every((recipient) => recipient.status === "rejected"))
    return Result.fail(
      providerFailure(provider, {
        reason: new MessageRejectedError(),
        acceptance: "rejected",
        references: base.success.references,
      }),
    );
  const [first, ...rest] = recipients;
  if (first === undefined)
    return Result.fail(unexpectedResponse(provider, base.success.references));
  return Result.succeed({
    ...base.success,
    status: recipients.some((recipient) => recipient.status === "rejected")
      ? "partiallyAccepted"
      : "accepted",
    recipients: [first, ...rest],
  });
};
