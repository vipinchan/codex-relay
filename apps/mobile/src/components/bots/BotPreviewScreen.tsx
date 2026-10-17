import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { FileWorkspacePreviewTab } from "@/components/chat/workspace-preview/FileWorkspacePreviewTab";
import { MarkdownWorkspacePreviewTab } from "@/components/chat/workspace-preview/MarkdownWorkspacePreviewTab";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { Fonts } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
  getBotConversation,
  getBotConversationRuntime,
  getBotDefinition,
  getCodexRelayServerUrl,
  resetBotConversationContext,
  resetBotConversationPreferences,
  updateBot,
} from "@/lib/codex-relay-api";

import { BotPage, BotRow, botError, botText } from "./bot-ui";
import { botPreviewMarkdownPath } from "./bot-preview-path";

type PreviewTab = "definition" | "files" | "document";

export function BotPreviewScreen({
  conversationId,
  filePath,
}: {
  conversationId: string;
  filePath?: string;
}) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const serverUrl = getCodexRelayServerUrl();
  const [tab, setTab] = useState<PreviewTab>(filePath ? "document" : "definition");
  const [focused, setFocused] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [updatingDefaults, setUpdatingDefaults] = useState(false);
  const conversationQuery = useQuery({
    queryKey: ["bot-conversation", serverUrl, conversationId],
    queryFn: () => getBotConversation(conversationId),
    enabled: focused,
  });
  const conversation = conversationQuery.data;
  const botId = conversation?.kind === "direct" ? conversation.botId : null;
  const definitionQuery = useQuery({
    queryKey: ["bot-definition", serverUrl, botId],
    queryFn: () => getBotDefinition(botId!),
    enabled: !!botId && focused,
    refetchInterval: focused ? 4000 : false,
    refetchOnWindowFocus: true,
  });
  const runtimeQuery = useQuery({
    queryKey: ["bot-conversation-runtime", serverUrl, conversationId],
    queryFn: () => getBotConversationRuntime(conversationId),
    enabled: !!botId && focused,
    refetchInterval: focused ? 1500 : false,
  });
  const definition = definitionQuery.data;
  const runtime = runtimeQuery.data;
  const activeRevision = runtime?.active?.definitionRevision;
  const nextRevision = runtime?.next?.definitionRevision;
  const latestRevision = definition?.status === "valid" ? definition.revision : undefined;
  const canReset = runtime?.runtimeState === "idle" && !!runtime.threadId;
  const markdownPath = filePath
    ? botPreviewMarkdownPath(filePath, conversation?.workspacePath)
    : undefined;

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      void queryClient.invalidateQueries({
        queryKey: ["bot-conversation", serverUrl, conversationId],
      });
      if (botId) {
        void queryClient.invalidateQueries({ queryKey: ["bot-definition", serverUrl, botId] });
        void queryClient.invalidateQueries({
          queryKey: ["bot-conversation-runtime", serverUrl, conversationId],
        });
      }
      return () => setFocused(false);
    }, [botId, conversationId, queryClient, serverUrl]),
  );
  const hasSessionPreferences =
    !!conversation && Object.values(conversation.preferences).some((value) => value !== undefined);

  async function restoreBotDefaults() {
    if (!hasSessionPreferences || updatingDefaults) return;
    setUpdatingDefaults(true);
    try {
      await resetBotConversationPreferences(conversationId);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["bot-conversation", serverUrl, conversationId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["bot-conversation-runtime", serverUrl, conversationId],
        }),
      ]);
    } catch (error) {
      Alert.alert(botText("无法恢复默认设置", "Couldn’t restore defaults"), botError(error));
    } finally {
      setUpdatingDefaults(false);
    }
  }

  function promoteSessionPreferences() {
    if (!botId || !runtime || !latestRevision || !hasSessionPreferences || updatingDefaults) return;
    Alert.alert(
      botText("设为 BOT 默认配置", "Set as BOT defaults"),
      botText(
        "当前会话的模型与运行设置将成为这个 BOT 在其他私聊和群聊中的默认值。",
        "This conversation’s model and runtime settings will become defaults for this BOT in other chats and groups.",
      ),
      [
        { text: botText("取消", "Cancel"), style: "cancel" },
        {
          text: botText("设为默认", "Set defaults"),
          onPress: () => {
            setUpdatingDefaults(true);
            void (async () => {
              try {
                await updateBot(botId, {
                  model: runtime.next.requestedModel ?? null,
                  reasoningEffort: runtime.next.reasoningEffort ?? null,
                  serviceTier: runtime.next.serviceTier ?? null,
                  runtimeMode: runtime.next.runtimeMode ?? "default",
                  expectedRevision: latestRevision,
                });
              } catch (error) {
                Alert.alert(botText("无法设置默认值", "Couldn’t set defaults"), botError(error));
                return;
              }
              try {
                await resetBotConversationPreferences(conversationId);
              } catch (error) {
                Alert.alert(
                  botText("BOT 默认值已保存", "BOT defaults saved"),
                  `${botText("当前会话的临时设置仍在：", "This conversation still has temporary settings: ")}${botError(error)}`,
                );
              } finally {
                await Promise.all([
                  queryClient.invalidateQueries({ queryKey: ["bots", serverUrl] }),
                  queryClient.invalidateQueries({ queryKey: ["bot-definition", serverUrl, botId] }),
                  queryClient.invalidateQueries({
                    queryKey: ["bot-conversation", serverUrl, conversationId],
                  }),
                  queryClient.invalidateQueries({
                    queryKey: ["bot-conversation-runtime", serverUrl, conversationId],
                  }),
                ]);
              }
            })().finally(() => setUpdatingDefaults(false));
          },
        },
      ],
    );
  }

  async function resetContext() {
    if (!canReset || resetting) return;
    Alert.alert(
      botText("重新开始执行上下文", "Restart execution context"),
      botText(
        "将为这个 BOT 建立新的执行会话。聊天记录和记忆会保留。",
        "Start a new execution session for this BOT. Chat history and memories are kept.",
      ),
      [
        { text: botText("取消", "Cancel"), style: "cancel" },
        {
          text: botText("重新开始", "Restart"),
          onPress: () => {
            setResetting(true);
            void resetBotConversationContext(conversationId)
              .then(async () => {
                await queryClient.invalidateQueries({
                  queryKey: ["bot-conversation-runtime", serverUrl, conversationId],
                });
              })
              .catch((error) =>
                Alert.alert(botText("无法重新开始", "Couldn’t restart"), botError(error)),
              )
              .finally(() => setResetting(false));
          },
        },
      ],
    );
  }

  return (
    <BotPage title={botText("预览", "Preview")}>
      <View style={[styles.tabs, { borderColor: theme.backgroundSelected }]}>
        <TabButton
          label={botText("BOT 定义", "BOT definition")}
          selected={tab === "definition"}
          onPress={() => setTab("definition")}
        />
        <TabButton
          label={botText("工作区文件", "Workspace files")}
          selected={tab === "files"}
          onPress={() => setTab("files")}
        />
        {filePath ? (
          <TabButton
            label={botText("文档", "Document")}
            selected={tab === "document"}
            onPress={() => setTab("document")}
          />
        ) : null}
      </View>
      {conversationQuery.error ? (
        <Text style={styles.error}>{botError(conversationQuery.error)}</Text>
      ) : null}
      {tab === "document" ? (
        markdownPath ? (
          <MarkdownWorkspacePreviewTab
            target={{ path: markdownPath, workspacePath: conversation?.workspacePath }}
            workspacePath={conversation?.workspacePath}
          />
        ) : (
          <Text style={styles.error}>
            {conversation
              ? botText("文档路径不在当前工作区。", "Document is outside this workspace.")
              : botText("正在读取工作区…", "Loading workspace…")}
          </Text>
        )
      ) : tab === "files" ? (
        conversation?.workspacePath ? (
          <FileWorkspacePreviewTab workspacePath={conversation.workspacePath} />
        ) : (
          <Text style={styles.hint}>{botText("正在读取工作区…", "Loading workspace…")}</Text>
        )
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {definitionQuery.isLoading || runtimeQuery.isLoading ? (
            <ActivityIndicator color={theme.powerBlue} />
          ) : null}
          {!botId && conversation ? (
            <Text style={styles.hint}>
              {botText("群聊请打开具体 BOT 查看定义。", "Open a BOT to view its definition.")}
            </Text>
          ) : null}
          {definitionQuery.error ? (
            <Pressable onPress={() => void definitionQuery.refetch()}>
              <Text style={styles.error}>
                {botError(definitionQuery.error)} · {botText("点击重试", "Tap to retry")}
              </Text>
            </Pressable>
          ) : null}
          {definition && botId ? (
            <>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                  {definition.definition.name}
                </Text>
                <Text style={[styles.caption, { color: theme.textSecondary }]}>
                  {definition.path}
                </Text>
              </View>
              {definition.status === "invalid" ? (
                <Text style={styles.error}>
                  {botText("Mac 上的定义文件无效：", "Definition file on Mac is invalid: ")}
                  {definition.error}
                </Text>
              ) : null}
              <BotRow
                title={botText("表单编辑", "Edit BOT settings")}
                subtitle={botText(
                  "角色、模型和常用技能与插件",
                  "Role, model, preferred skills and plugins",
                )}
                onPress={() => router.push({ pathname: "/bot/[botId]/edit", params: { botId } })}
                leading={<Icon name="controls" size={20} tintColor={theme.powerBlue} />}
              />
              <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
                <View style={styles.cardHeading}>
                  <Text style={[styles.cardTitle, { color: theme.text }]}>
                    {botText("定义文件", "Definition file")}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      router.push({ pathname: "/bot/[botId]/definition", params: { botId } })
                    }
                  >
                    <Text style={[styles.link, { color: theme.powerBlue }]}>
                      {botText("编辑原文", "Edit source")}
                    </Text>
                  </Pressable>
                </View>
                <Text selectable style={[styles.source, { color: theme.text }]}>
                  {definition.content}
                </Text>
              </View>
              <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>
                  {botText("常用能力", "Preferred capabilities")}
                </Text>
                <Text style={[styles.body, { color: theme.textSecondary }]}>
                  {botText("技能", "Skills")}:{" "}
                  {definition.definition.preferredSkills.join(" · ") || "—"}
                </Text>
                <Text style={[styles.body, { color: theme.textSecondary }]}>
                  {botText("插件", "Plugins")}:{" "}
                  {definition.definition.preferredPlugins.join(" · ") || "—"}
                </Text>
                <Text style={[styles.caption, { color: theme.textSecondary }]}>
                  {botText(
                    "这里选择常用能力；安装在 Mac 上的共享能力仍可按需调用。",
                    "These are preferred capabilities. Shared capabilities on Mac remain available when needed.",
                  )}
                </Text>
              </View>
              <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>
                  {botText("当前生效配置", "Effective configuration")}
                </Text>
                {runtimeQuery.error ? (
                  <Pressable onPress={() => void runtimeQuery.refetch()}>
                    <Text style={styles.error}>{botError(runtimeQuery.error)}</Text>
                  </Pressable>
                ) : null}
                {runtime ? (
                  <>
                    <Text style={[styles.body, { color: theme.text }]}>
                      {runtime.runtimeState === "running"
                        ? botText("正在执行", "Running")
                        : runtime.runtimeState === "queued"
                          ? botText("等待执行", "Queued")
                          : botText("空闲", "Idle")}
                    </Text>
                    <Text style={[styles.body, { color: theme.textSecondary }]}>
                      {botText("最近执行模型", "Last run model")}:{" "}
                      {runtime.active?.resolvedModel ??
                        runtime.active?.requestedModel ??
                        botText("尚未执行", "No run yet")}
                    </Text>
                    <Text style={[styles.body, { color: theme.textSecondary }]}>
                      {botText("推理 / 档位 / 权限", "Effort / tier / access")}:{" "}
                      {[
                        runtime.active?.reasoningEffort,
                        runtime.active?.serviceTier,
                        runtime.active?.runtimeMode,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </Text>
                    <Text style={[styles.body, { color: theme.textSecondary }]}>
                      {botText("定义版本", "Definition revision")}:{" "}
                      {activeRevision?.slice(0, 12) ?? botText("尚未执行", "No run yet")}
                    </Text>
                    {runtime.active?.instructions ? (
                      <Text selectable style={[styles.body, { color: theme.textSecondary }]}>
                        {botText("实际角色", "Active role")}: {runtime.active.instructions}
                      </Text>
                    ) : null}
                    {runtime.active?.preferredSkills?.length ? (
                      <Text style={[styles.body, { color: theme.textSecondary }]}>
                        {botText("实际常用技能", "Active preferred skills")}:{" "}
                        {runtime.active.preferredSkills.join(" · ")}
                      </Text>
                    ) : null}
                    {runtime.active?.preferredPlugins?.length ? (
                      <Text style={[styles.body, { color: theme.textSecondary }]}>
                        {botText("实际常用插件", "Active preferred plugins")}:{" "}
                        {runtime.active.preferredPlugins.join(" · ")}
                      </Text>
                    ) : null}
                    {latestRevision && activeRevision && latestRevision !== activeRevision ? (
                      <Text style={[styles.notice, { color: theme.powerBlue }]}>
                        {botText(
                          "定义已更新，下次任务生效。",
                          "Definition updated; next task will use it.",
                        )}
                      </Text>
                    ) : null}
                    {definition?.status === "invalid" ? (
                      <Text style={[styles.error, { padding: 0 }]}>
                        {botText(
                          "Mac 定义文件无效，继续使用上一份有效配置。修复文件后新配置才会生效。",
                          "The Mac definition file is invalid. The last valid configuration remains in use until the file is fixed.",
                        )}
                      </Text>
                    ) : null}
                    {definition?.status === "valid" &&
                    nextRevision &&
                    nextRevision !== activeRevision ? (
                      <Text style={[styles.body, { color: theme.textSecondary }]}>
                        {botText("下次版本", "Next revision")}: {nextRevision.slice(0, 12)}
                      </Text>
                    ) : null}
                    <Text style={[styles.body, { color: theme.textSecondary }]}>
                      {botText("下次任务", "Next task")}:{" "}
                      {runtime.next.requestedModel ?? botText("默认模型", "Default model")}
                    </Text>
                    {hasSessionPreferences ? (
                      <>
                        <Pressable
                          accessibilityRole="button"
                          disabled={updatingDefaults}
                          onPress={() => void restoreBotDefaults()}
                          style={styles.resetButton}
                        >
                          <Text style={[styles.link, { color: theme.powerBlue }]}>
                            {botText("恢复 BOT 默认设置", "Restore BOT defaults")}
                          </Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{
                            disabled: updatingDefaults || definition?.status !== "valid",
                          }}
                          disabled={updatingDefaults || definition?.status !== "valid"}
                          onPress={promoteSessionPreferences}
                          style={styles.resetButton}
                        >
                          <Text
                            style={[
                              styles.link,
                              {
                                color: theme.powerBlue,
                                opacity: definition?.status === "valid" ? 1 : 0.5,
                              },
                            ]}
                          >
                            {botText(
                              "将当前设置设为 BOT 默认",
                              "Set current settings as BOT defaults",
                            )}
                          </Text>
                        </Pressable>
                      </>
                    ) : null}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ disabled: !canReset || resetting }}
                      disabled={!canReset || resetting}
                      onPress={() => void resetContext()}
                      style={styles.resetButton}
                    >
                      <Text
                        style={[
                          styles.link,
                          { color: theme.powerBlue, opacity: canReset ? 1 : 0.5 },
                        ]}
                      >
                        {botText("重新开始执行上下文", "Restart execution context")}
                      </Text>
                    </Pressable>
                    <Text style={[styles.caption, { color: theme.textSecondary }]}>
                      {botText(
                        "保留 BOT 身份、聊天记录和记忆。",
                        "Keeps BOT identity, chat history and memories.",
                      )}
                    </Text>
                  </>
                ) : null}
              </View>
            </>
          ) : null}
        </ScrollView>
      )}
    </BotPage>
  );
}

function TabButton({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.tab, { backgroundColor: selected ? theme.backgroundSelected : "transparent" }]}
    >
      <Text style={[styles.tabText, { color: selected ? theme.text : theme.textSecondary }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: "row",
    gap: 4,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 4,
    borderWidth: 1,
    borderRadius: 12,
  },
  tab: { flex: 1, alignItems: "center", borderRadius: 9, paddingVertical: 10 },
  tabText: { fontFamily: Fonts.sansSemiBold, fontSize: 13 },
  content: { gap: 14, paddingHorizontal: 16, paddingVertical: 18, paddingBottom: 48 },
  sectionHeader: { gap: 4, marginBottom: 2 },
  sectionTitle: { fontFamily: Fonts.sansBold, fontSize: 23 },
  caption: { fontSize: 12, lineHeight: 17 },
  card: { gap: 10, borderRadius: 14, padding: 14 },
  cardHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 16 },
  source: { fontFamily: Fonts.mono, fontSize: 11, lineHeight: 17 },
  body: { fontSize: 13, lineHeight: 19 },
  link: { fontFamily: Fonts.sansMedium, fontSize: 13 },
  notice: { fontFamily: Fonts.sansMedium, fontSize: 13 },
  resetButton: { alignSelf: "flex-start", paddingVertical: 8 },
  hint: { padding: 18, fontSize: 13, opacity: 0.7 },
  error: { color: "#FF8DA5", fontSize: 13, lineHeight: 19, padding: 16 },
});
