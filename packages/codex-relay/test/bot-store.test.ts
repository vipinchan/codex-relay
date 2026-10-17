import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createBotStore } from "../src/bot-store.js";
import { createBotRuntime } from "../src/bot-runtime.js";
import type { CodexAppServerClient, AppServerRequest } from "../src/app-server.js";

describe("BOT storage", () => {
  it("merges concurrent direct chat preference updates and preserves explicit standard tier", async () => {
    const store = await createBotStore(":memory:");
    const bot = await store.createBot({
      name: "A",
      color: "#112233",
      instructions: "",
      runtimeMode: "default",
      serviceTier: "fast",
    });
    const conversation = await store.createConversation({
      kind: "direct",
      botId: bot.id,
      workspacePath: "/tmp",
    });
    await Promise.all([
      store.updateConversationPreferences(conversation.id, { model: "custom-model" }),
      store.updateConversationPreferences(conversation.id, { serviceTier: null }),
    ]);
    expect((await store.getConversation(conversation.id))?.preferences).toEqual({
      model: "custom-model",
      serviceTier: null,
    });
    expect((await store.resetConversationPreferences(conversation.id))?.preferences).toEqual({});
  });

  it("finds the current thread snapshot beyond recent activity rows", async () => {
    const store = await createBotStore(":memory:");
    const bot = await store.createBot({
      name: "A",
      color: "#112233",
      instructions: "",
      runtimeMode: "default",
    });
    const conversation = await store.createConversation({
      kind: "direct",
      botId: bot.id,
      workspacePath: "/tmp",
    });
    const sent = await store.appendUserWithReplies({
      conversationId: conversation.id,
      content: "Hi",
      requestId: "first",
      botIds: [bot.id],
    });
    await store.setMessageRuntime(sent.replies[0]!.id, {
      threadId: "thread-current",
      botName: "A",
      runtimeMode: "default",
      definitionRevision: "revision-1",
    });
    await store.completeMessage(sent.replies[0]!.id, "Hello", "completed");
    for (let index = 0; index < 35; index += 1) {
      await store.appendMessage({
        conversationId: conversation.id,
        sender: "status",
        content: `activity ${index}`,
      });
    }
    expect(
      await store.getLatestThreadRuntime(conversation.id, bot.id, "thread-current"),
    ).toMatchObject({ definitionRevision: "revision-1" });
    expect(
      await store.getLatestThreadRuntime(conversation.id, bot.id, "thread-reset"),
    ).toBeUndefined();
  });

  it("atomically stores replies, indexes completed text and interrupts old runs on restart", async () => {
    const directory = await mkdtemp(join(tmpdir(), "relay-bot-store-"));
    try {
      const path = join(directory, "bot.sqlite");
      const store = await createBotStore(path);
      const bot = await store.createBot({
        name: "A",
        color: "#112233",
        instructions: "",
        runtimeMode: "default",
      });
      const conversation = await store.createConversation({
        kind: "direct",
        botId: bot.id,
        workspacePath: directory,
      });
      const first = await store.appendUserWithReplies({
        conversationId: conversation.id,
        content: "请回答",
        requestId: "first",
        botIds: [bot.id],
      });
      expect((await store.listReplies(first.message.id)).map((reply) => reply.status)).toEqual([
        "running",
      ]);
      await store.completeMessage(first.replies[0]!.id, "中文检索成功", "completed");
      const indexed = await store.searchHistory(bot.id, "中文检索");
      expect(indexed.hits.map((hit) => hit.message.content)).toContain("中文检索成功");
      const second = await store.appendUserWithReplies({
        conversationId: conversation.id,
        content: "继续",
        requestId: "second",
        botIds: [bot.id],
      });
      const reopened = await createBotStore(path);
      expect((await reopened.getMessage(second.replies[0]!.id))?.status).toBe("interrupted");
      expect((await stat(path)).mode & 0o777).toBe(0o600);
      expect((await stat(directory)).mode & 0o777).toBe(0o700);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("binds history tools to the BOT thread and blocks other private chats", async () => {
    const store = await createBotStore(":memory:");
    const a = await store.createBot({
      name: "A",
      color: "#112233",
      instructions: "",
      runtimeMode: "default",
    });
    const b = await store.createBot({
      name: "B",
      color: "#223344",
      instructions: "",
      runtimeMode: "default",
    });
    const aChat = await store.createConversation({
      kind: "direct",
      botId: a.id,
      workspacePath: "/tmp",
    });
    const bChat = await store.createConversation({
      kind: "direct",
      botId: b.id,
      workspacePath: "/tmp",
    });
    const own = await store.appendUserWithReplies({
      conversationId: aChat.id,
      content: "my public detail",
      requestId: "a",
      botIds: [a.id],
    });
    await store.appendUserWithReplies({
      conversationId: bChat.id,
      content: "private secret detail",
      requestId: "b",
      botIds: [b.id],
    });
    let requestHandler: ((request: AppServerRequest) => void) | undefined;
    const responses = new Map<number | string, unknown>();
    let threadStart: Record<string, unknown> | undefined;
    const appServer = {
      onRequest(handler: (request: AppServerRequest) => void) {
        requestHandler = handler;
        return () => undefined;
      },
      async respondToRequest(id: number | string, result: unknown) {
        responses.set(id, result);
      },
      async startThread(input: Record<string, unknown>) {
        threadStart = input;
        return { id: "thread-a" };
      },
      async startTurn() {
        return {
          id: "turn-a",
          status: { type: "completed" },
          items: [{ id: "answer-a", type: "agentMessage", text: "done" }],
        };
      },
    } as unknown as CodexAppServerClient;
    const runtime = createBotRuntime(Promise.resolve(store), appServer);
    runtime.schedule(aChat, a, own.message, own.replies[0]!);
    await waitFor(async () => (await store.getMessage(own.replies[0]!.id))?.status === "completed");
    expect((threadStart!.dynamicTools as Array<{ name: string }>).map((tool) => tool.name)).toEqual(
      ["bot_history_search", "bot_history_read"],
    );
    requestHandler!({
      id: 1,
      method: "item/tool/call",
      params: {
        threadId: "thread-a",
        turnId: "turn-a",
        tool: "bot_history_search",
        arguments: { query: "private secret" },
      },
    });
    await waitFor(async () => responses.has(1));
    const search = responses.get(1) as { contentItems: Array<{ text: string }> };
    expect(JSON.parse(search.contentItems[0]!.text).hits).toEqual([]);
    requestHandler!({
      id: 2,
      method: "item/tool/call",
      params: {
        threadId: "thread-a",
        turnId: "turn-a",
        tool: "bot_history_read",
        arguments: { conversationId: bChat.id },
      },
    });
    await waitFor(async () => responses.has(2));
    const read = responses.get(2) as { contentItems: Array<{ text: string }> };
    expect(JSON.parse(read.contentItems[0]!.text).messages).toEqual([]);
  });
});

async function waitFor(predicate: () => Promise<boolean>) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Timed out waiting for BOT work.");
}
