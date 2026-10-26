# Mailtrap

Install `@effect-kit/emails`, `effect`, `mailtrap@5.0.0`; import `@effect-kit/emails/mailtrap`.
Use `Mailtrap.layer({ token: Redacted.make(token), mode: "production" })` or explicit `"bulk"`.
Sandbox requires `{ mode: "sandbox", inboxId: 123 }`; other modes reject an inbox ID. The union makes
incompatible modes unrepresentable; invalid runtime values fail at acquisition.
`layerConfig(config)` takes an explicit `Config<MailtrapConfig>` so mode selection stays visible.
`layerClient(client, { mode, timeout? })` borrows an already configured SDK; the mode must match it.

Supports names, bodies, CC/BCC, one reply-to, headers and byte attachments/CID. All returned
message_ids become references without invented recipient associations. Sandbox receipts identify
`mailtrap/sandbox`, bulk receipts `mailtrap/bulk`, production receipts `mailtrap`.
Sandbox acknowledgment never claims production sending. No generic idempotency or batch API is exposed.

Default deadline: 30 seconds. Owned SDK HTTP timeout matches it; owned keep-alive agents are destroyed
at Layer scope close using a private seam tied to the exact tested SDK version. Borrowed clients and
agents remain untouched. No SDK submission retry is configured. Native send exposes no per-request
signal, so local interruption can precede the native HTTP timeout. Nested Axios causes are inspected
only for safe status/code; sensitive original errors are never attached.
Real SDK/local HTTP tests verify all three hosts, references, bytes and nested failures. No live send.
