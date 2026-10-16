import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { BotMemory } from "codex-relay/api-schema";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, TextInput, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { Text } from "@/components/ui/text";
import { Fonts } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
  createBotMemory,
  deleteBotMemory,
  getCodexRelayServerUrl,
  listBotMemories,
  listBots,
  updateBotMemory,
} from "@/lib/codex-relay-api";

import { BotPage, BotPrimaryButton, botError, botText } from "./bot-ui";

export function BotMemoryScreen({ botId }: { botId: string }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const serverUrl = getCodexRelayServerUrl();
  const botsQuery = useQuery({ queryKey: ["bots", serverUrl], queryFn: listBots });
  const memoriesQuery = useQuery({
    queryKey: ["bot-memories", serverUrl, botId],
    queryFn: () => listBotMemories(botId),
  });
  const bot = botsQuery.data?.find((item) => item.id === botId);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<BotMemory>();
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(20);
  const matchingMemories = (memoriesQuery.data ?? []).filter((memory) =>
    memory.content.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );

  async function save() {
    const content = draft.trim();
    if (!content || busy) return;
    setBusy(true);
    try {
      if (editing) await updateBotMemory(botId, editing.id, content);
      else await createBotMemory(botId, content);
      await queryClient.invalidateQueries({ queryKey: ["bot-memories", serverUrl, botId] });
      setDraft("");
      setEditing(undefined);
    } catch (error) {
      Alert.alert(botText("保存记忆失败", "Could not save memory"), botError(error));
    } finally {
      setBusy(false);
    }
  }
  function remove(memory: BotMemory) {
    Alert.alert(botText("删除记忆", "Delete memory"), memory.content, [
      { text: botText("取消", "Cancel"), style: "cancel" },
      {
        text: botText("删除", "Delete"),
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await deleteBotMemory(botId, memory.id);
              await queryClient.invalidateQueries({ queryKey: ["bot-memories", serverUrl, botId] });
            } catch (error) {
              Alert.alert(botText("删除失败", "Could not delete memory"), botError(error));
            }
          })();
        },
      },
    ]);
  }
  function openSource(memory: BotMemory) {
    if (!memory.sourceConversationId || !memory.sourceMessageId) return;
    router.push({
      pathname: "/bot-chat/[conversationId]",
      params: { conversationId: memory.sourceConversationId, messageId: memory.sourceMessageId },
    });
  }

  return (
    <BotPage title={`${bot?.name ?? "BOT"} · ${botText("记忆", "Memory")}`}>
      <ScrollView
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.intro, { color: theme.textSecondary }]}>
          {botText(
            "记忆可以编辑或删除，原聊天记录会保留。",
            "Edit or delete memories. Source chats remain available.",
          )}
        </Text>
        <TextInput
          multiline
          value={draft}
          onChangeText={setDraft}
          placeholder={botText("添加明确的偏好、决策或约定", "Add a stated preference or decision")}
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text }]}
        />
        <BotPrimaryButton
          label={editing ? botText("保存修改", "Save change") : botText("添加记忆", "Add memory")}
          disabled={busy || !draft.trim()}
          onPress={() => void save()}
        />
        {editing ? (
          <Pressable
            onPress={() => {
              setEditing(undefined);
              setDraft("");
            }}
            style={styles.cancel}
          >
            <Text style={[styles.link, { color: theme.powerBlue }]}>
              {botText("取消编辑", "Cancel edit")}
            </Text>
          </Pressable>
        ) : null}
        <Text style={[styles.section, { color: theme.textSecondaryStrong }]}>
          {botText("所有记忆", "All memories")} {memoriesQuery.data?.length ?? ""}
        </Text>
        <TextInput
          value={search}
          onChangeText={(value) => {
            setSearch(value);
            setVisibleCount(20);
          }}
          placeholder={botText("搜索记忆", "Search memories")}
          placeholderTextColor={theme.textSecondary}
          style={[styles.search, { backgroundColor: theme.backgroundElement, color: theme.text }]}
        />
        {memoriesQuery.isLoading ? <ActivityIndicator color={theme.powerBlue} /> : null}
        {memoriesQuery.error ? (
          <Pressable onPress={() => void memoriesQuery.refetch()}>
            <Text style={styles.error}>
              {botError(memoriesQuery.error)} · {botText("点击重试", "Tap to retry")}
            </Text>
          </Pressable>
        ) : null}
        {matchingMemories.slice(0, visibleCount).map((memory) => (
          <View key={memory.id} style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
            <Text selectable style={[styles.memory, { color: theme.text }]}>
              {memory.content}
            </Text>
            {memory.sourceMessageContent ? (
              <View
                style={[
                  styles.quote,
                  { borderLeftColor: theme.powerBlue, backgroundColor: theme.backgroundSelected },
                ]}
              >
                <Text
                  numberOfLines={4}
                  style={[styles.quoteText, { color: theme.textSecondaryStrong }]}
                >
                  {memory.sourceMessageContent}
                </Text>
              </View>
            ) : null}
            {memory.sourceConversationId && memory.sourceMessageId ? (
              <Pressable
                accessibilityRole="link"
                onPress={() => openSource(memory)}
                style={styles.source}
              >
                <Text style={[styles.link, { color: theme.powerBlue }]}>
                  {botText("查看来源消息", "View source message")}
                </Text>
              </Pressable>
            ) : (
              <Text style={[styles.manual, { color: theme.textSecondary }]}>
                {memory.sourceMessageId
                  ? botText("来源聊天已不可用", "Source chat unavailable")
                  : botText("手动添加", "Added manually")}
              </Text>
            )}
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setEditing(memory);
                  setDraft(memory.content);
                }}
              >
                <Text style={[styles.link, { color: theme.powerBlue }]}>
                  {botText("编辑", "Edit")}
                </Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => remove(memory)}>
                <Text style={styles.delete}>{botText("删除", "Delete")}</Text>
              </Pressable>
            </View>
          </View>
        ))}
        {matchingMemories.length > visibleCount ? (
          <BotPrimaryButton
            label={botText("加载更多", "Load more")}
            onPress={() => setVisibleCount((count) => count + 20)}
          />
        ) : null}
        {search && !matchingMemories.length && !memoriesQuery.isLoading ? (
          <Text style={[styles.empty, { color: theme.textSecondary }]}>
            {botText("没有匹配的记忆", "No matching memories")}
          </Text>
        ) : null}
        {!memoriesQuery.isLoading && !memoriesQuery.data?.length ? (
          <Text style={[styles.empty, { color: theme.textSecondary }]}>
            {botText("暂无记忆", "No memories yet")}
          </Text>
        ) : null}
      </ScrollView>
    </BotPage>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 40, gap: 11 },
  intro: { fontSize: 13, lineHeight: 19, marginBottom: 5 },
  input: {
    minHeight: 98,
    borderRadius: 13,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    textAlignVertical: "top",
  },
  search: { minHeight: 44, borderRadius: 11, paddingHorizontal: 13, fontSize: 14 },
  cancel: { alignSelf: "center", padding: 7 },
  section: { fontFamily: Fonts.sansSemiBold, fontSize: 13, marginTop: 20 },
  card: { borderRadius: 13, padding: 14, gap: 11 },
  memory: { fontSize: 14, lineHeight: 21 },
  quote: { borderLeftWidth: 2, borderRadius: 5, paddingHorizontal: 11, paddingVertical: 9 },
  quoteText: { fontSize: 12, lineHeight: 18 },
  source: { alignSelf: "flex-start" },
  manual: { fontSize: 11 },
  actions: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#3A3A3C",
    paddingTop: 10,
    flexDirection: "row",
    gap: 24,
  },
  link: { fontFamily: Fonts.sansMedium, fontSize: 13 },
  delete: { color: "#FF8DA5", fontFamily: Fonts.sansMedium, fontSize: 13 },
  error: { color: "#FF8DA5", fontSize: 13 },
  empty: { textAlign: "center", paddingVertical: 24, fontSize: 13 },
});
