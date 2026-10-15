import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Bot, BotMemory } from "codex-relay/api-schema";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, ActivityIndicator, Pressable, ScrollView, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";

import {
  AppBottomSheet,
  AppBottomSheetTextInput,
  SheetActionRow,
  SheetSelectedDot,
} from "@/components/ui/bottom-sheet";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
  createBot,
  createBotConversation,
  createBotMemory,
  deleteBot,
  deleteBotMemory,
  getCodexRelayServerUrl,
  hasCodexRelaySession,
  listBotConversations,
  listBotMemories,
  listBots,
  listThreads,
  searchBotHistory,
  updateBot,
  updateBotMemory,
} from "@/lib/codex-relay-api";

const accent = "#6EA8FF";
const palette = ["#6EA8FF", "#72DDD5", "#A49CFF", "#FF8DA5", "#78D9A5", "#F3BF72"];
const zh = (Intl.DateTimeFormat().resolvedOptions().locale || "en").toLowerCase().startsWith("zh");
const tr = (cn: string, en: string) => (zh ? cn : en);
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : tr("操作失败，请重试", "Operation failed. Try again.");
const isUnsupportedRelay = (error: unknown) =>
  typeof error === "object" && error !== null && "status" in error && error.status === 404;

type Sheet = "bot" | "group" | "memory" | "history" | undefined;

export function BotsHome() {
  const queryClient = useQueryClient();
  const [serverUrl, setServerUrl] = useState(getCodexRelayServerUrl());
  const [sheet, setSheet] = useState<Sheet>();
  const [activeBot, setActiveBot] = useState<Bot>();
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(palette[0]);
  const [instructions, setInstructions] = useState("");
  const [model, setModel] = useState("");
  const [reasoningEffort, setReasoningEffort] = useState("");
  const [serviceTier, setServiceTier] = useState("");
  const [runtimeMode, setRuntimeMode] = useState<Bot["runtimeMode"]>("default");
  const [groupName, setGroupName] = useState("");
  const [workspacePath, setWorkspacePath] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [defaultBotId, setDefaultBotId] = useState("");
  const [memoryDraft, setMemoryDraft] = useState("");
  const [editingMemory, setEditingMemory] = useState<BotMemory>();
  const [searchDraft, setSearchDraft] = useState("");
  const [searchText, setSearchText] = useState("");
  const [searchCursor, setSearchCursor] = useState<string>();
  const [searchHits, setSearchHits] = useState<
    Awaited<ReturnType<typeof searchBotHistory>>["hits"]
  >([]);
  const searchGenerationRef = useRef(0);
  const [expandedSourceIds, setExpandedSourceIds] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [paired, setPaired] = useState(hasCodexRelaySession());

  useFocusEffect(
    useCallback(() => {
      setPaired(hasCodexRelaySession());
      setServerUrl(getCodexRelayServerUrl());
    }, []),
  );
  const botsQuery = useQuery({ queryKey: ["bots", serverUrl], queryFn: listBots, enabled: paired });
  const conversationsQuery = useQuery({
    queryKey: ["bot-conversations", serverUrl],
    queryFn: listBotConversations,
    enabled: paired,
  });
  const threadsQuery = useQuery({
    queryKey: ["bot-workspaces", serverUrl],
    queryFn: listThreads,
    enabled: paired,
  });
  const memoriesQuery = useQuery({
    queryKey: ["bot-memories", serverUrl, activeBot?.id],
    queryFn: () => listBotMemories(activeBot!.id),
    enabled: sheet === "memory" && !!activeBot,
  });
  const historyQuery = useQuery({
    queryKey: ["bot-history", serverUrl, activeBot?.id, searchText],
    queryFn: () => searchBotHistory(activeBot!.id, searchText),
    enabled: sheet === "history" && !!activeBot && !!searchText.trim(),
  });

  useEffect(() => {
    if (historyQuery.data) {
      setSearchHits(historyQuery.data.hits);
      setSearchCursor(historyQuery.data.nextCursor ?? undefined);
    }
  }, [historyQuery.data]);

  const bots = botsQuery.data ?? [];
  const conversations = conversationsQuery.data ?? [];
  const workspaces = [
    ...new Set(
      (threadsQuery.data?.threads ?? [])
        .map((thread) => thread.cwd)
        .filter((cwd): cwd is string => !!cwd),
    ),
  ].slice(0, 8);

  function invalidateLists() {
    void queryClient.invalidateQueries({ queryKey: ["bots", serverUrl] });
    void queryClient.invalidateQueries({ queryKey: ["bot-conversations", serverUrl] });
  }

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } catch (error) {
      Alert.alert(tr("操作失败", "Unable to complete"), errorText(error));
    } finally {
      setBusy(false);
    }
  }

  function openBotEditor(bot?: Bot) {
    setActiveBot(bot);
    setName(bot?.name ?? "");
    setColor(bot?.color ?? palette[0]);
    setInstructions(bot?.instructions ?? "");
    setModel(bot?.model ?? "");
    setReasoningEffort(bot?.reasoningEffort ?? "");
    setServiceTier(bot?.serviceTier ?? "");
    setRuntimeMode(bot?.runtimeMode ?? "default");
    setSheet("bot");
  }

  function openGroupEditor() {
    setGroupName("");
    setWorkspacePath(workspaces[0] ?? "");
    setMemberIds([]);
    setDefaultBotId("");
    setSheet("group");
  }

  async function saveBot() {
    const trimmedName = name.trim();
    if (!trimmedName) return Alert.alert(tr("请输入 BOT 名称", "Enter a BOT name"));
    await run(async () => {
      const draft = {
        name: trimmedName,
        color,
        instructions: instructions.trim(),
        ...(model.trim() ? { model: model.trim() } : {}),
        ...(reasoningEffort.trim() ? { reasoningEffort: reasoningEffort.trim() } : {}),
        ...(serviceTier.trim() ? { serviceTier: serviceTier.trim() } : {}),
        runtimeMode,
      };
      if (activeBot) await updateBot(activeBot.id, draft);
      else await createBot(draft);
      invalidateLists();
      setSheet(undefined);
    });
  }

  function confirmDeleteBot() {
    if (!activeBot) return;
    Alert.alert(
      tr("删除 BOT", "Delete BOT"),
      tr(
        "BOT 将从列表移除。历史记录仍由 Relay 保留。",
        "The BOT will leave the list. Relay retains its history.",
      ),
      [
        { text: tr("取消", "Cancel"), style: "cancel" },
        {
          text: tr("删除", "Delete"),
          style: "destructive",
          onPress: () =>
            void run(async () => {
              await deleteBot(activeBot.id);
              invalidateLists();
              setSheet(undefined);
            }),
        },
      ],
    );
  }

  async function openDirect(bot: Bot) {
    await run(async () => {
      const existing = conversations.find(
        (item) => item.kind === "direct" && item.botId === bot.id,
      );
      const conversation =
        existing ?? (await createBotConversation({ kind: "direct", botId: bot.id }));
      invalidateLists();
      setSheet(undefined);
      router.push({
        pathname: "/bot-chat/[conversationId]",
        params: { conversationId: conversation.id },
      });
    });
  }

  async function saveGroup() {
    const trimmedName = groupName.trim();
    const trimmedWorkspace = workspacePath.trim();
    if (!trimmedName || !trimmedWorkspace || !memberIds.length || !defaultBotId) {
      return Alert.alert(
        tr(
          "请填写群名、目录并选择成员与默认 BOT",
          "Enter a group name and directory, then select members and a default BOT.",
        ),
      );
    }
    await run(async () => {
      const group = await createBotConversation({
        kind: "group",
        name: trimmedName,
        workspacePath: trimmedWorkspace,
        botIds: memberIds,
        defaultBotId,
      });
      invalidateLists();
      setSheet(undefined);
      router.push({ pathname: "/bot-chat/[conversationId]", params: { conversationId: group.id } });
    });
  }

  function toggleMember(botId: string) {
    if (memberIds.includes(botId)) {
      const next = memberIds.filter((id) => id !== botId);
      setMemberIds(next);
      if (defaultBotId === botId) setDefaultBotId(next[0] ?? "");
    } else {
      setMemberIds([...memberIds, botId]);
      if (!defaultBotId) setDefaultBotId(botId);
    }
  }

  function openMemories(bot: Bot) {
    setActiveBot(bot);
    setMemoryDraft("");
    setEditingMemory(undefined);
    setSheet("memory");
  }

  async function saveMemory() {
    const content = memoryDraft.trim();
    if (!activeBot || !content) return;
    await run(async () => {
      if (editingMemory) await updateBotMemory(activeBot.id, editingMemory.id, content);
      else await createBotMemory(activeBot.id, content);
      await queryClient.invalidateQueries({ queryKey: ["bot-memories", serverUrl, activeBot.id] });
      setEditingMemory(undefined);
      setMemoryDraft("");
    });
  }

  function removeMemory(memory: BotMemory) {
    if (!activeBot) return;
    Alert.alert(tr("删除记忆", "Delete memory"), memory.content, [
      { text: tr("取消", "Cancel"), style: "cancel" },
      {
        text: tr("删除", "Delete"),
        style: "destructive",
        onPress: () =>
          void run(async () => {
            await deleteBotMemory(activeBot.id, memory.id);
            await queryClient.invalidateQueries({
              queryKey: ["bot-memories", serverUrl, activeBot.id],
            });
          }),
      },
    ]);
  }

  function openHistory(bot: Bot) {
    searchGenerationRef.current += 1;
    setActiveBot(bot);
    setSearchDraft("");
    setSearchText("");
    setSearchHits([]);
    setSearchCursor(undefined);
    setSheet("history");
  }

  function startSearch() {
    const query = searchDraft.trim();
    if (!query) return;
    if (query === searchText) {
      void historyQuery.refetch();
      return;
    }
    searchGenerationRef.current += 1;
    setSearchHits([]);
    setSearchCursor(undefined);
    setSearchText(query);
  }

  async function loadMoreHistory() {
    if (!activeBot || !searchCursor || busy || historyQuery.isFetching || historyQuery.error)
      return;
    const generation = searchGenerationRef.current;
    const botId = activeBot.id;
    const query = searchText;
    const cursor = searchCursor;
    await run(async () => {
      const page = await searchBotHistory(botId, query, cursor);
      if (searchGenerationRef.current !== generation) return;
      setSearchHits((current) => [
        ...current,
        ...page.hits.filter((hit) => !current.some((item) => item.message.id === hit.message.id)),
      ]);
      setSearchCursor(page.nextCursor ?? undefined);
    });
  }

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.heading}>BOT</Text>
          <Text style={styles.subheading}>
            {tr("你的专属助手与群聊", "Your assistants and groups")}
          </Text>
        </View>
        <Pressable
          accessibilityLabel={tr("新建 BOT", "Create BOT")}
          onPress={() => openBotEditor()}
          style={styles.headerAction}
        >
          <Icon name="newThread" size={23} tintColor={accent} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!paired ? (
          <Text style={styles.empty}>
            {tr("连接 Mac Relay 后可使用 BOT", "Connect to Mac Relay to use BOTs")}
          </Text>
        ) : null}
        {botsQuery.isLoading ? <ActivityIndicator color={accent} /> : null}
        {botsQuery.error ? (
          <View style={styles.connectionIssue}>
            <Text style={styles.error}>
              {isUnsupportedRelay(botsQuery.error)
                ? tr("电脑端 Relay 需要更新后才能使用 BOT", "Update the Mac Relay to use BOTs")
                : errorText(botsQuery.error)}
            </Text>
            <SmallAction
              label={tr("重试", "Retry")}
              onPress={() => {
                void botsQuery.refetch();
                void conversationsQuery.refetch();
              }}
            />
          </View>
        ) : null}
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>{tr("我的 BOT", "My BOTs")}</Text>
          <Text style={styles.count}>{bots.length}</Text>
        </View>
        {bots.length ? (
          bots.map((bot) => (
            <View key={bot.id} style={styles.card}>
              <Pressable
                accessibilityRole="button"
                onPress={() => void openDirect(bot)}
                style={styles.botMain}
              >
                <View style={[styles.avatar, { backgroundColor: bot.color + "2B" }]}>
                  <Text style={[styles.avatarText, { color: bot.color }]}>
                    {bot.name.slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.botCopy}>
                  <Text numberOfLines={1} style={styles.cardTitle}>
                    {bot.name}
                  </Text>
                  <Text numberOfLines={2} style={styles.cardSubtitle}>
                    {bot.instructions || tr("点击开始私聊", "Tap to start a private chat")}
                  </Text>
                </View>
                <Icon name="chevronRight" size={17} tintColor="#757580" />
              </Pressable>
              <View style={styles.cardActions}>
                <SmallAction label={tr("编辑", "Edit")} onPress={() => openBotEditor(bot)} />
                <SmallAction label={tr("记忆", "Memory")} onPress={() => openMemories(bot)} />
                <SmallAction label={tr("历史", "History")} onPress={() => openHistory(bot)} />
              </View>
            </View>
          ))
        ) : (
          <Text style={styles.empty}>
            {tr("还没有 BOT，点右上角创建。", "Create your first BOT with the button above.")}
          </Text>
        )}
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>{tr("群聊", "Groups")}</Text>
          <Pressable accessibilityRole="button" onPress={openGroupEditor} style={styles.addGroup}>
            <Icon name="newThread" size={16} tintColor={accent} />
            <Text style={styles.addGroupText}>{tr("建群", "New group")}</Text>
          </Pressable>
        </View>
        {conversations
          .filter((conversation) => conversation.kind === "group")
          .map((group) => (
            <Pressable
              key={group.id}
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: "/bot-chat/[conversationId]",
                  params: { conversationId: group.id },
                })
              }
              style={[styles.card, styles.groupRow]}
            >
              <View style={[styles.avatar, { backgroundColor: "#282642" }]}>
                <Text style={[styles.avatarText, { color: "#A49CFF" }]}>#</Text>
              </View>
              <View style={styles.botCopy}>
                <Text numberOfLines={1} style={styles.cardTitle}>
                  {group.name}
                </Text>
                <Text numberOfLines={1} style={styles.cardSubtitle}>
                  {group.botIds
                    .map((id) => bots.find((bot) => bot.id === id)?.name)
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              </View>
              <Icon name="chevronRight" size={17} tintColor="#757580" />
            </Pressable>
          ))}
        {!conversations.some((conversation) => conversation.kind === "group") ? (
          <Text style={styles.empty}>
            {tr("将多个 BOT 加入同一个群。", "Bring several BOTs into one group.")}
          </Text>
        ) : null}
      </ScrollView>

      <AppBottomSheet
        title={activeBot ? tr("编辑 BOT", "Edit BOT") : tr("新建 BOT", "Create BOT")}
        visible={sheet === "bot"}
        onClose={() => setSheet(undefined)}
      >
        <Field
          label={tr("名称", "Name")}
          value={name}
          onChangeText={setName}
          placeholder={tr("例如：产品顾问", "For example: Product advisor")}
        />
        <Text style={styles.fieldLabel}>{tr("颜色", "Color")}</Text>
        <View style={styles.colorPicker}>
          {palette.map((item) => (
            <Pressable
              key={item}
              accessibilityLabel={item}
              accessibilityRole="button"
              accessibilityState={{ selected: color === item }}
              onPress={() => setColor(item)}
              style={[
                styles.colorDot,
                { backgroundColor: item },
                color === item ? styles.colorSelected : null,
              ]}
            />
          ))}
        </View>
        <Field
          label={tr("角色说明", "Instructions")}
          value={instructions}
          onChangeText={setInstructions}
          placeholder={tr("这个 BOT 的职责、口吻与规则", "Role, style and rules for this BOT")}
          multiline
        />
        <Field
          label={tr("模型（可选）", "Model (optional)")}
          value={model}
          onChangeText={setModel}
          placeholder={tr("留空使用默认模型", "Leave empty for default model")}
        />
        <Field
          label={tr("推理强度（可选）", "Reasoning effort (optional)")}
          value={reasoningEffort}
          onChangeText={setReasoningEffort}
          placeholder={tr("例如：medium", "For example: medium")}
          autoCapitalize="none"
        />
        <Field
          label={tr("服务层级（可选）", "Service tier (optional)")}
          value={serviceTier}
          onChangeText={setServiceTier}
          placeholder={tr("留空使用默认层级", "Leave empty for default tier")}
          autoCapitalize="none"
        />
        <Text style={styles.fieldLabel}>{tr("运行权限", "Runtime access")}</Text>
        {(["default", "on-request", "auto", "full-access"] as const).map((mode) => (
          <SheetActionRow
            key={mode}
            accessibilityLabel={mode}
            icon="permissions"
            title={
              {
                default: tr("默认", "Default"),
                "on-request": tr("按需批准", "Ask when needed"),
                auto: tr("自动", "Automatic"),
                "full-access": tr("完整访问", "Full access"),
              }[mode]
            }
            selected={runtimeMode === mode}
            trailing={<SheetSelectedDot selected={runtimeMode === mode} />}
            onPress={() => setRuntimeMode(mode)}
          />
        ))}
        {runtimeMode === "full-access" ? (
          <Text style={styles.permissionNote}>
            {tr(
              "可访问本机文件；聊天历史范围仅约束应用检索。",
              "Can access local files; chat history scope only limits in-app lookup.",
            )}
          </Text>
        ) : null}
        <PrimaryAction
          label={busy ? tr("保存中…", "Saving…") : tr("保存 BOT", "Save BOT")}
          disabled={busy || !name.trim()}
          onPress={() => void saveBot()}
        />
        {activeBot ? (
          <SheetActionRow
            accessibilityLabel={tr("删除 BOT", "Delete BOT")}
            icon="trash"
            title={tr("删除 BOT", "Delete BOT")}
            onPress={confirmDeleteBot}
            iconTintColor="#FF8DA5"
          />
        ) : null}
      </AppBottomSheet>

      <AppBottomSheet
        title={tr("创建群聊", "Create group")}
        visible={sheet === "group"}
        onClose={() => setSheet(undefined)}
      >
        <Field
          label={tr("群名", "Group name")}
          value={groupName}
          onChangeText={setGroupName}
          placeholder={tr("例如：产品讨论", "For example: Product team")}
        />
        <Field
          label={tr("共享工作目录", "Shared working directory")}
          value={workspacePath}
          onChangeText={setWorkspacePath}
          placeholder="/Users/name/Project"
          autoCapitalize="none"
        />
        {workspaces.length ? (
          <>
            <Text style={styles.fieldLabel}>{tr("最近目录", "Recent directories")}</Text>
            {workspaces.map((path) => (
              <SheetActionRow
                key={path}
                accessibilityLabel={path}
                icon="folder"
                title={path.split("/").filter(Boolean).pop() || path}
                subtitle={path}
                selected={workspacePath === path}
                onPress={() => setWorkspacePath(path)}
              />
            ))}
          </>
        ) : null}
        <Text style={styles.fieldLabel}>{tr("成员", "Members")}</Text>
        {bots.map((bot) => (
          <SheetActionRow
            key={bot.id}
            accessibilityLabel={bot.name}
            icon="agentAtom"
            title={bot.name}
            selected={memberIds.includes(bot.id)}
            trailing={<SheetSelectedDot selected={memberIds.includes(bot.id)} />}
            onPress={() => toggleMember(bot.id)}
          />
        ))}
        <Text style={styles.fieldLabel}>{tr("默认回复 BOT", "Default BOT")}</Text>
        {bots
          .filter((bot) => memberIds.includes(bot.id))
          .map((bot) => (
            <SheetActionRow
              key={bot.id}
              accessibilityLabel={bot.name}
              icon="agentAtom"
              title={bot.name}
              selected={defaultBotId === bot.id}
              trailing={<SheetSelectedDot selected={defaultBotId === bot.id} />}
              onPress={() => setDefaultBotId(bot.id)}
            />
          ))}
        <PrimaryAction
          label={busy ? tr("创建中…", "Creating…") : tr("创建并进入群聊", "Create and open group")}
          disabled={busy || !groupName.trim() || !workspacePath.trim() || !memberIds.length}
          onPress={() => void saveGroup()}
        />
      </AppBottomSheet>

      <AppBottomSheet
        title={`${activeBot?.name ?? "BOT"} · ${tr("记忆", "Memory")}`}
        subtitle={tr(
          "可编辑或删除；删除记忆不会删除原聊天。",
          "Edit or delete memories. Source chats remain available.",
        )}
        visible={sheet === "memory"}
        onClose={() => setSheet(undefined)}
      >
        <Field
          label={editingMemory ? tr("编辑记忆", "Edit memory") : tr("添加记忆", "Add memory")}
          value={memoryDraft}
          onChangeText={setMemoryDraft}
          placeholder={tr("明确的偏好、决策或约定", "A stated preference or decision")}
          multiline
        />
        <PrimaryAction
          label={editingMemory ? tr("保存修改", "Save change") : tr("添加记忆", "Add memory")}
          disabled={busy || !memoryDraft.trim()}
          onPress={() => void saveMemory()}
        />
        {editingMemory ? (
          <SmallAction
            label={tr("取消编辑", "Cancel edit")}
            onPress={() => {
              setEditingMemory(undefined);
              setMemoryDraft("");
            }}
          />
        ) : null}
        {memoriesQuery.isLoading ? <ActivityIndicator color={accent} /> : null}
        {memoriesQuery.error ? (
          <Text style={styles.error}>{errorText(memoriesQuery.error)}</Text>
        ) : null}
        {memoriesQuery.data?.map((memory) => (
          <View key={memory.id} style={styles.memoryCard}>
            <Text style={styles.memoryText}>{memory.content}</Text>
            {memory.sourceMessageId ? (
              <View style={styles.sourceQuote}>
                <Text style={styles.sourceLabel}>{tr("来源原文", "Original message")}</Text>
                <Text
                  selectable
                  numberOfLines={expandedSourceIds.has(memory.id) ? undefined : 6}
                  style={styles.sourceText}
                >
                  {memory.sourceMessageContent ??
                    tr("原消息已不可用", "Original message unavailable")}
                </Text>
                {memory.sourceMessageContent && memory.sourceMessageContent.length > 200 ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      setExpandedSourceIds((current) => {
                        const next = new Set(current);
                        if (next.has(memory.id)) next.delete(memory.id);
                        else next.add(memory.id);
                        return next;
                      })
                    }
                  >
                    <Text style={styles.sourceLink}>
                      {expandedSourceIds.has(memory.id)
                        ? tr("收起", "Collapse")
                        : tr("展开原文", "Show full message")}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            {memory.sourceConversationId ? (
              <Pressable
                accessibilityRole="link"
                onPress={() => {
                  setSheet(undefined);
                  router.push({
                    pathname: "/bot-chat/[conversationId]",
                    params: { conversationId: memory.sourceConversationId! },
                  });
                }}
              >
                <Text style={[styles.memorySource, styles.sourceLink]}>
                  {tr("查看来源聊天", "View source chat")}
                </Text>
              </Pressable>
            ) : (
              <Text style={styles.memorySource}>
                {memory.sourceMessageId
                  ? tr("来源聊天已不可用", "Source chat unavailable")
                  : tr("手动添加", "Added manually")}
              </Text>
            )}
            <View style={styles.cardActions}>
              <SmallAction
                label={tr("编辑", "Edit")}
                onPress={() => {
                  setEditingMemory(memory);
                  setMemoryDraft(memory.content);
                }}
              />
              <SmallAction
                label={tr("删除", "Delete")}
                onPress={() => removeMemory(memory)}
                destructive
              />
            </View>
          </View>
        ))}
        {!memoriesQuery.isLoading && !memoriesQuery.data?.length ? (
          <Text style={styles.empty}>{tr("暂无记忆", "No memories yet")}</Text>
        ) : null}
      </AppBottomSheet>

      <AppBottomSheet
        title={`${activeBot?.name ?? "BOT"} · ${tr("历史检索", "History search")}`}
        subtitle={tr(
          "检索此 BOT 的私聊及曾加入的群聊",
          "Search this BOT’s private chats and groups",
        )}
        visible={sheet === "history"}
        onClose={() => setSheet(undefined)}
      >
        <Field
          label={tr("关键词", "Keywords")}
          value={searchDraft}
          onChangeText={setSearchDraft}
          placeholder={tr("搜索所有可访问历史", "Search accessible history")}
          onSubmitEditing={startSearch}
        />
        <PrimaryAction
          label={tr("搜索", "Search")}
          disabled={!searchDraft.trim()}
          onPress={startSearch}
        />
        {historyQuery.isLoading ? <ActivityIndicator color={accent} /> : null}
        {historyQuery.error ? (
          <Text style={styles.error}>{errorText(historyQuery.error)}</Text>
        ) : null}
        {searchHits.map((hit) => (
          <Pressable
            key={hit.message.id}
            onPress={() => {
              setSheet(undefined);
              router.push({
                pathname: "/bot-chat/[conversationId]",
                params: { conversationId: hit.conversation.id },
              });
            }}
            style={styles.memoryCard}
          >
            <Text style={styles.searchTitle}>{hit.conversation.name}</Text>
            <Text numberOfLines={4} style={styles.memoryText}>
              {hit.message.content}
            </Text>
            <Text style={styles.memorySource}>
              {new Date(hit.message.createdAt).toLocaleString()}
            </Text>
          </Pressable>
        ))}
        {searchText && !historyQuery.isFetching && !historyQuery.error && !searchHits.length ? (
          <Text style={styles.empty}>{tr("没有找到相关消息", "No matching messages")}</Text>
        ) : null}
        {searchCursor && !historyQuery.isFetching && !historyQuery.error ? (
          <PrimaryAction
            label={tr("加载更多", "Load more")}
            disabled={busy}
            onPress={() => void loadMoreHistory()}
          />
        ) : null}
      </AppBottomSheet>
    </SafeAreaView>
  );
}

function Field({
  label,
  multiline,
  ...props
}: { label: string; multiline?: boolean } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <AppBottomSheetTextInput
        {...props}
        multiline={multiline}
        placeholderTextColor="#68686E"
        style={[styles.input, multiline ? styles.multiline : null]}
      />
    </View>
  );
}

function PrimaryAction({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.primaryAction, disabled ? styles.disabled : null]}
    >
      <Text style={styles.primaryText}>{label}</Text>
    </Pressable>
  );
}

function SmallAction({
  label,
  onPress,
  destructive,
}: {
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.smallAction}>
      <Text style={[styles.smallActionText, destructive ? styles.destructive : null]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000" },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    paddingBottom: 12,
    paddingTop: 12,
  },
  heading: { color: "#fff", fontSize: 28, fontWeight: "700" },
  subheading: { color: "#8E8E93", fontSize: 13, marginTop: 3 },
  headerAction: {
    alignItems: "center",
    justifyContent: "center",
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#1C1C1E",
  },
  content: { paddingHorizontal: 20, paddingBottom: 38, gap: 10 },
  sectionHeading: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
    marginBottom: 2,
  },
  sectionTitle: { color: "#AEAEB2", fontSize: 14, fontWeight: "600" },
  count: { color: "#68686E", fontSize: 13 },
  addGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginLeft: "auto",
    paddingVertical: 8,
  },
  addGroupText: { color: accent, fontSize: 14, fontWeight: "600" },
  card: { borderRadius: 16, backgroundColor: "#1C1C1E", overflow: "hidden" },
  botMain: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  groupRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 21, fontWeight: "700" },
  botCopy: { flex: 1, minWidth: 0 },
  cardTitle: { color: "#fff", fontSize: 16, fontWeight: "600" },
  cardSubtitle: { color: "#8E8E93", fontSize: 12, marginTop: 4 },
  cardActions: { flexDirection: "row", gap: 6, paddingHorizontal: 9, paddingBottom: 9 },
  smallAction: {
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  smallActionText: { color: "#AEAEB2", fontSize: 12, fontWeight: "600" },
  destructive: { color: "#FF8DA5" },
  empty: { color: "#77777C", fontSize: 13, paddingVertical: 14 },
  error: { color: "#FF8DA5", fontSize: 13, paddingVertical: 8 },
  connectionIssue: {
    alignItems: "flex-start",
    backgroundColor: "#2E1D23",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  field: { gap: 6, marginTop: 10 },
  fieldLabel: { color: "#AEAEB2", fontSize: 13, fontWeight: "600", marginTop: 10, marginBottom: 3 },
  permissionNote: {
    color: "#A0A0A7",
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: 8,
    marginTop: 4,
  },
  input: {
    color: "#fff",
    backgroundColor: "#29292C",
    borderRadius: 11,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  multiline: { minHeight: 96, textAlignVertical: "top" },
  colorPicker: { flexDirection: "row", gap: 12, marginTop: 6, marginBottom: 2 },
  colorDot: { width: 31, height: 31, borderRadius: 16 },
  colorSelected: { borderColor: "#fff", borderWidth: 3 },
  primaryAction: {
    alignItems: "center",
    backgroundColor: "#4169D8",
    borderRadius: 11,
    minHeight: 46,
    justifyContent: "center",
    marginTop: 15,
    marginBottom: 8,
  },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  disabled: { opacity: 0.45 },
  memoryCard: { backgroundColor: "#29292C", borderRadius: 10, padding: 11, marginTop: 8 },
  memoryText: { color: "#fff", fontSize: 14, lineHeight: 20 },
  memorySource: { color: "#85858B", fontSize: 11, marginTop: 7 },
  sourceLink: { color: accent },
  sourceQuote: {
    backgroundColor: "#202024",
    borderLeftColor: "#6EA8FF",
    borderLeftWidth: 2,
    marginTop: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 5,
  },
  sourceLabel: { color: "#9E9EA8", fontSize: 11, fontWeight: "600" },
  sourceText: { color: "#D8D8DE", fontSize: 13, lineHeight: 19 },
  searchTitle: { color: accent, fontSize: 12, fontWeight: "600", marginBottom: 5 },
});
