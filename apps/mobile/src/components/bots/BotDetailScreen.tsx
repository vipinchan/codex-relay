import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Bot } from "codex-relay/api-schema";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, ScrollView, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { Text } from "@/components/ui/text";
import { Fonts } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
  createBotConversation,
  deleteBot,
  getCodexRelayServerUrl,
  listBotConversations,
  listBots,
} from "@/lib/codex-relay-api";

import { BotAvatar, BotPage, BotPrimaryButton, BotRow, botError, botText } from "./bot-ui";

const runtimeLabel = (mode: Bot["runtimeMode"]) =>
  ({
    default: botText("默认", "Default"),
    "on-request": botText("按需批准", "Ask when needed"),
    auto: botText("自动", "Automatic"),
    "full-access": botText("完整访问", "Full access"),
  })[mode];

export function BotDetailScreen({ botId }: { botId: string }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const serverUrl = getCodexRelayServerUrl();
  const botsQuery = useQuery({ queryKey: ["bots", serverUrl], queryFn: listBots });
  const [busy, setBusy] = useState(false);
  const bot = botsQuery.data?.find((item) => item.id === botId);

  async function openChat() {
    if (!bot || busy) return;
    setBusy(true);
    try {
      const conversations = await queryClient.fetchQuery({
        queryKey: ["bot-conversations", serverUrl],
        queryFn: listBotConversations,
        staleTime: 0,
      });
      const existing = conversations.find(
        (item) => item.kind === "direct" && item.botId === bot.id,
      );
      const conversation =
        existing ?? (await createBotConversation({ kind: "direct", botId: bot.id }));
      await queryClient.invalidateQueries({ queryKey: ["bot-conversations", serverUrl] });
      router.push({
        pathname: "/bot-chat/[conversationId]",
        params: { conversationId: conversation.id },
      });
    } catch (error) {
      Alert.alert(botText("无法打开私聊", "Could not open chat"), botError(error));
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    if (!bot || busy) return;
    Alert.alert(
      botText("删除 BOT", "Delete BOT"),
      botText(
        "BOT 将从列表移除，历史记录仍由 Relay 保留。",
        "The BOT leaves the list. Relay retains its history.",
      ),
      [
        { text: botText("取消", "Cancel"), style: "cancel" },
        {
          text: botText("删除", "Delete"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              setBusy(true);
              try {
                await deleteBot(bot.id);
                await queryClient.invalidateQueries({ queryKey: ["bots", serverUrl] });
                router.back();
              } catch (error) {
                Alert.alert(botText("删除失败", "Could not delete BOT"), botError(error));
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ],
    );
  }

  return (
    <BotPage title={bot?.name ?? "BOT"}>
      {botsQuery.isLoading ? <ActivityIndicator color={theme.powerBlue} /> : null}
      {botsQuery.error ? <Text style={styles.error}>{botError(botsQuery.error)}</Text> : null}
      {!botsQuery.isLoading && !bot ? (
        <Text style={[styles.empty, { color: theme.textSecondary }]}>
          {botText("BOT 不存在或已删除", "BOT is unavailable")}
        </Text>
      ) : null}
      {bot ? (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.hero}>
            <BotAvatar bot={bot} size={76} />
            <Text style={[styles.name, { color: theme.text }]}>{bot.name}</Text>
            <Text style={[styles.intro, { color: theme.textSecondary }]}>
              {bot.instructions || botText("尚未设置角色说明", "No role instructions yet")}
            </Text>
          </View>
          <BotPrimaryButton
            label={busy ? botText("打开中…", "Opening…") : botText("开始聊天", "Start chat")}
            disabled={busy}
            onPress={() => void openChat()}
          />
          <Text style={[styles.section, { color: theme.textSecondaryStrong }]}>
            {botText("配置", "Configuration")}
          </Text>
          <View style={[styles.infoCard, { backgroundColor: theme.backgroundElement }]}>
            <Info
              label={botText("模型", "Model")}
              value={bot.model ?? botText("跟随默认模型", "Use default model")}
            />
            <Info
              label={botText("推理强度", "Reasoning")}
              value={bot.reasoningEffort ?? botText("默认", "Default")}
            />
            <Info
              label={botText("回复速度", "Speed")}
              value={bot.serviceTier ?? botText("标准", "Standard")}
            />
            <Info
              label={botText("运行权限", "Runtime access")}
              value={runtimeLabel(bot.runtimeMode)}
              last
            />
          </View>
          <Text style={[styles.section, { color: theme.textSecondaryStrong }]}>
            {botText("管理", "Manage")}
          </Text>
          <BotRow
            title={botText("编辑 BOT", "Edit BOT")}
            onPress={() => router.push({ pathname: "/bot/[botId]/edit", params: { botId } })}
          />
          <BotRow
            title={botText("记忆", "Memory")}
            subtitle={botText("查看、编辑和追溯来源", "Review, edit, and trace sources")}
            onPress={() => router.push({ pathname: "/bot/[botId]/memory", params: { botId } })}
          />
          <BotRow
            title={botText("历史", "History")}
            subtitle={botText("搜索可访问的私聊与群聊", "Search accessible chats and groups")}
            onPress={() => router.push({ pathname: "/bot/[botId]/history", params: { botId } })}
          />
          <Text onPress={confirmDelete} style={styles.delete}>
            {botText("删除 BOT", "Delete BOT")}
          </Text>
        </ScrollView>
      ) : null}
    </BotPage>
  );
}

function Info({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.infoRow,
        last
          ? null
          : {
              borderBottomColor: theme.backgroundSelected,
              borderBottomWidth: StyleSheet.hairlineWidth,
            },
      ]}
    >
      <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>{label}</Text>
      <Text numberOfLines={2} style={[styles.infoValue, { color: theme.text }]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 40, gap: 8 },
  hero: { alignItems: "center", paddingTop: 30, paddingBottom: 22, gap: 10 },
  name: { fontFamily: Fonts.sansBold, fontSize: 27 },
  intro: { textAlign: "center", fontSize: 13, lineHeight: 19, maxWidth: 320 },
  section: { fontFamily: Fonts.sansSemiBold, fontSize: 13, marginTop: 24, marginBottom: 3 },
  infoCard: { borderRadius: 14, paddingHorizontal: 14 },
  infoRow: {
    minHeight: 47,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  infoLabel: { fontSize: 13 },
  infoValue: { fontFamily: Fonts.sansMedium, fontSize: 13, textAlign: "right", flex: 1 },
  delete: { color: "#FF8DA5", fontSize: 14, alignSelf: "center", marginTop: 30, padding: 12 },
  error: { color: "#FF8DA5", padding: 20 },
  empty: { padding: 20 },
});
