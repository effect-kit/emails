import { Schema } from "effect";

/** Batch-level input failure; individual message failures are returned in SendOutcome values. */
export class BatchError extends Schema.TaggedError<BatchError>()("BatchError", {
  reason: Schema.Literals(["InvalidRequests", "InvalidOptions"]),
}) {}
