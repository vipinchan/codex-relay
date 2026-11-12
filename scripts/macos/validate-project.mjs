import { readFile } from "node:fs/promises";
import path from "node:path";

const ios = process.argv[2];
if (!ios) throw new Error("Expected generated iOS project directory");
const delegate = await readFile(path.join(ios, "CodexRelay/AppDelegate.swift"), "utf8");
const project = await readFile(path.join(ios, "CodexRelay.xcodeproj/project.pbxproj"), "utf8");
const podfile = await readFile(path.join(ios, "Podfile"), "utf8");
if (
  delegate.includes("HotUpdater.bundleURL()") ||
  !delegate.includes('Bundle.main.url(forResource: "main", withExtension: "jsbundle")') ||
  !project.includes("SUPPORTS_MACCATALYST = YES") ||
  !podfile.includes(":mac_catalyst_enabled => true")
) {
  throw new Error("Generated project is missing Catalyst support or the embedded JS entry point");
}
