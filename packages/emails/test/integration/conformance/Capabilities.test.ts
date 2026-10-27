import { assert, describe, it } from "@effect/vitest";
import { Duration, Effect, Result } from "effect";

import { Email } from "@effect-kit/emails";

import {
  capabilityMessage,
  capabilityPayloads,
  rejectedCapabilityRequests,
} from "#/test/fixtures/conformance/capabilities.js";
import { providerCases } from "#/test/fixtures/conformance/providers.js";

describe("advertised provider capabilities", () => {
  it.effect.each(providerCases)(
    "preserves $name bodies, Unicode names, visibility, reply-to, headers and supported byte/CID metadata",
    (provider) =>
      Effect.gen(function* () {
        let payload: unknown;
        let attempts = 0;
        yield* Effect.gen(function* () {
          const email = yield* Email;
          yield* email.send(capabilityMessage(provider.name));
        }).pipe(
          Effect.provide(
            provider.layer(async (_signal, request) => {
              attempts++;
              payload = request;
              if (provider.name === "nodemailer")
                return {
                  accepted: [
                    "ada@example.com",
                    "grace@example.com",
                    "copy@example.com",
                    "private@example.com",
                  ],
                  rejected: [],
                };
              if (provider.name === "mailchimp-transactional")
                return [
                  "ada@example.com",
                  "grace@example.com",
                  "copy@example.com",
                  "private@example.com",
                ].map((email, index) => ({ email, status: "queued", _id: `id-${index}` }));
              return provider.response;
            }, Duration.seconds(1)),
          ),
        );
        const expected = capabilityPayloads[provider.name];
        if (expected === undefined) throw new Error("Missing provider capability evidence");
        // Compare public SDK objects by their JSON fields, including byte-view boundaries.
        assert.deepNestedInclude(JSON.parse(JSON.stringify(payload)), expected);
        assert.strictEqual(attempts, 1);
      }),
  );

  it.effect.each(providerCases)(
    "rejects invalid and unsupported $name batch requests before I/O",
    (provider) =>
      Effect.gen(function* () {
        let attempts = 0;
        const cases = rejectedCapabilityRequests(provider.name);
        const outcomes = yield* Email.sendMany(cases.map(({ request }) => request)).pipe(
          Effect.provide(
            provider.layer(async () => {
              attempts++;
              return provider.response;
            }, Duration.seconds(1)),
          ),
        );
        assert.strictEqual(attempts, 0);
        assert.deepStrictEqual(
          outcomes.map((outcome) =>
            Result.isFailure(outcome)
              ? { reason: outcome.failure.reason._tag, acceptance: outcome.failure.acceptance }
              : { accepted: true },
          ),
          cases.map(({ reason }) => ({ reason, acceptance: "notSubmitted" as const })),
        );
        assert.notInclude(JSON.stringify(outcomes), "private-token");
      }),
  );
});
