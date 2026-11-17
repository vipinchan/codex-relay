import { useComputerOperations } from "@/hooks/use-computer-operations";
import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  TextInput,
  View,
  type GestureResponderEvent,
} from "react-native";
import { KeyboardAvoidingView, useKeyboardState } from "react-native-keyboard-controller";
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
  closeWorkspaceTerminalSession as rawCloseWorkspaceTerminalSession,
  createWorkspaceTerminalSession as rawCreateWorkspaceTerminalSession,
  resizeWorkspaceTerminalSession as rawResizeWorkspaceTerminalSession,
  streamWorkspaceTerminalOutput as rawStreamWorkspaceTerminalOutput,
  writeWorkspaceTerminalInput as rawWriteWorkspaceTerminalInput,
} from "@/lib/codex-relay-api";

import {
  createWorkspaceSshTerminalId,
  postWorkspaceSshTerminalOutput,
  postWorkspaceSshTerminalState,
  registerWorkspaceSshTerminalBridgeHandlers,
  type WorkspaceSshTerminalSessionStatus,
  type WorkspaceSshTerminalState,
  WorkspaceSshTerminalBridgeWebView,
} from "./workspace-ssh-terminal-bridge";
import workspaceSshTerminalHtml from "./workspace-ssh-terminal-html";

const terminalSource = { html: workspaceSshTerminalHtml };
const defaultTerminalFontSize = 13;
const minimumTerminalFontSize = 11;
const maximumTerminalFontSize = 18;
const terminalNativeInputClearDelayMs = 700;

const terminalArrowSequences = {
  down: "\x1b[B",
  left: "\x1b[D",
  right: "\x1b[C",
  up: "\x1b[A",
};

export function WorkspaceSshTerminalTab({ workspacePath }: { workspacePath?: string }) {
  const theme = useTheme();
  const scheme = useThemeScheme();
  const webTheme = useMemo(
    () => createWorkspaceWebTheme(theme, scheme, "terminal"),
    [theme, scheme],
  );
  const webThemeRef = useRef(webTheme);
  webThemeRef.current = webTheme;
  const postTerminalState = useCallback((state: WorkspaceSshTerminalState) => {
    const themedState = { ...state, theme: webThemeRef.current };
    postWorkspaceSshTerminalState(themedState);
  }, []);
  const {
    closeWorkspaceTerminalSession,
    createWorkspaceTerminalSession,
    resizeWorkspaceTerminalSession,
    streamWorkspaceTerminalOutput,
    writeWorkspaceTerminalInput,
  } = useComputerOperations({
    closeWorkspaceTerminalSession: rawCloseWorkspaceTerminalSession,
    createWorkspaceTerminalSession: rawCreateWorkspaceTerminalSession,
    resizeWorkspaceTerminalSession: rawResizeWorkspaceTerminalSession,
    streamWorkspaceTerminalOutput: rawStreamWorkspaceTerminalOutput,
    writeWorkspaceTerminalInput: rawWriteWorkspaceTerminalInput,
  });

  const terminalIdRef = useRef<string | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const terminalInputRef = useRef<TextInput>(null);
  const terminalTapStartRef = useRef<{ x: number; y: number } | null>(null);
  const terminalTapMovedRef = useRef(false);
  const terminalNativeInputValueRef = useRef("");
  const terminalInputClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const terminalRequestQueueRef = useRef<Promise<void>>(Promise.resolve());
  const terminalOutputStreamRef = useRef<null | (() => void)>(null);
  const activeSessionWorkspacePathRef = useRef<string | null>(null);
  const keyboardAvoidingEnabled = useKeyboardState(
    (state) => state.isVisible && state.height > 120,
  );
  if (!terminalIdRef.current) {
    terminalIdRef.current = createWorkspaceSshTerminalId();
  }
  const terminalId = terminalIdRef.current;
  const initialScript = useRef(workspaceSshTerminalIdScript(terminalId, webTheme));
  const [terminalError, setTerminalError] = useState<string | null>(null);
  const [isTerminalReady, setIsTerminalReady] = useState(false);
  const [terminalInputValue, setTerminalInputValue] = useState("");
  const [isCtrlActive, setIsCtrlActive] = useState(false);
  const [isShortcutsExpanded, setIsShortcutsExpanded] = useState(false);
  const [terminalFontSize, setTerminalFontSize] = useState(defaultTerminalFontSize);
  const [reconnectRequestId, setReconnectRequestId] = useState(0);
  const [terminalSessionStatus, setTerminalSessionStatus] =
    useState<WorkspaceSshTerminalSessionStatus>("connecting");
  const [terminalSessionMessage, setTerminalSessionMessage] = useState<string | null>(null);

  const focusTerminalKeyboard = () => {
    terminalInputRef.current?.focus();
  };

  const handleTerminalTouchStart = (event: GestureResponderEvent) => {
    terminalTapMovedRef.current = false;
    terminalTapStartRef.current = {
      x: event.nativeEvent.pageX,
      y: event.nativeEvent.pageY,
    };
  };

  const handleTerminalTouchMove = (event: GestureResponderEvent) => {
    const start = terminalTapStartRef.current;
    if (!start) {
      return;
    }
    const distanceX = Math.abs(event.nativeEvent.pageX - start.x);
    const distanceY = Math.abs(event.nativeEvent.pageY - start.y);
    if (distanceX > 10 || distanceY > 10) {
      terminalTapMovedRef.current = true;
    }
  };

  const handleTerminalTouchEnd = () => {
    if (!terminalTapMovedRef.current) {
      focusTerminalKeyboard();
    }
    terminalTapStartRef.current = null;
    terminalTapMovedRef.current = false;
  };

  const handleTerminalApiError = (error: unknown) => {
    setIsTerminalReady(true);
    setTerminalError(terminalErrorMessage(error));
  };

  const enqueueTerminalRequest = <T,>(operation: () => Promise<T>) => {
    const request = terminalRequestQueueRef.current.then(operation, operation);
    terminalRequestQueueRef.current = request.then(
      () => undefined,
      () => undefined,
    );
    return request;
  };

  const stopTerminalOutputStream = () => {
    terminalOutputStreamRef.current?.();
    terminalOutputStreamRef.current = null;
  };

  const sendTerminalInput = async (data: string) => {
    const activeSessionId = activeSessionIdRef.current;
    if (!activeSessionId || !data) {
      return;
    }
    const terminalData = isCtrlActive
      ? controlModifiedTerminalInput(data)
      : normalizeTerminalInput(data);
    if (isCtrlActive) {
      setIsCtrlActive(false);
    }
    await enqueueTerminalRequest(() =>
      writeWorkspaceTerminalInput(activeSessionId, terminalData),
    ).catch((error) => {
      handleTerminalApiError(error);
    });
  };

  const handleTerminalTextChange = (nextValue: string) => {
    const previousValue = terminalNativeInputValueRef.current;
    const inputDelta = terminalInputDelta(previousValue, nextValue);
    terminalNativeInputValueRef.current = nextValue;
    setTerminalInputValue(nextValue);
    if (inputDelta) {
      void sendTerminalInput(inputDelta);
    }
    scheduleTerminalInputClear();
  };

  const clearTerminalNativeInput = () => {
    terminalNativeInputValueRef.current = "";
    setTerminalInputValue("");
    terminalInputRef.current?.setNativeProps({ text: "" });
  };

  const scheduleTerminalInputClear = () => {
    if (terminalInputClearTimerRef.current) {
      clearTimeout(terminalInputClearTimerRef.current);
    }
    terminalInputClearTimerRef.current = setTimeout(() => {
      terminalInputClearTimerRef.current = null;
      clearTerminalNativeInput();
    }, terminalNativeInputClearDelayMs);
  };

  const handlePaste = async () => {
    const text = await Clipboard.getStringAsync();
    if (text) {
      await sendTerminalInput(text);
    }
    focusTerminalKeyboard();
  };

  const setFontSize = (nextFontSize: number) => {
    const clampedFontSize = Math.min(
      maximumTerminalFontSize,
      Math.max(minimumTerminalFontSize, nextFontSize),
    );
    setTerminalFontSize(clampedFontSize);
    postTerminalState({
      fontSize: clampedFontSize,
      reconnectRequestId,
      terminalId,
      workspacePath,
    });
  };

  const requestTerminalReconnect = () => {
    const nextReconnectRequestId = reconnectRequestId + 1;
    setReconnectRequestId(nextReconnectRequestId);
    setTerminalError(null);
    setTerminalSessionStatus("reconnecting");
    setTerminalSessionMessage("Reconnecting to the existing terminal session");
    postTerminalState({
      fontSize: terminalFontSize,
      reconnectRequestId: nextReconnectRequestId,
      terminalId,
      workspacePath,
    });
    focusTerminalKeyboard();
  };

  useEffect(() => {
    return registerWorkspaceSshTerminalBridgeHandlers(terminalId, {
      async closeSession(sessionId) {
        stopTerminalOutputStream();
        await enqueueTerminalRequest(() => closeWorkspaceTerminalSession(sessionId)).catch(
          () => {},
        );
        if (activeSessionIdRef.current === sessionId) {
          activeSessionIdRef.current = null;
          activeSessionWorkspacePathRef.current = null;
        }
      },
      reportError(message) {
        setIsTerminalReady(true);
        setTerminalError(message);
      },
      reportReady() {
        setIsTerminalReady(true);
        setTerminalError(null);
        postTerminalState({
          fontSize: terminalFontSize,
          reconnectRequestId,
          terminalId,
          workspacePath,
        });
      },
      reportSessionStatus(status, message, sessionId) {
        setTerminalSessionStatus(status);
        setTerminalSessionMessage(message ?? null);
        if (sessionId && status === "connected") {
          activeSessionIdRef.current = sessionId;
        }
        if (sessionId && status === "closed" && activeSessionIdRef.current === sessionId) {
          activeSessionIdRef.current = null;
          activeSessionWorkspacePathRef.current = null;
        }
      },
      async resizeSession(sessionId, cols, rows) {
        await enqueueTerminalRequest(() =>
          resizeWorkspaceTerminalSession(sessionId, { cols, rows }),
        ).catch((error) => {
          handleTerminalApiError(error);
        });
      },
      async startOutputStream(sessionId, since) {
        stopTerminalOutputStream();
        terminalOutputStreamRef.current = streamWorkspaceTerminalOutput(sessionId, since, {
          onError(error) {
            if (isTerminalSessionMissing(error) && activeSessionIdRef.current === sessionId) {
              activeSessionIdRef.current = null;
              activeSessionWorkspacePathRef.current = null;
            }
            handleTerminalApiError(error);
          },
          onOutput(response) {
            postWorkspaceSshTerminalOutput({
              response,
              sessionId,
              terminalId,
            });
            if (response.exitedAt && activeSessionIdRef.current === sessionId) {
              activeSessionIdRef.current = null;
              activeSessionWorkspacePathRef.current = null;
              stopTerminalOutputStream();
            }
          },
        });
      },
      async startSession(cols, rows) {
        const activeSessionId = activeSessionIdRef.current;
        if (activeSessionId) {
          try {
            await enqueueTerminalRequest(() =>
              resizeWorkspaceTerminalSession(activeSessionId, { cols, rows }),
            );
            return {
              sessionId: activeSessionId,
              workspacePath: activeSessionWorkspacePathRef.current ?? workspacePath ?? "",
            };
          } catch (error) {
            if (!isTerminalSessionMissing(error)) {
              throw error;
            }
            activeSessionIdRef.current = null;
            activeSessionWorkspacePathRef.current = null;
          }
        }
        const response = await enqueueTerminalRequest(() =>
          createWorkspaceTerminalSession({
            cols,
            rows,
            workspacePath,
          }),
        );
        activeSessionIdRef.current = response.sessionId;
        activeSessionWorkspacePathRef.current = response.workspacePath;
        return {
          sessionId: response.sessionId,
          workspacePath: response.workspacePath,
        };
      },
      async stopOutputStream(sessionId) {
        if (activeSessionIdRef.current === sessionId) {
          stopTerminalOutputStream();
        }
      },
      async writeSession(sessionId, data) {
        await enqueueTerminalRequest(() => writeWorkspaceTerminalInput(sessionId, data)).catch(
          (error) => {
            handleTerminalApiError(error);
          },
        );
      },
    });
  }, [
    closeWorkspaceTerminalSession,
    createWorkspaceTerminalSession,
    postTerminalState,
    reconnectRequestId,
    resizeWorkspaceTerminalSession,
    streamWorkspaceTerminalOutput,
    terminalFontSize,
    terminalId,
    workspacePath,
    writeWorkspaceTerminalInput,
  ]);

  useEffect(() => {
    postTerminalState({
      fontSize: terminalFontSize,
      reconnectRequestId,
      terminalId,
      workspacePath,
    });
  }, [
    postTerminalState,
    reconnectRequestId,
    terminalFontSize,
    terminalId,
    workspacePath,
    webTheme,
  ]);

  useEffect(
    () => () => {
      if (terminalInputClearTimerRef.current) {
        clearTimeout(terminalInputClearTimerRef.current);
        terminalInputClearTimerRef.current = null;
      }
      stopTerminalOutputStream();
      const activeSessionId = activeSessionIdRef.current;
      if (activeSessionId) {
        void enqueueTerminalRequest(() => closeWorkspaceTerminalSession(activeSessionId)).catch(
          () => undefined,
        );
        activeSessionIdRef.current = null;
        activeSessionWorkspacePathRef.current = null;
      }
    },
    [closeWorkspaceTerminalSession],
  );

  return (
    <KeyboardAvoidingView
      automaticOffset
      behavior="height"
      enabled={keyboardAvoidingEnabled}
      keyboardVerticalOffset={0}
      style={styles.keyboardAwareContent}
    >
      <View style={styles.terminalFrame}>
        <View
          style={styles.terminalViewport}
          onTouchEnd={handleTerminalTouchEnd}
          onTouchMove={handleTerminalTouchMove}
          onTouchStart={handleTerminalTouchStart}
        >
          <WorkspaceSshTerminalBridgeWebView
            allowFileAccess={false}
            allowUniversalAccessFromFileURLs={false}
            domStorageEnabled={false}
            injectedJavaScriptBeforeContentLoaded={initialScript.current}
            javaScriptEnabled
            keyboardDisplayRequiresUserAction={false}
            nestedScrollEnabled
            onLoadStart={() => {
              setTerminalError(null);
              setIsTerminalReady(false);
              setTerminalSessionStatus("connecting");
              setTerminalSessionMessage(null);
            }}
            originWhitelist={["*"]}
            scrollEnabled={false}
            source={terminalSource}
            style={styles.terminalWebView}
          />
          <TextInput
            ref={terminalInputRef}
            autoCapitalize="none"
            autoCorrect={false}
            caretHidden
            keyboardType="ascii-capable"
            multiline
            onChangeText={handleTerminalTextChange}
            onKeyPress={(event) => {
              if (
                event.nativeEvent.key === "Backspace" &&
                terminalNativeInputValueRef.current.length === 0
              ) {
                void sendTerminalInput("\x7f");
              }
            }}
            showSoftInputOnFocus
            spellCheck={false}
            style={styles.terminalNativeInput}
            value={terminalInputValue}
          />
          {!isTerminalReady && !terminalError ? (
            <View style={styles.terminalOverlay}>
              <ActivityIndicator color={theme.accent} size="small" />
              <ThemedText type="small" style={styles.terminalOverlayText}>
                Loading terminal
              </ThemedText>
            </View>
          ) : null}
          {terminalError ? (
            <View style={styles.terminalError}>
              <View style={styles.terminalErrorContent}>
                <Icon name="warning" size={15} tintColor={theme.dangerStrong} />
                <ThemedText type="small" style={styles.terminalErrorText}>
                  {terminalError}
                </ThemedText>
              </View>
              <Pressable
                accessibilityLabel="Reconnect terminal session"
                accessibilityRole="button"
                onPress={requestTerminalReconnect}
                style={styles.terminalErrorButton}
              >
                <ThemedText type="small" style={styles.terminalErrorButtonText}>
                  Reconnect
                </ThemedText>
              </Pressable>
            </View>
          ) : null}
        </View>
        {terminalSessionStatus !== "connected" && !terminalError ? (
          <View style={styles.terminalStatusBanner}>
            {terminalSessionStatus === "connecting" || terminalSessionStatus === "reconnecting" ? (
              <ActivityIndicator color={theme.accent} size="small" />
            ) : (
              <Icon name="terminal" size={14} tintColor={theme.accent} />
            )}
            <ThemedText type="small" style={styles.terminalStatusText}>
              {terminalSessionStatus === "closed"
                ? "Terminal session closed"
                : terminalSessionStatus === "reconnecting"
                  ? "Reconnecting terminal"
                  : "Connecting terminal"}
            </ThemedText>
            {terminalSessionMessage ? (
              <ThemedText type="small" style={styles.terminalStatusDetail} numberOfLines={1}>
                {terminalSessionMessage}
              </ThemedText>
            ) : null}
          </View>
        ) : null}
        <View style={styles.terminalShortcutBar}>
          <View style={styles.terminalShortcutRow}>
            <TerminalShortcutButton
              accessibilityLabel="Show keyboard"
              label="⌨"
              onPress={focusTerminalKeyboard}
            />
            <TerminalShortcutButton
              accessibilityLabel="Reconnect terminal session"
              active={terminalSessionStatus === "reconnecting"}
              label="↻"
              onPress={requestTerminalReconnect}
            />
            <TerminalShortcutButton
              accessibilityLabel="Escape"
              label="Esc"
              onPress={() => void sendTerminalInput("\x1b")}
            />
            <TerminalShortcutButton
              accessibilityLabel="Tab"
              label="Tab"
              onPress={() => void sendTerminalInput("\t")}
            />
            <TerminalShortcutButton
              accessibilityLabel="Control modifier"
              active={isCtrlActive}
              label="Ctrl"
              onPress={() => {
                setIsCtrlActive((value) => !value);
                focusTerminalKeyboard();
              }}
            />
            <TerminalShortcutButton
              accessibilityLabel="Paste"
              label="Paste"
              onPress={() => void handlePaste()}
            />
            <TerminalShortcutButton
              accessibilityLabel="More terminal shortcuts"
              active={isShortcutsExpanded}
              label="⋯"
              onPress={() => setIsShortcutsExpanded((value) => !value)}
            />
          </View>
          {isShortcutsExpanded ? (
            <View style={styles.terminalExpandedShortcutRows}>
              <View style={styles.terminalShortcutRow}>
                <TerminalShortcutButton
                  accessibilityLabel="Left arrow"
                  label="←"
                  onPress={() => void sendTerminalInput(terminalArrowSequences.left)}
                />
                <TerminalShortcutButton
                  accessibilityLabel="Up arrow"
                  label="↑"
                  onPress={() => void sendTerminalInput(terminalArrowSequences.up)}
                />
                <TerminalShortcutButton
                  accessibilityLabel="Down arrow"
                  label="↓"
                  onPress={() => void sendTerminalInput(terminalArrowSequences.down)}
                />
                <TerminalShortcutButton
                  accessibilityLabel="Right arrow"
                  label="→"
                  onPress={() => void sendTerminalInput(terminalArrowSequences.right)}
                />
              </View>
              <View style={styles.terminalShortcutRow}>
                <TerminalShortcutButton
                  label="Ctrl-C"
                  onPress={() => void sendTerminalInput("\x03")}
                />
                <TerminalShortcutButton
                  label="Ctrl-D"
                  onPress={() => void sendTerminalInput("\x04")}
                />
                <TerminalShortcutButton
                  label="Ctrl-Z"
                  onPress={() => void sendTerminalInput("\x1a")}
                />
                <TerminalShortcutButton
                  label="Clear"
                  onPress={() => void sendTerminalInput("clear\r")}
                />
              </View>
              <View style={styles.terminalShortcutRow}>
                <TerminalShortcutButton label="~" onPress={() => void sendTerminalInput("~")} />
                <TerminalShortcutButton label="|" onPress={() => void sendTerminalInput("|")} />
                <TerminalShortcutButton label="/" onPress={() => void sendTerminalInput("/")} />
                <TerminalShortcutButton label="-" onPress={() => void sendTerminalInput("-")} />
              </View>
              <View style={styles.terminalShortcutRow}>
                <TerminalShortcutButton
                  label="A-"
                  onPress={() => setFontSize(terminalFontSize - 1)}
                />
                <TerminalShortcutButton
                  label="A+"
                  onPress={() => setFontSize(terminalFontSize + 1)}
                />
                <TerminalShortcutButton
                  label="Reset"
                  onPress={() => void sendTerminalInput("reset\r")}
                />
              </View>
            </View>
          ) : null}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function terminalErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isTerminalSessionMissing(error: unknown) {
  return (
    terminalApiStatus(error) === 404 ||
    terminalErrorMessage(error).toLowerCase().includes("terminal session was not found")
  );
}

function terminalApiStatus(error: unknown) {
  return typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
    ? error.status
    : undefined;
}

function TerminalShortcutButton({
  accessibilityLabel,
  active,
  label,
  onPress,
}: {
  accessibilityLabel?: string;
  active?: boolean;
  label: string;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      hitSlop={4}
      onPress={onPress}
      style={[styles.terminalShortcutButton, active ? styles.terminalShortcutButtonActive : null]}
    >
      <ThemedText type="small" style={styles.terminalShortcutButtonText}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function workspaceSshTerminalIdScript(terminalId: string, theme: WorkspaceWebTheme) {
  return `window.__workspaceSshTerminalId = ${JSON.stringify(terminalId)}; window.__workspaceSshTerminalTheme = ${JSON.stringify(theme)}; true;`;
}

function normalizeTerminalInput(data: string) {
  return data.replace(/\n/g, "\r");
}

function terminalInputDelta(previousValue: string, nextValue: string) {
  if (nextValue === previousValue) {
    return "";
  }
  if (!previousValue) {
    return nextValue;
  }
  if (nextValue.startsWith(previousValue)) {
    return nextValue.slice(previousValue.length);
  }
  if (previousValue.startsWith(nextValue)) {
    return "\x7f".repeat(previousValue.length - nextValue.length);
  }
  return nextValue;
}

function controlModifiedTerminalInput(data: string) {
  return data
    .split("")
    .map((char) => controlCharacter(char))
    .join("");
}

function controlCharacter(char: string) {
  const code = char.toLowerCase().charCodeAt(0);
  if (code >= 97 && code <= 122) {
    return String.fromCharCode(code - 96);
  }
  switch (char) {
    case " ":
      return "\x00";
    case "[":
      return "\x1b";
    case "\\":
      return "\x1c";
    case "]":
      return "\x1d";
    case "^":
      return "\x1e";
    case "_":
      return "\x1f";
    default:
      return normalizeTerminalInput(char);
  }
}

const styles = StyleSheet.create((theme) => ({
  keyboardAwareContent: {
    flex: 1,
    minHeight: 0,
  },
  terminalFrame: {
    backgroundColor: theme.terminalBackground,
    borderColor: theme.borderSubtle,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    marginBottom: Spacing.three,
    marginHorizontal: Spacing.three,
    overflow: "hidden",
  },
  terminalViewport: {
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
  },
  terminalWebView: {
    backgroundColor: theme.terminalBackground,
    flex: 1,
  },
  terminalNativeInput: {
    backgroundColor: "transparent",
    bottom: 0,
    color: "transparent",
    height: 1,
    left: 0,
    opacity: 0.01,
    padding: 0,
    position: "absolute",
    width: 1,
  },
  terminalOverlay: {
    alignItems: "center",
    backgroundColor: theme.terminalBackground,
    bottom: 0,
    gap: Spacing.two,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  terminalOverlayText: {
    color: theme.accent,
  },
  terminalError: {
    alignItems: "stretch",
    backgroundColor: theme.backgroundOverlayStrong,
    bottom: 0,
    gap: Spacing.two,
    justifyContent: "center",
    left: 0,
    padding: Spacing.two,
    position: "absolute",
    right: 0,
    top: 0,
  },
  terminalErrorContent: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.one,
  },
  terminalErrorText: {
    color: theme.dangerStrong,
    flex: 1,
  },
  terminalErrorButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: theme.backgroundElement,
    borderColor: theme.dangerBorder,
    borderRadius: 6,
    borderWidth: 1,
    minHeight: 34,
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  terminalErrorButtonText: {
    color: theme.danger,
    fontSize: 13,
    fontWeight: "700",
  },
  terminalStatusBanner: {
    alignItems: "center",
    backgroundColor: theme.backgroundElement,
    borderTopColor: theme.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: Spacing.one,
    minHeight: 34,
    paddingHorizontal: 10,
  },
  terminalStatusText: {
    color: theme.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  terminalStatusDetail: {
    color: theme.accent,
    flex: 1,
    fontSize: 12,
  },
  terminalShortcutBar: {
    backgroundColor: theme.backgroundElement,
    borderTopColor: theme.borderSubtle,
    borderTopWidth: 1,
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  terminalExpandedShortcutRows: {
    gap: 7,
  },
  terminalShortcutRow: {
    flexDirection: "row",
    gap: 7,
  },
  terminalShortcutButton: {
    alignItems: "center",
    backgroundColor: theme.backgroundElement,
    borderColor: theme.borderSubtle,
    borderRadius: 6,
    borderWidth: 1,
    flex: 1,
    height: 40,
    justifyContent: "center",
    minWidth: 0,
    paddingHorizontal: 4,
  },
  terminalShortcutButtonActive: {
    backgroundColor: theme.backgroundElement,
    borderColor: theme.borderEmphasis,
  },
  terminalShortcutButtonText: {
    color: theme.textSecondary,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 17,
    textAlign: "center",
  },
}));
