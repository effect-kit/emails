import { Duration, Schema } from "effect";

import { EmailCapabilities } from "@effect-kit/emails";
import { describe, expect, it } from "vitest";

import { capabilities } from "../../fixtures/email.js";

describe("capabilities", () => {
  it("rejects capability contradictions and invalid deduplication horizons", () => {
    expect(Schema.is(EmailCapabilities)({ ...capabilities, html: false })).toBe(false);
    expect(Schema.is(EmailCapabilities)({ ...capabilities, attachments: false })).toBe(false);
    expect(
      Schema.is(EmailCapabilities)({
        ...capabilities,
        idempotency: { mode: "replay", retention: Duration.infinity },
      }),
    ).toBe(false);
  });
});
