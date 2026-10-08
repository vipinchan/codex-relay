import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage, ThreadDetailResponse, ThreadSummary } from "codex-relay/api-schema";

vi.mock("@/lib/codex-relay-api", () => ({
  getCodexRelayServerUrl: vi.fn<() => string>(),
  getThread: vi.fn<typeof getThread>(),
  getThreadContextWindow: vi.fn<() => void>(),
  listModels: vi.fn<() => void>(),
  listQueuedThreadInputs: vi.fn<() => void>(),
  getRateLimits: vi.fn<() => void>(),
  getStatus: vi.fn<() => void>(),
  listThreads: vi.fn<() => void>(),
  getVersion: vi.fn<() => void>(),
  getWorkspaceChanges: vi.fn<() => void>(),
  listWorkspaceDirectories: vi.fn<() => void>(),
}));
vi.mock("@/lib/workspace-runtime-preferences-cache", () => ({
  cacheWorkspaceRuntimePreferences: vi.fn<() => void>(),
  cacheWorkspaceRuntimePreferencesFromStatus: vi.fn<() => void>(),
}));

import { getCodexRelayServerUrl, getThread } from "./codex-relay-api";
import {
  fetchOlderThreadMessagesState,
  fetchThreadState,
  serverStateKeys,
  setThreadDetailState,
} from "./server-state";

const getThreadMock = vi.mocked(getThread);
const getServerUrlMock = vi.mocked(getCodexRelayServerUrl);

function detail(id: string, messageIds: string[], cursor: string | null): ThreadDetailResponse {
  const thread: ThreadSummary = {
    id,
    title: id,
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
    state: "completed",
    messageCount: 3,
  };
  const messages: ChatMessage[] = messageIds.map((messageId) => ({
    id: messageId,
    threadId: id,
    role: "user",
    kind: "chat",
    content: messageId,
    createdAt: `2026-06-06T00:00:0${Number(messageId.slice(-1))}.000Z`,
    state: "completed",
  }));
  return { thread, messages, pendingInputRequests: [], olderMessagesCursor: cursor };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe("mobile thread pagination cache", () => {
  beforeEach(() => {
    getThreadMock.mockReset();
    getServerUrlMock.mockReturnValue("http://relay.test");
  });

  it("caches the first page cursor and retains older pages on background latest fetch", async () => {
    const queryClient = new QueryClient();
    getThreadMock.mockResolvedValueOnce(detail("thread-a", ["message-2"], "cursor-1"));
    await fetchThreadState(queryClient, "thread-a");
    expect(getThreadMock).toHaveBeenCalledWith("thread-a");
    expect(
      queryClient.getQueryData<ThreadDetailResponse>(serverStateKeys.thread("thread-a"))
        ?.olderMessagesCursor,
    ).toBe("cursor-1");

    queryClient.setQueryData(
      serverStateKeys.thread("thread-a"),
      detail("thread-a", ["message-1", "message-2"], "cursor-2"),
    );
    getThreadMock.mockResolvedValueOnce(detail("thread-a", ["message-2", "message-3"], "cursor-1"));
    await fetchThreadState(queryClient, "thread-a");

    const cached = queryClient.getQueryData<ThreadDetailResponse>(
      serverStateKeys.thread("thread-a"),
    );
    expect(getThreadMock).toHaveBeenLastCalledWith("thread-a");
    expect(cached?.olderMessagesCursor).toBe("cursor-2");
    expect(cached?.messages.map((message) => message.id)).toEqual([
      "message-1",
      "message-2",
      "message-3",
    ]);
  });

  it("replaces stale history and cursor on explicit refresh", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      serverStateKeys.thread("thread-a"),
      detail("thread-a", ["message-1", "message-2"], "stale-cursor"),
    );
    getThreadMock.mockResolvedValueOnce(detail("thread-a", ["message-3"], "fresh-cursor"));

    const result = await fetchThreadState(queryClient, "thread-a", { refresh: true });

    expect(getThreadMock).toHaveBeenCalledWith("thread-a", { refresh: true });
    expect(result.messages.map((message) => message.id)).toEqual(["message-3"]);
    expect(queryClient.getQueryData(serverStateKeys.thread("thread-a"))).toEqual(result);
    expect(result.olderMessagesCursor).toBe("fresh-cursor");
  });

  it("keeps a latest response under its original server after switching servers", async () => {
    const queryClient = new QueryClient();
    const oldKey = serverStateKeys.thread("thread-a");
    const pending = deferred<ThreadDetailResponse>();
    getThreadMock.mockReturnValueOnce(pending.promise);
    const request = fetchThreadState(queryClient, "thread-a");

    getServerUrlMock.mockReturnValue("http://new-relay.test");
    const newDetail = detail("thread-a", ["message-3"], null);
    queryClient.setQueryData(serverStateKeys.thread("thread-a"), newDetail);
    queryClient.setQueryData(serverStateKeys.threads(), { source: "memory", threads: [] });
    pending.resolve(detail("thread-a", ["message-1"], "old-cursor"));
    await request;

    expect(queryClient.getQueryData(serverStateKeys.thread("thread-a"))).toEqual(newDetail);
    expect(queryClient.getQueryData(serverStateKeys.threads())).toEqual({
      source: "memory",
      threads: [],
    });
    expect(queryClient.getQueryData<ThreadDetailResponse>(oldKey)?.messages[0]?.id).toBe(
      "message-1",
    );
  });

  it("keeps an explicit refresh under its original server after switching servers", async () => {
    const queryClient = new QueryClient();
    const oldKey = serverStateKeys.thread("thread-a");
    const pending = deferred<ThreadDetailResponse>();
    getThreadMock.mockReturnValueOnce(pending.promise);
    const request = fetchThreadState(queryClient, "thread-a", { refresh: true });

    getServerUrlMock.mockReturnValue("http://new-relay.test");
    const newDetail = detail("thread-a", ["message-3"], null);
    queryClient.setQueryData(serverStateKeys.thread("thread-a"), newDetail);
    queryClient.setQueryData(serverStateKeys.threads(), { source: "memory", threads: [] });
    pending.resolve(detail("thread-a", ["message-1"], "old-cursor"));
    await request;

    expect(queryClient.getQueryData(serverStateKeys.thread("thread-a"))).toEqual(newDetail);
    expect(queryClient.getQueryData(serverStateKeys.threads())).toEqual({
      source: "memory",
      threads: [],
    });
    expect(queryClient.getQueryData<ThreadDetailResponse>(oldKey)?.messages[0]?.id).toBe(
      "message-1",
    );
  });

  it("does not let an older page revive history replaced by explicit refresh", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      serverStateKeys.thread("thread-a"),
      detail("thread-a", ["message-2"], "same-cursor"),
    );
    const pending = deferred<ThreadDetailResponse>();
    getThreadMock.mockReturnValueOnce(pending.promise);
    const olderRequest = fetchOlderThreadMessagesState(queryClient, "thread-a");

    getThreadMock.mockResolvedValueOnce(detail("thread-a", ["message-3"], "same-cursor"));
    await fetchThreadState(queryClient, "thread-a", { refresh: true });
    pending.resolve(detail("thread-a", ["message-1"], null));

    expect(await olderRequest).toBeUndefined();
    expect(
      queryClient
        .getQueryData<ThreadDetailResponse>(serverStateKeys.thread("thread-a"))
        ?.messages.map((message) => message.id),
    ).toEqual(["message-3"]);
  });

  it("does not let a pending background latest page revive history after explicit refresh", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      serverStateKeys.thread("thread-a"),
      detail("thread-a", ["message-2"], "old-cursor"),
    );
    const pending = deferred<ThreadDetailResponse>();
    getThreadMock.mockReturnValueOnce(pending.promise);
    const backgroundRequest = fetchThreadState(queryClient, "thread-a");

    getThreadMock.mockResolvedValueOnce(detail("thread-a", ["message-3"], "new-cursor"));
    await fetchThreadState(queryClient, "thread-a", { refresh: true });
    pending.resolve(detail("thread-a", ["message-1", "message-2"], "old-cursor"));
    await backgroundRequest;

    const cached = queryClient.getQueryData<ThreadDetailResponse>(
      serverStateKeys.thread("thread-a"),
    );
    expect(cached?.messages.map((message) => message.id)).toEqual(["message-3"]);
    expect(cached?.olderMessagesCursor).toBe("new-cursor");
  });

  it("keeps cached messages on a failed older fetch and retries the same cursor", async () => {
    const queryClient = new QueryClient();
    const current = detail("thread-a", ["message-2", "message-3"], "cursor-2");
    queryClient.setQueryData(serverStateKeys.thread("thread-a"), current);
    const pending = deferred<ThreadDetailResponse>();
    getThreadMock.mockReturnValueOnce(pending.promise);

    const first = fetchOlderThreadMessagesState(queryClient, "thread-a");
    const duplicate = fetchOlderThreadMessagesState(queryClient, "thread-a");
    expect(duplicate).toBe(first);
    expect(getThreadMock).toHaveBeenCalledTimes(1);
    pending.reject(new Error("network failed"));
    await expect(first).rejects.toThrow("network failed");
    expect(queryClient.getQueryData(serverStateKeys.thread("thread-a"))).toBe(current);

    getThreadMock.mockResolvedValueOnce(detail("thread-a", ["message-1", "message-2"], null));
    const result = await fetchOlderThreadMessagesState(queryClient, "thread-a");
    expect(getThreadMock).toHaveBeenLastCalledWith("thread-a", { cursor: "cursor-2" });
    expect(result?.olderMessagesCursor).toBeNull();
    expect(result?.messages.map((message) => message.id)).toEqual([
      "message-1",
      "message-2",
      "message-3",
    ]);
    expect(await fetchOlderThreadMessagesState(queryClient, "thread-a")).toBeUndefined();
    expect(getThreadMock).toHaveBeenCalledTimes(2);
  });

  it("ignores an older result after the cursor changes and isolates other threads", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      serverStateKeys.thread("thread-a"),
      detail("thread-a", ["message-2"], "cursor-2"),
    );
    const other = detail("thread-b", ["message-3"], "other-cursor");
    queryClient.setQueryData(serverStateKeys.thread("thread-b"), other);
    const pending = deferred<ThreadDetailResponse>();
    getThreadMock.mockReturnValueOnce(pending.promise);

    const request = fetchOlderThreadMessagesState(queryClient, "thread-a");
    const advanced = detail("thread-a", ["message-1", "message-2"], null);
    queryClient.setQueryData(serverStateKeys.thread("thread-a"), advanced);
    pending.resolve(detail("thread-a", ["message-1"], "stale-cursor"));
    expect(await request).toBeUndefined();
    expect(queryClient.getQueryData(serverStateKeys.thread("thread-a"))).toEqual(advanced);
    expect(queryClient.getQueryData(serverStateKeys.thread("thread-b"))).toEqual(other);
  });

  it("does not write an old server response into a newly selected server cache", async () => {
    const queryClient = new QueryClient();
    const oldDetail = detail("thread-a", ["message-2"], "old-cursor");
    queryClient.setQueryData(serverStateKeys.thread("thread-a"), oldDetail);
    const pending = deferred<ThreadDetailResponse>();
    getThreadMock.mockReturnValueOnce(pending.promise);
    const request = fetchOlderThreadMessagesState(queryClient, "thread-a");

    getServerUrlMock.mockReturnValue("http://new-relay.test");
    const newDetail = detail("thread-a", ["message-3"], "new-cursor");
    queryClient.setQueryData(serverStateKeys.thread("thread-a"), newDetail);
    pending.resolve(detail("thread-a", ["message-1"], null));

    expect(await request).toBeUndefined();
    expect(queryClient.getQueryData(serverStateKeys.thread("thread-a"))).toEqual(newDetail);
  });

  it("keeps an older page when it finishes before a latest-page query", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      serverStateKeys.thread("thread-a"),
      detail("thread-a", ["message-2"], "cursor-2"),
    );
    const latest = deferred<ThreadDetailResponse>();
    const older = deferred<ThreadDetailResponse>();
    getThreadMock.mockReturnValueOnce(latest.promise).mockReturnValueOnce(older.promise);

    const latestRequest = fetchThreadState(queryClient, "thread-a");
    const olderRequest = fetchOlderThreadMessagesState(queryClient, "thread-a");
    older.resolve(detail("thread-a", ["message-1"], null));
    await Promise.resolve();
    latest.resolve(detail("thread-a", ["message-2", "message-3"], "cursor-2"));
    await Promise.all([latestRequest, olderRequest]);

    expect(
      queryClient
        .getQueryData<ThreadDetailResponse>(serverStateKeys.thread("thread-a"))
        ?.messages.map((message) => message.id),
    ).toEqual(["message-1", "message-2", "message-3"]);
    expect(
      queryClient.getQueryData<ThreadDetailResponse>(serverStateKeys.thread("thread-a"))
        ?.olderMessagesCursor,
    ).toBeNull();
  });

  it("clears pagination when replacing complete history", () => {
    const queryClient = new QueryClient();
    const current = detail("thread-a", ["message-1", "message-2"], "cursor-2");
    queryClient.setQueryData(serverStateKeys.thread("thread-a"), current);

    setThreadDetailState(queryClient, current.thread, [current.messages[1]], [], {
      replaceMessages: true,
    });
    expect(
      queryClient.getQueryData<ThreadDetailResponse>(serverStateKeys.thread("thread-a")),
    ).toMatchObject({
      olderMessagesCursor: null,
      messages: [current.messages[1]],
    });
  });
});
