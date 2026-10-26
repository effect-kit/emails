import { Context, Effect, Layer, Ref } from "effect";

import type { EmailCapabilities } from "#/delivery/EmailCapabilities.js";
import type { SendReceipt } from "#/delivery/EmailReceipt.js";
import type { EmailError } from "#/errors/EmailError.js";
import type { NormalizedEmailMessage } from "#/message/EmailMessage.js";
import { Email } from "#/service/Email.js";
import { snapshotMessage } from "#/service/MessagePreparation.js";

export interface EmailTestOptions {
  readonly provider?: string;
  readonly capabilities?: EmailCapabilities;
  /** One Effect per attempted submission. Exhaustion is a test defect, never implicit success. */
  readonly responses?: ReadonlyArray<Effect.Effect<SendReceipt, EmailError>>;
}

export interface EmailTestService {
  /** Fresh snapshots of attempted submissions, including failed or interrupted attempts. */
  readonly messages: Effect.Effect<ReadonlyArray<NormalizedEmailMessage>>;
}

const defaultCapabilities: EmailCapabilities = {
  text: true,
  html: true,
  htmlAndText: true,
  senderName: true,
  cc: true,
  bcc: true,
  replyTo: "multiple",
  headers: true,
  attachments: true,
  inlineAttachments: true,
  idempotency: { mode: "unsupported" },
};

export class EmailTest extends Context.Service<EmailTest, EmailTestService>()(
  "@effect-kit/emails/testing/EmailTest",
) {
  static layer(options: EmailTestOptions = {}): Layer.Layer<Email | EmailTest> {
    const provider = options.provider ?? "test";
    const capabilities = options.capabilities ?? defaultCapabilities;
    const responses = options.responses?.slice();

    return Layer.effectContext(
      Effect.gen(function* () {
        const captured = yield* Ref.make<ReadonlyArray<NormalizedEmailMessage>>([]);
        const email = Email.make({
          provider,
          capabilities,
          send: Effect.fnUntraced(function* (message) {
            const index = yield* Ref.modify(captured, (messages) => [
              messages.length,
              [...messages, message],
            ]);

            if (responses !== undefined) {
              const response = responses[index];
              if (response === undefined) {
                return yield* Effect.die(new Error("EmailTest response script exhausted"));
              }
              return yield* response;
            }

            return {
              provider,
              status: "accepted" as const,
              references: [
                { kind: "providerMessageId" as const, value: `email-test-${index + 1}` },
              ],
            };
          }),
        });
        const recorder = EmailTest.of({
          messages: Ref.get(captured).pipe(Effect.map((messages) => messages.map(snapshotMessage))),
        });

        return Context.make(Email, email).pipe(Context.add(EmailTest, recorder));
      }),
    );
  }
}
