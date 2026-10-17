import { spawn } from "node:child_process";

import { resolveCodexPluginListSpawn } from "./codex-binary.js";

export type InstalledCodexPlugin = {
  id: string;
  name: string;
  description?: string;
  version?: string;
};

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function listInstalledCodexPlugins(): Promise<InstalledCodexPlugin[]> {
  const executable = resolveCodexPluginListSpawn();
  const output = await new Promise<string>((resolve, reject) => {
    const process = spawn(executable.command, executable.args, {
      shell: executable.shell,
      windowsHide: executable.windowsHide,
      stdio: ["ignore", "pipe", "ignore"],
    });
    let stdout = "";
    const timeout = setTimeout(() => process.kill(), 8_000);
    process.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      if (stdout.length > 1_000_000) process.kill();
    });
    process.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    process.once("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0 || stdout.length > 1_000_000) {
        reject(new Error("The installed plugin catalog is unavailable."));
        return;
      }
      resolve(stdout);
    });
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error("The installed plugin catalog returned invalid JSON.");
  }
  const installed =
    parsed && typeof parsed === "object" && "installed" in parsed
      ? (parsed as { installed?: unknown }).installed
      : undefined;
  if (!Array.isArray(installed)) {
    throw new Error("The installed plugin catalog has an unsupported format.");
  }

  return installed.flatMap((item): InstalledCodexPlugin[] => {
    if (!item || typeof item !== "object") return [];
    const entry = item as Record<string, unknown>;
    const name = nonEmptyString(entry.name) ?? nonEmptyString(entry.display_name);
    if (!name) return [];
    const marketplace = nonEmptyString(entry.marketplace);
    const id = nonEmptyString(entry.id) ?? (marketplace ? `${name}@${marketplace}` : name);
    return [
      {
        id,
        name,
        ...(nonEmptyString(entry.description)
          ? { description: nonEmptyString(entry.description) }
          : {}),
        ...(nonEmptyString(entry.version) ? { version: nonEmptyString(entry.version) } : {}),
      },
    ];
  });
}
