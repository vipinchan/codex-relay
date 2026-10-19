import { useRef, useState } from "react";
import { Alert } from "react-native";

import { attachComposerImages } from "@/lib/composer-images";
import { createUuidV4, sendBotMessage } from "@/lib/codex-relay-api";
import {
  clearPendingBotSubmission,
  getPendingBotSubmission,
  savePendingBotSubmission,
} from "@/state/bot-submission-store";
import {
  getComposerAttachments,
  getComposerDraft,
  getComposerSkills,
  setComposerAttachments,
  setComposerDraft,
  setComposerSkills,
} from "@/state/chat-store";

import { createBotSubmission, remainingBotDraft, type BotSubmission } from "./bot-direct-compose";
import { botError, botText } from "./bot-ui";

export function useBotSubmission({
  composerId,
  conversationId,
  supportsImages = true,
  isBlocked,
  mentionBotIds,
  onAccepted,
  onSent,
}: {
  composerId: string;
  conversationId: string;
  supportsImages?: boolean;
  isBlocked?: () => boolean;
  mentionBotIds?: string[];
  onAccepted?: (submitted: BotSubmission) => void;
  onSent: () => Promise<void>;
}) {
  const busySend = useRef(false);
  const busyAttach = useRef(false);
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
      isBlocked?.() ||
      ((pending || getPendingBotSubmission(composerId)) && !retry)
    )
      return;
    const submitted = retry ?? {
      ...createBotSubmission(createUuidV4(), {
        text: getComposerDraft(composerId),
        attachments: getComposerAttachments(composerId),
        skills: getComposerSkills(composerId),
      }),
      ...(mentionBotIds ? { mentionBotIds: [...mentionBotIds] } : {}),
    };
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
      await sendBotMessage(conversationId, request);
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
      onAccepted?.(submitted);
      await onSent();
    } catch (caught) {
      setError(botError(caught));
    } finally {
      busySend.current = false;
      setSending(false);
    }
  }

  function discardPending() {
    if (!pending || sending) return;
    clearPendingBotSubmission(composerId, pending.requestId);
    setPending(undefined);
    setError("");
    void onSent().catch(() => undefined);
  }

  return { attaching, sending, pending, error, attachImages, send, discardPending };
}
