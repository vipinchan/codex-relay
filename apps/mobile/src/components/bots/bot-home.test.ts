import { describe, expect, it, vi } from "vitest";

import { botHomeSummary, resolveDirectBotConversation } from "./bot-home";

type TestConversation = { id: string; kind: "direct" | "group"; botId: string };
type ListConversations = () => Promise<TestConversation[]>;
type CreateConversation = (input: { kind: "direct"; botId: string }) => Promise<TestConversation>;

describe("botHomeSummary", () => {
  it("uses the first readable sentence rather than role instructions or Markdown headings", () => {
    expect(
      botHomeSummary(
        "# 角色\n你是一位资深编辑，拥有十年经验。\n\n**润色文案**、修正表达。支持多种风格。",
      ),
    ).toBe("润色文案、修正表达。");
    expect(botHomeSummary("## Instructions\nYou are an editor.\n\nPolish drafts. Fix typos.")).toBe(
      "Polish drafts.",
    );
  });

  it("omits raw instructions when no readable summary exists", () => {
    expect(botHomeSummary("# 角色\n你是一个专业助手。\n\n```md\n隐藏细节。\n```")).toBeUndefined();
    expect(botHomeSummary("   ")).toBeUndefined();
  });
});

describe("resolveDirectBotConversation", () => {
  it("opens the existing direct conversation for the selected bot", async () => {
    const existing = { id: "chat", kind: "direct", botId: "bot" } as const;
    const list = vi
      .fn<ListConversations>()
      .mockResolvedValue([
        { id: "group", kind: "group", botId: "bot" },
        { id: "other", kind: "direct", botId: "other-bot" },
        existing,
      ]);
    const create = vi.fn<CreateConversation>();

    await expect(resolveDirectBotConversation("bot", list, create)).resolves.toBe(existing);
    expect(create).not.toHaveBeenCalled();
  });

  it("creates a direct conversation only after the list succeeds and finds no match", async () => {
    const offline = new Error("Offline");
    const created = { id: "new-chat", kind: "direct", botId: "bot" } as const;
    const list = vi.fn<ListConversations>();
    list.mockRejectedValueOnce(offline);
    list.mockResolvedValueOnce([]);
    const create = vi.fn<CreateConversation>().mockResolvedValue(created);

    await expect(resolveDirectBotConversation("bot", list, create)).rejects.toBe(offline);
    expect(create).not.toHaveBeenCalled();
    await expect(resolveDirectBotConversation("bot", list, create)).resolves.toBe(created);
    expect(create).toHaveBeenCalledExactlyOnceWith({ kind: "direct", botId: "bot" });
  });
});
