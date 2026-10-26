import { assert, describe, it } from "@effect/vitest";
import { Effect, Redacted, Result } from "effect";

import { Email } from "@effect-kit/emails";
import * as ZeptoMail from "@effect-kit/emails/zeptomail";
import { NetworkError, TimeoutError } from "zeptomail";

import { message } from "#/test/fixtures/email.js";
import { httpServer } from "#/test/fixtures/http/server.js";

describe("ZeptoMail SDK compatibility", () => {
  it.effect(
    "uses the explicit endpoint, token and nested address model with real byte/CID payloads",
    () =>
      Effect.gen(function* () {
        const server = yield* httpServer(() => ({
          body: {
            data: [{ code: "EM_104", message: "OK" }],
            request_id: "zepto-request",
            message: "OK",
          },
        }));
        yield* Effect.gen(function* () {
          const email = yield* Email;
          const receipt = yield* email.send({
            ...message,
            bcc: "private@example.com",
            attachments: [
              {
                filename: "logo.bin",
                contentType: "application/octet-stream",
                content: new Uint8Array([0, 255, 128]),
                contentId: "logo",
              },
            ],
          });
          assert.deepStrictEqual(receipt.references, []);
          assert.strictEqual(receipt.requestId, "zepto-request");
        }).pipe(
          Effect.provide(
            ZeptoMail.layer({
              token: Redacted.make("offline-token"),
              url: new URL("/v1.1/email", server.url),
            }),
          ),
        );
        const request = server.requests[0];
        assert.strictEqual(request?.headers.authorization, "Zoho-enczapikey offline-token");
        const payload = JSON.parse(request?.body.toString() ?? "{}");
        assert.strictEqual(payload.bcc[0].email_address.address, "private@example.com");
        assert.deepStrictEqual(payload.inline_images, [
          { name: "logo.bin", mime_type: "application/octet-stream", content: "AP+A", cid: "logo" },
        ]);
        assert.strictEqual(server.requests.length, 1);
      }),
  );
  it.effect.each([
    [new NetworkError("private-host"), "TransportError"],
    [new TimeoutError("private-host"), "TimeoutError"],
  ] as const)("classifies inherited transport failures before auth: %s", ([failure, tag]) =>
    Effect.gen(function* () {
      const email = yield* Email;
      const result = yield* email.send(message).pipe(Effect.result);
      assert.isTrue(Result.isFailure(result));
      if (Result.isFailure(result)) {
        assert.strictEqual(result.failure.reason._tag, tag);
        assert.notInclude(JSON.stringify(result.failure), "private-host");
      }
    }).pipe(
      Effect.provide(
        ZeptoMail.layerClient({
          sendMail: async () => {
            throw failure;
          },
        }),
      ),
    ),
  );
  it.effect(
    "keeps structured native error objects safe without inventing missing HTTP status",
    () =>
      Effect.gen(function* () {
        const server = yield* httpServer(() => ({
          status: 400,
          body: { error: { code: "TM_3004", message: "private-content" } },
        }));
        yield* Effect.gen(function* () {
          const email = yield* Email;
          const result = yield* email.send(message).pipe(Effect.result);
          assert.isTrue(Result.isFailure(result));
          if (Result.isFailure(result)) {
            assert.strictEqual(result.failure.providerCode, "TM_3004");
            assert.notInclude(JSON.stringify(result.failure), "private-content");
          }
        }).pipe(
          Effect.provide(
            ZeptoMail.layer({
              token: Redacted.make("offline-token"),
              url: new URL("/v1.1/email", server.url),
            }),
          ),
        );
        assert.strictEqual(server.requests.length, 1);
      }),
  );
});

it.effect("sanitizes the current CPaaS error envelope returned by SendMailClient", () =>
  Effect.gen(function* () {
    const server = yield* httpServer(() => ({
      status: 400,
      body: { data: { error_code: "TM_3004", message: "private-body" }, message: "error" },
    }));
    yield* Effect.gen(function* () {
      const email = yield* Email;
      const result = yield* email.send(message).pipe(Effect.result);
      assert.isTrue(Result.isFailure(result));
      if (Result.isFailure(result)) {
        assert.strictEqual(result.failure.reason._tag, "InvalidMessageError");
        assert.notInclude(JSON.stringify(result.failure), "private-body");
      }
    }).pipe(
      Effect.provide(
        ZeptoMail.layer({
          token: Redacted.make("offline-token"),
          url: new URL("/v1.1/email", server.url),
        }),
      ),
    );
  }),
);
