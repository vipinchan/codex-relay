import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../src/api-schema.js";

import {
  buildTimelineRows,
  nextTimelineWindowSize,
  timelineFollowTrigger,
  timelineLatestRowIndex,
  visibleMessageWindow,
} from "../../../apps/mobile/src/components/chat/timeline-rows.js";

function message(
  id: string,
  role: ChatMessage["role"],
  kind: ChatMessage["kind"],
  content = id,
): ChatMessage {
  return {
    id,
    threadId: "thread-1",
    role,
    kind,
    content,
    createdAt: `2026-08-25T00:00:0${id.length}.000Z`,
    turnId: "turn-1",
    state: "completed",
  };
}

describe("buildTimelineRows activity grouping", () => {
  it("groups consecutive runtime events but keeps approvals actionable", () => {
    const rows = buildTimelineRows([
      message("user", "user", "chat", "Fix the chat UI"),
      message("think", "reasoning", "thinking", "Inspecting"),
      message("run", "tool", "commandExecution", "pnpm typecheck"),
      message("edit", "tool", "fileChange", "Edited one file"),
      message("approval", "status", "approvalRequest", "Approve command"),
    ]);

    expect(rows.map((row) => row.type)).toEqual(["message", "activity-group", "message"]);
    expect(rows[1]).toMatchObject({
      type: "activity-group",
      messages: [{ id: "think" }, { id: "run" }, { id: "edit" }],
    });
    expect(rows[2]).toMatchObject({ type: "message", message: { id: "approval" } });
  });
});

describe("timelineFollowTrigger", () => {
  it("ignores token growth but changes for user sends and run completion", () => {
    const user = message("user", "user", "chat", "Build it");
    const streaming = {
      ...message("assistant", "assistant", "chat", "A"),
      state: "streaming" as const,
    };
    const growing = { ...streaming, content: "A longer streamed response" };

    expect(timelineFollowTrigger([user, streaming], true)).toBe(
      timelineFollowTrigger([user, growing], true),
    );
    expect(timelineFollowTrigger([user, growing], false)).not.toBe(
      timelineFollowTrigger([user, growing], true),
    );
    expect(
      timelineFollowTrigger(
        [...([user, growing] as ChatMessage[]), message("user-2", "user", "chat")],
        true,
      ),
    ).not.toBe(timelineFollowTrigger([user, growing], true));
  });
});

describe("buildTimelineRows assistant blocks", () => {
  it("keeps completed markdown blocks stable while the streaming tail grows", () => {
    const first = {
      ...message(
        "assistant",
        "assistant",
        "chat",
        "Intro paragraph.\n\n```ts\nconst answer = 42;\n```\n\nTail",
      ),
      state: "streaming" as const,
    };
    const growing = { ...first, content: `${first.content} keeps growing` };

    const firstRows = buildTimelineRows([first]);
    const growingRows = buildTimelineRows([growing], firstRows);

    expect(firstRows.map((row) => row.type)).toEqual([
      "assistant-block",
      "assistant-block",
      "assistant-block",
    ]);
    expect(growingRows[0]).toBe(firstRows[0]);
    expect(growingRows[1]).toBe(firstRows[1]);
    expect(growingRows[2]).toMatchObject({
      key: "assistant:assistant:block:2",
      type: "assistant-block",
      isLast: true,
    });
  });
});

describe("visibleMessageWindow", () => {
  it("starts from the latest 300 messages and expands toward older history", () => {
    const messages = Array.from({ length: 450 }, (_, index) =>
      message(`message-${index}`, "user", "chat"),
    );

    const initial = visibleMessageWindow(messages, 300);
    expect(initial.hiddenCount).toBe(150);
    expect(initial.messages).toHaveLength(300);
    expect(initial.messages[0]?.id).toBe("message-150");

    const expanded = visibleMessageWindow(messages, nextTimelineWindowSize(300, messages.length));
    expect(expanded.hiddenCount).toBe(0);
    expect(expanded.messages).toHaveLength(450);
    expect(expanded.messages[0]?.id).toBe("message-0");
  });
});

describe("timelineLatestRowIndex", () => {
  it("targets the final rendered row and skips empty timelines", () => {
    expect(timelineLatestRowIndex(1)).toBe(0);
    expect(timelineLatestRowIndex(450)).toBe(449);
    expect(timelineLatestRowIndex(0)).toBeUndefined();
  });
});
