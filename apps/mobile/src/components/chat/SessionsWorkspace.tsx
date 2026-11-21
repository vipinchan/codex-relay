import React, { useMemo } from "react";
import { View, useWindowDimensions, StyleSheet as RNStyleSheet } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { useSelector } from "@legendapp/state/react";
import { chatStore$, setActiveThread, requestThreadStreamReconnect } from "@/state/chat-store";
import { useTheme } from "@/hooks/use-theme";
import { hapticSelection } from "@/lib/haptics";
import { ConversationsHome } from "./ConversationsHome";
import { ChatScreen } from "./ChatScreen";
import { NewChatWorkspaceScreen } from "./NewChatWorkspaceScreen";
import { useIpadSplitLayout } from "./ipad-split-layout";
import { clampSidebarWidth } from "./workspace-layout";

const SIDEBAR_RESIZE_HANDLE_WIDTH = 10;

export function SessionsWorkspace() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const { isSidebarVisible, sidebarWidth, beginSidebarResize, resizeSidebar } =
    useIpadSplitLayout();

  const activeThreadId = useSelector(() => chatStore$.activeThreadId.get());
  const hasPairedSession = useSelector(() => chatStore$.hasPairedSession.get());

  const clampedWidth = useMemo(() => clampSidebarWidth(sidebarWidth, width), [sidebarWidth, width]);

  const sidebarResizeGesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .onBegin(() => {
          beginSidebarResize();
          hapticSelection();
        })
        .onUpdate((event) => {
          resizeSidebar(event.translationX);
        }),
    [beginSidebarResize, resizeSidebar],
  );

  return (
    <View style={styles.container}>
      {isSidebarVisible ? (
        <View style={[styles.sidebarPane, { width: clampedWidth }]}>
          <ConversationsHome
            variant="sidebar"
            selectedThreadId={activeThreadId}
            onSelectThread={(thread) => {
              setActiveThread(thread.id);
              requestThreadStreamReconnect(thread.id);
            }}
            onCreateNewChat={() => {
              setActiveThread(undefined);
            }}
          />
        </View>
      ) : null}

      {isSidebarVisible ? (
        <GestureDetector gesture={sidebarResizeGesture}>
          <Animated.View
            accessibilityLabel="Resize thread sidebar"
            style={[
              styles.resizeHandle,
              { cursor: "col-resize" } as RNStyleSheet.NamedStyles<unknown>,
            ]}
          >
            <View style={[styles.resizeGrip, { backgroundColor: theme.borderSubtle }]} />
          </Animated.View>
        </GestureDetector>
      ) : null}

      <View style={styles.mainPane}>
        {!hasPairedSession ? (
          <ChatScreen embedded />
        ) : activeThreadId ? (
          <ChatScreen key={activeThreadId} embedded />
        ) : (
          <NewChatWorkspaceScreen embedded />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: theme.background,
  },
  sidebarPane: {
    height: "100%",
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: theme.borderSubtle,
    backgroundColor: theme.background,
    overflow: "hidden",
  },
  resizeHandle: {
    width: SIDEBAR_RESIZE_HANDLE_WIDTH,
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
    backgroundColor: "transparent",
  },
  resizeGrip: {
    width: 2,
    height: 36,
    borderRadius: 1,
  },
  mainPane: {
    flex: 1,
    height: "100%",
    minWidth: 0,
    backgroundColor: theme.background,
  },
}));
