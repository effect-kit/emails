# Lettermint

Install `@effect-kit/emails`, `effect`, `lettermint@3.2.0`; import `@effect-kit/emails/lettermint`.
Use `Lettermint.layer({ sendingToken: Redacted.make(token) })`; `layerConfig()` reads
`LETTERMINT_SENDING_TOKEN`. Team/management tokens and methods remain separate.
`layerClient(client, options)` borrows an emails.send-compatible client.

Supports names, body alternatives, CC/BCC, multiple reply-to addresses, headers, binary MIME
attachments and qualified CIDs containing `@`. Bare CIDs fail before submission because the API
would append `@lm`, changing the caller's identifier. SDK direct-send requests remain immutable.
Accepted `pending` results carry message_id; no delivery is claimed. Set `sandbox: true` for a
sandbox project: receipts identify `lettermint/sandbox`; unexpected sandbox acknowledgments fail
rather than pretending production acceptance. This option describes the project, and does not change it.

Explicit idempotency keys accept 1–255 printable ASCII characters and replay the original result
within the documented 24-hour window; conflicting content returns IdempotencyConflictError.
The adapter never generates keys. The default 30-second deadline and AbortSignal reach native send;
no retry loop is added. API rate Retry-After seconds become Effect Durations. Local SDK validation,
connection, timeout, redirect and malformed responses have safe distinct errors.
Real SDK/fake fetch tests cover payload/CID bytes, request keys, rate timing and errors. No live send.
