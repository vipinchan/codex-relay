import { cp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const [root, workspace] = process.argv.slice(2).map((value) => path.resolve(value));
if (!root || !workspace || workspace === root)
  throw new Error("Expected source and build workspace");

await mkdir(path.join(workspace, "apps/mobile"), { recursive: true });
execFileSync(
  "rsync",
  [
    "-a",
    "--delete",
    "--exclude=ios",
    "--exclude=android",
    "--exclude=node_modules",
    "--exclude=.expo",
    "--exclude=.env*",
    "--exclude=keys",
    "--exclude=.hot-updater",
    `${root}/apps/mobile/`,
    `${workspace}/apps/mobile/`,
  ],
  { stdio: "inherit" },
);
for (const name of ["package.json", "pnpm-workspace.yaml"]) {
  await cp(path.join(root, name), path.join(workspace, name));
}
for (const name of ["node_modules", "packages"]) {
  await rm(path.join(workspace, name), { force: true });
  await symlink(path.join(root, name), path.join(workspace, name));
}

const modules = path.join(workspace, "apps/mobile/node_modules");
await mkdir(modules, { recursive: true });
const mobileRequire = createRequire(path.join(root, "apps/mobile/package.json"));
for (const name of await readdir(path.join(root, "apps/mobile/node_modules"))) {
  if (name.startsWith(".")) continue;
  const destination = path.join(modules, name);
  await rm(destination, { recursive: true, force: true });
  await symlink(path.join(root, "apps/mobile/node_modules", name), destination);
}

// pnpm may hoist this package to the workspace root; keep the patched copy local
// to the Mac build so the installed mobile dependency remains untouched.
const cameraSource = path.dirname(mobileRequire.resolve("expo-camera/package.json"));
const camera = JSON.parse(await readFile(path.join(cameraSource, "package.json"), "utf8"));
if (camera.version !== "57.0.4") {
  throw new Error(`Review the Catalyst camera patch for expo-camera ${camera.version}`);
}
const cameraDestination = path.join(modules, "expo-camera");
await rm(cameraDestination, { recursive: true, force: true });
await cp(cameraSource, cameraDestination, { recursive: true, dereference: true });
execFileSync(
  "patch",
  ["--batch", "-p1", "-i", path.join(root, "scripts/macos/expo-camera.patch")],
  {
    cwd: cameraDestination,
    stdio: "inherit",
  },
);

// This package copy belongs only to the Mac build; installed mobile dependencies stay untouched.
const packagePath = path.join(workspace, "apps/mobile/package.json");
const mobilePackage = JSON.parse(await readFile(packagePath, "utf8"));
mobilePackage["enriched-markdown"] = {
  ...mobilePackage["enriched-markdown"],
  enableMath: false,
};
await writeFile(packagePath, `${JSON.stringify(mobilePackage, null, 2)}\n`);
