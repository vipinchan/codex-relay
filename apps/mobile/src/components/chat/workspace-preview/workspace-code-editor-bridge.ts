import { bridge, createWebView } from "@webview-bridge/react-native";

import type { WorkspaceWebTheme } from "../../../../web/workspace-code-editor/src/theme";

export type WorkspaceCodeEditorMode = "editor" | "viewer";

export type WorkspaceCodeEditorState = {
  editorId: string;
  language: string;
  lineNumbers: boolean;
  mode: WorkspaceCodeEditorMode;
  theme?: WorkspaceWebTheme;
  value: string;
};

type WorkspaceCodeEditorBridgeShape = WorkspaceCodeEditorState & {
  reportChange(editorId: string, value: string): Promise<void>;
  reportError(editorId: string, message: string): Promise<void>;
  reportReady(editorId: string): Promise<void>;
};

type WorkspaceCodeEditorBridgeHandlers = {
  reportChange(value: string): void;
  reportError(message: string): void;
  reportReady(): void;
};

const defaultEditorState: WorkspaceCodeEditorState = {
  editorId: "",
  language: "plaintext",
  lineNumbers: false,
  mode: "viewer",
  value: "",
};

const workspaceCodeEditorBridgeHandlers = new Map<string, WorkspaceCodeEditorBridgeHandlers>();
let nextWorkspaceCodeEditorId = 0;

export const workspaceCodeEditorPostMessageSchema = {
  editorState: {
    validate(value: unknown) {
      return value as WorkspaceCodeEditorState;
    },
  },
};

export type WorkspaceCodeEditorPostMessageSchema = typeof workspaceCodeEditorPostMessageSchema;

export const workspaceCodeEditorBridge = bridge<WorkspaceCodeEditorBridgeShape>(() => ({
  ...defaultEditorState,
  async reportChange(editorId, value) {
    workspaceCodeEditorBridgeHandlers.get(editorId)?.reportChange(value);
  },
  async reportError(editorId, message) {
    workspaceCodeEditorBridgeHandlers.get(editorId)?.reportError(message);
  },
  async reportReady(editorId) {
    workspaceCodeEditorBridgeHandlers.get(editorId)?.reportReady();
  },
}));

export const {
  postMessage: postWorkspaceCodeEditorBridgeMessage,
  WebView: WorkspaceCodeEditorBridgeWebView,
} = createWebView({
  bridge: workspaceCodeEditorBridge,
  debug: __DEV__,
  postMessageSchema: workspaceCodeEditorPostMessageSchema,
  responseTimeout: 5000,
});

export function createWorkspaceCodeEditorId() {
  nextWorkspaceCodeEditorId += 1;
  return `workspace-code-editor-${nextWorkspaceCodeEditorId}`;
}

export function registerWorkspaceCodeEditorBridgeHandlers(
  editorId: string,
  handlers: WorkspaceCodeEditorBridgeHandlers,
) {
  workspaceCodeEditorBridgeHandlers.set(editorId, handlers);
  return () => {
    if (workspaceCodeEditorBridgeHandlers.get(editorId) === handlers) {
      workspaceCodeEditorBridgeHandlers.delete(editorId);
    }
  };
}

export function postWorkspaceCodeEditorState(state: WorkspaceCodeEditorState) {
  workspaceCodeEditorBridge.setState(state);
  postWorkspaceCodeEditorBridgeMessage("editorState", state, {
    broadcast: true,
  });
}

export type WorkspaceCodeEditorBridge = typeof workspaceCodeEditorBridge;

export type WorkspaceCodeEditorBridgeState = ReturnType<WorkspaceCodeEditorBridge["getState"]>;
