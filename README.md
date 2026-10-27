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
pnpm ci:check
```

`pnpm ci:check` runs the fast `check` gate: formatting, lint, source/test types, offline tests
and build. `pnpm release:prepare` selects the release checks independently and currently runs
the same fast gate. `pnpm release:version` updates versions, changelogs and the lockfile.

The manual **Extended tests** workflow runs the Node-version matrix, built exports, package
validation, every isolated provider consumer, and beta-compiler compatibility through
`pnpm test:extended`. `pnpm test:artifacts` and `pnpm verify` remain available locally.
Tests do not send live email.

The workspace uses TypeScript 7, Turborepo and Klarity/OXC tooling. Test configuration and fixtures
live under `packages/emails/test/`. Contributor rules are in [AGENTS.md](AGENTS.md).

## Releases

Releases use Changesets and a manually dispatched GitHub Actions workflow with npm trusted publishing.
The default `dry-run` mode verifies temporary versions and archives without opening a PR or
publishing. Disable it to create the version PR, then disable it again after merging to publish.
Release checks the exact tarball's metadata, declarations and isolated core consumer; full
provider/compiler matrices are manual. **Release smoke** checks published contents and provenance.
See [.changeset/README.md](.changeset/README.md) for release steps.

CI, PR-title checks, Changeset summaries, release and smoke workflows reuse
[EffectKit's shared automation](https://github.com/effect-kit/.github).

## License

[Apache-2.0](LICENSE). Copyright 2026 Effect Kit Contributors.
