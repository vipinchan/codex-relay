import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Bot, ReasoningEffort } from "codex-relay/api-schema";
import * as Clipboard from "expo-clipboard";
import { router, useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, TextInput, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { ChatModelPickerSheet } from "@/components/chat/ChatModelPickerSheet";
import { reasoningEffortForModel } from "@/components/chat/model-picker-options";
import { AppBottomSheet, SheetActionRow, SheetSelectedDot } from "@/components/ui/bottom-sheet";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { Fonts } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
  createBot,
  getBotDefinition,
  getCodexRelayServerUrl,
  listBotPlugins,
  listBots,
  listSkills,
  updateBot,
} from "@/lib/codex-relay-api";
import { serverStateKeys, serverStateQueryFns } from "@/lib/server-state";

import { BotPage, botError, botPalette, botText } from "./bot-ui";
import { botModelUnavailable, botUpdatePayload, type BotEditorDraft } from "./bot-editor-config";

type Draft = BotEditorDraft;
const emptyDraft = (): Draft => ({
  name: "",
  color: botPalette[0],
  instructions: "",
  model: undefined,
  reasoningEffort: undefined,
  serviceTier: undefined,
  runtimeMode: "default",
  preferredSkills: [],
  preferredPlugins: [],
});
const fromDefinition = (definition: {
  name: string;
  color: string;
  instructions: string;
  model?: string;
  reasoningEffort?: ReasoningEffort;
  serviceTier?: string;
  runtimeMode: Bot["runtimeMode"];
  preferredSkills: string[];
  preferredPlugins: string[];
}): Draft => ({
  name: definition.name,
  color: definition.color,
  instructions: definition.instructions,
  model: definition.model,
  reasoningEffort: definition.reasoningEffort,
  serviceTier: definition.serviceTier,
  runtimeMode: definition.runtimeMode,
  preferredSkills: definition.preferredSkills,
  preferredPlugins: definition.preferredPlugins,
});
const runtimeModes: Bot["runtimeMode"][] = ["default", "on-request", "auto", "full-access"];
const runtimeLabel = (mode: Bot["runtimeMode"]) =>
  ({
    default: botText("默认", "Default"),
    "on-request": botText("按需批准", "Ask when needed"),
    auto: botText("自动", "Automatic"),
    "full-access": botText("完整访问", "Full access"),
  })[mode];

function toggleSelected(current: string[], value: string) {
  return current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
}

export function BotEditorScreen({ botId }: { botId?: string }) {
  const theme = useTheme();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const serverUrl = getCodexRelayServerUrl();
  const botsQuery = useQuery({
    queryKey: ["bots", serverUrl],
    queryFn: listBots,
    enabled: !!botId,
  });
  const definitionQuery = useQuery({
    queryKey: ["bot-definition", serverUrl, botId],
    queryFn: () => getBotDefinition(botId!),
    enabled: !!botId,
    refetchOnWindowFocus: true,
  });
  const skillsQuery = useQuery({
    queryKey: ["bot-available-skills", serverUrl],
    queryFn: () => listSkills(),
  });
  const pluginsQuery = useQuery({
    queryKey: ["bot-available-plugins", serverUrl],
    queryFn: listBotPlugins,
  });
  const modelsQuery = useQuery({
    queryKey: serverStateKeys.models(),
    queryFn: serverStateQueryFns.models,
  });
  const bot = botsQuery.data?.find((item) => item.id === botId);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [initial, setInitial] = useState<Draft>(emptyDraft);
  const [initialRevision, setInitialRevision] = useState("");
  const [conflict, setConflict] = useState<Awaited<ReturnType<typeof getBotDefinition>>>();
  const initializedId = useRef<string | undefined>(undefined);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [permissionOpen, setPermissionOpen] = useState(false);
  const [capabilitySheet, setCapabilitySheet] = useState<"skills" | "plugins" | undefined>();
  const [busy, setBusy] = useState(false);
  const [allowLeave, setAllowLeave] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const latestDefinition =
    conflict ??
    (botId && initialRevision && definitionQuery.data?.revision !== initialRevision
      ? definitionQuery.data
      : undefined);

  useEffect(() => {
    if (bot && definitionQuery.data && initializedId.current !== bot.id) {
      const next = fromDefinition(definitionQuery.data.definition);
      setDraft(next);
      setInitial(next);
      setInitialRevision(definitionQuery.data.revision);
      initializedId.current = bot.id;
    }
  }, [bot, definitionQuery.data]);

  usePreventRemove(dirty && !allowLeave, ({ data }) => {
    Alert.alert(
      botText("放弃修改？", "Discard changes?"),
      botText("未保存的内容将丢失。", "Your unsaved changes will be lost."),
      [
        { text: botText("继续编辑", "Keep editing"), style: "cancel" },
        {
          text: botText("放弃", "Discard"),
          style: "destructive",
          onPress: () => {
            setAllowLeave(true);
            requestAnimationFrame(() => navigation.dispatch(data.action));
          },
        },
      ],
    );
  });

  function change(patch: Partial<Draft>) {
    setDraft((value) => ({ ...value, ...patch }));
  }
  const models = modelsQuery.data?.models ?? [];
  const selectedModel = models.find((model) => model.model === draft.model);
  const defaultModel = models.find((model) => model.isDefault) ?? models[0];
  const invalidModel = botModelUnavailable(draft.model, modelsQuery.isSuccess, models);
  const invalidEffort =
    !!draft.reasoningEffort &&
    !!selectedModel &&
    !selectedModel.supportedReasoningEfforts.includes(draft.reasoningEffort);
  const invalidTier =
    !!draft.serviceTier &&
    !!selectedModel &&
    !selectedModel.serviceTiers.some((tier) => tier.id === draft.serviceTier);
  const invalidConfiguration = invalidModel || invalidEffort || invalidTier;
  const modelLabel =
    selectedModel?.displayName ??
    (draft.model ? draft.model : botText("跟随默认模型", "Use default model"));

  function selectModel(modelId: string, effort?: ReasoningEffort) {
    const model = models.find((item) => item.model === modelId);
    change({
      model: modelId,
      reasoningEffort: reasoningEffortForModel(model, effort),
      serviceTier: model?.serviceTiers.some((tier) => tier.id === draft.serviceTier)
        ? draft.serviceTier
        : undefined,
    });
  }
  function selectEffort(effort: ReasoningEffort) {
    if (selectedModel?.supportedReasoningEfforts.includes(effort))
      change({ reasoningEffort: effort });
  }
  function selectTier(tier: string | undefined) {
    if (!tier || selectedModel?.serviceTiers.some((item) => item.id === tier))
      change({ serviceTier: tier });
  }
  function resetModel() {
    change({ model: undefined, reasoningEffort: undefined, serviceTier: undefined });
  }

  async function save() {
    if (
      busy ||
      !draft.name.trim() ||
      invalidConfiguration ||
      latestDefinition ||
      (botId && !initialRevision)
    )
      return;
    setBusy(true);
    try {
      const payload = botUpdatePayload(draft);
      if (botId) {
        await updateBot(botId, {
          ...payload,
          expectedRevision: initialRevision,
        });
      } else {
        await createBot({
          name: payload.name,
          color: payload.color,
          instructions: payload.instructions,
          runtimeMode: payload.runtimeMode,
          preferredSkills: draft.preferredSkills ?? [],
          preferredPlugins: draft.preferredPlugins ?? [],
          ...(draft.model ? { model: draft.model } : {}),
          ...(draft.reasoningEffort ? { reasoningEffort: draft.reasoningEffort } : {}),
          ...(draft.serviceTier ? { serviceTier: draft.serviceTier } : {}),
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["bots", serverUrl] });
      if (botId) {
        await queryClient.invalidateQueries({ queryKey: ["bot-definition", serverUrl, botId] });
      }
      setAllowLeave(true);
      requestAnimationFrame(() => router.back());
    } catch (error) {
      if (botId && isRevisionConflict(error)) {
        try {
          const latest = await getBotDefinition(botId);
          queryClient.setQueryData(["bot-definition", serverUrl, botId], latest);
          setConflict(latest);
        } catch (refreshError) {
          Alert.alert(
            botText("无法读取 Mac 最新版本", "Couldn’t load latest version"),
            botError(refreshError),
          );
        }
      } else {
        Alert.alert(botText("保存失败", "Could not save BOT"), botError(error));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <BotPage
      title={botId ? botText("编辑 BOT", "Edit BOT") : botText("新建 BOT", "Create BOT")}
      backLabel={botText("取消", "Cancel")}
      action={
        <Pressable
          accessibilityRole="button"
          accessibilityState={{
            disabled: busy || !draft.name.trim() || invalidConfiguration || !!latestDefinition,
          }}
          disabled={busy || !draft.name.trim() || invalidConfiguration || !!latestDefinition}
          onPress={() => void save()}
        >
          <Text
            style={[
              styles.save,
              {
                color: theme.powerBlue,
                opacity:
                  busy || !draft.name.trim() || invalidConfiguration || latestDefinition ? 0.45 : 1,
              },
            ]}
          >
            {busy ? botText("保存中", "Saving") : botText("保存", "Save")}
          </Text>
        </Pressable>
      }
    >
      {botId && (botsQuery.isLoading || definitionQuery.isLoading) ? (
        <ActivityIndicator color={theme.powerBlue} />
      ) : null}
      {botId && !botsQuery.isLoading && !bot ? (
        <Text style={styles.error}>
          {botError(botsQuery.error ?? new Error(botText("BOT 不存在", "BOT unavailable")))}
        </Text>
      ) : null}
      {botId && definitionQuery.error ? (
        <Pressable onPress={() => void definitionQuery.refetch()}>
          <Text style={styles.error}>
            {botError(definitionQuery.error)} · {botText("点击重试", "Tap to retry")}
          </Text>
        </Pressable>
      ) : null}
      {!botId || (bot && definitionQuery.data) ? (
        <ScrollView
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {definitionQuery.data?.status === "invalid" && !latestDefinition ? (
            <Text style={styles.error}>
              {botText(
                "Mac 定义文件当前无效。表单显示上一份有效配置；保存修改会替换无效文件。",
                "The Mac definition file is invalid. This form shows the last valid settings; saving changes replaces the invalid file.",
              )}
            </Text>
          ) : null}
          {latestDefinition ? (
            <View style={[styles.conflict, { backgroundColor: theme.backgroundElement }]}>
              <Text style={[styles.settingLabel, { color: theme.text }]}>
                {botText("定义已在 Mac 上修改", "Definition changed on Mac")}
              </Text>
              <Text style={[styles.note, { color: theme.textSecondary }]}>
                {botText(
                  "下面保留手机草稿和 Mac 最新内容。先对照两份配置，再选择要继续编辑的版本。",
                  "Your phone draft and the latest Mac version are both shown. Compare them before choosing which to edit.",
                )}
              </Text>
              {latestDefinition.status === "invalid" ? (
                <Text style={styles.error}>
                  {botText(
                    "Mac 文件当前无效。表单中的 Mac 版本采用上一份有效配置；原始文件可在“编辑原文”中修复。",
                    "The Mac file is invalid. Its form values come from the last valid configuration; repair the raw file in Edit source.",
                  )}
                </Text>
              ) : null}
              <Text style={[styles.label, { color: theme.textSecondaryStrong }]}>
                {botText("手机草稿", "Phone draft")}
              </Text>
              <Text selectable style={[styles.conflictSource, { color: theme.text }]}>
                {JSON.stringify(draft, null, 2)}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => void Clipboard.setStringAsync(JSON.stringify(draft, null, 2))}
              >
                <Text style={[styles.resetText, { color: theme.powerBlue }]}>
                  {botText("复制手机草稿", "Copy phone draft")}
                </Text>
              </Pressable>
              <Text style={[styles.label, { color: theme.textSecondaryStrong }]}>
                {botText("Mac 最新版本", "Latest Mac version")}
              </Text>
              <Text selectable style={[styles.conflictSource, { color: theme.text }]}>
                {latestDefinition.content}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => void Clipboard.setStringAsync(latestDefinition.content)}
              >
                <Text style={[styles.resetText, { color: theme.powerBlue }]}>
                  {botText("复制 Mac 版本", "Copy Mac version")}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  Alert.alert(
                    latestDefinition.status === "invalid"
                      ? botText("使用上一有效配置？", "Use last valid settings?")
                      : botText("使用 Mac 最新版本？", "Use latest Mac version?"),
                    botText(
                      "手机表单草稿将被替换。你可以先复制它。",
                      "Your phone form draft will be replaced. Copy it first if needed.",
                    ),
                    [
                      { text: botText("取消", "Cancel"), style: "cancel" },
                      {
                        text:
                          latestDefinition.status === "invalid"
                            ? botText("使用上一有效配置", "Use last valid settings")
                            : botText("使用 Mac 版本", "Use Mac version"),
                        onPress: () => {
                          const next = fromDefinition(latestDefinition.definition);
                          setDraft(next);
                          setInitial(next);
                          setInitialRevision(latestDefinition.revision);
                          setConflict(undefined);
                        },
                      },
                    ],
                  )
                }
              >
                <Text style={[styles.resetText, { color: theme.powerBlue }]}>
                  {latestDefinition.status === "invalid"
                    ? botText("使用上一有效配置", "Use last valid settings")
                    : botText("使用 Mac 最新版本", "Use latest Mac version")}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  Alert.alert(
                    botText("替换 Mac 版本？", "Replace Mac version?"),
                    botText(
                      "再次保存会用当前手机表单设置替换对应的 Mac 设置。请先对照两份内容。",
                      "Saving again will replace matching Mac settings with your phone draft. Compare both versions first.",
                    ),
                    [
                      { text: botText("取消", "Cancel"), style: "cancel" },
                      {
                        text: botText("继续手机草稿", "Continue phone draft"),
                        onPress: () => {
                          setInitialRevision(latestDefinition.revision);
                          setConflict(undefined);
                        },
                      },
                    ],
                  )
                }
              >
                <Text style={[styles.resetText, { color: theme.powerBlue }]}>
                  {botText("保留手机草稿，随后保存", "Keep phone draft, then save")}
                </Text>
              </Pressable>
            </View>
          ) : null}
          <Field
            label={botText("名称", "Name")}
            value={draft.name}
            onChangeText={(name) => change({ name })}
            placeholder={botText("例如：产品顾问", "For example: Product advisor")}
          />
          <Text style={[styles.label, { color: theme.textSecondaryStrong }]}>
            {botText("颜色", "Color")}
          </Text>
          <View style={styles.colors}>
            {botPalette.map((color) => (
              <Pressable
                key={color}
                accessibilityRole="button"
                accessibilityLabel={color}
                accessibilityState={{ selected: draft.color === color }}
                onPress={() => change({ color })}
                style={[
                  styles.color,
                  {
                    backgroundColor: color,
                    borderColor: draft.color === color ? theme.text : "transparent",
                  },
                ]}
              />
            ))}
          </View>
          <Field
            label={botText("角色说明", "Instructions")}
            value={draft.instructions}
            onChangeText={(instructions) => change({ instructions })}
            placeholder={botText("职责、口吻与规则", "Role, style, and rules")}
            multiline
          />
          <Text style={[styles.label, { color: theme.textSecondaryStrong }]}>
            {botText("常用能力", "Preferred capabilities")}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setCapabilitySheet("skills")}
            style={[styles.setting, { backgroundColor: theme.backgroundElement }]}
          >
            <Icon name="file" size={19} tintColor={theme.powerBlue} />
            <View style={styles.settingCopy}>
              <Text style={[styles.settingLabel, { color: theme.text }]}>
                {botText("技能", "Skills")}
              </Text>
              <Text
                numberOfLines={2}
                style={[styles.settingDetail, { color: theme.textSecondary }]}
              >
                {draft.preferredSkills?.join(" · ") || botText("未指定", "None selected")}
              </Text>
            </View>
            <Icon name="chevronRight" size={17} tintColor={theme.textSecondary} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setCapabilitySheet("plugins")}
            style={[styles.setting, { backgroundColor: theme.backgroundElement }]}
          >
            <Icon name="model" size={19} tintColor={theme.powerBlue} />
            <View style={styles.settingCopy}>
              <Text style={[styles.settingLabel, { color: theme.text }]}>
                {botText("插件", "Plugins")}
              </Text>
              <Text
                numberOfLines={2}
                style={[styles.settingDetail, { color: theme.textSecondary }]}
              >
                {draft.preferredPlugins?.join(" · ") || botText("未指定", "None selected")}
              </Text>
            </View>
            <Icon name="chevronRight" size={17} tintColor={theme.textSecondary} />
          </Pressable>
          <Text style={[styles.note, { color: theme.textSecondary }]}>
            {botText(
              "这里选择 BOT 常用的能力，不会更改 Mac 上共享能力的安装状态。",
              "Selections guide this BOT and do not change shared capabilities installed on Mac.",
            )}
          </Text>
          <Text style={[styles.label, { color: theme.textSecondaryStrong }]}>
            {botText("模型与回复", "Model and replies")}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => modelsQuery.isSuccess && setPickerOpen(true)}
            style={[styles.setting, { backgroundColor: theme.backgroundElement }]}
          >
            <Icon name="model" size={19} tintColor={theme.powerBlue} />
            <View style={styles.settingCopy}>
              <Text style={[styles.settingLabel, { color: theme.text }]}>{modelLabel}</Text>
              <Text style={[styles.settingDetail, { color: theme.textSecondary }]}>
                {draft.model
                  ? [draft.reasoningEffort, draft.serviceTier].filter(Boolean).join(" · ") ||
                    botText("使用模型默认配置", "Model defaults")
                  : botText("随工作区默认配置", "Workspace defaults")}
              </Text>
            </View>
            <Icon name="chevronRight" size={17} tintColor={theme.textSecondary} />
          </Pressable>
          {draft.model ? (
            <Pressable accessibilityRole="button" onPress={resetModel} style={styles.reset}>
              <Text style={[styles.resetText, { color: theme.powerBlue }]}>
                {botText("恢复默认模型与回复设置", "Restore default model and reply settings")}
              </Text>
            </Pressable>
          ) : null}
          {modelsQuery.isLoading ? <ActivityIndicator color={theme.powerBlue} /> : null}
          {modelsQuery.error ? (
            <Pressable onPress={() => void modelsQuery.refetch()}>
              <Text style={styles.error}>
                {botText(
                  "模型目录加载失败，点击重试。已保存配置仍可保留。",
                  "Model catalog unavailable. Tap to retry; saved settings are kept.",
                )}
              </Text>
            </Pressable>
          ) : null}
          {invalidModel ? (
            <Text style={styles.error}>
              {botText(
                "当前模型已失效，请选择其他模型或恢复默认。",
                "This model is unavailable. Choose another or restore default.",
              )}
            </Text>
          ) : null}
          {invalidEffort || invalidTier ? (
            <Text style={styles.error}>
              {botText(
                "当前推理强度或回复速度已失效，请重新选择或恢复默认。",
                "The saved reasoning or speed setting is unavailable. Choose again or restore default.",
              )}
            </Text>
          ) : null}
          <Text style={[styles.label, { color: theme.textSecondaryStrong }]}>
            {botText("高级设置", "Advanced settings")}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setPermissionOpen(true)}
            style={[styles.setting, { backgroundColor: theme.backgroundElement }]}
          >
            <Icon name="permissions" size={19} tintColor={theme.powerBlue} />
            <View style={styles.settingCopy}>
              <Text style={[styles.settingLabel, { color: theme.text }]}>
                {botText("运行权限", "Runtime access")}
              </Text>
              <Text style={[styles.settingDetail, { color: theme.textSecondary }]}>
                {runtimeLabel(draft.runtimeMode)}
              </Text>
            </View>
            <Icon name="chevronRight" size={17} tintColor={theme.textSecondary} />
          </Pressable>
          {draft.runtimeMode === "full-access" ? (
            <Text style={[styles.note, { color: theme.textSecondary }]}>
              {botText(
                "可访问本机文件；聊天历史范围仅约束应用检索。",
                "Can access local files; chat history scope only limits in-app lookup.",
              )}
            </Text>
          ) : null}
        </ScrollView>
      ) : null}
      <ChatModelPickerSheet
        activeModel={selectedModel ?? defaultModel}
        models={models}
        onClose={() => setPickerOpen(false)}
        onModelSelect={selectModel}
        onReasoningSelect={selectEffort}
        onServiceTierChange={selectTier}
        selectedModel={draft.model}
        selectedReasoningEffort={invalidEffort ? undefined : draft.reasoningEffort}
        selectedServiceTier={invalidTier ? undefined : draft.serviceTier}
        visible={pickerOpen && models.length > 0}
      />
      <AppBottomSheet
        title={botText("运行权限", "Runtime access")}
        visible={permissionOpen}
        onClose={() => setPermissionOpen(false)}
      >
        {runtimeModes.map((mode) => (
          <SheetActionRow
            key={mode}
            accessibilityLabel={runtimeLabel(mode)}
            icon="permissions"
            title={runtimeLabel(mode)}
            selected={draft.runtimeMode === mode}
            trailing={<SheetSelectedDot selected={draft.runtimeMode === mode} />}
            onPress={() => {
              change({ runtimeMode: mode });
              setPermissionOpen(false);
            }}
          />
        ))}
      </AppBottomSheet>
      <AppBottomSheet
        title={
          capabilitySheet === "skills"
            ? botText("常用技能", "Preferred skills")
            : botText("常用插件", "Preferred plugins")
        }
        visible={!!capabilitySheet}
        onClose={() => setCapabilitySheet(undefined)}
      >
        {capabilitySheet === "skills" ? (
          <>
            {skillsQuery.isLoading ? <ActivityIndicator color={theme.powerBlue} /> : null}
            {skillsQuery.error ? (
              <SheetActionRow
                accessibilityLabel={botText("重新加载技能", "Reload skills")}
                icon="file"
                title={botText("加载失败，点击重试", "Couldn’t load. Tap to retry")}
                onPress={() => void skillsQuery.refetch()}
              />
            ) : null}
            {skillsQuery.data?.skills.map((skill) => (
              <SheetActionRow
                key={skill.id}
                accessibilityLabel={skill.displayName}
                icon="file"
                title={skill.displayName}
                subtitle={skill.description ?? skill.sourceLabel}
                selected={draft.preferredSkills?.includes(skill.id) ?? false}
                trailing={
                  <SheetSelectedDot selected={draft.preferredSkills?.includes(skill.id) ?? false} />
                }
                onPress={() =>
                  change({
                    preferredSkills: toggleSelected(draft.preferredSkills ?? [], skill.id),
                  })
                }
              />
            ))}
          </>
        ) : (
          <>
            {pluginsQuery.isLoading ? <ActivityIndicator color={theme.powerBlue} /> : null}
            {pluginsQuery.error ? (
              <SheetActionRow
                accessibilityLabel={botText("重新加载插件", "Reload plugins")}
                icon="model"
                title={botText("加载失败，点击重试", "Couldn’t load. Tap to retry")}
                onPress={() => void pluginsQuery.refetch()}
              />
            ) : null}
            {pluginsQuery.data?.plugins.map((plugin) => (
              <SheetActionRow
                key={plugin.id}
                accessibilityLabel={plugin.name}
                icon="model"
                title={plugin.name}
                subtitle={plugin.description}
                selected={draft.preferredPlugins?.includes(plugin.id) ?? false}
                trailing={
                  <SheetSelectedDot
                    selected={draft.preferredPlugins?.includes(plugin.id) ?? false}
                  />
                }
                onPress={() =>
                  change({
                    preferredPlugins: toggleSelected(draft.preferredPlugins ?? [], plugin.id),
                  })
                }
              />
            ))}
          </>
        )}
      </AppBottomSheet>
    </BotPage>
  );
}

function Field({
  label,
  multiline,
  ...props
}: { label: string; multiline?: boolean } & React.ComponentProps<typeof TextInput>) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.textSecondaryStrong }]}>{label}</Text>
      <TextInput
        {...props}
        multiline={multiline}
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.input,
          { backgroundColor: theme.backgroundElement, color: theme.text },
          multiline ? styles.multiline : null,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  save: { fontFamily: Fonts.sansSemiBold, fontSize: 15 },
  content: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 50, gap: 7 },
  field: { gap: 7, marginBottom: 14 },
  label: { fontFamily: Fonts.sansSemiBold, fontSize: 13, marginTop: 9 },
  input: {
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
  },
  multiline: { minHeight: 120, textAlignVertical: "top" },
  colors: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20, marginTop: 6 },
  color: { width: 38, height: 38, borderRadius: 19, borderWidth: 3 },
  setting: {
    minHeight: 69,
    borderRadius: 13,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  settingCopy: { flex: 1, gap: 3 },
  settingLabel: { fontFamily: Fonts.sansMedium, fontSize: 15 },
  settingDetail: { fontSize: 12 },
  reset: { alignSelf: "flex-start", paddingVertical: 12 },
  resetText: { fontFamily: Fonts.sansMedium, fontSize: 13 },
  error: { color: "#FF8DA5", fontSize: 12, lineHeight: 18, paddingVertical: 9 },
  note: { fontSize: 12, lineHeight: 17, padding: 8 },
  conflict: { borderRadius: 13, padding: 14, gap: 8, marginBottom: 12 },
  conflictSource: { fontFamily: Fonts.mono, fontSize: 11, lineHeight: 17 },
});

function isRevisionConflict(error: unknown) {
  return !!error && typeof error === "object" && "status" in error && error.status === 409;
}
