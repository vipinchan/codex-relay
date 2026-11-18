import { useComputerOperations } from "@/hooks/use-computer-operations";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
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
import { Fonts } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
  createBotConversation as rawCreateBotConversation,
  getCodexRelayCacheIdentity,
  hasCodexRelaySession,
  listBotConversations as rawListBotConversations,
  listBots as rawListBots,
  listThreads as rawListThreads,
} from "@/lib/codex-relay-api";

import { botHomeSummary, resolveDirectBotConversation } from "./bot-home";
import { BotAvatar, BotPrimaryButton, BotRow, botError, botText } from "./bot-ui";

export function BotsHome() {
  const { createBotConversation, listBotConversations, listBots, listThreads } =
    useComputerOperations({
      createBotConversation: rawCreateBotConversation,
      listBotConversations: rawListBotConversations,
      listBots: rawListBots,
      listThreads: rawListThreads,
    });

  const theme = useTheme();
  const queryClient = useQueryClient();
  const [serverUrl, setServerUrl] = useState(getCodexRelayCacheIdentity());
  const [paired, setPaired] = useState(hasCodexRelaySession());
  const [focused, setFocused] = useState(false);
  const [search, setSearch] = useState("");
  const [sheet, setSheet] = useState<{ mode: "create" | "group"; visible: boolean }>({
    mode: "create",
    visible: false,
  });
  const [groupName, setGroupName] = useState("");
  const [workspacePath, setWorkspacePath] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [defaultBotId, setDefaultBotId] = useState("");
  const [busy, setBusy] = useState(false);
  const [openingBotId, setOpeningBotId] = useState<string>();
  const openingRequest = useRef<{ active: boolean } | null>(null);

  useFocusEffect(
    useCallback(() => {
      setPaired(hasCodexRelaySession());
      setServerUrl(getCodexRelayCacheIdentity());
      setFocused(true);
      return () => {
        if (openingRequest.current) openingRequest.current.active = false;
        setFocused(false);
      };
    }, []),
  );
  const botsQuery = useQuery({
    queryKey: ["bots", serverUrl],
    queryFn: listBots,
    enabled: paired,
    refetchInterval: focused ? 2_000 : false,
  });
  const conversationsQuery = useQuery({
    queryKey: ["bot-conversations", serverUrl],
    queryFn: listBotConversations,
    enabled: paired,
  });
  const threadsQuery = useQuery({
    queryKey: ["bot-workspaces", serverUrl],
    queryFn: () => listThreads(),
    enabled: paired,
  });
  const bots = botsQuery.data ?? [];
  const groups = conversationsQuery.data?.filter((item) => item.kind === "group") ?? [];
  const workspaces = [
    ...new Set(
      (threadsQuery.data?.threads ?? [])
        .map((thread) => thread.cwd)
        .filter((cwd): cwd is string => !!cwd),
    ),
  ].slice(0, 8);
  const term = search.trim().toLocaleLowerCase();
  const visibleBots = bots.filter((bot) =>
    `${bot.name} ${bot.instructions}`.toLocaleLowerCase().includes(term),
  );
  const visibleGroups = groups.filter((group) =>
    `${group.name} ${group.botIds.map((id) => bots.find((bot) => bot.id === id)?.name).join(" ")}`
      .toLocaleLowerCase()
      .includes(term),
  );

  async function openDirectChat(botId: string) {
    if (!focused || openingRequest.current || serverUrl !== getCodexRelayCacheIdentity()) return;
    const request = { active: true };
    openingRequest.current = request;
    setOpeningBotId(botId);
    Keyboard.dismiss();
    const isCurrent = () => request.active && serverUrl === getCodexRelayCacheIdentity();
    try {
      const conversation = await resolveDirectBotConversation(
        botId,
        () =>
          queryClient.fetchQuery({
            queryKey: ["bot-conversations", serverUrl],
            queryFn: listBotConversations,
            staleTime: 0,
          }),
        async (input) => {
          if (!isCurrent()) throw new Error("BOT chat request is no longer active");
          const created = await createBotConversation(input);
          void queryClient.invalidateQueries({ queryKey: ["bot-conversations", serverUrl] });
          return created;
        },
      );
      if (!isCurrent()) return;
      queryClient.setQueryData(["bot-conversation", serverUrl, conversation.id], conversation);
      router.push({
        pathname: "/bot-chat/[conversationId]",
        params: { conversationId: conversation.id },
      });
    } catch (error) {
      if (isCurrent()) {
        Alert.alert(botText("无法打开私聊", "Could not open chat"), botError(error), [
          { text: botText("取消", "Cancel"), style: "cancel" },
          { text: botText("重试", "Retry"), onPress: () => void openDirectChat(botId) },
        ]);
      }
    } finally {
      openingRequest.current = null;
      setOpeningBotId(undefined);
    }
  }

  function openGroup() {
    setGroupName("");
    setWorkspacePath(workspaces[0] ?? "");
    setMemberIds([]);
    setDefaultBotId("");
    setSheet({ mode: "group", visible: true });
  }
  function closeSheet() {
    setSheet((current) => ({ ...current, visible: false }));
  }
  function toggleMember(botId: string) {
    const next = memberIds.includes(botId)
      ? memberIds.filter((id) => id !== botId)
      : [...memberIds, botId];
    setMemberIds(next);
    if (!next.includes(defaultBotId)) setDefaultBotId(next[0] ?? "");
  }
  async function createGroup() {
    if (!groupName.trim() || !workspacePath.trim() || !memberIds.length || !defaultBotId || busy)
      return;
    setBusy(true);
    try {
      const group = await createBotConversation({
        kind: "group",
        name: groupName.trim(),
        workspacePath: workspacePath.trim(),
        botIds: memberIds,
        defaultBotId,
      });
      await queryClient.invalidateQueries({ queryKey: ["bot-conversations", serverUrl] });
      closeSheet();
      router.push({ pathname: "/bot-chat/[conversationId]", params: { conversationId: group.id } });
    } catch (error) {
      Alert.alert(botText("创建群聊失败", "Could not create group"), botError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={[styles.screen, { backgroundColor: theme.background }]}
    >
      <View style={styles.header}>
        <Text accessibilityRole="header" style={[styles.heading, { color: theme.text }]}>
          BOT
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={botText("新建机器人或群聊", "Create a BOT or group")}
          disabled={!!openingBotId}
          onPress={() => {
            if (openingRequest.current) return;
            Keyboard.dismiss();
            setSheet({ mode: "create", visible: true });
          }}
          style={[styles.addButton, { backgroundColor: theme.backgroundElement }]}
        >
          <Icon name="newThread" size={23} tintColor={theme.powerBlue} />
        </Pressable>
      </View>
      <View style={[styles.searchBox, { backgroundColor: theme.backgroundElement }]}>
        <Icon name="search" size={18} tintColor={theme.textSecondary} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={botText("搜索机器人或群聊", "Search BOTs and groups")}
          placeholderTextColor={theme.textSecondary}
          style={[styles.searchInput, { color: theme.text }]}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!paired ? (
          <Text style={[styles.empty, { color: theme.textSecondary }]}>
            {botText("连接 Mac Relay 后可使用 BOT", "Connect to Mac Relay to use BOTs")}
          </Text>
        ) : null}
        {botsQuery.isLoading ? <ActivityIndicator color={theme.powerBlue} /> : null}
        {botsQuery.error ? (
          <Pressable
            onPress={() => {
              void botsQuery.refetch();
              void conversationsQuery.refetch();
            }}
          >
            <Text style={styles.error}>
              {botError(botsQuery.error)} · {botText("点击重试", "Tap to retry")}
            </Text>
          </Pressable>
        ) : null}
        <View style={styles.section}>
          <Text
            accessibilityRole="header"
            style={[styles.sectionTitle, { color: theme.textSecondaryStrong }]}
          >
            {botText("机器人", "BOTs")}
          </Text>
        </View>
        {visibleBots.map((bot) => (
          <BotRow
            key={bot.id}
            compact
            disabled={!!openingBotId}
            busy={openingBotId === bot.id}
            title={bot.name}
            subtitle={botHomeSummary(bot.instructions)}
            leading={<BotAvatar bot={bot} size={38} />}
            trailing={
              openingBotId === bot.id ? (
                <ActivityIndicator size="small" color={theme.powerBlue} />
              ) : bot.runtimeState === "queued" || bot.runtimeState === "running" ? (
                <View style={styles.statusTrailing}>
                  <View
                    style={[
                      styles.statusBadge,
                      {
                        backgroundColor:
                          bot.runtimeState === "running" ? theme.successSoft : theme.warningSoft,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        { color: bot.runtimeState === "running" ? theme.success : theme.warning },
                      ]}
                    >
                      {bot.runtimeState === "running"
                        ? botText("执行中", "Running")
                        : botText("排队中", "Queued")}
                    </Text>
                  </View>
                  <Icon name="chevronRight" size={17} tintColor={theme.textSecondary} />
                </View>
              ) : undefined
            }
            onPress={() => void openDirectChat(bot.id)}
          />
        ))}
        {!visibleBots.length ? (
          <Text style={[styles.empty, { color: theme.textSecondary }]}>
            {term
              ? botText("没有匹配的 BOT", "No matching BOTs")
              : botText("还没有 BOT", "No BOTs yet")}
          </Text>
        ) : null}
        <View style={styles.section}>
          <Text
            accessibilityRole="header"
            style={[styles.sectionTitle, { color: theme.textSecondaryStrong }]}
          >
            {botText("群聊", "Groups")}
          </Text>
        </View>
        {visibleGroups.map((group) => (
          <BotRow
            key={group.id}
            compact
            disabled={!!openingBotId}
            title={group.name}
            subtitle={group.botIds
              .map((id) => bots.find((bot) => bot.id === id)?.name)
              .filter(Boolean)
              .join(" · ")}
            leading={
              <View style={styles.groupAvatar}>
                <Text style={styles.groupAvatarText}>#</Text>
              </View>
            }
            onPress={() => {
              if (openingRequest.current) return;
              Keyboard.dismiss();
              router.push({
                pathname: "/bot-chat/[conversationId]",
                params: { conversationId: group.id },
              });
            }}
          />
        ))}
        {!visibleGroups.length ? (
          <Text style={[styles.empty, { color: theme.textSecondary }]}>
            {term
              ? botText("没有匹配的群聊", "No matching groups")
              : botText("将多个 BOT 加入同一个群", "Bring several BOTs into one group")}
          </Text>
        ) : null}
      </ScrollView>
      <AppBottomSheet
        title={
          sheet.mode === "create" ? botText("新建", "Create") : botText("创建群聊", "Create group")
        }
        visible={sheet.visible}
        onClose={closeSheet}
      >
        {sheet.mode === "create" ? (
          <>
            <SheetActionRow
              accessibilityLabel={botText("新建机器人", "New BOT")}
              title={botText("新建机器人", "New BOT")}
              icon="agentAsterisk"
              onPress={() => {
                closeSheet();
                router.push("/bot/new");
              }}
            />
            <SheetActionRow
              accessibilityLabel={botText("新建群聊", "New group")}
              title={botText("新建群聊", "New group")}
              icon="newChat"
              onPress={openGroup}
            />
          </>
        ) : (
          <>
            <GroupField
              label={botText("群名", "Group name")}
              value={groupName}
              onChangeText={setGroupName}
              placeholder={botText("例如：产品讨论", "For example: Product team")}
            />
            <GroupField
              label={botText("共享工作目录", "Shared working directory")}
              value={workspacePath}
              onChangeText={setWorkspacePath}
              placeholder="/Users/name/Project"
              autoCapitalize="none"
            />
            {workspaces.length ? (
              <>
                <Text style={[styles.sheetLabel, { color: theme.textSecondaryStrong }]}>
                  {botText("最近目录", "Recent directories")}
                </Text>
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
            <Text style={[styles.sheetLabel, { color: theme.textSecondaryStrong }]}>
              {botText("成员", "Members")}
            </Text>
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
            <Text style={[styles.sheetLabel, { color: theme.textSecondaryStrong }]}>
              {botText("默认回复 BOT", "Default BOT")}
            </Text>
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
            <BotPrimaryButton
              label={
                busy
                  ? botText("创建中…", "Creating…")
                  : botText("创建并进入群聊", "Create and open group")
              }
              disabled={busy || !groupName.trim() || !workspacePath.trim() || !memberIds.length}
              onPress={() => void createGroup()}
            />
          </>
        )}
      </AppBottomSheet>
    </SafeAreaView>
  );
}

function GroupField({
  label,
  ...props
}: { label: string } & React.ComponentProps<typeof TextInput>) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.sheetLabel, { color: theme.textSecondaryStrong }]}>{label}</Text>
      <AppBottomSheetTextInput
        {...props}
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.sheetInput,
          { color: theme.text, backgroundColor: theme.backgroundSelected },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  screen: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    paddingTop: 13,
    paddingBottom: 15,
  },
  heading: { fontFamily: Fonts.sansBold, fontSize: 30, fontWeight: "700" },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  searchBox: {
    marginHorizontal: 20,
    minHeight: 44,
    paddingVertical: 8,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  searchInput: { flex: 1, fontFamily: Fonts.sans, fontSize: 14, paddingVertical: 0 },
  content: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 28, gap: 6 },
  section: { paddingTop: 14, paddingBottom: 2 },
  sectionTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 14 },
  groupAvatar: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: theme.backgroundAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  groupAvatarText: { color: theme.accent, fontFamily: Fonts.sansBold, fontSize: 22 },
  statusTrailing: { flexDirection: "row", alignItems: "center", gap: 7 },
  statusBadge: { borderRadius: 7, paddingHorizontal: 7, paddingVertical: 4 },
  statusText: { fontFamily: Fonts.sansMedium, fontSize: 10 },
  empty: { fontSize: 13, paddingVertical: 16 },
  error: { color: theme.danger, fontSize: 13, paddingVertical: 12 },
  field: { gap: 6, marginBottom: 10 },
  sheetLabel: { fontFamily: Fonts.sansSemiBold, fontSize: 13, marginTop: 10, marginBottom: 4 },
  sheetInput: { minHeight: 44, borderRadius: 11, paddingHorizontal: 12, fontSize: 15 },
}));
