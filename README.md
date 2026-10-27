# Effect Emails

An email library built for **Effect**. Typed messages, provider Layers, React rendering and
bounded batches share one API across 16 providers.

```sh
pnpm add @effect-kit/emails effect resend
```

Provider SDKs are optional peers behind explicit subpaths. Core contracts and the testing Layer
require only Effect.

See the [package README](packages/emails/README.md) for setup, examples and supported providers.

## Development

Requires Node.js **24.22.0+** and pnpm **12.14.0**.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test:artifacts
```

`pnpm check` runs formatting, lint, type checks, offline tests and the tsdown build.
`pnpm test:artifacts` validates built exports, package contents and isolated selected-peer consumers.
`pnpm verify` runs both. Tests do not send live email.

The workspace uses TypeScript 7, Turborepo and Klarity/OXC tooling. Test configuration and fixtures
live under `packages/emails/test/`. Contributor rules are in [AGENTS.md](AGENTS.md).

## Releases

Releases use Changesets and a manually dispatched GitHub Actions workflow with npm trusted publishing.
See [.changeset/README.md](.changeset/README.md) for the initial manual publish and release steps.

## License

[Apache-2.0](LICENSE). Copyright 2026 Effect Kit Contributors.
