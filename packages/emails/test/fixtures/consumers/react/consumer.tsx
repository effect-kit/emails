import { Effect } from "effect";

import { Email } from "@effect-kit/emails";
import * as EmailReact from "@effect-kit/emails/react";
import { EmailTest } from "@effect-kit/emails/testing";

const Welcome = ({ name }: { readonly name: string }) => <p>Hello {name}!</p>;

await Effect.runPromise(
  Effect.gen(function* () {
    const content = yield* EmailReact.render(<Welcome name="Ada & friends" />);
    if (!content.html.includes("Ada &amp; friends") || !content.text.includes("Ada & friends"))
      throw new Error("Packed renderer did not preserve escaped HTML and text");

    const html = yield* EmailReact.render(<Welcome name="Ada" />, { mode: "html" });
    const text = yield* EmailReact.render(<Welcome name="Ada" />, { mode: "text" });
    if (!html.html || !text.text) throw new Error("Packed rendering modes failed");

    const email = yield* Email;
    const recorder = yield* EmailTest;
    yield* email.send({
      from: "hello@example.com",
      to: "ada@example.com",
      subject: "Welcome",
      ...content,
    });
    const captured = yield* recorder.messages;
    if (captured[0]?.text !== content.text)
      throw new Error("Packed render/send composition failed");
  }).pipe(Effect.provide(EmailTest.layer())),
);
