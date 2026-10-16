import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Bot, ReasoningEffort } from "codex-relay/api-schema";
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
import { createBot, getCodexRelayServerUrl, listBots, updateBot } from "@/lib/codex-relay-api";
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
});
const fromBot = (bot: Bot): Draft => ({
  name: bot.name,
  color: bot.color,
  instructions: bot.instructions,
  model: bot.model,
  reasoningEffort: bot.reasoningEffort,
  serviceTier: bot.serviceTier,
  runtimeMode: bot.runtimeMode,
});
const runtimeModes: Bot["runtimeMode"][] = ["default", "on-request", "auto", "full-access"];
const runtimeLabel = (mode: Bot["runtimeMode"]) =>
  ({
    default: botText("默认", "Default"),
    "on-request": botText("按需批准", "Ask when needed"),
    auto: botText("自动", "Automatic"),
    "full-access": botText("完整访问", "Full access"),
  })[mode];

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
  const modelsQuery = useQuery({
    queryKey: serverStateKeys.models(),
    queryFn: serverStateQueryFns.models,
  });
  const bot = botsQuery.data?.find((item) => item.id === botId);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [initial, setInitial] = useState<Draft>(emptyDraft);
  const initializedId = useRef<string | undefined>(undefined);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [permissionOpen, setPermissionOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [allowLeave, setAllowLeave] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  useEffect(() => {
    if (bot && initializedId.current !== bot.id) {
      const next = fromBot(bot);
      setDraft(next);
      setInitial(next);
      initializedId.current = bot.id;
    }
  }, [bot]);

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
    if (busy || !draft.name.trim() || invalidConfiguration) return;
    setBusy(true);
    try {
      const payload = botUpdatePayload(draft);
      if (botId) {
        await updateBot(botId, payload);
      } else {
        await createBot({
          name: payload.name,
          color: payload.color,
          instructions: payload.instructions,
          runtimeMode: payload.runtimeMode,
          ...(draft.model ? { model: draft.model } : {}),
          ...(draft.reasoningEffort ? { reasoningEffort: draft.reasoningEffort } : {}),
          ...(draft.serviceTier ? { serviceTier: draft.serviceTier } : {}),
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["bots", serverUrl] });
      setAllowLeave(true);
      requestAnimationFrame(() => router.back());
    } catch (error) {
      Alert.alert(botText("保存失败", "Could not save BOT"), botError(error));
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
          accessibilityState={{ disabled: busy || !draft.name.trim() || invalidConfiguration }}
          disabled={busy || !draft.name.trim() || invalidConfiguration}
          onPress={() => void save()}
        >
          <Text
            style={[
              styles.save,
              {
                color: theme.powerBlue,
                opacity: busy || !draft.name.trim() || invalidConfiguration ? 0.45 : 1,
              },
            ]}
          >
            {busy ? botText("保存中", "Saving") : botText("保存", "Save")}
          </Text>
        </Pressable>
      }
    >
      {botId && botsQuery.isLoading ? <ActivityIndicator color={theme.powerBlue} /> : null}
      {botId && !botsQuery.isLoading && !bot ? (
        <Text style={styles.error}>
          {botError(botsQuery.error ?? new Error(botText("BOT 不存在", "BOT unavailable")))}
        </Text>
      ) : null}
      {!botId || bot ? (
        <ScrollView
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
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
});
