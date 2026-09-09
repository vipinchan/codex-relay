import type { ThreadSummary } from "codex-relay/api-schema";

type WorkspaceThread = Pick<
  ThreadSummary,
  "createdAt" | "cwd" | "lastActivityAt" | "updatedAt"
>;

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
