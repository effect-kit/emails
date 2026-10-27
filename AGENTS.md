# Contributor instructions

## Scope and layout

This is the pnpm/Turborepo workspace for `@effect-kit/emails`, an Effect v4 native library.
`packages/emails` is the only publishable package. Core contracts, Email.make and custom-provider Layer composition are implemented. Built-in SDK
adapters cover all 16 providers listed in packages/emails/docs/providers/README.md; optional React rendering
and Email.sendMany portable batches are implemented. Provider implementations
live under providers/<provider>/ with explicit public subpath entries.
The public testing Layer lives under src/testing/,
with an explicit src/testing.ts subpath entry; core never re-exports it.
React rendering lives under src/rendering/react/ and the optional src/react.ts subpath. React types
and renderer peers stay confined there; TSX examples/tests use react-jsx and tsdown owns TSX emit.
Maintained reliability/telemetry policy lives in packages/emails/docs/reliability.md; the provider
capability, ownership and transport evidence matrix is docs/providers/evidence.md in that package.

- `packages/emails/src`: domain folders such as message/, delivery/, errors/ and service/.
  SDK adapters belong under providers/<provider>/. The root index is a deliberate public API.
- `packages/emails/test/unit/<domain>`: schema, mapping and focused service behavior tests.
- `packages/emails/test/integration/<domain>`: composed Effect services/Layers and SDK-boundary tests.
- `packages/emails/test/fixtures`: reusable inert inputs and focused external substitutes.
  Reusable adapter contract cases live under fixtures/conformance/; migrate existing checks instead
  of duplicating them when extending the harness.
- `packages/emails/test/e2e`: built-package public import/behavior checks via pnpm test:e2e. Keep registry/live
  lanes explicitly named and separate from normal offline tests; never send email in default tests.
- `test/fixtures/consumers/<name>`: isolated package-consumer programs and selected peer manifests;
  checked by pnpm test:consumer, excluded from workspace type checks. The Node runner and temporary
  workspace lifecycle live under test/e2e/consumer and test/fixtures/consumers respectively.
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
- Keep built-in diagnostic codes explicitly recognized; syntax filtering alone can echo private text.
  Keep expected errors safe, preserve defects/interruption, and document native cancellation limits.
  Update the provider evidence matrix with capability, retry or ownership changes. Reuse conformance
  fixtures to cover all 16 adapters; test telemetry under test/integration/observability/ and privacy
  under test/integration/privacy/. Don't duplicate existing cases to increase a test count.

## Toolchain and verification

Use Node >=24.22 and the exact pnpm version in `package.json`. Install with pnpm; commit the lockfile.
Use the root catalog for shared versions. Prefer platform APIs or existing dependencies over new ones.
Use Klarity presets with narrow local overrides. Do not add ESLint, Prettier, or EditorConfig.
TypeScript checks types; tsdown owns emit. Source uses strict checks and `workspace-source` resolution.
Use #/ aliases for every internal import/re-export: #/message/... resolves under src/, #/test/...
under test/, and #/examples/... under examples/. Keep .js extensions for TypeScript module specifiers.
Shared TypeScript paths and explicit Vitest aliases must agree. Examples/consumer fixtures import
public @effect-kit/emails subpaths. tsdown rewrites aliases to relative emitted imports; do not ship
unresolved #/ specifiers. The isolated consumer runner is also built by tsdown before Node execution.
Review generated and packed exports.

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
pnpm test:consumer
```

`pnpm check` combines formatting, lint, source/config/test type checks, and builds. Vitest requires real tests; do not add a no-tests exception. Use the installed `@effect/vitest` for Effect behavior and ordinary Vitest for pure
logic. Add regression, failure-path, resource lifecycle, and adapter contract tests when behavior lands.
Do not write tests that merely repeat the implementation or TypeScript checks. Never send live emails
in default tests or CI. Credentialed smoke tests must be explicit and use controlled recipients.
Keep only tests with a concrete failure or regression they protect. Avoid duplicate happy paths,
getter/literal assertions, checks of dependency primitives and assertions on already annotated types.
Keep meaningful public type contracts in compile-only *.types.ts fixtures checked by typecheck:test;
do not count them as runtime tests. Reuse coverage across suites instead of targeting a test count.

Default tests guard fetch and Node HTTP requests against external hosts before SDK imports; keep real
SDK tests on loopback transports or explicit in-memory pipelines. Add each new provider to shared
conformance cases and its own isolated consumer directory; CI discovers directories via --fixture all.

CI runs `pnpm check`, `pnpm test`, `pnpm test:e2e`, packed-artifact checks and `pnpm test:consumer` after a frozen install. The consumer lane
can access the npm registry and needs tar; pre-push keeps the offline checks. Fix failures caused
by your work; report skipped checks and pre-existing failures without unrelated changes. Inspect the
final diff for dead code, unnecessary comments, spacing, public exports, and accidental secrets.

## Documentation and releases

Update owning READMEs when behavior, commands, exports, or configuration change. Keep docs concise
and distinguish proposed contracts from implemented behavior. Keep provisional investigations in
ignored `/research/`; promote durable decisions to maintained docs when implemented.
Do not add per-feature Changesets or bump versions during implementation. Prepare release notes
and versioning only in the final release phase, targeting the first release at 0.1.0.
Do not publish or configure external credentials without a maintainer's instruction.
