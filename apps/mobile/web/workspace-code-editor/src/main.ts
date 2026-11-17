import { shikiToMonaco } from "@shikijs/monaco";
import { linkBridge } from "@webview-bridge/web";
import * as monaco from "monaco-editor-core";
import { createHighlighter } from "shiki";

import { appearanceLight } from "../../../src/constants/appearance";
import { applyWorkspaceWebTheme, createWorkspaceWebTheme, type WorkspaceWebTheme } from "./theme";

import type {
  WorkspaceCodeEditorBridge,
  WorkspaceCodeEditorPostMessageSchema,
  WorkspaceCodeEditorState,
} from "../../../src/components/chat/workspace-preview/workspace-code-editor-bridge";

import "./style.css";

declare global {
  interface Window {
    __workspaceCodeEditorId?: string;
    __workspaceCodeEditorTheme?: WorkspaceWebTheme;
  }
}

const editorId = window.__workspaceCodeEditorId ?? "";

const defaultEditorState: WorkspaceCodeEditorState = {
  editorId,
  language: "plaintext",
  lineNumbers: false,
  mode: "viewer",
  value: "",
  theme:
    window.__workspaceCodeEditorTheme ?? createWorkspaceWebTheme(appearanceLight, "light", "code"),
};

const bridge = linkBridge<WorkspaceCodeEditorBridge, WorkspaceCodeEditorPostMessageSchema>({
  debug: false,
  initialBridge: {
    ...defaultEditorState,
    reportChange: async () => undefined,
    reportError: async () => undefined,
    reportReady: async () => undefined,
  },
});

const supportedLanguages = [
  "bash",
  "css",
  "diff",
  "dockerfile",
  "go",
  "html",
  "java",
  "javascript",
  "json",
  "jsx",
  "kotlin",
  "markdown",
  "python",
  "ruby",
  "rust",
  "shellscript",
  "swift",
  "tsx",
  "typescript",
  "xml",
  "yaml",
] as const;

let editor: monaco.editor.IStandaloneCodeEditor | undefined;
let currentState = defaultEditorState;
let isApplyingNativeValue = false;
let lastNativeValue = "";
let pendingState: WorkspaceCodeEditorState | undefined;
let lastRenderedLineCount = 0;
let pendingLayoutFrame = 0;
let hasAppliedState = false;

self.MonacoEnvironment = {
  getWorker() {
    return new Worker(
      "data:text/javascript;charset=utf-8," +
        encodeURIComponent(
          "self.onmessage=function(){/* Monaco editor worker disabled in inline WebView. */}",
        ),
    );
  },
};

bridge.addEventListener("editorState", (state) => {
  if (state.editorId === editorId) {
    applyBridgeState(state);
  }
});

applyWorkspaceWebTheme(defaultEditorState.theme!);
void initializeEditor();

async function initializeEditor() {
  try {
    for (const languageId of supportedLanguages) {
      monaco.languages.register({ id: languageId });
    }

    const highlighter = await createHighlighter({
      langs: [...supportedLanguages],
      themes: ["github-light-default", "github-dark-default"],
    });
    shikiToMonaco(highlighter, monaco);

    const state = currentState;
    const model = monaco.editor.createModel(state.value, editorLanguage(state.language));
    lastNativeValue = state.value;

    editor = monaco.editor.create(containerElement(), {
      automaticLayout: true,
      cursorBlinking: state.mode === "editor" ? "blink" : "solid",
      cursorWidth: state.mode === "editor" ? 2 : 0,
      domReadOnly: state.mode !== "editor",
      fontFamily: "SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontLigatures: false,
      fontSize: 13,
      glyphMargin: false,
      lineDecorationsWidth: 0,
      lineHeight: 19,
      lineNumbers: "off",
      lineNumbersMinChars: 0,
      minimap: { enabled: false },
      model,
      overviewRulerLanes: 0,
      padding: { bottom: 10, top: 10 },
      readOnly: state.mode !== "editor",
      renderLineHighlight: state.mode === "editor" ? "line" : "none",
      roundedSelection: false,
      scrollBeyondLastLine: false,
      scrollbar: {
        alwaysConsumeMouseWheel: false,
        horizontalScrollbarSize: 6,
        verticalScrollbarSize: 6,
      },
      tabSize: 2,
      theme: monacoTheme(state.theme),
      wordWrap: "on",
    });

    editor.onDidChangeModelContent(() => {
      if (!editor || isApplyingNativeValue || currentState.mode !== "editor") {
        return;
      }
      const nextValue = editor.getValue();
      lastNativeValue = nextValue;
      renderLineNumbers();
      void bridge.reportChange(editorId, nextValue);
    });

    editor.onDidScrollChange(() => {
      syncLineNumberScroll();
    });
    editor.onDidChangeCursorPosition(() => {
      scheduleEditorViewportUpdate();
    });
    registerEditorViewportHandlers();

    applyBridgeState(pendingState ?? state);
    pendingState = undefined;
    void bridge.reportReady(editorId);
  } catch (error) {
    void bridge.reportError(editorId, error instanceof Error ? error.message : String(error));
  }
}

function monacoTheme(theme: WorkspaceWebTheme | undefined) {
  return theme?.scheme === "dark" ? "github-dark-default" : "github-light-default";
}

function applyBridgeState(state: WorkspaceCodeEditorState) {
  if (state.editorId !== editorId) {
    return;
  }
  const previousState = currentState;
  currentState = state;
  if (state.theme) {
    applyWorkspaceWebTheme(state.theme);
  }

  if (!editor) {
    pendingState = state;
    return;
  }

  const mode = state.mode;
  monaco.editor.setTheme(monacoTheme(state.theme));
  const unchangedConfiguration =
    hasAppliedState &&
    mode === previousState.mode &&
    state.language === previousState.language &&
    state.lineNumbers === previousState.lineNumbers;
  hasAppliedState = true;
  if (
    unchangedConfiguration &&
    (state.value === lastNativeValue || editor.getValue() === state.value)
  ) {
    return;
  }
  const isEditor = mode === "editor";
  document.body.classList.toggle("viewer-mode", !isEditor);
  document.body.classList.toggle("hide-line-numbers", !state.lineNumbers);
  document.body.classList.toggle("custom-line-numbers", state.lineNumbers);
  lineNumberRailElement().classList.toggle("visible", state.lineNumbers);

  editor.updateOptions({
    cursorBlinking: isEditor ? "blink" : "solid",
    cursorWidth: isEditor ? 2 : 0,
    domReadOnly: !isEditor,
    lineDecorationsWidth: 0,
    lineNumbers: "off",
    lineNumbersMinChars: 0,
    readOnly: !isEditor,
    renderLineHighlight: isEditor ? "line" : "none",
  });

  const model = editor.getModel();
  if (model) {
    monaco.editor.setModelLanguage(model, editorLanguage(state.language));
  }

  if (state.value === lastNativeValue || editor.getValue() === state.value) {
    lastNativeValue = state.value;
    renderLineNumbers();
    scheduleEditorViewportUpdate();
    return;
  }

  isApplyingNativeValue = true;
  lastNativeValue = state.value;
  editor.setValue(state.value);
  isApplyingNativeValue = false;
  renderLineNumbers();
  scheduleEditorViewportUpdate();
}

function registerEditorViewportHandlers() {
  window.addEventListener("resize", scheduleEditorViewportUpdate);
  window.visualViewport?.addEventListener("resize", scheduleEditorViewportUpdate);
  window.visualViewport?.addEventListener("scroll", scheduleEditorViewportUpdate);
  scheduleEditorViewportUpdate();
}

function scheduleEditorViewportUpdate() {
  if (pendingLayoutFrame) {
    cancelAnimationFrame(pendingLayoutFrame);
  }
  pendingLayoutFrame = requestAnimationFrame(() => {
    pendingLayoutFrame = 0;
    editor?.layout();
    renderLineNumbers();
    revealCursorIfNeeded();
  });
}

function revealCursorIfNeeded() {
  if (!editor || currentState.mode !== "editor") {
    return;
  }
  const position = editor.getPosition();
  if (position) {
    editor.revealPositionInCenterIfOutsideViewport(position);
  }
}

function containerElement() {
  const container = document.getElementById("container");
  if (!container) {
    throw new Error("Editor container is missing.");
  }
  return container;
}

function lineNumberRailElement() {
  const rail = document.getElementById("line-number-rail");
  if (!rail) {
    throw new Error("Line number rail is missing.");
  }
  return rail;
}

function renderLineNumbers() {
  if (!editor) {
    return;
  }
  const rail = lineNumberRailElement();
  const lineCount = editor.getModel()?.getLineCount() ?? 1;
  if (lineCount !== lastRenderedLineCount) {
    lastRenderedLineCount = lineCount;
    rail.innerHTML = Array.from(
      { length: lineCount },
      (_, index) => `<div>${index + 1}</div>`,
    ).join("");
  }
  syncLineNumberScroll();
}

function syncLineNumberScroll() {
  if (!editor) {
    return;
  }
  lineNumberRailElement().scrollTop = editor.getScrollTop();
}

function normalizeLanguage(value: string) {
  const aliases: Record<string, string> = {
    cjs: "javascript",
    htm: "html",
    js: "javascript",
    kt: "kotlin",
    md: "markdown",
    mdx: "markdown",
    mjs: "javascript",
    py: "python",
    rb: "ruby",
    rs: "rust",
    sh: "shellscript",
    text: "plaintext",
    ts: "typescript",
    yml: "yaml",
  };
  const normalized = String(value || "").toLowerCase();
  return aliases[normalized] || normalized || "plaintext";
}

function editorLanguage(value: string) {
  const normalized = normalizeLanguage(value);
  return supportedLanguages.includes(normalized as (typeof supportedLanguages)[number])
    ? normalized
    : "plaintext";
}
