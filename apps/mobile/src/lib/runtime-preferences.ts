import type { RuntimePreferences, ThreadSummary } from "codex-relay/api-schema";

type ThreadRuntimePreferences = Pick<
  ThreadSummary,
  "model" | "reasoningEffort" | "runtimeMode" | "serviceTier"
>;

export function runtimePreferencesForWorkspace(
  pending: RuntimePreferences | undefined,
  fallback: RuntimePreferences,
): RuntimePreferences {
  return pending ?? fallback;
}

export function runtimePreferencesForThread(
  pending: RuntimePreferences | undefined,
  thread: ThreadRuntimePreferences | undefined,
  fallback: RuntimePreferences,
): RuntimePreferences {
  if (pending) {
    return pending;
  }
  if (!thread) {
    return fallback;
  }
  return {
    ...fallback,
    ...(thread.model !== undefined ? { model: thread.model } : {}),
    ...(thread.serviceTier !== undefined ? { serviceTier: thread.serviceTier } : {}),
    ...(thread.reasoningEffort !== undefined ? { reasoningEffort: thread.reasoningEffort } : {}),
    ...(thread.runtimeMode !== undefined ? { runtimeMode: thread.runtimeMode } : {}),
  };
}

export function runtimePreferencesScope(threadId: string | undefined) {
  return threadId ? "thread" : "workspace";
}
