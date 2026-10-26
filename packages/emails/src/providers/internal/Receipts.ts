import { Result, Schema } from "effect";

import { SubmissionReference } from "#/delivery/EmailReceipt.js";
import type { SendReceipt } from "#/delivery/EmailReceipt.js";
import type { EmailError } from "#/errors/EmailError.js";
import { unexpectedResponse } from "#/providers/internal/Failures.js";

export const accepted = (
  provider: string,
  ids: ReadonlyArray<unknown>,
  options: {
    readonly kind?: SubmissionReference["kind"];
    readonly requestId?: unknown;
  } = {},
): Result.Result<SendReceipt, EmailError> => {
  const references = Schema.decodeUnknownResult(Schema.Array(SubmissionReference.fields.value))(
    ids,
  );
  if (Result.isFailure(references)) return Result.fail(unexpectedResponse(provider));
  const requestId = Schema.decodeUnknownResult(SubmissionReference.fields.value)(options.requestId);
  return Result.succeed({
    provider,
    status: "accepted",
    references: references.success.map((value) => ({
      kind: options.kind ?? "providerMessageId",
      value,
    })),
    ...(Result.isSuccess(requestId) ? { requestId: requestId.success } : {}),
  });
};
