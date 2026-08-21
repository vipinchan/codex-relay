import type { ThreadSummary } from "codex-relay/api-schema";

export function activeThreadAfterRefresh({
  currentActiveThreadId,
  missingActiveThreadRestored,
  threads,
}: {
  currentActiveThreadId: string | undefined;
  missingActiveThreadRestored: boolean;
  threads: ThreadSummary[];
}) {
  if (
    currentActiveThreadId &&
    (missingActiveThreadRestored || threads.some((thread) => thread.id === currentActiveThreadId))
  ) {
    return currentActiveThreadId;
  }

  // OpenMinis-style navigation treats the session list as the app's home.
  // When there is no deliberate selection, stay on history instead of
  // implicitly opening the newest thread after every refresh/startup.
  return undefined;
}
