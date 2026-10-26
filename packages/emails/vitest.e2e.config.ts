import { fileURLToPath } from "node:url";

import defineConfig from "klarity/vitest/node";

// Built exports only: this lane must not resolve the workspace-source condition.
export default defineConfig({
  resolve: {
    alias: {
      "#/test": fileURLToPath(new URL("./test", import.meta.url)),
      "#/examples": fileURLToPath(new URL("./examples", import.meta.url)),
      "#": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: { include: ["test/e2e/**/*.test.ts"] },
});
