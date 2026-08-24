#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
MOBILE_ROOT="$REPO_ROOT/apps/mobile"

APP_BUNDLE_ID="${APP_BUNDLE_ID:-com.gronstudio.codexrelay}"
CODEX_RELAY_SERVER_URL="${EXPO_PUBLIC_CODEX_RELAY_SERVER_URL:-http://127.0.0.1:8787}"
RELAY_PORT="${CODEX_RELAY_PORT:-8787}"
METRO_PORT="${METRO_PORT:-8081}"
SIMULATOR_UDID="${SIMULATOR_UDID:-}"
SIMULATOR_DEVICE_NAME="${SIMULATOR_DEVICE_NAME:-iPhone 17 Pro}"
CLEAR_METRO=1

RELAY_PID=""
METRO_PID=""

usage() {
  cat <<'EOF'
Usage: scripts/debug.sh [options]

Start the local Codex Relay server, Expo Metro, and the configured iOS Simulator.

Options:
  --no-clear       Keep Metro's existing bundle cache.
  --simulator ID   Use a specific booted/available Simulator UDID.
  -h, --help       Show this help.

The script keeps running until Ctrl-C. Processes started by this script are stopped
on exit; already-running services are reused and are not stopped.
EOF
}

die() {
  printf 'debug.sh: %s\n' "$*" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-clear)
      CLEAR_METRO=0
      ;;
    --simulator)
      shift
      [[ $# -gt 0 ]] || die "--simulator requires a UDID"
      SIMULATOR_UDID="$1"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      die "unknown option: $1"
      ;;
  esac
  shift
done

command -v curl >/dev/null 2>&1 || die "curl is required"
command -v open >/dev/null 2>&1 || die "macOS open is required"
command -v xcrun >/dev/null 2>&1 || die "xcrun is required"

NODE_BIN="${NODE_BIN:-$(command -v node 2>/dev/null || true)}"
[[ -n "$NODE_BIN" ]] || die "node is required"

if [[ -z "${CODEX_BIN:-}" ]]; then
  if [[ -x /opt/homebrew/bin/codex ]]; then
    CODEX_BIN=/opt/homebrew/bin/codex
  else
    CODEX_BIN="$(command -v codex 2>/dev/null || true)"
  fi
fi
[[ -n "$CODEX_BIN" ]] || die "codex is required; set CODEX_BIN=/path/to/codex"

if [[ -z "$SIMULATOR_UDID" ]]; then
  SIMULATOR_UDID="$(
    xcrun simctl list devices available -j | "$NODE_BIN" -e '
      let input = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => (input += chunk));
      process.stdin.on("end", () => {
        const preferredName = process.argv[1];
        const runtimes = JSON.parse(input).devices;
        const devices = Object.values(runtimes).flat();
        const iphones = devices.filter((device) => device.name.startsWith("iPhone"));
        const selected =
          iphones.find((device) => device.state === "Booted") ||
          iphones.find((device) => device.name === preferredName) ||
          iphones[0];
        if (selected) process.stdout.write(selected.udid);
      });
    ' "$SIMULATOR_DEVICE_NAME"
  )"
fi
[[ -n "$SIMULATOR_UDID" ]] ||
  die "no available iPhone Simulator found; set SIMULATOR_UDID explicitly"

TSX_CLI="$REPO_ROOT/node_modules/tsx/dist/cli.mjs"
EXPO_CLI="$REPO_ROOT/node_modules/expo/bin/cli"
[[ -f "$TSX_CLI" ]] || die "missing $TSX_CLI; run pnpm install"
[[ -f "$EXPO_CLI" ]] || die "missing $EXPO_CLI; run pnpm install"

relay_version_url="${CODEX_RELAY_SERVER_URL%/}/version"

relay_ready() {
  curl --noproxy '*' --silent --show-error --fail --max-time 1 "$relay_version_url" >/dev/null 2>&1
}

metro_ready() {
  curl --noproxy '*' --silent --show-error --fail --max-time 1 \
    "http://127.0.0.1:${METRO_PORT}/status" >/dev/null 2>&1
}

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM

  if [[ -n "$METRO_PID" ]] && kill -0 "$METRO_PID" >/dev/null 2>&1; then
    kill "$METRO_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "$RELAY_PID" ]] && kill -0 "$RELAY_PID" >/dev/null 2>&1; then
    kill "$RELAY_PID" >/dev/null 2>&1 || true
  fi

  wait "$METRO_PID" >/dev/null 2>&1 || true
  wait "$RELAY_PID" >/dev/null 2>&1 || true
  exit "$exit_code"
}

trap cleanup EXIT INT TERM

if relay_ready; then
  printf 'Relay already running at %s; reusing it.\n' "$CODEX_RELAY_SERVER_URL"
else
  printf 'Starting Relay in stdio app-server mode...\n'
  (
    cd "$REPO_ROOT"
    exec env \
      CODEX_BIN="$CODEX_BIN" \
      CODEX_RELAY_APP_SERVER_MODE=stdio \
      CODEX_RELAY_DANGEROUSLY_AUTO_APPROVE="${CODEX_RELAY_DANGEROUSLY_AUTO_APPROVE:-1}" \
      CODEX_RELAY_PORT="$RELAY_PORT" \
      NODE_ENV=development \
      PORT="$RELAY_PORT" \
      "$NODE_BIN" "$TSX_CLI" watch packages/codex-relay/src/cli.ts
  ) &
  RELAY_PID=$!
fi

for ((attempt = 1; attempt <= 30; attempt += 1)); do
  relay_ready && break
  if [[ -n "$RELAY_PID" ]] && ! kill -0 "$RELAY_PID" >/dev/null 2>&1; then
    die "Relay exited before becoming healthy"
  fi
  sleep 1
done
relay_ready || die "Relay did not become healthy at $relay_version_url"

if metro_ready; then
  printf 'Metro already running at http://127.0.0.1:%s; reusing it.\n' "$METRO_PORT"
else
  printf 'Starting Metro...\n'
  metro_args=(start --dev-client --lan --port "$METRO_PORT")
  if (( CLEAR_METRO )); then
    metro_args+=(--clear)
  fi
  (
    cd "$MOBILE_ROOT"
    exec env \
      EXPO_PUBLIC_CODEX_RELAY_SERVER_URL="$CODEX_RELAY_SERVER_URL" \
      "$NODE_BIN" "$EXPO_CLI" "${metro_args[@]}"
  ) &
  METRO_PID=$!
fi

for ((attempt = 1; attempt <= 120; attempt += 1)); do
  metro_ready && break
  if [[ -n "$METRO_PID" ]] && ! kill -0 "$METRO_PID" >/dev/null 2>&1; then
    die "Metro exited before becoming healthy"
  fi
  sleep 1
done
metro_ready || die "Metro did not become healthy on port $METRO_PORT"

open -a Simulator >/dev/null 2>&1 || true
xcrun simctl boot "$SIMULATOR_UDID" >/dev/null 2>&1 || true
xcrun simctl bootstatus "$SIMULATOR_UDID" -b

if ! xcrun simctl get_app_container "$SIMULATOR_UDID" "$APP_BUNDLE_ID" app >/dev/null 2>&1; then
  die "App $APP_BUNDLE_ID is not installed. Run: cd $MOBILE_ROOT && $NODE_BIN $EXPO_CLI run:ios --device $SIMULATOR_UDID"
fi

xcrun simctl launch "$SIMULATOR_UDID" "$APP_BUNDLE_ID"

printf '\nCodex Relay debug environment is running.\n'
printf 'Relay:     %s\n' "$CODEX_RELAY_SERVER_URL"
printf 'Metro:     http://127.0.0.1:%s\n' "$METRO_PORT"
printf 'Simulator: %s\n' "$SIMULATOR_UDID"
printf 'Press Ctrl-C to stop services started by this script.\n'

while :; do
  if [[ -n "$RELAY_PID" ]] && ! kill -0 "$RELAY_PID" >/dev/null 2>&1; then
    die "Relay stopped"
  fi
  if [[ -n "$METRO_PID" ]] && ! kill -0 "$METRO_PID" >/dev/null 2>&1; then
    die "Metro stopped"
  fi
  sleep 1
done
