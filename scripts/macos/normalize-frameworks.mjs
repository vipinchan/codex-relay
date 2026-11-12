import { cp, lstat, readdir, rename, rm, symlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";

export async function normalizeFramework(framework) {
  const name = path.basename(framework, ".framework");
  const versions = path.join(framework, "Versions");
  const current = path.join(versions, "Current");
  const version = path.join(versions, "A");
  const binary = path.join(framework, name);
  const resources = path.join(framework, "Resources");
  const binaryStat = await lstat(binary);
  if (binaryStat.isSymbolicLink()) return;

  await cp(binary, path.join(version, name), { force: true });
  await cp(resources, path.join(version, "Resources"), { recursive: true, force: true });
  for (const entry of await readdir(framework, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.endsWith(".bundle")) {
      await rename(path.join(framework, entry.name), path.join(version, "Resources", entry.name));
    }
  }
  await rm(binary);
  await rm(resources, { recursive: true });
  await rm(current, { recursive: true });
  await symlink("A", current);
  await symlink(`Versions/Current/${name}`, binary);
  await symlink("Versions/Current/Resources", resources);
}

async function main(app) {
  if (!app) throw new Error("Usage: node normalize-frameworks.mjs <app bundle>");
  for (const name of ["React", "ReactNativeDependencies"]) {
    await normalizeFramework(path.join(app, "Contents", "Frameworks", `${name}.framework`));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  await main(process.argv[2]);
}
