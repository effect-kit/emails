# Contributor instructions

## Scope and layout

This is the pnpm/Turborepo workspace for `@effect-kit/emails`, an Effect v4 native library.
`packages/emails` is the only publishable package. Its entry point is intentionally empty while the
API is researched; do not describe planned providers or sending behavior as implemented.

- `packages/emails/src`: public contracts and future provider adapters.
- `packages/emails/test`: future unit, adapter contract, and public API tests.
- Root configs: shared Klarity/OXC/TypeScript/Turbo tooling.
- `/research/`: local, ignored investigations. Never commit these files or require them for builds.

Inspect relevant source, package manifests, exports, tests, configuration, and callers before editing.
Make the smallest coherent change. Preserve public behavior, naming, and dependency direction.
Avoid unrelated refactors, speculative abstractions, catch-all modules, and unnecessary dependencies.
Keep files focused; roughly 300–500 lines is a review prompt rather than a hard limit.

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
pnpm build
pnpm check:package
```

`pnpm check` combines formatting, lint, source/config/test type checks, and builds. Vitest currently
allows no tests because there is no runtime implementation. Remove that exception with the first
behavior tests. Use the installed `@effect/vitest` for Effect behavior and ordinary Vitest for pure
logic. Add regression, failure-path, resource lifecycle, and adapter contract tests when behavior lands.
Do not write tests that merely repeat the implementation or TypeScript checks. Never send live emails
in default tests or CI. Credentialed smoke tests must be explicit and use controlled recipients.

CI runs `pnpm check`, `pnpm test`, and packed-artifact checks after a frozen install. Fix failures caused
by your work; report skipped checks and pre-existing failures without unrelated changes. Inspect the
final diff for dead code, unnecessary comments, spacing, public exports, and accidental secrets.

## Documentation and releases

Update owning READMEs when behavior, commands, exports, or configuration change. Keep docs concise
and distinguish proposed contracts from implemented behavior. Keep provisional investigations in
ignored `/research/`; promote durable decisions to maintained docs when implemented.
For user-visible package changes, add a Changeset. Tooling-only changes need no release note.
Do not publish or configure external credentials without a maintainer's instruction.
