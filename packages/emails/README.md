# @effect-kit/emails

Effect v4 native email services and contracts. Core sending works through custom provider Layers.
The public testing Layer captures offline submissions. Resend is available as an optional adapter;
other SDK adapters, React rendering and batching are planned separately.

```ts
import { Schema } from "effect";

import { EmailMessage } from "@effect-kit/emails";

const message = Schema.decodeUnknownSync(EmailMessage)({
  from: "hello@example.com",
  to: ["ada@example.com"],
  subject: "Welcome",
  text: "Your account is ready.",
});
```

- Addresses accept bare ASCII dot-atom local parts and DNS domains (including punycode); quoted local
  parts, domain literals, display-name strings and internationalized local parts are outside this
  initial grammar. Use `{ email, name }` for Unicode display names. Address case/order is preserved.
- Provide a nonblank subject and at least one nonblank text/HTML body. Omit unused optional values.
  Dynamic recipient arrays are supported and must be nonempty. Body line breaks are valid.
- Attachments use Uint8Array, a filename and a base MIME type. Empty files are valid. Optional
  contentId values must be unique. Providers may impose additional constraints.
- Custom headers reject control characters, reserved routing/content/authorization/provider-control
  names and case-insensitive duplicates. Header values may be empty; metadata cannot be blank.
- SendReceipt describes accepted/partially accepted submission, not delivery. References distinguish
  provider IDs, SMTP Message-IDs and asynchronous operation IDs; no ID is fabricated when absent.
- EmailError carries typed reasons and acceptance evidence: notSubmitted, rejected or unknown. Retry
  hints/retention use finite nonnegative Effect Duration values. Raw provider errors are not a field.

Schemas and their TypeScript types share exported names. Direct schema decoding returns Effect's
ordinary SchemaError; callers must not log rejected input or schema errors containing sensitive data.

The package is ESM-only and requires Effect ^4.0.6. Core has no SDK, React or Node transport dependency.
Only dist/, this README and the Apache-2.0 license are included in the package tarball.

## Custom provider

```ts
import { Effect, Layer } from "effect";

import { Email } from "@effect-kit/emails";

// Offline example: acknowledges locally and does not deliver an email.
const ExampleLive = Layer.succeed(
  Email,
  Email.make({
    provider: "example",
    capabilities: {
      text: true,
      html: false,
      htmlAndText: false,
      senderName: false,
      cc: false,
      bcc: false,
      replyTo: "none",
      headers: false,
      attachments: false,
      inlineAttachments: false,
      idempotency: { mode: "unsupported" },
    },
    send: () =>
      Effect.succeed({
        provider: "example",
        status: "accepted",
        references: [],
      }),
  }),
);

const program = Effect.gen(function* () {
  const email = yield* Email;
  return yield* email.send({
    from: "hello@example.com",
    to: "ada@example.com",
    subject: "Welcome",
    text: "Your account is ready.",
  });
}).pipe(Effect.provide(ExampleLive));
```

Email.make validates input, enforces capabilities, normalizes addresses to mailbox objects/lists and
checks receipt shape/provider/recipient positions. Unknown message/options/receipt fields fail rather
than disappear. Invalid input is EmailError/InvalidMessageError with safe bounded field paths; unknown
record keys become `*`. An unsupported request is UnsupportedFeatureError before the adapter runs.

Each execution takes a fresh snapshot of mailbox/recipient/header/attachment metadata and copies
attachment bytes. Mutating input before execution affects that execution; later mutations cannot
change the adapter's copy. The adapter callback accepts NormalizedEmailMessage and SendOptions and
returns Effect<SendReceipt, EmailError> with no hidden service requirements. Capture infrastructure
inside Layer.effect, then return Email.make with a callback closing over that client. See the tracked
examples/custom-provider.ts in the repository for both forms.

Invalid provider/capability configuration passed to make throws a safe TypeError. Fallible application
configuration belongs in Layer acquisition. Email.of is the trusted low-level Context constructor;
it deliberately bypasses make's validation, normalization and instrumentation.

## Failures and reliability

Use Effect.catchReason("EmailError", "RateLimitedError", handler) or Effect.catchReasons to recover
from specific tagged reasons. Expected failures remain typed; unexpected callback bugs are defects
and interruption remains interruption. SDK Promise bridges should use Effect.tryPromise and forward
its AbortSignal. Our core does not acquire/close your clients, run a runtime or start workers.

A successful receipt is submission acknowledgment. Partially accepted receipts require both explicit
accepted and rejected recipient evidence; absent/unknown recipient evidence never implies delivery.
A malformed response after invoking the adapter becomes UnexpectedResponseError with unknown acceptance.
All rejected recipients should be mapped by the adapter into RecipientRejectedError.

There are no implicit retries, failover or generated idempotency keys. An explicitly supplied key is
forwarded only when the adapter declares support, with provider-specific replay vs duplicate rejection
semantics. A timeout after submission can mean an accepted email; choose reconciliation/retry policy
in the application. Reference values are evidence for lookup, not a deduplication guarantee.

One Email.send span records provider, outcome/reason and counts, without adding recipient addresses,
subjects, content or keys. Custom adapters are responsible for safe error metadata/references and
should not add sensitive span attributes or raw SDK causes. External exporters/logging remain yours.

## Testing an application

```ts
import { Effect } from "effect";

import { Email } from "@effect-kit/emails";
import { EmailTest } from "@effect-kit/emails/testing";

const check = Effect.gen(function* () {
  const email = yield* Email;
  yield* email.send({
    from: "hello@example.com",
    to: "ada@example.com",
    subject: "Welcome",
    text: "Your account is ready.",
  });

  const recorder = yield* EmailTest;
  return yield* recorder.messages;
}).pipe(Effect.provide(EmailTest.layer()));
```

`EmailTest.layer(options?)` provides both Email and EmailTest with fresh Ref-backed state per Layer
acquisition. Normal Layer sharing applies within a scope; independent scopes start empty. The default
provider is `test`. Successful default receipts have synthetic `email-test-N` references local to that
acquisition; they do not identify delivered emails. Nothing is sent, logged or written to disk.

`messages` returns fresh snapshots of normalized attempts, including failed, defective or interrupted
attempts. It does not claim they succeeded. Invalid/unsupported input is excluded, as it fails before
the test adapter runs. Observations cannot mutate internal metadata or attachment bytes.

Options accept `provider`, a complete `capabilities` descriptor and `responses`, an ordered array of
`Effect<SendReceipt, EmailError>`. For example, `responses: [Effect.fail(error), Effect.succeed(receipt)]`
scripts a failure followed by a successful attempt. Scripts reserve one slot atomically when submission
starts, including under concurrency; completion order can differ. If supplied, a script is finite:
exhaustion is a defect so extra attempts cannot pass silently. An empty script expects no attempts.
Omit it for default successes. Script errors/defects/interruption retain their normal Effect semantics;
close over dependencies before supplying response Effects. Script receipts still undergo core checks.

Default capabilities support all message fields with multiple replyTo addresses; idempotency is
unsupported. Supply capabilities matching your real provider to test restrictions. Capability overrides
test feature enforcement; this Layer does not emulate provider deduplication, limits, retries or network
protocols. Explicitly script those outcomes when testing application policy.

## Resend

```sh
pnpm add @effect-kit/emails effect resend@6.34.1
```

```ts
import { Config, Effect, Redacted } from "effect";

import * as Resend from "@effect-kit/emails/resend";

// Resolve RESEND_API_KEY through the application's Effect ConfigProvider.
const live = Resend.layerConfig();
// Or supply an already redacted credential: Resend.layer({ apiKey }).
// Custom configuration: Resend.layerConfig(Config.all({ apiKey: Config.Redacted("MAIL_KEY") })).
// Reuse a client: Resend.layerClient(client).
```

The tested SDK/peer is exactly 6.34.1. `ResendConfig` accepts apiKey (Redacted<string>), optional baseUrl
(URL) and timeout (Effect Duration, default 30 seconds). `layerClient(client, { timeout? })` borrows a
structural ResendClient; it does not mutate or close the client. Public declarations do not expose the
SDK's React/Buffer types, so using our owned factory requires neither React nor a renderer.

All core message features are supported, including multiple replyTo addresses and inline attachments.
Names are quoted/escaped and bytes encoded once. Explicit idempotency keys have a 256-character limit;
the provider documents replay for 24 hours. Key conflicts remain typed with unknown acceptance because
a matching operation may already exist. We generate no keys and add no retries or failover.
See [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys).

Resolved error envelopes and known Promise transport failures become safe EmailError values; 5xx,
transport failures, timeouts and malformed successes have unknown acceptance. Quota/rate/auth/permission
and validation reasons stay distinct. Nonnegative numeric Retry-After hints use Effect Duration; HTTP-date
hints are currently omitted. Success receipts retain provider IDs and valid x-request-id correlation.
Configuration acquisition can fail with ResendConfigurationError (safe field only) or ConfigError.

The owned client uses explicit endpoint/user-agent settings and suppresses the pinned SDK's raw-error
logging hook. Borrowed clients retain their own logging, endpoint and retry policy: SDK 6.34.1 logs raw
provider errors outside production, so applications using layerClient must configure their client/runtime
logging policy accordingly. AbortSignal reaches SDK requests; a timeout/interruption cannot prove remote
non-acceptance. Native batch, templates, scheduling and React rendering are outside this adapter.

Local tests run the real SDK through a controlled fetch transport; no live Resend send has been run.
