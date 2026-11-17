import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { AppServerThread } from "../src/app-server.js";

function thread(id: string, parentThreadId: string | null = null): AppServerThread {
  return {
    id,
    parentThreadId,
    name: id,
    preview: id,
    createdAt: 1,
    updatedAt: 2,
    status: { type: "idle" },
    cwd: "/workspace",
    source: "cli",
    modelProvider: "openai",
    turns: [],
  };
}

type ListThreadsPage = (options: { limit: number; cursor?: string }) => Promise<{
  data: AppServerThread[];
  nextCursor: string | null;
}>;

function serverWithPages(listThreadsPage: ListThreadsPage) {
  return createApp({
    appServer: {
      listThreadsPage,
      onNotification: () => () => undefined,
      onRequest: () => () => undefined,
    } as never,
    workspacePath: "/workspace",
  });
}

describe("thread list pagination", () => {
  it("defaults to twenty visible threads and exposes a global continuation cursor", async () => {
    const listThreadsPage = vi.fn<ListThreadsPage>(async () => ({
      data: Array.from({ length: 20 }, (_, index) => thread(`thread-${index}`)),
      nextCursor: "next-page",
    }));
    const app = serverWithPages(listThreadsPage);
    const response = await app.request("/v1/threads");
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.threads).toHaveLength(20);
    expect(body.nextCursor).toBe("next-page");
    expect(body.source).toBe("app-server");
    expect(listThreadsPage).toHaveBeenCalledWith({ limit: 20 });
  });

  it("fills filtered pages without skipping visible threads and advances across empty pages", async () => {
    const listThreadsPage = vi.fn<ListThreadsPage>(async ({ cursor }) => {
      if (!cursor) return { data: [thread("hidden", "parent")], nextCursor: "page-2" };
      if (cursor === "page-2") return { data: [], nextCursor: "page-3" };
      return { data: [thread("older-a"), thread("older-b")], nextCursor: "page-4" };
    });
    const app = serverWithPages(listThreadsPage);
    const body = await (await app.request("/v1/threads?limit=2")).json();
    expect(body.threads.map((item: { id: string }) => item.id)).toEqual(["older-a", "older-b"]);
    expect(body.nextCursor).toBe("page-4");
    expect(listThreadsPage.mock.calls.map(([options]) => options)).toEqual([
      { limit: 2 },
      { limit: 2, cursor: "page-2" },
      { limit: 2, cursor: "page-3" },
    ]);
  });

  it("forwards the requested cursor and returns a partial final page", async () => {
    const listThreadsPage = vi.fn<ListThreadsPage>(async () => ({
      data: [thread("last")],
      nextCursor: null,
    }));
    const app = serverWithPages(listThreadsPage);
    const body = await (await app.request("/v1/threads?limit=20&cursor=older")).json();
    expect(listThreadsPage).toHaveBeenCalledWith({ limit: 20, cursor: "older" });
    expect(body.threads).toHaveLength(1);
    expect(body.nextCursor).toBeNull();
  });

  it.each(["0", "-1", "1.5", "101", "nope"])("rejects an invalid page size %s", async (limit) => {
    const listThreadsPage = vi.fn<ListThreadsPage>(async () => ({ data: [], nextCursor: null }));
    const app = serverWithPages(listThreadsPage);
    expect((await app.request(`/v1/threads?limit=${limit}`)).status).toBe(400);
    expect(listThreadsPage).not.toHaveBeenCalled();
  });

  it("reports page failures instead of replacing history with an empty memory fallback", async () => {
    const app = serverWithPages(async () => {
      throw new Error("Connection unavailable");
    });
    expect((await app.request("/v1/threads?cursor=older")).status).toBe(502);
  });

  it("rejects a repeated cursor instead of looping forever", async () => {
    const app = serverWithPages(async () => ({ data: [], nextCursor: "same" }));
    expect((await app.request("/v1/threads?cursor=same")).status).toBe(502);
  });

  it("paginates memory history without overlapping pages", async () => {
    let threadCount = 0;
    const app = createApp({
      appServer: null,
      codex: {
        startThread: () => ({ id: `memory-${++threadCount}` }),
      } as never,
    });
    for (const title of ["first", "second", "third"]) {
      const response = await app.request("/v1/threads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title }),
      });
      expect(response.status).toBe(201);
    }
    const recent = await (await app.request("/v1/threads?limit=2")).json();
    const older = await (
      await app.request(`/v1/threads?limit=2&cursor=${encodeURIComponent(recent.nextCursor)}`)
    ).json();
    expect(recent.source).toBe("memory");
    expect(recent.threads).toHaveLength(2);
    expect(older.threads).toHaveLength(1);
    expect(older.nextCursor).toBeNull();
    expect(
      new Set([...recent.threads, ...older.threads].map((item: { id: string }) => item.id)).size,
    ).toBe(3);
  });

  it("rejects missing memory anchors and empty cursors", async () => {
    const app = createApp({ appServer: null });
    expect((await app.request("/v1/threads?cursor=memory:missing")).status).toBe(400);
    expect((await app.request("/v1/threads?cursor=")).status).toBe(400);
  });
});
