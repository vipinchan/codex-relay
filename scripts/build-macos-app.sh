#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="$ROOT_DIR/build/macos"
WORKSPACE_DIR="$BUILD_DIR/workspace"
MOBILE_DIR="$WORKSPACE_DIR/apps/mobile"
DERIVED_DATA="${MACOS_DERIVED_DATA_PATH:-$BUILD_DIR/derived-data}"
APP_NAME="Codex Relay Mac.app"
OUTPUT_DIR="$ROOT_DIR/dist/macos"
PREPARE_ONLY=0

if [[ "${1:-}" == "--help" ]]; then
  echo "Usage: pnpm build:macos [--prepare-only]"
  echo "Builds a local Apple Silicon Mac app with embedded JS into dist/macos."
  echo "Uses build/macos for generated native files; the iOS development project is untouched."
  echo "--prepare-only generates and validates the Catalyst project without installing Pods or compiling."
  echo "Optional: EXPO_PUBLIC_CODEX_RELAY_SERVER_URL, MACOS_DERIVED_DATA_PATH, MACOS_BUILD_JOBS."
  exit 0
fi
if [[ "${1:-}" == "--prepare-only" ]]; then
  PREPARE_ONLY=1
elif [[ $# -ne 0 ]]; then
  echo "Unknown argument: $1" >&2
  exit 1
fi
if [[ "$(uname -s)" != Darwin || "$(uname -m)" != arm64 ]]; then
  echo "This local build requires an Apple Silicon Mac with Xcode." >&2
  exit 1
fi
for tool in node xcodebuild pod rsync patch codesign; do
  command -v "$tool" >/dev/null || { echo "Missing required tool: $tool" >&2; exit 1; }
done
if [[ ! -d "$ROOT_DIR/apps/mobile/node_modules/expo" ]]; then
  echo "Install workspace dependencies with the pnpm version in package.json first." >&2
  exit 1
fi
if [[ -L "$BUILD_DIR" || -L "$WORKSPACE_DIR" ]]; then
  echo "The generated build directory must not be a symlink." >&2
  exit 1
fi

export CODEX_RELAY_MACOS_BUILD=1
export EXPO_PUBLIC_MAC_LOCAL_BUILD=1
export EXPO_PUBLIC_CODEX_RELAY_SERVER_URL="${EXPO_PUBLIC_CODEX_RELAY_SERVER_URL:-http://127.0.0.1:8787}"
export EXPO_USE_PRECOMPILED_MODULES=0
export EXPO_NO_TELEMETRY=1
export NODE_ENV=production

node "$ROOT_DIR/scripts/macos/prepare-workspace.mjs" "$ROOT_DIR" "$WORKSPACE_DIR"
cd "$MOBILE_DIR"
node "$ROOT_DIR/apps/mobile/node_modules/expo/bin/cli" prebuild --platform ios --no-install
node "$ROOT_DIR/scripts/macos/validate-project.mjs" "$MOBILE_DIR/ios"
if [[ "$PREPARE_ONLY" == 1 ]]; then
  echo "Catalyst project ready: $MOBILE_DIR/ios"
  exit 0
fi

cd "$MOBILE_DIR/ios"
# Reuse an existing iOS dependency download cache when available. CocoaPods
# reconciles the copied manifest with this build's source-module configuration.
if [[ ! -f Pods/Manifest.lock && -f "$ROOT_DIR/apps/mobile/ios/Pods/Manifest.lock" ]]; then
  rm -rf Pods
  ditto "$ROOT_DIR/apps/mobile/ios/Pods" Pods
  cp "$ROOT_DIR/apps/mobile/ios/Podfile.lock" Podfile.lock
fi
pod install
xcodebuild \
  -workspace CodexRelay.xcworkspace \
  -scheme CodexRelay \
  -configuration Release \
  -destination 'platform=macOS,variant=Mac Catalyst,arch=arm64' \
  -derivedDataPath "$DERIVED_DATA" \
  -jobs "${MACOS_BUILD_JOBS:-6}" \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO ONLY_ACTIVE_ARCH=YES \
  build

APP_PATH="$DERIVED_DATA/Build/Products/Release-maccatalyst/CodexRelay.app"
if [[ ! -s "$APP_PATH/Contents/Resources/main.jsbundle" ]]; then
  echo "Build is missing the embedded JavaScript bundle." >&2
  exit 1
fi
# Some React Native archives contain copied framework symlinks. Repair the
# generated bundle before signing, preserving the thinned executable.
node "$ROOT_DIR/scripts/macos/normalize-frameworks.mjs" "$APP_PATH"
codesign --force --deep --sign - "$APP_PATH"
codesign --verify --deep --strict "$APP_PATH"

mkdir -p "$OUTPUT_DIR"
STAGING_DIR="$(mktemp -d "$OUTPUT_DIR/.mac-app.XXXXXX")"
trap 'rm -rf "$STAGING_DIR"' EXIT
ditto "$APP_PATH" "$STAGING_DIR/$APP_NAME"
codesign --verify --deep --strict "$STAGING_DIR/$APP_NAME"
rm -rf "$OUTPUT_DIR/$APP_NAME"
mv "$STAGING_DIR/$APP_NAME" "$OUTPUT_DIR/$APP_NAME"
APP_VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP_PATH/Contents/Info.plist")"
node - "$ROOT_DIR" "$OUTPUT_DIR/build-info.json" "$APP_VERSION" <<'JS'
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const [root, output, appVersion] = process.argv.slice(2);
fs.writeFileSync(output, JSON.stringify({
  commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  dirty: Boolean(execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim()),
  appVersion,
  architecture: "arm64",
  target: "Mac Catalyst",
  builtAt: new Date().toISOString(),
  limitations: ["native math rendering", "modern barcode scanner", "push notifications", "mobile OTA"],
}, null, 2) + "\n");
JS

echo "Mac app ready: $OUTPUT_DIR/$APP_NAME"
echo "Copy it into ~/Applications to install; replacing the app preserves its pairing data."
