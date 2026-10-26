import defineConfig from "klarity/vitest/node";

export default defineConfig({
  resolve: { conditions: ["workspace-source"] },
  ssr: { resolve: { conditions: ["workspace-source"] } },
  test: {
    server: { deps: { inline: ["@effect-kit/emails"] } },
  },
});
