import { fileURLToPath } from "node:url";

import defineConfig from "klarity/tsdown/node";

// Node rejects #/ specifiers; bundle the verification runner through the same alias-aware toolchain.
export default defineConfig({
  cwd: fileURLToPath(new URL("../", import.meta.url)),
  entry: { consumer: "test/runners/consumer/Run.ts" },
  tsconfig: "test/tsconfig.json",
  outDir: ".test-dist",
  target: "node24",
  dts: false,
  exports: false,
  publint: false,
  sourcemap: false,
});
