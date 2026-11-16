import { afterEach, expect, it, vi } from "vitest";

import { appearanceDark, appearanceLight } from "../../../src/constants/appearance";

const mocks = vi.hoisted(() => ({
  listener: undefined as undefined | ((state: unknown) => void),
  model: { getLineCount: () => 4 },
  editor: {
    getModel: vi.fn<(...args: unknown[]) => unknown>(),
    getScrollTop: () => 42,
    getValue: () => "unsaved edits",
    layout: vi.fn<(...args: unknown[]) => unknown>(),
    onDidChangeCursorPosition: vi.fn<(...args: unknown[]) => unknown>(),
    onDidChangeModelContent: vi.fn<(...args: unknown[]) => unknown>(),
    onDidScrollChange: vi.fn<(...args: unknown[]) => unknown>(),
    setValue: vi.fn<(...args: unknown[]) => unknown>(),
    updateOptions: vi.fn<(...args: unknown[]) => unknown>(),
  },
  create: vi.fn<(...args: unknown[]) => unknown>(),
  createModel: vi.fn<(...args: unknown[]) => unknown>(),
  setTheme: vi.fn<(...args: unknown[]) => unknown>(),
  createHighlighter: vi.fn<() => Promise<object>>(async () => ({})),
}));

vi.mock("@webview-bridge/web", () => ({
  linkBridge: () => ({
    addEventListener: (_name: string, callback: (state: unknown) => void) => {
      mocks.listener = callback;
    },
    reportReady: vi.fn<(...args: unknown[]) => unknown>(),
    reportError: vi.fn<(...args: unknown[]) => unknown>(),
  }),
}));
vi.mock("@shikijs/monaco", () => ({ shikiToMonaco: vi.fn<(...args: unknown[]) => unknown>() }));
vi.mock("shiki", () => ({ createHighlighter: mocks.createHighlighter }));
vi.mock("monaco-editor-core", () => ({
  editor: {
    create: mocks.create,
    createModel: mocks.createModel,
    setModelLanguage: vi.fn<(...args: unknown[]) => unknown>(),
    setTheme: mocks.setTheme,
  },
  languages: { register: vi.fn<(...args: unknown[]) => unknown>() },
}));

afterEach(() => vi.unstubAllGlobals());

it("switches editor theme through the bridge without replacing the model or unsaved text", async () => {
  const style = { setProperty: vi.fn<(...args: unknown[]) => unknown>(), colorScheme: "" };
  const element = { classList: { toggle: vi.fn<(...args: unknown[]) => unknown>() }, scrollTop: 0 };
  vi.stubGlobal("window", { __workspaceCodeEditorId: "editor" });
  vi.stubGlobal("self", {});
  vi.stubGlobal("document", {
    documentElement: { style },
    body: { classList: { toggle: vi.fn<(...args: unknown[]) => unknown>() } },
    getElementById: () => element,
    addEventListener: vi.fn<(...args: unknown[]) => unknown>(),
  });
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn<() => number>(() => 1),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn<(...args: unknown[]) => unknown>());
  window.addEventListener = vi.fn<(...args: unknown[]) => unknown>();
  mocks.editor.getModel.mockReturnValue(mocks.model);
  mocks.create.mockReturnValue(mocks.editor);
  mocks.createModel.mockReturnValue(mocks.model);

  await import("./main");
  await vi.waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
  mocks.editor.setValue.mockClear();

  const { createWorkspaceWebTheme } = await import("./theme");
  const state = {
    editorId: "editor",
    language: "typescript",
    lineNumbers: true,
    mode: "editor",
    value: "unsaved edits",
  };
  for (const scheme of ["dark", "light", "dark"] as const) {
    const palette = scheme === "dark" ? appearanceDark : appearanceLight;
    mocks.listener?.({ ...state, theme: createWorkspaceWebTheme(palette, scheme, "code") });
    expect(mocks.setTheme).toHaveBeenLastCalledWith(`github-${scheme}-default`);
    expect(style.setProperty).toHaveBeenCalledWith(
      "--workspace-background",
      palette.codeBackground,
    );
    vi.mocked(requestAnimationFrame).mockClear();
    mocks.listener?.({ ...state, theme: createWorkspaceWebTheme(palette, scheme, "code") });
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  }
  expect(mocks.create).toHaveBeenCalledOnce();
  expect(mocks.createModel).toHaveBeenCalledOnce();
  expect(mocks.editor.setValue).not.toHaveBeenCalled();
  expect(element.scrollTop).toBe(42);
  expect(mocks.createHighlighter).toHaveBeenCalledWith(
    expect.objectContaining({ themes: ["github-light-default", "github-dark-default"] }),
  );
});
