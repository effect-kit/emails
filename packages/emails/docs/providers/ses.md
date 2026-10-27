# AWS SES v2

Install `@effect-kit/emails`, `effect` and `@aws-sdk/client-sesv2@3.1157.0`.

```ts
import * as Ses from "@effect-kit/emails/ses";
const EmailLive = Ses.layer({ region: "eu-west-1", configurationSetName: "transactional" });
```

`layerConfig()` reads `AWS_REGION`; the standard AWS credential provider chain supplies credentials.
Optional static `credentials.secretAccessKey` / `sessionToken` are Effect `Redacted` values.
`layerClient(client, options)` borrows an existing SES v2 client. Configure its `maxAttempts: 1`;
caller-owned retry policies remain caller responsibility. Owned clients always use one attempt and
are destroyed when their Layer scope closes. An explicit `endpoint: URL` is available for compatible
endpoints and local testing; production normally uses regional AWS endpoints. Explicit endpoints
require HTTP(S), without URL credentials, query strings or fragments.

Supports both body alternatives, display names, CC/BCC, multiple reply-to addresses, custom headers,
binary attachments and inline CID. `MessageId` becomes a provider message reference; AWS request ID
is retained when valid. Configuration sets are optional. No raw MIME, hosted templates or generic
idempotency is exposed. Timeout defaults to 30 seconds; cancellation reaches the SDK request handler.
Timeout, response loss and interruption do not prove rejection and must not trigger blind resubmission.

Credentials, rate, quota, sender/domain/account restrictions and content failures become safe common
errors. SES sandbox rules, sender verification and production access remain account prerequisites.
Offline tests use real signing/serialization and local HTTP; no live account was used.
