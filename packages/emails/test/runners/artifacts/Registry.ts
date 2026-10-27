import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { Schema } from "effect";

import { withConsumerWorkspace } from "#/test/fixtures/consumers/workspace.js";
import { inspectArchive } from "#/test/runners/artifacts/Archive.js";
import { readReleaseArchive, releaseOptions } from "#/test/runners/artifacts/ReleaseArchive.js";
import { runCommand } from "#/test/runners/process/RunCommand.js";

const Metadata = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
  dist: Schema.Struct({
    integrity: Schema.String,
    attestations: Schema.optionalKey(
      Schema.Struct({
        url: Schema.String,
        provenance: Schema.Struct({ predicateType: Schema.String }),
      }),
    ),
  }),
});

const options = releaseOptions();
const candidate = await readReleaseArchive(options.directory);
const packageRoot = process.cwd();
const specifier = `${candidate.name}@${candidate.version}`;
const registry = "--registry=https://registry.npmjs.org/";

await withConsumerWorkspace(async (directory) => {
  const metadata = Schema.decodeUnknownSync(Metadata)(
    JSON.parse(
      await runCommand(
        "read published metadata",
        "npm",
        ["view", specifier, "--json", registry],
        directory,
      ),
    ),
  );
  assert.equal(metadata.name, candidate.name);
  assert.equal(metadata.version, candidate.version);
  assert.equal(
    metadata.dist.integrity,
    candidate.integrity,
    "Registry integrity differs from verified archive",
  );
  if (options.provenance) assert(metadata.dist.attestations, "Missing npm provenance attestation");
  const receipts = Schema.decodeUnknownSync(
    Schema.Array(Schema.Struct({ filename: Schema.String })),
  )(
    JSON.parse(
      await runCommand(
        "download published archive",
        "npm",
        [
          "pack",
          specifier,
          "--ignore-scripts",
          "--json",
          "--pack-destination",
          directory,
          registry,
        ],
        directory,
      ),
    ),
  );
  const filename = receipts[0]?.filename;
  assert(
    receipts.length === 1 && filename && basename(filename) === filename,
    "Unexpected registry archive receipt",
  );
  const tarball = join(directory, filename);
  const inspected = await inspectArchive(tarball, directory);
  assert.equal(
    inspected.integrity,
    candidate.integrity,
    "Registry archive bytes differ from verified archive",
  );
  const consumers = await runCommand(
    "verify registry consumers",
    process.execPath,
    [".test-dist/consumer.js", "--fixture", "all", "--tarball", tarball],
    packageRoot,
    600_000,
  );
  process.stdout.write(consumers);
  await writeFile(
    join(options.directory, "registry-verification.json"),
    JSON.stringify(
      {
        observedAt: new Date().toISOString(),
        name: candidate.name,
        version: candidate.version,
        integrity: inspected.integrity,
        provenance: metadata.dist.attestations?.provenance ?? null,
        consumers: "all",
      },
      null,
      2,
    ),
  );
  console.log(`Registry archive verified: ${specifier}`);
});
