import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ListThreadsResponse } from "codex-relay/api-schema";

const state = vi.hoisted(() => ({
  mode: "time",
  fetching: false,
  pending: false,
  error: null as Error | null,
  queryError: null as Error | null,
  list: undefined as Record<string, unknown> | undefined,
  data: {
    source: "app-server",
    nextCursor: "older",
    threads: [
      {
        id: "recent",
        title: "Recent conversation",
        createdAt: "2026-11-17T00:00:00.000Z",
        updatedAt: "2026-11-17T00:00:00.000Z",
        cwd: "/workspace/project",
        state: "completed",
        messageCount: 1,
      },
    ],
  } as ListThreadsResponse,
  loadOlder: vi.fn<(client: unknown) => Promise<void>>(),
  refresh: vi.fn<(client: unknown, options: { refresh: boolean }) => Promise<void>>(),
}));

vi.mock("react-native", () => ({
  View: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  Pressable: ({ children, onPress }: React.PropsWithChildren<{ onPress?: () => void }>) => (
    <button onClick={onPress}>{typeof children === "function" ? null : children}</button>
  ),
  TextInput: () => <input />,
  ActivityIndicator: () => <span>loading</span>,
  SectionList: (props: Record<string, unknown>) => {
    state.list = props;
    return <section>{props.ListFooterComponent as React.ReactNode}</section>;
  },
  Alert: { alert: vi.fn<() => void>() },
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: React.PropsWithChildren) => <main>{children}</main>,
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
}));
vi.mock("@legendapp/state/react", () => ({
  useSelector: (selector: () => unknown) => selector(),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({}),
  useQuery: () => ({
    data: state.data,
    error: state.queryError,
    isFetching: state.fetching,
    refetch: state.refresh,
  }),
  useMutation: ({
    mutationFn,
    mutationKey,
  }: {
    mutationFn: () => unknown;
    mutationKey?: unknown[];
  }) => ({
    mutate: mutationFn,
    mutateAsync: mutationFn,
    isPending: mutationKey ? state.pending : false,
    error: mutationKey ? state.error : null,
    reset: vi.fn<() => void>(),
  }),
}));
vi.mock("expo-router", () => ({ router: { push: vi.fn<() => void>() } }));
vi.mock("@/hooks/use-computer-operations", () => ({
  useComputerOperations: (operations: unknown) => operations,
}));
vi.mock("@/hooks/use-theme", () => ({ useTheme: () => ({}) }));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/components/ui/button", () => ({ Button: () => null }));
vi.mock("@/components/ui/text", () => ({
  Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
vi.mock("@/components/themed-text", () => ({
  ThemedText: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
vi.mock("@/components/ui/bottom-sheet", () => ({
  AppBottomSheet: () => null,
  AppBottomSheetTextInput: () => null,
  SheetActionRow: () => null,
}));
vi.mock("@/lib/codex-relay-api", () => ({ hasCodexRelaySession: () => true }));
vi.mock("@/lib/haptics", () => ({
  hapticLightImpact: vi.fn<() => void>(),
  hapticSelection: vi.fn<() => void>(),
  hapticSuccess: vi.fn<() => void>(),
}));
vi.mock("@/lib/server-state", () => ({
  archiveThreadServerState: vi.fn<() => void>(),
  regenerateThreadTitleServerState: vi.fn<() => void>(),
  renameThreadServerState: vi.fn<() => void>(),
  fetchOlderThreadsState: state.loadOlder,
  fetchThreadsState: state.refresh,
  serverStateKeys: { threads: () => ["threads", "computer-a"] },
  serverStateQueryFns: { threads: vi.fn<() => void>() },
}));
vi.mock("@/state/chat-store", () => ({
  chatStore$: {
    hasPairedSession: { get: () => true },
    threadIds: { get: () => [] },
    threadsById: { get: () => ({}) },
  },
  requestThreadStreamReconnect: vi.fn<() => void>(),
  setActiveThread: vi.fn<() => void>(),
  setHasPairedSession: vi.fn<() => void>(),
}));
vi.mock("@/state/pinned-thread-store", () => ({
  pinnedThreadStore$: { threadIds: { get: () => [] } },
  togglePinnedThread: vi.fn<() => void>(),
  unpinThread: vi.fn<() => void>(),
}));
vi.mock("@/state/conversations-view-store", () => ({
  conversationsViewStore$: { groupingMode: { get: () => state.mode } },
  toggleConversationsGroupingMode: vi.fn<() => void>(),
}));

import { ConversationsHome } from "./ConversationsHome";

describe("conversation list paging interaction", () => {
  beforeEach(() => {
    state.loadOlder.mockReset();
    state.refresh.mockReset();
    state.loadOlder.mockResolvedValue(undefined);
    state.refresh.mockResolvedValue(undefined);
    state.mode = "time";
    state.data.nextCursor = "older";
    state.pending = false;
    state.error = null;
    state.queryError = null;
    state.fetching = false;
  });

  it.each(["time", "project"])(
    "loads a global page at the end in %s grouping after a scroll",
    (mode) => {
      state.mode = mode;
      renderToStaticMarkup(<ConversationsHome />);
      const onEndReached = state.list?.onEndReached as () => void;
      expect(onEndReached).toBeTypeOf("function");
      onEndReached();
      expect(state.loadOlder).not.toHaveBeenCalled();
      (state.list!.onScrollBeginDrag as () => void)();
      onEndReached();
      onEndReached();
      expect(state.loadOlder).toHaveBeenCalledTimes(1);
    },
  );

  it("does not start another page when loading or after history is exhausted", () => {
    state.pending = true;
    renderToStaticMarkup(<ConversationsHome />);
    (state.list!.onScrollBeginDrag as () => void)();
    (state.list!.onEndReached as () => void)();
    expect(state.loadOlder).not.toHaveBeenCalled();
    state.pending = false;
    state.data.nextCursor = null;
    const markup = renderToStaticMarkup(<ConversationsHome />);
    (state.list!.onScrollBeginDrag as () => void)();
    (state.list!.onEndReached as () => void)();
    expect(state.loadOlder).not.toHaveBeenCalled();
    expect(markup).toMatch(/All conversations loaded|已加载全部会话/);
  });

  it("provides a global retry footer without any project Show more control", () => {
    state.error = new Error("Offline");
    const markup = renderToStaticMarkup(<ConversationsHome />);
    expect(markup).toMatch(/retry|重试/i);
    expect(markup).not.toContain("Show more");
  });

  it("uses explicit refresh to reset pagination", () => {
    renderToStaticMarkup(<ConversationsHome />);
    (state.list!.onRefresh as () => void)();
    expect(state.refresh).toHaveBeenCalledWith(expect.anything(), { refresh: true });
  });

  it("can page a short or collapsed list after the initial end callback was ignored", () => {
    renderToStaticMarkup(<ConversationsHome />);
    (state.list!.onEndReached as () => void)();
    (state.list!.onScrollBeginDrag as () => void)();
    expect(state.list?.onScroll).toBeTypeOf("function");
    (state.list!.onScroll as (event: unknown) => void)({
      nativeEvent: {
        contentOffset: { y: 0 },
        contentSize: { height: 100 },
        layoutMeasurement: { height: 800 },
      },
    });
    expect(state.loadOlder).toHaveBeenCalledTimes(1);
  });

  it("offers a list refresh when the latest page query fails", () => {
    state.queryError = new Error("Relay unavailable");
    const markup = renderToStaticMarkup(<ConversationsHome />);
    expect(markup).toMatch(/retry|重试/i);
    (state.list!.onScrollBeginDrag as () => void)();
    (state.list!.onEndReached as () => void)();
    expect(state.loadOlder).not.toHaveBeenCalled();
  });
});
