import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { Schema } from "effect";

import { runCommand } from "#/test/runners/process/RunCommand.js";

export const PackageManifest = Schema.Struct({
  name: Schema.Literal("@effect-kit/emails"),
  version: Schema.String,
  license: Schema.Literal("Apache-2.0"),
  type: Schema.Literal("module"),
  main: Schema.Literal("./dist/index.js"),
  types: Schema.Literal("./dist/index.d.ts"),
  engines: Schema.Struct({ node: Schema.Literal(">=24.22.0") }),
  repository: Schema.Struct({
    type: Schema.Literal("git"),
    url: Schema.Literal("git+https://github.com/effect-kit/emails.git"),
    directory: Schema.Literal("packages/emails"),
  }),
  exports: Schema.Record(Schema.String, Schema.String),
  dependencies: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  peerDependencies: Schema.Record(Schema.String, Schema.String),
  peerDependenciesMeta: Schema.Record(Schema.String, Schema.Struct({ optional: Schema.Boolean })),
});

export const inspectArchive = async (tarball: string, directory: string) => {
  const files = (await runCommand("list package archive", "tar", ["-tf", tarball], directory))
    .trim()
    .split("\n");
  for (const file of files) {
    assert(!file.split("/").some((part) => part === ".." || part === "."), "Unsafe archive path");
    assert(!file.includes("\\"), "Unsafe archive separator");
    assert(
      file.startsWith("package/dist/") ||
        [
          "package/package.json",
          "package/README.md",
          "package/CHANGELOG.md",
          "package/LICENSE",
        ].includes(file),
      `Unexpected archive file: ${file}`,
    );
  }
  const listing = await runCommand("inspect archive entries", "tar", ["-tvf", tarball], directory);
  assert(
    listing
      .trim()
      .split("\n")
      .every((line) => line.startsWith("-")),
    "Archive must contain only regular files",
  );

  const extracted = join(directory, "archive");
  await mkdir(extracted);
  await runCommand("extract package archive", "tar", ["-xf", tarball, "-C", extracted], directory);
  const packageDirectory = join(extracted, "package");
  const json = await readFile(join(packageDirectory, "package.json"), "utf8");
  const manifest = Schema.decodeUnknownSync(PackageManifest)(JSON.parse(json));
  assert(
    !json.includes("catalog:") && !json.includes("workspace:"),
    "Unresolved workspace dependency",
  );
  assert.deepEqual(
    Object.keys(manifest.dependencies ?? {}),
    [],
    "Core must not acquire runtime dependencies",
  );
  assert.equal(manifest.peerDependencies.effect, "^4.0.6");
  for (const peer of Object.keys(manifest.peerDependencies)) {
    if (peer !== "effect") assert.equal(manifest.peerDependenciesMeta[peer]?.optional, true);
  }
  assert.equal(manifest.exports["."], "./dist/index.js");
  assert.equal(manifest.exports["./testing"], "./dist/testing.js");
  assert(!JSON.stringify(manifest.exports).includes("workspace-source"));
  for (const target of Object.values(manifest.exports)) {
    assert(target.startsWith("./"), "Export must be package-relative");
    assert(files.includes(`package/${target.slice(2)}`), `Missing export: ${target}`);
    if (target.endsWith(".js"))
      assert(
        files.includes(`package/${target.slice(2, -3)}.d.ts`),
        `Missing declaration: ${target}`,
      );
  }
  const license = await readFile(join(packageDirectory, "LICENSE"), "utf8");
  assert(
    license.includes("Apache License") &&
      license.includes("Copyright 2026 Effect Kit Contributors"),
  );
  const checks = await Promise.allSettled(
    files
      .filter((file) => /\.(?:js|ts|map)$/.test(file))
      .map(async (file) => {
        const content = await readFile(join(extracted, file), "utf8");
        if (!file.endsWith(".map")) {
          assert(!content.includes("#/"), `Unresolved internal alias: ${file}`);
          return;
        }
        const map = Schema.decodeUnknownSync(
          Schema.Struct({
            version: Schema.Literal(3),
            sources: Schema.Array(Schema.String),
            sourcesContent: Schema.Array(Schema.String),
          }),
        )(JSON.parse(content));
        assert.equal(
          map.sources.length,
          map.sourcesContent.length,
          "Source map must embed its sources",
        );
      }),
  );
  for (const check of checks) if (check.status === "rejected") throw check.reason;
  const bytes = await readFile(tarball);
  return {
    manifest,
    sha256: `sha256-${createHash("sha256").update(bytes).digest("base64")}`,
    integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
  };
};
