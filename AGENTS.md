# Contributor instructions

## Scope and layout

This is the pnpm/Turborepo workspace for `@effect-kit/emails`, an Effect v4 native library.
`packages/emails` is the only publishable package. Core contracts, Email.make and custom-provider Layer composition are implemented. Built-in SDK
adapters, rendering, batching and the public testing Layer remain planned.

- `packages/emails/src`: domain folders such as message/, delivery/, errors/ and service/.
  Future SDK adapters belong under providers/<provider>/. The root index is a deliberate public API.
- `packages/emails/test/unit/<domain>`: schema, mapping and focused service behavior tests.
- `packages/emails/test/integration/<domain>`: composed Effect services/Layers and SDK-boundary tests.
- `packages/emails/test/fixtures`: reusable inert inputs and focused external substitutes.
- `packages/emails/test/e2e`: built-package public import/behavior checks via pnpm test:e2e. Keep registry/live
  lanes explicitly named and separate from normal offline tests; never send email in default tests.
- Root configs: shared Klarity/OXC/TypeScript/Turbo tooling.
- `/research/`: local, ignored investigations. Never commit these files or require them for builds.

Inspect relevant source, package manifests, exports, tests, configuration, and callers before editing.
Make the smallest coherent change. Preserve public behavior, naming, and dependency direction.
Avoid unrelated refactors, speculative abstractions, catch-all modules, and unnecessary dependencies.
Keep files focused; roughly 300–500 lines is a review prompt rather than a hard limit. Group source
and tests by responsibility using folders/subfolders; split mixed-domain test files. Only create
folders when they contain real work. Keep fixtures out of production code and avoid repeated setup.
Use tsdown as the sole JavaScript/declaration emitter, with explicit entries for implemented public
subpaths. TypeScript checks types and must not become a competing build pipeline.

## Git workflow

Inspect the working tree and branch before starting. Preserve pre-existing changes and commit them
separately before implementation unless instructed not to commit. Never mix unrelated work.
Create a commit after each meaningful, self-contained change. Use Conventional Commits, for example
`feat(resend): add the sending layer`. Do not force-add ignored research or generated output.

## Effect and package boundaries

Read `node_modules/effect/AGENTS.md` in full before writing Effect code. Follow relevant installed
`ai-docs` references and source; verify APIs against the lockfile. Do not copy v3 or old beta APIs.

- Use class-based `Context.Service`, `Service.of`, and Layers for public capabilities.
- Use `Effect.gen` for inline workflows; `Effect.fn` for useful tracing boundaries and
  `Effect.fnUntraced` for library operations that do not need a span.
- Use `Schema` at untrusted boundaries and `Schema.TaggedError` for actionable expected failures.
  Preserve defects and interruption. Never silently swallow errors or blindly cast SDK errors.
- Capture infrastructure dependencies during Layer construction. Scope owned clients and resources;
  never destroy caller-owned clients. Keep `runPromise` and other runtime execution at consumer edges.
- Keep core exports independent of provider SDKs, React, Node-only transports, and application policy.
  Provider SDKs belong in optional peer dependencies and explicit adapter subpaths. Do not eagerly
  re-export all providers from the root. The package must work when unused provider peers are absent.
- Never retry email submission blindly. A timeout or interruption after submission can mean an
  uncertain acceptance outcome. Provider acceptance does not prove inbox delivery.
- Do not log secrets, recipients, subjects, content, raw SDK requests, or unsanitized errors.
  Use Config/Redacted for credentials. Never hard-code credentials or environment identifiers.

## Toolchain and verification

Use Node >=24.22 and the exact pnpm version in `package.json`. Install with pnpm; commit the lockfile.
Use the root catalog for shared versions. Prefer platform APIs or existing dependencies over new ones.
Use Klarity presets with narrow local overrides. Do not add ESLint, Prettier, or EditorConfig.
TypeScript checks types; tsdown owns emit. Source uses strict checks and `workspace-source` resolution.
Production relative ESM imports use `.js` extensions. Review generated and packed exports.

After meaningful changes run the applicable commands:

```sh
pnpm format
pnpm lint
pnpm typecheck
pnpm typecheck:test
pnpm test
pnpm test:e2e
pnpm build
pnpm check:package
```

`pnpm check` combines formatting, lint, source/config/test type checks, and builds. Vitest requires real tests; do not add a no-tests exception. Use the installed `@effect/vitest` for Effect behavior and ordinary Vitest for pure
logic. Add regression, failure-path, resource lifecycle, and adapter contract tests when behavior lands.
Do not write tests that merely repeat the implementation or TypeScript checks. Never send live emails
in default tests or CI. Credentialed smoke tests must be explicit and use controlled recipients.
Keep only tests with a concrete failure or regression they protect. Avoid duplicate happy paths,
getter/literal assertions, checks of dependency primitives and assertions on already annotated types.
Keep meaningful public type contracts in compile-only *.types.ts fixtures checked by typecheck:test;
do not count them as runtime tests. Reuse coverage across suites instead of targeting a test count.

CI runs `pnpm check`, `pnpm test`, `pnpm test:e2e`, and packed-artifact checks after a frozen install. Fix failures caused
by your work; report skipped checks and pre-existing failures without unrelated changes. Inspect the
final diff for dead code, unnecessary comments, spacing, public exports, and accidental secrets.

## Documentation and releases

Update owning READMEs when behavior, commands, exports, or configuration change. Keep docs concise
and distinguish proposed contracts from implemented behavior. Keep provisional investigations in
ignored `/research/`; promote durable decisions to maintained docs when implemented.
Do not add per-feature Changesets or bump versions during implementation. Prepare release notes
and versioning only in the final release phase, targeting the first release at 0.1.0.
Do not publish or configure external credentials without a maintainer's instruction.
