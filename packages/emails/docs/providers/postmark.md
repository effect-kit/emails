# Postmark

Install `@effect-kit/emails`, `effect`, `postmark@5.1.0`; import `@effect-kit/emails/postmark`.
Use `Postmark.layer({ serverToken: Redacted.make(token), messageStream: "transactional" })`.
`layerConfig()` reads `POSTMARK_SERVER_TOKEN`. `layerClient(client, options)` borrows a ServerClient.
Use server credentials, rather than account-management tokens.

Supports names, body alternatives, CC/BCC, multiple reply-to addresses, custom headers and binary/CID
attachments. Successful `MessageID` is a submission reference. Provider numeric codes and HTTP
status codes stay distinct; inactive recipients become safe message rejection without addresses.
No native batch, hosted templates or generic idempotency is exposed.

Default deadline: 30 seconds. Owned SDK transport has the same timeout and performs one request;
its public `sendEmail` has no per-request AbortSignal. Effect interruption stops local waiting,
but cannot cancel that native request; a borrowed client controls its own transport deadline.
Never retry an uncertain outcome blindly. No SDK close method is needed. Real SDK/local fetch tests
cover payloads, accepted responses, inactive recipients, numeric-code ambiguity and transient failures.
No live provider send was performed.
