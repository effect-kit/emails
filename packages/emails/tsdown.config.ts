import defineConfig from "klarity/tsdown/library";

export default defineConfig({
  entry: { index: "src/index.ts" },
  exports: { devExports: "workspace-source" },
  unbundle: true,
  // TypeScript 7.1 changes the warning text handled by Klarity’s 7.0 preset.
  suppressWarnings: [/^TypeScript Go is experimental\. Some options will be unavailable\.$/],
});
