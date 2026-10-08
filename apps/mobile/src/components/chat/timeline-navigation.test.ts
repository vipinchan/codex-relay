import { describe, expect, it } from "vitest";
import type { ChatMessage } from "codex-relay/api-schema";

import { buildTimelineRows, timelinePreviousUserRowIndex } from "./timeline-rows";
import { earlierPageProgressed, previousUserJumpStep } from "./previous-user-jump-step";

function message(id: string, role: ChatMessage["role"]): ChatMessage {
  return {
    content: id,
    createdAt: "2026-09-09T00:00:00Z",
    id,
    kind: "chat",
    role,
    state: "completed",
    threadId: "thread",
  } as ChatMessage;
}

describe("timelinePreviousUserRowIndex", () => {
  it("walks backward through user messages one prompt at a time", () => {
    const rows = buildTimelineRows([
      message("u1", "user"),
      message("a1", "assistant"),
      message("u2", "user"),
      message("a2", "assistant"),
      message("u3", "user"),
      message("a3", "assistant"),
    ]);

    const u3 = rows.findIndex((row) => row.type === "message" && row.message.id === "u3");
    const u2 = rows.findIndex((row) => row.type === "message" && row.message.id === "u2");
    const u1 = rows.findIndex((row) => row.type === "message" && row.message.id === "u1");

    expect(timelinePreviousUserRowIndex(rows, rows.length)).toBe(u3);
    expect(timelinePreviousUserRowIndex(rows, u3)).toBe(u2);
    expect(timelinePreviousUserRowIndex(rows, u2)).toBe(u1);
    expect(timelinePreviousUserRowIndex(rows, u1)).toBeUndefined();
  });
});

describe("previousUserJumpStep", () => {
  it("fetches an older page when the previous prompt is beyond the loaded page", () => {
    const currentRows = buildTimelineRows([message("u3", "user"), message("a3", "assistant")]);
    expect(previousUserJumpStep(currentRows, 0, 0, true)).toEqual({ kind: "fetch" });

    const expandedRows = buildTimelineRows([
      message("u2", "user"),
      message("a2", "assistant"),
      message("u3", "user"),
      message("a3", "assistant"),
    ]);
    const anchorIndex = expandedRows.findIndex(
      (row) => row.type === "message" && row.message.id === "u3",
    );
    const previousUserIndex = expandedRows.findIndex(
      (row) => row.type === "message" && row.message.id === "u2",
    );
    expect(previousUserJumpStep(expandedRows, anchorIndex, 0, false)).toEqual({
      kind: "jump",
      index: previousUserIndex,
    });
  });

  it("expands messages already in memory before fetching a remote page", () => {
    const rows = buildTimelineRows([message("u3", "user"), message("a3", "assistant")]);
    expect(previousUserJumpStep(rows, 0, 150, true)).toEqual({ kind: "expand" });
    expect(previousUserJumpStep(rows, 0, 0, false)).toEqual({ kind: "end" });
  });
});

describe("earlierPageProgressed", () => {
  it("continues across an empty or duplicate page when its cursor advances", () => {
    expect(earlierPageProgressed("cursor-1", "cursor-2", 2, 2)).toBe(true);
    expect(earlierPageProgressed("cursor-2", null, 2, 2)).toBe(true);
  });

  it("stops when a failed or unchanged page cannot make progress", () => {
    expect(earlierPageProgressed("cursor-1", "cursor-1", 2, 2)).toBe(false);
    expect(earlierPageProgressed("cursor-1", undefined, 2, 2)).toBe(false);
  });
});
