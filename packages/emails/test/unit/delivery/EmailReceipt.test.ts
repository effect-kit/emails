import { Schema } from "effect";

import { SendReceipt } from "@effect-kit/emails";
import { describe, expect, it } from "vitest";

describe("submission contracts", () => {
  it("accepts typed references, absent recipient evidence and no fabricated ID", () => {
    const decode = Schema.decodeUnknownSync(SendReceipt);
    expect(decode({ provider: "custom", status: "accepted", references: [] }).references).toEqual(
      [],
    );
    expect(
      decode({
        provider: "custom",
        status: "accepted",
        references: [
          { kind: "smtpMessageId", value: "<123@example.com>" },
          { kind: "operationId", value: "operation-1" },
        ],
        recipients: [{ role: "to", index: 0, status: "unknown" }],
      }).recipients?.[0]?.status,
    ).toBe("unknown");
  });

  it.each([
    { status: "partiallyAccepted" },
    { recipients: [{ role: "to", index: 0, status: "rejected" }] },
    { recipients: [{ role: "to", index: 0, status: "accepted", rejectionCode: "BLOCKED" }] },
    {
      recipients: [
        { role: "to", index: 0, status: "accepted" },
        { role: "to", index: 0, status: "unknown" },
      ],
    },
  ])("rejects contradictory recipient/acceptance evidence: %j", (fields) => {
    expect(
      Schema.is(SendReceipt)({ provider: "custom", status: "accepted", references: [], ...fields }),
    ).toBe(false);
  });
});
