import defineConfig from "klarity/vitest/node";

// Built exports only: this lane must not resolve the workspace-source condition.
export default defineConfig({ test: { include: ["test/e2e/**/*.test.ts"] } });
