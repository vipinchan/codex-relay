import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ListThreadsResponse, ThreadSummary } from "codex-relay/api-schema";

vi.mock("@/lib/codex-relay-api", () => ({
  getCodexRelayCacheIdentity: () => connectionIdentity,
  listThreads: vi.fn<typeof listThreads>(),
  archiveThread: vi.fn<typeof archiveThread>(),
  getStatus: vi.fn<() => void>(),
  getThread: vi.fn<() => void>(),
  getThreadContextWindow: vi.fn<() => void>(),
  listModels: vi.fn<() => void>(),
  listQueuedThreadInputs: vi.fn<() => void>(),
  getRateLimits: vi.fn<() => void>(),
  getVersion: vi.fn<() => void>(),
  getWorkspaceChanges: vi.fn<() => void>(),
  listWorkspaceDirectories: vi.fn<() => void>(),
}));
vi.mock("@/lib/workspace-runtime-preferences-cache", () => ({
  cacheWorkspaceRuntimePreferences: vi.fn<() => void>(),
  cacheWorkspaceRuntimePreferencesFromStatus: vi.fn<() => void>(),
}));

import { archiveThread, listThreads } from "./codex-relay-api";
import {
  archiveThreadServerState,
  clearServerState,
  fetchOlderThreadsState,
  fetchThreadsState,
  serverStateKeys,
  setThreadsState,
  upsertThreadState,
} from "./server-state";

const initialIdentity = "computer-a";
let connectionIdentity = initialIdentity;
const listThreadsMock = vi.mocked(listThreads);

function thread(id: string, updatedAt = "2026-11-17T00:00:00.000Z"): ThreadSummary {
  return { id, title: id, createdAt: updatedAt, updatedAt, state: "completed", messageCount: 1 };
}

function page(ids: string[], nextCursor: string | null): ListThreadsResponse {
  return { threads: ids.map((id) => thread(id)), source: "app-server", nextCursor };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("conversation list pagination cache", () => {
  beforeEach(() => {
    connectionIdentity = initialIdentity;
    listThreadsMock.mockReset();
  });

  it("loads twenty recent threads then appends unique older threads without replacing newer snapshots", async () => {
    const client = new QueryClient();
    listThreadsMock.mockResolvedValueOnce(page(["recent"], "page-2"));
    await fetchThreadsState(client);
    expect(listThreadsMock).toHaveBeenCalledWith({ limit: 20 });
    upsertThreadState(client, { ...thread("recent"), title: "New title" });
    listThreadsMock.mockResolvedValueOnce(page(["recent", "older"], "page-3"));
    await fetchOlderThreadsState(client);
    const cached = client.getQueryData<ListThreadsResponse>(serverStateKeys.threads())!;
    expect(cached.threads.map((item) => item.id)).toEqual(["recent", "older"]);
    expect(cached.threads[0].title).toBe("New title");
    expect(cached.nextCursor).toBe("page-3");
    expect(listThreadsMock).toHaveBeenLastCalledWith({ limit: 20, cursor: "page-2" });
  });

  it("preserves older pages and their exhausted cursor across background latest refreshes", async () => {
    const client = new QueryClient();
    listThreadsMock.mockResolvedValueOnce(page(["recent"], "page-2"));
    await fetchThreadsState(client);
    listThreadsMock.mockResolvedValueOnce(page(["older"], null));
    await fetchOlderThreadsState(client);
    listThreadsMock.mockResolvedValueOnce(page(["new", "recent"], "page-2"));
    await fetchThreadsState(client);
    const cached = client.getQueryData<ListThreadsResponse>(serverStateKeys.threads())!;
    expect(cached.threads.map((item) => item.id)).toEqual(["new", "recent", "older"]);
    expect(cached.nextCursor).toBeNull();
    await fetchOlderThreadsState(client);
    expect(listThreadsMock).toHaveBeenCalledTimes(3);
  });

  it("deduplicates concurrent page requests and retries the same cursor after failure", async () => {
    const client = new QueryClient();
    listThreadsMock.mockResolvedValueOnce(page(["recent"], "page-2"));
    await fetchThreadsState(client);
    const pending = deferred<ListThreadsResponse>();
    listThreadsMock.mockReturnValueOnce(pending.promise);
    const first = fetchOlderThreadsState(client);
    const second = fetchOlderThreadsState(client);
    expect(first).toBe(second);
    pending.resolve(page(["older"], "page-3"));
    await first;
    listThreadsMock.mockRejectedValueOnce(new Error("Offline"));
    await expect(fetchOlderThreadsState(client)).rejects.toThrow("Offline");
    expect(client.getQueryData<ListThreadsResponse>(serverStateKeys.threads())?.nextCursor).toBe(
      "page-3",
    );
    listThreadsMock.mockResolvedValueOnce(page(["oldest"], null));
    await fetchOlderThreadsState(client);
    expect(listThreadsMock).toHaveBeenLastCalledWith({ limit: 20, cursor: "page-3" });
  });

  it("resets pages on explicit refresh and ignores a late continuation with the same cursor", async () => {
    const client = new QueryClient();
    listThreadsMock.mockResolvedValueOnce(page(["recent"], "page-2"));
    await fetchThreadsState(client);
    const pending = deferred<ListThreadsResponse>();
    listThreadsMock.mockReturnValueOnce(pending.promise);
    const older = fetchOlderThreadsState(client);
    listThreadsMock.mockResolvedValueOnce(page(["refreshed"], "page-2"));
    await fetchThreadsState(client, { refresh: true });
    pending.resolve(page(["stale"], null));
    await older;
    expect(client.getQueryData<ListThreadsResponse>(serverStateKeys.threads())?.threads).toEqual([
      thread("refreshed"),
    ]);
  });

  it("ignores responses after the connection changes or its cache is cleared", async () => {
    const client = new QueryClient();
    listThreadsMock.mockResolvedValueOnce(page(["recent"], "page-2"));
    await fetchThreadsState(client);
    const oldKey = serverStateKeys.threads();
    const pending = deferred<ListThreadsResponse>();
    listThreadsMock.mockReturnValueOnce(pending.promise);
    const older = fetchOlderThreadsState(client);
    clearServerState(client);
    connectionIdentity = "computer-b";
    pending.resolve(page(["wrong-computer"], null));
    await older;
    expect(client.getQueryData(oldKey)).toBeUndefined();
    expect(client.getQueryData(serverStateKeys.threads())).toBeUndefined();
  });

  it("keeps pagination metadata through thread updates and archive responses", async () => {
    const client = new QueryClient();
    listThreadsMock.mockResolvedValueOnce(page(["recent"], "page-2"));
    await fetchThreadsState(client);
    listThreadsMock.mockResolvedValueOnce(page(["older"], "page-3"));
    await fetchOlderThreadsState(client);
    setThreadsState(
      client,
      client.getQueryData<ListThreadsResponse>(serverStateKeys.threads())!.threads,
      "app-server",
    );
    upsertThreadState(client, thread("new"));
    vi.mocked(archiveThread).mockResolvedValueOnce({
      archivedThreadId: "recent",
      source: "app-server",
      threads: [thread("new")],
    });
    await archiveThreadServerState(client, "recent");
    const cached = client.getQueryData<ListThreadsResponse>(serverStateKeys.threads())!;
    expect(cached.threads.map((item) => item.id)).toEqual(["new", "older"]);
    expect(cached.nextCursor).toBe("page-3");
  });

  it("does not revive an archived conversation from an older request already in flight", async () => {
    const client = new QueryClient();
    listThreadsMock.mockResolvedValueOnce(page(["recent"], "page-2"));
    await fetchThreadsState(client);
    const pending = deferred<ListThreadsResponse>();
    listThreadsMock.mockReturnValueOnce(pending.promise);
    const older = fetchOlderThreadsState(client);
    vi.mocked(archiveThread).mockResolvedValueOnce({
      archivedThreadId: "recent",
      source: "app-server",
      threads: [],
    });
    await archiveThreadServerState(client, "recent");
    pending.resolve(page(["recent", "older"], null));
    await older;
    expect(client.getQueryData<ListThreadsResponse>(serverStateKeys.threads())?.threads).toEqual(
      [],
    );
  });

  it("ignores a cleared cache request when the same connection is reopened at the same cursor", async () => {
    const client = new QueryClient();
    listThreadsMock.mockResolvedValueOnce(page(["recent"], "page-2"));
    await fetchThreadsState(client);
    const pending = deferred<ListThreadsResponse>();
    listThreadsMock.mockReturnValueOnce(pending.promise);
    const older = fetchOlderThreadsState(client);
    clearServerState(client);
    client.setQueryData(serverStateKeys.threads(), page(["replacement"], "page-2"));
    pending.resolve(page(["stale"], null));
    await older;
    expect(client.getQueryData<ListThreadsResponse>(serverStateKeys.threads())?.threads).toEqual([
      thread("replacement"),
    ]);
  });

  it("does not start an old connection refresh after switching computers during cancellation", async () => {
    const client = new QueryClient();
    const refresh = fetchThreadsState(client, { refresh: true });
    connectionIdentity = "computer-b";
    listThreadsMock.mockResolvedValueOnce(page(["wrong-computer"], null));
    await expect(refresh).rejects.toThrow(/connection changed/i);
    expect(listThreadsMock).not.toHaveBeenCalled();
  });
});
