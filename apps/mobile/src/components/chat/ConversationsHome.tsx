import { useSelector } from "@legendapp/state/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BotConversation, ThreadSummary } from "codex-relay/api-schema";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, SectionList, TextInput, View, type SectionListData } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";

import { Icon, type AppIconName } from "@/components/ui/icon";
import {
  AppBottomSheet,
  AppBottomSheetTextInput,
  SheetActionRow,
} from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { ThemedText } from "@/components/themed-text";
import { Colors } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
  getCodexRelayServerUrl,
  hasCodexRelaySession,
  listBotConversations,
} from "@/lib/codex-relay-api";
import { hapticLightImpact, hapticSelection, hapticSuccess } from "@/lib/haptics";
import {
  regenerateThreadTitleServerState,
  renameThreadServerState,
  serverStateKeys,
  serverStateQueryFns,
} from "@/lib/server-state";
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
  const queryClient = useQueryClient();
  const theme = useTheme();
  const hasPairedSession = useSelector(() => chatStore$.hasPairedSession.get());
  const pinnedThreadIds = useSelector(() => pinnedThreadStore$.threadIds.get());
  const cachedThreadIds = useSelector(() => chatStore$.threadIds.get());
  const cachedThreadsById = useSelector(() => chatStore$.threadsById.get());
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [groupingMode, setGroupingMode] = useState<GroupingMode>("time");
  const [collapsedSectionKeys, setCollapsedSectionKeys] = useState<Set<string>>(() => new Set());
  const [threadWithActions, setThreadWithActions] = useState<ThreadSummary>();
  const [isRenamingThread, setIsRenamingThread] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");

  const renameThreadMutation = useMutation({
    mutationFn: ({ threadId, title }: { threadId: string; title: string }) =>
      renameThreadServerState(queryClient, threadId, { title }),
  });
  const regenerateTitleMutation = useMutation({
    mutationFn: (threadId: string) => regenerateThreadTitleServerState(queryClient, threadId),
  });

  useEffect(() => {
    setHasPairedSession(hasCodexRelaySession());
  }, []);

  const threadsQuery = useQuery({
    queryKey: serverStateKeys.threads(),
    queryFn: serverStateQueryFns.threads,
    enabled: hasPairedSession,
    staleTime: 5_000,
  });
  const botConversationsQuery = useQuery({
    queryKey: ["bot-conversations", getCodexRelayServerUrl()],
    queryFn: listBotConversations,
    enabled: hasPairedSession,
    staleTime: 5_000,
  });
  const botConversations = (botConversationsQuery.data ?? []).filter((conversation) =>
    conversation.name.toLocaleLowerCase().includes(searchQuery.trim().toLocaleLowerCase()),
  );
  const canMutateAppServerThreads = threadsQuery.data?.source === "app-server";
  const isPinnedThreadWithActions = Boolean(
    threadWithActions && pinnedThreadIds.includes(threadWithActions.id),
  );

  function closeThreadActions() {
    setThreadWithActions(undefined);
    setIsRenamingThread(false);
    setRenameDraft("");
  }

  function openThreadActions(thread: ThreadSummary) {
    hapticLightImpact();
    setThreadWithActions(thread);
    setRenameDraft(thread.title);
    setIsRenamingThread(false);
  }

  async function saveThreadTitle() {
    const title = renameDraft.trim();
    if (!threadWithActions || !canMutateAppServerThreads || !title) return;
    try {
      await renameThreadMutation.mutateAsync({ threadId: threadWithActions.id, title });
      hapticSuccess();
      closeThreadActions();
    } catch (caught) {
      Alert.alert(
        zh ? "无法修改标题" : "Couldn’t rename chat",
        caught instanceof Error ? caught.message : "Unable to rename this chat.",
      );
    }
  }

  async function regenerateThreadTitle() {
    if (!threadWithActions || !canMutateAppServerThreads) return;
    try {
      await regenerateTitleMutation.mutateAsync(threadWithActions.id);
      hapticSuccess();
      closeThreadActions();
    } catch {
      void queryClient.invalidateQueries({ queryKey: serverStateKeys.threads() });
      Alert.alert(
        zh ? "无法重新生成标题" : "Couldn’t regenerate title",
        zh
          ? "标题生成失败，请检查连接后重试。"
          : "Title generation failed. Check your connection and try again.",
      );
    }
  }

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
  const sectionCounts = useMemo(
    () => new Map(sections.map((section) => [section.key, section.data.length])),
    [sections],
  );
  const displayedSections = useMemo(() => {
    if (searchQuery.trim()) return sections;
    return sections.map((section) =>
      collapsedSectionKeys.has(section.key) ? { ...section, data: [] } : section,
    );
  }, [collapsedSectionKeys, searchQuery, sections]);

  function toggleSection(sectionKey: string) {
    hapticSelection();
    setCollapsedSectionKeys((current) => {
      const next = new Set(current);
      if (next.has(sectionKey)) next.delete(sectionKey);
      else next.add(sectionKey);
      return next;
    });
  }

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
    router.navigate("/settings-tab");
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
    <SafeAreaView edges={["top", "left", "right"]} style={styles.screen}>
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
        sections={displayedSections as readonly SectionListData<ThreadSummary, ThreadSection>[]}
        keyExtractor={(item, index) => `${item.id}:${item.createdAt}:${index}`}
        contentContainerStyle={styles.listContent}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        onRefresh={() => {
          void threadsQuery.refetch();
          void botConversationsQuery.refetch();
        }}
        refreshing={threadsQuery.isFetching && threads.length > 0}
        renderSectionHeader={({ section }) => {
          const collapsed = collapsedSectionKeys.has(section.key) && !searchQuery.trim();
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${section.title}, ${sectionCounts.get(section.key) ?? 0} conversations`}
              accessibilityState={{ expanded: !collapsed }}
              onPress={() => toggleSection(section.key)}
              style={({ pressed }) => [
                styles.sectionHeader,
                pressed && styles.sectionHeaderPressed,
              ]}
            >
              <Icon
                name={collapsed ? "chevronRight" : "expand"}
                size={15}
                tintColor="#77777D"
                strokeWidth={2.2}
              />
              <ThemedText style={styles.sectionTitle}>{section.title}</ThemedText>
              <ThemedText style={styles.sectionCount}>
                {sectionCounts.get(section.key) ?? 0}
              </ThemedText>
            </Pressable>
          );
        }}
        renderItem={({ item }) => (
          <ThreadRow
            thread={item}
            pinned={pinnedThreadIds.includes(item.id)}
            zh={zh}
            onPress={() => openThread(item)}
            onLongPress={() => openThreadActions(item)}
          />
        )}
        ListHeaderComponent={
          botConversations.length ? (
            <View>
              <View style={styles.sectionHeader}>
                <ThemedText style={styles.sectionTitle}>
                  {zh ? "BOT 与群聊" : "BOT conversations"}
                </ThemedText>
                <ThemedText style={styles.sectionCount}>{botConversations.length}</ThemedText>
              </View>
              {botConversations.map((conversation) => (
                <BotConversationRow key={conversation.id} conversation={conversation} zh={zh} />
              ))}
            </View>
          ) : null
        }
        ListEmptyComponent={
          botConversations.length ? null : (
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
          )
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
      <AppBottomSheet
        onBack={isRenamingThread ? () => setIsRenamingThread(false) : undefined}
        onClose={closeThreadActions}
        scrollable={false}
        subtitle={
          isRenamingThread
            ? zh
              ? "为此会话设置一个标题。"
              : "Choose a clear title for this chat."
            : threadWithActions?.title
        }
        title={
          isRenamingThread ? (zh ? "编辑标题" : "Rename chat") : zh ? "会话操作" : "Chat actions"
        }
        visible={Boolean(threadWithActions)}
      >
        {isRenamingThread ? (
          <View style={styles.renameSheet}>
            <AppBottomSheetTextInput
              autoCapitalize="sentences"
              autoCorrect
              cursorColor={theme.text}
              editable={!renameThreadMutation.isPending}
              onChangeText={setRenameDraft}
              onSubmitEditing={() => void saveThreadTitle()}
              placeholder={zh ? "会话标题" : "Chat title"}
              placeholderTextColor={theme.textSecondary}
              returnKeyType="done"
              selectionColor="rgba(124, 199, 255, 0.28)"
              style={[
                styles.renameSheetInput,
                { borderColor: "rgba(255, 255, 255, 0.14)", color: theme.text },
              ]}
              value={renameDraft}
            />
            <View style={styles.renameSheetActions}>
              <Button
                accessibilityLabel={zh ? "取消修改标题" : "Cancel chat rename"}
                disabled={renameThreadMutation.isPending}
                onPress={() => setIsRenamingThread(false)}
                size="default"
                variant="ghost"
              >
                <Text style={{ color: theme.textSecondary }}>{zh ? "取消" : "Cancel"}</Text>
              </Button>
              <Button
                accessibilityLabel={zh ? "保存标题" : "Save chat name"}
                disabled={
                  !renameDraft.trim() ||
                  renameDraft.trim() === threadWithActions?.title ||
                  renameThreadMutation.isPending
                }
                onPress={() => void saveThreadTitle()}
                size="default"
              >
                <Text>{zh ? "保存" : "Save"}</Text>
              </Button>
            </View>
          </View>
        ) : threadWithActions ? (
          <>
            <SheetActionRow
              accessibilityLabel={isPinnedThreadWithActions ? "Unpin chat" : "Pin chat"}
              icon="pin"
              onPress={() => {
                togglePinnedThread(threadWithActions.id);
                closeThreadActions();
              }}
              title={
                isPinnedThreadWithActions
                  ? zh
                    ? "取消置顶"
                    : "Unpin chat"
                  : zh
                    ? "置顶"
                    : "Pin chat"
              }
            />
            {canMutateAppServerThreads ? (
              <>
                <SheetActionRow
                  accessibilityLabel={zh ? "编辑标题" : "Rename chat"}
                  icon="newChat"
                  onPress={() => setIsRenamingThread(true)}
                  title={zh ? "编辑标题" : "Rename chat"}
                />
                <SheetActionRow
                  accessibilityLabel={zh ? "重新生成标题" : "Regenerate title"}
                  disabled={
                    regenerateTitleMutation.isPending || threadWithActions.state === "running"
                  }
                  icon="refresh"
                  onPress={() => void regenerateThreadTitle()}
                  title={
                    regenerateTitleMutation.isPending
                      ? zh
                        ? "正在生成标题…"
                        : "Generating title…"
                      : zh
                        ? "重新生成标题"
                        : "Regenerate title"
                  }
                />
              </>
            ) : null}
          </>
        ) : null}
      </AppBottomSheet>
    </SafeAreaView>
  );
}

function BotConversationRow({ conversation, zh }: { conversation: BotConversation; zh: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        hapticSelection();
        router.push({
          pathname: "/bot-chat/[conversationId]",
          params: { conversationId: conversation.id },
        });
      }}
      style={({ pressed }) => [styles.threadRow, pressed && styles.rowPressed]}
    >
      <View style={[styles.threadIcon, { backgroundColor: "#282642" }]}>
        <Icon name="agentAtom" size={22} tintColor="#A49CFF" />
      </View>
      <View style={styles.threadCopy}>
        <ThemedText numberOfLines={1} style={styles.threadTitle}>
          {conversation.name}
        </ThemedText>
        <ThemedText numberOfLines={1} style={styles.threadPreview}>
          {conversation.kind === "group"
            ? zh
              ? `${conversation.botIds.length} 个 BOT · 群聊`
              : `${conversation.botIds.length} BOTs · Group`
            : zh
              ? "BOT 私聊"
              : "BOT direct chat"}
        </ThemedText>
      </View>
      <Icon name="chevronRight" size={18} tintColor="#77777D" />
    </Pressable>
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
      <Icon name={isProject ? "folder" : "clock"} size={16} tintColor={accent} strokeWidth={2} />
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
  renameSheet: { gap: 14 },
  renameSheetInput: {
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 15,
    lineHeight: 20,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  renameSheetActions: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "flex-end",
  },
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
    alignItems: "center",
    backgroundColor: "#1C1C1E",
    flexDirection: "row",
    gap: 8,
    height: 38,
    paddingHorizontal: 22,
  },
  sectionHeaderPressed: {
    backgroundColor: "#242426",
  },
  sectionTitle: {
    color: "#8E8E93",
    flex: 1,
    fontSize: 15.5,
    fontWeight: "600",
    lineHeight: 19,
  },
  sectionCount: {
    color: "#636366",
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
  },
  threadRow: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: "#1C1C1E",
  },
  rowPressed: { backgroundColor: "#111113" },
  threadIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  threadCopy: { flex: 1, minWidth: 0 },
  threadTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  threadPreview: { color: "#8E8E93", fontSize: 13.5, marginTop: 1 },
  threadMeta: {
    minWidth: 58,
    flexDirection: "column",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 3,
  },
  threadDate: { color: "#77777D", fontSize: 12.5, flexShrink: 0 },
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
