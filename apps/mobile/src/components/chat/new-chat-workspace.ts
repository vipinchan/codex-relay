import type { ThreadSummary } from "codex-relay/api-schema";

type WorkspaceThread = Pick<ThreadSummary, "createdAt" | "cwd" | "lastActivityAt" | "updatedAt">;

export function workspacePathInputError(input: string) {
  const path = input.trim();
  if (!path) return "Enter a folder path.";
  if (!path.startsWith("/")) return "Enter an absolute path starting with /.";
  return undefined;
}

export function preferredNewChatWorkspacePath(
  threads: WorkspaceThread[],
  fallbackWorkspacePath: string | undefined,
) {
  let latestThread: WorkspaceThread | undefined;
  for (const thread of threads) {
    if (!latestThread || activityTimestamp(thread) > activityTimestamp(latestThread)) {
      latestThread = thread;
    }
  }
  return latestThread?.cwd?.trim() || fallbackWorkspacePath;
}

function activityTimestamp(thread: WorkspaceThread) {
  return new Date(thread.lastActivityAt || thread.updatedAt || thread.createdAt).getTime();
}
