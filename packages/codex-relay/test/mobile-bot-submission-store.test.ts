import { describe, expect, it, vi } from "vitest";

import {
  clearPendingBotSubmission,
  getPendingBotSubmission,
  savePendingBotSubmission,
} from "../../../apps/mobile/src/state/bot-submission-store.js";

describe("BOT pending sends", () => {
  it("recovers the original request and images when the screen or app reloads", async () => {
    const submitted = {
      requestId: "uncertain-request",
      text: "What is in this photo?",
      draftText: "What is in this photo?",
      attachmentIds: ["photo"],
      attachments: [{ type: "image" as const, path: "/uploaded/photo.jpg" }],
      skills: [],
    };
    savePendingBotSubmission("bot:relay-one:conversation", submitted);
    vi.resetModules();
    const reloaded = await import("../../../apps/mobile/src/state/bot-submission-store.js");
    expect(reloaded.getPendingBotSubmission("bot:relay-one:conversation")).toEqual(submitted);
    expect(reloaded.getPendingBotSubmission("bot:relay-two:conversation")).toBeUndefined();
    clearPendingBotSubmission("bot:relay-one:conversation", submitted.requestId);
  });

  it("does not let a delayed completed request clear a newer pending send", () => {
    const submission = {
      requestId: "newer-request",
      text: "New question",
      draftText: "New question",
      attachmentIds: [],
      attachments: [],
      skills: [],
    };
    savePendingBotSubmission("bot:delayed", submission);
    clearPendingBotSubmission("bot:delayed", "older-request");
    expect(getPendingBotSubmission("bot:delayed")?.requestId).toBe("newer-request");
    clearPendingBotSubmission("bot:delayed", "newer-request");
    expect(getPendingBotSubmission("bot:delayed")).toBeUndefined();
  });
});
