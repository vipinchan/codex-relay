import { describe, expect, it } from "vitest";

import { preferredNewChatWorkspacePath, workspacePathInputError } from "./new-chat-workspace";

describe("workspacePathInputError", () => {
  it.each(["/Users/test/project", " /Users/test/My Projects/中文 #1/ ", "/"])(
    "accepts an absolute path: %s",
    (path) => {
      expect(workspacePathInputError(path)).toBeUndefined();
    },
  );

  it.each(["", "   "])("requires a nonempty path: %s", (path) => {
    expect(workspacePathInputError(path)).toBe("Enter a folder path.");
  });

  it.each(["project", "./project", "../project", "~/Projects", "file:///Users/test"])(
    "rejects a path that is not absolute: %s",
    (path) => {
      expect(workspacePathInputError(path)).toBe("Enter an absolute path starting with /.");
    },
  );
});

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
