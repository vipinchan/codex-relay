import {
  RuntimePreferencesSchema,
  type RuntimePreferences,
  type StatusResponse,
} from "codex-relay/api-schema";
import { createMMKV } from "react-native-mmkv";

import { getActiveComputer } from "./computer-profiles";

const storage = createMMKV({ id: "codex-relay-workspace-runtime-preferences" });

export function readCachedWorkspaceRuntimePreferences(
  serverUrl: string,
  workspacePath: string | undefined,
): RuntimePreferences | undefined {
  if (!workspacePath) {
    return undefined;
  }

  const key = cacheKey(serverUrl, workspacePath);
  const legacyKey = `${normalizeServerUrl(serverUrl)}::${workspacePath}`;
  const raw = storage.getString(key) ?? storage.getString(legacyKey);
  if (raw && key !== legacyKey) {
    storage.set(key, raw);
    storage.remove(legacyKey);
  }
  if (!raw) {
    return undefined;
  }

  try {
    const parsed = RuntimePreferencesSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function cacheWorkspaceRuntimePreferences(
  serverUrl: string,
  workspacePath: string | undefined,
  preferences: RuntimePreferences,
) {
  if (!workspacePath) {
    return;
  }

  storage.set(
    cacheKey(serverUrl, workspacePath),
    JSON.stringify(RuntimePreferencesSchema.parse(preferences)),
  );
}

export function cacheWorkspaceRuntimePreferencesFromStatus(
  serverUrl: string,
  status: StatusResponse,
) {
  cacheWorkspaceRuntimePreferences(serverUrl, status.workspacePath, status.preferences);
  for (const [workspacePath, preferences] of Object.entries(
    status.runtimePreferencesByWorkspacePath ?? {},
  )) {
    cacheWorkspaceRuntimePreferences(serverUrl, workspacePath, preferences);
  }
}

function cacheKey(serverUrl: string, workspacePath: string) {
  const computer = getActiveComputer();
  const namespace = computer?.addresses.includes(normalizeServerUrl(serverUrl))
    ? computer.id
    : normalizeServerUrl(serverUrl);
  return `${namespace}::${workspacePath}`;
}

function normalizeServerUrl(serverUrl: string) {
  return serverUrl.trim().replace(/\/$/, "");
}

export function clearComputerRuntimePreferences(id: string) {
  for (const key of storage.getAllKeys()) if (key.startsWith(`${id}::`)) storage.remove(key);
}
