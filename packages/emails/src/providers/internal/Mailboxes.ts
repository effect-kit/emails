import type { Mailbox } from "#/message/EmailMessage.js";

/** Structured names are quoted before entering providers that accept RFC-style address strings. */
export const formatMailbox = ({ email, name }: Mailbox): string =>
  name === undefined ? email : `"${name.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}" <${email}>`;
