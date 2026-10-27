# Provider capability and reliability evidence

This matrix describes the implemented adapters at the exact SDK pins in the [support table](README.md).
Evidence is local and offline; live-provider/account acceptance and inbox delivery remain unverified.
Evidence links below refer to the repository checkout; tests are excluded from the npm tarball.

## Message capabilities

Every supported cell is exercised at the adapter-to-SDK boundary by
[Capabilities.test.ts](../../test/integration/conformance/Capabilities.test.ts), using independently
specified native fields in [the capability fixture](../../test/fixtures/conformance/capabilities.ts).
The fixture checks Unicode names/content, multiple TO recipients, independent CC/BCC roles, reply-to
cardinality, headers, MIME metadata, separate inline filenames/CIDs and binary subarray boundaries.
Provider SDK transport suites below additionally check actual serialization in their stated scenarios.

`T/H/B` means text-only, HTML-only and both alternatives. `S/R` means sender/recipient names.
`many` describes one message with shared recipient visibility; the adapter does not fan out sends.

| Adapter                 | Bodies | Names | TO   | CC/BCC | Reply-to | Headers    | Byte files | Inline CID |
| ----------------------- | ------ | ----- | ---- | ------ | -------- | ---------- | ---------- | ---------- |
| Resend                  | T/H/B  | S/R   | many | yes    | multiple | yes        | yes        | yes        |
| Nodemailer              | T/H/B  | S/R   | many | yes    | multiple | yes        | yes        | yes        |
| SES v2                  | T/H/B  | S/R   | many | yes    | multiple | yes        | yes        | yes        |
| Azure                   | T/H/B  | R     | many | yes    | multiple | yes        | yes        | yes        |
| Postmark                | T/H/B  | S/R   | many | yes    | multiple | yes        | yes        | yes        |
| SendGrid                | T/H/B  | S/R   | many | yes    | single   | yes        | yes        | yes        |
| Mailgun                 | T/H/B  | S/R   | many | yes    | multiple | yes        | yes        | no         |
| MailerSend              | T/H/B  | S/R   | many | yes    | single   | restricted | no         | no         |
| Brevo                   | T/H/B  | S/R   | many | yes    | single   | yes        | no         | no         |
| Mailtrap                | T/H/B  | S/R   | many | yes    | single   | yes        | yes        | yes        |
| Scaleway                | T/H/B  | S/R   | many | yes    | multiple | yes        | yes        | no         |
| Lettermint              | T/H/B  | S/R   | many | yes    | multiple | yes        | yes        | qualified  |
| eusend                  | T/H/B  | S/R   | many | yes    | multiple | yes        | yes        | yes        |
| ZeptoMail               | T/H/B  | S/R   | many | yes    | multiple | yes        | yes        | yes        |
| Mailchimp Transactional | T/H/B  | S/R   | many | yes    | multiple | yes        | yes        | no         |
| Plunk compatibility     | H      | S     | one  | no     | none     | no         | no         | no         |

Azure's sender name is resource-controlled. MailerSend header names require alphanumeric/hyphen
characters and account support. MailerSend/Brevo cannot preserve explicit attachment MIME metadata.
Mailgun/Mailchimp cannot preserve independent inline filename/CID; Scaleway exposes no CID field.
Lettermint requires qualified CIDs such as `logo@example.com` to prevent server rewriting. Plunk accepts
only one unnamed TO recipient. Its deprecated SDK is a deliberately limited compatibility path.

The same suite submits forbidden requests through `Email.sendMany` and requires typed `notSubmitted`
outcomes with zero native calls. Core validation also rejects control characters, reserved/duplicate
headers, malformed recipients and duplicate CIDs before adapter invocation. See
[message tests](../../test/unit/message/EmailMessage.test.ts) and
[service validation](../../test/unit/service/EmailValidation.test.ts).

## Submission, deadlines and ownership

All adapters have an Effect deadline, default 30 seconds except Azure's 60 seconds. `signal` below
means the adapter forwards interruption/deadline cancellation through the selected SDK API; it does
not prove that a remote submission was canceled. Native timeout settings do not prove rejection either.

| Adapter                 | Explicit key contract             | Owned submission policy                      | Native deadline/cancellation                             | Scope ownership                                       |
| ----------------------- | --------------------------------- | -------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------- |
| Resend                  | replay; declared 24h              | one SDK call, no retry wrapper               | signal                                                   | SDK has no disposal hook                              |
| Nodemailer              | unsupported                       | `maxRequeues: 0`                             | connection/greeting/socket inactivity; no per-send abort | close owned transport and drain pending sends         |
| SES v2                  | unsupported                       | `maxAttempts: 1`                             | signal                                                   | destroy owned client                                  |
| Azure                   | unsupported                       | `maxRetries: 0`; one beginSend, then polling | signal and stopPolling                                   | stop per-send poller; SDK has no client disposal hook |
| Postmark                | unsupported                       | one sendEmail, no retry wrapper              | owned SDK timeout; no per-send signal                    | SDK has no disposal hook                              |
| SendGrid                | unsupported                       | isolated client, one send                    | owned SDK timeout; no per-send signal                    | SDK has no disposal hook                              |
| Mailgun                 | unsupported                       | one messages.create, no retry wrapper        | owned SDK timeout; no per-send signal                    | no adapter-owned agent/close hook                     |
| MailerSend              | unsupported                       | fresh builders, one email.send               | local wait only; no public native deadline/signal        | no native cancellation/disposal hook                  |
| Brevo                   | duplicate rejection; declared 30m | client/request `maxRetries: 0`               | signal and SDK timeout                                   | SDK has no disposal hook                              |
| Mailtrap                | unsupported                       | one send, no retry wrapper                   | owned Axios timeout; no per-send signal                  | destroy both owned keep-alive agents                  |
| Scaleway                | unsupported                       | direct fetch transport, no retry wrapper     | signal and client timeout                                | platform fetch resources                              |
| Lettermint              | replay; declared 24h              | one direct emails.send                       | signal and SDK timeout                                   | platform fetch resources                              |
| eusend                  | replay; retention unpromised      | one direct emails.send                       | local wait only; no public native deadline/signal        | platform fetch resources                              |
| ZeptoMail               | unsupported                       | one sendMail, no retry wrapper               | local wait only; no public native deadline/signal        | no native cancellation/disposal hook                  |
| Mailchimp Transactional | unsupported                       | one messages.send; no global SDK mutation    | owned requestConfig timeout; no per-send signal          | no adapter-owned agent/close hook                     |
| Plunk compatibility     | unsupported                       | one scalar-recipient call                    | local wait only; no public native deadline/signal        | platform fetch resources                              |

Borrowed clients remain caller-owned. Their underlying retries, plugins, logging, endpoints and native
deadlines are caller policy, except Brevo also receives explicit zero-retry request options. Native
borrowed SMTP pools must explicitly set maxRequeues to zero. Other borrowed retry policies cannot
always be inspected reliably; configure them before supplying the client. No cross-provider failover,
blanket Effect retry or key generation is added by core or batch.

SMTP socketTimeout is an inactivity timer, not an absolute shutdown deadline. An active peer can
prolong native work and owned draining beyond the Effect deadline. The library cannot promise a fixed
wall-clock cleanup bound for that SDK path; the worker/process owner must account for it. The native
deadline gaps above are explicit support limitations, not skipped passing cancellation assertions.

Shared [provider contracts](../../test/integration/conformance/Providers.test.ts) exercise all 16 for
cold/repeated execution, malformed success, preserved defects, deadline uncertainty and caller
interruption with no second adapter invocation. These tests use structural native substitutes; they
do not establish a borrowed client's internal retry behavior. Resource evidence also includes
[SMTP ownership](../../test/integration/providers/nodemailer/Lifecycle.test.ts),
[SES close/acquisition failure](../../test/integration/providers/ses/Ses.test.ts),
[Mailtrap agents](../../test/integration/providers/mailtrap/Lifecycle.test.ts),
[acquired settings](../../test/integration/providers/configuration/Snapshot.test.ts) and
[endpoint rejection](../../test/integration/providers/configuration/Endpoints.test.ts).

## Real SDK transport and response evidence

These suites run installed SDKs through controlled fetch, in-memory Azure pipelines or loopback
HTTP/SMTP. Assertions check attempt counts and meaningful payload/error/reference evidence. None
requires provider credentials or establishes live server deduplication.

| Adapter    | Owning transport suite                                                                                                    | Additional response evidence                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Resend     | [Resend.test.ts](../../test/integration/providers/resend/Resend.test.ts)                                                  | fulfilled error unions, key placement, native abort, no raw owned SDK logging         |
| Nodemailer | [SMTP.test.ts](../../test/integration/providers/nodemailer/SMTP.test.ts)                                                  | parsed MIME/BCC privacy, partial RCPT rejection, DATA disconnect without requeue      |
| SES        | [Ses.test.ts](../../test/integration/providers/ses/Ses.test.ts)                                                           | signing, raw bytes, credential failure before submission, lost acknowledgments        |
| Azure      | [Azure.test.ts](../../test/integration/providers/azure/Azure.test.ts)                                                     | one POST/multiple polls, retained operation reference, failed/foreign operations      |
| Postmark   | [Postmark.test.ts](../../test/integration/providers/postmark/Postmark.test.ts)                                            | numeric vendor code distinct from HTTP status, inactive-recipient rejection           |
| SendGrid   | [SendGrid.test.ts](../../test/integration/providers/sendgrid/SendGrid.test.ts)                                            | independent credentials, shared personalization, empty 202 and message-ID header      |
| Mailgun    | [Mailgun.test.ts](../../test/integration/providers/mailgun/Mailgun.test.ts)                                               | binary multipart, explicit domain, HTTP failure without replay                        |
| MailerSend | [MailerSend.test.ts](../../test/integration/providers/mailersend/MailerSend.test.ts)                                      | independent builders, SOME/ALL_SUPPRESSED, empty asynchronous acknowledgment          |
| Brevo      | [Brevo.test.ts](../../test/integration/providers/brevo/Brevo.test.ts)                                                     | UUID body key, zero request retries, duplicate/conflict/quota reasons                 |
| Mailtrap   | [Mailtrap.test.ts](../../test/integration/providers/mailtrap/Mailtrap.test.ts)                                            | production/sandbox/bulk hosts, all returned IDs, nested Axios failure                 |
| Scaleway   | [Scaleway.test.ts](../../test/integration/providers/scaleway/Scaleway.test.ts)                                            | focused SDK transport, byte encoding, explicit project/region                         |
| Lettermint | [Lettermint.test.ts](../../test/integration/providers/lettermint/Lettermint.test.ts)                                      | qualified CID, explicit key, HTTP classes and rate timing                             |
| eusend     | [Eusend.test.ts](../../test/integration/providers/eusend/Eusend.test.ts)                                                  | byte/CID fields, keys, fulfilled failure/quota envelopes, null-header transport error |
| ZeptoMail  | [ZeptoMail.test.ts](../../test/integration/providers/zeptomail/ZeptoMail.test.ts)                                         | endpoint/token, nested addresses, legacy/CPaaS errors, inherited error classes        |
| Mailchimp  | [MailchimpTransactional.test.ts](../../test/integration/providers/mailchimp-transactional/MailchimpTransactional.test.ts) | mixed recipient results, role/index association, fulfilled Axios errors               |
| Plunk      | [Plunk.test.ts](../../test/integration/providers/plunk/Plunk.test.ts)                                                     | current configured host, scalar request, queued/throttled/skipped results             |

[Concurrent Azure operations](../../test/integration/providers/azure/Concurrency.test.ts) verify separate
accepted/uncertain references and reject contradictory initial identity. Batch tests retain ordered
mixed/partial outcomes, snapshot queued inputs and preserve interruption/defects; the
[provider batch suite](../../test/integration/batch/Providers.test.ts) also runs real Resend and SMTP.
The [reliability guide](../reliability.md) defines privacy, telemetry and remaining release requirements.
