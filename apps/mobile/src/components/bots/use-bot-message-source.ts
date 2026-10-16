import type { BotMessage } from "codex-relay/api-schema";
import { useEffect, useRef, useState } from "react";

import { listBotMessages } from "@/lib/codex-relay-api";

import { findMessageIndex, loadPagesUntilMessage, mergeBotMessagePages } from "./bot-compose";

type MessagePage = { messages: BotMessage[]; nextCursor: string | null };

export function useBotMessageSource(
  conversationId: string,
  messageId: string | undefined,
  firstPage: MessagePage | undefined,
) {
  const firstPageRef = useRef(firstPage);
  const firstPageReady = !!firstPage;
  const [olderMessages, setOlderMessages] = useState<BotMessage[]>([]);
  const [olderCursor, setOlderCursor] = useState<string>();
  const [hasOlderCursor, setHasOlderCursor] = useState(false);
  const [sourceStatus, setSourceStatus] = useState<"idle" | "looking" | "found" | "unavailable">(
    "idle",
  );

  useEffect(() => {
    firstPageRef.current = firstPage;
  }, [firstPage]);

  useEffect(() => {
    if (!messageId || !firstPageReady) return;
    const page = firstPageRef.current;
    if (!page) return;
    if (findMessageIndex(page.messages, messageId) >= 0) {
      setSourceStatus("found");
      return;
    }
    let cancelled = false;
    setSourceStatus("looking");
    void loadPagesUntilMessage(
      messageId,
      page.nextCursor,
      (cursor) => listBotMessages(conversationId, cursor),
      (loaded) => {
        setOlderMessages((current) => mergeBotMessagePages(current, loaded.messages));
        setOlderCursor(loaded.nextCursor ?? undefined);
        setHasOlderCursor(true);
      },
      () => cancelled,
    )
      .then((result) => {
        if (!cancelled) setSourceStatus(result === "found" ? "found" : "unavailable");
      })
      .catch(() => {
        if (!cancelled) setSourceStatus("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId, messageId, firstPageReady]);

  function appendOlderPage(page: MessagePage) {
    setOlderMessages((current) => mergeBotMessagePages(current, page.messages));
    setOlderCursor(page.nextCursor ?? undefined);
    setHasOlderCursor(true);
  }

  return { olderMessages, olderCursor, hasOlderCursor, sourceStatus, appendOlderPage };
}
