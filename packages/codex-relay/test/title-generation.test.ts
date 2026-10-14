import { describe, expect, it, vi } from "vitest";

import {
  buildTitleGenerationPrompt,
  generateTitleWithAppServer,
  normalizeGeneratedTitle,
} from "../src/title-generation.js";

describe("title generation", () => {
  it("builds a bounded prompt from the first and latest conversation turns", () => {
    const firstPrompt = `首条提问 ${"a".repeat(2_000)}`;
    const recentPrompt = `最近提问 ${"b".repeat(2_000)}`;
    const recentResponse = `最近回复 ${"c".repeat(2_000)}`;

    const prompt = buildTitleGenerationPrompt({
      firstPrompt,
      recentPrompt,
      recentResponse,
    });

    expect(prompt).toContain("Use the same language as the first user message.");
    expect(prompt).toContain("First user message:\n首条提问");
    expect(prompt).toContain("Latest user message:\n最近提问");
    expect(prompt).toContain("Latest assistant response:\n最近回复");
    expect(prompt.length).toBeLessThan(4_000);
    expect(prompt).toContain("Return only the title");
    expect(prompt).toContain("Do not inspect files or use tools.");
  });

  it("normalizes model output into a single title within the thread title limit", () => {
    expect(normalizeGeneratedTitle("  “Fix long-session loading”\nExplanation")).toBe(
      "Fix long-session loading",
    );
    expect(normalizeGeneratedTitle("\n  ")).toBeUndefined();
    expect(normalizeGeneratedTitle("x".repeat(121))).toHaveLength(120);
  });

  it("uses the selected model in a temporary read-only thread and archives it", async () => {
    const archiveThread = vi.fn<() => Promise<void>>(async () => undefined);
    const startThread = vi.fn<() => Promise<{ id: string; cwd: string }>>(async () => ({
      id: "title-thread",
      cwd: "/workspace",
    }));
    const startTurn = vi.fn<
      () => Promise<{
        id: string;
        items: Array<{ id: string; type: "agentMessage"; text: string }>;
        status: string;
        startedAt: number;
        completedAt: number;
      }>
    >(async () => ({
      id: "title-turn",
      items: [{ id: "title", type: "agentMessage" as const, text: "整理历史会话" }],
      status: "completed",
      startedAt: 1,
      completedAt: 2,
    }));
    const onNotification = vi.fn<() => () => void>(() => () => undefined);

    await expect(
      generateTitleWithAppServer({
        appServer: { archiveThread, onNotification, startThread, startTurn } as never,
        context: { firstPrompt: "请整理历史会话" },
        cwd: "/workspace",
        effort: "low",
        model: "gpt-6.1-codex",
      }),
    ).resolves.toBe("整理历史会话");

    expect(startThread).toHaveBeenCalledWith(
      expect.objectContaining({
        approvalPolicy: "never",
        model: "gpt-6.1-codex",
        sandbox: "read-only",
        threadSource: "codex-relay-title",
      }),
    );
    expect(startTurn).toHaveBeenCalledWith(
      expect.objectContaining({ effort: "low", model: "gpt-6.1-codex", threadId: "title-thread" }),
    );
    expect(archiveThread).toHaveBeenCalledWith({ threadId: "title-thread" });
  });

  it("rejects a failed direct turn result and still archives its helper thread", async () => {
    const archiveThread = vi.fn<() => Promise<void>>(async () => undefined);
    const appServer = {
      archiveThread,
      onNotification: vi.fn<() => () => void>(() => () => undefined),
      startThread: vi.fn<() => Promise<{ id: string; cwd: string }>>(async () => ({
        id: "title-thread",
        cwd: "/workspace",
      })),
      startTurn: vi.fn<
        () => Promise<{
          id: string;
          items: Array<{ id: string; type: "agentMessage"; text: string }>;
          status: string;
          startedAt: number;
          completedAt: number;
        }>
      >(async () => ({
        id: "title-turn",
        items: [{ id: "title", type: "agentMessage" as const, text: "不要使用此结果" }],
        status: "failed",
        startedAt: 1,
        completedAt: 2,
      })),
    };

    await expect(
      generateTitleWithAppServer({
        appServer: appServer as never,
        context: { firstPrompt: "生成标题" },
        cwd: "/workspace",
      }),
    ).rejects.toThrow("did not complete title generation");
    expect(archiveThread).toHaveBeenCalledWith({ threadId: "title-thread" });
  });
});
