import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { BotConversation } from "codex-relay/api-schema";
import { router, useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { FileWorkspacePreviewTab } from "@/components/chat/workspace-preview/FileWorkspacePreviewTab";
import { MarkdownWorkspacePreviewTab } from "@/components/chat/workspace-preview/MarkdownWorkspacePreviewTab";
import {
  AppBottomSheet,
  AppBottomSheetTextInput,
  SheetActionRow,
  SheetSelectedDot,
} from "@/components/ui/bottom-sheet";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useComputerOperations } from "@/hooks/use-computer-operations";
import { useTheme } from "@/hooks/use-theme";
import {
  deleteBotConversation as rawDeleteBotConversation,
  getCodexRelayCacheIdentity,
  listBots as rawListBots,
  listThreads as rawListThreads,
  updateBotConversation as rawUpdateBotConversation,
} from "@/lib/codex-relay-api";

import {
  groupSettingsPatch,
  toggleGroupSettingsMember,
  validGroupSettings,
  type GroupSettingsDraft,
} from "./bot-group-settings";
import { botPreviewMarkdownPath } from "./bot-preview-path";
import { BotAvatar, BotPage, BotPreviewTabs, BotRow, botError, botText } from "./bot-ui";

type GroupTab = "settings" | "files" | "document";
type GroupPicker = "workspace" | "members" | "default";

export function BotGroupSettingsScreen({
  conversation,
  filePath,
}: {
  conversation: BotConversation;
  filePath?: string;
}) {
  const { deleteBotConversation, listBots, listThreads, updateBotConversation } =
    useComputerOperations({
      deleteBotConversation: rawDeleteBotConversation,
      listBots: rawListBots,
      listThreads: rawListThreads,
      updateBotConversation: rawUpdateBotConversation,
    });
  const theme = useTheme();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const serverUrl = getCodexRelayCacheIdentity();
  const [tab, setTab] = useState<GroupTab>(filePath ? "document" : "settings");
  const [picker, setPicker] = useState<GroupPicker>();
  const [edit, setEdit] = useState<{ base: GroupSettingsDraft; draft: GroupSettingsDraft }>();
  const [busy, setBusy] = useState(false);
  const [allowLeave, setAllowLeave] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const pending = useRef(false);
  const botsQuery = useQuery({ queryKey: ["bots", serverUrl], queryFn: listBots });
  const threadsQuery = useQuery({
    queryKey: ["bot-workspaces", serverUrl],
    queryFn: () => listThreads(),
    enabled: picker === "workspace",
  });
  const bots = botsQuery.data ?? [];
  const botsById = new Map(bots.map((bot) => [bot.id, bot]));
  const recentWorkspaces = [
    ...new Set(
      (threadsQuery.data?.threads ?? []).flatMap((thread) =>
        thread.cwd?.startsWith("/") ? [thread.cwd] : [],
      ),
    ),
  ].slice(0, 8);
  const saved: GroupSettingsDraft = {
    name: conversation.name,
    workspacePath: conversation.workspacePath,
    botIds: conversation.botIds,
    defaultBotId: conversation.defaultBotId ?? "",
  };
  const draft = edit?.draft ?? saved;
  const patch = groupSettingsPatch(edit?.base ?? saved, draft);
  const dirty = Object.keys(patch).length > 0;
  const validWorkspace = draft.workspacePath.trim().startsWith("/");
  const canSave = dirty && validGroupSettings(draft) && !busy && !picker;
  const markdownPath = filePath ? botPreviewMarkdownPath(filePath, saved.workspacePath) : undefined;

  usePreventRemove(!allowLeave && (dirty || busy), ({ data }) => {
    if (pending.current) return;
    Alert.alert(
      botText("放弃修改？", "Discard changes?"),
      botText("未保存的群设置将丢失。", "Unsaved group settings will be lost."),
      [
        { text: botText("继续编辑", "Keep editing"), style: "cancel" },
        {
          text: botText("放弃修改", "Discard changes"),
          style: "destructive",
          onPress: () => {
            setAllowLeave(true);
            requestAnimationFrame(() => navigation.dispatch(data.action));
          },
        },
      ],
    );
  });

  function changeDraft(change: (value: GroupSettingsDraft) => GroupSettingsDraft) {
    if (pending.current) return;
    setSaveError(undefined);
    setEdit((current) => {
      const base = current?.base ?? saved;
      return { base, draft: change(current?.draft ?? saved) };
    });
  }

  function openPicker(nextPicker: GroupPicker) {
    Keyboard.dismiss();
    setPicker(nextPicker);
  }

  async function saveGroup() {
    if (!canSave || pending.current) return;
    pending.current = true;
    setBusy(true);
    setSaveError(undefined);
    Keyboard.dismiss();
    try {
      const updated = await updateBotConversation(conversation.id, patch);
      const conversationKey = ["bot-conversation", serverUrl, conversation.id];
      await queryClient.cancelQueries({ queryKey: conversationKey, exact: true });
      queryClient.setQueryData(conversationKey, updated);
      void queryClient.invalidateQueries({ queryKey: ["bot-conversations", serverUrl] });
      setEdit(undefined);
    } catch (error) {
      setSaveError(
        typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "conversation_busy"
          ? botText(
              "请等待机器人回复结束，或停止回复后再保存工作区。",
              "Wait for replies to finish or stop them before saving the workspace.",
            )
          : botError(error),
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  function confirmDeleteGroup() {
    Alert.alert(
      botText("删除群聊", "Delete group"),
      botText("群聊将从会话列表移除。", "The group will leave the session list."),
      [
        { text: botText("取消", "Cancel"), style: "cancel" },
        {
          text: botText("删除", "Delete"),
          style: "destructive",
          onPress: () => {
            if (pending.current) return;
            pending.current = true;
            setBusy(true);
            void deleteBotConversation(conversation.id)
              .then(() => {
                void queryClient.invalidateQueries({ queryKey: ["bot-conversations", serverUrl] });
                setAllowLeave(true);
                requestAnimationFrame(() => {
                  if (router.canDismiss()) router.dismiss(2);
                  else if (router.canGoBack()) router.back();
                });
              })
              .catch((error) => Alert.alert(botText("删除失败", "Delete failed"), botError(error)))
              .finally(() => {
                pending.current = false;
                setBusy(false);
              });
          },
        },
      ],
    );
  }

  return (
    <BotPage
      title={botText("群设置", "Group settings")}
      action={
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSave, busy }}
          disabled={!canSave}
          onPress={() => void saveGroup()}
          style={styles.save}
        >
          {busy ? (
            <ActivityIndicator color={theme.powerBlue} />
          ) : (
            <Text style={{ color: canSave ? theme.powerBlue : theme.textSecondary }}>
              {botText("保存", "Save")}
            </Text>
          )}
        </Pressable>
      }
    >
      <BotPreviewTabs<GroupTab>
        tabs={[
          { id: "settings", label: botText("群设置", "Group settings") },
          { id: "files", label: botText("工作区文件", "Workspace files") },
          ...(filePath ? [{ id: "document" as const, label: botText("文档", "Document") }] : []),
        ]}
        selected={tab}
        onSelect={setTab}
      />
      {saveError ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {saveError}
        </Text>
      ) : null}
      {tab === "files" ? (
        <FileWorkspacePreviewTab key={saved.workspacePath} workspacePath={saved.workspacePath} />
      ) : tab === "document" ? (
        markdownPath ? (
          <MarkdownWorkspacePreviewTab
            key={saved.workspacePath}
            target={{ path: markdownPath, workspacePath: saved.workspacePath }}
            workspacePath={saved.workspacePath}
          />
        ) : (
          <Text style={styles.error}>
            {botText("文档路径不在当前工作区。", "Document is outside this workspace.")}
          </Text>
        )
      ) : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>{botText("群名", "Group name")}</Text>
          <TextInput
            accessibilityLabel={botText("群名", "Group name")}
            editable={!busy}
            value={draft.name}
            onChangeText={(name) => changeDraft((current) => ({ ...current, name }))}
            style={styles.input}
          />
          <Text style={styles.label}>{botText("共享工作区", "Shared workspace")}</Text>
          <BotRow
            compact
            title={draft.workspacePath.split("/").filter(Boolean).pop() ?? draft.workspacePath}
            leading={<Icon name="folder" size={20} tintColor={theme.powerBlue} />}
            trailing={<Text style={styles.link}>{botText("更换", "Change")}</Text>}
            disabled={busy}
            onPress={() => openPicker("workspace")}
          />
          <Text selectable style={styles.hint}>
            {draft.workspacePath}
          </Text>
          {!validWorkspace ? (
            <Text style={styles.hint}>
              {botText(
                "请输入以 / 开头的 Mac 目录路径。",
                "Enter a Mac directory path that starts with /.",
              )}
            </Text>
          ) : patch.workspacePath !== undefined ? (
            <Text style={styles.hint}>
              {botText(
                "保存后，群聊的后续任务将使用新目录。",
                "Future group tasks will use the new workspace after saving.",
              )}
            </Text>
          ) : null}
          <Text style={styles.label}>{botText("默认机器人", "Default BOT")}</Text>
          <BotRow
            compact
            title={
              botsById.get(draft.defaultBotId)?.name ??
              (draft.defaultBotId || botText("选择默认机器人", "Choose a default BOT"))
            }
            disabled={busy || draft.botIds.length === 0}
            onPress={() => openPicker("default")}
          />
          <Text style={styles.label}>{botText("成员", "Members")}</Text>
          {!draft.botIds.includes(draft.defaultBotId) ? (
            <Text style={styles.hint}>
              {botText(
                "请选择一位群成员作为默认机器人。",
                "Choose a group member as the default BOT.",
              )}
            </Text>
          ) : null}
          {draft.botIds.map((id) => {
            const bot = botsById.get(id);
            return (
              <View key={id} style={styles.member}>
                {bot ? <BotAvatar bot={bot} size={36} /> : null}
                <Text numberOfLines={2} style={styles.memberName}>
                  {bot?.name ?? id}
                </Text>
                {id === draft.defaultBotId ? (
                  <Text style={styles.hint}>{botText("默认", "Default")}</Text>
                ) : null}
              </View>
            );
          })}
          <BotRow
            compact
            title={botText("管理成员", "Manage members")}
            disabled={busy}
            onPress={() => openPicker("members")}
          />
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={confirmDeleteGroup}
            style={styles.delete}
          >
            <Text style={styles.error}>{botText("删除群聊", "Delete group")}</Text>
          </Pressable>
        </ScrollView>
      )}
      <AppBottomSheet
        title={
          picker === "workspace"
            ? botText("更换工作区", "Change workspace")
            : picker === "default"
              ? botText("默认机器人", "Default BOT")
              : botText("管理成员", "Manage members")
        }
        visible={!!picker}
        onClose={() => setPicker(undefined)}
      >
        {picker === "workspace" ? (
          <>
            <Text style={styles.label}>{botText("Mac 上的绝对路径", "Absolute path on Mac")}</Text>
            <AppBottomSheetTextInput
              accessibilityLabel={botText("Mac 上的绝对路径", "Absolute path on Mac")}
              autoCapitalize="none"
              autoCorrect={false}
              value={draft.workspacePath}
              onChangeText={(workspacePath) =>
                changeDraft((current) => ({ ...current, workspacePath }))
              }
              style={styles.input}
            />
            {recentWorkspaces.length ? (
              <Text style={styles.label}>{botText("近期工作区", "Recent workspaces")}</Text>
            ) : null}
            {recentWorkspaces.map((workspacePath) => (
              <SheetActionRow
                key={workspacePath}
                accessibilityLabel={workspacePath}
                icon="folder"
                title={workspacePath.split("/").filter(Boolean).pop() ?? workspacePath}
                subtitle={workspacePath}
                onPress={() => {
                  changeDraft((current) => ({ ...current, workspacePath }));
                  setPicker(undefined);
                }}
              />
            ))}
          </>
        ) : (
          <>
            {botsQuery.isLoading ? <ActivityIndicator color={theme.powerBlue} /> : null}
            {botsQuery.error ? (
              <Pressable accessibilityRole="button" onPress={() => void botsQuery.refetch()}>
                <Text style={styles.error}>
                  {botText("无法读取机器人，点击重试", "Could not load BOTs. Tap to retry.")}
                </Text>
              </Pressable>
            ) : null}
            {(picker === "default"
              ? draft.botIds
              : [...new Set([...draft.botIds, ...bots.map((bot) => bot.id)])]
            ).map((id) => {
              const name = botsById.get(id)?.name ?? id;
              const selected =
                picker === "default" ? id === draft.defaultBotId : draft.botIds.includes(id);
              return (
                <SheetActionRow
                  key={id}
                  accessibilityLabel={name}
                  icon="agentAtom"
                  title={name}
                  selected={selected}
                  trailing={<SheetSelectedDot selected={selected} />}
                  onPress={() => {
                    if (picker === "default") {
                      changeDraft((current) => ({ ...current, defaultBotId: id }));
                      setPicker(undefined);
                    } else {
                      changeDraft((current) => toggleGroupSettingsMember(current, id));
                    }
                  }}
                />
              );
            })}
          </>
        )}
        <SheetActionRow
          accessibilityLabel={botText("完成", "Done")}
          icon="check"
          title={botText("完成", "Done")}
          onPress={() => setPicker(undefined)}
        />
      </AppBottomSheet>
    </BotPage>
  );
}

const styles = StyleSheet.create((theme) => ({
  content: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 28, gap: 8 },
  save: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  label: { color: theme.textSecondaryStrong, fontSize: 14, fontWeight: "600", marginTop: 10 },
  input: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 11,
    color: theme.text,
    backgroundColor: theme.backgroundElement,
    fontSize: 16,
  },
  hint: { color: theme.textSecondary, fontSize: 13 },
  link: { color: theme.powerBlue, fontSize: 14 },
  error: { color: theme.danger, paddingHorizontal: 16, paddingVertical: 8 },
  member: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    gap: 10,
    paddingHorizontal: 12,
  },
  memberName: { flex: 1, color: theme.text, fontSize: 15 },
  delete: { alignSelf: "flex-start", justifyContent: "center", minHeight: 44, marginTop: 12 },
}));
