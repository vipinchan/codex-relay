import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Bot, BotConversation, BotMessage, ChatMessage } from "codex-relay/api-schema";
import { router } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import { EnrichedMarkdownText } from "react-native-enriched-markdown";

import {
  ASSISTANT_MARKDOWN_FLAVOR,
  createAssistantMarkdownStyle,
} from "@/components/chat/assistant-markdown-presentation";
import { ProtocolActivityCard } from "@/components/chat/ProtocolActivityCard";
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
import { mentionPayload, mergeBotMessagePages } from "./bot-compose";

const accent = "#6EA8FF";
const zh = (Intl.DateTimeFormat().resolvedOptions().locale || "en").toLowerCase().startsWith("zh");
const tr = (cn: string, en: string) => (zh ? cn : en);
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : tr("操作失败", "Operation failed");

type PendingSend = { requestId: string; text: string; mentionBotIds?: string[] };

export function BotChatScreen({ conversationId }: { conversationId: string }) {
  const queryClient = useQueryClient();
  const theme = useTheme();
  const serverUrl = getCodexRelayServerUrl();
  const scrollRef = useRef<ScrollView>(null);
  const [draft, setDraft] = useState("");
  const [selectedMentions, setSelectedMentions] = useState<string[]>([]);
  const [sheet, setSheet] = useState<"mentions" | "group" | undefined>();
  const [groupName, setGroupName] = useState("");
  const [workspacePath, setWorkspacePath] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [defaultBotId, setDefaultBotId] = useState("");
  const [olderMessages, setOlderMessages] = useState<BotMessage[]>([]);
  const [olderCursor, setOlderCursor] = useState<string>();
  const [hasOlderCursor, setHasOlderCursor] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [pending, setPending] = useState<PendingSend>();
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [savingGroup, setSavingGroup] = useState(false);
  const [stopping, setStopping] = useState(false);

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

  const conversation = conversationQuery.data;
  const bots = botsQuery.data ?? [];
  const members = conversation?.botIds ?? [];
  const messages = useMemo(
    () => mergeBotMessagePages(messagesQuery.data?.messages ?? [], olderMessages),
    [messagesQuery.data?.messages, olderMessages],
  );
  const hasRunning = messages.some((message) => message.status === "running");
  const canLoadOlder = hasOlderCursor ? !!olderCursor : !!messagesQuery.data?.nextCursor;
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

  async function loadOlder() {
    const cursor = hasOlderCursor ? olderCursor : messagesQuery.data?.nextCursor;
    if (!cursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await listBotMessages(conversationId, cursor);
      setOlderMessages((current) => mergeBotMessagePages(current, page.messages));
      setOlderCursor(page.nextCursor ?? undefined);
      setHasOlderCursor(true);
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
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
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
        <View style={styles.headerCopy}>
          <Text numberOfLines={1} style={styles.headerTitle}>
            {conversation?.name ?? tr("聊天", "Chat")}
          </Text>
          <Text numberOfLines={1} style={styles.headerSubtitle}>
            {conversation?.kind === "group"
              ? `${members.length} BOT · ${conversation.workspacePath}`
              : tr("BOT 私聊", "Private BOT chat")}
          </Text>
        </View>
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

      {conversationQuery.error ? (
        <Text style={styles.error}>{errorText(conversationQuery.error)}</Text>
      ) : null}
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.timeline}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => {
          if (!olderMessages.length) scrollRef.current?.scrollToEnd({ animated: false });
        }}
      >
        {canLoadOlder ? (
          <Pressable
            accessibilityRole="button"
            disabled={loadingOlder}
            onPress={() => void loadOlder()}
            style={styles.loadMore}
          >
            <Text style={styles.loadMoreText}>
              {loadingOlder ? tr("加载中…", "Loading…") : tr("加载更早消息", "Load older messages")}
            </Text>
          </Pressable>
        ) : null}
        {messagesQuery.isLoading ? <ActivityIndicator color={accent} /> : null}
        {messagesQuery.error ? (
          <Pressable onPress={() => void messagesQuery.refetch()}>
            <Text style={styles.error}>
              {errorText(messagesQuery.error)} · {tr("点击重试", "Tap to retry")}
            </Text>
          </Pressable>
        ) : null}
        {!messages.length && !messagesQuery.isLoading ? (
          <Text style={styles.empty}>{tr("发送消息，开始对话。", "Send a message to begin.")}</Text>
        ) : null}
        {messages.map((message) => {
          const activity = (message as BotMessage & { activity?: ChatMessage }).activity;
          if (activity)
            return (
              <View key={message.id} style={styles.activityRow}>
                <ProtocolActivityCard message={activity} />
              </View>
            );
          const user = message.sender === "user";
          const status = message.sender === "status";
          return (
            <View key={message.id} style={[styles.messageRow, user ? styles.userRow : null]}>
              {!user ? (
                <View
                  style={[
                    styles.senderDot,
                    {
                      backgroundColor:
                        bots.find((bot) => bot.id === message.botId)?.color ?? "#7A7AFF",
                    },
                  ]}
                />
              ) : null}
              <View
                style={[
                  styles.bubble,
                  user ? styles.userBubble : status ? styles.statusBubble : styles.botBubble,
                ]}
              >
                {!user && !status ? (
                  <Text style={styles.senderName}>{botName(message.botId)}</Text>
                ) : null}
                {message.status === "running" ? (
                  <View style={styles.running}>
                    <ActivityIndicator size="small" color={accent} />
                    <Text style={styles.runningText}>{tr("处理中…", "Working…")}</Text>
                  </View>
                ) : null}
                {message.content ? (
                  user || status ? (
                    <Text
                      selectable
                      style={[styles.messageText, status ? styles.statusText : null]}
                    >
                      {message.content}
                    </Text>
                  ) : (
                    <EnrichedMarkdownText
                      allowFontScaling={false}
                      enableTaskListItemToggle={false}
                      flavor={ASSISTANT_MARKDOWN_FLAVOR}
                      markdown={message.content}
                      markdownStyle={markdownStyle}
                      maxFontSizeMultiplier={1}
                      selectable
                    />
                  )
                ) : null}
                {message.status === "failed" || message.status === "interrupted" ? (
                  <Text style={styles.failedText}>
                    {message.status === "failed"
                      ? tr("回复失败", "Reply failed")
                      : tr("回复中断", "Reply interrupted")}
                  </Text>
                ) : null}
                <Text style={styles.timestamp}>
                  {new Date(message.createdAt).toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>

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
      <View style={styles.composer}>
        {conversation?.kind === "group" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr("选择 BOT", "Choose BOTs")}
            onPress={() => setSheet("mentions")}
            style={styles.mentionButton}
          >
            <Text style={styles.mentionButtonText}>@</Text>
          </Pressable>
        ) : null}
        <TextInput
          value={draft}
          onChangeText={setDraft}
          multiline
          placeholder={tr("发送消息…", "Message…")}
          placeholderTextColor="#73737A"
          style={styles.composerInput}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr("发送", "Send")}
          accessibilityState={{ disabled: !draft.trim() || sending || !!pending }}
          disabled={!draft.trim() || sending || !!pending}
          onPress={() => void submit()}
          style={[
            styles.sendButton,
            !draft.trim() || sending || !!pending ? styles.disabled : null,
          ]}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Icon name="send" size={19} tintColor="#fff" />
          )}
        </Pressable>
      </View>
      {conversation?.kind === "group" ? (
        <Text numberOfLines={1} style={styles.routingHint}>
          {selectedMentions.length
            ? tr("发送给：", "To: ") +
              members
                .filter((id) => selectedMentions.includes(id))
                .map(botName)
                .join("、")
            : tr("未选择 @：由默认 BOT 回复", "No @ selection: default BOT responds")}
        </Text>
      ) : null}

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
  timeline: { paddingHorizontal: 15, paddingTop: 16, paddingBottom: 18, gap: 14, flexGrow: 1 },
  messageRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  userRow: { justifyContent: "flex-end" },
  senderDot: { width: 26, height: 26, borderRadius: 13, marginBottom: 2 },
  bubble: { borderRadius: 16, paddingHorizontal: 13, paddingVertical: 9, maxWidth: "84%" },
  userBubble: { backgroundColor: "#3157B9", borderBottomRightRadius: 5 },
  botBubble: { backgroundColor: "#1C1C1E", borderBottomLeftRadius: 5, minWidth: 80 },
  statusBubble: { backgroundColor: "#151517", borderBottomLeftRadius: 5 },
  senderName: { color: accent, fontSize: 11, fontWeight: "700", marginBottom: 5 },
  messageText: { color: "#fff", fontSize: 15, lineHeight: 21 },
  statusText: { color: "#A0A0A7", fontSize: 13 },
  timestamp: { color: "#9A9AA0", fontSize: 10, marginTop: 5, alignSelf: "flex-end" },
  running: { alignItems: "center", flexDirection: "row", gap: 7, paddingVertical: 4 },
  runningText: { color: "#A0A0A7", fontSize: 13 },
  failedText: { color: "#FF8DA5", fontSize: 12, marginTop: 5 },
  activityRow: { marginLeft: 34 },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderTopColor: "#252528",
    borderTopWidth: 1,
  },
  composerInput: {
    flex: 1,
    color: "#fff",
    backgroundColor: "#1C1C1E",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 9,
    maxHeight: 120,
    minHeight: 38,
    fontSize: 15,
  },
  mentionButton: { alignItems: "center", justifyContent: "center", width: 36, height: 38 },
  mentionButtonText: { color: accent, fontWeight: "700", fontSize: 24 },
  sendButton: {
    alignItems: "center",
    justifyContent: "center",
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#4169D8",
  },
  disabled: { opacity: 0.45 },
  routingHint: { color: "#85858B", fontSize: 11, paddingHorizontal: 16, paddingBottom: 5 },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 5,
  },
  progressHint: { color: "#85858B", fontSize: 11 },
  stopText: { color: "#FF8DA5", fontSize: 12, fontWeight: "700" },
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
