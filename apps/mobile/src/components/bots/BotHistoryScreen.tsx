import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { Fonts } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { getCodexRelayServerUrl, listBots, searchBotHistory } from "@/lib/codex-relay-api";

import { BotPage, BotPrimaryButton, botError, botText } from "./bot-ui";

export function BotHistoryScreen({ botId }: { botId: string }) {
  const theme = useTheme();
  const serverUrl = getCodexRelayServerUrl();
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const botsQuery = useQuery({ queryKey: ["bots", serverUrl], queryFn: listBots });
  const historyQuery = useInfiniteQuery({
    queryKey: ["bot-history", serverUrl, botId, query],
    queryFn: ({ pageParam }) => searchBotHistory(botId, query, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: !!query,
  });
  const bot = botsQuery.data?.find((item) => item.id === botId);
  const hits = historyQuery.data?.pages.flatMap((page) => page.hits) ?? [];

  return (
    <BotPage title={`${bot?.name ?? "BOT"} · ${botText("历史", "History")}`}>
      <ScrollView
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.intro, { color: theme.textSecondary }]}>
          {botText(
            "搜索此 BOT 可访问的私聊及群聊记录",
            "Search this BOT's accessible direct and group chats",
          )}
        </Text>
        <View style={[styles.search, { backgroundColor: theme.backgroundElement }]}>
          <Icon name="search" size={18} tintColor={theme.textSecondary} />
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={() => setQuery(draft.trim())}
            returnKeyType="search"
            placeholder={botText("输入关键词", "Enter keywords")}
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text }]}
          />
        </View>
        <BotPrimaryButton
          label={botText("搜索", "Search")}
          disabled={!draft.trim()}
          onPress={() => setQuery(draft.trim())}
        />
        {historyQuery.isPending && query ? <ActivityIndicator color={theme.powerBlue} /> : null}
        {historyQuery.error ? (
          <Pressable onPress={() => void historyQuery.refetch()}>
            <Text style={styles.error}>
              {botError(historyQuery.error)} · {botText("点击重试", "Tap to retry")}
            </Text>
          </Pressable>
        ) : null}
        {hits.map((hit) => (
          <Pressable
            key={hit.message.id}
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname: "/bot-chat/[conversationId]",
                params: { conversationId: hit.conversation.id, messageId: hit.message.id },
              })
            }
            style={[styles.hit, { backgroundColor: theme.backgroundElement }]}
          >
            <Text numberOfLines={1} style={[styles.title, { color: theme.powerBlue }]}>
              {hit.conversation.name}
            </Text>
            <Text numberOfLines={5} style={[styles.body, { color: theme.text }]}>
              {hit.message.content}
            </Text>
            <Text style={[styles.date, { color: theme.textSecondary }]}>
              {new Date(hit.message.createdAt).toLocaleString()}
            </Text>
          </Pressable>
        ))}
        {query && !historyQuery.isFetching && !historyQuery.error && !hits.length ? (
          <Text style={[styles.empty, { color: theme.textSecondary }]}>
            {botText("没有找到相关消息", "No matching messages")}
          </Text>
        ) : null}
        {historyQuery.hasNextPage ? (
          <BotPrimaryButton
            label={
              historyQuery.isFetchingNextPage
                ? botText("加载中…", "Loading…")
                : botText("加载更多", "Load more")
            }
            disabled={historyQuery.isFetchingNextPage}
            onPress={() => void historyQuery.fetchNextPage()}
          />
        ) : null}
      </ScrollView>
    </BotPage>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 40, gap: 11 },
  intro: { fontSize: 13, lineHeight: 19 },
  search: {
    borderRadius: 12,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 13,
  },
  input: { flex: 1, fontSize: 15, paddingVertical: 0 },
  hit: { borderRadius: 13, padding: 14, gap: 7 },
  title: { fontFamily: Fonts.sansSemiBold, fontSize: 12 },
  body: { fontSize: 14, lineHeight: 20 },
  date: { fontSize: 11 },
  empty: { textAlign: "center", paddingVertical: 24, fontSize: 13 },
  error: { color: "#FF8DA5", fontSize: 13 },
});
