# @effect-kit/emails

Effect v4 native email contracts. The current package exposes message, capability, receipt and error
schemas; the sending service and built-in provider adapters are being implemented separately.

```ts
import { Schema } from "effect";

import { EmailMessage } from "@effect-kit/emails";

const message = Schema.decodeUnknownSync(EmailMessage)({
  from: "hello@example.com",
  to: ["ada@example.com"],
  subject: "Welcome",
  text: "Your account is ready.",
});
```

- Addresses accept bare ASCII dot-atom local parts and DNS domains (including punycode); quoted local
  parts, domain literals, display-name strings and internationalized local parts are outside this
  initial grammar. Use `{ email, name }` for Unicode display names. Address case/order is preserved.
- Provide a nonblank subject and at least one nonblank text/HTML body. Omit unused optional values.
  Dynamic recipient arrays are supported and must be nonempty. Body line breaks are valid.
- Attachments use Uint8Array, a filename and a base MIME type. Empty files are valid. Optional
  contentId values must be unique. Providers may impose additional constraints.
- Custom headers reject control characters, reserved routing/content/authorization/provider-control
  names and case-insensitive duplicates. Header values may be empty; metadata cannot be blank.
- SendReceipt describes accepted/partially accepted submission, not delivery. References distinguish
  provider IDs, SMTP Message-IDs and asynchronous operation IDs; no ID is fabricated when absent.
- EmailError carries typed reasons and acceptance evidence: notSubmitted, rejected or unknown. Retry
  hints/retention use finite nonnegative Effect Duration values. Raw provider errors are not a field.

Schemas and their TypeScript types share exported names. Direct schema decoding returns Effect's
ordinary SchemaError; callers must not log rejected input or schema errors containing sensitive data.

The package is ESM-only and requires Effect ^4.0.6. Core has no SDK, React or Node transport dependency.
Only dist/, this README and the Apache-2.0 license are included in the package tarball.
