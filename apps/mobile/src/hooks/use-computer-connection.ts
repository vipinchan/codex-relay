import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { getActiveComputer, updateComputerMachineName } from "@/lib/computer-profiles";
import {
  captureConnection,
  getConnectionGeneration,
  onConnectionInvalidated,
} from "@/lib/connection-context";
import {
  fetchStatusState,
  setStatusState,
  fetchThreadsState,
  fetchModelsState,
  setThreadsState,
} from "@/lib/server-state";
import { getCodexRelayServerUrl } from "@/lib/codex-relay-api";
import { setConnection, setServerUrl } from "@/state/chat-store";

export function useComputerConnection() {
  const queryClient = useQueryClient();
  const generation = useSyncExternalStore(
    onConnectionInvalidated,
    getConnectionGeneration,
    getConnectionGeneration,
  );
  useEffect(() => {
    const context = captureConnection();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let foreground = AppState.currentState === "active";
    let stopped = false;
    let failures = 0;
    let loaded = false;
    async function refresh() {
      if (stopped || !foreground || !getActiveComputer()) return;
      try {
        const response = await fetchStatusState(queryClient);
        if (stopped || !context.isCurrent()) return;
        setStatusState(queryClient, response);
        setServerUrl(getCodexRelayServerUrl());
        if (response.machineName) updateComputerMachineName(response.machineName);
        setConnection("connected");
        failures = 0;
        if (!loaded) {
          const [threads] = await Promise.all([
            fetchThreadsState(queryClient),
            fetchModelsState(queryClient),
          ]);
          if (stopped || !context.isCurrent()) return;
          setThreadsState(queryClient, threads.threads, threads.source);
          loaded = true;
        }
        timer = setTimeout(() => void refresh(), 15000);
      } catch (error) {
        if (stopped || !context.isCurrent()) return;
        setConnection("offline", error instanceof Error ? error.message : "Connection failed.");
        const delay = [1000, 2000, 4000, 8000, 15000, 30000][Math.min(failures++, 5)]!;
        timer = setTimeout(() => void refresh(), delay);
      }
    }
    const subscription = AppState.addEventListener("change", (state) => {
      foreground = state === "active";
      clearTimeout(timer);
      if (foreground) void refresh();
    });
    if (getActiveComputer()) void refresh();
    return () => {
      stopped = true;
      clearTimeout(timer);
      subscription.remove();
    };
  }, [generation, queryClient]);
}
