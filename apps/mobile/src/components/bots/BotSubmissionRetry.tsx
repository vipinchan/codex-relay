import { Alert, Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { Text } from "@/components/ui/text";

import type { BotSubmission } from "./bot-direct-compose";
import { botText } from "./bot-ui";

export function BotSubmissionRetry({
  pending,
  error,
  sending,
  onRetry,
  onDiscard,
}: {
  pending?: BotSubmission;
  error: string;
  sending: boolean;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  if (!error || !pending) return null;
  return (
    <View style={styles.retryBar}>
      <View style={styles.retryCopy}>
        <Text style={styles.error}>{error}</Text>
        <Text numberOfLines={2} style={styles.hint}>
          {botText("原消息：", "Original message: ")}
          {pending.text || botText("图片消息", "Image message")}
          {pending.attachments.length
            ? ` · ${pending.attachments.length} ${botText("张图片", "image(s)")}`
            : ""}
        </Text>
        <Text style={styles.hint}>
          {pending.mentionBotIds?.length
            ? botText(
                "重试沿用原消息、图片和 BOT 选择；修改后的草稿会保留。",
                "Retry keeps the original message, images, and BOT selection. Changes to your draft are kept.",
              )
            : botText(
                "重试会发送原消息；修改后的草稿会保留。",
                "Retry sends the original message. Changes to your draft are kept.",
              )}
        </Text>
      </View>
      <Pressable accessibilityRole="button" disabled={sending} onPress={onRetry}>
        <Text style={styles.action}>{botText("重试原消息", "Retry original")}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        disabled={sending}
        onPress={() =>
          Alert.alert(
            botText("放弃重试？", "Discard retry?"),
            botText(
              "消息可能已送达，请先检查聊天记录。草稿和图片会保留。",
              "The message may have arrived. Check the chat first. Your draft and images will remain.",
            ),
            [
              { text: botText("取消", "Cancel"), style: "cancel" },
              { text: botText("放弃", "Discard"), onPress: onDiscard },
            ],
          )
        }
      >
        <Text style={styles.action}>{botText("放弃", "Discard")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  retryBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 12,
    backgroundColor: "#2E1D23",
  },
  error: { color: "#FFB3C1", fontSize: 12 },
  retryCopy: { flex: 1, gap: 5 },
  action: { color: "#6EA8FF", fontSize: 13 },
  hint: { color: "#929AA8", fontSize: 11 },
});
