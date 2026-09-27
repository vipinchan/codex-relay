import { describe, expect, it } from "vitest";

import {
  ASSISTANT_MARKDOWN_FLAVOR,
  createAssistantMarkdownStyle,
} from "../../../apps/mobile/src/components/chat/assistant-markdown-presentation.js";

const theme = {
  backgroundSelected: "#171A1F",
  text: "#F3F5F7",
  textSecondary: "#A8B0BA",
};

const fonts = {
  mono: "Mono",
  monoMedium: "Mono-Medium",
  sans: "Sans",
  sansMedium: "Sans-Medium",
  sansSemiBold: "Sans-Semibold",
};

const fixture = [
  "# H1",
  "",
  "## H2",
  "",
  "### H3",
  "",
  "A dense Chinese paragraph with **strong text**, *emphasis*, and [a link](https://example.com).",
  "",
  "> A blockquote that should read as a distinct information block.",
  "",
  "- First item",
  "- Second item",
  "  - Nested item",
  "",
  "| Item | Value | Note |",
  "| --- | ---: | --- |",
  "| Alpha | 42 | table cell |",
  "",
  "- [x] Completed",
  "- [ ] Pending",
  "",
  "`inline code`",
].join("\n");

describe("assistant markdown presentation", () => {
  it("uses GitHub flavor for tables and task lists", () => {
    expect(ASSISTANT_MARKDOWN_FLAVOR).toBe("github");
    expect(fixture).toContain("| Item | Value | Note |");
    expect(fixture).toContain("- [ ] Pending");
  });

  it("keeps body text readable and headings visibly hierarchical", () => {
    const style = createAssistantMarkdownStyle(theme, fonts);

    expect(style.paragraph).toMatchObject({
      fontSize: 15,
      lineHeight: 24,
      marginBottom: 13,
    });
    expect(style.h1).toMatchObject({ fontSize: 22, lineHeight: 30, marginTop: 28 });
    expect(style.h2).toMatchObject({ fontSize: 20, lineHeight: 28, marginTop: 24 });
    expect(style.h3).toMatchObject({ fontSize: 18, lineHeight: 26, marginTop: 20 });
    expect(style.h3?.fontSize).toBeGreaterThan(style.paragraph?.fontSize ?? 0);
  });

  it("renders lists, quotes, and tables as separated blocks", () => {
    const style = createAssistantMarkdownStyle(theme, fonts);

    expect(style.list).toMatchObject({
      fontSize: 15,
      lineHeight: 24,
      itemSpacing: 6,
      marginBottom: 13,
    });
    expect(style.blockquote).toMatchObject({
      borderWidth: 3,
      gapWidth: 12,
      lineHeight: 24,
      marginBottom: 16,
    });
    expect(style.table).toMatchObject({
      fontSize: 13,
      lineHeight: 20,
      cellPaddingHorizontal: 12,
      cellPaddingVertical: 9,
      marginBottom: 18,
    });
  });

  it("keeps task lists visually explicit without mutating message Markdown", () => {
    const style = createAssistantMarkdownStyle(theme, fonts);

    expect(style.taskList).toMatchObject({
      checkboxSize: 17,
      checkedStrikethrough: false,
    });
  });
});
