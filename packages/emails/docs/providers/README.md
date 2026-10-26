# Provider support

Install `@effect-kit/emails` and `effect`, then only the SDKs listed for your chosen subpath.
Each module exposes `layer`, `layerClient` and `layerConfig`; the application still uses the same
`const email = yield* Email; yield* email.send(message, options)` workflow. Root/core/testing imports
never load a provider SDK. SDK versions are pinned to locally verified releases.

| Provider / subpath                                                                 | Additional peer dependencies                              | Verified limits                                                                                |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [Resend](../../README.md#resend) · `/resend`                                       | `resend@6.34.1`                                           | Explicit keys replay for 24 hours; native abort                                                |
| [Nodemailer / SMTP](../../README.md#nodemailer--smtp) · `/nodemailer`              | `nodemailer@10.2.1`                                       | Multiple reply-to addresses; native socket deadlines, no dedupe                                |
| [AWS SES v2](ses.md) · `/ses`                                                      | `@aws-sdk/client-sesv2@3.1157.0`                          | Native abort; owned client uses one attempt                                                    |
| [Azure Communication Email](azure.md) · `/azure`                                   | `@azure/communication-email@1.1.0`                        | Resource-controlled sender name; bounded polling with operation ID                             |
| [Postmark](postmark.md) · `/postmark`                                              | `postmark@5.1.0`                                          | No per-send abort; owned native deadline                                                       |
| [SendGrid](sendgrid.md) · `/sendgrid`                                              | `@sendgrid/mail@8.1.6`                                    | Single reply-to; isolated client, native deadline                                              |
| [Mailgun](mailgun.md) · `/mailgun`                                                 | `mailgun.js@14.1.0`, `form-data@4.0.5`                    | Explicit domain/region; independent inline CID/filename unsupported                            |
| [MailerSend](mailersend.md) · `/mailersend`                                        | `mailersend@3.6.0`                                        | Single reply-to; explicit attachment MIME unsupported; suppression outcomes retained           |
| [Brevo](brevo.md) · `/brevo`                                                       | `@getbrevo/brevo@6.2.0`                                   | Single reply-to; explicit attachment MIME unsupported; UUID duplicate rejection for 30 minutes |
| [Mailtrap](mailtrap.md) · `/mailtrap`                                              | `mailtrap@5.0.0`                                          | Single reply-to; explicit production/bulk/sandbox mode                                         |
| [Scaleway TEM](scaleway.md) · `/scaleway`                                          | `@scaleway/sdk-tem@2.16.3`, `@scaleway/sdk-client@2.16.0` | Paris region in current TEM metadata; CID unsupported; native abort                            |
| [Lettermint](lettermint.md) · `/lettermint`                                        | `lettermint@3.2.0`                                        | Qualified CID required; explicit keys replay for 24 hours; native abort                        |
| [eusend](eusend.md) · `/eusend`                                                    | `@eusend_dev/sdk@0.19.0`                                  | Explicit keys replay; no established retention/native send deadline                            |
| [ZeptoMail](zeptomail.md) · `/zeptomail`                                           | `zeptomail@8.0.1`                                         | Explicit account endpoint; no native send deadline; request ID metadata                        |
| [Mailchimp Transactional](mailchimp-transactional.md) · `/mailchimp-transactional` | `@mailchimp/mailchimp_transactional@1.4.1`                | Independent inline CID/filename unsupported; per-recipient partial outcomes                    |
| [Plunk](plunk.md) · `/plunk`                                                       | `@plunk/node@3.0.3`                                       | Deprecated SDK compatibility path: HTML, sender name, one unnamed TO only                      |

Except where the table states a limit, adapters support names, both body alternatives, CC/BCC,
multiple reply-to addresses, custom mail headers and canonical byte attachments/CID. Unsupported
fields fail before native submission. Core blocks routing, authorization, MIME and provider-control
headers. No adapter fetches attachment paths/URLs or renders React implicitly.

A receipt acknowledges provider acceptance, never inbox delivery. Some providers return only request
or operation references; none are fabricated. Mailtrap and Lettermint sandbox modes are labeled in
receipts. No adapter adds retries. Owned SDK retry policies are disabled where configurable; borrowed
clients remain caller-owned and must follow the documented retry/deadline policy.

Every adapter has an Effect deadline, usually 30 seconds (Azure 60 seconds). A local deadline does
not imply native socket cancellation: consult its guide. Timeout/interruption/response loss can leave
acceptance unknown. Reconcile or reuse a verified provider key rather than blindly resubmitting.

Configuration failures are separate from EmailError. SES/Azure have dedicated configuration errors;
the other new adapters expose ProviderConfigurationError with safe provider/field metadata. Expected
send failures expose common tagged reasons without SDK causes, addresses, content or credentials.
New providers can use Email.make and Layer composition without changing core.

Verification is local: real SDKs with controlled HTTP/SMTP transports, shared conformance, packed
runtime imports and strict NodeNext/Bundler declarations with only selected peers. All 17 consumer
fixtures run through `pnpm test:consumer -- --fixture all`. No live-provider acceptance, account setup,
publication or guarantee about an untested SDK version is implied.
