const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");
const { withUniwindConfig } = require("uniwind/metro");

const config = getDefaultConfig(__dirname);
const existingBlockList = config.resolver.blockList;

config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  "codex-relay": path.resolve(__dirname, "../../packages/codex-relay"),
  "react-native-direct-fetch": path.resolve(
    __dirname,
    "../../packages/react-native-direct-fetch",
  ),
};

config.resolver.blockList = [
  ...(Array.isArray(existingBlockList)
    ? existingBlockList
    : existingBlockList
      ? [existingBlockList]
      : []),
  /[/\\]\.omx[/\\].*/,
];

const finalConfig = withUniwindConfig(config, {
  cssEntryFile: "./src/global.css",
  dtsFile: "./src/uniwind-types.d.ts",
  polyfills: {
    rem: 16,
  },
});

const defaultResolveRequest = finalConfig.resolver.resolveRequest;
finalConfig.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "codex-relay/api-schema") {
    return {
      type: "sourceFile",
      filePath: path.resolve(__dirname, "../../packages/codex-relay/api-schema.ts"),
    };
  }

  if (moduleName === "react-native-direct-fetch") {
    return {
      type: "sourceFile",
      filePath: path.resolve(
        __dirname,
        "../../packages/react-native-direct-fetch/src/index.ts",
      ),
    };
  }

  return defaultResolveRequest(context, moduleName, platform);
};

module.exports = finalConfig;
