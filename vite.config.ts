import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createBuildInfo } = require("./desktop/buildMetadata.cjs");
const pkg = require("./package.json");
export default defineConfig(({ command }) => {
  const info = createBuildInfo(pkg, { command });
  return {
    plugins: [react(), { name: "hive-build-info", generateBundle() { this.emitFile({ type: "asset", fileName: "build-info.json", source: JSON.stringify(info, null, 2) + "\n" }); } }],
    define: { __HIVE_BUILD_INFO__: JSON.stringify(info) },
    server: { host: "127.0.0.1", watch: { ignored: ["**/.runtime/**"] } },
    test: { exclude: [...configDefaults.exclude, "performance/**", "delivery/**"] },
  };
});
