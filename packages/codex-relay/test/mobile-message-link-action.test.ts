import { describe, expect, it } from "vitest";

import { messageLinkAction } from "../../../apps/mobile/src/components/chat/message-markdown-content.js";

describe("mobile message link action", () => {
  it("routes encoded file Markdown links to workspace preview", () => {
    const url =
      "file:///Users/vipinchan/vipinchan.github/personal-docs/01%E5%88%9D%E7%A8%BF/%E5%85%AC%E4%BC%97%E5%8F%B7%E6%96%87%E7%AB%A0.md";

    expect(messageLinkAction(url)).toEqual({
      kind: "workspace-markdown",
      path: url,
    });
  });

  it.each([
    "/Users/vipinchan/docs/README.md",
    "docs/README.mdx",
    "../notes/research.markdown",
  ])("routes local Markdown paths to workspace preview: %s", (url) => {
    expect(messageLinkAction(url).kind).toBe("workspace-markdown");
  });

  it("removes query and fragment suffixes from local Markdown paths", () => {
    expect(messageLinkAction("docs/README.mdx?mode=preview#section")).toEqual({
      kind: "workspace-markdown",
      path: "docs/README.mdx",
    });
  });

  it.each(["https://example.com/README.md", "mailto:test@example.com"])(
    "keeps external links external: %s",
    (url) => {
      expect(messageLinkAction(url)).toEqual({ kind: "external", url });
    },
  );

  it("does not hand non-Markdown file URLs to the platform URL opener", () => {
    expect(messageLinkAction("file:///Users/vipinchan/image.png")).toEqual({ kind: "ignore" });
  });

  it("continues to ignore skill display links", () => {
    expect(messageLinkAction("https://codex.local/skills/demo")).toEqual({ kind: "ignore" });
  });
});
