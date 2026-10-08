import type { TimelineRow } from "./timeline-rows";
import { timelinePreviousUserRowIndex } from "./timeline-rows";

export function previousUserJumpStep(
  rows: TimelineRow[],
  beforeIndex: number,
  hiddenCount: number,
  hasEarlierMessages: boolean,
): { kind: "jump"; index: number } | { kind: "expand" | "fetch" | "end" } {
  const index = timelinePreviousUserRowIndex(rows, beforeIndex);
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
