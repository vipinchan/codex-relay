import { describe, expect, it } from "vitest";

import {
  externalFileLinks,
  localFileLinks,
  messageCodeContentForRender,
  messageLinkAction,
  messageMarkdownContentForRender,
} from "./message-markdown-content";

describe("external file links", () => {
  it("identifies HTTPS file links while preserving regular links and code", () => {
    const content = [
      "[Install](https://example.com/release/CodexRelay.ipa?download=1)",
      "[Report](https://example.com/%E6%8A%A5%E5%91%8A.pdf)",
      "[Again](https://example.com/release/CodexRelay.ipa?download=1)",
      "[Page](https://example.com/index.html)",
      "[Insecure](http://example.com/file.zip)",
      "![Image](https://example.com/file.png)",
      "`[Inline](https://example.com/inline.zip)`",
      "```",
      "[Code](https://example.com/example.zip)",
      "```",
    ].join("\n");
    expect(externalFileLinks(content)).toEqual([
      {
        url: "https://example.com/release/CodexRelay.ipa?download=1",
        name: "CodexRelay.ipa",
        extension: "IPA",
      },
      { url: "https://example.com/%E6%8A%A5%E5%91%8A.pdf", name: "报告.pdf", extension: "PDF" },
    ]);
  });
});

describe("conversation file links", () => {
  it("extracts local artifacts and staged files without changing Markdown previews", () => {
    const staged = "relay-file:12345678-1234-4123-8123-123456789abc/Build%20notes.custom";
    const content = [
      "[IPA](./build/CodexRelay.ipa)",
      "[Outside](/tmp/Some%20report.pdf)",
      "[Markdown](./readme.md)",
      `[Staged](${staged})`,
      "[Invalid](relay-file:../../private.zip)",
      "[External](https://example.com/build.ipa)",
      "> [Quoted](./unshared.zip)",
    ].join("\n");
    expect(localFileLinks(content)).toEqual([
      { path: "./build/CodexRelay.ipa", name: "CodexRelay.ipa", extension: "IPA" },
      {
        path: staged.replace("%20", " "),
        name: "Build notes.custom",
        extension: "CUSTOM",
      },
    ]);
    expect(messageLinkAction(staged)).toEqual({ kind: "ignore" });
    expect(messageLinkAction("./readme.md")).toEqual({
      kind: "workspace-markdown",
      path: "./readme.md",
    });
  });
});

describe("messageMarkdownContentForRender", () => {
  it.each([
    ["soft break", "first\n"],
    ["blank line", "first\n\n"],
    ["hard break spaces", "first  "],
    ["list indentation", "- parent\n  "],
  ])("preserves trailing Markdown syntax while streaming: %s", (_name, content) => {
    expect(messageMarkdownContentForRender(content)).toBe(content);
  });

  it("keeps an empty streaming message renderable", () => {
    expect(messageMarkdownContentForRender("")).toBe(" ");
  });

  it("preserves nested fenced code inside blockquotes and list items", () => {
    const content = [
      "> Quoted explanation",
      ">",
      "> ```ts",
      "> const value = 1;",
      "> ```",
      "",
      "1. Install the package",
      "",
      "   ```bash",
      "   pnpm install",
      "   ```",
    ].join("\n");

    expect(messageMarkdownContentForRender(content)).toBe(content);
  });
});

describe("messageCodeContentForRender", () => {
  it("preserves incomplete fenced-code newlines while streaming", () => {
    expect(messageCodeContentForRender("const first = 1;\n\n")).toBe("const first = 1;\n\n");
  });
});
