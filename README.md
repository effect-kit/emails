# @effect-kit/emails

An Effect v4 native email package under development. Core contracts, the Email service and
custom-provider Layers and all 16 planned provider integrations are implemented.
See the [provider support table](packages/emails/docs/providers/README.md) for SDKs and capability limits.
Optional [React rendering](packages/emails/docs/rendering.md) is implemented; portable batching is next.

## Development

Use Node.js 24.22 or newer and pnpm 12.14.0 (pinned in `package.json`).

```sh
pnpm install
pnpm check
pnpm test
pnpm test:e2e
pnpm check:package
pnpm test:consumer
```

- `pnpm check`: formatting, linting, source/config and test type checking, and builds.
- `pnpm test`: Vitest unit and composed Layer integration tests through Turbo. Public type contracts
  are compile-only fixtures checked by `pnpm typecheck:test` (also included in `pnpm check`).
- `pnpm test:e2e`: build and check public emitted-package behavior; no live emails.
- `pnpm check:package`: build, Publint, and Are the Types Wrong against a packed package.
- `pnpm test:consumer`: build/pack and install an isolated consumer with only Effect, then run public
  core/testing imports and NodeNext/Bundler declaration checks. This separate lane may access the npm
  registry; it needs the platform `tar` command and does not send email.
- `pnpm dev`: watch the package build.
- `pnpm format` / `pnpm lint:fix`: apply formatting and lint fixes.
- `pnpm clean`: remove package build and test output.
- Release notes and versioning are deferred to the final phase, targeting `0.1.0`; do not add
  per-feature Changesets during implementation.

`packages/emails` owns the npm package. Shared tooling lives at the workspace root and uses
Klarity presets, TypeScript 7, tsdown, Oxfmt/Oxlint, Turbo, Lefthook, and Commitlint. Effect is installed
at the root for local documentation and as a required peer of the package. Provider SDKs are
optional peers owned by individual subpath adapters.

Lefthook formats/lints staged files, enforces Conventional Commits, and runs verification before push.
CI also runs the isolated consumer lane after a frozen install. Release automation and provider credentials are not
configured.

Consumer fixtures live under `packages/emails/test/fixtures/consumers/<name>/`. Their package.json lists
only the selected SDK and any required companion peers; the runner supplies Effect and the package
tarball with peer auto-installation disabled. `core` has no SDK dependencies; every provider fixture selects only its own SDK/companion peers.
CI runs all 18 isolated fixtures with `pnpm test:consumer -- --fixture all`.
To select a fixture, run `pnpm test:consumer -- --fixture core`. Each fixture owns a consumer.ts using
public imports. TSX consumers are emitted through tsdown before Node execution. Fixtures compile in the isolated lane rather than workspace type checks, so workspace
dependencies cannot conceal missing peers. Temporary installations are removed on success or failure;
child processes have a two-minute timeout and diagnostics expose stage/code without registry details.

TypeScript is pinned to **7.1.0-beta**: tsdown 0.23.2’s declaration generator requires its public
`typescript/async` API, which TypeScript 7.0.2 does not expose. Type checks and declaration builds use
the same compiler version. Revisit the pin when TypeScript 7.1 becomes stable.

Local investigations belong in `/research/`, which is ignored by Git and excluded from package output.
Internal imports use #/ aliases: #/message/... maps to package src/, #/test/... to test/ and
#/examples/... to examples/. TypeScript/Vitest resolve these during development, and tsdown rewrites
them in emitted JavaScript/declarations. Consumer verification builds its Node runner into ignored
.test-dist/ first; Node does not directly support #/ specifiers. Public consumers need no alias setup.
Read [AGENTS.md](AGENTS.md) before contributing.

## License

[Apache-2.0](LICENSE), copyright 2026 Effect Kit Contributors.
