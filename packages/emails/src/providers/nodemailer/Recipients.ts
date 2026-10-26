import { Schema } from "effect";

import { EmailAddress } from "../../message/EmailMessage.js";
import type { NormalizedEmailMessage } from "../../message/EmailMessage.js";

export const Recipient = Schema.Union([EmailAddress, Schema.Struct({ address: EmailAddress })]);
export type Recipient = typeof Recipient.Type;

/** SMTP local parts remain case-sensitive; DNS domain case does not affect association. */
export const recipientKey = (recipient: Recipient): string => {
  const address = typeof recipient === "string" ? recipient : recipient.address;
  const at = address.lastIndexOf("@");
  return address.slice(0, at) + address.slice(at).toLowerCase();
};

export const recipientPositions = (message: NormalizedEmailMessage) =>
  (["to", "cc", "bcc"] as const).flatMap((role) =>
    (message[role] ?? []).map(({ email }, index) => ({ role, index, key: recipientKey(email) })),
  );
