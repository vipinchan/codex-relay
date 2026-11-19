import type { Bot, BotMessage } from "codex-relay/api-schema";
import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { ActivityIndicator, Linking, Pressable, View } from "react-native";
import { EnrichedMarkdownText, type MarkdownStyle } from "react-native-enriched-markdown";
import { StyleSheet } from "react-native-unistyles";

import { ASSISTANT_MARKDOWN_FLAVOR } from "@/components/chat/assistant-markdown-presentation";
import { MessageAttachments, messageImageUris } from "@/components/chat/MessageBubble";
import { MessageFileCards } from "@/components/chat/MessageFileCards";
import { messageLinkAction } from "@/components/chat/message-markdown-content";
import { openExternalImage, openMessageImage } from "@/components/chat/open-message-image";
import { ProtocolActivityCard } from "@/components/chat/ProtocolActivityCard";
import { Text } from "@/components/ui/text";
import { Fonts } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

const zh = (Intl.DateTimeFormat().resolvedOptions().locale || "en").toLowerCase().startsWith("zh");
const tr = (cn: string, en: string) => (zh ? cn : en);

export function BotMessageRow({
  message,
  bot,
  markdownStyle,
  isActiveReply,
  isSource,
}: {
  message: BotMessage;
  bot?: Bot;
  markdownStyle: MarkdownStyle;
  isActiveReply: boolean;
  isSource: boolean;
}) {
  const [showModelInfo, setShowModelInfo] = useState(false);
  const theme = useTheme();
  if (message.activity) {
    return (
      <View style={styles.activityRow}>
        <ProtocolActivityCard message={message.activity} />
      </View>
    );
  }
  const user = message.sender === "user";
  const status = message.sender === "status";
  const runtime = message.runtime;
  return (
    <View
      style={[
        styles.messageRow,
        user ? styles.userRow : null,
        isSource ? styles.sourceHighlight : null,
      ]}
    >
      {!user && !status ? (
        <View style={[styles.senderAvatar, { backgroundColor: bot?.color ?? theme.accent }]}>
          <Text style={styles.senderInitial}>{(bot?.name ?? "B").slice(0, 1).toUpperCase()}</Text>
        </View>
      ) : null}
      <View style={styles.messageContent}>
        {!user && !status ? (
          <Text numberOfLines={1} style={styles.senderName}>
            {bot?.name ?? "BOT"}
          </Text>
        ) : null}
        <View
          style={[
            styles.bubble,
            user ? styles.userBubble : status ? styles.statusBubble : styles.botBubble,
          ]}
        >
          {message.status === "running" ? (
            <View style={styles.running}>
              {isActiveReply ? <ActivityIndicator size="small" color={theme.accent} /> : null}
              <Text style={styles.runningText}>
                {isActiveReply ? tr("正在回复…", "Responding…") : tr("等待回复…", "Queued…")}
              </Text>
            </View>
          ) : null}
          {message.content ? (
            user || status ? (
              <Text selectable style={[styles.messageText, status ? styles.statusText : null]}>
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
                onLinkPress={({ url }) => {
                  const action = messageLinkAction(url);
                  if (action.kind === "workspace-image" && message.status === "completed") {
                    void openMessageImage({
                      source: "bot",
                      conversationId: message.conversationId,
                      messageId: message.id,
                      path: action.path,
                    });
                  } else if (action.kind === "external-image") {
                    openExternalImage(action.url);
                  } else if (action.kind === "external") {
                    void Linking.openURL(action.url).catch(() => undefined);
                  }
                }}
                selectable
              />
            )
          ) : null}
          <MessageAttachments
            imageUris={messageImageUris(message.attachments)}
            markdownAttachments={[]}
            messageId={message.id}
          />
          {message.sender === "bot" && message.status === "completed" ? (
            <MessageFileCards
              content={message.content}
              message={{
                source: "bot",
                conversationId: message.conversationId,
                messageId: message.id,
              }}
            />
          ) : null}
          {message.status === "failed" || message.status === "interrupted" ? (
            <Text style={styles.failedText}>
              {message.status === "failed"
                ? tr("回复失败", "Reply failed")
                : tr("回复中断", "Reply interrupted")}
            </Text>
          ) : null}
          {!user && !status && showModelInfo ? (
            <Text style={styles.runtimeText}>
              {runtime?.resolvedModel
                ? tr(
                    `已确认模型：${runtime.resolvedModel}`,
                    `Confirmed model: ${runtime.resolvedModel}`,
                  )
                : runtime?.requestedModel
                  ? tr(
                      `请求模型：${runtime.requestedModel} · 运行时未返回`,
                      `Requested: ${runtime.requestedModel} · runtime did not report`,
                    )
                  : tr("运行时未返回模型", "Runtime did not report model")}
            </Text>
          ) : null}
          <View style={styles.messageFooter}>
            {!user && !status ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={tr("模型信息", "Model info")}
                onPress={() => setShowModelInfo((current) => !current)}
              >
                <Text style={styles.copyText}>{tr("模型信息", "Model info")}</Text>
              </Pressable>
            ) : null}
            {message.content ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={tr("复制消息", "Copy message")}
                onPress={() =>
                  void Clipboard.setStringAsync(message.content).catch(() => undefined)
                }
              >
                <Text style={styles.copyText}>{tr("复制", "Copy")}</Text>
              </Pressable>
            ) : null}
            <Text style={styles.timestamp}>
              {new Date(message.createdAt).toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  messageRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginVertical: 8 },
  userRow: { justifyContent: "flex-end" },
  senderAvatar: {
    width: 32,
    height: 32,
    flexShrink: 0,
    borderRadius: 10,
    marginTop: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  senderInitial: { color: theme.shadow, fontFamily: Fonts.sansSemiBold, fontSize: 14 },
  messageContent: { maxWidth: "84%", flexShrink: 1, alignItems: "flex-start" },
  senderName: {
    color: theme.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 4,
    maxWidth: "100%",
  },
  bubble: { borderRadius: 15, paddingHorizontal: 12, paddingVertical: 8, maxWidth: "100%" },
  userBubble: { backgroundColor: theme.botUserBubbleBackground, borderBottomRightRadius: 5 },
  botBubble: { backgroundColor: theme.backgroundElement, borderTopLeftRadius: 5, minWidth: 80 },
  statusBubble: { backgroundColor: theme.backgroundElement, borderBottomLeftRadius: 5 },
  messageText: { color: theme.botActionForeground, fontSize: 15, lineHeight: 21 },
  statusText: { color: theme.textSecondary, fontSize: 13 },
  messageFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 9,
    marginTop: 4,
  },
  timestamp: { color: theme.textSecondary, fontSize: 10 },
  copyText: { color: theme.accent, fontSize: 10 },
  runtimeText: { color: theme.textSecondary, fontSize: 10, marginTop: 5 },
  running: { alignItems: "center", flexDirection: "row", gap: 7, paddingVertical: 4 },
  runningText: { color: theme.textSecondary, fontSize: 13 },
  failedText: { color: theme.danger, fontSize: 12, marginTop: 5 },
  activityRow: { marginLeft: 40 },
  sourceHighlight: { backgroundColor: theme.accentBorder, borderRadius: 12 },
}));
