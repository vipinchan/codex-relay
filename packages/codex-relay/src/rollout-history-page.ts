import { open } from "node:fs/promises";

export type RolloutHistoryLine = { text: string; offset: number };

export type RolloutHistoryPage = {
  lines: RolloutHistoryLine[];
  olderOffset: number | null;
  bytesRead: number;
};

const CHUNK_SIZE = 64 * 1024;

type Boundary =
  | { kind: "start" | "context"; turnId: string | null }
  | { kind: "user"; source: "event" | "response"; key: string }
  | null;

function userContentKey(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    const texts = value.map((item) =>
      item && typeof item === "object" && "text" in item ? item.text : undefined,
    );
    if (texts.every((text) => typeof text === "string")) {
      return texts.join("\n");
    }
  }
  return JSON.stringify(value ?? null);
}

function boundaryForLine(value: unknown): Boundary {
  const record = value as { type?: unknown; payload?: Record<string, unknown> };
  const payload = record.payload;
  if (!payload || typeof payload !== "object") {
    return null;
  }
  if (record.type === "turn_context") {
    return {
      kind: "context",
      turnId: typeof payload.turn_id === "string" ? payload.turn_id : null,
    };
  }
  if (record.type === "event_msg") {
    if (payload.type === "task_started" || payload.type === "turn_context") {
      return {
        kind: payload.type === "task_started" ? "start" : "context",
        turnId: typeof payload.turn_id === "string" ? payload.turn_id : null,
      };
    }
    if (payload.type === "user_message") {
      return {
        kind: "user",
        source: "event",
        key: userContentKey(payload.message ?? payload.content),
      };
    }
  }
  if (record.type === "response_item" && payload.type === "message" && payload.role === "user") {
    return {
      kind: "user",
      source: "response",
      key: userContentKey(payload.content),
    };
  }
  return null;
}

async function hasTurnMarkers(file: Awaited<ReturnType<typeof open>>, size: number) {
  let offset = 0;
  let pending = Buffer.alloc(0);
  while (offset < size) {
    const length = Math.min(8 * 1024, size - offset);
    const chunk = Buffer.allocUnsafe(length);
    const { bytesRead } = await file.read(chunk, 0, length, offset);
    if (bytesRead !== length) {
      throw new Error("Rollout changed while reading history.");
    }
    offset += bytesRead;
    const buffer = pending.length ? Buffer.concat([pending, chunk]) : chunk;
    let start = 0;
    for (let index = buffer.indexOf(10, start); index >= 0; index = buffer.indexOf(10, start)) {
      const line = buffer.toString("utf8", start, index);
      start = index + 1;
      try {
        const boundary = boundaryForLine(JSON.parse(line));
        if (boundary?.kind === "start" || boundary?.kind === "context") {
          return { found: true, bytesRead: offset };
        }
        if (boundary?.kind === "user") {
          return { found: false, bytesRead: offset };
        }
      } catch {
        // A malformed JSONL record does not establish the history format.
      }
    }
    pending = buffer.subarray(start);
  }
  return { found: false, bytesRead: offset };
}

async function* linesBackward(
  file: Awaited<ReturnType<typeof open>>,
  endOffset: number,
  stats: { bytesRead: number },
): AsyncGenerator<RolloutHistoryLine> {
  let position = endOffset;
  let unfinished = Buffer.alloc(0);
  while (position > 0) {
    const length = Math.min(CHUNK_SIZE, position);
    position -= length;
    const chunk = Buffer.allocUnsafe(length);
    const { bytesRead } = await file.read(chunk, 0, length, position);
    stats.bytesRead += bytesRead;
    if (bytesRead !== length) {
      throw new Error("Rollout changed while reading history.");
    }
    const buffer = unfinished.length ? Buffer.concat([chunk, unfinished]) : chunk;
    let end = buffer.length;
    while (end > 0) {
      const index = buffer.lastIndexOf(10, end - 1);
      if (index < 0) {
        break;
      }
      const text = buffer.toString("utf8", index + 1, end).trimEnd();
      if (text) {
        yield { text, offset: position + index + 1 };
      }
      end = index;
    }
    unfinished = buffer.subarray(0, end);
  }
  if (unfinished.length) {
    const text = unfinished.toString("utf8").trimEnd();
    if (text) {
      yield { text, offset: 0 };
    }
  }
}

export async function readRolloutHistoryPage(
  path: string,
  options: { limit: number; cursor?: number },
): Promise<RolloutHistoryPage> {
  if (!Number.isSafeInteger(options.limit) || options.limit < 1) {
    throw new RangeError("limit must be a positive integer.");
  }
  const file = await open(path, "r");
  try {
    const { size } = await file.stat();
    const endOffset = options.cursor ?? size;
    if (!Number.isSafeInteger(endOffset) || endOffset < 0 || endOffset > size) {
      throw new RangeError("cursor must be a byte offset in the rollout file.");
    }
    const markerProbe = await hasTurnMarkers(file, size);
    const markerMode = markerProbe.found;
    const stats = { bytesRead: markerProbe.bytesRead };
    const lines: RolloutHistoryLine[] = [];
    let turnCount = 0;
    let activeTurnId: string | undefined;
    let activeTurnHasContext = false;
    let fallback: { source: "event" | "response"; key: string } | undefined;
    let pageStart: number | undefined;
    let selectedStartConfirmed = false;
    let hasOlder = false;

    for await (const line of linesBackward(file, endOffset, stats)) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line.text);
      } catch {
        // The active writer may leave an incomplete final JSONL record.
        continue;
      }
      if (!parsed || typeof parsed !== "object") {
        continue;
      }
      const boundary = boundaryForLine(parsed);
      if (selectedStartConfirmed) {
        if (boundary && (!markerMode || boundary.kind !== "user")) {
          hasOlder = true;
          break;
        }
        continue;
      }

      if (boundary?.kind === "user" && !markerMode) {
        const duplicatesResponseUser =
          boundary.source === "event" &&
          fallback?.source === "response" &&
          fallback.key === boundary.key &&
          activeTurnId === undefined;
        if (!duplicatesResponseUser) {
          turnCount += 1;
        }
        fallback = { source: boundary.source, key: boundary.key };
        if (turnCount > options.limit) {
          hasOlder = true;
          break;
        }
        activeTurnId = undefined;
        activeTurnHasContext = false;
        if (turnCount === options.limit) {
          pageStart = line.offset;
        }
      } else if (boundary && boundary.kind !== "user") {
        const turnId =
          boundary.turnId ??
          (boundary.kind === "start" && activeTurnHasContext ? activeTurnId : undefined) ??
          `${boundary.kind}:${line.offset}`;
        if (activeTurnId !== turnId) {
          if (activeTurnId !== undefined || !fallback) {
            turnCount += 1;
          }
          activeTurnId = turnId;
          fallback = undefined;
        }
        activeTurnHasContext = boundary.kind === "context";
        if (turnCount > options.limit) {
          hasOlder = true;
          break;
        }
        if (turnCount === options.limit) {
          pageStart = line.offset;
          if (boundary.kind === "start") {
            selectedStartConfirmed = true;
          }
        }
      }
      lines.push(line);
    }

    const firstOffset = pageStart ?? 0;
    return {
      lines: lines.filter((line) => line.offset >= firstOffset).reverse(),
      olderOffset: hasOlder ? firstOffset : null,
      bytesRead: stats.bytesRead,
    };
  } finally {
    await file.close();
  }
}
