import type { ChatMessage } from "codex-relay/api-schema";
import { type LegendListRenderItemProps } from "@legendapp/list/react-native";
import { useCallback, useEffect } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { ThemedText } from "@/components/themed-text";
import { Icon } from "@/components/ui/icon";
import { Colors, Spacing } from "@/constants/theme";
import { getCodexRelayServerUrl } from "@/lib/codex-relay-api";

import { MessageBubble } from "./MessageBubble";
import { MessageList } from "./MessageList";
import { useMessageListController } from "./use-message-list-controller";
import { ActivityGroupCard } from "./ActivityGroupCard";
import { messageItemType } from "./timeline-message-items";
import { buildTimelineRows, timelineFollowTrigger, type TimelineRow } from "./timeline-rows";
import type { WorkspaceMarkdownPreviewTarget } from "./workspace-preview/markdown-target";
import { RunningFooter } from "./RunningFooter";

export { implementablePlanId } from "./plan-progress";

const TIMELINE_LOADING_ENTER = FadeIn.duration(140).easing(Easing.out(Easing.cubic));
const TIMELINE_LOADING_EXIT = FadeOut.duration(120).easing(Easing.out(Easing.cubic));
const TIMELINE_CONTENT_SETTLE_OFFSET = 10;

export function MessageTimeline({
  bottomAccessoryHeight = 0,
  hasEarlierMessages = false,
  isLoading,
  isLoadingEarlierMessages = false,
  isRunning,
  keyboardLayoutFrozen = false,
  loadError,
  messages,
  olderMessagesError,
  onKeyboardDismissRequest,
  onMessageCopied,
  onMessageRewind,
  onLoadEarlierMessages,
  onOpenMarkdownAttachment,
  onRetry,
  threadId,
}: {
  bottomAccessoryHeight?: number;
  hasEarlierMessages?: boolean;
  isLoading?: boolean;
  isLoadingEarlierMessages?: boolean;
  isRunning: boolean;
  keyboardLayoutFrozen?: boolean;
  loadError?: string;
  messages: ChatMessage[];
  olderMessagesError?: string;
  onKeyboardDismissRequest?: () => void;
  onMessageCopied?: () => void;
  onMessageRewind?: (message: ChatMessage) => void;
  onLoadEarlierMessages?: () => Promise<boolean>;
  onOpenMarkdownAttachment?: (target: WorkspaceMarkdownPreviewTarget) => void;
  onRetry?: () => void;
  threadId?: string;
}) {
  const controller = useMessageListController({
    timelineKey: `${getCodexRelayServerUrl()}:${threadId ?? "no-thread"}`,
    messages,
    buildRows: buildTimelineRows,
    keyExtractor: timelineRowKeyExtractor,
    isUserRow: timelineRowIsUser,
    isLoading,
    isLoadingEarlierMessages,
    hasEarlierMessages,
    onLoadEarlierMessages,
    olderMessagesError,
    isRunning,
    followTrigger: timelineFollowTrigger(messages, isRunning),
  });
  const { rows, timelineKey } = controller;
  const showLoadingConversation = isLoading || (rows.length > 0 && !controller.isReady);
  const contentRevealProgress = useSharedValue(0);
  const timelineContentStyle = useAnimatedStyle(() => ({
    opacity: contentRevealProgress.value,
    transform: [{ translateY: TIMELINE_CONTENT_SETTLE_OFFSET * (1 - contentRevealProgress.value) }],
  }));

  useEffect(() => {
    contentRevealProgress.value = withTiming(showLoadingConversation ? 0 : 1, {
      duration: showLoadingConversation ? 120 : 260,
      easing: Easing.out(Easing.cubic),
    });
  }, [contentRevealProgress, showLoadingConversation]);

  const renderRow = useCallback(
    ({ item }: LegendListRenderItemProps<TimelineRow>) =>
      item.type === "activity-group" ? (
        <ActivityGroupCard messages={item.messages} />
      ) : item.type === "assistant-block" ? (
        <MessageBubble
          assistantBlock={{
            copyContent: item.copyContent,
            isFirst: item.isFirst,
            isLast: item.isLast,
          }}
          message={item.message}
          onMessageCopied={onMessageCopied}
          onOpenMarkdownAttachment={onOpenMarkdownAttachment}
        />
      ) : (
        <MessageBubble
          message={item.message}
          onMessageCopied={onMessageCopied}
          onMessageRewind={onMessageRewind}
          onOpenMarkdownAttachment={onOpenMarkdownAttachment}
        />
      ),
    [onMessageCopied, onMessageRewind, onOpenMarkdownAttachment],
  );

  return (
    <View onTouchStart={onKeyboardDismissRequest} style={styles.transitionHost}>
      {!isLoading ? (
        rows.length === 0 && !isRunning && !hasEarlierMessages ? (
          <Animated.View style={[styles.transitionScene, timelineContentStyle]}>
            {loadError ? (
              <ConversationLoadError error={loadError} onRetry={onRetry} />
            ) : (
              <View style={styles.empty}>
                <View style={styles.emptyMark}>
                  <Icon name="model" size={20} tintColor="#F5F5F7" />
                </View>
                <ThemedText type="smallBold" style={styles.emptyTitle}>
                  What do you want to build?
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
                  Message Codex to start working in this workspace.
                </ThemedText>
              </View>
            )}
          </Animated.View>
        ) : (
          <Animated.View style={[styles.transitionScene, timelineContentStyle]}>
            {loadError ? (
              <ConversationLoadError compact error={loadError} onRetry={onRetry} />
            ) : null}
            <MessageList
              controller={controller}
              renderItem={renderRow}
              getItemType={timelineRowItemType}
              contentContainerStyle={styles.content}
              bottomAccessoryHeight={bottomAccessoryHeight}
              keyboardLayoutFrozen={keyboardLayoutFrozen}
              ListFooterComponent={
                isRunning ? <RunningFooter /> : <View style={styles.listEndPad} />
              }
            />
          </Animated.View>
        )
      ) : null}
      {showLoadingConversation ? (
        <Animated.View
          key={`loading-${timelineKey}`}
          entering={TIMELINE_LOADING_ENTER}
          exiting={TIMELINE_LOADING_EXIT}
          style={styles.transitionScene}
        >
          <LoadingConversation />
        </Animated.View>
      ) : null}
    </View>
  );
}

function LoadingConversation() {
  return (
    <View style={styles.empty} accessibilityRole="progressbar">
      <ActivityIndicator color={Colors.dark.textSecondary} />
      <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
        Loading conversation…
      </ThemedText>
    </View>
  );
}

function ConversationLoadError({
  compact = false,
  error,
  onRetry,
}: {
  compact?: boolean;
  error: string;
  onRetry?: () => void;
}) {
  return (
    <View style={compact ? styles.loadErrorBanner : styles.empty} accessibilityRole="alert">
      <ThemedText type="smallBold" style={styles.emptyTitle}>
        Could not load conversation
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
        {error}
      </ThemedText>
      {onRetry ? (
        <Pressable
          accessibilityLabel="Retry loading conversation"
          accessibilityRole="button"
          onPress={onRetry}
          style={({ pressed }) => [styles.retryButton, pressed && styles.jumpPressed]}
        >
          <ThemedText type="smallBold">Retry</ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

function timelineRowKeyExtractor(row: TimelineRow) {
  return row.key;
}

function timelineRowIsUser(row: TimelineRow) {
  return row.type === "message" && row.message.role === "user";
}

function timelineRowItemType(row: TimelineRow) {
  return row.type === "message" ? messageItemType(row.message) : row.type;
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 6,
    paddingHorizontal: 18,
    paddingTop: 6,
  },
  empty: {
    alignItems: "center",
    flex: 1,
    gap: 7,
    justifyContent: "center",
    padding: Spacing.four,
  },
  emptyMark: {
    alignItems: "center",
    backgroundColor: "#1C1C1E",
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    height: 44,
    justifyContent: "center",
    marginBottom: 3,
    width: 44,
  },
  emptyTitle: {
    fontSize: 15,
    lineHeight: 20,
    textAlign: "center",
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 18,
    maxWidth: 280,
    textAlign: "center",
  },
  listEndPad: {
    height: Spacing.two,
  },
  loadErrorBanner: {
    alignItems: "center",
    gap: Spacing.one,
    padding: Spacing.three,
  },
  retryButton: {
    borderColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  jumpPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.97 }],
  },
  transitionHost: {
    flex: 1,
    overflow: "hidden",
  },
  transitionScene: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
});
