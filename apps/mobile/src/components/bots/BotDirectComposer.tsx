import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Bot, BotConversation } from "codex-relay/api-schema";
import { useRef, useState } from "react";
import { Alert, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatControls } from "@/components/chat/ChatControls";
import { modelForSelection, reasoningEffortForModel } from "@/components/chat/model-picker-options";
import { Text } from "@/components/ui/text";
import {
  getBotConversationRuntime,
  getCodexRelayServerUrl,
  getCodexRelayPairingIdentity,
  listSkills,
  updateBotConversationPreferences,
  type BotConversationPreferencesPatch,
} from "@/lib/codex-relay-api";
import { serverStateKeys, serverStateQueryFns } from "@/lib/server-state";

import { botComposerKey } from "./bot-direct-compose";
import { BotSubmissionRetry } from "./BotSubmissionRetry";
import { botError, botText } from "./bot-ui";
import { useBotSubmission } from "./use-bot-submission";

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
  const preferenceTail = useRef(Promise.resolve());
  const preferenceWrites = useRef(0);
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
  const { attaching, sending, pending, error, attachImages, send, discardPending } =
    useBotSubmission({
      composerId,
      conversationId: conversation.id,
      supportsImages,
      isBlocked: () => preferenceWrites.current > 0,
      onSent: async () => {
        void queryClient.invalidateQueries({
          queryKey: ["bot-conversation-runtime", serverUrl, conversation.id],
        });
        await onSent();
      },
    });

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

  return (
    <View>
      <BotSubmissionRetry
        pending={pending}
        error={error}
        sending={sending}
        onRetry={() => {
          if (pending) void send(pending);
        }}
        onDiscard={discardPending}
      />
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
  scope: { paddingHorizontal: 18, paddingTop: 5, paddingBottom: 3 },
  hint: { color: "#929AA8", fontSize: 11 },
});
