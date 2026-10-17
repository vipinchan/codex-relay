import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "codex-relay/api-schema": fileURLToPath(new URL("./src/api-schema.ts", import.meta.url)),
    },
  },
  test: {
    setupFiles: ["./test/setup.ts"],
  },
});
