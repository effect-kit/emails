import { Duration, Effect, Schema } from "effect";

import { EmailError, RateLimitedError } from "@effect-kit/emails";
import { describe, expect, it } from "vitest";

describe("email errors", () => {
  it("encodes safe typed errors and handles a specific reason with Effect v4", async () => {
    const error = new EmailError({
      provider: "custom",
      operation: "send",
      acceptance: "rejected",
      statusCode: 429,
      providerCode: "RATE_LIMITED",
      reason: new RateLimitedError({ retryAfter: Duration.seconds(2) }),
    });
    const encoded = Schema.encodeSync(EmailError)(error);
    expect(encoded.reason._tag).toBe("RateLimitedError");
    expect(JSON.stringify(encoded)).not.toContain("stack");

    const recovered = Effect.fail(error).pipe(
      Effect.catchReason("EmailError", "RateLimitedError", (reason) =>
        Effect.succeed(reason.retryAfter),
      ),
    );
    expect(Duration.toMillis((await Effect.runPromise(recovered)) ?? Duration.zero)).toBe(2_000);
  });
});
