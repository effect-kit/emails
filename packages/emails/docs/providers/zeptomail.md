# ZeptoMail

Install `@effect-kit/emails`, `effect`, `zeptomail@8.0.1`; import `@effect-kit/emails/zeptomail`.
Use `ZeptoMail.layer({ token: Redacted.make(sendMailToken), url: new URL(accountEmailEndpoint) })`.
Pass the bare token; the adapter adds `Zoho-enczapikey`. `layerConfig()` reads `ZEPTOMAIL_TOKEN`
and `ZEPTOMAIL_URL`. `layerClient(client, options)` borrows SendMailClient-compatible sendMail.

The URL must explicitly identify `/v1.1/email`, without credentials/query/fragment. Account/region
selection is never inferred. Current Zoho documentation redirects to CPaaS and advertises
`https://cpaas.zoho.com/v1.1/email`; existing accounts may use a regional ZeptoMail endpoint. This
adapter preserves the published SDK's Send Mail Token boundary and does not migrate accounts or
substitute OAuth management credentials. Confirm the endpoint/token against your account before release.

Supports names, bodies, CC/BCC, multiple reply-to addresses, MIME headers, binary attachments and
independent inline filename/CID. A documented EM_104 acknowledgment is accepted; request_id stays
request metadata, with no invented message ID. Unknown responses remain uncertain. NetworkError and
TimeoutError are classified before their AuthenticationError superclass. SDK/API error objects are
sanitized; native SendMailClient can discard HTTP status, which is never reconstructed from prose.

Default Effect deadline: 30 seconds. Native SendMailClient exposes no signal/deadline and can continue
HTTP after local interruption. No automatic retry is added. Debug logging is disabled for owned clients.
Real SDK/local HTTP tests verify URL/auth/payload and response decoding; subclass tests protect error
mapping. No live ZeptoMail/CPaaS account compatibility claim is made.
