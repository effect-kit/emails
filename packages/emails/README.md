# @effect-kit/emails

Send transactional email with **Effect**. Write your email workflow once and choose a provider
through a Layer.

The shared API supports 16 providers, typed errors, attachments, React templates and batch sending
with controlled concurrency. Use the testing Layer to capture messages without making network calls.

## Install

```sh
pnpm add @effect-kit/emails effect resend
```

This package uses ESM and requires Node.js **24.22.0+**. Install Effect and the SDKs for your chosen
providers. Core and testing imports need only Effect; React is optional. Supported dependency
versions are listed in [package.json](https://github.com/effect-kit/emails/blob/main/packages/emails/package.json).

## Quick start

Set your Resend API key in the environment before running the program:

```sh
export RESEND_API_KEY="your-resend-api-key"
```

Read it through Effect Config and pass it explicitly to the Resend Layer:

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

`ConfigProvider.fromEnv()` reads the process environment. `Config.Redacted("RESEND_API_KEY")`
loads the named variable and wraps its value in `Redacted` so normal inspection hides the key.
`Config.all` builds the configuration passed to `Resend.layerConfig`. A missing variable fails
during Layer construction. If you use a `.env` file, load it before running the program.

Change the variable name in `Config.Redacted` or supply your own `ConfigProvider` to match your
application. Replace the sender address with your configured sender.

Every provider offers three ways to create an Email Layer:

- `layerConfig(config)` reads credentials and options through Effect Config.
- `layer(options)` accepts resolved options, with credentials wrapped in `Redacted`.
- `layerClient(client)` uses an existing SDK client; your application owns its lifecycle.

Switch providers by changing the Layer supplied to your program. Resources created by an adapter
are scoped to that Layer.

Messages support sender and recipient names, TO/CC/BCC, reply-to, text and HTML bodies, custom
headers and attachments, depending on the provider. Attachments contain `Uint8Array` bytes, a
`filename`, a `contentType` and an optional `contentId` for inline images. The package does not
fetch attachment files or URLs. Unsupported fields produce a typed error before submission.

To add your own provider, implement `EmailAdapter`, create a service with `Email.make`, and supply
it with `Layer.succeed(Email, service)`. The shared validation and error contract still apply.

## Providers

Import adapters from `@effect-kit/emails/<provider>`, such as `@effect-kit/emails/resend`.
Each adapter uses optional peer dependencies, so unused providers do not load their SDKs:

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

All adapters use the same send API, but provider features and account restrictions differ.
The supported SDK versions are tested with controlled transports and isolated package installs.
These tests do not establish live account acceptance or inbox delivery.

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

Rendering produces `{ html, text }` from one component render. Spread the result into `email.send`.
Use `{ mode: "html" }` or `{ mode: "text" }` when you need only one body. Expected rendering
failures use `RenderError`; component bugs remain Effect defects. Render trusted templates; the
renderer does not sanitize untrusted HTML.

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

Run this program with your Email Layer, as in the quick start. `Email.sendMany` sends up to 1,000
requests with a configurable concurrency limit (default: 5). It returns one
`Result<SendReceipt, EmailError>` per request, in input order, so an expected failure in one message
does not discard the other results.

Idempotency keys are passed through unchanged; providers without idempotency support reject them.
Invalid batch settings fail with `BatchError` before sending. Batches run in memory and can partly
succeed. Defects and interruption follow normal Effect semantics.

## Testing

Replace the provider Layer with `EmailTest.layer()` in tests. It supplies the same `Email` service
and a recorder for inspecting submitted messages, without network access:

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

Sending failures use `EmailError`, with a tagged reason you can handle through Effect. For example,
`Effect.catchReason("EmailError", "RateLimitedError", handler)` handles a rate limit specifically.
Other reasons cover invalid messages, unsupported features, credentials, permissions, quotas,
recipient rejection, idempotency conflicts and transport failures.

The `acceptance` field records what is known about submission:

| Value          | Meaning                                                      |
| -------------- | ------------------------------------------------------------ |
| `notSubmitted` | The message was not submitted to the provider.               |
| `rejected`     | The provider explicitly rejected the submission.             |
| `unknown`      | The provider may have accepted it; the outcome is uncertain. |

A receipt records that the provider accepted all or part of a submission; it does not guarantee
inbox delivery. The package does not retry submissions or switch providers automatically. A timeout
or lost response can happen after acceptance, so check the provider outcome before resending.

Cancellation support depends on the SDK. SMTP cleanup uses inactivity timers, without a fixed
shutdown deadline. When supplying an existing client, your application controls its retries,
timeouts and logging.

Each send creates an `Email.send` tracing span with operational attributes. Message content and
credentials are excluded. Expected errors omit raw SDK causes and unrecognized diagnostic text.
Your application controls telemetry exporters, logging, durable queues and retry policy. Programmer
defects retain their original causes, so apply your own policy when exporting them.

## License

[Apache-2.0](https://github.com/effect-kit/emails/blob/main/LICENSE).
Copyright 2026 Effect Kit Contributors.
