import { Effect, Redacted } from "effect";

import { Email } from "@effect-kit/emails";
import * as EmailReact from "@effect-kit/emails/react";
import * as Resend from "@effect-kit/emails/resend";

const Welcome = ({ name }: { name: string }) => <p>Hello {name}!</p>;
const original = globalThis.fetch;
let calls = 0;
let wireContent = "";
globalThis.fetch = async (_url, options) => {
  calls++;
  wireContent = String(options?.body);
  return new Response(JSON.stringify({ id: "rendered-id" }));
};
try {
  const receipt = await Effect.runPromise(
    Effect.gen(function* () {
      const content = yield* EmailReact.render(<Welcome name="Ada & friends" />);
      const email = yield* Email;
      return yield* email.send({
        from: "hello@example.com",
        to: "ada@example.com",
        subject: "Welcome",
        ...content,
      });
    }).pipe(Effect.provide(Resend.layer({ apiKey: Redacted.make("offline-key") }))),
  );
  if (
    calls !== 1 ||
    receipt.references[0]?.value !== "rendered-id" ||
    !wireContent.includes("Ada &amp; friends") ||
    !wireContent.includes("Ada & friends")
  )
    throw new Error("Packed React and Resend peers did not compose through the real SDK");
} finally {
  globalThis.fetch = original;
}
