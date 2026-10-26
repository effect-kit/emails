# MailerSend

Install `@effect-kit/emails`, `effect`, `mailersend@3.6.0`; import `@effect-kit/emails/mailersend`.
Use `MailerSend.layer({ apiKey: Redacted.make(key) })`. `layerConfig()` reads `MAILERSEND_API_KEY`.
`layerClient(client, options)` borrows a MailerSend-compatible client. Fresh EmailParams, Sender and
Recipient builders are created for every execution, including concurrent sends.

Supports names, body alternatives, CC/BCC, a single reply-to and custom headers. Header names must
be alphanumeric/hyphen and the account must support custom headers. Canonical attachments are
rejected: this API infers MIME type and cannot preserve the explicitly supplied contentType.
No generic idempotency, bulk, scheduling or templates are exposed.

HTTP 202 needs a valid `x-message-id` for acceptance. `ALL_SUPPRESSED` becomes message rejection;
`SOME_SUPPRESSED` preserves partial outcomes by role/index only when recipients associate unambiguously.
Malformed/ambiguous warning results remain uncertain and retain any known reference.

Default Effect deadline: 30 seconds. The pinned SDK exposes no request signal or configurable HTTP
deadline through its public send API. Interruption/deadline ends local waiting while native HTTP can
continue; applications requiring immediate socket cancellation must choose a signal-capable provider.
No POST retry is configured by the SDK. Caller-owned transports remain caller policy.
Real SDK/fake fetch tests verify builder isolation, warnings, headers and one attempt on errors.
No live send was performed.
