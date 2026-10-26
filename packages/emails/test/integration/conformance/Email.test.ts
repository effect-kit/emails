import { Context, Effect, Layer, Ref } from "effect";

import { Email } from "@effect-kit/emails";
import type { NormalizedEmailMessage } from "@effect-kit/emails";
import { EmailTest } from "@effect-kit/emails/testing";

import { emailContract } from "#/test/fixtures/conformance/email-contract.js";

emailContract("custom adapter contract", (response, capabilities) =>
  Effect.gen(function* () {
    const captured = yield* Ref.make<ReadonlyArray<NormalizedEmailMessage>>([]);
    const email = Email.make({
      provider: "custom",
      capabilities,
      send: (message) =>
        Ref.update(captured, (messages) => [...messages, message]).pipe(Effect.andThen(response)),
    });
    return { email, messages: Ref.get(captured) };
  }),
);

emailContract("public testing Layer contract", (response, capabilities) =>
  Effect.gen(function* () {
    const context = yield* Layer.build(
      EmailTest.layer({
        provider: "custom",
        capabilities,
        responses: [response, response],
      }),
    );
    return {
      email: Context.get(context, Email),
      messages: Context.get(context, EmailTest).messages,
    };
  }),
);
