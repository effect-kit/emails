import { Context } from "effect";
import type { Effect } from "effect";

import type {
  EmailAdapter,
  EmailMessage,
  NormalizedEmailMessage,
  SendReceipt,
} from "@effect-kit/emails";

// Compile-only contracts: typecheck:test checks this file; Vitest never executes it.
declare const acceptMessage: (message: EmailMessage) => void;
declare const acceptNormalized: (message: NormalizedEmailMessage) => void;
declare const acceptAdapter: (adapter: EmailAdapter) => void;

const to: string[] = ["ada@example.com"];
acceptMessage({ from: "sender@example.com", to, subject: "Hello", text: "Hello" });
acceptMessage({ from: "sender@example.com", to, subject: "Hello", html: "<p>Hello</p>" });

// @ts-expect-error The public union must require at least one body alternative.
acceptMessage({ from: "sender@example.com", to, subject: "Hello" });
// @ts-expect-error Address normalization must preserve the required body alternative.
acceptNormalized({ from: { email: "sender@example.com" }, to: [], subject: "Hello" });

class Client extends Context.Service<Client, { readonly name: string }>()("test/TypeOnlyClient") {}
declare const requiresClient: Effect.Effect<SendReceipt, never, Client>;
declare const capabilities: EmailAdapter["capabilities"];

acceptAdapter({
  provider: "custom",
  capabilities,
  // @ts-expect-error Infrastructure requirements must be captured by the owning Layer.
  send: () => requiresClient,
});
