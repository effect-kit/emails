# @effect-kit/emails

Effect v4 native email services and contracts. Core sending works through custom provider Layers.
The public testing Layer captures offline submissions. All 16 provider adapters are available through
optional SDK subpaths; see the [support table](docs/providers/README.md) for installation, configuration,
capabilities and native cancellation limits. Optional [React rendering](docs/rendering.md) and
[bounded portable batches](docs/batch.md) are available.
The [reliability guide](docs/reliability.md) and [evidence matrix](docs/providers/evidence.md) describe
tested guarantees, safe telemetry and provider-specific limits.

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
  Built-in adapters expose only recognized diagnostic codes; unfamiliar code-shaped text is omitted
  because it can echo credentials or content. Typed failure reasons and acceptance evidence remain.

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

Built-in Layers capture validated routing, stream, timeout and mode settings during acquisition.
Changing the supplied configuration object later does not reconfigure an acquired service; acquire
a new Layer to change settings. Borrowed native clients remain controlled by their owner.

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
Outcomes are accepted, partiallyAccepted, failed, interrupted or defect. Expected failures include
acceptance evidence; recipient/attachment counts appear after validation and capability checks.
Defects keep their original Cause, including any sensitive programmer-supplied text in the span's
failure status. Configure application exporters/loggers accordingly; the library does not erase defects.

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
(URL) and timeout (Effect Duration, default 30 seconds). Base URLs require HTTP(S), without URL
credentials, query strings or fragments. `layerClient(client, { timeout? })` borrows a
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

## Nodemailer / SMTP

```sh
pnpm add @effect-kit/emails effect nodemailer@10.2.1
```

```ts
import * as Nodemailer from "@effect-kit/emails/nodemailer";

const live = Nodemailer.layer({
  transport: {
    host: "smtp.example.com",
    port: 465,
    secure: true,
    auth: { user: smtpUser, pass: smtpPassword }, // pass is Redacted<string>
    pool: true,
    maxConnections: 5,
  },
});
```

The tested SDK/peer is exactly 10.2.1. This is a Node-only adapter. Its public structural client/config
types do not expose Buffer or SDK-wide declarations. layerConfig() reads SMTP_HOST, SMTP_PORT (587),
SMTP_SECURE (false), SMTP_USER and SMTP_PASSWORD through Effect Config; default Config requires auth.
Pass a custom Config<NodemailerConfig> for anonymous SMTP or other settings. Acquisition failures
are ConfigError or NodemailerConfigurationError, separate from send failures.

transport supports host/port, secure/requireTLS, password auth, pool/maxConnections/maxMessages and
connectionTimeout/greetingTimeout/socketTimeout as positive finite Effect Durations. Defaults are
10s connection, 10s greeting and 30s socket waits. Top-level timeout bounds the Effect operation to
30s by default. Credentials are unwrapped only while constructing the SDK transport.

Owned transports disable pool requeues (maxRequeues: 0) and raw SDK logging. They are acquired once
per Layer scope and closed on release, including acquisition failure after creation. Closing drains
already-started native operations using configured socket inactivity timeouts; cleanup can outlast
the Effect operation's deadline. An active peer can prolong cleanup, so there is no fixed wall-clock
shutdown bound. SMTP cannot cancel one send. Interruption/timeout does not prove remote rejection;
owned scope cleanup waits for in-flight native completion.

layerClient(client, { timeout? }) borrows an SMTP-compatible transporter and never closes or mutates
it. A native borrowed pool must explicitly configure maxRequeues: 0 or acquisition fails. Custom
clients own their retry/logging/socket-timeout policy. A borrowed native operation can continue after
Effect interruption; closing the caller's pool to cancel one message would disrupt other callers.

Message translation fixes the SMTP envelope to the declared sender/recipients, protects BCC privacy,
and supplies byte-only attachments with explicit encoding. File/URL reads are disabled on every
message. Core fields and raw/alternative content are supplied explicitly to prevent content defaults
from changing them. Borrowed plugins remain trusted application code; avoid defaults/plugins that
change recipients or MIME content. Advanced OAuth, DKIM, custom TLS and other SDK configuration can
use an application-configured borrowed client.

Receipts distinguish SMTP Message-ID references from provider lookup IDs. Outcomes use original
role/index positions, including duplicates. Domain case is ignored for association; local-part case
is preserved. Ambiguous/missing evidence stays unknown. Explicit mixed acceptance returns
partiallyAccepted; all-recipient rejection is typed. Raw server response text is never retained.
SMTP response class and stage determine failures: temporary errors differ from permanent auth or
recipient rejection; connection loss after DATA stays unknown. Generic SMTP has no idempotency
guarantee, so explicit keys fail before transport invocation.

Local tests use real SMTP sockets and parsed MIME, including rejections, DATA disconnect, interruption,
pool ownership, native deadlines and file/URL protection. No external SMTP service was used.
