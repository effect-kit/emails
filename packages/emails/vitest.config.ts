import defineConfig from "klarity/vitest/node";

export default defineConfig({
  resolve: { conditions: ["workspace-source"] },
  ssr: { resolve: { conditions: ["workspace-source"] } },
  test: {
    include: ["test/unit/**/*.test.ts", "test/integration/**/*.test.ts"],
    server: { deps: { inline: ["@effect-kit/emails"] } },
  },
});
