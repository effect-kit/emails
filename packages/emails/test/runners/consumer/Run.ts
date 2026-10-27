import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

import { Schema } from "effect";

import { withConsumerWorkspace } from "#/test/fixtures/consumers/workspace.js";
import { inspectArchive } from "#/test/runners/artifacts/Archive.js";
import { verifyConsumer } from "#/test/runners/consumer/Verify.js";
import { runCommand } from "#/test/runners/process/RunCommand.js";

const args = process.argv.slice(2);
const { values } = parseArgs({
  args: args[0] === "--" ? args.slice(1) : args,
  options: {
    fixture: { type: "string", default: "core" },
    tarball: { type: "string" },
    typescript: { type: "string" },
  },
});
const packageRoot = process.cwd();
assert(/^[a-z][a-z0-9-]*$/.test(values.fixture), "Invalid fixture name");
const defaults = Schema.decodeUnknownSync(Schema.Struct({ typescript: Schema.String }))(
  JSON.parse(await readFile(join(packageRoot, "test/fixtures/consumers/toolchain.json"), "utf8")),
);
const compiler = values.typescript ?? defaults.typescript;
assert(/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(compiler), "Use an exact TypeScript version");
const fixtures =
  values.fixture === "all"
    ? (await readdir(join(packageRoot, "test/fixtures/consumers"), { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .toSorted()
    : [values.fixture];

await withConsumerWorkspace(async (directory) => {
  const tarball =
    values.tarball === undefined ? join(directory, "emails.tgz") : resolve(values.tarball);
  if (values.tarball === undefined)
    await runCommand(
      "pack candidate",
      "pnpm",
      ["pack", "--out", tarball, "--config.ignore-scripts=true"],
      packageRoot,
    );
  const artifact = await inspectArchive(tarball, directory);
  console.log(`Archive ${artifact.manifest.name}@${artifact.manifest.version}: ${artifact.sha256}`);
  // oxlint-disable-next-line no-await-in-loop -- Bound registry installations and compiler processes.
  for (const fixture of fixtures) await verifyConsumer(packageRoot, fixture, tarball, compiler);
});
