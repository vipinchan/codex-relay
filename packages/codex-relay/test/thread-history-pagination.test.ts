import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";

function historyServer() {
  const turns = Array.from({ length: 1000 }, (_, index) => ({
    id: `turn-${index}`,
    startedAt: index + 1,
    completedAt: index + 2,
    status: { type: "completed" },
    items: [
      {
        id: `user-${index}`,
        type: "userMessage",
        content: [{ type: "text", text: `Question ${index}`, text_elements: [] }],
      },
      { id: `assistant-${index}`, type: "agentMessage", text: `Answer ${index}` },
    ],
  }));
  const thread = {
    id: "long-thread",
    parentThreadId: null,
    createdAt: 1,
    updatedAt: 1002,
    cwd: "/tmp",
    preview: "Long history",
    name: "Long history",
    modelProvider: "openai",
    source: "app",
    status: { type: "idle" },
    historyMode: "paginated",
  };
  const readThread = vi.fn<(_id: string, options: { includeTurns?: boolean }) => Promise<unknown>>(
    async (_id, options) => ({
      ...thread,
      turns: options.includeTurns ? turns : undefined,
    }),
  );
  const listThreadTurns = vi.fn<
    (
      _id: string,
      options: { cursor?: string; limit: number },
    ) => Promise<{ data: typeof turns; nextCursor: string | null }>
  >(async (_id, options) => {
    const end = options.cursor ? Number(options.cursor) : turns.length;
    const start = Math.max(0, end - options.limit);
    return { data: turns.slice(start, end).reverse(), nextCursor: start ? String(start) : null };
  });
  const appServer = {
    readThread,
    listThreadTurns,
    onNotification: () => () => undefined,
    onRequest: () => () => undefined,
  };
  const app = createApp({ appServer: appServer as never, codex: {} as never });
  return { app, readThread, listThreadTurns, thread, turns };
}

describe("thread history pagination", () => {
  it("opens a thousand-turn conversation without requesting full history", async () => {
    const { app, readThread, listThreadTurns } = historyServer();
    const response = await app.request("/v1/threads/long-thread?limit=20");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(readThread).toHaveBeenCalledExactlyOnceWith("long-thread", { includeTurns: false });
    expect(listThreadTurns).toHaveBeenCalledExactlyOnceWith("long-thread", { limit: 20 });
    expect(body.messages).toHaveLength(40);
    expect(body.messages[0].content).toBe("Question 980");
    expect(body.messages.at(-1).content).toBe("Answer 999");
    expect(body.olderMessagesCursor).toEqual(expect.any(String));
  });

  it("loads older turns in chronological order through the final page", async () => {
    const { app } = historyServer();
    const messages: { id: string; content: string }[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const query = new URLSearchParams({ limit: "100" });
      if (cursor) query.set("cursor", cursor);
      const response = await app.request(`/v1/threads/long-thread?${query}`);
      expect(response.status).toBe(200);
      const body = await response.json();
      messages.unshift(...body.messages);
      cursor = body.olderMessagesCursor;
      pages += 1;
      expect(pages).toBeLessThanOrEqual(10);
    } while (cursor);

    expect(pages).toBe(10);
    expect(messages).toHaveLength(2000);
    expect(new Set(messages.map((message) => message.id)).size).toBe(2000);
    expect(messages[0].content).toBe("Question 0");
    expect(messages.at(-1)?.content).toBe("Answer 999");
  });

  it.each(["limit=0", "limit=101", "limit=1.5", "limit=abc", "cursor=bad", "limit=20&cursor=bad"])(
    "rejects invalid pagination (%s) before reading history",
    async (query) => {
      const { app, readThread } = historyServer();
      const response = await app.request(`/v1/threads/long-thread?${query}`);
      expect(response.status).toBe(400);
      expect(readThread).not.toHaveBeenCalled();
    },
  );

  it("returns a retryable failure when an older page cannot be read", async () => {
    const { app, listThreadTurns, readThread } = historyServer();
    listThreadTurns.mockRejectedValueOnce(new Error("History storage unavailable"));
    const response = await app.request("/v1/threads/long-thread?limit=20");
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      error: { message: "History storage unavailable" },
    });
    expect(readThread).toHaveBeenCalledTimes(1);
    const retry = await app.request("/v1/threads/long-thread?limit=20");
    expect(retry.status).toBe(200);
    expect((await retry.json()).messages).toHaveLength(40);
  });

  it("does not mix cached messages from a replaced rollout path into the new first page", async () => {
    const { app, thread, turns } = historyServer();
    Object.assign(thread, { path: "/tmp/old-rollout.jsonl" });
    const first = await app.request("/v1/threads/long-thread?limit=20");
    expect(first.status).toBe(200);
    expect((await first.json()).messages).toHaveLength(40);

    Object.assign(thread, { path: "/tmp/new-rollout.jsonl" });
    turns.splice(0, turns.length, {
      ...turns[994]!,
      id: "replacement-turn",
      items: [
        {
          id: "replacement-user",
          type: "userMessage",
          content: [{ type: "text", text: "Replacement question", text_elements: [] }],
        },
        { id: "replacement-assistant", type: "agentMessage", text: "Replacement answer" },
      ],
    });

    const second = await app.request("/v1/threads/long-thread?limit=20");
    expect(second.status).toBe(200);
    expect((await second.json()).messages.map((message: { id: string }) => message.id)).toEqual([
      "replacement-user",
      "replacement-assistant",
    ]);
  });
});
