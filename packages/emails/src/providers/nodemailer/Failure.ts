import { Result, Schema } from "effect";

import { ProviderCode } from "#/delivery/EmailReceipt.js";
import {
  AuthenticationError,
  EmailError,
  MessageRejectedError,
  ProviderError,
  ProviderUnavailableError,
  RecipientRejectedError,
  TimeoutError,
  TransportError,
} from "#/errors/EmailError.js";
import type { NormalizedEmailMessage } from "#/message/EmailMessage.js";
import { Recipient, recipientKey, recipientPositions } from "#/providers/nodemailer/Recipients.js";

const Failure = Schema.Struct({
  code: Schema.Literals([
    "ETIMEDOUT",
    "ESOCKET",
    "ECONNECTION",
    "EDNS",
    "ETLS",
    "EAUTH",
    "ENOAUTH",
    "EOAUTH2",
    "EENVELOPE",
    "EMESSAGE",
    "ESTREAM",
    "EPROTOCOL",
    "ECONFIG",
    "EMAXLIMIT",
    "EMAXRECIPIENTS",
    "EFILEACCESS",
    "EURLACCESS",
    "EFETCH",
  ]),
  command: Schema.optionalKey(Schema.String),
  syscall: Schema.optionalKey(Schema.String),
  timeoutType: Schema.optionalKey(Schema.String),
  responseCode: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 400, maximum: 599 })),
  ),
  rejected: Schema.optionalKey(Schema.Array(Recipient)),
});
const UnfamiliarFailure = Schema.Struct({ code: ProviderCode });

export const fromNodemailerFailure = (
  cause: unknown,
  message: NormalizedEmailMessage,
): EmailError => {
  const decoded = Schema.decodeUnknownResult(Failure)(cause);
  if (Result.isFailure(decoded)) {
    const unfamiliar = Schema.decodeUnknownResult(UnfamiliarFailure)(cause);
    if (Result.isFailure(unfamiliar)) throw cause;
    return new EmailError({
      provider: "nodemailer",
      operation: "send",
      acceptance: "unknown",
      providerCode: unfamiliar.success.code,
      reason: new ProviderError(),
    });
  }
  const { code, command, syscall, timeoutType, responseCode, rejected } = decoded.success;
  const auth = command?.startsWith("AUTH") || ["EAUTH", "ENOAUTH", "EOAUTH2"].includes(code);
  const beforeSubmission =
    auth ||
    code === "EDNS" ||
    code === "ETLS" ||
    ["EHLO", "HELO", "STARTTLS"].includes(command ?? "") ||
    syscall === "connect" ||
    ["CONNECT_TIMEOUT", "GREETING_TIMEOUT", "UPGRADE_TIMEOUT"].includes(timeoutType ?? "");
  let acceptance: EmailError["acceptance"] = beforeSubmission
    ? "notSubmitted"
    : responseCode === undefined
      ? "unknown"
      : "rejected";
  let reason: EmailError["reason"];
  if (responseCode !== undefined && responseCode < 500) {
    reason = new ProviderUnavailableError();
  } else if (auth) {
    reason = new AuthenticationError();
  } else if (command === "RCPT TO" && responseCode !== undefined) {
    const rejectedKeys = new Set(rejected?.map(recipientKey));
    const positions = recipientPositions(message)
      .filter(({ key }) => rejectedKeys.has(key))
      .map(({ role, index }) => ({ role, index }));
    if (positions.length === 0) {
      reason = new ProviderError();
      acceptance = "unknown";
    } else reason = new RecipientRejectedError({ recipients: positions });
  } else if (responseCode !== undefined) {
    reason = new MessageRejectedError();
  } else if (code === "ETIMEDOUT") {
    reason = new TimeoutError();
  } else if (["ESOCKET", "ECONNECTION", "EDNS", "ETLS", "EPROTOCOL"].includes(code)) {
    reason = new TransportError();
  } else {
    reason = new ProviderError();
  }
  return new EmailError({
    provider: "nodemailer",
    operation: "send",
    acceptance,
    reason,
    providerCode: code,
    ...(responseCode === undefined ? {} : { statusCode: responseCode }),
  });
};
