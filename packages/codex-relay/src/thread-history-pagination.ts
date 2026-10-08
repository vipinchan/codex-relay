import type { ChatMessage } from "./api-schema.js";

type HistoryCursor = {
  source: "app-server" | "local" | "rollout";
  threadId: string;
  value: string;
};

export function historyCursor(cursor: HistoryCursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function parseHistoryPage(threadId: string, limit: string | undefined, cursor?: string) {
  if (limit === undefined && cursor === undefined) return undefined;
  if (!limit || !/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 100) {
    throw new Error("History limit must be an integer between 1 and 100.");
  }
  let decoded: HistoryCursor | undefined;
  if (cursor !== undefined) {
    try {
      if (!cursor || cursor.length > 16_384 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error();
      const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
      if (
        value.threadId !== threadId ||
        (value.source !== "app-server" && value.source !== "local" && value.source !== "rollout") ||
        typeof value.value !== "string" ||
        !value.value
      ) {
        throw new Error();
      }
      decoded = value;
    } catch {
      throw new Error("Invalid history cursor. Reload the conversation and try again.");
    }
  }
  return { limit: Number(limit), cursor: decoded };
}

export function localHistoryPage(
  threadId: string,
  messages: ChatMessage[],
  page: NonNullable<ReturnType<typeof parseHistoryPage>>,
) {
  const end = page.cursor
    ? messages.findIndex((message) => message.id === page.cursor!.value)
    : messages.length;
  if (end < 0 || (page.cursor && page.cursor.source !== "local")) {
    throw new Error(
      "History cursor is no longer available. Reload the conversation and try again.",
    );
  }
  const start = Math.max(0, end - page.limit);
  const visible = messages.slice(start, end);
  return {
    messages: visible,
    olderMessagesCursor:
      start > 0 ? historyCursor({ source: "local", threadId, value: visible[0].id }) : null,
  };
}
