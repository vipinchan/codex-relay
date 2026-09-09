import { describe, expect, it } from "vitest";

import { preferredNewChatWorkspacePath } from "./new-chat-workspace";

describe("preferredNewChatWorkspacePath", () => {
  it("uses the most recently active conversation workspace", () => {
    expect(
      preferredNewChatWorkspacePath(
        [
          { createdAt: "2026-09-01T00:00:00Z", cwd: "/old", updatedAt: "2026-09-02T00:00:00Z" },
          { createdAt: "2026-09-03T00:00:00Z", cwd: "/latest", updatedAt: "2026-09-08T00:00:00Z" },
        ],
        "/fallback",
      ),
    ).toBe("/latest");
  });

  it("falls back when the latest conversation has no workspace", () => {
    expect(
      preferredNewChatWorkspacePath(
        [{ createdAt: "2026-09-08T00:00:00Z", cwd: undefined, updatedAt: "2026-09-08T00:00:00Z" }],
        "/fallback",
      ),
    ).toBe("/fallback");
  });
});
