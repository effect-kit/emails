import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { parseArgs } from "node:util";

import { Schema } from "effect";

const PackedPlan = Schema.Struct({
  version: Schema.Literal(1),
  plan: Schema.Array(
    Schema.Array(
      Schema.Struct({
        kind: Schema.Literal("publish"),
        name: Schema.Literal("@effect-kit/emails"),
        version: Schema.String,
        access: Schema.Literal("public"),
        tag: Schema.Literal("latest"),
        tarball: Schema.Struct({ path: Schema.String, integrity: Schema.String }),
      }),
    ),
  ),
});

export const releaseOptions = () => {
  const args = process.argv.slice(2);
  const { values } = parseArgs({
    args: args[0] === "--" ? args.slice(1) : args,
    options: { "pack-dir": { type: "string" }, provenance: { type: "boolean", default: false } },
  });
  assert(values["pack-dir"], "Provide --pack-dir with the Changesets packed artifact directory");
  return {
    directory: resolve(process.cwd(), "../..", values["pack-dir"]),
    provenance: values.provenance,
  };
};

export const readReleaseArchive = async (directory: string) => {
  const plan = Schema.decodeUnknownSync(PackedPlan)(
    JSON.parse(await readFile(join(directory, "publish-plan.json"), "utf8")),
  );
  const releases = plan.plan.flat();
  const release = releases[0];
  assert(releases.length === 1 && release, "Expected exactly one email package to publish");
  assert(/^\d+\.\d+\.\d+$/.test(release.version), "Expected a stable release version");
  const expectedPath = `packages/effect-kit-emails-${release.version}.tgz`;
  assert.equal(release.tarball.path, expectedPath, "Unexpected release archive path");
  const root = await realpath(directory);
  const tarball = await realpath(join(root, release.tarball.path));
  assert(tarball.startsWith(`${root}${sep}`), "Release archive escapes the packed directory");
  const bytes = await readFile(tarball);
  const sha256 = `sha256-${createHash("sha256").update(bytes).digest("base64")}`;
  assert.equal(sha256, release.tarball.integrity, "Release archive differs from its publish plan");
  return {
    name: release.name,
    version: release.version,
    tarball,
    sha256,
    integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
  };
};
