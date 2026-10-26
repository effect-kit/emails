# @effect-kit/emails

An Effect v4 native email package under development. Core contracts, the Email service and
custom-provider Layers are implemented. Built-in SDK adapters are the next provider work.

## Development

Use Node.js 24.22 or newer and pnpm 12.14.0 (pinned in `package.json`).

```sh
pnpm install
pnpm check
pnpm test
pnpm test:e2e
pnpm check:package
```

- `pnpm check`: formatting, linting, source/config and test type checking, and builds.
- `pnpm test`: Vitest unit and composed Layer integration tests through Turbo. Public type contracts
  are compile-only fixtures checked by `pnpm typecheck:test` (also included in `pnpm check`).
- `pnpm test:e2e`: build and check public emitted-package behavior; no live emails.
- `pnpm check:package`: build, Publint, and Are the Types Wrong against a packed package.
- `pnpm dev`: watch the package build.
- `pnpm format` / `pnpm lint:fix`: apply formatting and lint fixes.
- `pnpm clean`: remove package build and test output.
- Release notes and versioning are deferred to the final phase, targeting `0.1.0`; do not add
  per-feature Changesets during implementation.

`packages/emails` owns the npm package. Shared tooling lives at the workspace root and uses
Klarity presets, TypeScript 7, tsdown, Oxfmt/Oxlint, Turbo, Lefthook, and Commitlint. Effect is installed
at the root for local documentation and as a required peer of the package. Provider SDKs will be
optional peers owned by individual subpath adapters.

Lefthook formats/lints staged files, enforces Conventional Commits, and runs verification before push.
CI runs the same checks with a frozen lockfile. Release automation and provider credentials are not
configured.

TypeScript is pinned to **7.1.0-beta**: tsdown 0.23.2’s declaration generator requires its public
`typescript/async` API, which TypeScript 7.0.2 does not expose. Type checks and declaration builds use
the same compiler version. Revisit the pin when TypeScript 7.1 becomes stable.

Local investigations belong in `/research/`, which is ignored by Git and excluded from package output.
Read [AGENTS.md](AGENTS.md) before contributing.

## License

[Apache-2.0](LICENSE), copyright 2026 Effect Kit Contributors.
