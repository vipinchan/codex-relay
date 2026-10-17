import { PromptAttachmentSchema, PromptSkillSchema } from "codex-relay/api-schema";
import { createMMKV } from "react-native-mmkv";

import type { BotSubmission } from "../components/bots/bot-direct-compose.js";

const storage = createMMKV({ id: "codex-relay-bot-submissions" });
function parseSubmission(input: unknown): BotSubmission {
  if (!input || typeof input !== "object") throw new Error("Invalid pending BOT submission.");
  const value = input as Record<string, unknown>;
  if (
    typeof value.requestId !== "string" ||
    !value.requestId ||
    typeof value.text !== "string" ||
    typeof value.draftText !== "string" ||
    !Array.isArray(value.attachmentIds) ||
    value.attachmentIds.length > 6 ||
    !value.attachmentIds.every((id): id is string => typeof id === "string")
  ) {
    throw new Error("Invalid pending BOT submission.");
  }
  return {
    requestId: value.requestId,
    text: value.text,
    draftText: value.draftText,
    attachmentIds: value.attachmentIds,
    attachments: PromptAttachmentSchema.array().max(6).parse(value.attachments),
    skills: PromptSkillSchema.array().max(12).parse(value.skills),
  };
}

export function getPendingBotSubmission(composerId: string): BotSubmission | undefined {
  const content = storage.getString(composerId);
  if (!content) return undefined;
  try {
    return parseSubmission(JSON.parse(content));
  } catch {
    return undefined;
  }
}

export function savePendingBotSubmission(composerId: string, submission: BotSubmission) {
  storage.set(composerId, JSON.stringify(parseSubmission(submission)));
}

export function clearPendingBotSubmission(composerId: string, requestId: string) {
  if (getPendingBotSubmission(composerId)?.requestId === requestId) storage.remove(composerId);
}
