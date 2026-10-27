# Effect Emails

Typed email sending for **Effect v4**. One `Email` service, interchangeable provider Layers,
typed failures, optional React rendering and bounded batch sending.

```sh
pnpm add @effect-kit/emails effect resend@6.34.1
```

See the [package README](packages/emails/README.md) for usage and supported providers.

## Development

Requires Node.js **24.22.0+** and pnpm **12.14.0**.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test:artifacts
```

`check` runs formatting, lint, source/test type checks, offline tests and the tsdown build.
`test:artifacts` checks built exports, package contents and isolated consumers with selected peers.
`pnpm verify` runs both. Default tests never send live email.

The workspace uses TypeScript 7, Turborepo and Klarity/OXC tooling. Test configuration and fixtures
live under `packages/emails/test/`. Contributor rules are in [AGENTS.md](AGENTS.md).

## Releases

The package starts at `0.0.0` for manual npm bootstrap. Subsequent releases use a manually dispatched
Changesets workflow with npm trusted publishing. See [.changeset/README.md](.changeset/README.md).

## License

[Apache-2.0](LICENSE). Copyright 2026 Effect Kit Contributors.
