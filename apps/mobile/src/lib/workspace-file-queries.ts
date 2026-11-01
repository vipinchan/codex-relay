import { getCodexRelayCacheIdentity } from "./codex-relay-api";

export const workspaceFileContentQueryKey = (
  workspacePath: string | undefined,
  path: string | null,
) =>
  [
    "codex-relay-workspace-preview-file",
    getCodexRelayCacheIdentity(),
    workspacePath ?? null,
    path,
  ] as const;

export const workspaceFilesQueryKeyPrefix = (workspacePath: string | undefined) =>
  [
    "codex-relay-workspace-preview-files",
    getCodexRelayCacheIdentity(),
    workspacePath ?? null,
  ] as const;

export const workspaceFilesQueryKey = (
  workspacePath: string | undefined,
  directory: string,
  query: string,
) => [...workspaceFilesQueryKeyPrefix(workspacePath), directory, query] as const;
