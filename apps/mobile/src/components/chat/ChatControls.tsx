import type { CodexModel, ReasoningEffort, RuntimeMode } from "codex-relay/api-schema";
import { useState } from "react";

import { useTheme } from "@/hooks/use-theme";
import { hapticSelection } from "@/lib/haptics";

import { ChatControlRail } from "./ChatControlRail";
import { ChatModelPickerSheet } from "./ChatModelPickerSheet";
import {
  fastServiceTierForModel,
  modelButtonLabel,
  modelForSelection,
  reasoningEffortForModel,
} from "./model-picker-options";
import { RuntimeModeSheet, runtimeOptionForMode } from "./RuntimeModeSheet";

export function ChatControls({
  models,
  onRuntimeModeChange,
  onSelectedModelChange,
  onSelectedReasoningEffortChange,
  onSelectedServiceTierChange,
  runtimeMode,
  selectedModel,
  selectedReasoningEffort,
  selectedServiceTier,
}: {
  models: CodexModel[];
  onRuntimeModeChange: (mode: RuntimeMode) => void;
  onSelectedModelChange: (model: string, reasoningEffort?: ReasoningEffort) => void;
  onSelectedReasoningEffortChange: (reasoningEffort: ReasoningEffort | undefined) => void;
  onSelectedServiceTierChange: (serviceTier: string | undefined) => void;
  runtimeMode: RuntimeMode;
  selectedModel?: string;
  selectedReasoningEffort?: ReasoningEffort;
  selectedServiceTier?: string;
}) {
  const theme = useTheme();
  const [activePicker, setActivePicker] = useState<"model" | "runtime" | undefined>();
  const activeModel = modelForSelection(models, selectedModel);
  const fastServiceTier = fastServiceTierForModel(activeModel);
  const isFastModeEnabled = Boolean(fastServiceTier && selectedServiceTier === fastServiceTier.id);
  const effectiveReasoningEffort = activeModel
    ? reasoningEffortForModel(activeModel, selectedReasoningEffort)
    : selectedReasoningEffort;
  const selectedRuntimeOption = runtimeOptionForMode(runtimeMode, theme);
  const modelLabel = modelButtonLabel(activeModel, effectiveReasoningEffort, selectedModel);

  function closePicker() {
    setActivePicker(undefined);
  }

  function openPicker(picker: "model" | "runtime") {
    hapticSelection();
    setActivePicker(picker);
  }

  return (
    <>
      <ChatControlRail
        isFastModeEnabled={isFastModeEnabled}
        modelDisabled={models.length === 0}
        modelLabel={modelLabel}
        onModelPress={() => openPicker("model")}
        onRuntimePress={() => openPicker("runtime")}
        runtimeOption={selectedRuntimeOption}
      />
      <RuntimeModeSheet
        onClose={closePicker}
        onSelect={(mode) => {
          onRuntimeModeChange(mode);
          closePicker();
        }}
        runtimeMode={runtimeMode}
        visible={activePicker === "runtime"}
      />
      <ChatModelPickerSheet
        activeModel={activeModel}
        models={models}
        onClose={closePicker}
        onModelSelect={onSelectedModelChange}
        onReasoningSelect={onSelectedReasoningEffortChange}
        onServiceTierChange={onSelectedServiceTierChange}
        selectedModel={selectedModel}
        selectedReasoningEffort={effectiveReasoningEffort}
        selectedServiceTier={selectedServiceTier}
        visible={activePicker === "model"}
      />
    </>
  );
}
