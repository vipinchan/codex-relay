import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "codex-relay/api-schema": fileURLToPath(
        new URL("../../packages/codex-relay/src/api-schema.ts", import.meta.url),
      ),
      "@/assets": fileURLToPath(new URL("./assets", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
