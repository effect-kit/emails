import { assert, it } from "@effect/vitest";
import { Effect, Result, Schema } from "effect";
import type { Layer } from "effect";

import { Email, EmailError } from "@effect-kit/emails";
import * as Lettermint from "@effect-kit/emails/lettermint";
import * as Resend from "@effect-kit/emails/resend";
import { RateLimitError } from "lettermint";

import { message } from "#/test/fixtures/email.js";

const providers: ReadonlyArray<{ name: string; layer: Layer.Layer<Email, unknown> }> = [
  {
    name: "resend",
    layer: Resend.layerClient({
      emails: {
        send: async () => ({
          data: null,
          error: { name: "rate_limit_exceeded", statusCode: 429 },
          headers: { "retry-after": "1e308" },
        }),
      },
    }),
  },
  {
    name: "lettermint",
    layer: Lettermint.layerClient({
      emails: {
        send: async () =>
          Promise.reject(
            new RateLimitError({
              status: 429,
              message: "private-provider-prose",
              retryAfter: 1e308,
            }),
          ),
      },
    }),
  },
];

it.effect.each(providers)(
  "omits overflowing $name retry hints and keeps errors schema-encodable",
  ({ layer }) =>
    Effect.gen(function* () {
      const email = yield* Email;
      const result = yield* email.send(message).pipe(Effect.result);
      assert.isTrue(Result.isFailure(result));
      if (Result.isFailure(result)) {
        assert.strictEqual(result.failure.reason._tag, "RateLimitedError");
        if (result.failure.reason._tag === "RateLimitedError")
          assert.isUndefined(result.failure.reason.retryAfter);
        const encoded = Schema.encodeSync(EmailError)(result.failure);
        assert.strictEqual(encoded.reason._tag, "RateLimitedError");
        assert.notInclude(JSON.stringify(encoded), "private-provider-prose");
      }
    }).pipe(Effect.provide(layer)),
);
