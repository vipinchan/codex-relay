import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, readFile, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { normalizeFramework } from "./normalize-frameworks.mjs";

test("normalizes a copied Catalyst framework while preserving its binary and resources", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "relay-framework-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const framework = path.join(dir, "React.framework");
  await mkdir(path.join(framework, "Versions/A/Resources"), { recursive: true });
  await mkdir(path.join(framework, "Versions/Current"), { recursive: true });
  await mkdir(path.join(framework, "Resources"));
  await mkdir(path.join(framework, "Metadata.bundle"));
  await writeFile(path.join(framework, "React"), "thinned binary");
  await writeFile(path.join(framework, "Versions/A/React"), "old binary");
  await writeFile(path.join(framework, "Versions/A/Resources/Info.plist"), "metadata");
  await writeFile(path.join(framework, "Metadata.bundle/data"), "bundle");

  await normalizeFramework(framework);

  assert.equal(await readlink(path.join(framework, "Versions/Current")), "A");
  assert.equal(await readlink(path.join(framework, "React")), "Versions/Current/React");
  assert.equal(await readlink(path.join(framework, "Resources")), "Versions/Current/Resources");
  assert.equal(await readFile(path.join(framework, "Versions/A/React"), "utf8"), "thinned binary");
  assert.equal(
    await readFile(path.join(framework, "Resources/Metadata.bundle/data"), "utf8"),
    "bundle",
  );
  await normalizeFramework(framework);
});

test("runs the command line entry point through a symlinked checkout", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "relay-framework-cli-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const app = path.join(dir, "Relay.app");
  for (const name of ["React", "ReactNativeDependencies"]) {
    const framework = path.join(app, "Contents/Frameworks", `${name}.framework`);
    await mkdir(path.join(framework, "Versions/A/Resources"), { recursive: true });
    await mkdir(path.join(framework, "Versions/Current"));
    await mkdir(path.join(framework, "Resources"));
    await writeFile(path.join(framework, name), "binary");
  }
  const entry = path.join(dir, "normalize.mjs");
  await symlink(fileURLToPath(new URL("./normalize-frameworks.mjs", import.meta.url)), entry);
  execFileSync(process.execPath, [entry, app]);
  assert.equal(
    await readlink(path.join(app, "Contents/Frameworks/React.framework/React")),
    "Versions/Current/React",
  );
});
