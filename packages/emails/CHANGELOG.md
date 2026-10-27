# @effect-kit/emails

## 0.1.0

### Minor Changes

- d6651df: Introduce a typed email API for Effect with composable provider Layers and adapters for all 16 supported providers.

  - Validate messages and provider capabilities, with structured errors and explicit submission outcomes.
  - Install provider SDKs as optional peers, or implement a custom adapter through `Email.make`.
  - Render React templates to HTML and text, and send batches with bounded concurrency and ordered per-message results.
  - Test email workflows offline with the recording `EmailTest` Layer.
