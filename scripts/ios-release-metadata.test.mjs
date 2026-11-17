import assert from "node:assert/strict";
import test from "node:test";

import { resolveIosRelease } from "./ios-release-metadata.mjs";

test("main builds have independent versions across runs and reruns", () => {
  const input = {
    channel: "beta",
    appVersion: "1.5.0",
    ref: "refs/heads/main",
    runNumber: "42",
    runAttempt: "1",
  };
  assert.deepEqual(resolveIosRelease(input), {
    version: "1.5.0-beta.42.1",
    tag: "v1.5.0-beta.42.1",
    ipa: "CodexRelay-1.5.0-beta.42.1.ipa",
    prerelease: true,
  });
  assert.notEqual(
    resolveIosRelease(input).tag,
    resolveIosRelease({ ...input, runAttempt: "2" }).tag,
  );
  assert.throws(() => resolveIosRelease({ ...input, ref: "refs/heads/feat/test" }));
});

test("stable releases require an exact stable tag matching the native version", () => {
  const input = { channel: "stable", appVersion: "1.5.0", ref: "refs/tags/v1.5.0" };
  assert.deepEqual(resolveIosRelease(input), {
    version: "1.5.0",
    tag: "v1.5.0",
    ipa: "CodexRelay-1.5.0.ipa",
    prerelease: false,
  });
  for (const ref of [
    "refs/heads/main",
    "refs/tags/v1.5.1",
    "refs/tags/v1.5.0-beta.1",
    "refs/tags/v01.5.0",
    "refs/tags/v1.5.0\n",
  ]) {
    assert.throws(() => resolveIosRelease({ ...input, ref }));
  }
});

test("reject invalid channels, app versions, and beta run identifiers", () => {
  const input = {
    channel: "beta",
    appVersion: "1.5.0",
    ref: "refs/heads/main",
    runNumber: "42",
    runAttempt: "1",
  };
  for (const appVersion of ["1.5.0-beta.1", "01.5.0", "1.5", "1.5.0\n"]) {
    assert.throws(() => resolveIosRelease({ ...input, appVersion }));
  }
  for (const value of ["", undefined, "0", "01", "1\n", "1; echo invalid"]) {
    assert.throws(() => resolveIosRelease({ ...input, runNumber: value }));
    assert.throws(() => resolveIosRelease({ ...input, runAttempt: value }));
  }
  assert.throws(() => resolveIosRelease({ ...input, channel: "production" }));
});
