import config from "klarity/oxlint";
import { defineConfig } from "oxlint";

export default defineConfig({
  extends: [config],
  ignorePatterns: ["research/**"],
  rules: { "no-underscore-dangle": ["error", { allow: ["_tag"] }] },
});
