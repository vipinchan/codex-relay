import type { ChatMessage } from "codex-relay/api-schema";

export const INITIAL_TIMELINE_WINDOW_SIZE = 300;
export const TIMELINE_WINDOW_INCREMENT = 150;

export type TimelineMessageRow = {
  key: string;
  message: ChatMessage;
  type: "message";
};

export type TimelineActivityGroupRow = {
  key: string;
  messages: ChatMessage[];
  type: "activity-group";
};

export type TimelineAssistantBlockRow = {
  copyContent?: string;
  isFirst: boolean;
  isLast: boolean;
  key: string;
  message: ChatMessage;
  type: "assistant-block";
};

export type TimelineRow = TimelineMessageRow | TimelineActivityGroupRow | TimelineAssistantBlockRow;

export function buildTimelineRows(
  messages: ChatMessage[],
  previousRows: readonly TimelineRow[] = [],
): TimelineRow[] {
  const rows: TimelineRow[] = [];
  const previousRowsByKey = new Map(previousRows.map((row) => [row.key, row]));
  let activityBuffer: ChatMessage[] = [];

  function flushActivityBuffer() {
    if (activityBuffer.length === 0) {
      return;
    }
    if (activityBuffer.length === 1) {
      rows.push(messageRow(activityBuffer[0]));
    } else {
      const first = activityBuffer[0];
      const last = activityBuffer.at(-1) ?? first;
      rows.push({
        key: `activity:${first.id}:${last.id}`,
        messages: activityBuffer,
        type: "activity-group",
      });
    }
    activityBuffer = [];
  }

  for (const message of messages) {
    if (isGroupableRuntimeActivity(message)) {
      const previous = activityBuffer.at(-1);
      if (previous && previous.turnId !== message.turnId) {
        flushActivityBuffer();
      }
      activityBuffer.push(message);
      continue;
    }
    flushActivityBuffer();
    if (isAssistantMarkdownMessage(message)) {
      rows.push(...assistantBlockRows(message, previousRowsByKey));
    } else {
      rows.push(messageRow(message));
    }
  }
  flushActivityBuffer();
  return rows;
}

export function timelineFollowTrigger(messages: ChatMessage[], isRunning: boolean) {
  let latestUserMessage: ChatMessage | undefined;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") {
      latestUserMessage = messages[index];
      break;
    }
  }
  return `${latestUserMessage?.id ?? "no-user"}:${isRunning ? "running" : "idle"}`;
}

export function visibleMessageWindow(messages: ChatMessage[], visibleCount: number) {
  const safeVisibleCount = Math.max(0, visibleCount);
  const hiddenCount = Math.max(0, messages.length - safeVisibleCount);
  return {
    hiddenCount,
    messages: hiddenCount > 0 ? messages.slice(hiddenCount) : messages,
  };
}

export function nextTimelineWindowSize(currentSize: number, totalMessages: number) {
  return Math.min(totalMessages, Math.max(0, currentSize) + TIMELINE_WINDOW_INCREMENT);
}

export function timelineLatestRowIndex(rowCount: number) {
  return rowCount > 0 ? rowCount - 1 : undefined;
}

function messageRow(message: ChatMessage): TimelineMessageRow {
  return { key: message.id, message, type: "message" };
}

function assistantBlockRows(
  message: ChatMessage,
  previousRowsByKey: ReadonlyMap<string, TimelineRow>,
): TimelineAssistantBlockRow[] {
  const blocks = splitAssistantMarkdownBlocks(message.content);
  return blocks.map((content, blockIndex) => {
    const isLast = blockIndex === blocks.length - 1;
    const row: TimelineAssistantBlockRow = {
      copyContent: isLast ? message.content : undefined,
      isFirst: blockIndex === 0,
      isLast,
      key: `assistant:${message.id}:block:${blockIndex}`,
      message: {
        ...message,
        content,
        details: isLast ? message.details : undefined,
        state: isLast ? message.state : "completed",
      },
      type: "assistant-block",
    };
    const previous = previousRowsByKey.get(row.key);
    return previous?.type === "assistant-block" && assistantBlockRowsMatch(previous, row)
      ? previous
      : row;
  });
}

function assistantBlockRowsMatch(
  previous: TimelineAssistantBlockRow,
  next: TimelineAssistantBlockRow,
) {
  return (
    previous.copyContent === next.copyContent &&
    previous.isFirst === next.isFirst &&
    previous.isLast === next.isLast &&
    previous.message.id === next.message.id &&
    previous.message.threadId === next.message.threadId &&
    previous.message.content === next.message.content &&
    previous.message.createdAt === next.message.createdAt &&
    previous.message.state === next.message.state &&
    previous.message.details === next.message.details
  );
}

export function splitAssistantMarkdownBlocks(content: string) {
  const blocks: string[] = [];
  let buffer: string[] = [];
  let fenceMarker: string | undefined;

  function flush() {
    const block = buffer.join("\n").trim();
    if (block) {
      blocks.push(block);
    }
    buffer = [];
  }

  for (const line of content.replace(/\r\n/g, "\n").split("\n")) {
    const fence = line.match(/^\s*(`{3,}|~{3,})/)?.[1];
    if (fenceMarker) {
      buffer.push(line);
      if (fence?.startsWith(fenceMarker[0]) && fence.length >= fenceMarker.length) {
        fenceMarker = undefined;
        flush();
      }
      continue;
    }
    if (fence) {
      flush();
      fenceMarker = fence;
      buffer.push(line);
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    buffer.push(line);
  }
  flush();
  return blocks.length > 0 ? blocks : [content || " "];
}

function isAssistantMarkdownMessage(message: ChatMessage) {
  return (
    message.role === "assistant" &&
    (message.kind === "chat" || message.kind === "unknown") &&
    Boolean(message.content.trim())
  );
}

function isGroupableRuntimeActivity(message: ChatMessage) {
  return (
    message.kind === "thinking" ||
    message.kind === "toolActivity" ||
    message.kind === "commandExecution" ||
    message.kind === "fileChange" ||
    message.kind === "subagentAction" ||
    message.kind === "webSearch"
  );
}
