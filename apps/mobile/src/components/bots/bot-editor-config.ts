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
  const payload: {
    name: string;
    color: string;
    instructions: string;
    runtimeMode: Bot["runtimeMode"];
    model?: string | null;
    reasoningEffort?: ReasoningEffort | null;
    serviceTier?: string | null;
  } = {
    name: draft.name.trim(),
    color: draft.color,
    instructions: draft.instructions.trim(),
    runtimeMode: draft.runtimeMode,
  };
  if (draft.model) {
    payload.model = draft.model;
    if (draft.reasoningEffort !== undefined) payload.reasoningEffort = draft.reasoningEffort;
    if (draft.serviceTier !== undefined) payload.serviceTier = draft.serviceTier;
  } else {
    payload.model = null;
    payload.reasoningEffort = null;
    payload.serviceTier = null;
  }
  return payload;
}

export function botModelUnavailable(
  model: string | undefined,
  catalogLoaded: boolean,
  models: CodexModel[],
) {
  return !!model && catalogLoaded && !models.some((item) => item.model === model);
}
