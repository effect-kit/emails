# Contributor instructions

This pnpm/Turborepo workspace publishes `@effect-kit/emails`, an ESM library for Effect.
`packages/emails` is the only publishable package. Read its README and relevant source/tests first.

## Workflow

- Inspect the branch and working tree before editing. Preserve and separately commit pre-existing work.
- Make focused changes and commit each coherent change using Conventional Commits. Avoid unrelated refactors.
- Use Node 24.22.0+ and pnpm 12.14.0. Install with pnpm; commit dependency/lockfile changes together.
- `/research/` is local and ignored. Never force-add it or require it for builds, tests or CI.
- Keep modules focused, generally below 300–500 lines. Group source/tests by responsibility and avoid
  catch-all utilities, unnecessary dependencies and speculative abstractions.

## Layout and tooling

- `src/`: message, delivery, errors, service, rendering, testing and providers/<provider> domains.
- Public subpaths have explicit entries. Core never re-exports providers, React or the testing Layer.
- `test/unit/`, `test/integration/`, `test/e2e/`: focused behavior suites. Reusable inert inputs and
  adapter contracts belong in `test/fixtures/`. Consumer fixtures use public package imports.
- Test configs and their tsdown runner build live under `test/`; production build config stays at
  package root. Keep docs websites and example collections outside this package.
- Use `#/` aliases with `.js` specifiers for internal imports: `#/*` maps to src and `#/test/*` to test.
  Keep TypeScript/Vitest resolution aligned; emitted JS/declarations must contain no unresolved aliases.
- tsdown is the only emitter; TypeScript only checks types. Keep Klarity/OXC presets, without
  ESLint, Prettier or EditorConfig. The TypeScript 7.1 beta build pin supplies tsdown's required
  `typescript/async` API; verify declaration emission before changing it.

## Effect boundaries

- Read installed `node_modules/effect/AGENTS.md` fully before writing Effect code. Use its ai-docs
  and source for the locked version, not Effect v3 or old beta examples.
- Use class-based Context.Service, Service.of and Layers. Capture infrastructure during acquisition;
  scope owned resources and never destroy borrowed clients. Runtime execution belongs at consumer edges.
- Prefer Effect.gen for workflows, Effect.fn for useful spans and Effect.fnUntraced for small library
  operations. Use Schema at untrusted boundaries and Schema.TaggedError for expected failures.
- Preserve defects and interruption. Validate before submission, preserve recipient visibility and
  byte ownership, and reject features the selected provider cannot honor.
- Never retry/fail over blindly: timeout/interruption can follow acceptance. A receipt is not delivery.
- Use Config/Redacted for credentials. Do not log payloads, recipients, keys, raw SDK causes/configs
  or template props. Built-in diagnostic codes must be explicitly recognized; syntax filtering is
  insufficient. Keep tracing safe and distinguish native cancellation from local Effect deadlines.
- SDKs and React stay optional peers behind selected subpaths. Core/testing require only Effect.

## Verification

Run `pnpm check` for formatting, lint, source/test types, offline tests and build. Run
`pnpm test:artifacts` for built E2E, packed-package validation and isolated selected-peer consumers.
`pnpm verify` runs both. `ci:check` runs the fast `check` gate; long artifact/consumer/compiler
matrices run only in the manual Extended tests workflow through `test:extended`.
`typecheck` includes test types. Fix failures caused by your change and report skipped checks accurately.

Keep meaningful regression, error, lifecycle, privacy and public-contract tests. Reuse conformance
fixtures instead of duplicating happy paths. Put type-only assertions in compile-only *.types.ts files.
Default tests deny external fetch/HTTP before SDK imports; use loopback or explicit in-memory transports.
Never send live email in default tests/CI. Add providers to the shared contracts and consumer fixtures.

## Releases

Changesets and the shared manual Release workflow handle versions after the completed bootstrap;
follow `.changeset/README.md`. `release:prepare` selects fast pre-pack checks; `release:check`
verifies exact archives with the isolated core consumer. Full consumer matrices remain manual.
Release defaults to verification-only (`dry-run: true`); disable it explicitly for version PRs/publication.
Use current major action tags, not SHAs,
and shared setup. Publish only verified archives; no npm tokens or publish permissions in ordinary CI.
Do not publish, push tags, configure external credentials or change live services without authorization.
Keep READMEs concise and synchronized with actual behavior and commands.
