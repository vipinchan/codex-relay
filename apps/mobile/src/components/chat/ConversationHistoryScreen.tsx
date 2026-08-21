import { useSelector } from "@legendapp/state/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ThreadSummary } from "codex-relay/api-schema";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  SectionList,
  TextInput,
  View,
  type SectionListData,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { Colors, Fonts } from "@/constants/theme";
import { hasCodexRelaySession, refreshSession } from "@/lib/codex-relay-api";
import { hapticLightImpact, hapticSelection, hapticSuccess } from "@/lib/haptics";
import {
  archiveThreadServerState,
  createThreadServerState,
  fetchStatusState,
  fetchThreadState,
  fetchThreadsState,
  serverStateKeys,
  serverStateQueryFns,
  setStatusState,
  setThreadDetailState,
  setThreadRunningState,
  setThreadsState,
} from "@/lib/server-state";
import { workspaceName } from "@/lib/workspace-name";
import {
  chatStore$,
  requestThreadStreamReconnect,
  setActiveThread,
  setConnection,
  setHasPairedSession,
  setThreadMessagesLoading,
} from "@/state/chat-store";
import { pinnedThreadStore$, togglePinnedThread, unpinThread } from "@/state/pinned-thread-store";

type HistoryMode = "home" | "drawer";

type Props = {
  mode?: HistoryMode;
  onClose?: () => void;
};

type PeriodKey = "pinned" | "today" | "yesterday" | "week" | "month" | "earlier";

type HistorySection = {
  key: PeriodKey;
  title: string;
  data: ThreadSummary[];
};

const palette = Colors.dark;
const avatarColors = ["#123B3A", "#1D2945", "#342A1F", "#302447", "#27323B", "#32242A"];

export function ConversationHistoryScreen({ mode = "home", onClose }: Props) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const hasPairedSession = useSelector(() => chatStore$.hasPairedSession.get());
  const activeThreadId = useSelector(() => chatStore$.activeThreadId.get());
  const pinnedThreadIds = useSelector(() => pinnedThreadStore$.threadIds.get());
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [openingThreadId, setOpeningThreadId] = useState<string | undefined>();

  const statusQuery = useQuery({
    queryKey: serverStateKeys.status(),
    queryFn: serverStateQueryFns.status,
    enabled: hasPairedSession,
    retry: false,
  });
  const threadsQuery = useQuery({
    queryKey: serverStateKeys.threads(),
    queryFn: serverStateQueryFns.threads,
    enabled: hasPairedSession,
    retry: false,
  });

  const createThreadMutation = useMutation({
    mutationFn: (workspacePath?: string) =>
      createThreadServerState(queryClient, { title: "New chat", workspacePath }),
  });
  const archiveThreadMutation = useMutation({
    mutationFn: (threadId: string) => archiveThreadServerState(queryClient, threadId),
  });

  const threads = useMemo(() => threadsQuery.data?.threads ?? [], [threadsQuery.data?.threads]);
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase();
  const filteredThreads = useMemo(() => {
    if (!normalizedSearch) {
      return threads;
    }
    return threads.filter((thread) =>
      [thread.title, thread.lastMessagePreview, thread.lastPrompt, thread.lastResult, thread.cwd]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase().includes(normalizedSearch)),
    );
  }, [normalizedSearch, threads]);
  const sections = useMemo(
    () => buildSections(filteredThreads, new Set(pinnedThreadIds)),
    [filteredThreads, pinnedThreadIds],
  );

  const refreshHistory = useCallback(async () => {
    if (!hasCodexRelaySession()) {
      setHasPairedSession(false);
      return;
    }
    setRefreshing(true);
    setConnection("checking");
    try {
      await refreshSession().catch(() => false);
      const [status, response] = await Promise.all([
        fetchStatusState(queryClient),
        fetchThreadsState(queryClient),
      ]);
      setStatusState(queryClient, status);
      setThreadsState(queryClient, response.threads, response.source);
      setConnection("connected");
    } catch (caught) {
      setConnection(
        "offline",
        caught instanceof Error ? caught.message : "Unable to refresh conversations.",
      );
    } finally {
      setRefreshing(false);
    }
  }, [queryClient]);

  useEffect(() => {
    if (!hasPairedSession) {
      return;
    }
    if (!threadsQuery.data || !statusQuery.data) {
      void refreshHistory();
    }
  }, [hasPairedSession, refreshHistory, statusQuery.data, threadsQuery.data]);

  const openThread = useCallback(
    async (thread: ThreadSummary) => {
      if (openingThreadId) {
        return;
      }
      hapticSelection();
      setOpeningThreadId(thread.id);
      setActiveThread(thread.id);
      setThreadMessagesLoading(thread.id, true);
      onClose?.();
      try {
        const response = await fetchThreadState(queryClient, thread.id);
        setThreadDetailState(
          queryClient,
          response.thread,
          response.messages,
          response.pendingInputRequests,
        );
        setActiveThread(response.thread.id);
        if (response.thread.state === "running") {
          requestThreadStreamReconnect(response.thread.id);
        }
        setConnection("connected");
      } catch (caught) {
        setThreadRunningState(queryClient, thread.id, false);
        setActiveThread(undefined);
        setConnection(
          "offline",
          caught instanceof Error ? caught.message : "Unable to load this conversation.",
        );
      } finally {
        setThreadMessagesLoading(thread.id, false);
        setOpeningThreadId(undefined);
      }
    },
    [onClose, openingThreadId, queryClient],
  );

  const createNewChat = useCallback(async () => {
    if (createThreadMutation.isPending) {
      return;
    }
    hapticSelection();
    try {
      const response = await createThreadMutation.mutateAsync(statusQuery.data?.workspacePath);
      setThreadDetailState(queryClient, response.thread, response.messages);
      setActiveThread(response.thread.id);
      setConnection("connected");
      onClose?.();
      hapticSuccess();
      await queryClient.invalidateQueries({ queryKey: serverStateKeys.threads() });
    } catch (caught) {
      Alert.alert(
        "Couldn’t create chat",
        caught instanceof Error ? caught.message : "Unable to create a new Codex chat.",
      );
    }
  }, [createThreadMutation, onClose, queryClient, statusQuery.data?.workspacePath]);

  const openThreadActions = useCallback(
    (thread: ThreadSummary) => {
      const pinned = pinnedThreadIds.includes(thread.id);
      hapticSelection();
      Alert.alert(thread.title, threadSubtitle(thread), [
        {
          text: pinned ? "Unpin" : "Pin",
          onPress: () => {
            togglePinnedThread(thread.id);
            hapticSelection();
          },
        },
        {
          text: "Archive",
          style: "destructive",
          onPress: () => {
            void archiveThreadMutation
              .mutateAsync(thread.id)
              .then(async () => {
                unpinThread(thread.id);
                if (activeThreadId === thread.id) {
                  setActiveThread(undefined);
                }
                await queryClient.invalidateQueries({ queryKey: serverStateKeys.threads() });
                hapticSuccess();
              })
              .catch((caught) =>
                Alert.alert(
                  "Couldn’t archive chat",
                  caught instanceof Error ? caught.message : "Unable to archive this chat.",
                ),
              );
          },
        },
        { text: "Cancel", style: "cancel" },
      ]);
    },
    [activeThreadId, archiveThreadMutation, pinnedThreadIds, queryClient],
  );

  const openSettings = useCallback(() => {
    hapticSelection();
    onClose?.();
    requestAnimationFrame(() => router.push("/settings"));
  }, [onClose]);

  const openLatestThread = useCallback(() => {
    const latest = [...threads].sort(compareActivity)[0];
    if (latest) {
      void openThread(latest);
    }
  }, [openThread, threads]);

  return (
    <SafeAreaView
      edges={mode === "home" ? ["top", "left", "right"] : ["top", "right"]}
      style={styles.screen}
    >
      <View style={styles.root}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Settings"
            hitSlop={10}
            onPress={openSettings}
            style={({ pressed }) => [styles.headerIconButton, pressed && styles.pressed]}
          >
            <Icon name="settings" size={29} strokeWidth={1.8} tintColor="#6197FF" />
          </Pressable>
          <Text style={styles.headerTitle}>Codex</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open latest conversation"
            disabled={threads.length === 0}
            hitSlop={10}
            onPress={openLatestThread}
            style={({ pressed }) => [styles.headerIconButton, pressed && styles.pressed]}
          >
            <Icon
              name="terminal"
              size={29}
              strokeWidth={1.9}
              tintColor={threads.length === 0 ? palette.textSecondary : "#6197FF"}
            />
          </Pressable>
        </View>

        {searchOpen ? (
          <View style={styles.searchRow}>
            <View style={styles.searchField}>
              <Icon name="search" size={19} tintColor={palette.textSecondary} />
              <TextInput
                autoFocus
                clearButtonMode="while-editing"
                onChangeText={setSearchQuery}
                placeholder={isChineseLocale() ? "搜索会话" : "Search conversations"}
                placeholderTextColor={palette.textSecondary}
                selectionColor="#6197FF"
                style={styles.searchInput}
                value={searchQuery}
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close search"
              onPress={() => {
                hapticSelection();
                setSearchOpen(false);
                setSearchQuery("");
              }}
              style={({ pressed }) => [styles.searchClose, pressed && styles.pressed]}
            >
              <Text style={styles.searchCloseText}>{isChineseLocale() ? "取消" : "Cancel"}</Text>
            </Pressable>
          </View>
        ) : null}

        <SectionList
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: Math.max(insets.bottom + 118, 138) },
          ]}
          keyboardShouldPersistTaps="handled"
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Icon name="newChat" size={27} tintColor={palette.textSecondaryStrong} />
              </View>
              <Text style={styles.emptyTitle}>
                {normalizedSearch
                  ? isChineseLocale()
                    ? "没有匹配的会话"
                    : "No matching conversations"
                  : isChineseLocale()
                    ? "还没有会话"
                    : "No conversations yet"}
              </Text>
              {!normalizedSearch ? (
                <Text style={styles.emptySubtitle}>
                  {isChineseLocale()
                    ? "点击右下角开始新会话"
                    : "Tap the button below to start a new chat"}
                </Text>
              ) : null}
            </View>
          }
          refreshControl={
            <RefreshControl
              onRefresh={() => {
                hapticLightImpact();
                void refreshHistory();
              }}
              refreshing={refreshing}
              tintColor={palette.textSecondaryStrong}
            />
          }
          renderItem={({ item }) => (
            <ConversationRow
              isOpening={openingThreadId === item.id}
              onLongPress={() => openThreadActions(item)}
              onPress={() => void openThread(item)}
              pinned={pinnedThreadIds.includes(item.id)}
              thread={item}
            />
          )}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
            </View>
          )}
          sections={sections as SectionListData<ThreadSummary, HistorySection>[]}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          style={styles.list}
        />

        <View
          pointerEvents="box-none"
          style={[styles.fabLayer, { bottom: Math.max(insets.bottom + 16, 22) }]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Search conversations"
            onPress={() => {
              hapticSelection();
              setSearchOpen(true);
            }}
            style={({ pressed }) => [styles.searchFab, pressed && styles.fabPressed]}
          >
            <Icon name="search" size={31} strokeWidth={2.2} tintColor={palette.text} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="New chat"
            disabled={createThreadMutation.isPending}
            onPress={() => void createNewChat()}
            style={({ pressed }) => [
              styles.newChatFab,
              (pressed || createThreadMutation.isPending) && styles.fabPressed,
            ]}
          >
            <Icon name="newChat" size={30} strokeWidth={2.2} tintColor="#FFFFFF" />
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

function ConversationRow({
  isOpening,
  onLongPress,
  onPress,
  pinned,
  thread,
}: {
  isOpening: boolean;
  onLongPress: () => void;
  onPress: () => void;
  pinned: boolean;
  thread: ThreadSummary;
}) {
  const avatarColor =
    avatarColors[hashString(thread.cwd ?? thread.id) % avatarColors.length] ?? avatarColors[0];
  const preview = previewText(thread);
  const running = thread.state === "running";

  return (
    <Pressable
      accessibilityHint="Long press for conversation actions"
      accessibilityRole="button"
      accessibilityLabel={`Open conversation ${thread.title}`}
      delayLongPress={360}
      onLongPress={onLongPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
        <Icon
          name={running ? "running" : "terminal"}
          size={27}
          strokeWidth={1.8}
          tintColor={running ? "#72D5C9" : "#58D9E8"}
        />
      </View>
      <View style={styles.rowBody}>
        <Text numberOfLines={1} style={styles.rowTitle}>
          {thread.title}
        </Text>
        <Text numberOfLines={1} style={styles.rowPreview}>
          {preview}
        </Text>
      </View>
      <View style={styles.rowMeta}>
        <Text numberOfLines={1} style={styles.rowDate}>
          {relativeDate(thread.lastActivityAt ?? thread.updatedAt)}
        </Text>
        {pinned ? <Icon name="pin" size={14} tintColor={palette.textSecondary} /> : null}
        {isOpening ? (
          <Icon name="running" size={14} tintColor={palette.textSecondaryStrong} />
        ) : null}
      </View>
    </Pressable>
  );
}

function buildSections(threads: ThreadSummary[], pinnedIds: Set<string>): HistorySection[] {
  const buckets = new Map<PeriodKey, ThreadSummary[]>();
  for (const key of ["pinned", "today", "yesterday", "week", "month", "earlier"] as PeriodKey[]) {
    buckets.set(key, []);
  }

  const ordered = [...threads].sort(compareActivity);
  for (const thread of ordered) {
    const key = pinnedIds.has(thread.id)
      ? "pinned"
      : datePeriod(thread.lastActivityAt ?? thread.updatedAt);
    buckets.get(key)!.push(thread);
  }

  return (["pinned", "today", "yesterday", "week", "month", "earlier"] as PeriodKey[])
    .map((key) => ({ key, title: sectionLabel(key), data: buckets.get(key)! }))
    .filter((section) => section.data.length > 0);
}

function compareActivity(left: ThreadSummary, right: ThreadSummary) {
  return activityTime(right) - activityTime(left);
}

function activityTime(thread: ThreadSummary) {
  return new Date(thread.lastActivityAt ?? thread.updatedAt).getTime();
}

function datePeriod(value: string): PeriodKey {
  const date = new Date(value);
  const now = new Date();
  if (sameCalendarDay(date, now)) {
    return "today";
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameCalendarDay(date, yesterday)) {
    return "yesterday";
  }
  const diffDays = (now.getTime() - date.getTime()) / 86_400_000;
  if (diffDays < 7) {
    return "week";
  }
  const monthAgo = new Date(now);
  monthAgo.setMonth(now.getMonth() - 1);
  if (date > monthAgo) {
    return "month";
  }
  return "earlier";
}

function sameCalendarDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function sectionLabel(key: PeriodKey) {
  const zh = isChineseLocale();
  const labels: Record<PeriodKey, [string, string]> = {
    pinned: ["置顶", "Pinned"],
    today: ["今天", "Today"],
    yesterday: ["昨天", "Yesterday"],
    week: ["本周", "This Week"],
    month: ["本月", "This Month"],
    earlier: ["更早", "Earlier"],
  };
  return labels[key][zh ? 0 : 1];
}

function relativeDate(value: string) {
  const date = new Date(value);
  const now = new Date();
  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const minutes = Math.floor(diffMs / 60_000);
  const hours = Math.floor(diffMs / 3_600_000);
  const zh = isChineseLocale();

  if (sameCalendarDay(date, now)) {
    if (minutes < 1) return zh ? "刚刚" : "now";
    if (minutes < 60) return `${minutes}m`;
    return `${hours}h`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameCalendarDay(date, yesterday)) {
    return zh ? "昨天" : "Yesterday";
  }
  if (diffMs < 7 * 86_400_000) {
    return new Intl.DateTimeFormat(undefined, { weekday: zh ? "long" : "short" }).format(date);
  }
  return new Intl.DateTimeFormat(undefined, { month: "numeric", day: "numeric" }).format(date);
}

function previewText(thread: ThreadSummary) {
  const value = thread.lastMessagePreview ?? thread.lastResult ?? thread.lastPrompt;
  if (value?.trim()) {
    return value.replace(/\s+/g, " ").trim();
  }
  if (thread.cwd) {
    return workspaceName(thread.cwd);
  }
  return isChineseLocale() ? "暂无消息" : "No messages yet";
}

function threadSubtitle(thread: ThreadSummary) {
  const project = thread.cwd ? workspaceName(thread.cwd) : "Codex";
  return `${project} · ${relativeDate(thread.lastActivityAt ?? thread.updatedAt)}`;
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function isChineseLocale() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase().startsWith("zh");
  } catch {
    return false;
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.background,
  },
  root: {
    flex: 1,
    backgroundColor: palette.background,
  },
  header: {
    height: 82,
    paddingHorizontal: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    color: palette.text,
    fontFamily: Fonts.sansBold,
    fontSize: 29,
    lineHeight: 35,
    fontWeight: "700",
    letterSpacing: -0.7,
  },
  headerIconButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.55,
  },
  searchRow: {
    paddingHorizontal: 22,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchField: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: palette.backgroundElement,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 0,
    color: palette.text,
    fontFamily: Fonts.sans,
    fontSize: 17,
  },
  searchClose: {
    minHeight: 42,
    justifyContent: "center",
  },
  searchCloseText: {
    color: "#6197FF",
    fontFamily: Fonts.sansMedium,
    fontSize: 16,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  sectionHeader: {
    backgroundColor: palette.background,
    paddingTop: 22,
    paddingBottom: 10,
    paddingHorizontal: 0,
  },
  sectionTitle: {
    color: palette.textSecondary,
    fontFamily: Fonts.sansSemiBold,
    fontSize: 19,
    lineHeight: 24,
    fontWeight: "600",
  },
  row: {
    minHeight: 92,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 0,
  },
  rowPressed: {
    opacity: 0.58,
  },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    gap: 3,
  },
  rowTitle: {
    color: palette.text,
    fontFamily: Fonts.sansSemiBold,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "600",
    letterSpacing: -0.25,
  },
  rowPreview: {
    color: palette.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 17,
    lineHeight: 22,
  },
  rowMeta: {
    width: 76,
    minHeight: 48,
    marginLeft: 10,
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 8,
  },
  rowDate: {
    color: palette.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 15,
    lineHeight: 19,
    textAlign: "right",
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 104,
    paddingHorizontal: 40,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: palette.backgroundElement,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  emptyTitle: {
    color: palette.text,
    fontFamily: Fonts.sansSemiBold,
    fontSize: 20,
    textAlign: "center",
  },
  emptySubtitle: {
    marginTop: 8,
    color: palette.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 15,
    lineHeight: 20,
    textAlign: "center",
  },
  fabLayer: {
    position: "absolute",
    left: 22,
    right: 22,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  searchFab: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "#1C1C1E",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 10,
  },
  newChatFab: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "#625D54",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 10,
  },
  fabPressed: {
    opacity: 0.68,
    transform: [{ scale: 0.96 }],
  },
});
