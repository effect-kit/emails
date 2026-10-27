import { fileURLToPath } from "node:url";

import defineConfig from "klarity/vitest/node";

export default defineConfig({
  root: fileURLToPath(new URL("../", import.meta.url)),
  envDir: false,
  resolve: {
    conditions: ["workspace-source"],
    alias: {
      "#/test": fileURLToPath(new URL("./", import.meta.url)),
      "#": fileURLToPath(new URL("../src", import.meta.url)),
    },
  },
  ssr: { resolve: { conditions: ["workspace-source"] } },
  test: {
    setupFiles: ["./test/fixtures/network/offline.ts"],
    include: ["test/unit/**/*.test.ts", "test/integration/**/*.test.ts"],
    server: { deps: { inline: ["@effect-kit/emails"] } },
  },
});
