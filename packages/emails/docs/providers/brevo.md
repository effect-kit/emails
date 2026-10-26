# Brevo

Install `@effect-kit/emails`, `effect`, `@getbrevo/brevo@6.2.0`; import `@effect-kit/emails/brevo`.
Use `Brevo.layer({ apiKey: Redacted.make(key) })`. `layerConfig()` reads `BREVO_API_KEY`.
`layerClient(client, options)` borrows BrevoClient.transactionalEmails. Owned and per-request options
both set maxRetries to zero; abortSignal and the default 30-second deadline reach the SDK.

Supports sender/recipient names, bodies, CC/BCC, a single reply-to and custom mail headers. Attachments
are rejected because the current send API cannot preserve explicit attachment MIME types/CIDs.
No templates, batch or marketing/contact mutations are exposed.

Send options accept a UUID `idempotencyKey`. It goes into the JSON body's `headers.idempotencyKey`
with that exact casing; custom mail headers cannot override it. Current official documentation states
a 30-minute window; repeat keys fail as IdempotencyConflictError rather than replaying a receipt.
A duplicate proves no new submission, but does not reconstruct the prior request's outcome.
Keys are never generated or changed automatically. Historical 15-minute examples are not the contract.
See [current guide](https://developers.brevo.com/docs/heterogenous-versions-batch-emails).

Specific duplicate, credit/quota and permission codes are mapped before generic HTTP errors. SDK
error bodies, request objects and API keys are discarded. Real SDK/fake fetch tests verify body key
placement, stable repeated payloads, no transient retries and error privacy. No live send was performed.
