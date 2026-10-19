import type { PromptAttachment, PromptSkill } from "codex-relay/api-schema";

type DraftImage = {
  id: string;
  uri: string;
  path: string;
  mimeType?: string;
  name?: string;
  url?: string;
};
type Draft = { text: string; attachments: DraftImage[]; skills: PromptSkill[] };

export type BotSubmission = {
  requestId: string;
  text: string;
  attachments: PromptAttachment[];
  skills: PromptSkill[];
  attachmentIds: string[];
  draftText: string;
  mentionBotIds?: string[];
};

export function botComposerKey(pairingIdentity: string, conversationId: string) {
  return `bot:${JSON.stringify([pairingIdentity, conversationId])}`;
}

export function createBotSubmission(requestId: string, draft: Draft): BotSubmission {
  return {
    requestId,
    text:
      draft.text.trim() ||
      (draft.skills.length && !draft.attachments.length
        ? "Use the selected skills for this task."
        : ""),
    attachments: draft.attachments.map(({ path, mimeType, name, url }) => ({
      type: "image",
      path,
      ...(mimeType ? { mimeType } : {}),
      ...(name ? { name } : {}),
      ...(url ? { url } : {}),
    })),
    skills: draft.skills.map(({ name, path }) => ({ name, path })),
    attachmentIds: draft.attachments.map(({ id }) => id),
    draftText: draft.text,
  };
}

export function remainingBotDraft<T extends Draft>(current: T, submitted: BotSubmission): T {
  const sentImages = new Set(submitted.attachmentIds);
  const sentSkills = new Set(
    submitted.skills.map(({ name, path }) => JSON.stringify([name, path])),
  );
  return {
    ...current,
    text: current.text === submitted.draftText ? "" : current.text,
    attachments: current.attachments.filter(({ id }) => !sentImages.has(id)),
    skills: current.skills.filter(
      ({ name, path }) => !sentSkills.has(JSON.stringify([name, path])),
    ),
  };
}
