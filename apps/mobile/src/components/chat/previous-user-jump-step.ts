import type { TimelineRow } from "./timeline-rows";

export function previousMessageIndex<Row>(
  rows: Row[],
  beforeIndex: number,
  isUserRow: (row: Row) => boolean,
) {
  for (let index = Math.min(rows.length - 1, beforeIndex - 1); index >= 0; index -= 1) {
    if (isUserRow(rows[index])) return index;
  }
  return undefined;
}

export function previousUserJumpStep(
  rows: TimelineRow[],
  beforeIndex: number,
  hiddenCount: number,
  hasEarlierMessages: boolean,
): { kind: "jump"; index: number } | { kind: "expand" | "fetch" | "end" } {
  const index = previousMessageIndex(
    rows,
    beforeIndex,
    (row) => row.type === "message" && row.message.role === "user",
  );
  if (index !== undefined) return { kind: "jump", index };
  if (hiddenCount > 0) return { kind: "expand" };
  if (hasEarlierMessages) return { kind: "fetch" };
  return { kind: "end" };
}

export function earlierPageProgressed(
  beforeCursor: string | null | undefined,
  afterCursor: string | null | undefined,
  beforeMessageCount: number,
  afterMessageCount: number,
) {
  return Boolean(
    beforeCursor &&
    afterCursor !== undefined &&
    afterCursor !== beforeCursor &&
    afterMessageCount >= beforeMessageCount,
  );
}
