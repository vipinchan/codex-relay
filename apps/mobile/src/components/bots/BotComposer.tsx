import type { Bot, BotConversation } from "codex-relay/api-schema";
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

const accent = "#6EA8FF";
const zh = (Intl.DateTimeFormat().resolvedOptions().locale || "en").toLowerCase().startsWith("zh");
const tr = (cn: string, en: string) => (zh ? cn : en);

export function BotComposer({
  conversation,
  bots,
  draft,
  selectedMentions,
  matchingBots,
  mentionOpen,
  sending,
  hasPending,
  onDraftChange,
  onToggleMention,
  onSelectMention,
  onOpenMentions,
  onSend,
}: {
  conversation?: BotConversation;
  bots: Bot[];
  draft: string;
  selectedMentions: string[];
  matchingBots: Bot[];
  mentionOpen: boolean;
  sending: boolean;
  hasPending: boolean;
  onDraftChange: (text: string) => void;
  onToggleMention: (id: string) => void;
  onSelectMention: (id: string) => void;
  onOpenMentions: () => void;
  onSend: () => void;
}) {
  const members = conversation?.botIds ?? [];
  const activeMentions = selectedMentions.filter((id) => members.includes(id));
  const botName = (id: string | null) => bots.find((bot) => bot.id === id)?.name ?? "BOT";
  const disabled = !conversation || !draft.trim() || sending || hasPending;
  return (
    <>
      {conversation?.kind === "group" && activeMentions.length ? (
        <View style={styles.selectedRow}>
          {activeMentions.map((id) => (
            <Pressable
              key={id}
              accessibilityRole="button"
              accessibilityLabel={tr(`移除 ${botName(id)}`, `Remove ${botName(id)}`)}
              onPress={() => onToggleMention(id)}
              style={styles.selectedChip}
            >
              <Text style={styles.selectedText}>@{botName(id)} ×</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {conversation?.kind === "group" && mentionOpen && matchingBots.length ? (
        <ScrollView style={styles.suggestions} keyboardShouldPersistTaps="handled">
          {matchingBots.map((bot) => (
            <Pressable
              key={bot.id}
              accessibilityRole="button"
              onPress={() => onSelectMention(bot.id)}
              style={styles.suggestion}
            >
              <View style={[styles.suggestionDot, { backgroundColor: bot.color }]} />
              <Text style={styles.suggestionText}>{bot.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      <View style={styles.composer}>
        {conversation?.kind === "group" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr("选择 BOT", "Choose BOTs")}
            onPress={onOpenMentions}
            style={styles.mentionButton}
          >
            <Text style={styles.mentionButtonText}>@</Text>
          </Pressable>
        ) : null}
        <TextInput
          value={draft}
          onChangeText={onDraftChange}
          multiline
          placeholder={tr("发送消息…", "Message…")}
          placeholderTextColor="#73737A"
          style={styles.composerInput}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr("发送", "Send")}
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={onSend}
          style={[styles.sendButton, disabled ? styles.disabled : null]}
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
          {activeMentions.length
            ? tr("发送给：", "To: ") +
              members
                .filter((id) => selectedMentions.includes(id))
                .map(botName)
                .join("、")
            : `${tr("默认回复：", "Default reply: ")}${botName(conversation.defaultBotId)}`}
        </Text>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  selectedRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: 13,
    paddingTop: 6,
  },
  selectedChip: {
    backgroundColor: "#253148",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  selectedText: { color: "#A9C9FF", fontSize: 12 },
  suggestions: {
    backgroundColor: "#1E2026",
    borderTopColor: "#32343A",
    borderTopWidth: 1,
    maxHeight: 166,
  },
  suggestion: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    minHeight: 42,
    paddingHorizontal: 17,
  },
  suggestionDot: { height: 18, width: 18, borderRadius: 7 },
  suggestionText: { color: "#F1F1F3", fontSize: 14 },
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
});
