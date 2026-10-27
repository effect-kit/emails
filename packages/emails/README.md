# @effect-kit/emails

Typed email sending for **Effect v4**. Use one `Email` service with your preferred provider,
Effect Layers, actionable errors, optional React rendering and bounded batches.

## Install

```sh
pnpm add @effect-kit/emails effect resend@6.34.1
```

Requires ESM, Node.js **24.22.0+** and Effect **^4.0.6**. Install only the SDK for your selected
provider. Core and testing imports need only Effect; React is optional.

## Quick start

```ts
import { Effect } from "effect";

import { Email } from "@effect-kit/emails";
import * as Resend from "@effect-kit/emails/resend";

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

// Reads RESEND_API_KEY through Effect Config.
const receipt = await Effect.runPromise(program.pipe(Effect.provide(Resend.layerConfig())));
```

Swap the provider Layer without changing the sending workflow. Every provider exposes `layer`,
`layerConfig` and `layerClient`; the last borrows an existing client without closing it.
Credentials use Effect `Config`/`Redacted`. Owned resources are scoped to their Layer.

Messages accept structured names, TO/CC/BCC, reply-to, text/HTML, custom mail headers and byte
attachments where supported. Attachments use `Uint8Array`, `filename`, `contentType` and optional
`contentId`; no attachment file or URL is fetched. Unsupported fields fail before submission.
Use `Email.make` and `Layer.succeed(Email, service)` to supply your own provider.

## Providers

Each subpath has optional, version-pinned SDK peers:

| Import subpath             | Additional packages                                       | Configuration / limits                                                             |
| -------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `/resend`                  | `resend@6.34.1`                                           | RESEND_API_KEY; explicit replay keys                                               |
| `/nodemailer`              | `nodemailer@10.2.1`                                       | SMTP transport; no idempotency                                                     |
| `/ses`                     | `@aws-sdk/client-sesv2@3.1157.0`                          | AWS_REGION and AWS credentials                                                     |
| `/azure`                   | `@azure/communication-email@1.1.0`                        | AZURE_EMAIL_CONNECTION_STRING; resource-controlled sender name                     |
| `/postmark`                | `postmark@5.1.0`                                          | POSTMARK_SERVER_TOKEN; optional messageStream                                      |
| `/sendgrid`                | `@sendgrid/mail@8.1.6`                                    | SENDGRID_API_KEY; one reply-to                                                     |
| `/mailgun`                 | `mailgun.js@14.1.0`, `form-data@4.0.5`                    | MAILGUN_API_KEY, MAILGUN_DOMAIN, MAILGUN_REGION; no inline CID                     |
| `/mailersend`              | `mailersend@3.6.0`                                        | MAILERSEND_API_KEY; one reply-to; canonical attachments unsupported                |
| `/brevo`                   | `@getbrevo/brevo@6.2.0`                                   | BREVO_API_KEY; one reply-to; no canonical attachments; UUID keys reject duplicates |
| `/mailtrap`                | `mailtrap@5.0.0`                                          | Explicit production/bulk/sandbox configuration; one reply-to                       |
| `/scaleway`                | `@scaleway/sdk-tem@2.16.3`, `@scaleway/sdk-client@2.16.0` | Project/credentials, fr-par; no inline CID                                         |
| `/lettermint`              | `lettermint@3.2.0`                                        | LETTERMINT_SENDING_TOKEN; qualified CIDs; replay keys                              |
| `/eusend`                  | `@eusend_dev/sdk@0.19.0`                                  | EUSEND_API_KEY; replay keys without a promised retention window                    |
| `/zeptomail`               | `zeptomail@8.0.1`                                         | ZEPTOMAIL_TOKEN and explicit ZEPTOMAIL_URL                                         |
| `/mailchimp-transactional` | `@mailchimp/mailchimp_transactional@1.4.1`                | MAILCHIMP_TRANSACTIONAL_API_KEY; no inline CID                                     |
| `/plunk`                   | `@plunk/node@3.0.3`                                       | PLUNK_API_KEY; deprecated SDK subset: HTML and one unnamed TO only                 |

All adapters share the send API; feature and account restrictions differ. SDK versions have local
transport/consumer coverage. Live acceptance, inbox delivery and untested SDK versions are not implied.

## React rendering

```sh
pnpm add @react-email/render@2.1.1 react@19.3.1 react-dom@19.3.1
pnpm add -D @types/react@19.3.0
```

```tsx
import { Effect } from "effect";

import * as EmailReact from "@effect-kit/emails/react";

const Welcome = ({ name }: { name: string }) => <p>Hello {name}!</p>;

const content = await Effect.runPromise(EmailReact.render(<Welcome name="Ada" />));
// Spread content into email.send({ from, to, subject, ...content }).
```

Rendering runs once and returns matching `{ html, text }`. Choose `{ mode: "html" }` or
`{ mode: "text" }` for one body. Expected rendering failures use `RenderError`; component bugs
remain defects. Use trusted templates: rendering is not an HTML sanitizer.

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

Provide your selected Email Layer. Results preserve input order as `Result<SendReceipt, EmailError>`.
The helper accepts up to 1,000 requests, defaults to 5 concurrent sends and preserves explicit keys.
Providers without idempotency reject keys. Invalid batch settings fail with `BatchError` before I/O.
Batches are in-memory and non-atomic; interruption/defects preserve normal Effect semantics.

## Testing

`EmailTest.layer()` provides Email and the recording `EmailTest` service without network access:

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

`EmailError` contains a tagged reason and `notSubmitted`, `rejected` or `unknown` acceptance evidence.
Use `Effect.catchReason("EmailError", "RateLimitedError", handler)` for reason-specific recovery.
Reasons distinguish invalid/unsupported messages, authentication, permissions, rate/quota limits,
recipient/message rejection, idempotency conflicts, transport failures and uncertain responses.

Receipts describe accepted or partially accepted submission, never guaranteed inbox delivery.
There are no automatic retries or provider failover. A timeout, interruption or lost response can
follow remote acceptance; reconcile before resending. Native SDK cancellation varies, and SMTP cleanup
uses inactivity timers rather than a fixed shutdown deadline. Borrowed clients own their native policy.

One `Email.send` span records safe operational attributes without payloads or keys. Applications own
exporters, logging, retry/outbox policy and sensitive programmer defects. Expected errors omit raw SDK
causes and unrecognized diagnostic text.

## License

[Apache-2.0](https://github.com/effect-kit/emails/blob/main/LICENSE).
Copyright 2026 Effect Kit Contributors.
