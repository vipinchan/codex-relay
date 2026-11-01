import { clearComputerRuntimePreferences } from "./workspace-runtime-preferences-cache";
import { createMMKV } from "react-native-mmkv";
import { chatStore$, resetChatSessionState } from "@/state/chat-store";
import { pinnedThreadStore$ } from "@/state/pinned-thread-store";
import { workspacePreviewStore$ } from "@/state/workspace-preview-store";
import {
  getActiveComputer,
  getComputers,
  subscribeComputerProfiles,
  onComputerSwitch,
  type ComputerProfile,
} from "./computer-profiles";

const storage = createMMKV({ id: "codex-relay-computer-state" });
let initialized = false;
type Snapshot = {
  chat: ReturnType<typeof chatStore$.peek>;
  pinned: ReturnType<typeof pinnedThreadStore$.peek>;
  preview: ReturnType<typeof workspacePreviewStore$.peek>;
};

function saveComputerState(profile: ComputerProfile) {
  const snapshot: Snapshot = {
    chat: chatStore$.peek(),
    pinned: pinnedThreadStore$.peek(),
    preview: workspacePreviewStore$.peek(),
  };
  storage.set(profile.id, JSON.stringify(snapshot));
}

export function saveCurrentComputerState() {
  const active = getActiveComputer();
  if (active) saveComputerState(active);
}

export function forgetComputerState(id: string) {
  storage.remove(id);
  clearComputerRuntimePreferences(id);
}

function restoreComputerState(profile: ComputerProfile | undefined) {
  resetChatSessionState();
  pinnedThreadStore$.set({ threadIds: [] });
  if (!profile) return;
  let snapshot: Snapshot | undefined;
  try {
    const raw = storage.getString(profile.id);
    if (raw) snapshot = JSON.parse(raw) as Snapshot;
  } catch {
    /* A damaged UI cache never invalidates a pairing. */
  }
  if (snapshot?.chat && snapshot.pinned && snapshot.preview) {
    chatStore$.set({
      ...snapshot.chat,
      threadMessagesLoadingByThreadId: {},
      threadStreamReconnectRequest: undefined,
    });
    pinnedThreadStore$.set(snapshot.pinned);
    workspacePreviewStore$.set(snapshot.preview);
  }
  chatStore$.serverUrl.set(profile.activeUrl);
  chatStore$.hasPairedSession.set(true);
  chatStore$.connection.set("checking");
  chatStore$.error.set(undefined);
}

export function initializeComputerSessionState() {
  if (initialized) return;
  initialized = true;
  const active = getActiveComputer();
  if (active) {
    if (storage.getString(active.id)) restoreComputerState(active);
    else {
      chatStore$.serverUrl.set(active.activeUrl);
      chatStore$.hasPairedSession.set(true);
      saveComputerState(active);
    }
  }
  let knownIds = getComputers().map((computer) => computer.id);
  subscribeComputerProfiles(() => {
    const ids = getComputers().map((computer) => computer.id);
    for (const id of knownIds) if (!ids.includes(id)) forgetComputerState(id);
    knownIds = ids;
  });
  onComputerSwitch((previous, next) => {
    if (previous) {
      try {
        saveComputerState(previous);
      } catch {
        // Failure to persist a UI cache must not interrupt a committed pairing.
      }
    }
    restoreComputerState(next);
  });
}
