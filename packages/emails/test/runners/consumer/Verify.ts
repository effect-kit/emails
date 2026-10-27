import assert from "node:assert/strict";
import { cp, readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";

import { Schema } from "effect";

import { withConsumerWorkspace } from "#/test/fixtures/consumers/workspace.js";
import { runCommand } from "#/test/runners/process/RunCommand.js";

const Versions = Schema.Struct({ version: Schema.String });
const Dependencies = Schema.Struct({ dependencies: Schema.Record(Schema.String, Schema.String) });

export const verifyConsumer = async (
  packageRoot: string,
  fixture: string,
  tarball: string,
  typescriptVersion: string,
) => {
  const fixtureDirectory = join(packageRoot, "test", "fixtures", "consumers", fixture);
  const effectPackage = createRequire(import.meta.url).resolve("effect/package.json");
  const effectVersion = Schema.decodeUnknownSync(Versions)(
    JSON.parse(await readFile(effectPackage, "utf8")),
  ).version;
  const fixtureDependencies = Schema.decodeUnknownSync(Dependencies)(
    JSON.parse(await readFile(join(fixtureDirectory, "package.json"), "utf8")),
  ).dependencies;
  const run = (stage: string, command: string, arguments_: string[], cwd: string) =>
    runCommand(`Consumer ${fixture}: ${stage}`, command, arguments_, cwd);

  await withConsumerWorkspace(async (directory) => {
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
        devDependencies: { typescript: typescriptVersion },
      }),
    );
    await writeFile(
      join(consumer, ".npmrc"),
      "auto-install-peers=false\nstrict-peer-dependencies=true\nlink-workspace-packages=false\nfetch-retries=1\nfetch-timeout=30000\n",
    );
    await run("install isolated peers", "pnpm", ["install", "--ignore-scripts"], consumer);
    const installed = await readdir(join(consumer, "node_modules"));
    if (fixture === "core" || fixture === "testing") {
      assert(
        !installed.includes("@types"),
        "Ambient declaration packages must not mask leaked types",
      );
    }
    const hasTsx = (await readdir(consumer)).includes("consumer.tsx");
    if (hasTsx) {
      const config = join(consumer, "tsdown.config.mjs");
      await writeFile(
        join(consumer, "tsconfig.runtime.json"),
        JSON.stringify({
          compilerOptions: {
            jsx: "react-jsx",
            target: "ES2022",
            module: "ESNext",
            moduleResolution: "Bundler",
          },
        }),
      );
      await writeFile(
        config,
        `export default ${JSON.stringify({
          cwd: consumer,
          entry: { consumer: join(consumer, "consumer.tsx") },
          tsconfig: join(consumer, "tsconfig.runtime.json"),
          outDir: join(consumer, "compiled"),
          platform: "node",
          target: "node24",
          format: "esm",
          dts: false,
          exports: false,
          publint: false,
          report: false,
          outputOptions: { entryFileNames: "[name].js" },
          deps: {
            neverBundle: [
              "effect",
              "@effect-kit/emails",
              "react",
              "react/jsx-runtime",
              ...Object.keys(fixtureDependencies),
            ],
          },
        })};`,
      );
      await run(
        "compile TSX consumer",
        "pnpm",
        ["exec", "tsdown", "--config", config],
        packageRoot,
      );
    }
    await run(
      "runtime public imports",
      process.execPath,
      [hasTsx ? "compiled/consumer.js" : "consumer.ts"],
      consumer,
    );

    const declarations = await Promise.allSettled(
      ["NodeNext", "Bundler"].map(async (resolution) => {
        const config = join(consumer, `tsconfig.${resolution}.json`);
        await writeFile(
          config,
          JSON.stringify({
            compilerOptions: {
              strict: true,
              jsx: "react-jsx",
              target: "ES2022",
              module: resolution === "NodeNext" ? "NodeNext" : "ESNext",
              moduleResolution: resolution,
              lib: ["ES2022", "DOM"],
              types: [],
              skipLibCheck: false,
              noEmit: true,
            },
            include: ["**/*.ts", "**/*.tsx"],
          }),
        );
        await run(
          `${resolution} public declarations`,
          "pnpm",
          ["exec", "tsc", "--project", config],
          consumer,
        );
      }),
    );
    for (const result of declarations) {
      if (result.status === "rejected") throw result.reason;
    }
    console.log(
      `Consumer ${fixture}: runtime, NodeNext and Bundler passed (TypeScript ${typescriptVersion}).`,
    );
  });
};
