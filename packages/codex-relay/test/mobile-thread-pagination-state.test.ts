import { describe, expect, it } from "vitest";
import type { ChatMessage, ThreadDetailResponse, ThreadSummary } from "../src/api-schema.js";

import {
  appendOptimisticSteeringMessageToDetail,
  mergeOlderThreadDetailState,
  mergeThreadDetailState,
} from "../../../apps/mobile/src/lib/server-state-messages.js";

const thread: ThreadSummary = {
  id: "long-thread",
  title: "Long thread",
  createdAt: "2026-06-06T00:00:00.000Z",
  updatedAt: "2026-06-06T00:00:00.000Z",
  state: "completed",
  messageCount: 3,
};

function message(id: string, second: number): ChatMessage {
  return {
    id,
    threadId: thread.id,
    role: "user",
    kind: "chat",
    content: id,
    createdAt: `2026-06-06T00:00:0${second}.000Z`,
    state: "completed",
  };
}

function detail(messages: ChatMessage[], olderMessagesCursor: string | null): ThreadDetailResponse {
  return { thread, messages, pendingInputRequests: [], olderMessagesCursor };
}

describe("mobile thread pagination state", () => {
  it("keeps the oldest page cursor when the latest page refreshes", () => {
    const current = detail([message("old", 1), message("middle", 2)], "older-page");
    const refreshed = detail([message("middle", 2), message("new", 3)], "recent-page");

    expect(mergeThreadDetailState(current, refreshed)).toMatchObject({
      olderMessagesCursor: "older-page",
      messages: [message("old", 1), message("middle", 2), message("new", 3)],
    });
  });

  it("keeps an exhausted cursor when the latest page still has older history", () => {
    const current = detail([message("old", 1)], null);
    const refreshed = detail([message("new", 3)], "recent-page");

    expect(mergeThreadDetailState(current, refreshed).olderMessagesCursor).toBeNull();
  });

  it("prepends an older page, removes overlap, sorts, and advances its cursor", () => {
    const current = detail([message("middle", 2), message("new", 3)], "page-2");
    const older = detail([message("middle", 2), message("old", 1)], null);

    expect(mergeOlderThreadDetailState(current, older, "page-2")).toMatchObject({
      olderMessagesCursor: null,
      messages: [message("old", 1), message("middle", 2), message("new", 3)],
    });
  });

  it("ignores a late older page when the cursor has already advanced", () => {
    const current = detail([message("old", 1), message("middle", 2)], null);
    const late = detail([message("middle", 2)], "stale-page");

    expect(mergeOlderThreadDetailState(current, late, "page-2")).toBe(current);
  });

  it("does not mix pages belonging to another thread", () => {
    const current = detail([message("middle", 2)], "page-2");
    const wrongThread = {
      ...detail([message("old", 1)], null),
      thread: { ...thread, id: "other" },
    };

    expect(mergeOlderThreadDetailState(current, wrongThread, "page-2")).toBe(current);
  });

  it("preserves the cursor when adding an optimistic message", () => {
    const current = detail([message("middle", 2)], "page-2");
    const result = appendOptimisticSteeringMessageToDetail(current, {
      input: { id: "queued", prompt: "continue", attachments: [], skills: [] },
      nowIso: "2026-06-06T00:00:03.000Z",
      thread,
      threadId: thread.id,
    });

    expect(result?.olderMessagesCursor).toBe("page-2");
  });
});
