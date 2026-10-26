# Changesets

Run `pnpm changeset` for a user-visible package change. Commit the generated release note alongside
that change. Tooling-only changes do not need a changeset.

Run `pnpm version-packages` to apply pending versions locally. Publishing is a maintainer action;
this scaffold does not configure automated npm publication.
