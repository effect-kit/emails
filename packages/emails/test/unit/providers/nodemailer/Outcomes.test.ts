import { Result } from "effect";

import type { NormalizedEmailMessage } from "@effect-kit/emails";
import { expect, it } from "vitest";

import { fromNodemailerFailure } from "#/providers/nodemailer/Failure.js";
import { fromNodemailerResponse } from "#/providers/nodemailer/Response.js";

const message: NormalizedEmailMessage = {
  from: { email: "from@example.com" },
  to: [{ email: "Ada@example.com" }],
  bcc: [{ email: "ada@example.com" }],
  subject: "Private",
  text: "Private",
};

it("associates domain case but does not guess case-sensitive local parts", () => {
  const result = fromNodemailerResponse(
    { accepted: [{ address: "Ada@EXAMPLE.COM" }], rejected: [] },
    message,
  );
  expect(Result.isSuccess(result)).toBe(true);
  if (Result.isSuccess(result)) {
    expect(result.success.references).toEqual([]);
    expect(result.success.recipients?.map(({ status }) => status)).toEqual(["accepted", "unknown"]);
  }
});

it.each([
  { accepted: ["Ada@example.com"], rejected: ["Ada@example.com"] },
  { accepted: ["foreign@example.com"], rejected: [] },
  { messageId: "<smtp@example.com>" },
  { accepted: [], rejected: [] },
])("refuses contradictory, unrelated or absent SMTP acknowledgment evidence", (response) => {
  const result = fromNodemailerResponse(response, message);
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) expect(result.failure.acceptance).toBe("unknown");
});

it.each([
  ["CONNECT_TIMEOUT", "notSubmitted"],
  ["GREETING_TIMEOUT", "notSubmitted"],
  ["SOCKET_TIMEOUT", "unknown"],
])("uses %s evidence instead of guessing from CONN", (timeoutType, acceptance) => {
  const error = fromNodemailerFailure(
    Object.assign(new Error("private-network-details"), {
      code: "ETIMEDOUT",
      command: "CONN",
      timeoutType,
    }),
    message,
  );
  expect(error.reason._tag).toBe("TimeoutError");
  expect(error.acceptance).toBe(acceptance);
  expect(JSON.stringify(error)).not.toContain("private-network-details");
});

it("keeps unknown programmer failures as defects", () => {
  const bug = new Error("mapper bug");
  expect(() => fromNodemailerFailure(bug, message)).toThrow(bug);
});

it("sanitizes unfamiliar or malformed structured SMTP failures", () => {
  const failure = fromNodemailerFailure(
    Object.assign(new Error("private-provider-details"), {
      code: "FUTURE_SMTP_ERROR",
      responseCode: 9999,
    }),
    message,
  );
  expect(failure.reason._tag).toBe("ProviderError");
  expect(failure.acceptance).toBe("unknown");
  expect(failure.providerCode).toBe("FUTURE_SMTP_ERROR");
  expect(JSON.stringify(failure)).not.toContain("private-provider-details");
});
