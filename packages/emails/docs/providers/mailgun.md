# Mailgun

Install `@effect-kit/emails`, `effect`, `mailgun.js@14.1.0`, `form-data@4.0.5`.
Import `@effect-kit/emails/mailgun`; use `Mailgun.layer({ apiKey: Redacted.make(key),
domain: "mail.example.com", region: "eu" })`. Region is explicitly `us` or `eu`.
`layerConfig()` reads `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_REGION`.
`layerClient(client, { domain, timeout? })` borrows a native client. An optional `endpoint: URL`
allows compatible gateways/local HTTP and must be an origin URL without a path/query/fragment;
region is never inferred from credentials.

Supports names, bodies, CC/BCC, multiple reply-to addresses, mail headers and binary MIME attachments.
Inline CID is rejected: the native multipart API derives CID from filename, which cannot preserve
independent canonical filename and contentId. The adapter never silently renames files.
The API message ID becomes a provider reference. Native batch, templates and idempotency are outside scope.

Owned HTTP requests use the default 30-second deadline and no retry wrapper. The SDK's messages.create
has no per-request signal; Effect interruption stops local waiting while native work can continue until
its timeout. Borrowed transport deadlines remain caller policy. Errors omit multipart bodies, addresses
and authorization. Real SDK/local HTTP tests verify actual multipart bytes and one request on failures.
No live send was performed.
