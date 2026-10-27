import { Effect } from "effect";

import { Email } from "@effect-kit/emails";
import * as EmailReact from "@effect-kit/emails/react";
import { EmailTest } from "@effect-kit/emails/testing";

const WelcomeEmail = ({ name }: { readonly name: string }) => (
  <html lang="en">
    <body>
      <p>Hello {name}!</p>
    </body>
  </html>
);

/** Render once and compose canonical content with the same provider-independent service. */
export const welcome = Effect.gen(function* () {
  const content = yield* EmailReact.render(<WelcomeEmail name="Ada" />);
  const email = yield* Email;

  return yield* email.send({
    from: "hello@example.com",
    to: "ada@example.com",
    subject: "Welcome",
    ...content,
  });
});

export const offlineWelcome = welcome.pipe(Effect.provide(EmailTest.layer()));
