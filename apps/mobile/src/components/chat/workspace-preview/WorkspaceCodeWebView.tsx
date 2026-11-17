import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { ThemedText } from "@/components/themed-text";
import { Icon } from "@/components/ui/icon";
import { Spacing } from "@/constants/theme";
import { useTheme, useThemeScheme } from "@/hooks/use-theme";
import {
  createWorkspaceWebTheme,
  type WorkspaceWebTheme,
} from "../../../../web/workspace-code-editor/src/theme";

import {
  createWorkspaceCodeEditorId,
  postWorkspaceCodeEditorState,
  registerWorkspaceCodeEditorBridgeHandlers,
  WorkspaceCodeEditorBridgeWebView,
  type WorkspaceCodeEditorMode,
  type WorkspaceCodeEditorState,
} from "./workspace-code-editor-bridge";
import workspaceCodeEditorHtml from "./workspace-code-editor-html";

const editorSource = { html: workspaceCodeEditorHtml };

export function WorkspaceCodeWebView({
  fill,
  language,
  lineNumbers,
  mode,
  value,
  onChangeText,
}: {
  fill?: boolean;
  language: string;
  lineNumbers?: boolean;
  mode: WorkspaceCodeEditorMode;
  value: string;
  onChangeText?: (value: string) => void;
}) {
  const theme = useTheme();
  const scheme = useThemeScheme();
  const webTheme = useMemo(() => createWorkspaceWebTheme(theme, scheme, "code"), [theme, scheme]);
  const webThemeRef = useRef(webTheme);
  webThemeRef.current = webTheme;
  const onChangeTextRef = useRef(onChangeText);
  const editorIdRef = useRef<string | null>(null);
  const postEditorStateRef = useRef(() => {});
  const postEditorStateTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  if (!editorIdRef.current) {
    editorIdRef.current = createWorkspaceCodeEditorId();
  }
  const editorId = editorIdRef.current;
  const initialScript = useRef(workspaceCodeEditorIdScript(editorId, webTheme));
  const stateRef = useRef<WorkspaceCodeEditorState>({
    editorId,
    language: normalizeMonacoLanguage(language),
    lineNumbers: Boolean(lineNumbers),
    mode,
    value,
    theme: webTheme,
  });
  const [editorError, setEditorError] = useState<string | null>(null);
  const [isEditorReady, setIsEditorReady] = useState(false);
  const postEditorState = useCallback(() => {
    postWorkspaceCodeEditorState(stateRef.current);
  }, []);
  const postEditorStateWithRetries = useCallback(() => {
    postEditorState();
    for (const delay of [80, 240]) {
      const timer = setTimeout(postEditorState, delay);
      postEditorStateTimersRef.current.push(timer);
    }
  }, [postEditorState]);

  useEffect(() => {
    postEditorStateRef.current = postEditorStateWithRetries;
  }, [postEditorStateWithRetries]);

  useEffect(() => {
    onChangeTextRef.current = onChangeText;
  }, [onChangeText]);

  useEffect(() => {
    return registerWorkspaceCodeEditorBridgeHandlers(editorId, {
      reportChange(nextValue) {
        stateRef.current = {
          ...stateRef.current,
          value: nextValue,
        };
        onChangeTextRef.current?.(nextValue);
      },
      reportError(message) {
        setIsEditorReady(true);
        setEditorError(message);
      },
      reportReady() {
        setIsEditorReady(true);
        setEditorError(null);
        postEditorStateRef.current();
      },
    });
  }, [editorId]);

  useEffect(() => {
    return () => {
      for (const timer of postEditorStateTimersRef.current) {
        clearTimeout(timer);
      }
      postEditorStateTimersRef.current = [];
    };
  }, []);

  useEffect(() => {
    const nextState = {
      editorId,
      language: normalizeMonacoLanguage(language),
      lineNumbers: Boolean(lineNumbers),
      mode,
      value,
      theme: webThemeRef.current,
    };
    stateRef.current = nextState;
    postEditorState();
  }, [editorId, language, lineNumbers, mode, postEditorState, value]);

  useEffect(() => {
    stateRef.current = { ...stateRef.current, theme: webTheme };
    postEditorState();
  }, [postEditorState, webTheme]);

  return (
    <View
      style={[
        styles.editorInputFrame,
        fill ? styles.editorInputFrameFill : styles.editorInputFrameFixed,
      ]}
    >
      <WorkspaceCodeEditorBridgeWebView
        allowFileAccess={false}
        allowUniversalAccessFromFileURLs={false}
        domStorageEnabled={false}
        injectedJavaScriptBeforeContentLoaded={initialScript.current}
        javaScriptEnabled
        nestedScrollEnabled
        onLoadStart={() => {
          setEditorError(null);
          setIsEditorReady(false);
        }}
        onLoadEnd={postEditorStateWithRetries}
        originWhitelist={["*"]}
        scrollEnabled={false}
        source={editorSource}
        style={styles.editorWebView}
      />
      {!isEditorReady && !editorError ? (
        <View style={styles.editorWebLoading}>
          <ActivityIndicator color={theme.accent} size="small" />
          <ThemedText type="small" style={styles.editorWebLoadingText}>
            Loading editor
          </ThemedText>
        </View>
      ) : null}
      {editorError ? (
        <View style={styles.editorWebError}>
          <Icon name="warning" size={15} tintColor={theme.dangerStrong} />
          <ThemedText type="small" style={styles.editorWebErrorText}>
            {editorError}
          </ThemedText>
        </View>
      ) : null}
    </View>
  );
}

function workspaceCodeEditorIdScript(editorId: string, theme: WorkspaceWebTheme) {
  return `window.__workspaceCodeEditorId = ${JSON.stringify(editorId)}; window.__workspaceCodeEditorTheme = ${JSON.stringify(theme)}; true;`;
}

function normalizeMonacoLanguage(language: string) {
  const normalized = language.toLowerCase();
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
  return aliases[normalized] ?? normalized;
}

const styles = StyleSheet.create((theme) => ({
  editorInputFrame: {
    backgroundColor: theme.codeBackground,
    borderColor: theme.border,
    borderCurve: "continuous",
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
  },
  editorInputFrameFixed: {
    height: 360,
  },
  editorInputFrameFill: {
    flex: 1,
    minHeight: 0,
  },
  editorWebView: {
    backgroundColor: theme.codeBackground,
    flex: 1,
  },
  editorWebLoading: {
    alignItems: "center",
    backgroundColor: theme.codeBackground,
    bottom: 0,
    gap: Spacing.two,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  editorWebLoadingText: {
    color: theme.accent,
  },
  editorWebError: {
    alignItems: "center",
    backgroundColor: theme.backgroundOverlayStrong,
    bottom: 0,
    flexDirection: "row",
    gap: Spacing.one,
    left: 0,
    padding: Spacing.two,
    position: "absolute",
    right: 0,
    top: 0,
  },
  editorWebErrorText: {
    color: theme.dangerStrong,
    flex: 1,
  },
}));
