import { describe, expect, it } from "vitest";

import { orderedMentionIds, mergeBotMessagePages, mentionPayload } from "./bot-compose";

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
