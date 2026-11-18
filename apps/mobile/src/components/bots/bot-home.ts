export function botHomeSummary(instructions: string): string | undefined {
  let codeFence: string | undefined;
  for (const rawLine of instructions.split(/\r?\n/)) {
    const line = rawLine.trim();
    const fence = /^(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (!codeFence) codeFence = fence[1];
      else if (fence[1].startsWith(codeFence) && !fence[2].trim()) codeFence = undefined;
      continue;
    }
    if (codeFence || !line || /^(?:#|>|[|<]|[-*_]{3,}$)/.test(line)) continue;

    const text = line
      .replace(/^(?:[-*+]|\d+[.)])\s+/, "")
      .replace(/^!\[[^\]]*\]\([^)]+\)\s*/, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/(\*{1,3}|_{1,3}|`+|~~)(\S.*?\S|\S)\1/g, "$2")
      .trim();
    if (
      !/\p{L}/u.test(text) ||
      /^(?:你(?:是|将|的|要|需要|负责|必须|应该)|角色(?:定位|设定)?\s*[:：]|(?:you(?:\s+(?:are|must|should|will|act|need)\b|'re\b)|your\s+(?:role|task|job|goal)\b))/i.test(
        text,
      )
    ) {
      continue;
    }
    return text.match(/^.*?(?:[。！？!?]|\.(?=\s|$))/)?.[0] ?? text;
  }
  return undefined;
}

export async function resolveDirectBotConversation<
  Conversation extends { kind: "direct" | "group"; botId?: string | null },
>(
  botId: string,
  list: () => Promise<Conversation[]>,
  create: (input: { kind: "direct"; botId: string }) => Promise<Conversation>,
): Promise<Conversation> {
  const conversations = await list();
  const existing = conversations.find(
    (conversation) => conversation.kind === "direct" && conversation.botId === botId,
  );
  return existing ?? create({ kind: "direct", botId });
}
