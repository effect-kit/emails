# eusend

Install `@effect-kit/emails`, `effect`, `@eusend_dev/sdk@0.19.0`; import `@effect-kit/emails/eusend`.
Use `Eusend.layer({ apiKey: Redacted.make(key) })`; `layerConfig()` reads `EUSEND_API_KEY`.
`layerClient(client, options)` borrows emails.send. An optional `baseUrl: URL` supports explicit
compatible endpoints. React and @react-email/render are not required or used by this adapter.

Supports names, bodies, CC/BCC, multiple reply-to addresses, headers and binary attachments/CID.
Explicit idempotency keys accept 1–255 printable ASCII characters. Duplicate keys replay the original
ID; no retention duration is promised because the current single-send documentation does not state one.
Do not reuse a key for different content. Native batch/React rendering/templates are separate APIs.

Both fulfilled data/error envelopes and rejected Promises are inspected. Suppression, sender/domain
restrictions, daily/monthly/plan quotas, rate, conflict and service failures remain distinct; null
headers and the SDK's application_error transport envelope are handled safely.
The default 30-second Effect deadline bounds local waiting. This SDK version has no send AbortSignal
or native deadline option: native HTTP can continue after local timeout/interruption. Do not use an
uncertain outcome as permission to generate a new key/resend. Native send performs no retry loop.
Choose a signal-capable adapter if immediate native cancellation is required.
Real SDK/fake fetch tests cover payloads, bytes, keys, fulfilled errors and null-header network failure.
No live send or data-residency guarantee was established.
