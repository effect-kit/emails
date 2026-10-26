import { assert, describe, it } from "@effect/vitest";
import { Effect, Redacted, Result } from "effect";

import { Email } from "@effect-kit/emails";
import * as Plunk from "@effect-kit/emails/plunk";
import { afterEach, vi } from "vitest";

import { message } from "#/test/fixtures/email.js";

afterEach(() => vi.restoreAllMocks());
const live = () => Plunk.layer({ apiKey: Redacted.make("sk_offline-key") });
const htmlMessage = {
  from: message.from,
  to: message.to,
  subject: message.subject,
  html: "<p>Welcome</p>",
};
describe("Plunk SDK limited current endpoint", () => {
  it.effect("uses the current host without subscription/contact-update fields or fan-out", () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            success: true,
            data: { emails: [{ email: "plunk-id", status: "queued" }] },
          }),
        ),
    );
    return Effect.gen(function* () {
      const email = yield* Email;
      const receipt = yield* email.send(htmlMessage);
      assert.strictEqual(receipt.references[0]?.value, "plunk-id");
      const [url, options] = fetch.mock.calls[0] ?? [];
      assert.strictEqual(url, "https://next-api.useplunk.com/v1/send");
      assert.deepStrictEqual(JSON.parse(String(options?.body)), {
        from: message.from,
        to: message.to,
        subject: message.subject,
        body: htmlMessage.html,
      });
      assert.strictEqual(fetch.mock.calls.length, 1);
    }).pipe(Effect.provide(live()));
  });
  it.effect.each(["throttled", "skipped", "unknown"])(
    "does not report %s as accepted",
    (status) => {
      vi.spyOn(globalThis, "fetch").mockImplementation(
        async () => new Response(JSON.stringify({ success: true, data: { emails: [{ status }] } })),
      );
      return Effect.gen(function* () {
        const email = yield* Email;
        const result = yield* email.send(htmlMessage).pipe(Effect.result);
        assert.isTrue(Result.isFailure(result));
        if (Result.isFailure(result))
          assert.strictEqual(
            result.failure.reason._tag,
            status === "unknown" ? "UnexpectedResponseError" : "MessageRejectedError",
          );
      }).pipe(Effect.provide(live()));
    },
  );
  it.effect("rejects unsupported text, multiple TO and recipient names without network I/O", () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    return Effect.gen(function* () {
      const email = yield* Email;
      for (const input of [
        message,
        { ...htmlMessage, to: [message.to, "other@example.com"] },
        { ...htmlMessage, to: { email: message.to, name: "Ada" } },
      ]) {
        const result = yield* email.send(input).pipe(Effect.result);
        assert.isTrue(Result.isFailure(result));
        if (Result.isFailure(result)) assert.strictEqual(result.failure.acceptance, "notSubmitted");
      }
      assert.strictEqual(fetch.mock.calls.length, 0);
    }).pipe(Effect.provide(live()));
  });
  it.effect("maps native token exceptions without raw messages", () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(JSON.stringify({ error: { message: "private-key" } }), { status: 401 }),
    );
    return Effect.gen(function* () {
      const email = yield* Email;
      const result = yield* email.send(htmlMessage).pipe(Effect.result);
      assert.isTrue(Result.isFailure(result));
      if (Result.isFailure(result)) {
        assert.strictEqual(result.failure.reason._tag, "AuthenticationError");
        assert.notInclude(JSON.stringify(result.failure), "private-key");
      }
    }).pipe(Effect.provide(live()));
  });
});
