#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBILE_DIR="$ROOT_DIR/apps/mobile"
IOS_DIR="$MOBILE_DIR/ios"
BUILD_DIR="$ROOT_DIR/build/ios"
ARCHIVE_PATH="$BUILD_DIR/CodexRelay.xcarchive"
PACKAGE_DIR="$BUILD_DIR/package"
DIST_DIR="$ROOT_DIR/dist/ios"
IPA_NAME="${IOS_IPA_NAME:-CodexRelay.ipa}"
IPA_PATH="$DIST_DIR/$IPA_NAME"
CHECKSUM_PATH="$IPA_PATH.sha256"
BUILD_INFO_PATH="$DIST_DIR/build-info.txt"

if [[ "$IPA_NAME" == */* || "$IPA_NAME" != *.ipa ]]; then
  echo "error: IOS_IPA_NAME must be a .ipa filename without path separators" >&2
  exit 1
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "error: iOS IPA builds require macOS/Xcode" >&2
  exit 1
fi

command -v pnpm >/dev/null || { echo "error: pnpm is required" >&2; exit 1; }
command -v xcodebuild >/dev/null || { echo "error: Xcode is required" >&2; exit 1; }
command -v pod >/dev/null || { echo "error: CocoaPods is required" >&2; exit 1; }

rm -rf "$BUILD_DIR" "$DIST_DIR"
mkdir -p "$BUILD_DIR" "$DIST_DIR"

XCODE_VERSION="$(xcodebuild -version | tr '\n' ' ' | sed 's/[[:space:]]*$//')"
echo "Using $XCODE_VERSION"

cd "$ROOT_DIR"
pnpm --filter codex-relay build

cd "$MOBILE_DIR"
# Source-built sideload packages do not need the production Hot Updater
# bundle-signing key during Expo prebuild.
export SIDELOAD_BUILD=1
pnpm exec expo prebuild --platform ios --clean --no-install

cd "$IOS_DIR"
pod install

WORKSPACE="$(find "$IOS_DIR" -maxdepth 1 -type d -name '*.xcworkspace' -print -quit)"
if [[ -z "$WORKSPACE" ]]; then
  echo "error: no .xcworkspace generated under $IOS_DIR" >&2
  exit 1
fi

SCHEME="$({ xcodebuild -list -json -workspace "$WORKSPACE"; } | python3 -c '
import json, re, sys
payload = json.load(sys.stdin)
schemes = payload.get("workspace", {}).get("schemes", [])
if not schemes:
    raise SystemExit("no Xcode schemes found")
workspace = sys.argv[1]
def norm(value):
    return re.sub(r"[^a-z0-9]", "", value.lower())
preferred = next((s for s in schemes if norm(s) == norm(workspace)), None)
print(preferred or schemes[0])
' "$(basename "$WORKSPACE" .xcworkspace)")"

echo "Workspace: $WORKSPACE"
echo "Scheme: $SCHEME"

xcodebuild \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration Release \
  -sdk iphoneos \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE_PATH" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY='' \
  DEVELOPMENT_TEAM='' \
  PROVISIONING_PROFILE_SPECIFIER='' \
  archive

APP_PATH="$(find "$ARCHIVE_PATH/Products/Applications" -maxdepth 1 -type d -name '*.app' -print -quit)"
if [[ -z "$APP_PATH" ]]; then
  echo "error: archive did not contain an application bundle" >&2
  exit 1
fi

# Apply an ad-hoc signature so the packaged app bundle is structurally valid
# for compatible sideloading installers.
codesign --force --deep --sign - "$APP_PATH"
codesign --verify --deep --strict "$APP_PATH"

EXECUTABLE_NAME="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$APP_PATH/Info.plist")"
BUNDLE_ID="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP_PATH/Info.plist")"
APP_VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP_PATH/Info.plist")"
MIN_IOS="$(/usr/libexec/PlistBuddy -c 'Print :MinimumOSVersion' "$APP_PATH/Info.plist")"

file "$APP_PATH/$EXECUTABLE_NAME"
lipo -info "$APP_PATH/$EXECUTABLE_NAME"

rm -rf "$PACKAGE_DIR"
mkdir -p "$PACKAGE_DIR/Payload"
cp -R "$APP_PATH" "$PACKAGE_DIR/Payload/"

cd "$PACKAGE_DIR"
/usr/bin/zip -qry "$IPA_PATH" Payload

unzip -tq "$IPA_PATH"
shasum -a 256 "$IPA_PATH" | tee "$CHECKSUM_PATH"

SHORT_SHA="${GITHUB_SHA:-local}"
if [[ "$SHORT_SHA" != "local" ]]; then
  SHORT_SHA="${SHORT_SHA:0:7}"
fi
BUILD_NUMBER="${GITHUB_RUN_NUMBER:-local}"
MOBILE_RELEASE="${MOBILE_RELEASE_VERSION:-none}"

cat > "$BUILD_INFO_PATH" <<EOF
Codex Relay iOS build
commit=$SHORT_SHA
build=$BUILD_NUMBER
bundle_id=$BUNDLE_ID
app_version=$APP_VERSION
mobile_release=$MOBILE_RELEASE
minimum_ios=$MIN_IOS
xcode=$XCODE_VERSION
scheme=$SCHEME
artifact=$(basename "$IPA_PATH")
EOF

cat "$BUILD_INFO_PATH"
echo "IPA ready: $IPA_PATH"
