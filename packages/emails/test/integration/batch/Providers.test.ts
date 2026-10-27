import { assert, describe, it } from "@effect/vitest";
import { Effect, Redacted, Result } from "effect";

import { Email } from "@effect-kit/emails";
import * as Nodemailer from "@effect-kit/emails/nodemailer";
import * as Resend from "@effect-kit/emails/resend";
import { afterEach, vi } from "vitest";

import { message } from "#/test/fixtures/email.js";
import { smtpError, smtpServer } from "#/test/fixtures/smtp/server.js";

afterEach(() => vi.restoreAllMocks());

describe("portable batch provider boundaries", () => {
  it.effect("uses individual SDK sends with stable keys and no retry after an HTTP failure", () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, options) => {
      const key = new Headers(options?.headers).get("Idempotency-Key");
      return key === "limited"
        ? new Response(JSON.stringify({ name: "rate_limit_exceeded", message: "private-limit" }), {
            status: 429,
          })
        : new Response(JSON.stringify({ id: key }));
    });
    return Effect.gen(function* () {
      const outcomes = yield* Email.sendMany(
        ["first", "limited", "last"].map((idempotencyKey) => ({
          message,
          options: { idempotencyKey },
        })),
        { concurrency: 2 },
      );
      const limited = outcomes[1];
      assert.isTrue(limited !== undefined && Result.isFailure(limited));
      if (limited !== undefined && Result.isFailure(limited)) {
        assert.strictEqual(limited.failure.reason._tag, "RateLimitedError");
        assert.notInclude(JSON.stringify(limited.failure), "private-limit");
      }
      assert.deepStrictEqual(
        outcomes.map((outcome) =>
          Result.isSuccess(outcome) ? outcome.success.references[0]?.value : undefined,
        ),
        ["first", undefined, "last"],
      );
      assert.strictEqual(fetch.mock.calls.length, 3);
      assert.isTrue(fetch.mock.calls.every(([url]) => url === "https://api.resend.com/emails"));
    }).pipe(Effect.provide(Resend.layer({ apiKey: Redacted.make("offline-test-key") })));
  });

  it.effect("continues SMTP recipient rejection through a shared owned transport", () =>
    Effect.gen(function* () {
      const fixture = yield* smtpServer({
        onRcptTo: (recipient, _session, callback) =>
          callback(recipient.address === "rejected@example.com" ? smtpError(550) : null),
      });
      const outcomes = yield* Email.sendMany(
        ["first@example.com", "rejected@example.com", "last@example.com"].map((to) => ({
          message: { ...message, to },
        })),
        { concurrency: 2 },
      ).pipe(
        Effect.provide(
          Nodemailer.layer({
            transport: { host: "127.0.0.1", port: fixture.port, pool: true, maxConnections: 2 },
          }),
        ),
      );
      assert.deepStrictEqual(
        outcomes.map((outcome) =>
          Result.isSuccess(outcome)
            ? outcome.success.references[0]?.kind
            : outcome.failure.reason._tag,
        ),
        ["smtpMessageId", "RecipientRejectedError", "smtpMessageId"],
      );
      assert.strictEqual(fixture.messages.length, 2);
    }),
  );
});
