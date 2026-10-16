import { describe, expect, it } from "vitest";

import {
  findMessageIndex,
  loadPagesUntilMessage,
  orderedMentionIds,
  mergeBotMessagePages,
  mentionPayload,
  mentionQuery,
  removeMentionToken,
} from "./bot-compose";

describe("orderedMentionIds", () => {
  it("sends selected members by group order, once each", () => {
    expect(orderedMentionIds(["b3", "b1", "b3"], ["b1", "b2", "b3"])).toEqual(["b1", "b3"]);
  });

  it("drops removed members and leaves default routing to the relay", () => {
    expect(orderedMentionIds(["gone"], ["b1"])).toEqual([]);
  });
});

describe("mergeBotMessagePages", () => {
  it("deduplicates refreshed pages and keeps stable message order", () => {
    const newer = [
      { id: "new", seq: 3 },
      { id: "middle", seq: 2 },
    ];
    const older = [
      { id: "middle", seq: 2 },
      { id: "old", seq: 1 },
    ];
    expect(mergeBotMessagePages(newer, older).map((message) => message.id)).toEqual([
      "old",
      "middle",
      "new",
    ]);
  });
});

describe("mentionPayload", () => {
  it("omits mentions when no current group member is selected", () => {
    expect(mentionPayload(["removed"], ["member"])).toBeUndefined();
  });

  it("uses member IDs and group order for a multi-BOT turn", () => {
    expect(mentionPayload(["third", "first"], ["first", "second", "third"])).toEqual([
      "first",
      "third",
    ]);
  });
});

describe("typed BOT mentions", () => {
  it("detects a trailing @ query and removes only that token after selection", () => {
    expect(mentionQuery("Please ask @des")).toBe("des");
    expect(removeMentionToken("Please ask @des")).toBe("Please ask ");
    expect(mentionQuery("email@example.com")).toBeNull();
  });
});

describe("source message lookup", () => {
  it("locates the actual source after older messages are merged", () => {
    const messages = mergeBotMessagePages(
      [{ id: "recent", seq: 3 }],
      [
        { id: "source", seq: 1 },
        { id: "middle", seq: 2 },
      ],
    );
    expect(findMessageIndex(messages, "source")).toBe(0);
    expect(findMessageIndex(messages, "missing")).toBe(-1);
  });

  it("loads pages in order and stops as soon as the source appears", async () => {
    const seen: string[] = [];
    const loaded: string[] = [];
    const result = await loadPagesUntilMessage(
      "source",
      "page-1",
      async (cursor) => {
        seen.push(cursor);
        return cursor === "page-1"
          ? { messages: [{ id: "middle" }], nextCursor: "page-2" }
          : { messages: [{ id: "source" }], nextCursor: "page-3" };
      },
      (page) => loaded.push(...page.messages.map((message) => message.id)),
      () => false,
    );
    expect(result).toBe("found");
    expect(seen).toEqual(["page-1", "page-2"]);
    expect(loaded).toEqual(["middle", "source"]);
  });

  it("reports unavailable only after exhausting history", async () => {
    const result = await loadPagesUntilMessage(
      "missing",
      "last",
      async () => ({ messages: [{ id: "other" }], nextCursor: null }),
      () => undefined,
      () => false,
    );
    expect(result).toBe("unavailable");
  });

  it("does not append a page after navigation cancels the lookup", async () => {
    let cancelled = false;
    const appended: string[] = [];
    const result = await loadPagesUntilMessage(
      "source",
      "last",
      async () => {
        cancelled = true;
        return { messages: [{ id: "source" }], nextCursor: null };
      },
      (page) => appended.push(...page.messages.map((message) => message.id)),
      () => cancelled,
    );
    expect(result).toBe("cancelled");
    expect(appended).toEqual([]);
  });
});
