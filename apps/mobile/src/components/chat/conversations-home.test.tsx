import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient } from "@tanstack/react-query";
import type {
  ArchiveThreadResponse,
  ListThreadsResponse,
  ThreadSummary,
} from "codex-relay/api-schema";
import type { AlertButton } from "react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ui = vi.hoisted(() => ({
  selectedThread: undefined as ThreadSummary | undefined,
  activeThreadId: undefined as string | undefined,
  cachedThreads: [] as ThreadSummary[],
  pending: false,
  rows: [] as { title: string; disabled?: boolean; onPress: () => void }[],
  sections: [] as { data: ThreadSummary[] }[],
  alert: vi.fn<(title: string, message: string, buttons?: AlertButton[]) => void>(),
  setActiveThread: vi.fn<(threadId?: string) => void>(),
  unpinThread: vi.fn<(threadId: string) => void>(),
  archiveThread: vi.fn<(threadId: string) => Promise<ArchiveThreadResponse>>(),
}));
let queryClient: QueryClient;

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof React>();
  return {
    ...actual,
    useState: (initial: unknown) =>
      actual.useState(initial === undefined ? ui.selectedThread : initial),
  };
});
vi.mock("@legendapp/state/react", () => ({ useSelector: (read: () => unknown) => read() }));
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQueryClient: () => queryClient,
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => ({
    data: queryClient.getQueryData(queryKey),
  }),
  useMutation: ({ mutationFn }: { mutationFn: (input: unknown) => Promise<unknown> }) => ({
    isPending: ui.pending,
    mutateAsync: mutationFn,
  }),
}));
vi.mock("react-native", () => ({
  Alert: { alert: ui.alert },
  Platform: { select: (values: { default: unknown }) => values.default },
  Pressable: ({ children }: { children: React.ReactNode }) => children,
  TextInput: "input",
  View: ({ children }: { children: React.ReactNode }) => children,
  SectionList: ({ sections }: { sections: typeof ui.sections }) => {
    ui.sections = sections;
    return null;
  },
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("react-native-unistyles", () => ({ StyleSheet: { create: (styles: unknown) => styles } }));
vi.mock("expo-router", () => ({ router: {} }));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/components/ui/button", () => ({ Button: "button" }));
vi.mock("@/components/ui/text", () => ({
  Text: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/themed-text", () => ({
  ThemedText: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/ui/bottom-sheet", () => ({
  AppBottomSheet: ({ children }: { children: React.ReactNode }) => children,
  AppBottomSheetTextInput: "input",
  SheetActionRow: (props: (typeof ui.rows)[number]) => {
    ui.rows.push(props);
    return null;
  },
}));
vi.mock("@/hooks/use-theme", () => ({ useTheme: () => ({}) }));
vi.mock("@/lib/haptics", () => ({
  hapticLightImpact: vi.fn<() => void>(),
  hapticSelection: vi.fn<() => void>(),
  hapticSuccess: vi.fn<() => void>(),
}));
vi.mock("@/lib/codex-relay-api", () => ({
  hasCodexRelaySession: () => true,
  getCodexRelayServerUrl: () => "http://relay.test",
  archiveThread: ui.archiveThread,
  getThreadContextWindow: vi.fn<() => void>(),
  listModels: vi.fn<() => void>(),
  listQueuedThreadInputs: vi.fn<() => void>(),
  getRateLimits: vi.fn<() => void>(),
  getStatus: vi.fn<() => void>(),
  getThread: vi.fn<() => void>(),
  listThreads: vi.fn<() => void>(),
  getVersion: vi.fn<() => void>(),
  getWorkspaceChanges: vi.fn<() => void>(),
  listWorkspaceDirectories: vi.fn<() => void>(),
}));
vi.mock("@/lib/workspace-runtime-preferences-cache", () => ({
  cacheWorkspaceRuntimePreferences: vi.fn<() => void>(),
  cacheWorkspaceRuntimePreferencesFromStatus: vi.fn<() => void>(),
}));
vi.mock("@/state/chat-store", () => ({
  chatStore$: {
    hasPairedSession: { get: () => true },
    threadIds: { get: () => ui.cachedThreads.map((thread) => thread.id) },
    threadsById: {
      get: () => Object.fromEntries(ui.cachedThreads.map((thread) => [thread.id, thread])),
    },
    activeThreadId: { peek: () => ui.activeThreadId },
  },
  setActiveThread: ui.setActiveThread,
  setHasPairedSession: vi.fn<() => void>(),
  requestThreadStreamReconnect: vi.fn<() => void>(),
}));
vi.mock("@/state/pinned-thread-store", () => ({
  pinnedThreadStore$: { threadIds: { get: () => ["removed"] } },
  togglePinnedThread: vi.fn<() => void>(),
  unpinThread: ui.unpinThread,
}));
vi.mock("@/state/conversations-view-store", () => ({
  conversationsViewStore$: { groupingMode: { get: () => "time" } },
  toggleConversationsGroupingMode: vi.fn<() => void>(),
}));

import { ConversationsHome } from "./ConversationsHome";
import { serverStateKeys } from "@/lib/server-state";

const removed: ThreadSummary = {
  id: "removed",
  title: "Old conversation",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  state: "completed",
  messageCount: 2,
};
const remaining = { ...removed, id: "remaining", title: "Another conversation" };

function renderHome() {
  ui.rows = [];
  renderToStaticMarkup(React.createElement(ConversationsHome));
}

function requestRemoval() {
  renderHome();
  const action = ui.rows.find((row) => row.title === "Remove chat");
  expect(action).toBeDefined();
  action!.onPress();
  expect(ui.archiveThread).not.toHaveBeenCalled();
  const [, message, buttons] = ui.alert.mock.lastCall!;
  expect(message).toContain(removed.title);
  expect(message).toMatch(/history.*kept/i);
  return buttons as { style: string; onPress?: () => void }[];
}

describe("conversation home removal", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("React", React);
    vi.spyOn(Intl, "DateTimeFormat").mockReturnValue({
      resolvedOptions: () => ({ locale: "en-US" }),
    } as Intl.DateTimeFormat);
    ui.selectedThread = removed;
    ui.activeThreadId = removed.id;
    ui.cachedThreads = [removed, remaining];
    ui.pending = false;
    queryClient = new QueryClient();
    queryClient.setQueryData(serverStateKeys.threads(), {
      source: "app-server",
      threads: [removed, remaining],
    });
    queryClient.setQueryData(serverStateKeys.thread(removed.id), { messages: ["cached"] });
    ui.archiveThread.mockResolvedValue({
      archivedThreadId: removed.id,
      source: "app-server",
      threads: [remaining],
    });
  });

  it("requires confirmation and allows cancellation without changing history or selection", () => {
    const buttons = requestRemoval();
    buttons.find((button) => button.style === "cancel")?.onPress?.();
    expect(ui.archiveThread).not.toHaveBeenCalled();
    expect(ui.setActiveThread).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(serverStateKeys.thread(removed.id))).toBeDefined();
  });

  it("uses the archive API, refreshes the list and switches away from the removed active chat", async () => {
    requestRemoval().find((button) => button.style === "destructive")!.onPress!();
    await vi.waitFor(() => expect(ui.setActiveThread).toHaveBeenCalledWith(remaining.id));
    expect(ui.archiveThread).toHaveBeenCalledExactlyOnceWith(removed.id);
    expect(queryClient.getQueryData(serverStateKeys.threads())).toEqual({
      source: "app-server",
      threads: [remaining],
    });
    expect(queryClient.getQueryData(serverStateKeys.thread(removed.id))).toBeUndefined();
    expect(ui.unpinThread).toHaveBeenCalledWith(removed.id);
  });

  it("preserves another active chat when removing an inactive conversation", async () => {
    ui.activeThreadId = remaining.id;
    requestRemoval().find((button) => button.style === "destructive")!.onPress!();
    await vi.waitFor(() => expect(ui.unpinThread).toHaveBeenCalledWith(removed.id));
    expect(ui.setActiveThread).not.toHaveBeenCalled();
  });

  it("clears the active selection and does not revive cached chats after removing the last chat", async () => {
    ui.archiveThread.mockResolvedValue({
      archivedThreadId: removed.id,
      source: "app-server",
      threads: [],
    });
    requestRemoval().find((button) => button.style === "destructive")!.onPress!();
    await vi.waitFor(() => expect(ui.setActiveThread).toHaveBeenCalledWith(undefined));
    renderHome();
    expect(ui.sections.flatMap((section) => section.data)).toEqual([]);
  });

  it("reports an archive failure without removing the chat or its pin", async () => {
    ui.archiveThread.mockRejectedValue(new Error("Connection lost"));
    requestRemoval().find((button) => button.style === "destructive")!.onPress!();
    await vi.waitFor(() =>
      expect(ui.alert).toHaveBeenLastCalledWith("Couldn’t remove chat", "Connection lost"),
    );
    expect(ui.setActiveThread).not.toHaveBeenCalled();
    expect(ui.unpinThread).not.toHaveBeenCalled();
    expect(
      queryClient.getQueryData<ListThreadsResponse>(serverStateKeys.threads())?.threads,
    ).toEqual([removed, remaining]);
  });

  it("disables removal while a request is pending", () => {
    ui.pending = true;
    renderHome();
    expect(ui.rows.find((row) => row.title === "Removing chat…")?.disabled).toBe(true);
  });

  it("does not offer removal for cached fallback threads", () => {
    queryClient.setQueryData(serverStateKeys.threads(), { source: "memory", threads: [removed] });
    renderHome();
    expect(ui.rows.some((row) => row.title === "Remove chat")).toBe(false);
  });
});
