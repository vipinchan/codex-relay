import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../src/api-schema.js";

import {
  activePlanProgressStep,
  implementablePlanId,
  isTimelinePlanProgressMessage,
  splitTimelinePlanProgress,
} from "../../../apps/mobile/src/components/chat/plan-progress.js";

describe("mobile plan progress", () => {
  it("moves running status plan updates out of visible message rows", () => {
    const messages = [
      chatMessage("user-1", "user", "chat", "Check logs"),
      {
        ...chatMessage(
          "plan-1",
          "status",
          "plan",
          [
            "inProgress: Map log output and Codex SDK event handling paths",
            "pending: Verify whether goal and time fields are present",
          ].join("\n"),
        ),
        details: {
          plan: [
            {
              status: "inProgress",
              step: "Map log output and Codex SDK event handling paths",
            },
            {
              status: "pending",
              step: "Verify whether goal and time fields are present",
            },
          ],
        },
      },
      chatMessage("assistant-1", "assistant", "chat", "I will check."),
    ];

    const result = splitTimelinePlanProgress(messages, true);

    expect(result.visibleMessages.map((message) => message.id)).toEqual(["user-1", "assistant-1"]);
    expect(result.progress?.steps).toEqual([
      {
        id: "plan-1-0",
        status: "inProgress",
        text: "Map log output and Codex SDK event handling paths",
      },
      {
        id: "plan-1-1",
        status: "pending",
        text: "Verify whether goal and time fields are present",
      },
    ]);
  });

  it("keeps assistant plan messages visible for implementable plan cards", () => {
    const messages = [chatMessage("assistant-plan", "assistant", "plan", "1. Edit README")];

    const result = splitTimelinePlanProgress(messages, true);

    expect(isTimelinePlanProgressMessage(messages[0])).toBe(false);
    expect(result.visibleMessages.map((message) => message.id)).toEqual(["assistant-plan"]);
    expect(result.progress).toBeUndefined();
    expect(implementablePlanId(messages)).toBe("assistant-plan");
  });

  it("keeps the final plan update visible after its turn completes", () => {
    const messages = [
      chatMessage("user-1", "user", "chat", "Plan the work"),
      chatMessage("plan-1", "status", "plan", "pending: Investigate"),
      chatMessage("plan-2", "status", "plan", "completed: Investigate\npending: Implement"),
    ];

    const result = splitTimelinePlanProgress(messages, false);

    expect(result.visibleMessages.map((message) => message.id)).toEqual(["user-1", "plan-2"]);
    expect(result.progress).toBeUndefined();
  });

  it("keeps the final status plan available after the thread stops", () => {
    const messages = [
      chatMessage("user-1", "user", "chat", "Check logs"),
      chatMessage("plan-1", "status", "plan", "completed: Inspect logs"),
    ];

    const result = splitTimelinePlanProgress(messages, false);

    expect(result.visibleMessages.map((message) => message.id)).toEqual(["user-1", "plan-1"]);
    expect(result.progress).toBeUndefined();
    expect(implementablePlanId(messages)).toBeUndefined();
  });

  it("keeps one final status plan per completed turn without duplicating an assistant plan", () => {
    const messages = [
      chatMessage("user-1", "user", "chat", "Plan the first task"),
      chatMessage("plan-1a", "status", "plan", "pending: First task"),
      chatMessage("plan-1b", "status", "plan", "completed: First task"),
      chatMessage("user-2", "user", "chat", "Plan the second task"),
      chatMessage("plan-2", "status", "plan", "pending: Second task"),
      chatMessage("assistant-plan-2", "assistant", "plan", "# Second task plan"),
    ];

    const result = splitTimelinePlanProgress(messages, false);

    expect(result.visibleMessages.map((message) => message.id)).toEqual([
      "user-1",
      "plan-1b",
      "user-2",
      "assistant-plan-2",
    ]);
  });

  it("does not reuse older progress when the newest status plan is unparseable", () => {
    const messages = [
      chatMessage("plan-1", "status", "plan", "inProgress: Inspect logs"),
      chatMessage("plan-2", "status", "plan", "Plan update received."),
    ];

    const result = splitTimelinePlanProgress(messages, true);

    expect(result.visibleMessages).toEqual([]);
    expect(result.progress).toBeUndefined();
  });

  it("selects the in-progress step for collapsed progress", () => {
    const result = splitTimelinePlanProgress(
      [
        {
          ...chatMessage("plan-1", "status", "plan", "Plan update received."),
          details: {
            plan: [
              { status: "completed", step: "Inspect logs" },
              { status: "inProgress", step: "Patch mobile progress banner" },
              { status: "pending", step: "Verify behavior" },
            ],
          },
        },
      ],
      true,
    );

    expect(result.progress ? activePlanProgressStep(result.progress)?.text : undefined).toBe(
      "Patch mobile progress banner",
    );
  });

  it("folds current-turn subagents into running plan progress without duplicate rows", () => {
    const messages = [
      { ...chatMessage("user-1", "user", "chat", "Inspect the app"), turnId: "turn-1" },
      {
        ...chatMessage("plan-1", "status", "plan", "inProgress: Inspect the app"),
        turnId: "turn-1",
      },
      {
        ...chatMessage("spawn-1", "tool", "subagentAction", "Spawned 2 subagents"),
        turnId: "turn-1",
        details: {
          type: "collabAgentToolCall",
          tool: "spawnAgent",
          status: "completed",
          receiverThreadIds: ["agent-1", "agent-2"],
          agentsStates: {
            "agent-1": { status: "running", message: null },
            "agent-2": { status: "completed", message: null },
          },
        },
      },
      {
        ...chatMessage("agent-1-started", "status", "subagentAction", "package-inspector started"),
        turnId: "turn-1",
        details: {
          type: "subAgentActivity",
          activityKind: "started",
          agentThreadId: "agent-1",
          agentPath: "package-inspector",
        },
      },
      chatMessage("assistant-1", "assistant", "chat", "Inspecting now."),
    ];

    const result = splitTimelinePlanProgress(messages, true);

    expect(result.visibleMessages.map((message) => message.id)).toEqual(["user-1", "assistant-1"]);
    expect(result.subagents?.agents).toEqual([
      { id: "agent-1", label: "package-inspector", status: "running" },
      { id: "agent-2", label: "Subagent 2", status: "completed" },
    ]);
  });

  it("keeps unrelated or unplanned subagent activity in the timeline", () => {
    const messages = [
      {
        ...chatMessage("old-agent", "status", "subagentAction", "old-agent started"),
        turnId: "turn-old",
        details: {
          type: "subAgentActivity",
          activityKind: "started",
          agentThreadId: "agent-old",
          agentPath: "old-agent",
        },
      },
      { ...chatMessage("user-1", "user", "chat", "Inspect the app"), turnId: "turn-1" },
      {
        ...chatMessage("plan-1", "status", "plan", "inProgress: Inspect the app"),
        turnId: "turn-1",
      },
    ];

    const plannedResult = splitTimelinePlanProgress(messages, true);
    const unplannedResult = splitTimelinePlanProgress([messages[0]!], true);

    expect(plannedResult.visibleMessages.map((message) => message.id)).toEqual([
      "old-agent",
      "user-1",
    ]);
    expect(plannedResult.subagents).toBeUndefined();
    expect(unplannedResult.visibleMessages.map((message) => message.id)).toEqual(["old-agent"]);
    expect(unplannedResult.subagents).toBeUndefined();
  });

  it("keeps later-turn subagents visible when turn IDs are unavailable", () => {
    const messages = [
      chatMessage("user-1", "user", "chat", "Inspect the app"),
      chatMessage("plan-1", "status", "plan", "inProgress: Inspect the app"),
      {
        ...chatMessage("agent-1", "status", "subagentAction", "inspector started"),
        details: {
          type: "subAgentActivity",
          activityKind: "started",
          agentThreadId: "agent-1",
          agentPath: "inspector",
        },
      },
      chatMessage("user-2", "user", "chat", "Start a separate task"),
      {
        ...chatMessage("agent-2", "status", "subagentAction", "reviewer started"),
        details: {
          type: "subAgentActivity",
          activityKind: "started",
          agentThreadId: "agent-2",
          agentPath: "reviewer",
        },
      },
    ];

    const result = splitTimelinePlanProgress(messages, true);

    expect(result.subagents).toBeUndefined();
    expect(result.visibleMessages.map((message) => message.id)).toEqual([
      "user-1",
      "agent-1",
      "user-2",
      "agent-2",
    ]);
  });

  it("does not reuse a historical plan after a newer user turn starts", () => {
    const messages = [
      { ...chatMessage("user-1", "user", "chat", "Inspect the app"), turnId: "turn-1" },
      {
        ...chatMessage("plan-1", "status", "plan", "inProgress: Inspect the app"),
        turnId: "turn-1",
      },
      { ...chatMessage("user-2", "user", "chat", "Start a separate task"), turnId: "turn-2" },
    ];

    const result = splitTimelinePlanProgress(messages, true);

    expect(result.progress).toBeUndefined();
    expect(result.subagents).toBeUndefined();
    expect(result.visibleMessages.map((message) => message.id)).toEqual(["user-1", "user-2"]);
  });

  it("preserves a delayed older-turn subagent when the current plan lacks a turn ID", () => {
    const messages = [
      { ...chatMessage("user-2", "user", "chat", "Inspect the current task"), turnId: "turn-2" },
      chatMessage("plan-2", "status", "plan", "inProgress: Inspect the current task"),
      {
        ...chatMessage("old-agent", "status", "subagentAction", "old inspector completed"),
        turnId: "turn-1",
        details: {
          type: "subAgentActivity",
          activityKind: "interrupted",
          agentThreadId: "agent-old",
          agentPath: "old-inspector",
        },
      },
    ];

    const result = splitTimelinePlanProgress(messages, true);

    expect(result.subagents).toBeUndefined();
    expect(result.visibleMessages.map((message) => message.id)).toEqual(["user-2", "old-agent"]);
  });

  it("preserves an identified subagent when the plan turn cannot be identified", () => {
    const messages = [
      chatMessage("user-1", "user", "chat", "Inspect the current task"),
      chatMessage("plan-1", "status", "plan", "inProgress: Inspect the current task"),
      {
        ...chatMessage("identified-agent", "status", "subagentAction", "inspector completed"),
        turnId: "turn-older",
        details: {
          type: "subAgentActivity",
          activityKind: "interrupted",
          agentThreadId: "agent-older",
          agentPath: "inspector",
        },
      },
    ];

    const result = splitTimelinePlanProgress(messages, true);

    expect(result.subagents).toBeUndefined();
    expect(result.visibleMessages.map((message) => message.id)).toEqual([
      "user-1",
      "identified-agent",
    ]);
  });

  it("does not regress a terminal agent state from a later-listed activity item", () => {
    const messages = [
      chatMessage("user-1", "user", "chat", "Inspect the app"),
      chatMessage("plan-1", "status", "plan", "inProgress: Inspect the app"),
      {
        ...chatMessage("spawn-1", "tool", "subagentAction", "Spawned inspector"),
        details: {
          type: "collabAgentToolCall",
          tool: "spawnAgent",
          status: "completed",
          receiverThreadIds: ["agent-1"],
          agentsStates: {
            "agent-1": { status: "completed", message: null },
          },
        },
      },
      {
        ...chatMessage("agent-1-started", "status", "subagentAction", "inspector started"),
        details: {
          type: "subAgentActivity",
          activityKind: "started",
          agentThreadId: "agent-1",
          agentPath: "inspector",
        },
      },
    ];

    const result = splitTimelinePlanProgress(messages, true);

    expect(result.subagents?.agents).toEqual([
      { id: "agent-1", label: "inspector", status: "completed" },
    ]);
  });

  it("keeps malformed same-turn subagent rows visible", () => {
    const messages = [
      chatMessage("user-1", "user", "chat", "Inspect the app"),
      chatMessage("plan-1", "status", "plan", "inProgress: Inspect the app"),
      {
        ...chatMessage("agent-1", "status", "subagentAction", "inspector started"),
        details: {
          type: "subAgentActivity",
          activityKind: "started",
          agentThreadId: "agent-1",
          agentPath: "inspector",
        },
      },
      {
        ...chatMessage("unknown-agent-event", "status", "subagentAction", "Unknown event"),
        details: {
          type: "unknownSubagentEvent",
          agentThreadId: "spoofed-agent",
        },
      },
    ];

    const result = splitTimelinePlanProgress(messages, true);

    expect(result.subagents?.agents).toEqual([
      { id: "agent-1", label: "inspector", status: "running" },
    ]);
    expect(result.visibleMessages.map((message) => message.id)).toEqual([
      "user-1",
      "unknown-agent-event",
    ]);
  });

  it("leaves oversized subagent batches in the timeline", () => {
    const receiverThreadIds = Array.from({ length: 65 }, (_, index) => `agent-${index}`);
    const messages = [
      chatMessage("user-1", "user", "chat", "Inspect the app"),
      chatMessage("plan-1", "status", "plan", "inProgress: Inspect the app"),
      {
        ...chatMessage("oversized-spawn", "tool", "subagentAction", "Spawned many subagents"),
        details: {
          type: "collabAgentToolCall",
          tool: "spawnAgent",
          status: "completed",
          receiverThreadIds,
          agentsStates: {},
        },
      },
    ];

    const result = splitTimelinePlanProgress(messages, true);

    expect(result.subagents).toBeUndefined();
    expect(result.visibleMessages.map((message) => message.id)).toEqual([
      "user-1",
      "oversized-spawn",
    ]);
  });
});

function chatMessage(
  id: string,
  role: ChatMessage["role"],
  kind: ChatMessage["kind"],
  content: string,
): ChatMessage {
  return {
    id,
    threadId: "thread-1",
    role,
    kind,
    content,
    createdAt: "2026-04-29T00:00:00.000Z",
  };
}
