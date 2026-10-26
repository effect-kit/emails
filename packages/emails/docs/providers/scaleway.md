# Scaleway Transactional Email

Install `@effect-kit/emails`, `effect`, `@scaleway/sdk-tem@2.16.3`, `@scaleway/sdk-client@2.16.0`.
Import `@effect-kit/emails/scaleway`; use `Scaleway.layer({ accessKey, secretKey: Redacted.make(key),
projectId, region: "fr-par" })`. TEM's selected SDK metadata currently advertises Paris only.
`layerConfig()` reads `SCW_ACCESS_KEY`, `SCW_SECRET_KEY`, `SCW_PROJECT_ID`, `SCW_REGION`.
`layerClient(api, { projectId, region, timeout? })` borrows a Temv1alpha1.API-compatible instance.
The focused packages avoid the umbrella cloud SDK.

Supports names, CC/BCC, body alternatives, custom headers, multiple reply-to addresses through the
documented Reply-To additional header, and binary MIME attachments. CID is rejected. The SDK requires
both text and html strings; an absent alternative becomes the API's empty string representation.
Every returned technical email ID is retained as a provider reference; no recipient association or
inbox delivery is invented. Generic idempotency, templates and native batches remain outside scope.

The default 30-second Effect deadline passes an AbortSignal into createEmail and the owned HTTP client
also has a timeout. The native fetch path has no automatic submission retry. Borrowed client policy
is caller responsibility. Typed quota/auth/permission/validation/rate errors are sanitized, and request
context never crosses the adapter boundary. Real focused-SDK/fake fetch tests check region/project,
headers, body alternatives, bytes, response arrays and one attempt per failure. No live send.
