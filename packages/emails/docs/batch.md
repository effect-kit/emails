# Portable batch sending

`Email.sendMany(requests, options?)` acquires the selected `Email` service and calls its existing
`send` method for each valid request. All built-in and custom Layers work without a batch adapter
method. It returns `Effect<ReadonlyArray<SendOutcome>, BatchError, Email>`, where each `SendOutcome`
is Effect's `Result<SendReceipt, EmailError>` at the corresponding input index.

```ts
import { Effect, Result } from "effect";

import { Email } from "@effect-kit/emails";

const program = Effect.gen(function* () {
  const outcomes = yield* Email.sendMany(
    [
      {
        message: {
          from: "hello@example.com",
          to: "ada@example.com",
          subject: "Welcome",
          text: "Your account is ready.",
        },
        // Optional, only with a supporting provider:
        options: { idempotencyKey: "welcome/account-123" },
      },
    ],
    { concurrency: 5 },
  );
  return outcomes.map((outcome) => (Result.isSuccess(outcome) ? outcome.success : outcome.failure));
});
// Provide your chosen Email Layer at the application boundary.
```

`EmailRequest` and `BatchOptions` are exported schemas and types. Requests contain `message` and
optional `options` with the ordinary single-send options. Unknown fields are rejected, including
an idempotency key misplaced on the request envelope. Nothing generates or rewrites keys. Generic
SMTP and other providers without idempotency reject explicit keys through their normal send boundary.

Concurrency defaults to **5** and must be an integer from **1 through 1,000**. Each invocation accepts
an in-memory array of **at most 1,000 requests**; an empty array returns an empty result. Non-array or
oversized inputs fail with `BatchError` reason `InvalidRequests`. Invalid or unknown batch options fail
with reason `InvalidOptions`. These failures happen before any submission and contain no input values.
The helper adds no native provider batching, retries, failover or provider selection.

Each execution validates and snapshots all entries before starting sends, copying attachment bytes
and preserving each request's options. Mutating queued requests while earlier sends are in flight
cannot change their contents or keys. The memory cost includes all attachment bytes, plus the selected
adapter's per-send snapshot/encoding for active submissions. Workers should bound total bytes as well
as request count and split large jobs into application-managed chunks; there is no streaming API.

Expected per-email failures, including invalid messages/options and unsupported features, become
failure Results; other requests continue. These errors retain the selected provider name and acceptance
evidence. Invalid entries are `EmailError` with `InvalidMessageError` and `notSubmitted` acceptance.
Validation paths use the core safe field vocabulary; envelope/unknown field names become `*`. Successful Results retain
the full receipt, including `partiallyAccepted` recipient evidence. Returned order follows input order,
even when completion order differs. Acceptance still describes submission, not inbox delivery.

Defects and interruption keep normal Effect semantics: the batch terminates without a complete result
array, queued work is skipped and running fibers are interrupted. Earlier acceptances are not rolled
back. Native SDK operations may continue after local interruption according to the selected provider's
cancellation limits; interruption never proves remote non-acceptance. There is no atomic transaction or
durable progress record. Workers needing recovery across cancellation/crashes should persist per-send
evidence at their own submission boundary and use an outbox/stable logical keys where supported.
Do not blindly retry an entire batch after interruption or unknown acceptance.

The repository's `examples/batch.ts` runs offline with `EmailTest.layer()`. Tests cover ordered mixed
outcomes, partial receipts, input snapshots, concurrency, defects/interruption, real Resend SDK requests
over controlled fetch and real SMTP over loopback. No live email credentials are needed.
