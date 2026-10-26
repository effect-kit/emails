import { assert, describe, it } from "@effect/vitest";
import { Effect, Result } from "effect";
import type { Scope } from "effect";

import { EmailError, TransportError } from "@effect-kit/emails";
import type {
  EmailCapabilities,
  EmailService,
  NormalizedEmailMessage,
  SendReceipt,
} from "@effect-kit/emails";

import { capabilities, message, receipt } from "#/test/fixtures/email.js";

/** Exercise the same cold Effect twice and prove each execution makes exactly one attempt. */
export const repeatedSubmission = Effect.fnUntraced(function* (
  send: Effect.Effect<SendReceipt, EmailError>,
  attempts: Effect.Effect<number>,
) {
  assert.strictEqual(yield* attempts, 0);
  const first = yield* send;
  assert.strictEqual(yield* attempts, 1);
  const second = yield* send;
  assert.strictEqual(yield* attempts, 2);
  return [first, second] as const;
});

export interface EmailContractFixture {
  readonly email: EmailService;
  readonly messages: Effect.Effect<ReadonlyArray<NormalizedEmailMessage>>;
}

/** Each adapter supplies an isolated controlled transport, not a replacement for its mapping code. */
export type MakeEmailContractFixture = (
  response: Effect.Effect<SendReceipt, EmailError>,
  features: EmailCapabilities,
) => Effect.Effect<EmailContractFixture, never, Scope.Scope>;

export const emailContract = (name: string, make: MakeEmailContractFixture) => {
  describe(name, () => {
    it.effect("is cold, submits once per execution and preserves recipient visibility", () =>
      Effect.gen(function* () {
        const fixture = yield* make(Effect.succeed(receipt), capabilities);
        const input = {
          ...message,
          to: ["Ada@example.com", "Ada@example.com"],
          cc: "copy@example.com",
          bcc: "private@example.com",
        };
        const send = fixture.email.send(input);
        const [first] = yield* repeatedSubmission(
          send,
          Effect.map(fixture.messages, (messages) => messages.length),
        );
        assert.deepStrictEqual(first, receipt);
        const captured = yield* fixture.messages;
        assert.lengthOf(captured, 2);
        assert.deepStrictEqual(captured[0]?.to, [
          { email: "Ada@example.com" },
          { email: "Ada@example.com" },
        ]);
        assert.deepStrictEqual(captured[0]?.cc, [{ email: "copy@example.com" }]);
        assert.deepStrictEqual(captured[0]?.bcc, [{ email: "private@example.com" }]);
        assert.deepStrictEqual(input.to, ["Ada@example.com", "Ada@example.com"]);
      }),
    );

    it.effect("rejects invalid and unsupported input without a transport attempt", () =>
      Effect.gen(function* () {
        const fixture = yield* make(Effect.succeed(receipt), { ...capabilities, headers: false });
        const invalid = yield* fixture.email.send({ ...message, to: [] }).pipe(Effect.result);
        const unsupported = yield* fixture.email
          .send({ ...message, headers: { "X-Workflow": "welcome" } })
          .pipe(Effect.result);

        assert.isTrue(Result.isFailure(invalid));
        assert.isTrue(Result.isFailure(unsupported));
        if (Result.isFailure(invalid)) {
          assert.strictEqual(invalid.failure.reason._tag, "InvalidMessageError");
          assert.strictEqual(invalid.failure.acceptance, "notSubmitted");
        }
        if (Result.isFailure(unsupported)) {
          assert.strictEqual(unsupported.failure.reason._tag, "UnsupportedFeatureError");
          assert.strictEqual(unsupported.failure.acceptance, "notSubmitted");
        }
        assert.lengthOf(yield* fixture.messages, 0);
      }),
    );

    it.effect("retains partial receipts without resending accepted recipients", () =>
      Effect.gen(function* () {
        const partial: SendReceipt = {
          ...receipt,
          status: "partiallyAccepted",
          recipients: [
            {
              role: "to",
              index: 0,
              status: "accepted",
              references: [{ kind: "providerMessageId", value: "accepted-1" }],
            },
            { role: "bcc", index: 0, status: "rejected", rejectionCode: "SUPPRESSED" },
          ],
        };
        const fixture = yield* make(Effect.succeed(partial), capabilities);
        assert.deepStrictEqual(
          yield* fixture.email.send({ ...message, bcc: "private@example.com" }),
          partial,
        );
        assert.lengthOf(yield* fixture.messages, 1);
      }),
    );

    it.effect("preserves typed uncertain failures without retrying", () =>
      Effect.gen(function* () {
        const failure = new EmailError({
          provider: "custom",
          operation: "send",
          acceptance: "unknown",
          reason: new TransportError(),
        });
        const fixture = yield* make(Effect.fail(failure), capabilities);
        const result = yield* fixture.email.send(message).pipe(Effect.result);
        assert.isTrue(Result.isFailure(result));
        if (Result.isFailure(result)) assert.strictEqual(result.failure, failure);
        assert.lengthOf(yield* fixture.messages, 1);
      }),
    );

    it.effect.each([
      { ...receipt, provider: "another-provider" },
      { ...receipt, recipients: [{ role: "to", index: 2, status: "accepted" }] },
      { ...receipt, responseBody: "secret" },
      { ...receipt, references: [{ kind: "unexpected", value: "secret" }] },
    ])("classifies malformed responses as unknown acceptance", (response) =>
      Effect.gen(function* () {
        const fixture = yield* make(Effect.succeed(response as SendReceipt), capabilities);
        const result = yield* fixture.email.send(message).pipe(Effect.result);
        assert.isTrue(Result.isFailure(result));
        if (Result.isFailure(result)) {
          assert.strictEqual(result.failure.reason._tag, "UnexpectedResponseError");
          assert.strictEqual(result.failure.acceptance, "unknown");
          assert.notInclude(JSON.stringify(result.failure), "secret");
        }
        assert.lengthOf(yield* fixture.messages, 1);
      }),
    );
  });
};
