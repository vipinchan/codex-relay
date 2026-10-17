import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Bot, BotConversation } from "codex-relay/api-schema";
import { useRef, useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatControls } from "@/components/chat/ChatControls";
import {
  clearPendingBotSubmission,
  getPendingBotSubmission,
  savePendingBotSubmission,
} from "@/state/bot-submission-store";
import { modelForSelection, reasoningEffortForModel } from "@/components/chat/model-picker-options";
import { Text } from "@/components/ui/text";
import {
  createUuidV4,
  getBotConversationRuntime,
  getCodexRelayServerUrl,
  getCodexRelayPairingIdentity,
  listSkills,
  sendBotMessage,
  updateBotConversationPreferences,
  type BotConversationPreferencesPatch,
} from "@/lib/codex-relay-api";
import { attachComposerImages } from "@/lib/composer-images";
import { serverStateKeys, serverStateQueryFns } from "@/lib/server-state";
import {
  getComposerAttachments,
  getComposerDraft,
  getComposerSkills,
  setComposerAttachments,
  setComposerDraft,
  setComposerSkills,
} from "@/state/chat-store";

import {
  botComposerKey,
  createBotSubmission,
  remainingBotDraft,
  type BotSubmission,
} from "./bot-direct-compose";
import { botError, botText } from "./bot-ui";

export function BotDirectComposer({
  conversation,
  bot,
  isFocused,
  hasRunning,
  onCancel,
  onSent,
}: {
  conversation: BotConversation;
  bot: Bot;
  isFocused: boolean;
  hasRunning: boolean;
  onCancel: () => void;
  onSent: () => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const serverUrl = getCodexRelayServerUrl();
  const composerId = botComposerKey(getCodexRelayPairingIdentity(), conversation.id);
  const busySend = useRef(false);
  const busyAttach = useRef(false);
  const preferenceTail = useRef(Promise.resolve());
  const preferenceWrites = useRef(0);
  const [attaching, setAttaching] = useState(false);
  const [sending, setSending] = useState(false);
  const [pending, setPending] = useState<BotSubmission | undefined>(() =>
    getPendingBotSubmission(composerId),
  );
  const [error, setError] = useState(() =>
    getPendingBotSubmission(composerId)
      ? botText(
          "上次发送状态未确认，可沿用原请求重试。",
          "The previous send is unconfirmed. Retry with the original request.",
        )
      : "",
  );
  const [savingPreferences, setSavingPreferences] = useState(0);
  const [optimisticPreferences, setOptimisticPreferences] =
    useState<BotConversation["preferences"]>();
  const desiredPreferences = useRef<BotConversation["preferences"] | undefined>(undefined);
  const modelsQuery = useQuery({
    queryKey: serverStateKeys.models(),
    queryFn: serverStateQueryFns.models,
  });
  const limitsQuery = useQuery({
    queryKey: serverStateKeys.rateLimits(),
    queryFn: serverStateQueryFns.rateLimits,
  });
  const skillsQuery = useQuery({
    queryKey: ["bot-skills", serverUrl, conversation.workspacePath],
    queryFn: () => listSkills(conversation.workspacePath),
  });
  const runtimeQuery = useQuery({
    queryKey: ["bot-conversation-runtime", serverUrl, conversation.id],
    queryFn: () => getBotConversationRuntime(conversation.id),
    refetchInterval: isFocused ? (hasRunning ? 1500 : 4000) : false,
  });
  const models = modelsQuery.data?.models ?? [];
  const preferences = optimisticPreferences ?? conversation.preferences;
  const selectedModel = preferences.model ?? bot.model;
  const model = modelForSelection(models, selectedModel);
  const modelChanged = !!preferences.model && preferences.model !== bot.model;
  const effort = reasoningEffortForModel(
    model,
    preferences.reasoningEffort ?? (modelChanged ? undefined : bot.reasoningEffort),
  );
  const tier =
    "serviceTier" in preferences
      ? (preferences.serviceTier ?? undefined)
      : modelChanged
        ? undefined
        : bot.serviceTier;
  const supportsImages = !model?.inputModalities || model.inputModalities.includes("image");
  const running =
    hasRunning ||
    runtimeQuery.data?.runtimeState === "running" ||
    runtimeQuery.data?.runtimeState === "queued";

  function changePreferences(patch: BotConversationPreferencesPatch) {
    const key = ["bot-conversation", serverUrl, conversation.id];
    preferenceWrites.current++;
    setSavingPreferences((count) => count + 1);
    const next = { ...(desiredPreferences.current ?? conversation.preferences) };
    for (const [field, value] of Object.entries(patch)) {
      if (value === null && field !== "serviceTier") delete next[field as keyof typeof next];
      else if (value !== undefined) Object.assign(next, { [field]: value });
    }
    desiredPreferences.current = next;
    setOptimisticPreferences(next);
    preferenceTail.current = preferenceTail.current.then(async () => {
      try {
        await updateBotConversationPreferences(conversation.id, patch);
      } catch (caught) {
        Alert.alert(
          botText("会话配置保存失败", "Could not save conversation settings"),
          botError(caught),
        );
      } finally {
        if (preferenceWrites.current === 1) {
          await queryClient.invalidateQueries({ queryKey: key });
          if (preferenceWrites.current === 1) {
            desiredPreferences.current = undefined;
            setOptimisticPreferences(undefined);
          }
          void queryClient.invalidateQueries({
            queryKey: ["bot-conversation-runtime", serverUrl, conversation.id],
          });
        }
        preferenceWrites.current--;
        setSavingPreferences((count) => count - 1);
      }
    });
  }

  async function attachImages() {
    if (busyAttach.current) return;
    if (!supportsImages) {
      Alert.alert(
        botText("模型不支持图片", "This model does not accept images"),
        botText(
          "切换到支持图片的模型后重试，草稿会保留。",
          "Choose a model that accepts images. Your draft is preserved.",
        ),
      );
      return;
    }
    busyAttach.current = true;
    setAttaching(true);
    try {
      await attachComposerImages(composerId);
    } catch (caught) {
      Alert.alert(botText("添加图片失败", "Could not attach image"), botError(caught));
    } finally {
      busyAttach.current = false;
      setAttaching(false);
    }
  }

  async function send(retry?: BotSubmission) {
    if (
      busySend.current ||
      busyAttach.current ||
      preferenceWrites.current ||
      ((pending || getPendingBotSubmission(composerId)) && !retry)
    )
      return;
    const submitted =
      retry ??
      createBotSubmission(createUuidV4(), {
        text: getComposerDraft(composerId),
        attachments: getComposerAttachments(composerId),
        skills: getComposerSkills(composerId),
      });
    if (!submitted.text && !submitted.attachments.length) return;
    if (!retry && submitted.attachments.length && !supportsImages) {
      Alert.alert(
        botText("模型不支持图片", "This model does not accept images"),
        botText(
          "请切换模型或移除图片。草稿和图片已保留。",
          "Switch models or remove the images. Your draft and images are preserved.",
        ),
      );
      return;
    }
    busySend.current = true;
    setSending(true);
    setPending(submitted);
    setError("");
    try {
      savePendingBotSubmission(composerId, submitted);
      const { attachmentIds: _ids, draftText: _draft, ...request } = submitted;
      await sendBotMessage(conversation.id, request);
      const remaining = remainingBotDraft(
        {
          text: getComposerDraft(composerId),
          attachments: getComposerAttachments(composerId),
          skills: getComposerSkills(composerId),
        },
        submitted,
      );
      setComposerDraft(remaining.text, composerId);
      setComposerAttachments(remaining.attachments, composerId);
      setComposerSkills(remaining.skills, composerId);
      setPending(undefined);
      clearPendingBotSubmission(composerId, submitted.requestId);
      void queryClient.invalidateQueries({
        queryKey: ["bot-conversation-runtime", serverUrl, conversation.id],
      });
      await onSent();
    } catch (caught) {
      setError(botError(caught));
    } finally {
      busySend.current = false;
      setSending(false);
    }
  }

  return (
    <View>
      {error && pending ? (
        <View style={styles.retryBar}>
          <View style={styles.retryCopy}>
            <Text style={styles.error}>{error}</Text>
            <Text numberOfLines={2} style={styles.hint}>
              {botText("原消息：", "Original message: ")}
              {pending.text || botText("图片消息", "Image message")}
              {pending.attachments.length
                ? ` · ${pending.attachments.length} ${botText("张图片", "image(s)")}`
                : ""}
            </Text>
            <Text style={styles.hint}>
              {botText(
                "重试会发送原消息；修改后的草稿会保留。",
                "Retry sends the original message. Changes to your draft are kept.",
              )}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={sending}
            onPress={() => void send(pending)}
          >
            <Text style={styles.action}>{botText("重试原消息", "Retry original")}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={sending}
            onPress={() =>
              Alert.alert(
                botText("放弃重试？", "Discard retry?"),
                botText(
                  "消息可能已送达，请先检查聊天记录。草稿和图片会保留。",
                  "The message may have arrived. Check the chat first. Your draft and images will remain.",
                ),
                [
                  { text: botText("取消", "Cancel"), style: "cancel" },
                  {
                    text: botText("放弃", "Discard"),
                    onPress: () => {
                      clearPendingBotSubmission(composerId, pending.requestId);
                      setPending(undefined);
                      setError("");
                      void onSent();
                    },
                  },
                ],
              )
            }
          >
            <Text style={styles.action}>{botText("放弃", "Discard")}</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.scope}>
        <Text numberOfLines={1} style={styles.hint}>
          {savingPreferences
            ? botText("正在保存会话配置…", "Saving conversation settings…")
            : Object.keys(preferences).length
              ? botText("使用当前会话配置", "Using conversation settings")
              : botText("使用 BOT 默认配置", "Using BOT defaults")}
          {running ? botText(" · 修改下次任务生效", " · Changes apply to the next task") : ""}
        </Text>
      </View>
      <ChatComposer
        composerThreadId={composerId}
        collaborationMode="default"
        placeholder={botText(`发消息给 ${bot.name}`, `Message ${bot.name}`)}
        disabled={sending || !!pending || savingPreferences > 0}
        inputEditable
        isAttachingImage={attaching}
        isRunning={running}
        contextWindowUsage={runtimeQuery.data?.contextWindowUsage ?? undefined}
        footer={
          <ChatControls
            models={models}
            runtimeMode={preferences.runtimeMode ?? bot.runtimeMode}
            selectedModel={selectedModel}
            selectedReasoningEffort={effort}
            selectedServiceTier={tier}
            onRuntimeModeChange={(runtimeMode) => changePreferences({ runtimeMode })}
            onSelectedModelChange={(nextModel, nextEffort) => {
              const next = models.find((item) => item.model === nextModel);
              changePreferences({
                model: nextModel,
                reasoningEffort: reasoningEffortForModel(next, nextEffort) ?? null,
                serviceTier: next?.serviceTiers.some((item) => item.id === tier) ? tier : null,
              });
            }}
            onSelectedReasoningEffortChange={(reasoningEffort) =>
              changePreferences({ reasoningEffort: reasoningEffort ?? null })
            }
            onSelectedServiceTierChange={(serviceTier) =>
              changePreferences({ serviceTier: serviceTier ?? null })
            }
          />
        }
        onAttachImage={attachImages}
        onCancel={onCancel}
        onSend={() => void send()}
        onRefreshUsageStatus={() => {
          void runtimeQuery.refetch();
          void limitsQuery.refetch();
        }}
        queuedPrompts={[]}
        rateLimitBuckets={limitsQuery.data?.buckets ?? []}
        skills={skillsQuery.data?.skills ?? []}
        skillsLoadState={
          skillsQuery.isPending ? "loading" : skillsQuery.isError ? "failed" : "loaded"
        }
        workspacePath={conversation.workspacePath}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  retryBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 12,
    backgroundColor: "#2E1D23",
  },
  error: { color: "#FFB3C1", fontSize: 12 },
  retryCopy: { flex: 1, gap: 5 },
  action: { color: "#6EA8FF", fontSize: 13 },
  scope: { paddingHorizontal: 18, paddingTop: 5, paddingBottom: 3 },
  hint: { color: "#929AA8", fontSize: 11 },
});
