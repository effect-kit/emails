# Plunk

Install `@effect-kit/emails`, `effect`, `@plunk/node@3.0.3`; import `@effect-kit/emails/plunk`.
The published SDK is deprecated but its tested JSON passthrough supports this deliberately limited
adapter. Use `Plunk.layer({ apiKey: Redacted.make(secretKey) })`; `layerConfig()` reads `PLUNK_API_KEY`.
`layerClient(client, options)` borrows emails.send; configure it against the current endpoint.
Owned clients explicitly use `https://next-api.useplunk.com/v1/`, overriding the SDK's legacy default.
An explicit trailing-slash baseUrl is available for compatible self-hosted endpoints.

Supports HTML, sender names and exactly one unnamed TO address. Text/dual bodies, recipient names,
multiple TO, CC/BCC, reply-to, headers, attachments and idempotency fail before network I/O. No
markdown conversion or implicit fan-out occurs. Plunk generates a plain-text alternative server-side.
Current Plunk automatically upserts the recipient contact. The adapter omits subscribed/data/events,
so it never requests marketing opt-in or changes an existing contact's subscription/data. New contacts
follow Plunk's unsubscribed default. This provider behavior is inherent in its transactional API.

The current wrapped success envelope must contain one queued email ID. Throttled/skipped recipients
are rejected, and unknown/legacy success-only envelopes remain uncertain. The SDK loses most HTTP
error status/details; those become a safe ProviderError with unknown acceptance. Token exceptions
remain authentication failures. No direct HTTP implementation or hidden transport is used.

Default Effect deadline: 30 seconds. Native SDK send has no signal/deadline and can continue after
local interruption. No retries are added. Real SDK/fake fetch tests cover host, payload omissions,
limits, current results and skipped outcomes. No live account or legacy-host compatibility was tested.
