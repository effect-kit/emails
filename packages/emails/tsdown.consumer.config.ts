import defineConfig from "klarity/tsdown/node";

// Node rejects #/ specifiers; bundle the verification runner through the same alias-aware toolchain.
export default defineConfig({
  entry: { consumer: "test/e2e/consumer/verify-package.ts" },
  tsconfig: "tsconfig.test.json",
  outDir: ".test-dist",
  target: "node24",
  dts: false,
  exports: false,
  publint: false,
  sourcemap: false,
});
