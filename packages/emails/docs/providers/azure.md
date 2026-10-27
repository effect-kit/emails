# Azure Communication Email

Install `@effect-kit/emails`, `effect` and `@azure/communication-email@1.1.0`.

```ts
import { Redacted } from "effect";

import * as Azure from "@effect-kit/emails/azure";
const EmailLive = Azure.layer({ connectionString: Redacted.make(connectionString) });
```

`layerConfig()` reads `AZURE_EMAIL_CONNECTION_STRING`. `layerClient(client, options)` accepts an
existing EmailClient, including caller-configured token/key credentials or HTTP pipelines. Owned
clients set pipeline `maxRetries: 0`. Borrowed clients must disable submission retries themselves;
the adapter does not alter caller-owned pipelines. These clients expose no resource-close method.

Supports structured recipients, CC/BCC, multiple reply-to addresses, custom headers and base64
attachments/CID. Sender display names are resource-controlled and rejected before submission.
The default deadline is 60 seconds, with a one-second polling interval; both accept positive Effect
Durations. No generic idempotency is promised.

A receipt requires `Succeeded`, retaining a typed operation ID. It acknowledges the send operation,
not delivery. Every observed initial/final operation ID must match the original submission; conflicting
identities remain uncertain and retain the original reference. Concurrent sends keep separate operation
state. Failed/canceled operations reject; poll failures/timeouts after operation creation keep
that original reference and an uncertain outcome. Polling stops on completion/interruption and never
starts a second submission. Abort does not cancel a remote operation already accepted by Azure.
Offline tests exercise the real SDK with a deterministic HTTP pipeline; no live resource was used.
