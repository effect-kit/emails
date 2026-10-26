import { assert, describe, it } from "@effect/vitest";
import { Effect, Redacted, Result } from "effect";

import { Email } from "@effect-kit/emails";
import * as Scaleway from "@effect-kit/emails/scaleway";
import { afterEach, vi } from "vitest";

import { message } from "#/test/fixtures/email.js";

afterEach(() => vi.restoreAllMocks());
const live = () =>
  Scaleway.layer({
    accessKey: "SCWABCDEFGHIJKLMNOPQ",
    secretKey: Redacted.make("00000000-0000-4000-8000-000000000001"),
    projectId: "00000000-0000-4000-8000-000000000002",
    region: "fr-par",
  });
describe("Scaleway focused SDK", () => {
  it.effect(
    "serializes one body alternative, reply headers and bytes and keeps every technical ID",
    () => {
      const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(
        async () =>
          new Response(JSON.stringify({ emails: [{ id: "scw-one" }, { id: "scw-two" }] }), {
            headers: { "content-type": "application/json" },
          }),
      );
      return Effect.gen(function* () {
        const email = yield* Email;
        const receipt = yield* email.send({
          ...message,
          replyTo: ["reply@example.com", "other@example.com"],
          attachments: [
            {
              filename: "bytes.bin",
              contentType: "application/octet-stream",
              content: new Uint8Array([0, 255, 128]),
            },
          ],
        });
        assert.deepStrictEqual(
          receipt.references.map((reference) => reference.value),
          ["scw-one", "scw-two"],
        );
        const request = fetch.mock.calls[0]?.[0];
        assert.instanceOf(request, Request);
        if (request instanceof Request) {
          assert.include(request.url, "/regions/fr-par/emails");
          const payload = JSON.parse(yield* Effect.promise(() => request.text()));
          assert.strictEqual(payload.text, message.text);
          assert.strictEqual(payload.attachments[0].content, "AP+A");
          assert.include(payload.additional_headers[0].value, "reply@example.com");
        }
      }).pipe(Effect.provide(live()));
    },
  );
  it.effect.each([401, 403, 429, 503])("sanitizes HTTP %s without retry", (status) => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(JSON.stringify({ type: "unknown", message: "private-body" }), {
          status,
          headers: { "content-type": "application/json" },
        }),
    );
    return Effect.gen(function* () {
      const email = yield* Email;
      const result = yield* email.send(message).pipe(Effect.result);
      assert.isTrue(Result.isFailure(result));
      if (Result.isFailure(result)) {
        assert.strictEqual(result.failure.statusCode, status);
        assert.notInclude(JSON.stringify(result.failure), "private-body");
      }
      assert.strictEqual(fetch.mock.calls.length, 1);
    }).pipe(Effect.provide(live()));
  });
});
