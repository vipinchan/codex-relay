import { useSelector } from "@legendapp/state/react";
import { useQuery } from "@tanstack/react-query";
import type { ThreadSummary } from "codex-relay/api-schema";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, SectionList, TextInput, View, type SectionListData } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";

import { Icon } from "@/components/ui/icon";
import { ThemedText } from "@/components/themed-text";
import { Colors } from "@/constants/theme";
import { hapticLightImpact, hapticSelection } from "@/lib/haptics";
import { serverStateKeys, serverStateQueryFns } from "@/lib/server-state";
import { chatStore$, requestThreadStreamReconnect, setActiveThread } from "@/state/chat-store";
import { pinnedThreadStore$, togglePinnedThread } from "@/state/pinned-thread-store";

type Period = "pinned" | "today" | "yesterday" | "week" | "month" | "earlier";
type ThreadSection = { key: Period; title: string; data: ThreadSummary[] };

const accent = "#6EA8FF";
const sessionIconBg = "#123A38";

export function ConversationsHome() {
  const hasPairedSession = useSelector(() => chatStore$.hasPairedSession.get());
  const pinnedThreadIds = useSelector(() => pinnedThreadStore$.threadIds.get());
  const cachedThreadIds = useSelector(() => chatStore$.threadIds.get());
  const cachedThreadsById = useSelector(() => chatStore$.threadsById.get());
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

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

  const sections = useMemo(
    () => buildSections(filteredThreads, pinnedThreadIds, zh),
    [filteredThreads, pinnedThreadIds, zh],
  );

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

  return (
    <SafeAreaView edges={["top", "left", "right", "bottom"]} style={styles.screen}>
      <View style={styles.topBar}>
        <RoundTopButton icon="settings" label="Settings" onPress={openSettings} />
        <ThemedText style={styles.appTitle}>Codex</ThemedText>
        <RoundTopButton icon="terminal" label="New Codex session" onPress={createNewChat} />
      </View>

      {searchOpen ? (
        <View style={styles.searchWrap}>
          <Icon name="search" size={20} tintColor={Colors.dark.textSecondary} />
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
              <Icon name="x" size={18} tintColor={Colors.dark.textSecondary} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <SectionList
        sections={sections as readonly SectionListData<ThreadSummary, ThreadSection>[]}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        onRefresh={() => void threadsQuery.refetch()}
        refreshing={threadsQuery.isFetching && threads.length > 0}
        renderSectionHeader={({ section }) => (
          <ThemedText style={styles.sectionTitle}>{section.title}</ThemedText>
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
              <Icon name="newChat" size={24} tintColor={Colors.dark.textSecondary} />
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
          <Icon name={searchOpen ? "x" : "search"} size={30} tintColor="#FFFFFF" />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New chat"
          onPress={createNewChat}
          style={({ pressed }) => [styles.newFab, pressed && styles.pressed]}
        >
          <Icon name="newChat" size={28} tintColor="#FFFFFF" />
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
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }) => [styles.threadRow, pressed && styles.rowPressed]}
    >
      <View style={styles.threadIcon}>
        <Icon name="terminal" size={24} tintColor="#54D6DF" strokeWidth={1.8} />
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
        {pinned ? <Icon name="pin" size={14} tintColor={Colors.dark.textSecondary} /> : null}
      </View>
    </Pressable>
  );
}

function RoundTopButton({
  icon,
  label,
  onPress,
}: {
  icon: "settings" | "terminal";
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
      <Icon name={icon} size={25} tintColor={accent} strokeWidth={1.8} />
    </Pressable>
  );
}

function buildSections(
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
    height: 76,
    alignItems: "center",
    justifyContent: "space-between",
    flexDirection: "row",
    paddingHorizontal: 28,
  },
  appTitle: { fontSize: 23, lineHeight: 29, fontWeight: "700", color: "#FFFFFF" },
  topButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  searchWrap: {
    marginHorizontal: 22,
    marginBottom: 10,
    minHeight: 48,
    borderRadius: 16,
    paddingHorizontal: 15,
    gap: 10,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1B1B1D",
  },
  searchInput: { flex: 1, color: "#FFFFFF", fontSize: 17, paddingVertical: 12 },
  listContent: { paddingHorizontal: 22, paddingTop: 10, paddingBottom: 132 },
  sectionTitle: {
    marginTop: 22,
    marginBottom: 9,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "700",
    color: "#8E8E93",
  },
  threadRow: {
    minHeight: 78,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    gap: 13,
    borderRadius: 16,
  },
  rowPressed: { backgroundColor: "rgba(255,255,255,0.055)" },
  threadIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: sessionIconBg,
  },
  threadCopy: { flex: 1, minWidth: 0 },
  threadTitle: { color: "#FFFFFF", fontSize: 20, lineHeight: 25, fontWeight: "700" },
  threadPreview: { color: "#8E8E93", fontSize: 16, lineHeight: 21, marginTop: 3 },
  threadMeta: { width: 64, alignItems: "flex-end", gap: 8 },
  threadDate: { color: "#68686D", fontSize: 14, lineHeight: 18 },
  emptyState: { alignItems: "center", justifyContent: "center", paddingTop: 120, gap: 14 },
  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#1C1C1E",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { color: "#8E8E93", fontSize: 17 },
  fabDock: {
    position: "absolute",
    left: 28,
    right: 28,
    bottom: 28,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  searchFab: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1C1C1E",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  newFab: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#77736C",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  pressed: { opacity: 0.62, transform: [{ scale: 0.96 }] },
});
