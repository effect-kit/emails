# Mailchimp Transactional

Install `@effect-kit/emails`, `effect`, `@mailchimp/mailchimp_transactional@1.4.1`.
Import `@effect-kit/emails/mailchimp-transactional`; use
`MailchimpTransactional.layer({ apiKey: Redacted.make(key) })`. `layerConfig()` reads
`MAILCHIMP_TRANSACTIONAL_API_KEY`; `layerClient(client, options)` borrows messages.send.
The SDK's untyped runtime has a narrow private declaration, never an any module shim or public SDK type.
Owned clients target the currently documented `/api/1.4` endpoint, overriding the SDK's legacy 1.3 base.
An explicit baseUrl can select a compatible endpoint. No live endpoint migration was performed.

Supports names, bodies, explicit TO/CC/BCC roles, multiple reply-to through the mail header, custom
headers and binary MIME attachments. preserve_recipients is explicitly true. Independent inline
filename/CID cannot be represented by native images.name and is rejected. No templates, scheduling,
batch operation or idempotency is exposed. Ordinary provider queuing may still return scheduled status.

sent/queued/scheduled mean provider acceptance, never inbox delivery. Mixed accepted/rejected/invalid
recipient results produce partial receipts with role/index positions. All-rejected fails; missing,
foreign, duplicated or ambiguous associations remain uncertain while retaining known IDs. Rejection
codes use an explicit allowlist (currently hard-bounce → hard_bounce); unfamiliar text is omitted
without changing recipient outcomes. Raw addresses are omitted. HTTP errors returned as fulfilled
AxiosError values are detected before normal result decoding. Credentials in SDK request bodies,
original errors and server prose never cross the public error boundary.

Default deadline: 30 seconds, set in each owned client's requestConfig. The SDK's global timeout
setter is never called. Native send has no AbortSignal; local interruption can precede HTTP completion.
No submission retry is configured. Real SDK/local HTTP tests cover partial outcomes, wire roles/bytes,
fulfilled HTTP errors, all-rejected and malformed association. No live send was performed.
