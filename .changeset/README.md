# Releases

Only `packages/emails` is published. The initial `0.0.0` is a manual bootstrap; later versions use
Changesets v3 and the manually dispatched [Release workflow](../.github/workflows/release.yml).

## Bootstrap

From the workspace root, with Node 24.22.0+ and the pinned pnpm:

```sh
pnpm install --frozen-lockfile
pnpm verify
pnpm release:pack
pnpm release:check --pack-dir packages/emails/test/results/release
npm login --registry=https://registry.npmjs.org/
npm publish ./packages/emails/test/results/release/packages/effect-kit-emails-0.0.0.tgz --access public --tag latest
```

Publish the verified archive without rebuilding it. Local bootstrap uses your npm account/2FA;
do not request provenance locally.

## Trusted publishing setup

Create/push the public `effect-kit/emails` GitHub repository with `main` as the default branch.
After bootstrap, open the npm package settings and add a GitHub Actions trusted publisher:

| Field                | Value         |
| -------------------- | ------------- |
| Organization or user | `effect-kit`  |
| Repository           | `emails`      |
| Workflow filename    | `release.yml` |
| Environment          | Leave empty   |

Enable GitHub Actions to create pull requests in repository Actions settings. No `NPM_TOKEN` is used.
Only the publish job receives `id-token: write`; npm trusted publishing generates provenance for
those future releases. The bootstrap version does not gain provenance retroactively.
See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).

## Subsequent releases

1. Run `pnpm changeset` for a meaningful package change and commit its release note with the change.
2. Dispatch **Release** on `main` with `dry-run` disabled to open/update the version PR. Merge it after review.
3. Dispatch **Release** again with `dry-run` disabled to verify and publish the new version.

The default `dry-run` mode exercises temporary versioning, preparation and archive verification
without opening a PR, tagging or publishing. These versions exist only in the runner checkout.
`pnpm release:version` refreshes versions, changelogs, the lockfile and generated formatting;
`version-packages` remains available for compatibility.

Release runs `pnpm release:prepare`, currently the fast `check` gate, and verifies the exact
Changesets archive's contents, declarations and isolated core consumer once before publishing.
Publish uses that same artifact ID; verification reports are uploaded as workflow artifacts.
PR CI runs `pnpm ci:check`. The manual **Extended tests** workflow owns all provider consumers,
the Node-version matrix and beta compiler checks. Normal CI never sends email or publishes.

Publication does not wait for registry availability or run post-publish smoke tests. After npm makes
the version available, download the unchanged Changesets packed artifact and check it separately:

```sh
pnpm release:smoke --pack-dir /absolute/path/to/packed-artifact --provenance
```

`pnpm release:check --pack-dir <directory>` verifies a local packed plan; paths are relative to the
workspace root (absolute paths also work). `pnpm release:smoke --pack-dir <directory> --provenance`
checks an already-published version. Both expect a single stable email-package release on `latest`.
Both root commands select `--fixture core` for a fast isolated consumer. Use the package's
`test:release` or `test:release:registry` command with `--fixture all` for the full consumer matrix.
The **Release smoke** workflow accepts successful published release run and artifact IDs from
the release job summary. Verification-only archives have not been published.
If registry publishing succeeds but a later stage fails, inspect the existing version/tag and the
saved artifacts before recovery; never rebuild or replace an already-published version.
