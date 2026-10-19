import { useSelector } from "@legendapp/state/react";
import { useQuery } from "@tanstack/react-query";
import type { Bot, BotConversation } from "codex-relay/api-schema";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { ChatComposer } from "@/components/chat/ChatComposer";
import { modelForSelection } from "@/components/chat/model-picker-options";
import { AppBottomSheet, SheetActionRow, SheetSelectedDot } from "@/components/ui/bottom-sheet";
import { Text } from "@/components/ui/text";
import { getCodexRelayPairingIdentity } from "@/lib/codex-relay-api";
import { serverStateKeys, serverStateQueryFns } from "@/lib/server-state";
import {
  chatStore$,
  composerThreadKey,
  getComposerAttachments,
  getComposerDraft,
  setComposerDraft,
} from "@/state/chat-store";

import { mentionPayload, mentionQuery, removeMentionToken } from "./bot-compose";
import { botComposerKey } from "./bot-direct-compose";
import { botText } from "./bot-ui";
import { BotSubmissionRetry } from "./BotSubmissionRetry";
import { useBotSubmission } from "./use-bot-submission";

export function BotComposer({
  conversation,
  bots,
  hasRunning,
  onCancel,
  onSent,
}: {
  conversation: BotConversation;
  bots: Bot[];
  hasRunning: boolean;
  onCancel: () => void;
  onSent: () => Promise<void>;
}) {
  const composerId = botComposerKey(getCodexRelayPairingIdentity(), conversation.id);
  const composerKey = composerThreadKey(composerId);
  const draft = useSelector(() => chatStore$.composerDraftByThreadId[composerKey].get() ?? "");
  const [selectedMentions, setSelectedMentions] = useState<string[]>([]);
  const [mentionsOpen, setMentionsOpen] = useState(false);
  const members = conversation.botIds;
  const activeMentions = selectedMentions.filter((id) => members.includes(id));
  const defaultTargets = conversation.defaultBotId ? [conversation.defaultBotId] : [];
  const targets = mentionPayload(activeMentions, members) ?? defaultTargets;
  const botName = (id: string | null) => bots.find((bot) => bot.id === id)?.name ?? "BOT";
  const query = mentionQuery(draft);
  const matchingBots =
    query === null
      ? []
      : bots.filter(
          (bot) => members.includes(bot.id) && bot.name.toLocaleLowerCase().includes(query),
        );
  const modelsQuery = useQuery({
    queryKey: serverStateKeys.models(),
    queryFn: serverStateQueryFns.models,
  });
  const limitsQuery = useQuery({
    queryKey: serverStateKeys.rateLimits(),
    queryFn: serverStateQueryFns.rateLimits,
  });
  const supportsImages = targets.every((id) => {
    const bot = bots.find((item) => item.id === id);
    const model = modelForSelection(
      modelsQuery.data?.models ?? [],
      conversation.preferences.model ?? bot?.model,
    );
    return !model?.inputModalities || model.inputModalities.includes("image");
  });
  const { attaching, sending, pending, error, attachImages, send, discardPending } =
    useBotSubmission({
      composerId,
      conversationId: conversation.id,
      supportsImages,
      mentionBotIds: targets,
      onAccepted: (submitted) => {
        if (getComposerDraft(composerId) || getComposerAttachments(composerId).length) return;
        setSelectedMentions((current) => {
          const currentTargets = mentionPayload(current, members) ?? defaultTargets;
          return JSON.stringify(currentTargets) === JSON.stringify(submitted.mentionBotIds)
            ? []
            : current;
        });
      },
      onSent,
    });

  function toggleMention(id: string) {
    setSelectedMentions((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function selectMention(id: string) {
    setSelectedMentions((current) => (current.includes(id) ? current : [...current, id]));
    setComposerDraft(removeMentionToken(getComposerDraft(composerId)), composerId);
  }

  return (
    <View>
      <BotSubmissionRetry
        pending={pending}
        error={error}
        sending={sending}
        onRetry={() => void send(pending)}
        onDiscard={discardPending}
      />
      {activeMentions.length ? (
        <View style={styles.selectedRow}>
          {activeMentions.map((id) => (
            <Pressable
              key={id}
              accessibilityRole="button"
              accessibilityLabel={botText(`移除 ${botName(id)}`, `Remove ${botName(id)}`)}
              onPress={() => toggleMention(id)}
              style={styles.selectedChip}
            >
              <Text style={styles.selectedText}>@{botName(id)} ×</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {matchingBots.length ? (
        <ScrollView style={styles.suggestions} keyboardShouldPersistTaps="handled">
          {matchingBots.map((bot) => (
            <Pressable
              key={bot.id}
              accessibilityRole="button"
              accessibilityLabel={`@${bot.name}`}
              onPress={() => selectMention(bot.id)}
              style={styles.suggestion}
            >
              <View style={[styles.suggestionDot, { backgroundColor: bot.color }]} />
              <Text style={styles.suggestionText}>{bot.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      <ChatComposer
        composerThreadId={composerId}
        collaborationMode="default"
        placeholder={botText("发送消息…", "Message…")}
        enableFileMentions={false}
        disabled={sending || !!pending}
        inputEditable
        isAttachingImage={attaching}
        isRunning={hasRunning}
        footer={
          <View style={styles.routingRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={botText("选择 BOT", "Choose BOTs")}
              onPress={() => setMentionsOpen(true)}
              style={styles.mentionButton}
            >
              <Text style={styles.mentionButtonText}>@</Text>
            </Pressable>
            <Text numberOfLines={1} style={styles.routingHint}>
              {activeMentions.length
                ? botText("发送给：", "To: ") +
                  members
                    .filter((id) => activeMentions.includes(id))
                    .map(botName)
                    .join("、")
                : `${botText("默认回复：", "Default reply: ")}${botName(conversation.defaultBotId)}`}
            </Text>
          </View>
        }
        onAttachImage={attachImages}
        onCancel={onCancel}
        onSend={() => void send()}
        onRefreshUsageStatus={() => void limitsQuery.refetch()}
        queuedPrompts={[]}
        rateLimitBuckets={limitsQuery.data?.buckets ?? []}
        skills={[]}
        skillsLoadState="idle"
        workspacePath={conversation.workspacePath}
      />
      <AppBottomSheet
        title={botText("选择回复 BOT", "Choose responding BOTs")}
        subtitle={botText(
          "可多选；未选择时由默认 BOT 回复。",
          "Select multiple BOTs. Without a selection, the default BOT responds.",
        )}
        visible={mentionsOpen}
        onClose={() => setMentionsOpen(false)}
      >
        <SheetActionRow
          accessibilityLabel={botText("默认 BOT", "Default BOT")}
          icon="agentAtom"
          title={botText("默认 BOT", "Default BOT")}
          subtitle={botName(conversation.defaultBotId)}
          selected={!activeMentions.length}
          onPress={() => setSelectedMentions([])}
        />
        <SheetActionRow
          accessibilityLabel={botText("@所有 BOT", "Mention all BOTs")}
          icon="agentAtom"
          title={botText("@所有 BOT", "@all BOTs")}
          selected={activeMentions.length === members.length && !!members.length}
          onPress={() => setSelectedMentions([...members])}
        />
        {members.map((id) => (
          <SheetActionRow
            key={id}
            accessibilityLabel={`@${botName(id)}`}
            icon="agentAtom"
            title={`@${botName(id)}`}
            selected={activeMentions.includes(id)}
            trailing={<SheetSelectedDot selected={activeMentions.includes(id)} />}
            onPress={() => toggleMention(id)}
          />
        ))}
        <Pressable
          accessibilityRole="button"
          onPress={() => setMentionsOpen(false)}
          style={styles.primaryAction}
        >
          <Text style={styles.primaryText}>{botText("完成", "Done")}</Text>
        </Pressable>
      </AppBottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  selectedRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: 18,
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
  routingRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  mentionButton: { alignItems: "center", justifyContent: "center", width: 36, height: 32 },
  mentionButtonText: { color: "#6EA8FF", fontWeight: "700", fontSize: 24 },
  routingHint: { flex: 1, color: "#85858B", fontSize: 11 },
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
