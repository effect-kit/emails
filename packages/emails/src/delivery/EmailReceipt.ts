import { Schema } from "effect";

export const ProviderName = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9@][A-Za-z0-9@._/-]{0,127}$/),
);
export const ProviderCode = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_.:-]{1,128}$/));

const ReferenceValue = Schema.String.check(
  Schema.isPattern(/\S/),
  // oxlint-disable-next-line no-control-regex -- References must not contain injected control characters.
  Schema.makeFilter((value) => !/[\u0000-\u001f\u007f]/.test(value)),
  Schema.isMaxLength(1024),
);

export const SubmissionReference = Schema.Struct({
  kind: Schema.Literals(["providerMessageId", "smtpMessageId", "operationId"]),
  value: ReferenceValue,
});
export type SubmissionReference = typeof SubmissionReference.Type;

export const RecipientPosition = Schema.Struct({
  role: Schema.Literals(["to", "cc", "bcc"]),
  index: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});
export type RecipientPosition = typeof RecipientPosition.Type;

export const RecipientOutcome = Schema.Struct({
  ...RecipientPosition.fields,
  status: Schema.Literals(["accepted", "rejected", "unknown"]),
  references: Schema.optionalKey(Schema.Array(SubmissionReference)),
  rejectionCode: Schema.optionalKey(ProviderCode),
}).check(
  Schema.makeFilter(
    (outcome) => outcome.rejectionCode === undefined || outcome.status === "rejected",
  ),
);
export type RecipientOutcome = typeof RecipientOutcome.Type;

/** Provider acknowledgment, not a claim of recipient-server or inbox delivery. */
export const SendReceipt = Schema.Struct({
  provider: ProviderName,
  status: Schema.Literals(["accepted", "partiallyAccepted"]),
  references: Schema.Array(SubmissionReference),
  requestId: Schema.optionalKey(ReferenceValue),
  recipients: Schema.optionalKey(Schema.NonEmptyArray(RecipientOutcome)),
}).check(
  Schema.makeFilter((receipt) => {
    const recipients = receipt.recipients ?? [];
    const positions = recipients.map(({ role, index }) => `${role}:${index}`);
    if (new Set(positions).size !== positions.length) return false;

    const accepted = recipients.some((recipient) => recipient.status === "accepted");
    const rejected = recipients.some((recipient) => recipient.status === "rejected");
    return receipt.status === "partiallyAccepted" ? accepted && rejected : !rejected;
  }),
);
export type SendReceipt = typeof SendReceipt.Type;
