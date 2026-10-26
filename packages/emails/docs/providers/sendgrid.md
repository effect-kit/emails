# SendGrid

Install `@effect-kit/emails`, `effect`, `@sendgrid/mail@8.1.6`; import `@effect-kit/emails/sendgrid`.
Use `SendGrid.layer({ apiKey: Redacted.make(key) })`. `layerConfig()` reads `SENDGRID_API_KEY`.
`layerClient(client, options)` borrows a MailService-compatible client. Every owned Layer constructs
a fresh MailService and its own underlying client; the imported singleton is never configured.

Supports names, both body alternatives, CC/BCC, a single reply-to address, custom headers and binary
attachments/CID. One message retains shared recipient visibility; `sendMultiple` is never used.
Valid empty-body HTTP 202 is accepted, with an optional case-insensitive `x-message-id` reference.
No missing reference is invented. Custom transport/control headers remain prohibited by core.
Templates, personalizations, scheduling and generic idempotency are outside this API.

Default deadline: 30 seconds, also configured on owned SDK HTTP requests. No native method-level
AbortSignal is exposed; interruption stops local waiting, while the native request can continue until
its timeout. Borrowed clients own transport policy. The pinned SDK performs no submission retries.
HTTP errors are sanitized; response/config/authorization are never attached to errors.
Real SDK/local HTTP tests verify isolated concurrent credentials, empty acceptance and payload bytes.
No live send was performed.
