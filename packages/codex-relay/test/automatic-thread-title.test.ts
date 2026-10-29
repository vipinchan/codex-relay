import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import type { CodexClient } from "../src/codex.js";

function createMockCodex(): CodexClient {
  return {
    startThread() {
      throw new Error("Codex client should not be used when appServer is active.");
    },
  } as never;
}

describe("automatic thread title generation", () => {
  it("automatically generates and sets an AI title when the first turn completes on a thread created with 'New chat'", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "codex-relay-workspace-"));
    const now = Date.now() / 1000;
    const threadId = "app-thread-new-chat";
    let threadName = "New chat";

    const serverThread = {
      id: threadId,
      createdAt: now,
      cwd: workspacePath,
      modelProvider: "openai",
      get name() {
        return threadName;
      },
      preview: "New chat",
      source: "codex-relay",
      status: { type: "idle" },
      turns: [],
      updatedAt: now,
    };

    const setThreadName = vi.fn<
      ({ name, threadId }: { name: string; threadId: string }) => Promise<void>
    >(async (params) => {
      if (params.threadId === threadId) {
        threadName = params.name;
      }
    });

    const appServer = {
      archiveThread: vi.fn<() => Promise<void>>(async () => undefined),
      listModels: vi.fn<() => Promise<unknown[]>>(async () => [
        {
          id: "gpt-default",
          isDefault: true,
          supportedReasoningEfforts: [{ reasoningEffort: "low" }],
        },
      ]),
      listThreads: vi.fn<() => Promise<unknown[]>>(async () => [serverThread]),
      onNotification() {
        return () => undefined;
      },
      onRequest() {
        return () => undefined;
      },
      readThread: vi.fn<() => Promise<unknown>>(async () => ({
        ...serverThread,
        name: threadName,
      })),
      setThreadName,
      startThread: vi.fn<(params: { threadSource?: string }) => Promise<unknown>>(
        async (params) => {
          if (params.threadSource === "codex-relay-title") {
            return { id: "title-helper-thread", cwd: workspacePath };
          }
          return { ...serverThread, name: threadName };
        },
      ),
      startTurn: vi.fn<(params: { threadId: string }) => Promise<unknown>>(async (params) => {
        if (params.threadId === "title-helper-thread") {
          return {
            id: "title-turn",
            items: [{ id: "title-item", type: "agentMessage", text: "超长上下文响应变慢排查" }],
            status: "completed",
            startedAt: now,
            completedAt: now,
          };
        }
        return {
          id: "turn-user-1",
          items: [
            { id: "assistant-reply", type: "agentMessage", text: "已经收到您的提问，正在分析。" },
          ],
          status: "completed",
          startedAt: now,
          completedAt: now,
        };
      }),
    };

    const app = createApp({
      appServer: appServer as never,
      codex: createMockCodex(),
      workspacePath,
    });

    // 1. Mobile creates thread with "New chat" placeholder title
    const createResponse = await app.request("/v1/threads", {
      method: "POST",
      body: JSON.stringify({ title: "New chat" }),
      headers: { "content-type": "application/json" },
    });
    expect(createResponse.status).toBe(201);

    // 2. User sends the very first message
    const streamResponse = await app.request(`/v1/threads/${threadId}/runs/stream`, {
      method: "POST",
      body: JSON.stringify({ prompt: "对于这种超长上下文，好像现在响应越来越慢了" }),
      headers: { "content-type": "application/json" },
    });
    const streamBody = await streamResponse.text();
    expect(streamResponse.status).toBe(200);

    // Assert that the title helper was called to generate the title and thread name was updated
    expect(setThreadName).toHaveBeenCalledWith({
      name: "超长上下文响应变慢排查",
      threadId,
    });
    expect(streamBody).toContain("超长上下文响应变慢排查");

    // 3. GET /v1/threads should show the new generated title
    const listResponse = await app.request("/v1/threads");
    const listBody = (await listResponse.json()) as {
      threads: Array<{ id: string; title: string }>;
    };
    expect(listResponse.status).toBe(200);
    const targetThread = listBody.threads.find((t) => t.id === threadId);
    expect(targetThread?.title).toBe("超长上下文响应变慢排查");
  });

  it("does not automatically overwrite custom user-provided thread titles on first turn", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "codex-relay-workspace-"));
    const now = Date.now() / 1000;
    const threadId = "app-thread-custom-title";
    let threadName = "我的专属重构会话";

    const serverThread = {
      id: threadId,
      createdAt: now,
      cwd: workspacePath,
      modelProvider: "openai",
      get name() {
        return threadName;
      },
      preview: "我的专属重构会话",
      source: "codex-relay",
      status: { type: "idle" },
      turns: [],
      updatedAt: now,
    };

    const setThreadName = vi.fn<
      ({ name, threadId }: { name: string; threadId: string }) => Promise<void>
    >(async (params) => {
      if (params.threadId === threadId) {
        threadName = params.name;
      }
    });

    const appServer = {
      archiveThread: vi.fn<() => Promise<void>>(async () => undefined),
      listModels: vi.fn<() => Promise<unknown[]>>(async () => []),
      listThreads: vi.fn<() => Promise<unknown[]>>(async () => [serverThread]),
      onNotification() {
        return () => undefined;
      },
      onRequest() {
        return () => undefined;
      },
      readThread: vi.fn<() => Promise<unknown>>(async () => ({
        ...serverThread,
        name: threadName,
      })),
      setThreadName,
      startThread: vi.fn<() => Promise<unknown>>(async () => ({
        ...serverThread,
        name: threadName,
      })),
      startTurn: vi.fn<() => Promise<unknown>>(async () => ({
        id: "turn-1",
        items: [{ id: "reply-1", type: "agentMessage", text: "已开始重构。" }],
        status: "completed",
        startedAt: now,
        completedAt: now,
      })),
    };

    const app = createApp({
      appServer: appServer as never,
      codex: createMockCodex(),
      workspacePath,
    });

    await app.request("/v1/threads", {
      method: "POST",
      body: JSON.stringify({ title: "我的专属重构会话" }),
      headers: { "content-type": "application/json" },
    });

    const streamResponse = await app.request(`/v1/threads/${threadId}/runs/stream`, {
      method: "POST",
      body: JSON.stringify({ prompt: "请帮我重构代码" }),
      headers: { "content-type": "application/json" },
    });
    await streamResponse.text();

    // setThreadName should not have been called with a generated title
    expect(setThreadName).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: expect.not.stringMatching("我的专属重构会话") }),
    );
    expect(threadName).toBe("我的专属重构会话");
  });

  it("does not automatically generate titles on existing threads that already have messages", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "codex-relay-workspace-"));
    const now = Date.now() / 1000;
    const threadId = "app-thread-existing-session";
    let threadName = "New chat";

    const serverThread = {
      id: threadId,
      createdAt: now,
      cwd: workspacePath,
      modelProvider: "openai",
      get name() {
        return threadName;
      },
      preview: "旧提问预览",
      source: "codex-relay",
      status: { type: "idle" },
      turns: [
        {
          id: "turn-0",
          items: [
            { id: "u0", type: "userMessage", text: "旧提问" },
            { id: "a0", type: "agentMessage", text: "旧回答" },
          ],
          status: "completed",
        },
      ],
      updatedAt: now,
    };

    const setThreadName = vi.fn<
      ({ name, threadId }: { name: string; threadId: string }) => Promise<void>
    >(async (params) => {
      if (params.threadId === threadId) {
        threadName = params.name;
      }
    });

    const appServer = {
      archiveThread: vi.fn<() => Promise<void>>(async () => undefined),
      listModels: vi.fn<() => Promise<unknown[]>>(async () => []),
      listThreads: vi.fn<() => Promise<unknown[]>>(async () => [serverThread]),
      onNotification() {
        return () => undefined;
      },
      onRequest() {
        return () => undefined;
      },
      readThread: vi.fn<() => Promise<unknown>>(async () => ({
        ...serverThread,
        name: threadName,
      })),
      setThreadName,
      startThread: vi.fn<() => Promise<unknown>>(async () => ({
        ...serverThread,
        name: threadName,
      })),
      startTurn: vi.fn<() => Promise<unknown>>(async () => ({
        id: "turn-2",
        items: [{ id: "reply-2", type: "agentMessage", text: "继续回答。" }],
        status: "completed",
        startedAt: now,
        completedAt: now,
      })),
    };

    const app = createApp({
      appServer: appServer as never,
      codex: createMockCodex(),
      workspacePath,
    });

    // Populate the thread by fetching it (messageCount will be > 0)
    await app.request(`/v1/threads/${threadId}`);

    const streamResponse = await app.request(`/v1/threads/${threadId}/runs/stream`, {
      method: "POST",
      body: JSON.stringify({ prompt: "继续讨论下个问题" }),
      headers: { "content-type": "application/json" },
    });
    await streamResponse.text();

    // Existing session must NOT have title generated (per user instruction)
    expect(setThreadName).not.toHaveBeenCalled();
    expect(threadName).toBe("New chat");
  });
});

it("does not overwrite a title if the user renamed the thread before generation finished", async () => {
  const workspacePath = await mkdtemp(join(tmpdir(), "codex-relay-workspace-"));
  const now = Date.now() / 1000;
  const threadId = "app-thread-renamed-during-turn";
  let threadName = "New chat";

  const serverThread = {
    id: threadId,
    createdAt: now,
    cwd: workspacePath,
    modelProvider: "openai",
    get name() {
      return threadName;
    },
    preview: "New chat",
    source: "codex-relay",
    status: { type: "idle" },
    turns: [],
    updatedAt: now,
  };

  const setThreadName = vi.fn<
    ({ name, threadId }: { name: string; threadId: string }) => Promise<void>
  >(async (params) => {
    if (params.threadId === threadId) {
      threadName = params.name;
    }
  });

  const appServer = {
    archiveThread: vi.fn<() => Promise<void>>(async () => undefined),
    listModels: vi.fn<() => Promise<unknown[]>>(async () => [
      {
        id: "gpt-default",
        isDefault: true,
        supportedReasoningEfforts: [{ reasoningEffort: "low" }],
      },
    ]),
    listThreads: vi.fn<() => Promise<unknown[]>>(async () => [serverThread]),
    onNotification() {
      return () => undefined;
    },
    onRequest() {
      return () => undefined;
    },
    readThread: vi.fn<() => Promise<unknown>>(async () => ({ ...serverThread, name: threadName })),
    setThreadName,
    startThread: vi.fn<(params: { threadSource?: string }) => Promise<unknown>>(async (params) => {
      if (params.threadSource === "codex-relay-title") {
        // User renames the thread manually right before the title generator returns!
        threadName = "用户手动指定的标题";
        return { id: "title-helper-thread", cwd: workspacePath };
      }
      return { ...serverThread, name: threadName };
    }),
    startTurn: vi.fn<(params: { threadId: string }) => Promise<unknown>>(async (params) => {
      if (params.threadId === "title-helper-thread") {
        return {
          id: "title-turn",
          items: [{ id: "title-item", type: "agentMessage", text: "模型生成的标题" }],
          status: "completed",
          startedAt: now,
          completedAt: now,
        };
      }
      return {
        id: "turn-user-1",
        items: [{ id: "assistant-reply", type: "agentMessage", text: "回复内容" }],
        status: "completed",
        startedAt: now,
        completedAt: now,
      };
    }),
  };

  const app = createApp({
    appServer: appServer as never,
    codex: createMockCodex(),
    workspacePath,
  });

  await app.request("/v1/threads", {
    method: "POST",
    body: JSON.stringify({ title: "New chat" }),
    headers: { "content-type": "application/json" },
  });

  const streamResponse = await app.request(`/v1/threads/${threadId}/runs/stream`, {
    method: "POST",
    body: JSON.stringify({ prompt: "首条提问" }),
    headers: { "content-type": "application/json" },
  });
  await streamResponse.text();

  // Verify the CAS protected the manual title and did not overwrite it with "模型生成的标题"
  expect(setThreadName).not.toHaveBeenCalledWith({
    name: "模型生成的标题",
    threadId,
  });
  expect(threadName).toBe("用户手动指定的标题");
});

it("handles title generation failure gracefully without failing the stream turn", async () => {
  const workspacePath = await mkdtemp(join(tmpdir(), "codex-relay-workspace-"));
  const now = Date.now() / 1000;
  const threadId = "app-thread-title-fail";
  let threadName = "New chat";

  const serverThread = {
    id: threadId,
    createdAt: now,
    cwd: workspacePath,
    modelProvider: "openai",
    get name() {
      return threadName;
    },
    preview: "New chat",
    source: "codex-relay",
    status: { type: "idle" },
    turns: [],
    updatedAt: now,
  };

  const setThreadName = vi.fn<
    ({ name, threadId }: { name: string; threadId: string }) => Promise<void>
  >(async (params) => {
    if (params.threadId === threadId) {
      threadName = params.name;
    }
  });

  const appServer = {
    archiveThread: vi.fn<() => Promise<void>>(async () => undefined),
    listModels: vi.fn<() => Promise<unknown[]>>(async () => [
      {
        id: "gpt-default",
        isDefault: true,
        supportedReasoningEfforts: [{ reasoningEffort: "low" }],
      },
    ]),
    listThreads: vi.fn<() => Promise<unknown[]>>(async () => [serverThread]),
    onNotification() {
      return () => undefined;
    },
    onRequest() {
      return () => undefined;
    },
    readThread: vi.fn<() => Promise<unknown>>(async () => ({ ...serverThread, name: threadName })),
    setThreadName,
    startThread: vi.fn<(params: { threadSource?: string }) => Promise<unknown>>(async (params) => {
      if (params.threadSource === "codex-relay-title") {
        throw new Error("Simulated title model quota exceeded");
      }
      return { ...serverThread, name: threadName };
    }),
    startTurn: vi.fn<(params: { threadId: string }) => Promise<unknown>>(async () => ({
      id: "turn-user-1",
      items: [{ id: "assistant-reply", type: "agentMessage", text: "正常回答仍应成功返回" }],
      status: "completed",
      startedAt: now,
      completedAt: now,
    })),
  };

  const app = createApp({
    appServer: appServer as never,
    codex: createMockCodex(),
    workspacePath,
  });

  await app.request("/v1/threads", {
    method: "POST",
    body: JSON.stringify({ title: "New chat" }),
    headers: { "content-type": "application/json" },
  });

  const streamResponse = await app.request(`/v1/threads/${threadId}/runs/stream`, {
    method: "POST",
    body: JSON.stringify({ prompt: "首条提问" }),
    headers: { "content-type": "application/json" },
  });
  const streamBody = await streamResponse.text();

  expect(streamResponse.status).toBe(200);
  expect(streamBody).toContain("正常回答仍应成功返回");
  expect(streamBody).toContain('"state":"completed"');
});
