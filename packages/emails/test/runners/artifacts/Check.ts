import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { withConsumerWorkspace } from "#/test/fixtures/consumers/workspace.js";
import { inspectArchive } from "#/test/runners/artifacts/Archive.js";
import { readReleaseArchive, releaseOptions } from "#/test/runners/artifacts/ReleaseArchive.js";
import { runCommand } from "#/test/runners/process/RunCommand.js";

const options = releaseOptions();
const candidate = await readReleaseArchive(options.directory);
const packageRoot = process.cwd();

await withConsumerWorkspace(async (directory) => {
  const inspected = await inspectArchive(candidate.tarball, directory);
  assert.equal(inspected.manifest.name, candidate.name);
  assert.equal(inspected.manifest.version, candidate.version);
  await runCommand(
    "publint release archive",
    "pnpm",
    ["exec", "publint", candidate.tarball, "--strict"],
    packageRoot,
  );
  await runCommand(
    "check release declarations",
    "pnpm",
    ["exec", "attw", candidate.tarball, "--profile", "esm-only"],
    packageRoot,
  );
  const consumers = await runCommand(
    "verify release consumers",
    process.execPath,
    [".test-dist/consumer.js", "--fixture", "all", "--tarball", candidate.tarball],
    packageRoot,
    600_000,
  );
  process.stdout.write(consumers);
  const fixtures = (
    await readdir(join(packageRoot, "test/fixtures/consumers"), { withFileTypes: true })
  )
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted();
  await writeFile(
    join(options.directory, "verification.json"),
    JSON.stringify(
      {
        verifiedAt: new Date().toISOString(),
        name: candidate.name,
        version: candidate.version,
        integrity: candidate.integrity,
        sha256: candidate.sha256,
        node: process.version,
        commit: (
          await runCommand("read source commit", "git", ["rev-parse", "HEAD"], packageRoot)
        ).trim(),
        toolchain: JSON.parse(
          await readFile(join(packageRoot, "test/fixtures/consumers/toolchain.json"), "utf8"),
        ),
        consumers: fixtures,
      },
      null,
      2,
    ),
  );
  console.log(`Release archive verified: ${candidate.name}@${candidate.version}`);
});
