import { fileURLToPath } from "node:url";

import defineConfig from "klarity/vitest/node";

export default defineConfig({
  resolve: {
    conditions: ["workspace-source"],
    alias: {
      "#/test": fileURLToPath(new URL("./test", import.meta.url)),
      "#/examples": fileURLToPath(new URL("./examples", import.meta.url)),
      "#": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  ssr: { resolve: { conditions: ["workspace-source"] } },
  test: {
    include: ["test/unit/**/*.test.ts", "test/integration/**/*.test.ts"],
    server: { deps: { inline: ["@effect-kit/emails"] } },
  },
});
