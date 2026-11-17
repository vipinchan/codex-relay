import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "codex-relay/api-schema": fileURLToPath(new URL("./src/api-schema.ts", import.meta.url)),
      "react-native-mmkv": fileURLToPath(new URL("./test/mock-mmkv.ts", import.meta.url)),
    },
  },
});
