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
