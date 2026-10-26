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

  it("preserves partial acceptance and recipient-scoped references", () => {
    const receipt = {
      provider: "custom",
      status: "partiallyAccepted",
      references: [],
      recipients: [
        {
          role: "to",
          index: 0,
          status: "accepted",
          references: [{ kind: "providerMessageId", value: "message-1" }],
        },
        { role: "bcc", index: 0, status: "rejected", rejectionCode: "SUPPRESSED" },
      ],
    };

    expect(Schema.decodeUnknownSync(SendReceipt)(receipt)).toEqual(receipt);
  });

  it.each([
    { status: "partiallyAccepted" },
    { recipients: [{ role: "to", index: 0, status: "rejected" }] },
    { recipients: [{ role: "to", index: -1, status: "accepted" }] },
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
