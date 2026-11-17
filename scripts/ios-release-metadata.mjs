import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const stableVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const runIdentifierPattern = /^[1-9]\d*$/;

export function resolveIosRelease({ channel, appVersion, ref, runNumber, runAttempt }) {
  if (typeof appVersion !== "string" || stableVersionPattern.exec(appVersion)?.[0] !== appVersion) {
    throw new Error("The configured native app version must be X.Y.Z");
  }
  let version;
  if (channel === "stable") {
    if (ref !== `refs/tags/v${appVersion}`) {
      throw new Error(`Stable release requires tag v${appVersion} matching Expo config`);
    }
    version = appVersion;
  } else if (channel === "beta") {
    if (ref !== "refs/heads/main") {
      throw new Error("Beta releases must originate from main");
    }
    for (const identifier of [runNumber, runAttempt]) {
      if (
        typeof identifier !== "string" ||
        runIdentifierPattern.exec(identifier)?.[0] !== identifier
      ) {
        throw new Error("Beta releases require positive run and attempt numbers");
      }
    }
    version = `${appVersion}-beta.${runNumber}.${runAttempt}`;
  } else {
    throw new Error("Unknown iOS release channel");
  }
  return {
    version,
    tag: `v${version}`,
    ipa: `CodexRelay-${version}.ipa`,
    prerelease: channel === "beta",
  };
}

function main() {
  const config = JSON.parse(readFileSync(process.argv[2], "utf8"));
  const metadata = resolveIosRelease({
    channel: process.env.RELEASE_CHANNEL,
    appVersion: config.version,
    ref: process.env.GITHUB_REF,
    runNumber: process.env.GITHUB_RUN_NUMBER,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT,
  });
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    Object.entries(metadata)
      .map(([key, value]) => `${key}=${value}\n`)
      .join(""),
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
