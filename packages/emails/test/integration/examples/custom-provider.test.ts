import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer } from "effect";

import type { NormalizedEmailMessage } from "@effect-kit/emails";

import {
  CompanyMailClient,
  companyLayer,
  offlineLayer,
  sendWelcome,
} from "../../../examples/custom-provider.js";

describe("public custom-provider examples", () => {
  it.effect("runs the explicitly offline Layer example", () =>
    Effect.gen(function* () {
      const result = yield* sendWelcome.pipe(Effect.provide(offlineLayer));
      assert.strictEqual(result.provider, "example");
    }),
  );

  it.effect("captures an application-owned client through Layer composition", () =>
    Effect.gen(function* () {
      const captured: NormalizedEmailMessage[] = [];
      const clientLayer = Layer.succeed(CompanyMailClient, {
        submit: (message) =>
          Effect.sync(() => {
            captured.push(message);
            return { provider: "company", status: "accepted" as const, references: [] };
          }),
      });

      const result = yield* sendWelcome.pipe(
        Effect.provide(companyLayer.pipe(Layer.provide(clientLayer))),
      );
      assert.strictEqual(result.provider, "company");
      assert.deepStrictEqual(captured[0]?.to, [{ email: "ada@example.com" }]);
    }),
  );
});
