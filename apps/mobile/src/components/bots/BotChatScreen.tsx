import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Bot, BotConversation, BotMessage } from "codex-relay/api-schema";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";

import { createAssistantMarkdownStyle } from "@/components/chat/assistant-markdown-presentation";
import {
  AppBottomSheet,
  AppBottomSheetTextInput,
  SheetActionRow,
  SheetSelectedDot,
} from "@/components/ui/bottom-sheet";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { Fonts } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
  createUuidV4,
  deleteBotConversation,
  getBotConversation,
  getCodexRelayServerUrl,
  listBotMessages,
  listBots,
  sendBotMessage,
  stopBotConversation,
  updateBotConversation,
} from "@/lib/codex-relay-api";
import {
  findMessageIndex,
  mentionPayload,
  mentionQuery,
  mergeBotMessagePages,
  removeMentionToken,
} from "./bot-compose";
import { BotComposer } from "./BotComposer";
import { BotMessageRow } from "./BotMessageRow";
import { useBotMessageSource } from "./use-bot-message-source";

const accent = "#6EA8FF";
const zh = (Intl.DateTimeFormat().resolvedOptions().locale || "en").toLowerCase().startsWith("zh");
const tr = (cn: string, en: string) => (zh ? cn : en);
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : tr("操作失败", "Operation failed");

type PendingSend = { requestId: string; text: string; mentionBotIds?: string[] };

export function BotChatScreen({
  conversationId,
  messageId,
}: {
  conversationId: string;
  messageId?: string;
}) {
  const queryClient = useQueryClient();
  const theme = useTheme();
  const serverUrl = getCodexRelayServerUrl();
  const listRef = useRef<FlatList<BotMessage>>(null);
  const atLatest = useRef(true);
  const initializedScroll = useRef(false);
  const targetScrollAttempts = useRef(0);
  const sourceScrolledId = useRef<string | undefined>(undefined);
  const [showLatest, setShowLatest] = useState(false);
  const [sourceUnavailable, setSourceUnavailable] = useState(false);
  const [draft, setDraft] = useState("");
  const [selectedMentions, setSelectedMentions] = useState<string[]>([]);
  const [sheet, setSheet] = useState<"mentions" | "group" | undefined>();
  const [groupName, setGroupName] = useState("");
  const [workspacePath, setWorkspacePath] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [defaultBotId, setDefaultBotId] = useState("");
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [pending, setPending] = useState<PendingSend>();
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [savingGroup, setSavingGroup] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);

  const conversationQuery = useQuery({
    queryKey: ["bot-conversation", serverUrl, conversationId],
    queryFn: () => getBotConversation(conversationId),
  });
  const botsQuery = useQuery({ queryKey: ["bots", serverUrl], queryFn: listBots });
  const messagesQuery = useQuery({
    queryKey: ["bot-messages", serverUrl, conversationId],
    queryFn: () => listBotMessages(conversationId),
    refetchInterval: (query) =>
      query.state.data?.messages.some((message) => message.status === "running") ? 1500 : false,
  });
  const { olderMessages, olderCursor, hasOlderCursor, sourceStatus, appendOlderPage } =
    useBotMessageSource(conversationId, messageId, messagesQuery.data);
  const sourceLoading = sourceStatus === "looking";

  const conversation = conversationQuery.data;
  const bots = botsQuery.data ?? [];
  const members = conversation?.botIds ?? [];
  const messages = useMemo(
    () => mergeBotMessagePages(messagesQuery.data?.messages ?? [], olderMessages),
    [messagesQuery.data?.messages, olderMessages],
  );
  const hasRunning = messages.some((message) => message.status === "running");
  const canLoadOlder = hasOlderCursor ? !!olderCursor : !!messagesQuery.data?.nextCursor;
  const activeReplyId = messages.find(
    (message) => message.sender === "bot" && message.status === "running",
  )?.id;
  const matchingBots = (() => {
    const query = mentionQuery(draft);
    return query === null
      ? []
      : members
          .map((id) => bots.find((bot) => bot.id === id))
          .filter((bot): bot is Bot => !!bot && bot.name.toLocaleLowerCase().includes(query));
  })();
  const markdownStyle = useMemo(
    () =>
      createAssistantMarkdownStyle(
        {
          backgroundSelected: theme.backgroundSelected,
          text: theme.text,
          textSecondary: theme.textSecondary,
        },
        {
          mono: Fonts.mono,
          monoMedium: Fonts.monoMedium,
          sans: Fonts.sans,
          sansMedium: Fonts.sansMedium,
          sansSemiBold: Fonts.sansSemiBold,
        },
      ),
    [theme.backgroundSelected, theme.text, theme.textSecondary],
  );

  function botName(botId: string | null) {
    return bots.find((bot) => bot.id === botId)?.name ?? "BOT";
  }

  useEffect(() => {
    if (!messageId || sourceStatus !== "found" || sourceScrolledId.current === messageId) return;
    const index = findMessageIndex(messages, messageId);
    if (index < 0) return;
    targetScrollAttempts.current = 0;
    setSourceUnavailable(false);
    initializedScroll.current = true;
    atLatest.current = false;
    setShowLatest(true);
    const timer = setTimeout(() => {
      sourceScrolledId.current = messageId;
      listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.32 });
    }, 120);
    return () => clearTimeout(timer);
  }, [messageId, messages, sourceStatus]);

  async function loadOlder() {
    const cursor = hasOlderCursor ? olderCursor : messagesQuery.data?.nextCursor;
    if (!cursor || loadingOlder) return;
    setLoadingOlder(true);
    atLatest.current = false;
    try {
      const page = await listBotMessages(conversationId, cursor);
      appendOlderPage(page);
    } catch (error) {
      Alert.alert(tr("无法加载更早消息", "Couldn’t load older messages"), errorText(error));
    } finally {
      setLoadingOlder(false);
    }
  }

  async function submit(message?: PendingSend) {
    if (sending || (pending && !message)) return;
    const submitted = message ?? {
      requestId: createUuidV4(),
      text: draft.trim(),
      mentionBotIds:
        conversation?.kind === "group" ? mentionPayload(selectedMentions, members) : undefined,
    };
    if (!submitted.text) return;
    setSending(true);
    setSendError("");
    setPending(submitted);
    try {
      await sendBotMessage(conversationId, submitted);
      setPending(undefined);
      setDraft((current) => (current.trim() === submitted.text ? "" : current));
      if (draft.trim() === submitted.text) setSelectedMentions([]);
      await queryClient.invalidateQueries({
        queryKey: ["bot-messages", serverUrl, conversationId],
      });
      void queryClient.invalidateQueries({ queryKey: ["bot-conversations", serverUrl] });
      if (atLatest.current) setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (error) {
      setSendError(errorText(error));
      // The same request ID is retained because the server may already be processing this turn.
    } finally {
      setSending(false);
    }
  }

  function toggleMention(botId: string) {
    setSelectedMentions((current) =>
      current.includes(botId) ? current.filter((id) => id !== botId) : [...current, botId],
    );
  }

  function selectMention(botId: string) {
    setSelectedMentions((current) => (current.includes(botId) ? current : [...current, botId]));
    setDraft((current) => removeMentionToken(current));
    setMentionOpen(false);
    setSheet(undefined);
  }

  function onDraftChange(text: string) {
    setDraft(text);
    setMentionOpen(conversation?.kind === "group" && mentionQuery(text) !== null);
  }

  function openGroupEditor(group: BotConversation) {
    setGroupName(group.name);
    setWorkspacePath(group.workspacePath);
    setMemberIds(group.botIds);
    setDefaultBotId(group.defaultBotId ?? group.botIds[0] ?? "");
    setSheet("group");
  }

  function toggleGroupMember(botId: string) {
    if (memberIds.includes(botId)) {
      const next = memberIds.filter((id) => id !== botId);
      setMemberIds(next);
      if (defaultBotId === botId) setDefaultBotId(next[0] ?? "");
    } else {
      setMemberIds([...memberIds, botId]);
      if (!defaultBotId) setDefaultBotId(botId);
    }
  }

  async function saveGroup() {
    if (
      !conversation ||
      !groupName.trim() ||
      !workspacePath.trim() ||
      !memberIds.length ||
      !defaultBotId ||
      savingGroup
    )
      return;
    setSavingGroup(true);
    try {
      await updateBotConversation(conversation.id, {
        name: groupName.trim(),
        workspacePath: workspacePath.trim(),
        botIds: memberIds,
        defaultBotId,
      });
      await queryClient.invalidateQueries({
        queryKey: ["bot-conversation", serverUrl, conversationId],
      });
      void queryClient.invalidateQueries({ queryKey: ["bot-conversations", serverUrl] });
      setSelectedMentions((current) => current.filter((id) => memberIds.includes(id)));
      setSheet(undefined);
    } catch (error) {
      Alert.alert(tr("群设置保存失败", "Couldn’t save group"), errorText(error));
    } finally {
      setSavingGroup(false);
    }
  }

  async function stopReply() {
    if (stopping) return;
    setStopping(true);
    try {
      await stopBotConversation(conversationId);
      await queryClient.invalidateQueries({
        queryKey: ["bot-messages", serverUrl, conversationId],
      });
    } catch (error) {
      Alert.alert(tr("无法停止回复", "Couldn’t stop reply"), errorText(error));
    } finally {
      setStopping(false);
    }
  }

  function confirmDeleteGroup() {
    if (!conversation || conversation.kind !== "group") return;
    Alert.alert(
      tr("删除群聊", "Delete group"),
      tr("群聊将从会话列表移除。", "The group will leave the session list."),
      [
        { text: tr("取消", "Cancel"), style: "cancel" },
        {
          text: tr("删除", "Delete"),
          style: "destructive",
          onPress: () =>
            void (async () => {
              try {
                await deleteBotConversation(conversation.id);
                void queryClient.invalidateQueries({ queryKey: ["bot-conversations", serverUrl] });
                setSheet(undefined);
                router.back();
              } catch (error) {
                Alert.alert(tr("删除失败", "Delete failed"), errorText(error));
              }
            })(),
        },
      ],
    );
  }

  return (
    <SafeAreaView edges={["top", "left", "right", "bottom"]} style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr("返回", "Back")}
          onPress={() => router.back()}
          style={styles.headerButton}
        >
          <Icon name="back" size={22} tintColor={accent} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={!conversation}
          onPress={() => {
            if (conversation?.kind === "group") openGroupEditor(conversation);
            else if (conversation?.botId)
              router.push({ pathname: "/bot/[botId]", params: { botId: conversation.botId } });
          }}
          style={styles.headerCopy}
        >
          <Text numberOfLines={1} style={styles.headerTitle}>
            {conversation?.name ?? tr("聊天", "Chat")}
          </Text>
          <Text numberOfLines={1} style={styles.headerSubtitle}>
            {conversation?.kind === "group"
              ? `${members.length} BOT · ${conversation.workspacePath}`
              : tr("BOT 私聊", "Private BOT chat")}
          </Text>
        </Pressable>
        {conversation?.kind === "group" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr("群设置", "Group settings")}
            onPress={() => openGroupEditor(conversation)}
            style={styles.headerButton}
          >
            <Icon name="controls" size={21} tintColor={accent} />
          </Pressable>
        ) : (
          <View style={styles.headerButton} />
        )}
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.content}
      >
        {conversationQuery.error ? (
          <Text style={styles.error}>{errorText(conversationQuery.error)}</Text>
        ) : null}
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(message) => message.id}
          renderItem={({ item }) => (
            <BotMessageRow
              message={item}
              bot={bots.find((bot) => bot.id === item.botId)}
              markdownStyle={markdownStyle}
              isActiveReply={item.id === activeReplyId}
              isSource={item.id === messageId}
            />
          )}
          style={styles.list}
          contentContainerStyle={styles.timeline}
          keyboardShouldPersistTaps="handled"
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
            const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
            atLatest.current =
              contentSize.height - contentOffset.y - layoutMeasurement.height < 100;
            setShowLatest(!atLatest.current);
          }}
          scrollEventThrottle={120}
          onContentSizeChange={() => {
            if (
              !messages.length ||
              (messageId &&
                sourceScrolledId.current !== messageId &&
                sourceStatus !== "unavailable")
            )
              return;
            if (!initializedScroll.current) {
              initializedScroll.current = true;
              listRef.current?.scrollToEnd({ animated: false });
            } else if (atLatest.current && !loadingOlder) {
              listRef.current?.scrollToEnd({ animated: false });
            }
          }}
          onScrollToIndexFailed={({ index, averageItemLength }) => {
            if (targetScrollAttempts.current++ > 3) {
              setSourceUnavailable(true);
              return;
            }
            listRef.current?.scrollToOffset({
              offset: Math.max(0, averageItemLength * index),
              animated: false,
            });
            setTimeout(
              () => listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.32 }),
              180,
            );
          }}
          ListHeaderComponent={
            canLoadOlder && !sourceLoading ? (
              <Pressable
                accessibilityRole="button"
                disabled={loadingOlder}
                onPress={() => void loadOlder()}
                style={styles.loadMore}
              >
                <Text style={styles.loadMoreText}>
                  {loadingOlder
                    ? tr("加载中…", "Loading…")
                    : tr("加载更早消息", "Load older messages")}
                </Text>
              </Pressable>
            ) : null
          }
          ListEmptyComponent={
            messagesQuery.isLoading ? (
              <ActivityIndicator color={accent} />
            ) : (
              <Text style={styles.empty}>
                {tr("发送消息，开始对话。", "Send a message to begin.")}
              </Text>
            )
          }
        />
        {messagesQuery.error ? (
          <Pressable onPress={() => void messagesQuery.refetch()}>
            <Text style={styles.error}>
              {errorText(messagesQuery.error)} · {tr("点击重试", "Tap to retry")}
            </Text>
          </Pressable>
        ) : null}
        {messageId && (sourceLoading || sourceStatus === "unavailable" || sourceUnavailable) ? (
          <Text style={styles.sourceNotice}>
            {sourceLoading
              ? tr("正在查找来源消息…", "Finding source message…")
              : tr("找不到这条来源消息", "Source message is unavailable")}
          </Text>
        ) : null}
        {showLatest && !sourceLoading ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              atLatest.current = true;
              listRef.current?.scrollToEnd({ animated: true });
            }}
            style={styles.latestButton}
          >
            <Text style={styles.latestText}>{tr("最新消息 ↓", "Latest ↓")}</Text>
          </Pressable>
        ) : null}

        {sendError && pending ? (
          <View style={styles.retryBar}>
            <Text numberOfLines={2} style={styles.retryError}>
              {sendError}
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={sending}
              onPress={() => void submit(pending)}
            >
              <Text style={styles.retryText}>{tr("重试", "Retry")}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={sending}
              onPress={() =>
                Alert.alert(
                  tr("放弃重试？", "Discard retry?"),
                  tr(
                    "之前的消息可能已送达。你可以先返回聊天记录查看。",
                    "The earlier message may have been delivered. Check the chat before sending again.",
                  ),
                  [
                    { text: tr("取消", "Cancel"), style: "cancel" },
                    {
                      text: tr("放弃", "Discard"),
                      style: "destructive",
                      onPress: () => {
                        setPending(undefined);
                        setSendError("");
                        void messagesQuery.refetch();
                      },
                    },
                  ],
                )
              }
            >
              <Text style={styles.discardText}>{tr("放弃", "Discard")}</Text>
            </Pressable>
          </View>
        ) : null}
        {hasRunning ? (
          <View style={styles.progressRow}>
            <Text style={styles.progressHint}>
              {tr("BOT 正在依次回复", "BOTs are responding in order")}
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={stopping}
              onPress={() => void stopReply()}
            >
              <Text style={styles.stopText}>
                {stopping ? tr("停止中…", "Stopping…") : tr("停止", "Stop")}
              </Text>
            </Pressable>
          </View>
        ) : null}
        <BotComposer
          conversation={conversation}
          bots={bots}
          draft={draft}
          selectedMentions={selectedMentions}
          matchingBots={matchingBots}
          mentionOpen={mentionOpen}
          sending={sending}
          hasPending={!!pending}
          onDraftChange={onDraftChange}
          onToggleMention={toggleMention}
          onSelectMention={selectMention}
          onOpenMentions={() => setSheet("mentions")}
          onSend={() => void submit()}
        />
      </KeyboardAvoidingView>

      <AppBottomSheet
        title={tr("选择回复 BOT", "Choose responding BOTs")}
        subtitle={tr(
          "可多选；未选择时由默认 BOT 回复。",
          "Select multiple BOTs. Without a selection, the default BOT responds.",
        )}
        visible={sheet === "mentions"}
        onClose={() => setSheet(undefined)}
      >
        <SheetActionRow
          accessibilityLabel={tr("默认 BOT", "Default BOT")}
          icon="agentAtom"
          title={tr("默认 BOT", "Default BOT")}
          subtitle={botName(conversation?.defaultBotId ?? null)}
          selected={!selectedMentions.length}
          onPress={() => setSelectedMentions([])}
        />
        <SheetActionRow
          accessibilityLabel={tr("@所有 BOT", "Mention all BOTs")}
          icon="agentAtom"
          title={tr("@所有 BOT", "@all BOTs")}
          selected={selectedMentions.length === members.length && !!members.length}
          onPress={() => setSelectedMentions([...members])}
        />
        {members.map((id) => (
          <SheetActionRow
            key={id}
            accessibilityLabel={`@${botName(id)}`}
            icon="agentAtom"
            title={`@${botName(id)}`}
            selected={selectedMentions.includes(id)}
            trailing={<SheetSelectedDot selected={selectedMentions.includes(id)} />}
            onPress={() => toggleMention(id)}
          />
        ))}
        <Pressable
          accessibilityRole="button"
          onPress={() => setSheet(undefined)}
          style={styles.primaryAction}
        >
          <Text style={styles.primaryText}>{tr("完成", "Done")}</Text>
        </Pressable>
      </AppBottomSheet>

      <AppBottomSheet
        title={tr("群设置", "Group settings")}
        visible={sheet === "group"}
        onClose={() => setSheet(undefined)}
      >
        <Text style={styles.fieldLabel}>{tr("群名", "Group name")}</Text>
        <AppBottomSheetTextInput
          value={groupName}
          onChangeText={setGroupName}
          style={styles.sheetInput}
          placeholderTextColor="#777"
        />
        <Text style={styles.fieldLabel}>{tr("共享工作目录", "Shared working directory")}</Text>
        <AppBottomSheetTextInput
          value={workspacePath}
          onChangeText={setWorkspacePath}
          autoCapitalize="none"
          style={styles.sheetInput}
          placeholderTextColor="#777"
        />
        <Text style={styles.fieldLabel}>{tr("成员", "Members")}</Text>
        {bots.map((bot: Bot) => (
          <SheetActionRow
            key={bot.id}
            accessibilityLabel={bot.name}
            icon="agentAtom"
            title={bot.name}
            selected={memberIds.includes(bot.id)}
            trailing={<SheetSelectedDot selected={memberIds.includes(bot.id)} />}
            onPress={() => toggleGroupMember(bot.id)}
          />
        ))}
        <Text style={styles.fieldLabel}>{tr("默认 BOT", "Default BOT")}</Text>
        {bots
          .filter((bot) => memberIds.includes(bot.id))
          .map((bot) => (
            <SheetActionRow
              key={bot.id}
              accessibilityLabel={bot.name}
              icon="agentAtom"
              title={bot.name}
              selected={defaultBotId === bot.id}
              trailing={<SheetSelectedDot selected={defaultBotId === bot.id} />}
              onPress={() => setDefaultBotId(bot.id)}
            />
          ))}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{
            disabled:
              savingGroup || !groupName.trim() || !workspacePath.trim() || !memberIds.length,
          }}
          disabled={savingGroup || !groupName.trim() || !workspacePath.trim() || !memberIds.length}
          onPress={() => void saveGroup()}
          style={[styles.primaryAction, savingGroup ? styles.disabled : null]}
        >
          <Text style={styles.primaryText}>
            {savingGroup ? tr("保存中…", "Saving…") : tr("保存群设置", "Save group settings")}
          </Text>
        </Pressable>
        <SheetActionRow
          accessibilityLabel={tr("删除群聊", "Delete group")}
          icon="trash"
          title={tr("删除群聊", "Delete group")}
          iconTintColor="#FF8DA5"
          onPress={confirmDeleteGroup}
        />
      </AppBottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000" },
  content: { flex: 1 },
  header: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: 62,
    borderBottomColor: "#242426",
    borderBottomWidth: 1,
    paddingHorizontal: 8,
  },
  headerButton: { alignItems: "center", justifyContent: "center", width: 44, height: 44 },
  headerCopy: { flex: 1, minWidth: 0, alignItems: "center" },
  headerTitle: { color: "#fff", fontWeight: "700", fontSize: 17 },
  headerSubtitle: { color: "#8E8E93", fontSize: 11, marginTop: 3 },
  list: { flex: 1 },
  timeline: { paddingHorizontal: 15, paddingTop: 12, paddingBottom: 16, flexGrow: 1 },
  sourceNotice: { color: "#9ABBF2", fontSize: 12, textAlign: "center", paddingVertical: 6 },
  latestButton: {
    alignSelf: "center",
    backgroundColor: "#292D36",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginBottom: 5,
  },
  latestText: { color: "#9ABBF2", fontSize: 12, fontFamily: Fonts.sansMedium },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 5,
  },
  progressHint: { color: "#85858B", fontSize: 11 },
  stopText: { color: "#FF8DA5", fontSize: 12, fontWeight: "700" },
  disabled: { opacity: 0.45 },
  retryBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    backgroundColor: "#2E1D23",
    paddingHorizontal: 15,
    paddingVertical: 9,
  },
  retryError: { color: "#FFB3C1", fontSize: 12, flex: 1 },
  retryText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  discardText: { color: "#C0A3AB", fontSize: 12 },
  loadMore: { alignItems: "center", paddingVertical: 8 },
  loadMoreText: { color: accent, fontSize: 13 },
  error: { color: "#FF8DA5", fontSize: 13, textAlign: "center", padding: 10 },
  empty: { color: "#77777C", fontSize: 13, textAlign: "center", marginTop: 30 },
  fieldLabel: { color: "#AEAEB2", fontSize: 13, fontWeight: "600", marginTop: 12, marginBottom: 4 },
  sheetInput: {
    color: "#fff",
    backgroundColor: "#29292C",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
    fontSize: 15,
  },
  primaryAction: {
    alignItems: "center",
    backgroundColor: "#4169D8",
    borderRadius: 11,
    minHeight: 46,
    justifyContent: "center",
    marginTop: 14,
    marginBottom: 8,
  },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
