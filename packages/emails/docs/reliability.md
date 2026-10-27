# Reliability, privacy and observability

The [capability/evidence matrix](providers/evidence.md) records locally exercised adapter guarantees
and SDK limitations at the pinned versions. Acceptance always means submission acknowledgment;
it does not establish inbox delivery or an exactly-once transaction.

## Submission outcomes and retry policy

Invalid/unsupported requests fail before the native call. Expected send errors carry `notSubmitted`,
`rejected` or `unknown` acceptance evidence. Lost acknowledgments, malformed post-submission responses,
5xx failures and deadlines generally remain unknown. Partial receipts keep accepted/rejected recipient
positions; an application must not resend accepted recipients just because another was rejected.

No core or batch operation retries, generates keys or fails over to another provider. SDK-owned retry
settings are disabled where configurable. Borrowed clients need equivalent caller configuration;
the package cannot infer arbitrary middleware/plugin policies. Azure polls its original operation
without beginning another send. HTTP redirects remain the selected SDK's transport behavior; trusted
endpoint configuration does not make a third-party endpoint a trusted application authority.

Idempotency is provider-specific: replay and duplicate rejection have different reconciliation needs.
Keep the same key with the same logical email/content, and respect the declared retention window.
Keys, SMTP Message-IDs and lookup/request/operation references are not interchangeable guarantees.
References are opaque reconciliation evidence and may be confidential; there is no default payload
or reference logging. Use an application outbox/per-send evidence record when durable recovery matters.

`Email.sendMany` snapshots all entries, returns ordered expected outcomes and bounds concurrency.
It is in-memory and non-atomic. Interruption/defects terminate without a fabricated complete list;
earlier acceptances persist and native work may still complete. Limit attachment bytes as well as
request count and use application-managed chunks. See [batch behavior](batch.md).

## Ownership and input authority

Acquired services capture validated routing, stream and mode settings. Reacquire a Layer to change
configuration. Owned SES clients, SMTP transports and Mailtrap agents have scoped cleanup; borrowed
resources are never destroyed. Native deadline/cancellation and SMTP cleanup limits are explicit in
the matrix. An Effect deadline bounds local waiting, not every native operation or scope finalizer.

Endpoint settings are application configuration. Accepted URL overrides require HTTP(S), without
credentials/query/fragment; provider-specific path constraints also apply. HTTP is retained for
explicit compatible/loopback transports, with no implicit host allowlist or SSRF sandbox. Do not feed
untrusted end-user URLs into credentialed clients. SDK redirects and borrowed transport policy remain
the application's responsibility. The package never resolves attachment file paths/URLs.

Addresses use the documented ASCII local-part/DNS grammar, with Unicode display names and bodies.
Core rejects C0/DEL injection in metadata/headers, duplicate header names, reserved routing/MIME/auth
headers and ambiguous duplicate CIDs. Display names entering address strings are quoted/escaped.
Arbitrary MIME headers do not grant HTTP-header or provider-control privileges. Nodemailer additionally
disables file/URL access, raw/alternative content defaults and BCC header retention. Borrowed plugins
remain trusted application code. Attachment metadata and Uint8Array views are privately copied;
canonical byte length excludes unrelated bytes in the backing buffer. Encoded/native wire sizes and
provider limits can differ; there is no universal cross-provider message-size allowance.

## Expected diagnostics and defects

Built-in expected failures expose tagged reasons and bounded permitted metadata, excluding raw SDK
causes, requests/configs, provider prose, recipients and content. Invalid-message paths use a fixed safe
field vocabulary and mask arbitrary record keys. Provider/rejection codes use explicit recognized
values; a printable character/length check alone cannot prevent code-shaped tokens being echoed.
Unknown codes are omitted while typed reasons and acceptance evidence remain intact.
Retry hints are validated after conversion to finite, nonnegative Effect Durations. Missing, malformed
or overflowing hints are omitted, preserving the expected provider failure instead of causing a defect.

Custom adapters and `Email.of` are trusted extension boundaries. They own any metadata, exceptions,
logging and native retry behavior they introduce. Direct Schema decoding can retain rejected input
in SchemaError; do not send those diagnostics to logs without an application policy. React rendering
uses separate safe RenderError reasons and does not acquire a send client. It escapes through React,
does not sanitize raw HTML, and preserves unexpected component/renderer exceptions as defects.

Defects and interruption retain Effect semantics. The library does not scrub arbitrary programmer
exceptions or replace them with misleading expected failures. Their Causes and the tracer's failure
status may contain sensitive text. Configure application failure-status export/logging accordingly;
library-added operational attributes never copy defect messages.

## Trace contract

Each invocation through `Email.make` creates one `Email.send` span. The library adds these attributes:

| Attribute              | Values/purpose                                                          |
| ---------------------- | ----------------------------------------------------------------------- |
| email.provider         | Captured provider name, including explicit sandbox/bulk labels          |
| email.operation        | send                                                                    |
| email.outcome          | accepted, partiallyAccepted, failed, interrupted or defect              |
| email.reason           | Tagged expected failure reason; absent for ordinary interruption/defect |
| email.acceptance       | Expected failure evidence: notSubmitted, rejected or unknown            |
| email.recipient_count  | TO + CC + BCC count after validation and capability checks              |
| email.attachment_count | Attachment count after validation and capability checks                 |

There are no library-added addresses, domains, subjects, content, filenames, request IDs or keys in
attributes/events. Spans retain the runtime's normal status/Cause. Core/batch/render add no payload
logs, exporters or metrics. Custom provider names belong in traces; do not automatically turn arbitrary
names into unbounded metric labels. Applications own parent spans, exporters, sampling and redaction.
Batch entries rejected during envelope validation never invoke send and therefore create no send span.

Repository tests capture actual span attributes/events/status and serialize/inspect expected errors
with fake private sentinels. They also verify that original defects and interruption remain observable.
See test/integration/privacy/ and test/integration/observability/ in the repository checkout.

## Remaining release verification

Local SDK fixtures prove mapping and controlled transport behavior. They do not prove current account
permissions, sender/domain verification, server-side deduplication/retention, actual recipient display,
inbox delivery or acceptance of provider-specific message sizes. Those require a separately authorized
controlled live lane or an explicit release support limit. ZeptoMail/CPaaS account compatibility and
the deprecated Plunk SDK subset need particular attention. Untested SDK versions/runtimes are not
covered by the pinned-version matrix. No live email operation runs in default tests or CI.
