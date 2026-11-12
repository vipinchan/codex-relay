import { cp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
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
for (const name of await readdir(path.join(root, "apps/mobile/node_modules"))) {
  const destination = path.join(modules, name);
  await rm(destination, { recursive: true, force: true });
  const source = path.join(root, "apps/mobile/node_modules", name);
  if (name === "expo-camera") {
    const camera = JSON.parse(await readFile(path.join(source, "package.json"), "utf8"));
    if (camera.version !== "57.0.4") {
      throw new Error(`Review the Catalyst camera patch for expo-camera ${camera.version}`);
    }
    await cp(source, destination, { recursive: true, dereference: true });
    execFileSync(
      "patch",
      ["--batch", "-p1", "-i", path.join(root, "scripts/macos/expo-camera.patch")],
      {
        cwd: destination,
        stdio: "inherit",
      },
    );
  } else {
    await symlink(source, destination);
  }
}

// This package copy belongs only to the Mac build; installed mobile dependencies stay untouched.
const packagePath = path.join(workspace, "apps/mobile/package.json");
const mobilePackage = JSON.parse(await readFile(packagePath, "utf8"));
mobilePackage["enriched-markdown"] = {
  ...mobilePackage["enriched-markdown"],
  enableMath: false,
};
await writeFile(packagePath, `${JSON.stringify(mobilePackage, null, 2)}\n`);
