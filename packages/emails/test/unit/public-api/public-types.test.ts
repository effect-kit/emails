import { Context, Effect } from "effect";

import type {
  EmailAdapter,
  EmailMessage,
  NormalizedEmailMessage,
  SubmissionReference,
} from "@effect-kit/emails";
import { expectTypeOf, it } from "vitest";

import { capabilities, receipt } from "../../fixtures/email.js";

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

it("preserves normalized body requirements and captures infrastructure before sending", () => {
  class Client extends Context.Service<Client, { readonly name: string }>()(
    "test/TypeOnlyClient",
  ) {}
  const requiresClient = Effect.map(Client, () => receipt);
  const adapter: EmailAdapter = {
    provider: "custom",
    capabilities,
    // @ts-expect-error Infrastructure requirements must be captured by the owning Layer.
    send: () => requiresClient,
  };
  // @ts-expect-error Address normalization must preserve the required body alternative.
  const missingBody: NormalizedEmailMessage = {
    from: { email: "sender@example.com" },
    to: [{ email: "ada@example.com" }],
    subject: "Hello",
  };
  expectTypeOf(adapter).toEqualTypeOf<EmailAdapter>();
  expectTypeOf(missingBody).toEqualTypeOf<NormalizedEmailMessage>();
});
