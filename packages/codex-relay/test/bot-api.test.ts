import { randomUUID } from "node:crypto";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import type { CodexAppServerClient, AppServerRequest, AppServerTurn } from "../src/app-server.js";
import { createBotStore } from "../src/bot-store.js";
import { connect } from "../src/libsql-database.js";

const defaultModels = [
  {
    id: "default-model",
    model: "default-model",
    displayName: "Default",
    isDefault: true,
    defaultReasoningEffort: "medium",
  },
];

describe("bot conversations", () => {
  it("migrates legacy messages without losing their content", async () => {
    const directory = await mkdtemp(join(tmpdir(), "codex-relay-bot-migration-"));
    try {
      const path = join(directory, "bots.db");
      const legacy = connect(path);
      await legacy.exec(`CREATE TABLE bot_messages (
        id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, seq INTEGER NOT NULL,
        sender TEXT NOT NULL, bot_id TEXT, content TEXT NOT NULL,
        status TEXT NOT NULL, request_id TEXT, reply_to_message_id TEXT,
        activity_json TEXT, created_at TEXT NOT NULL,
        UNIQUE (conversation_id, seq)
      )`);
      const id = randomUUID();
      await legacy
        .prepare(`INSERT INTO bot_messages
          (id, conversation_id, seq, sender, content, status, created_at)
          VALUES (?, ?, 1, 'user', 'Kept from beta', 'completed', ?)`)
        .run(id, randomUUID(), new Date().toISOString());
      const store = await createBotStore(path);
      expect(await store.getMessage(id)).toMatchObject({ id, content: "Kept from beta" });
      expect((await store.getMessage(id))?.runtime).toBeUndefined();
      expect(
        (await legacy.prepare("PRAGMA table_info(bot_messages)").all()).some(
          (column) => column.name === "runtime_json",
        ),
      ).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("creates and lists a durable bot identity", async () => {
    const app = createApp({ appServer: null });
    const created = await app.request("/v1/bots", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Architect",
        color: "#4778d9",
        instructions: "Review architecture decisions.",
        model: "gpt-6.1-sol",
        reasoningEffort: "high",
        runtimeMode: "default",
      }),
    });

    expect(created.status).toBe(201);
    const { bot } = await created.json();
    expect(bot).toMatchObject({ name: "Architect", color: "#4778d9" });
    const listed = await app.request("/v1/bots");
    expect((await listed.json()).bots).toContainEqual(bot);
  });

  it("clears optional BOT runtime settings with null while preserving omitted fields", async () => {
    const app = createApp({ appServer: null });
    const created = await app.request("/v1/bots", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Architect",
        color: "#4778d9",
        instructions: "Original",
        model: "gpt-6.1-sol",
        reasoningEffort: "high",
        serviceTier: "fast",
      }),
    });
    const { bot } = await created.json();
    const patched = await app.request(`/v1/bots/${bot.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: null, reasoningEffort: null, serviceTier: null }),
    });
    expect(patched.status).toBe(200);
    expect((await patched.json()).bot).toMatchObject({
      name: "Architect",
      instructions: "Original",
    });
    const saved = (await (await app.request(`/v1/bots/${bot.id}`)).json()).bot;
    expect(saved).not.toHaveProperty("model");
    expect(saved).not.toHaveProperty("reasoningEffort");
    expect(saved).not.toHaveProperty("serviceTier");
  });

  it("reports queued, running, and idle BOT states from active work", async () => {
    const releases: Array<() => void> = [];
    let started = 0;
    const appServer = {
      async listModels() {
        return defaultModels;
      },
      async startThread() {
        return { id: `state-thread-${started + 1}` };
      },
      async startTurn() {
        started += 1;
        const index = started;
        await new Promise<void>((resolve) => releases.push(resolve));
        return {
          id: `state-turn-${index}`,
          status: { type: "completed" },
          items: [{ id: `state-reply-${index}`, type: "agentMessage", text: "Done." }],
          startedAt: null,
          completedAt: null,
        };
      },
    } as unknown as CodexAppServerClient;
    const app = createApp({ appServer });
    const post = async (path: string, body: unknown) => {
      const response = await app.request(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(response.status).toBeLessThan(300);
      return response.json();
    };
    const first = (await post("/v1/bots", { name: "First", color: "#112233", instructions: "" }))
      .bot;
    const second = (await post("/v1/bots", { name: "Second", color: "#334455", instructions: "" }))
      .bot;
    const group = (
      await post("/v1/bot-conversations", {
        kind: "group",
        name: "Team",
        workspacePath: "/tmp",
        botIds: [first.id, second.id],
        defaultBotId: first.id,
      })
    ).conversation;
    const states = async () => {
      const response = await app.request("/v1/bots");
      const { bots } = await response.json();
      return Object.fromEntries(
        bots.map((bot: { id: string; runtimeState?: string }) => [bot.id, bot.runtimeState]),
      );
    };
    expect(await states()).toMatchObject({ [first.id]: "idle", [second.id]: "idle" });
    await post(`/v1/bot-conversations/${group.id}/messages`, {
      requestId: "work",
      text: "Answer together",
      mentionBotIds: [first.id, second.id],
    });
    await waitFor(() => Promise.resolve(started === 1));
    expect(await states()).toMatchObject({ [first.id]: "running", [second.id]: "queued" });
    const detail = await app.request(`/v1/bots/${second.id}`);
    expect((await detail.json()).bot.runtimeState).toBe("queued");
    releases[0]!();
    await waitFor(() => Promise.resolve(started === 2));
    expect(await states()).toMatchObject({ [first.id]: "idle", [second.id]: "running" });
    releases[1]!();
    await waitFor(async () => {
      const state = await states();
      return state[first.id] === "idle" && state[second.id] === "idle";
    });
  });

  it("keeps private history within its BOT and cuts group visibility at departure", async () => {
    const app = createApp({ appServer: null });
    const post = async (path: string, body: unknown) => {
      const response = await app.request(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    };
    const a = (await post("/v1/bots", { name: "A", color: "#111111", instructions: "" })).body.bot;
    const b = (await post("/v1/bots", { name: "B", color: "#222222", instructions: "" })).body.bot;
    const direct = (await post("/v1/bot-conversations", { kind: "direct", botId: a.id })).body
      .conversation;
    const group = (
      await post("/v1/bot-conversations", {
        kind: "group",
        name: "Team",
        workspacePath: "/tmp",
        botIds: [a.id],
        defaultBotId: a.id,
      })
    ).body.conversation;
    await post(`/v1/bot-conversations/${direct.id}/messages`, {
      requestId: "private",
      text: "private fact",
    });
    await post(`/v1/bot-conversations/${group.id}/messages`, {
      requestId: "before",
      text: "early group fact",
    });
    await app.request(`/v1/bot-conversations/${group.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ botIds: [a.id, b.id] }),
    });
    const newMemberHistory = await app.request(`/v1/bots/${b.id}/history?query=early`);
    expect(
      (await newMemberHistory.json()).hits.map(
        (hit: { message: { content: string } }) => hit.message.content,
      ),
    ).toContain("early group fact");
    await app.request(`/v1/bot-conversations/${group.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ botIds: [a.id] }),
    });
    await post(`/v1/bot-conversations/${group.id}/messages`, {
      requestId: "after",
      text: "later group fact",
    });
    const bHistory = await app.request(`/v1/bots/${b.id}/history`);
    const visible = (await bHistory.json()).hits.map(
      (hit: { message: { content: string } }) => hit.message.content,
    );
    expect(visible).toContain("early group fact");
    expect(visible).not.toContain("later group fact");
    expect(visible).not.toContain("private fact");
  });

  it("supports sourced, editable BOT memory", async () => {
    const app = createApp({ appServer: null });
    const created = await app.request("/v1/bots", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "A", color: "#111111", instructions: "" }),
    });
    const { bot } = await created.json();
    const response = await app.request(`/v1/bots/${bot.id}/memories`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "Prefers concise answers." }),
    });
    expect(response.status).toBe(201);
    const { memory } = await response.json();
    const edited = await app.request(`/v1/bots/${bot.id}/memories/${memory.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "Prefers detailed answers." }),
    });
    expect((await edited.json()).memory.content).toBe("Prefers detailed answers.");
    const deleted = await app.request(`/v1/bots/${bot.id}/memories/${memory.id}`, {
      method: "DELETE",
    });
    expect(deleted.status).toBe(200);
    const listed = await app.request(`/v1/bots/${bot.id}/memories`);
    expect((await listed.json()).memories).toEqual([]);
  });

  it("runs mentioned BOTs in group order and reuses each private thread", async () => {
    const calls: Array<{ threadId: string; cwd: string; prompt: string }> = [];
    const turns = new Map<string, AppServerTurn>();
    let nextThread = 0;
    const appServer = {
      async listModels() {
        return defaultModels;
      },
      async startThread() {
        return { id: `thread-${++nextThread}` };
      },
      async resumeThread() {
        return {};
      },
      async startTurn(input: { threadId: string; cwd: string; input: Array<{ text: string }> }) {
        calls.push({ threadId: input.threadId, cwd: input.cwd, prompt: input.input[0]!.text });
        const turn = {
          id: `turn-${calls.length}`,
          status: { type: "completed" },
          items: [
            { id: `reply-${calls.length}`, type: "agentMessage", text: `reply ${calls.length}` },
          ],
          startedAt: null,
          completedAt: null,
        } as AppServerTurn;
        turns.set(input.threadId, turn);
        return turn;
      },
      async readThread(threadId: string) {
        return { turns: [turns.get(threadId)] };
      },
      async listThreads() {
        return calls.map((call) => ({ id: call.threadId }));
      },
    } as unknown as CodexAppServerClient;
    const app = createApp({ appServer });
    const post = async (path: string, body: unknown) => {
      const response = await app.request(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(response.status).toBeLessThan(300);
      return response.json();
    };
    const first = (
      await post("/v1/bots", { name: "First", color: "#123456", instructions: "first" })
    ).bot;
    const second = (
      await post("/v1/bots", { name: "Second", color: "#654321", instructions: "second" })
    ).bot;
    const group = (
      await post("/v1/bot-conversations", {
        kind: "group",
        name: "Team",
        workspacePath: "/tmp",
        botIds: [first.id, second.id],
        defaultBotId: first.id,
      })
    ).conversation;
    const send = async (requestId: string, text: string, mentionBotIds?: string[]) =>
      post(`/v1/bot-conversations/${group.id}/messages`, { requestId, text, mentionBotIds });
    const sent = await send("once", "记住：我们决定使用 SQL。", [second.id, first.id]);
    expect(sent.replies.map((reply: { botId: string }) => reply.botId)).toEqual([
      first.id,
      second.id,
    ]);
    await waitFor(async () => {
      const response = await app.request(`/v1/bot-conversations/${group.id}/messages`);
      const { messages } = await response.json();
      return (
        messages.filter(
          (message: { sender: string; status: string }) =>
            message.sender === "bot" && message.status === "completed",
        ).length === 2
      );
    });
    expect(calls.map((call) => call.cwd)).toEqual([await realpath("/tmp"), await realpath("/tmp")]);
    expect(new Set(calls.map((call) => call.threadId)).size).toBe(2);
    const duplicate = await send("once", "记住：我们决定使用 SQL。", [first.id]);
    expect(duplicate.message.id).toBe(sent.message.id);
    expect(calls).toHaveLength(2);
    const memoriesResponse = await app.request(`/v1/bots/${first.id}/memories`);
    const { memories } = await memoriesResponse.json();
    expect(memories).toHaveLength(1);
    await app.request(`/v1/bots/${first.id}/memories/${memories[0].id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "Use SQLite." }),
    });
    await send("twice", "Continue", [first.id]);
    await waitFor(() => Promise.resolve(calls.length === 3));
    expect(calls[2]!.threadId).toBe(calls[0]!.threadId);
    expect(calls[2]!.prompt).toContain("Use SQLite.");
    const threadsResponse = await app.request("/v1/threads");
    expect((await threadsResponse.json()).threads).toEqual([]);
  });

  it("uses saved settings when a queued reply starts and resumes its thread", async () => {
    const turnInputs: Array<{
      model?: string | null;
      effort?: string | null;
      serviceTier?: string | null;
    }> = [];
    const resumeInputs: Array<{ model?: string | null; serviceTier?: string | null }> = [];
    let releaseFirstTurn: (() => void) | undefined;
    const firstTurnGate = new Promise<void>((resolve) => {
      releaseFirstTurn = resolve;
    });
    const appServer = {
      async listModels() {
        return defaultModels;
      },
      async startThread() {
        return { id: "settings-thread" };
      },
      async resumeThread(input: { model?: string | null; serviceTier?: string | null }) {
        resumeInputs.push(input);
        return {
          id: "settings-thread",
          runtimeConfig: { model: "gpt-6.1-sol", reasoningEffort: "high" },
        };
      },
      async startTurn(input: {
        model?: string | null;
        effort?: string | null;
        serviceTier?: string | null;
      }) {
        turnInputs.push(input);
        if (turnInputs.length === 1) await firstTurnGate;
        return {
          id: `turn-${turnInputs.length}`,
          ...(turnInputs.length === 1 ? { model: "resolved-model" } : {}),
          status: { type: "completed" },
          items: [{ id: `reply-${turnInputs.length}`, type: "agentMessage", text: "Done." }],
          startedAt: null,
          completedAt: null,
        };
      },
    } as unknown as CodexAppServerClient;
    const app = createApp({ appServer });
    const request = (path: string, method: "POST" | "PATCH", body: unknown) =>
      app.request(path, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    const bot = (
      await (
        await request("/v1/bots", "POST", {
          name: "Original",
          color: "#4778d9",
          instructions: "First instructions.",
          model: "gpt-6.1-sol",
          reasoningEffort: "high",
          serviceTier: "fast",
        })
      ).json()
    ).bot;
    const conversation = (
      await (
        await request("/v1/bot-conversations", "POST", { kind: "direct", botId: bot.id })
      ).json()
    ).conversation;
    const messagesPath = `/v1/bot-conversations/${conversation.id}/messages`;
    await request(messagesPath, "POST", { requestId: "first", text: "First" });
    await waitFor(() => Promise.resolve(turnInputs.length === 1));
    await request(messagesPath, "POST", { requestId: "second", text: "Second" });
    const patched = await request(`/v1/bots/${bot.id}`, "PATCH", {
      name: "Updated",
      instructions: "Second instructions.",
      model: null,
      reasoningEffort: null,
      serviceTier: null,
    });
    expect(patched.status).toBe(200);
    releaseFirstTurn?.();
    await waitFor(async () => {
      const { messages } = await (await app.request(messagesPath)).json();
      return (
        messages.filter(
          (message: { sender: string; status: string }) =>
            message.sender === "bot" && message.status === "completed",
        ).length === 2
      );
    });
    expect(
      turnInputs.map(({ model, effort, serviceTier }) => ({ model, effort, serviceTier })),
    ).toEqual([
      { model: "gpt-6.1-sol", effort: "high", serviceTier: "fast" },
      { model: "default-model", effort: "medium", serviceTier: null },
    ]);
    expect(resumeInputs).toMatchObject([{ model: "default-model", serviceTier: null }]);
    const { messages } = await (await app.request(messagesPath)).json();
    const replies = messages.filter((message: { sender: string }) => message.sender === "bot");
    expect(
      replies.find(
        (message: { runtime?: { requestedModel?: string } }) =>
          message.runtime?.requestedModel === "gpt-6.1-sol",
      )?.runtime,
    ).toMatchObject({
      requestedModel: "gpt-6.1-sol",
      reasoningEffort: "high",
      serviceTier: "fast",
      resolvedModel: "resolved-model",
    });
    expect(
      replies.find(
        (message: { runtime?: { requestedModel?: string } }) => !message.runtime?.requestedModel,
      )?.runtime,
    ).not.toHaveProperty("resolvedModel");
  });

  it("persists BOT approvals and resolves them through the existing approval route", async () => {
    const handlers: Array<(request: AppServerRequest) => void> = [];
    let started = false;
    let approved = false;
    const appServer = {
      async listModels() {
        return defaultModels;
      },
      onRequest(handler: (request: AppServerRequest) => void) {
        handlers.push(handler);
        return () => {
          const index = handlers.indexOf(handler);
          if (index >= 0) handlers.splice(index, 1);
        };
      },
      async startThread() {
        return { id: "bot-thread" };
      },
      async startTurn() {
        started = true;
        return {
          id: "bot-turn",
          status: { type: "inProgress" },
          items: [],
          startedAt: null,
          completedAt: null,
        };
      },
      async readThread() {
        return {
          turns: [
            {
              id: "bot-turn",
              status: { type: approved ? "completed" : "inProgress" },
              items: approved ? [{ id: "answer", type: "agentMessage", text: "Approved." }] : [],
              startedAt: null,
              completedAt: null,
            },
          ],
        };
      },
      async respondToRequest() {
        approved = true;
      },
    } as unknown as CodexAppServerClient;
    const app = createApp({ appServer });
    const post = async (path: string, body: unknown) =>
      app.request(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    const bot = (
      await (await post("/v1/bots", { name: "A", color: "#112233", instructions: "" })).json()
    ).bot;
    const conversation = (
      await (
        await post("/v1/bot-conversations", {
          kind: "direct",
          botId: bot.id,
        })
      ).json()
    ).conversation;
    await post(`/v1/bot-conversations/${conversation.id}/messages`, {
      requestId: "approval",
      text: "Perform an action",
    });
    await waitFor(() => Promise.resolve(started));
    for (const handler of [...handlers])
      handler({
        id: 9,
        method: "item/commandExecution/requestApproval",
        params: {
          threadId: "bot-thread",
          turnId: "bot-turn",
          command: "echo test",
          cwd: "/tmp",
        },
      });
    let approvalId = "";
    await waitFor(async () => {
      const response = await app.request(`/v1/bot-conversations/${conversation.id}/messages`);
      const { messages } = await response.json();
      approvalId =
        messages.find(
          (message: { activity?: { details?: { approvalId?: string } } }) =>
            message.activity?.details?.approvalId,
        )?.activity.details.approvalId ?? "";
      return Boolean(approvalId);
    });
    const resolved = await post(`/v1/approvals/${encodeURIComponent(approvalId)}`, {
      decision: "approve",
    });
    expect(resolved.status).toBe(200);
    await waitFor(async () => {
      const response = await app.request(`/v1/bot-conversations/${conversation.id}/messages`);
      const { messages } = await response.json();
      const activity = messages.find(
        (message: { activity?: { details?: { approvalId?: string } } }) =>
          message.activity?.details?.approvalId === approvalId,
      )?.activity;
      return activity?.details?.approvalResolved === true;
    });
  });

  it("stops a running BOT and skips queued group members", async () => {
    let turnsStarted = 0;
    let interrupted = 0;
    const appServer = {
      async listModels() {
        return defaultModels;
      },
      async startThread() {
        return { id: `thread-${turnsStarted + 1}` };
      },
      async startTurn() {
        turnsStarted += 1;
        return {
          id: "active-turn",
          status: { type: "inProgress" },
          items: [],
          startedAt: null,
          completedAt: null,
        };
      },
      async readThread() {
        return {
          turns: [
            {
              id: "active-turn",
              status: { type: "inProgress" },
              items: [],
              startedAt: null,
              completedAt: null,
            },
          ],
        };
      },
      async interruptTurn() {
        interrupted += 1;
      },
    } as unknown as CodexAppServerClient;
    const app = createApp({ appServer });
    const post = async (path: string, body: unknown) =>
      app.request(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    const a = (
      await (await post("/v1/bots", { name: "A", color: "#111111", instructions: "" })).json()
    ).bot;
    const b = (
      await (await post("/v1/bots", { name: "B", color: "#222222", instructions: "" })).json()
    ).bot;
    const conversation = (
      await (
        await post("/v1/bot-conversations", {
          kind: "group",
          name: "Team",
          workspacePath: "/tmp",
          botIds: [a.id, b.id],
          defaultBotId: a.id,
        })
      ).json()
    ).conversation;
    const sent = await post(`/v1/bot-conversations/${conversation.id}/messages`, {
      requestId: "stop",
      text: "Go",
      mentionBotIds: [a.id, b.id],
    });
    expect(sent.status).toBe(201);
    await waitFor(() => Promise.resolve(turnsStarted === 1));
    const stopped = await post(`/v1/bot-conversations/${conversation.id}/stop`, {});
    expect(stopped.status).toBe(200);
    expect((await stopped.json()).interruptedReplyIds).toHaveLength(2);
    await waitFor(() => Promise.resolve(interrupted === 1));
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(turnsStarted).toBe(1);
    const { messages } = await (
      await app.request(`/v1/bot-conversations/${conversation.id}/messages`)
    ).json();
    expect(
      messages
        .filter((message: { sender: string }) => message.sender === "bot")
        .map((message: { status: string }) => message.status),
    ).toEqual(["interrupted", "interrupted"]);
  });
});

async function waitFor(predicate: () => Promise<boolean>) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Timed out waiting for BOT reply.");
}
