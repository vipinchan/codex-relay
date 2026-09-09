import { describe, expect, it } from "vitest";
import type { ChatMessage } from "codex-relay/api-schema";

import { buildTimelineRows, timelinePreviousUserRowIndex } from "./timeline-rows";

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
