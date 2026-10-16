export function orderedMentionIds(selected: string[], members: string[]): string[] {
  const wanted = new Set(selected);
  return members.filter((id) => wanted.has(id));
}

export function mentionPayload(selected: string[], members: string[]): string[] | undefined {
  const ids = orderedMentionIds(selected, members);
  return ids.length ? ids : undefined;
}

export function mergeBotMessagePages<T extends { id: string; seq: number }>(
  current: T[],
  older: T[],
): T[] {
  const byId = new Map<string, T>();
  for (const message of [...older, ...current]) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => a.seq - b.seq);
}

export function mentionQuery(text: string): string | null {
  const match = text.match(/(?:^|\s)@([^\s@]*)$/);
  return match ? match[1].toLocaleLowerCase() : null;
}

export function removeMentionToken(text: string): string {
  return text.replace(/(^|\s)@[^\s@]*$/, "$1");
}

export function findMessageIndex<T extends { id: string }>(messages: T[], id: string): number {
  return messages.findIndex((message) => message.id === id);
}

export async function loadPagesUntilMessage<T extends { id: string }>(
  targetId: string,
  firstCursor: string | null,
  fetchPage: (cursor: string) => Promise<{ messages: T[]; nextCursor: string | null }>,
  onPage: (page: { messages: T[]; nextCursor: string | null }) => void,
  isCancelled: () => boolean,
): Promise<"found" | "unavailable" | "cancelled"> {
  let cursor = firstCursor;
  while (cursor && !isCancelled()) {
    const page = await fetchPage(cursor);
    if (isCancelled()) return "cancelled";
    onPage(page);
    if (findMessageIndex(page.messages, targetId) >= 0) return "found";
    cursor = page.nextCursor;
  }
  return isCancelled() ? "cancelled" : "unavailable";
}
