# @effect-kit/emails

An email library built for **Effect**. Typed messages, provider Layers, React rendering and
bounded batches share one API across 16 providers.

Adapters use provider SDKs as optional peer dependencies. Core contracts and the testing Layer
require only Effect.

## Install

```sh
pnpm add @effect-kit/emails effect resend
```

Requires ESM and Node.js **24.22.0+**. Install the SDK for each selected provider; React dependencies
are required only for rendering. Supported peer versions are declared in
[package.json](https://github.com/effect-kit/emails/blob/main/packages/emails/package.json).

## Quick start

Provide a Resend Layer, then access the `Email` service. Configure `RESEND_API_KEY` in the process
environment:

```sh
export RESEND_API_KEY="your-resend-api-key"
```

Pass the API key configuration explicitly to `Resend.layerConfig`:

```ts
import { Config, ConfigProvider, Effect, Layer } from "effect";

import { Email } from "@effect-kit/emails";
import * as Resend from "@effect-kit/emails/resend";

const EmailLive = Resend.layerConfig(
  Config.all({
    apiKey: Config.Redacted("RESEND_API_KEY"),
  }),
).pipe(Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnv())));

const program = Effect.gen(function* () {
  const email = yield* Email;

  return yield* email.send({
    from: "hello@example.com",
    to: "ada@example.com",
    subject: "Welcome",
    text: "Your account is ready.",
    html: "<p>Your account is ready.</p>",
  });
});

const receipt = await Effect.runPromise(program.pipe(Effect.provide(EmailLive)));
```

`Config.all` maps `RESEND_API_KEY` to the adapter's `apiKey` option. `Config.Redacted` wraps the
credential in `Redacted`, hiding it from normal inspection. The supplied `ConfigProvider` reads
process environment variables; a missing key fails Layer acquisition. `.env` loading is
application-owned. Use a sender address configured with the provider.

### Layer construction

All adapters expose the same constructors:

- `layerConfig(config)` resolves an Effect Config value into adapter options.
- `layer(options)` accepts resolved options with `Redacted` credentials.
- `layerClient(client)` borrows a caller-owned SDK client without closing it.

Adapter-owned resources are scoped to their Layer. Replace the provider Layer without changing
the `Email` service contract.

## Messages and custom adapters

`EmailMessage` supports structured mailboxes, TO/CC/BCC, reply-to, text/HTML bodies, custom headers
and attachments. Attachments use `Uint8Array` bytes, `filename`, `contentType` and optional
`contentId`; filesystem paths and remote URLs are not fetched. Provider capabilities are checked
before submission, with unsupported fields reported as typed errors.

Custom providers implement `EmailAdapter`. `Email.make(adapter)` applies message validation,
capability checks, receipt validation and tracing. Supply the resulting service with
`Layer.succeed(Email, service)`.

## Providers

Each adapter has an explicit `@effect-kit/emails/<provider>` subpath and optional SDK peers.
Unused adapters do not load their dependencies.

| Import subpath             | Additional packages                         | Configuration / limits                                                                                        |
| -------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `/resend`                  | `resend`                                    | `RESEND_API_KEY`; idempotency keys can replay a previous response                                             |
| `/nodemailer`              | `nodemailer`                                | SMTP transport; no idempotency                                                                                |
| `/ses`                     | `@aws-sdk/client-sesv2`                     | `AWS_REGION` and AWS credentials                                                                              |
| `/azure`                   | `@azure/communication-email`                | `AZURE_EMAIL_CONNECTION_STRING`; sender display name configured on the Azure resource                         |
| `/postmark`                | `postmark`                                  | `POSTMARK_SERVER_TOKEN`; optional `messageStream`                                                             |
| `/sendgrid`                | `@sendgrid/mail`                            | `SENDGRID_API_KEY`; one reply-to                                                                              |
| `/mailgun`                 | `mailgun.js`, `form-data`                   | `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_REGION`; no inline images                                       |
| `/mailersend`              | `mailersend`                                | `MAILERSEND_API_KEY`; one reply-to; attachments unsupported through the shared API                            |
| `/brevo`                   | `@getbrevo/brevo`                           | `BREVO_API_KEY`; one reply-to; no attachments through the shared API; UUID idempotency keys reject duplicates |
| `/mailtrap`                | `mailtrap`                                  | Explicit production/bulk/sandbox configuration; one reply-to                                                  |
| `/scaleway`                | `@scaleway/sdk-tem`, `@scaleway/sdk-client` | Project and credentials; `fr-par` region; no inline images                                                    |
| `/lettermint`              | `lettermint`                                | `LETTERMINT_SENDING_TOKEN`; inline images need qualified content IDs; idempotency replay                      |
| `/eusend`                  | `@eusend_dev/sdk`                           | `EUSEND_API_KEY`; idempotency keys; retention window unspecified                                              |
| `/zeptomail`               | `zeptomail`                                 | `ZEPTOMAIL_TOKEN` and explicit `ZEPTOMAIL_URL`                                                                |
| `/mailchimp-transactional` | `@mailchimp/mailchimp_transactional`        | `MAILCHIMP_TRANSACTIONAL_API_KEY`; no inline images                                                           |
| `/plunk`                   | `@plunk/node`                               | `PLUNK_API_KEY`; deprecated SDK: HTML and one TO address without a name                                       |

Feature support depends on the adapter and provider account. SDK compatibility is covered by
controlled transports and isolated consumers; live acceptance and inbox delivery remain separate
provider guarantees.

## React rendering

```sh
pnpm add @react-email/render react react-dom
pnpm add -D @types/react
```

```tsx
import { Effect } from "effect";

import * as EmailReact from "@effect-kit/emails/react";

const Welcome = ({ name }: { name: string }) => <p>Hello {name}!</p>;

const content = await Effect.runPromise(EmailReact.render(<Welcome name="Ada" />));
// Spread content into email.send({ from, to, subject, ...content }).
```

`render` evaluates the component once and returns `{ html, text }` for use in `email.send`.
`{ mode: "html" }` and `{ mode: "text" }` select a single body. Expected rendering failures use
`RenderError`; component defects preserve their Effect causes. Rendering requires trusted
templates and does not sanitize untrusted HTML.

## Batch sending

```ts
import { Email } from "@effect-kit/emails";

const program = Email.sendMany(
  [
    {
      message: {
        from: "hello@example.com",
        to: "ada@example.com",
        subject: "Welcome",
        text: "Your account is ready.",
      },
      options: { idempotencyKey: "welcome/account-123" },
    },
  ],
  { concurrency: 5 },
);
```

Provide an Email Layer to execute the batch. `Email.sendMany` accepts up to 1,000 requests and
defaults to 5 concurrent submissions. Results preserve input order as
`Result<SendReceipt, EmailError>`; expected failures remain per-request.

Explicit idempotency keys are preserved. Providers without idempotency support reject them.
Invalid batch settings fail with `BatchError` before I/O. Batches are in-memory and non-atomic;
defects and interruption preserve normal Effect semantics.

## Testing

`EmailTest.layer()` provides `Email` and a recording `EmailTest` service without network access:

```ts
import { Effect } from "effect";

import { Email } from "@effect-kit/emails";
import { EmailTest } from "@effect-kit/emails/testing";

const captured = await Effect.runPromise(
  Effect.gen(function* () {
    const email = yield* Email;
    const recorder = yield* EmailTest;
    yield* email.send({
      from: "hello@example.com",
      to: "ada@example.com",
      subject: "Hello",
      text: "Offline",
    });
    return yield* recorder.messages;
  }).pipe(Effect.provide(EmailTest.layer())),
);
```

## Errors and reliability

`EmailError` carries a tagged reason and submission acceptance evidence. Handle specific reasons
with `Effect.catchReason("EmailError", "RateLimitedError", handler)`. Reasons distinguish message
validation, unsupported features, authentication, permissions, quotas, rejection, idempotency
conflicts and transport failures.

The `acceptance` field records what is known about submission:

| Value          | Meaning                                                      |
| -------------- | ------------------------------------------------------------ |
| `notSubmitted` | The message was not submitted to the provider.               |
| `rejected`     | The provider explicitly rejected the submission.             |
| `unknown`      | The provider may have accepted it; the outcome is uncertain. |

Receipts describe accepted or partially accepted submission, not inbox delivery. There are no
automatic retries or provider failover. Timeouts, interruption and lost responses can follow remote
acceptance; reconcile uncertain outcomes before resubmission.

Native cancellation depends on the SDK. SMTP cleanup uses inactivity timers without a fixed
shutdown deadline. Caller-owned clients retain their native retry, timeout and logging policies.

Each `Email.send` span records operational attributes without message content or credentials.
Expected errors omit raw SDK causes and unrecognized diagnostics. Exporters, logging and durable
retry policy are application-owned. Programmer defects retain their original causes and require
application-level handling when exported.

## License

[Apache-2.0](https://github.com/effect-kit/emails/blob/main/LICENSE).
Copyright 2026 Effect Kit Contributors.
