import { Result, Schema } from "effect";

import { Attachment, CustomHeaders, EmailMessage } from "@effect-kit/emails";
import { describe, expect, it } from "vitest";

import { message } from "../../fixtures/email.js";

describe("message contracts", () => {
  it("accepts Unicode content/names, dynamic arrays and preserves recipient case/order/roles", () => {
    const recipients: string[] = ["Ada@example.com", "lin@example.com", "Ada@example.com"];
    const input = {
      ...message,
      from: { email: "Sender@example.com", name: "Équipe, Acme" },
      to: recipients,
      bcc: "private@example.com",
      html: "<p>Welcome 🌍</p>",
    };

    expect(Schema.decodeUnknownSync(EmailMessage)(input)).toEqual(input);
  });

  it.each([
    { to: [] },
    { cc: [] },
    { replyTo: [] },
    { text: undefined },
    { text: "  " },
    { subject: "" },
    { subject: "Hello\n" },
    { to: "ada@example.com\n" },
    { to: "Name <ada@example.com>" },
    { to: "a..b@example.com" },
    { to: "ada@-example.com" },
    { to: "é@example.com" },
    { from: "sender@example.com\r\nBcc: other@example.com" },
    { subject: "Hello\nBcc: other@example.com" },
    { from: { email: "sender@example.com", name: "Acme\u0000" } },
  ])("rejects invalid message fields: %j", (fields) => {
    expect(
      Result.isFailure(Schema.decodeUnknownResult(EmailMessage)({ ...message, ...fields })),
    ).toBe(true);
  });

  it("requires at least one body while allowing either alternative", () => {
    const { text: _text, ...withoutBody } = message;

    expect(Schema.is(EmailMessage)(withoutBody)).toBe(false);
    expect(Schema.is(EmailMessage)({ ...withoutBody, html: "<p>Hello</p>" })).toBe(true);
  });

  it.each([
    { Bcc: "hidden@example.com" },
    { "Content-Type": "text/plain" },
    { "X-SES-CONFIGURATION-SET": "override" },
    { "Idempotency-Key": "override" },
    { Authorization: "secret" },
    { "Bad:Name": "value" },
    { "X-Custom": "value\r\nBcc: hidden@example.com" },
    { "X-Custom": "first", "x-custom": "second" },
  ])("rejects reserved, duplicate or injected headers: %j", (headers) => {
    expect(Result.isFailure(Schema.decodeUnknownResult(CustomHeaders)(headers))).toBe(true);
  });

  it("accepts custom headers and binary or empty attachments without encoding bytes", () => {
    expect(Schema.decodeUnknownSync(CustomHeaders)({ "X-Workflow": "billing" })).toEqual({
      "X-Workflow": "billing",
    });
    for (const content of [new Uint8Array(), new Uint8Array([0, 255, 128])]) {
      const attachment = { filename: "facture.pdf", contentType: "application/pdf", content };
      expect(Schema.decodeUnknownSync(Attachment)(attachment).content).toEqual(content);
    }
  });

  it("rejects attachment metadata injection, ambiguous CID values and duplicate CIDs", () => {
    const attachment = {
      filename: "image.png",
      content: new Uint8Array([255]),
      contentType: "image/png",
      contentId: "logo@example.com",
    };

    expect(Schema.is(Attachment)({ ...attachment, filename: "image\r\n.png" })).toBe(false);
    expect(Schema.is(Attachment)({ ...attachment, contentType: "image/png\n" })).toBe(false);
    expect(Schema.is(Attachment)({ ...attachment, contentId: "<logo>" })).toBe(false);
    expect(Schema.is(EmailMessage)({ ...message, attachments: [attachment, attachment] })).toBe(
      false,
    );
  });
});
