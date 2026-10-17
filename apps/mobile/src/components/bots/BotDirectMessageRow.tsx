import type { BotMessage, ChatMessage } from "codex-relay/api-schema";
import { ActivityIndicator, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { MessageBubble } from "@/components/chat/MessageBubble";
import type { WorkspaceMarkdownPreviewTarget } from "@/components/chat/workspace-preview/markdown-target";
import { Text } from "@/components/ui/text";

import { botText } from "./bot-ui";

export function BotDirectMessageRow({
  message,
  isSource,
  isActiveReply,
  onOpenMarkdownAttachment,
}: {
  message: BotMessage;
  isSource: boolean;
  isActiveReply: boolean;
  onOpenMarkdownAttachment: (target: WorkspaceMarkdownPreviewTarget) => void;
}) {
  const chatMessage: ChatMessage = message.activity ?? {
    id: message.id,
    threadId: message.conversationId,
    role: message.sender === "bot" ? "assistant" : message.sender,
    kind: "chat",
    content: message.content,
    details: message.attachments?.length ? { attachments: message.attachments } : undefined,
    state:
      message.status === "running"
        ? "streaming"
        : message.status === "failed"
          ? "failed"
          : "completed",
    createdAt: message.createdAt,
  };
  return (
    <View style={isSource ? styles.source : undefined}>
      {message.status === "running" ? (
        <View style={styles.progress}>
          {isActiveReply ? <ActivityIndicator size="small" color="#6EA8FF" /> : null}
          <Text style={styles.hint}>
            {isActiveReply ? botText("正在回复…", "Responding…") : botText("等待回复…", "Queued…")}
          </Text>
        </View>
      ) : null}
      {message.activity || message.content || message.attachments?.length ? (
        <MessageBubble message={chatMessage} onOpenMarkdownAttachment={onOpenMarkdownAttachment} />
      ) : null}
      {message.status === "interrupted" ? (
        <Text style={styles.hint}>{botText("回复已停止", "Reply stopped")}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  source: { backgroundColor: "rgba(110, 168, 255, 0.17)", borderRadius: 12 },
  progress: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12 },
  hint: { color: "#929AA8", fontSize: 12 },
});
