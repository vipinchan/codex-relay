import { useComputerOperations } from "@/hooks/use-computer-operations";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { BotMessage } from "codex-relay/api-schema";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, View } from "react-native";
import { KeyboardGestureArea, KeyboardStickyView } from "react-native-keyboard-controller";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";

import { createAssistantMarkdownStyle } from "@/components/chat/assistant-markdown-presentation";
import { MessageList } from "@/components/chat/MessageList";
import { useMessageListController } from "@/components/chat/use-message-list-controller";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { Fonts, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
  getBotConversation as rawGetBotConversation,
  getCodexRelayCacheIdentity,
  listBotMessages as rawListBotMessages,
  listBots as rawListBots,
  stopBotConversation as rawStopBotConversation,
} from "@/lib/codex-relay-api";
import { mergeBotMessagePages } from "./bot-compose";
import { BotComposer } from "./BotComposer";
import { BotMessageRow } from "./BotMessageRow";
import { BotDirectComposer } from "./BotDirectComposer";
import { BotDirectMessageRow } from "./BotDirectMessageRow";
import { useBotMessageHistory } from "./use-bot-message-history";

const zh = (Intl.DateTimeFormat().resolvedOptions().locale || "en").toLowerCase().startsWith("zh");
const tr = (cn: string, en: string) => (zh ? cn : en);
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : tr("操作失败", "Operation failed");

const buildBotRows = (messages: BotMessage[]) => messages;
const botRowKey = (message: BotMessage) => message.id;
const isUserBotRow = (message: BotMessage) => message.sender === "user";
function latestUserMessageId(messages: BotMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].sender === "user") return messages[index].id;
  }
  return "no-user";
}

export function BotChatScreen({
  conversationId,
  messageId,
}: {
  conversationId: string;
  messageId?: string;
}) {
  const { getBotConversation, listBotMessages, listBots, stopBotConversation } =
    useComputerOperations({
      getBotConversation: rawGetBotConversation,
      listBotMessages: rawListBotMessages,
      listBots: rawListBots,
      stopBotConversation: rawStopBotConversation,
    });

  const queryClient = useQueryClient();
  const theme = useTheme();
  const accent = theme.accent;
  const insets = useSafeAreaInsets();
  const serverUrl = getCodexRelayCacheIdentity();
  const [stopping, setStopping] = useState(false);
  const [focused, setFocused] = useState(false);

  const conversationQuery = useQuery({
    queryKey: ["bot-conversation", serverUrl, conversationId],
    queryFn: () => getBotConversation(conversationId),
  });
  const botsQuery = useQuery({
    queryKey: ["bots", serverUrl],
    queryFn: listBots,
    refetchInterval: focused && conversationQuery.data?.kind === "direct" ? 4000 : false,
  });
  const messagesQuery = useQuery({
    queryKey: ["bot-messages", serverUrl, conversationId],
    queryFn: () => listBotMessages(conversationId),
    refetchInterval: (query) =>
      query.state.data?.messages.some((message) => message.status === "running") ? 1500 : false,
  });
  const timelineKey = `${serverUrl}:${conversationId}`;
  const { olderMessages, hasOlder, loadEarlier } = useBotMessageHistory(
    timelineKey,
    conversationId,
    messagesQuery.data,
  );

  const conversation = conversationQuery.data;
  const bots = botsQuery.data ?? [];
  const directBot =
    conversation?.kind === "direct" ? bots.find((bot) => bot.id === conversation.botId) : undefined;
  const messages = useMemo(
    () => mergeBotMessagePages(messagesQuery.data?.messages ?? [], olderMessages),
    [messagesQuery.data?.messages, olderMessages],
  );
  const hasRunning = messages.some((message) => message.status === "running");
  const controller = useMessageListController<BotMessage, BotMessage>({
    timelineKey,
    messages,
    buildRows: buildBotRows,
    keyExtractor: botRowKey,
    isUserRow: isUserBotRow,
    isLoading: messagesQuery.isPending,
    hasEarlierMessages: hasOlder,
    onLoadEarlierMessages: loadEarlier,
    isRunning: hasRunning,
    followTrigger: `${latestUserMessageId(messages)}:${hasRunning}`,
    sourceKey: messageId,
  });
  const activeReplyId = messages.find(
    (message) => message.sender === "bot" && message.status === "running",
  )?.id;
  const markdownStyle = useMemo(
    () =>
      createAssistantMarkdownStyle(theme, {
        mono: Fonts.mono,
        monoMedium: Fonts.monoMedium,
        sans: Fonts.sans,
        sansMedium: Fonts.sansMedium,
        sansSemiBold: Fonts.sansSemiBold,
      }),
    [theme],
  );

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      void queryClient.invalidateQueries({ queryKey: ["bots", serverUrl] });
      void queryClient.invalidateQueries({
        queryKey: ["bot-conversation", serverUrl, conversationId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["bot-conversation-runtime", serverUrl, conversationId],
      });
      void queryClient.invalidateQueries({ queryKey: ["bot-messages", serverUrl, conversationId] });
      return () => setFocused(false);
    }, [queryClient, serverUrl, conversationId]),
  );

  async function refreshMessagesAfterSend() {
    await queryClient.invalidateQueries({ queryKey: ["bot-messages", serverUrl, conversationId] });
    void queryClient.invalidateQueries({ queryKey: ["bot-conversations", serverUrl] });
  }

  function openGroupSettings() {
    router.push({ pathname: "/bot-preview/[conversationId]", params: { conversationId } });
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

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={[
        styles.screen,
        { paddingBottom: Math.max(Spacing.one, insets.bottom - Spacing.four) },
      ]}
    >
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
          accessibilityHint={
            conversation?.kind === "direct" ? tr("打开 BOT 资料", "Opens BOT profile") : undefined
          }
          disabled={!conversation}
          onPress={() => {
            if (conversation?.kind === "group") openGroupSettings();
            else if (conversation?.botId)
              router.push({ pathname: "/bot/[botId]", params: { botId: conversation.botId } });
          }}
          style={styles.headerCopy}
        >
          <View style={styles.headerTitleRow}>
            <Text numberOfLines={1} style={styles.headerTitle}>
              {directBot?.name ?? conversation?.name ?? tr("聊天", "Chat")}
            </Text>
            {conversation?.kind === "direct" && conversation.botId ? (
              <Icon name="chevronRight" size={14} tintColor={accent} />
            ) : null}
          </View>
          <Text numberOfLines={1} style={styles.headerSubtitle}>
            {conversation?.kind === "group"
              ? `${conversation.botIds.length} BOT · ${conversation.workspacePath}`
              : (conversation?.workspacePath ?? tr("BOT 私聊", "Private BOT chat"))}
          </Text>
        </Pressable>
        {conversation?.kind === "group" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr("群设置", "Group settings")}
            onPress={openGroupSettings}
            style={styles.headerButton}
          >
            <Icon name="controls" size={21} tintColor={accent} />
          </Pressable>
        ) : conversation?.kind === "direct" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr("BOT 定义与工作区预览", "BOT definition and workspace preview")}
            onPress={() =>
              router.push({
                pathname: "/bot-preview/[conversationId]",
                params: { conversationId },
              })
            }
            style={styles.headerButton}
          >
            <Icon name="preview" size={21} tintColor={accent} />
          </Pressable>
        ) : (
          <View style={styles.headerButton} />
        )}
      </View>

      <KeyboardGestureArea interpolator="ios" style={styles.content}>
        {conversationQuery.error ? (
          <Text style={styles.error}>{errorText(conversationQuery.error)}</Text>
        ) : null}
        <MessageList
          controller={controller}
          renderItem={({ item }) =>
            conversation?.kind === "direct" || item.sender === "user" ? (
              <BotDirectMessageRow
                message={item}
                isActiveReply={item.id === activeReplyId}
                isSource={item.id === messageId}
                onOpenMarkdownAttachment={(target) =>
                  router.push({
                    pathname: "/bot-preview/[conversationId]",
                    params: { conversationId, filePath: target.path },
                  })
                }
              />
            ) : (
              <BotMessageRow
                message={item}
                bot={bots.find((bot) => bot.id === item.botId)}
                markdownStyle={markdownStyle}
                isActiveReply={item.id === activeReplyId}
                isSource={item.id === messageId}
              />
            )
          }
          contentContainerStyle={styles.timeline}
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
        <KeyboardStickyView>
          {messagesQuery.error ? (
            <Pressable onPress={() => void messagesQuery.refetch()}>
              <Text style={styles.error}>
                {errorText(messagesQuery.error)} · {tr("点击重试", "Tap to retry")}
              </Text>
            </Pressable>
          ) : null}
          {messageId &&
          (controller.sourceStatus === "looking" || controller.sourceStatus === "unavailable") ? (
            <Text style={styles.sourceNotice}>
              {controller.sourceStatus === "looking"
                ? tr("正在查找来源消息…", "Finding source message…")
                : tr("找不到这条来源消息", "Source message is unavailable")}
            </Text>
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
          {conversation?.kind === "direct" ? (
            directBot ? (
              <BotDirectComposer
                key={`${serverUrl}:${conversationId}`}
                conversation={conversation}
                bot={directBot}
                isFocused={focused}
                hasRunning={hasRunning}
                onCancel={() => void stopReply()}
                onSent={refreshMessagesAfterSend}
              />
            ) : (
              <Pressable onPress={() => void botsQuery.refetch()} style={styles.loadMore}>
                <Text style={botsQuery.error ? styles.error : styles.empty}>
                  {botsQuery.error
                    ? `${errorText(botsQuery.error)} · ${tr("点击重试", "Tap to retry")}`
                    : botsQuery.isPending
                      ? tr("正在加载 BOT…", "Loading BOT…")
                      : tr("BOT 不可用", "BOT is unavailable")}
                </Text>
              </Pressable>
            )
          ) : conversation?.kind === "group" ? (
            <BotComposer
              key={`${serverUrl}:${conversationId}`}
              conversation={conversation}
              bots={bots}
              hasRunning={hasRunning}
              onCancel={() => void stopReply()}
              onSent={refreshMessagesAfterSend}
            />
          ) : null}
        </KeyboardStickyView>
      </KeyboardGestureArea>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create((theme) => ({
  screen: { flex: 1, backgroundColor: theme.background },
  content: { flex: 1 },
  header: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: 62,
    borderBottomColor: theme.backgroundElement,
    borderBottomWidth: 1,
    paddingHorizontal: 8,
  },
  headerButton: { alignItems: "center", justifyContent: "center", width: 44, height: 44 },
  headerCopy: { flex: 1, minWidth: 0, alignItems: "center" },
  headerTitleRow: { maxWidth: "100%", flexDirection: "row", alignItems: "center", gap: 4 },
  headerTitle: { color: theme.text, flexShrink: 1, fontWeight: "700", fontSize: 17 },
  headerSubtitle: { color: theme.textSecondary, fontSize: 11, marginTop: 3 },
  timeline: { paddingHorizontal: 15, paddingTop: 12, paddingBottom: 16, flexGrow: 1 },
  sourceNotice: { color: theme.accent, fontSize: 12, textAlign: "center", paddingVertical: 6 },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 5,
  },
  progressHint: { color: theme.textSecondary, fontSize: 11 },
  stopText: { color: theme.danger, fontSize: 12, fontWeight: "700" },
  disabled: { opacity: 0.45 },
  loadMore: { alignItems: "center", paddingVertical: 8 },
  error: { color: theme.danger, fontSize: 13, textAlign: "center", padding: 10 },
  empty: { color: theme.textSecondary, fontSize: 13, textAlign: "center", marginTop: 30 },
}));
