import type { EmailMessage, SubmissionReference } from "@effect-kit/emails";
import { expectTypeOf, it } from "vitest";

it("requires a body but accepts application-produced recipient arrays", () => {
  const to: string[] = ["ada@example.com"];
  const text: EmailMessage = { from: "sender@example.com", to, subject: "Hello", text: "Hello" };
  const html: EmailMessage = {
    from: "sender@example.com",
    to,
    subject: "Hello",
    html: "<p>Hello</p>",
  };
  expectTypeOf(text.to).toExtend<EmailMessage["to"]>();
  expectTypeOf(html).toExtend<EmailMessage>();

  // @ts-expect-error At least one body alternative is required.
  const missingBody: EmailMessage = { from: "sender@example.com", to, subject: "Hello" };
  // @ts-expect-error Reference kinds distinguish provider, SMTP and operation identities.
  const reference: SubmissionReference = { kind: "delivered", value: "123" };
  expectTypeOf(missingBody).toEqualTypeOf<EmailMessage>();
  expectTypeOf(reference).toEqualTypeOf<SubmissionReference>();
});
