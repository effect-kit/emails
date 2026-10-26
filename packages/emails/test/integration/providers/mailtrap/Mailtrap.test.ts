import { assert, describe, it } from "@effect/vitest";
import { Effect, Redacted, Result } from "effect";

import { Email } from "@effect-kit/emails";
import * as Mailtrap from "@effect-kit/emails/mailtrap";
import { MailtrapClient } from "mailtrap";
import { afterEach, vi } from "vitest";

import { message } from "#/test/fixtures/email.js";
import { httpServer } from "#/test/fixtures/http/server.js";

afterEach(() => vi.restoreAllMocks());
const hosts: string[] = [];
const redirect = (url: URL) => {
  const prototype = MailtrapClient.prototype as unknown as { determineHost(): string };
  const original = prototype.determineHost;
  vi.spyOn(prototype, "determineHost").mockImplementation(function (this: MailtrapClient) {
    hosts.push(original.call(this));
    return url.origin;
  });
};
describe("Mailtrap SDK", () => {
  it.effect.each(["production", "sandbox", "bulk"] as const)(
    "selects explicit %s host and preserves all references",
    (mode) =>
      Effect.gen(function* () {
        hosts.length = 0;
        const server = yield* httpServer(() => ({
          body: { success: true, message_ids: ["id-one", "id-two"] },
        }));
        redirect(server.url);
        yield* Effect.gen(function* () {
          const email = yield* Email;
          const receipt = yield* email.send({
            ...message,
            attachments: [
              {
                filename: "logo.bin",
                contentType: "application/octet-stream",
                content: new Uint8Array([0, 255, 128]),
                contentId: "logo",
              },
            ],
          });
          assert.strictEqual(
            receipt.provider,
            mode === "production" ? "mailtrap" : `mailtrap/${mode}`,
          );
          assert.deepStrictEqual(
            receipt.references.map((reference) => reference.value),
            ["id-one", "id-two"],
          );
          assert.isUndefined(receipt.recipients);
        }).pipe(
          Effect.provide(
            Mailtrap.layer(
              mode === "sandbox"
                ? { token: Redacted.make("offline-key"), mode, inboxId: 123 }
                : { token: Redacted.make("offline-key"), mode },
            ),
          ),
        );
        assert.include(
          hosts[0],
          mode === "sandbox" ? "sandbox" : mode === "bulk" ? "bulk" : "send",
        );
        const payload = JSON.parse(server.requests[0]?.body.toString() ?? "{}");
        assert.strictEqual(payload.attachments[0].content, "AP+A");
        assert.strictEqual(payload.attachments[0].content_id, "logo");
      }),
  );
  it.effect("unwraps safe Axios status from MailtrapError.cause", () =>
    Effect.gen(function* () {
      const server = yield* httpServer(() => ({
        status: 429,
        body: { errors: ["private@example.com"] },
      }));
      redirect(server.url);
      yield* Effect.gen(function* () {
        const email = yield* Email;
        const result = yield* email.send(message).pipe(Effect.result);
        assert.isTrue(Result.isFailure(result));
        if (Result.isFailure(result)) {
          assert.strictEqual(result.failure.reason._tag, "RateLimitedError");
          assert.notInclude(JSON.stringify(result.failure), "private@example.com");
        }
      }).pipe(
        Effect.provide(Mailtrap.layer({ token: Redacted.make("offline-key"), mode: "production" })),
      );
      assert.strictEqual(server.requests.length, 1);
    }),
  );
});
