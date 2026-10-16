import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, TextInput, View } from "react-native";
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
  createBotConversation,
  getCodexRelayServerUrl,
  hasCodexRelaySession,
  listBotConversations,
  listBots,
  listThreads,
} from "@/lib/codex-relay-api";

import { BotAvatar, BotPrimaryButton, BotRow, botError, botText } from "./bot-ui";

export function BotsHome() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [serverUrl, setServerUrl] = useState(getCodexRelayServerUrl());
  const [paired, setPaired] = useState(hasCodexRelaySession());
  const [focused, setFocused] = useState(false);
  const [search, setSearch] = useState("");
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [workspacePath, setWorkspacePath] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [defaultBotId, setDefaultBotId] = useState("");
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setPaired(hasCodexRelaySession());
      setServerUrl(getCodexRelayServerUrl());
      setFocused(true);
      return () => setFocused(false);
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
    queryFn: listThreads,
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

  function openGroup() {
    setGroupName("");
    setWorkspacePath(workspaces[0] ?? "");
    setMemberIds([]);
    setDefaultBotId("");
    setGroupOpen(true);
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
      setGroupOpen(false);
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
        <View style={styles.headerCopy}>
          <Text style={[styles.heading, { color: theme.text }]}>BOT</Text>
          <Text style={[styles.subheading, { color: theme.textSecondary }]}>
            {botText("助手与群聊", "Assistants and groups")}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={botText("新建 BOT", "Create BOT")}
          onPress={() => router.push("/bot/new")}
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
          placeholder={botText("搜索 BOT 或群聊", "Search BOTs and groups")}
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
          <Text style={[styles.sectionTitle, { color: theme.textSecondaryStrong }]}>
            {botText("我的 BOT", "My BOTs")}
          </Text>
          <Text style={[styles.count, { color: theme.textSecondary }]}>{visibleBots.length}</Text>
        </View>
        {visibleBots.map((bot) => (
          <BotRow
            key={bot.id}
            title={bot.name}
            subtitle={bot.instructions || botText("点击查看详情", "View details")}
            leading={<BotAvatar bot={bot} />}
            trailing={
              bot.runtimeState === "queued" || bot.runtimeState === "running" ? (
                <View style={styles.statusTrailing}>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: bot.runtimeState === "running" ? "#1D3A31" : "#3A301D" },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        { color: bot.runtimeState === "running" ? "#78D9A5" : "#F3BF72" },
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
            onPress={() => router.push({ pathname: "/bot/[botId]", params: { botId: bot.id } })}
          />
        ))}
        {!visibleBots.length ? (
          <Text style={[styles.empty, { color: theme.textSecondary }]}>
            {term
              ? botText("没有匹配的 BOT", "No matching BOTs")
              : botText("还没有 BOT", "No BOTs yet")}
          </Text>
        ) : null}
        <View style={[styles.section, styles.groupSection]}>
          <Text style={[styles.sectionTitle, { color: theme.textSecondaryStrong }]}>
            {botText("群聊", "Groups")}
          </Text>
          <Pressable accessibilityRole="button" onPress={openGroup} style={styles.newGroup}>
            <Icon name="newThread" size={17} tintColor={theme.powerBlue} />
            <Text style={[styles.newGroupText, { color: theme.powerBlue }]}>
              {botText("建群", "New group")}
            </Text>
          </Pressable>
        </View>
        {visibleGroups.map((group) => (
          <BotRow
            key={group.id}
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
            onPress={() =>
              router.push({
                pathname: "/bot-chat/[conversationId]",
                params: { conversationId: group.id },
              })
            }
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
        title={botText("创建群聊", "Create group")}
        visible={groupOpen}
        onClose={() => setGroupOpen(false)}
      >
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

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    paddingTop: 13,
    paddingBottom: 15,
  },
  headerCopy: { gap: 4 },
  heading: { fontFamily: Fonts.sansBold, fontSize: 30 },
  subheading: { fontFamily: Fonts.sans, fontSize: 13 },
  addButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  searchBox: {
    marginHorizontal: 20,
    height: 42,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  searchInput: { flex: 1, fontFamily: Fonts.sans, fontSize: 14, paddingVertical: 0 },
  content: { paddingHorizontal: 20, paddingBottom: 36, gap: 8 },
  section: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 20, paddingBottom: 5 },
  sectionTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 14 },
  count: { fontSize: 13 },
  groupSection: { paddingTop: 27 },
  newGroup: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 36,
  },
  newGroupText: { fontFamily: Fonts.sansSemiBold, fontSize: 14 },
  groupAvatar: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: "#292642",
    alignItems: "center",
    justifyContent: "center",
  },
  groupAvatarText: { color: "#A49CFF", fontFamily: Fonts.sansBold, fontSize: 22 },
  statusTrailing: { flexDirection: "row", alignItems: "center", gap: 7 },
  statusBadge: { borderRadius: 7, paddingHorizontal: 7, paddingVertical: 4 },
  statusText: { fontFamily: Fonts.sansMedium, fontSize: 10 },
  empty: { fontSize: 13, paddingVertical: 16 },
  error: { color: "#FF8DA5", fontSize: 13, paddingVertical: 12 },
  field: { gap: 6, marginBottom: 10 },
  sheetLabel: { fontFamily: Fonts.sansSemiBold, fontSize: 13, marginTop: 10, marginBottom: 4 },
  sheetInput: { minHeight: 44, borderRadius: 11, paddingHorizontal: 12, fontSize: 15 },
});
