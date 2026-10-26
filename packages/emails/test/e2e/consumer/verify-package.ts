import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { promisify } from "node:util";

import { Schema } from "effect";

import { withConsumerWorkspace } from "#/test/fixtures/consumers/workspace.js";

const exec = promisify(execFile);
const packageRoot = process.cwd();
const args = process.argv.slice(2);
assert(args.length === 0 || (args.length === 2 && args[0] === "--fixture"), "Use --fixture <name>");
const fixture = args[1] ?? "core";
assert(/^[a-z][a-z0-9-]*$/.test(fixture), "Invalid fixture name");
const fixtureDirectory = join(packageRoot, "test", "fixtures", "consumers", fixture);

const Versions = Schema.Struct({ version: Schema.String });
const Dependencies = Schema.Struct({ dependencies: Schema.Record(Schema.String, Schema.String) });
const Manifest = Schema.Struct({
  exports: Schema.Record(Schema.String, Schema.String),
  peerDependencies: Schema.Record(Schema.String, Schema.String),
  peerDependenciesMeta: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.Struct({ optional: Schema.Boolean })),
  ),
  dependencies: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
});
const parse = <S extends Schema.Top & { readonly DecodingServices: never }>(
  schema: S,
  json: string,
): S["Type"] => Schema.decodeUnknownSync(schema)(JSON.parse(json));

const run = async (stage: string, command: string, arguments_: string[], cwd: string) => {
  try {
    return (await exec(command, arguments_, { cwd, timeout: 120_000, maxBuffer: 2 * 1024 * 1024 }))
      .stdout;
  } catch (error) {
    const code = error instanceof Error && "code" in error ? String(error.code) : "unknown";
    // oxlint-disable-next-line preserve-caught-error -- Registry failures can include credentials; expose only stage/code.
    throw new Error(`Consumer fixture ${fixture}: ${stage} failed (code ${code})`);
  }
};

const effectPackage = createRequire(import.meta.url).resolve("effect/package.json");
const effectVersion = parse(Versions, await readFile(effectPackage, "utf8")).version;
const fixtureDependencies = parse(
  Dependencies,
  await readFile(join(fixtureDirectory, "package.json"), "utf8"),
).dependencies;

await withConsumerWorkspace(async (directory) => {
  const tarball = join(directory, "emails.tgz");
  await run(
    "pack",
    "pnpm",
    ["pack", "--out", tarball, "--config.ignore-scripts=true"],
    packageRoot,
  );
  const files = (await run("list archive", "tar", ["-tf", tarball], packageRoot))
    .trim()
    .split("\n");
  for (const file of files) {
    assert(
      file.startsWith("package/dist/") ||
        ["package/package.json", "package/README.md", "package/LICENSE"].includes(file),
      `Unexpected archive file: ${file}`,
    );
  }
  const manifest = parse(
    Manifest,
    await run(
      "read archive manifest",
      "tar",
      ["-xOf", tarball, "package/package.json"],
      packageRoot,
    ),
  );
  assert.deepEqual(
    Object.keys(manifest.dependencies ?? {}),
    [],
    "Core must not acquire runtime dependencies",
  );
  assert.equal(manifest.peerDependencies.effect, "^4.0.6");
  for (const peer of Object.keys(manifest.peerDependencies)) {
    if (peer !== "effect") assert.equal(manifest.peerDependenciesMeta?.[peer]?.optional, true);
  }
  assert.equal(manifest.exports["."], "./dist/index.js");
  assert.equal(manifest.exports["./testing"], "./dist/testing.js");
  assert(!JSON.stringify(manifest.exports).includes("workspace-source"));
  for (const target of Object.values(manifest.exports)) {
    assert(files.includes(`package/${target.slice(2)}`), `Export absent from tarball: ${target}`);
  }

  const consumer = join(directory, "consumer");
  await cp(fixtureDirectory, consumer, { recursive: true });
  await writeFile(
    join(consumer, "package.json"),
    JSON.stringify({
      private: true,
      type: "module",
      dependencies: {
        ...fixtureDependencies,
        effect: effectVersion,
        "@effect-kit/emails": `file:${tarball}`,
      },
    }),
  );
  await writeFile(
    join(consumer, ".npmrc"),
    "auto-install-peers=false\nstrict-peer-dependencies=true\nlink-workspace-packages=false\nfetch-retries=1\nfetch-timeout=30000\n",
  );
  await run("install isolated peers", "pnpm", ["install", "--ignore-scripts"], consumer);
  const installed = await readdir(join(consumer, "node_modules"));
  if (fixture === "core") {
    assert(
      !installed.includes("@types"),
      "Ambient declaration packages must not mask leaked types",
    );
  }
  await run("runtime public imports", process.execPath, ["consumer.ts"], consumer);

  const declarations = await Promise.allSettled(
    ["NodeNext", "Bundler"].map(async (resolution) => {
      const config = join(consumer, `tsconfig.${resolution}.json`);
      await writeFile(
        config,
        JSON.stringify({
          compilerOptions: {
            strict: true,
            target: "ES2022",
            module: resolution === "NodeNext" ? "NodeNext" : "ESNext",
            moduleResolution: resolution,
            lib: ["ES2022", "DOM"],
            types: [],
            skipLibCheck: false,
            noEmit: true,
          },
          include: ["**/*.ts"],
        }),
      );
      await run(
        `${resolution} public declarations`,
        "pnpm",
        ["exec", "tsc", "--project", config],
        packageRoot,
      );
    }),
  );
  for (const result of declarations) {
    if (result.status === "rejected") throw result.reason;
  }
  console.log(
    `Consumer fixture ${fixture}: archive, isolated runtime, NodeNext and Bundler declarations passed.`,
  );
});
