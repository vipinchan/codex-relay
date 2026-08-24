import { useSelector } from "@legendapp/state/react";
import { useQuery } from "@tanstack/react-query";
import type { ThreadSummary } from "codex-relay/api-schema";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, SectionList, TextInput, View, type SectionListData } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";

import { Icon, type AppIconName } from "@/components/ui/icon";
import { ThemedText } from "@/components/themed-text";
import { Colors } from "@/constants/theme";
import { hasCodexRelaySession } from "@/lib/codex-relay-api";
import { hapticLightImpact, hapticSelection } from "@/lib/haptics";
import { serverStateKeys, serverStateQueryFns } from "@/lib/server-state";
import { workspaceName } from "@/lib/workspace-name";
import {
  chatStore$,
  requestThreadStreamReconnect,
  setActiveThread,
  setHasPairedSession,
} from "@/state/chat-store";
import { pinnedThreadStore$, togglePinnedThread } from "@/state/pinned-thread-store";

type Period = "pinned" | "today" | "yesterday" | "week" | "month" | "earlier";
type GroupingMode = "project" | "time";
type ThreadSection = { key: string; title: string; data: ThreadSummary[] };
type ThreadGlyph = "agentAtom" | "branch" | "file" | "folder" | "terminal";

const accent = "#6EA8FF";
const iconPalettes = [
  { background: "#18393A", foreground: "#72DDD5" },
  { background: "#282642", foreground: "#A49CFF" },
  { background: "#18324A", foreground: "#79B8FF" },
  { background: "#3D2630", foreground: "#FF8DA5" },
  { background: "#20382E", foreground: "#78D9A5" },
] as const;

export function ConversationsHome() {
  const hasPairedSession = useSelector(() => chatStore$.hasPairedSession.get());
  const pinnedThreadIds = useSelector(() => pinnedThreadStore$.threadIds.get());
  const cachedThreadIds = useSelector(() => chatStore$.threadIds.get());
  const cachedThreadsById = useSelector(() => chatStore$.threadsById.get());
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [groupingMode, setGroupingMode] = useState<GroupingMode>("time");

  useEffect(() => {
    setHasPairedSession(hasCodexRelaySession());
  }, []);

  const threadsQuery = useQuery({
    queryKey: serverStateKeys.threads(),
    queryFn: serverStateQueryFns.threads,
    enabled: hasPairedSession,
    staleTime: 5_000,
  });

  const locale = useMemo(() => Intl.DateTimeFormat().resolvedOptions().locale || "en", []);
  const zh = locale.toLowerCase().startsWith("zh");

  const threads = useMemo(() => {
    const serverThreads = threadsQuery.data?.threads;
    const source = serverThreads?.length
      ? serverThreads
      : cachedThreadIds.map((id) => cachedThreadsById[id]).filter(Boolean);
    return [...source].sort((a, b) => activityTime(b).getTime() - activityTime(a).getTime());
  }, [cachedThreadIds, cachedThreadsById, threadsQuery.data?.threads]);

  const filteredThreads = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    if (!query) return threads;
    return threads.filter((thread) =>
      [thread.title, thread.lastMessagePreview, thread.lastPrompt, thread.cwd]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase().includes(query)),
    );
  }, [searchQuery, threads]);

  const sections = useMemo(() => {
    if (groupingMode === "project") return buildProjectSections(filteredThreads, zh);
    return buildTimeSections(filteredThreads, pinnedThreadIds, zh);
  }, [filteredThreads, groupingMode, pinnedThreadIds, zh]);

  function openThread(thread: ThreadSummary) {
    hapticSelection();
    setActiveThread(thread.id);
    requestThreadStreamReconnect(thread.id);
    router.push("/chat");
  }

  function createNewChat() {
    hapticSelection();
    setActiveThread(undefined);
    router.push("/chat");
  }

  function openSettings() {
    hapticSelection();
    router.push("/settings-home");
  }

  function toggleSearch() {
    hapticSelection();
    setSearchOpen((open) => !open);
    if (searchOpen) setSearchQuery("");
  }

  function toggleGroupingMode() {
    hapticSelection();
    setGroupingMode((mode) => (mode === "time" ? "project" : "time"));
  }

  return (
    <SafeAreaView edges={["top", "left", "right", "bottom"]} style={styles.screen}>
      <View style={styles.topBar}>
        <View style={styles.topBarSide}>
          <RoundTopButton icon="settings" label="Settings" onPress={openSettings} />
        </View>
        <ThemedText style={styles.appTitle}>Codex</ThemedText>
        <View style={[styles.topBarSide, styles.topBarSideEnd]}>
          <GroupingButton mode={groupingMode} zh={zh} onPress={toggleGroupingMode} />
        </View>
      </View>

      {searchOpen ? (
        <View style={styles.searchWrap}>
          <Icon name="search" size={18} tintColor={Colors.dark.textSecondary} />
          <TextInput
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={zh ? "搜索会话" : "Search conversations"}
            placeholderTextColor={Colors.dark.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={styles.searchInput}
          />
          {searchQuery ? (
            <Pressable hitSlop={8} onPress={() => setSearchQuery("")}>
              <Icon name="x" size={17} tintColor={Colors.dark.textSecondary} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <SectionList
        key={groupingMode}
        sections={sections as readonly SectionListData<ThreadSummary, ThreadSection>[]}
        keyExtractor={(item, index) => `${item.id}:${item.createdAt}:${index}`}
        contentContainerStyle={styles.listContent}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        onRefresh={() => void threadsQuery.refetch()}
        refreshing={threadsQuery.isFetching && threads.length > 0}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <ThemedText style={styles.sectionTitle}>{section.title}</ThemedText>
          </View>
        )}
        renderItem={({ item }) => (
          <ThreadRow
            thread={item}
            pinned={pinnedThreadIds.includes(item.id)}
            zh={zh}
            onPress={() => openThread(item)}
            onLongPress={() => {
              hapticLightImpact();
              togglePinnedThread(item.id);
            }}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Icon name="newChat" size={22} tintColor={Colors.dark.textSecondary} />
            </View>
            <ThemedText style={styles.emptyTitle}>
              {searchQuery
                ? zh
                  ? "没有匹配的会话"
                  : "No matching conversations"
                : zh
                  ? "开始一个新会话"
                  : "Start a new conversation"}
            </ThemedText>
          </View>
        }
      />

      <View pointerEvents="box-none" style={styles.fabDock}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search conversations"
          onPress={toggleSearch}
          style={({ pressed }) => [styles.searchFab, pressed && styles.pressed]}
        >
          <Icon name={searchOpen ? "x" : "search"} size={27} tintColor="#FFFFFF" />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New chat"
          onPress={createNewChat}
          style={({ pressed }) => [styles.newFab, pressed && styles.pressed]}
        >
          <Icon name="newChat" size={26} tintColor="#FFFFFF" />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function ThreadRow({
  thread,
  pinned,
  zh,
  onPress,
  onLongPress,
}: {
  thread: ThreadSummary;
  pinned: boolean;
  zh: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const preview =
    thread.lastMessagePreview || thread.lastResult || thread.lastPrompt || thread.cwd || "";
  const visual = threadVisual(thread);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }) => [styles.threadRow, pressed && styles.rowPressed]}
    >
      <View style={[styles.threadIcon, { backgroundColor: visual.background }]}>
        <Icon name={visual.icon} size={22} tintColor={visual.foreground} strokeWidth={1.8} />
      </View>
      <View style={styles.threadCopy}>
        <ThemedText numberOfLines={1} style={styles.threadTitle}>
          {thread.title || "New Chat"}
        </ThemedText>
        <ThemedText numberOfLines={1} style={styles.threadPreview}>
          {preview || (zh ? "暂无消息" : "No messages yet")}
        </ThemedText>
      </View>
      <View style={styles.threadMeta}>
        <ThemedText numberOfLines={1} style={styles.threadDate}>
          {relativeDate(activityTime(thread), zh)}
        </ThemedText>
        {pinned ? <Icon name="pin" size={12} tintColor="#77777D" /> : null}
      </View>
    </Pressable>
  );
}

function RoundTopButton({
  icon,
  label,
  onPress,
}: {
  icon: AppIconName;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.topButton, pressed && styles.pressed]}
    >
      <Icon name={icon} size={27} tintColor={accent} strokeWidth={1.8} />
    </Pressable>
  );
}

function GroupingButton({
  mode,
  zh,
  onPress,
}: {
  mode: GroupingMode;
  zh: boolean;
  onPress: () => void;
}) {
  const isProject = mode === "project";
  const currentLabel = isProject ? (zh ? "项目" : "Project") : zh ? "时间" : "Time";
  const nextLabel = isProject ? (zh ? "时间" : "time") : zh ? "项目" : "project";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        zh ? `当前按${currentLabel}分组，切换为按${nextLabel}分组` : `Grouped by ${currentLabel}`
      }
      accessibilityHint={zh ? undefined : `Switch to grouping by ${nextLabel}`}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.groupingButton, pressed && styles.pressed]}
    >
      <Icon
        name={isProject ? "folder" : "clock"}
        size={16}
        tintColor={accent}
        strokeWidth={2}
      />
      <ThemedText style={styles.groupingButtonLabel}>{currentLabel}</ThemedText>
    </Pressable>
  );
}

function threadVisual(thread: ThreadSummary): {
  icon: ThreadGlyph;
  background: string;
  foreground: string;
} {
  const hint = `${thread.title || ""} ${thread.cwd || ""}`.toLocaleLowerCase();
  let icon: ThreadGlyph = "terminal";

  if (thread.cwd?.startsWith("/") || hint.includes("project") || hint.includes("目录")) {
    icon = "folder";
  } else if (hint.includes("git") || hint.includes("repo") || hint.includes("pull request")) {
    icon = "branch";
  } else if (hint.includes("file") || hint.includes("文档") || hint.includes("readme")) {
    icon = "file";
  } else if (hint.includes("分析") || hint.includes("复盘") || hint.includes("review")) {
    icon = "agentAtom";
  }

  let hash = 0;
  for (let index = 0; index < thread.id.length; index += 1) {
    hash = (hash * 31 + thread.id.charCodeAt(index)) >>> 0;
  }
  const palette = iconPalettes[hash % iconPalettes.length];
  return { icon, ...palette };
}

function buildTimeSections(
  threads: ThreadSummary[],
  pinnedIds: string[],
  zh: boolean,
): ThreadSection[] {
  const pinned = threads.filter((thread) => pinnedIds.includes(thread.id));
  const normal = threads.filter((thread) => !pinnedIds.includes(thread.id));
  const buckets: Record<Exclude<Period, "pinned">, ThreadSummary[]> = {
    today: [],
    yesterday: [],
    week: [],
    month: [],
    earlier: [],
  };
  for (const thread of normal) buckets[datePeriod(activityTime(thread))].push(thread);
  const labels: Record<Period, string> = zh
    ? {
        pinned: "置顶",
        today: "今天",
        yesterday: "昨天",
        week: "本周",
        month: "本月",
        earlier: "更早",
      }
    : {
        pinned: "Pinned",
        today: "Today",
        yesterday: "Yesterday",
        week: "This Week",
        month: "This Month",
        earlier: "Earlier",
      };
  const ordered: [Period, ThreadSummary[]][] = [
    ["pinned", pinned],
    ["today", buckets.today],
    ["yesterday", buckets.yesterday],
    ["week", buckets.week],
    ["month", buckets.month],
    ["earlier", buckets.earlier],
  ];
  return ordered
    .filter(([, data]) => data.length > 0)
    .map(([key, data]) => ({ key, title: labels[key], data }));
}

function buildProjectSections(threads: ThreadSummary[], zh: boolean): ThreadSection[] {
  const groups = new Map<string, ThreadSection>();

  for (const thread of threads) {
    const title = workspaceName(thread.cwd) ?? (zh ? "无项目" : "No Project");
    const key = thread.cwd ?? title;
    const group = groups.get(key);
    if (group) {
      group.data.push(thread);
    } else {
      groups.set(key, { key: `project:${key}`, title, data: [thread] });
    }
  }

  return [...groups.values()];
}

function activityTime(thread: ThreadSummary) {
  return new Date(thread.lastActivityAt || thread.updatedAt || thread.createdAt);
}

function datePeriod(date: Date): Exclude<Period, "pinned"> {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.floor((startToday - startDate) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return "week";
  const monthAgo = new Date(now);
  monthAgo.setMonth(monthAgo.getMonth() - 1);
  if (date.getTime() > monthAgo.getTime()) return "month";
  return "earlier";
}

function relativeDate(date: Date, zh: boolean) {
  const now = Date.now();
  const diff = Math.max(0, now - date.getTime());
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (minutes < 1) return zh ? "刚刚" : "now";
  if (minutes < 60) return zh ? `${minutes}分钟前` : `${minutes}m`;
  if (hours < 24) return zh ? `${hours}小时前` : `${hours}h`;
  if (days === 1) return zh ? "昨天" : "Yesterday";
  if (days < 7) return zh ? `${days}天前` : `${days}d`;
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000000" },
  topBar: {
    height: 64,
    alignItems: "center",
    justifyContent: "space-between",
    flexDirection: "row",
    paddingHorizontal: 22,
  },
  topBarSide: { width: 90, alignItems: "flex-start" },
  topBarSideEnd: { alignItems: "flex-end" },
  appTitle: { fontSize: 22, lineHeight: 27, fontWeight: "700", color: "#FFFFFF" },
  topButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  groupingButton: {
    height: 34,
    minWidth: 72,
    paddingHorizontal: 10,
    borderRadius: 17,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#1C1C1E",
    borderWidth: 1,
    borderColor: "#263A5B",
  },
  groupingButtonLabel: {
    color: accent,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "600",
  },
  searchWrap: {
    marginHorizontal: 18,
    marginBottom: 8,
    minHeight: 42,
    borderRadius: 14,
    paddingHorizontal: 13,
    gap: 9,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1C1C1E",
  },
  searchInput: { flex: 1, color: "#FFFFFF", fontSize: 16, paddingVertical: 9 },
  listContent: { paddingBottom: 92 },
  sectionHeader: {
    height: 34,
    justifyContent: "center",
    paddingHorizontal: 22,
    backgroundColor: "#1C1C1E",
  },
  sectionTitle: {
    fontSize: 15.5,
    lineHeight: 19,
    fontWeight: "600",
    color: "#8E8E93",
  },
  threadRow: {
    height: 66,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 22,
    gap: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: "#1C1C1E",
  },
  rowPressed: { backgroundColor: "#111113" },
  threadIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  threadCopy: { flex: 1, minWidth: 0 },
  threadTitle: { color: "#FFFFFF", fontSize: 17.5, lineHeight: 22, fontWeight: "700" },
  threadPreview: { color: "#8E8E93", fontSize: 14.5, lineHeight: 18, marginTop: 1 },
  threadMeta: {
    width: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
  },
  threadDate: { color: "#77777D", fontSize: 13.5, lineHeight: 17 },
  emptyState: { alignItems: "center", justifyContent: "center", paddingTop: 110, gap: 12 },
  emptyIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#1C1C1E",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { color: "#8E8E93", fontSize: 16 },
  fabDock: {
    position: "absolute",
    left: 22,
    right: 22,
    bottom: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  searchFab: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1C1C1E",
    shadowColor: "#000",
    shadowOpacity: 0.38,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  newFab: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4054C8",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  pressed: { opacity: 0.64, transform: [{ scale: 0.96 }] },
});
