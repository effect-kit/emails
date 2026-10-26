import defineConfig from "klarity/vitest/node";

export default defineConfig({
  resolve: { conditions: ["workspace-source"] },
  test: {
    // The scaffold has no runtime behavior yet. Remove when the first tests land.
    passWithNoTests: true,
    server: { deps: { inline: ["@effect-kit/emails"] } },
  },
});
