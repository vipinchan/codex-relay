import type { Bot, CodexModel, ReasoningEffort } from "codex-relay/api-schema";

export type BotEditorDraft = {
  name: string;
  color: string;
  instructions: string;
  model: string | undefined;
  reasoningEffort: ReasoningEffort | undefined;
  serviceTier: string | undefined;
  runtimeMode: Bot["runtimeMode"];
};

export function botUpdatePayload(draft: BotEditorDraft) {
  return {
    name: draft.name.trim(),
    color: draft.color,
    instructions: draft.instructions.trim(),
    runtimeMode: draft.runtimeMode,
    model: draft.model ?? null,
    reasoningEffort: draft.reasoningEffort ?? null,
    serviceTier: draft.serviceTier ?? null,
  };
}

export function botModelUnavailable(
  model: string | undefined,
  catalogLoaded: boolean,
  models: CodexModel[],
) {
  return !!model && catalogLoaded && !models.some((item) => item.model === model);
}
