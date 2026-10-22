import type { BotMessage } from "codex-relay/api-schema";
import { useCallback, useEffect, useRef, useState } from "react";

import { listBotMessages } from "@/lib/codex-relay-api";

import { mergeBotMessagePages } from "./bot-compose";

type MessagePage = { messages: BotMessage[]; nextCursor: string | null };
type HistoryState = {
  scopeKey: string;
  olderMessages: BotMessage[];
  olderCursor: string | null;
  hasOlderCursor: boolean;
};

const EMPTY_MESSAGES: BotMessage[] = [];

export function useBotMessageHistory(
  scopeKey: string,
  conversationId: string,
  firstPage: MessagePage | undefined,
) {
  const [history, setHistory] = useState<HistoryState>({
    scopeKey,
    olderMessages: EMPTY_MESSAGES,
    olderCursor: null,
    hasOlderCursor: false,
  });
  const scopeKeyRef = useRef(scopeKey);
  const firstPageRef = useRef(firstPage);
  const historyRef = useRef(history);
  const mountedRef = useRef(false);
  const generationRef = useRef(0);
  scopeKeyRef.current = scopeKey;
  firstPageRef.current = firstPage;
  historyRef.current = history;

  useEffect(() => {
    mountedRef.current = true;
    generationRef.current += 1;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
    };
  }, [scopeKey]);

  const currentHistory = history.scopeKey === scopeKey ? history : undefined;
  const olderMessages = currentHistory?.olderMessages ?? EMPTY_MESSAGES;
  const hasOlder = currentHistory?.hasOlderCursor
    ? !!currentHistory.olderCursor
    : !!firstPage?.nextCursor;

  const loadEarlier = useCallback(async (): Promise<boolean> => {
    const current = historyRef.current;
    const cursor =
      current.scopeKey === scopeKey && current.hasOlderCursor
        ? current.olderCursor
        : firstPageRef.current?.nextCursor;
    if (!cursor) return false;

    const generation = generationRef.current;
    const page = await listBotMessages(conversationId, cursor);
    if (
      !mountedRef.current ||
      scopeKeyRef.current !== scopeKey ||
      generationRef.current !== generation
    )
      return false;
    if (page.nextCursor === cursor) {
      throw new Error("Earlier BOT history did not advance. Retry loading earlier messages.");
    }
    setHistory((latest) => {
      if (scopeKeyRef.current !== scopeKey) return latest;
      const older = latest.scopeKey === scopeKey ? latest.olderMessages : EMPTY_MESSAGES;
      return {
        scopeKey,
        olderMessages: mergeBotMessagePages(older, page.messages),
        olderCursor: page.nextCursor,
        hasOlderCursor: true,
      };
    });
    return true;
  }, [conversationId, scopeKey]);

  return { olderMessages, hasOlder, loadEarlier };
}
