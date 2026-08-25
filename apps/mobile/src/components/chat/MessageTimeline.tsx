import type { ChatMessage } from "codex-relay/api-schema";
import {
  type LegendListRef,
  type LegendListRenderItemProps,
  type MaintainScrollAtEndOptions,
  type MaintainVisibleContentPositionConfig,
} from "@legendapp/list/react-native";
import { KeyboardAwareLegendList } from "@legendapp/list/keyboard";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { Icon } from "@/components/ui/icon";
import { Colors, Spacing } from "@/constants/theme";

import { MessageBubble } from "./MessageBubble";
import { ActivityGroupCard } from "./ActivityGroupCard";
import { messageItemType } from "./timeline-message-items";
import {
  buildTimelineRows,
  INITIAL_TIMELINE_WINDOW_SIZE,
  nextTimelineWindowSize,
  TIMELINE_WINDOW_INCREMENT,
  timelineFollowTrigger,
  timelineLatestRowIndex,
  type TimelineRow,
  visibleMessageWindow,
} from "./timeline-rows";
import type { WorkspaceMarkdownPreviewTarget } from "./workspace-preview/markdown-target";
import { RunningFooter } from "./RunningFooter";

export { implementablePlanId } from "./plan-progress";

const MESSAGE_ESTIMATED_ITEM_SIZE = 48;
const MAINTAIN_SCROLL_AT_END: MaintainScrollAtEndOptions = {
  animated: false,
  on: {
    dataChange: true,
    itemLayout: true,
    layout: true,
  },
};
const MAINTAIN_VISIBLE_CONTENT_POSITION: MaintainVisibleContentPositionConfig<TimelineRow> = {
  data: true,
  size: true,
};
const MAINTAIN_SCROLL_AT_END_THRESHOLD = 0.1;
const TIMELINE_LOADING_ENTER = FadeIn.duration(140).easing(Easing.out(Easing.cubic));
const TIMELINE_LOADING_EXIT = FadeOut.duration(120).easing(Easing.out(Easing.cubic));
const TIMELINE_CONTENT_SETTLE_OFFSET = 10;

export function MessageTimeline({
  bottomAccessoryHeight = 0,
  isLoading,
  isRunning,
  keyboardLayoutFrozen = false,
  messages,
  onKeyboardDismissRequest,
  onMessageCopied,
  onMessageRewind,
  onOpenMarkdownAttachment,
  threadId,
}: {
  bottomAccessoryHeight?: number;
  isLoading?: boolean;
  isRunning: boolean;
  keyboardLayoutFrozen?: boolean;
  messages: ChatMessage[];
  onKeyboardDismissRequest?: () => void;
  onMessageCopied?: () => void;
  onMessageRewind?: (message: ChatMessage) => void;
  onOpenMarkdownAttachment?: (target: WorkspaceMarkdownPreviewTarget) => void;
  threadId?: string;
}) {
  const listRef = useRef<LegendListRef | null>(null);
  const isAtLatestRef = useRef(true);
  const isJumpingToLatestRef = useRef(false);
  const previousRowsRef = useRef<readonly TimelineRow[]>([]);
  const { bottom } = useSafeAreaInsets();
  const timelineKey = threadId ?? "no-thread";
  const [visibleMessageCount, setVisibleMessageCount] = useState(INITIAL_TIMELINE_WINDOW_SIZE);
  const messageWindow = useMemo(
    () => visibleMessageWindow(messages, visibleMessageCount),
    [messages, visibleMessageCount],
  );
  const rows = useMemo(
    () => buildTimelineRows(messageWindow.messages, previousRowsRef.current),
    [messageWindow.messages],
  );
  const [settledTimelineKey, setSettledTimelineKey] = useState<string | undefined>(undefined);
  const [isAtLatest, setAtLatest] = useState(true);
  const extraContentPadding = useSharedValue(0);
  const contentRevealProgress = useSharedValue(0);
  const hasRows = rows.length > 0;
  const isTimelineReady = !hasRows || settledTimelineKey === timelineKey;
  const showLoadingConversation = isLoading || (hasRows && !isTimelineReady);
  const followTrigger = timelineFollowTrigger(messages, isRunning);
  const timelineContentStyle = useAnimatedStyle(() => ({
    opacity: contentRevealProgress.value,
    transform: [{ translateY: TIMELINE_CONTENT_SETTLE_OFFSET * (1 - contentRevealProgress.value) }],
  }));

  useEffect(() => {
    extraContentPadding.value = withTiming(Math.max(0, bottomAccessoryHeight), {
      duration: 140,
      easing: Easing.out(Easing.cubic),
    });
  }, [bottomAccessoryHeight, extraContentPadding]);

  useEffect(() => {
    previousRowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    setSettledTimelineKey(undefined);
    setVisibleMessageCount(INITIAL_TIMELINE_WINDOW_SIZE);
    isAtLatestRef.current = true;
    setAtLatest(true);
  }, [timelineKey]);

  useEffect(() => {
    if (!isTimelineReady || !isAtLatestRef.current) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: false });
    });
    const settleTimer = isRunning
      ? undefined
      : setTimeout(() => {
          if (isAtLatestRef.current) {
            listRef.current?.scrollToEnd({ animated: false });
          }
        }, 240);
    const lateSettleTimer = isRunning
      ? undefined
      : setTimeout(() => {
          if (isAtLatestRef.current) {
            listRef.current?.scrollToEnd({ animated: false });
          }
        }, 900);
    return () => {
      cancelAnimationFrame(frame);
      if (settleTimer !== undefined) {
        clearTimeout(settleTimer);
      }
      if (lateSettleTimer !== undefined) {
        clearTimeout(lateSettleTimer);
      }
    };
  }, [followTrigger, isRunning, isTimelineReady]);

  useEffect(() => {
    if (isLoading || !hasRows) {
      return;
    }
    let didCancel = false;
    let settleFrame: number | undefined;
    const layoutFrame = requestAnimationFrame(() => {
      settleFrame = requestAnimationFrame(() => {
        if (!didCancel) {
          setSettledTimelineKey(timelineKey);
        }
      });
    });
    return () => {
      didCancel = true;
      cancelAnimationFrame(layoutFrame);
      if (settleFrame !== undefined) {
        cancelAnimationFrame(settleFrame);
      }
    };
  }, [hasRows, isLoading, timelineKey]);

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
  const handleTimelineLoad = useCallback(() => {
    requestAnimationFrame(() => {
      setSettledTimelineKey(timelineKey);
    });
  }, [timelineKey]);
  const handleScroll = useCallback(() => {
    if (isJumpingToLatestRef.current) {
      return;
    }
    const nextIsAtLatest = listRef.current?.getState().isAtEnd;
    if (nextIsAtLatest === undefined) {
      return;
    }
    if (nextIsAtLatest === isAtLatestRef.current) {
      return;
    }
    isAtLatestRef.current = nextIsAtLatest;
    setAtLatest(nextIsAtLatest);
  }, []);
  const jumpToLatest = useCallback(() => {
    const list = listRef.current;
    const latestRowIndex = timelineLatestRowIndex(rows.length);
    if (!list || latestRowIndex === undefined) {
      return;
    }
    isJumpingToLatestRef.current = true;
    isAtLatestRef.current = true;
    setAtLatest(true);
    void (async () => {
      try {
        await list.scrollToIndex({ animated: true, index: latestRowIndex, viewPosition: 1 });
      } catch {
        // LegendList can reject an estimated long-range jump before its measurements converge.
      }
      try {
        await list.scrollToEnd({ animated: false });
      } catch {
        // Keep the button available if the final measured scroll cannot be completed.
      }
      requestAnimationFrame(() => {
        const nextIsAtLatest = list.getState().isAtEnd;
        isJumpingToLatestRef.current = false;
        isAtLatestRef.current = nextIsAtLatest;
        setAtLatest(nextIsAtLatest);
      });
    })();
  }, [rows.length]);
  const loadEarlierMessages = useCallback(() => {
    setVisibleMessageCount((current) => nextTimelineWindowSize(current, messages.length));
  }, [messages.length]);

  return (
    <View onTouchStart={onKeyboardDismissRequest} style={styles.transitionHost}>
      {!isLoading ? (
        rows.length === 0 && !isRunning ? (
          <Animated.View style={[styles.transitionScene, timelineContentStyle]}>
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
          </Animated.View>
        ) : (
          <Animated.View style={[styles.transitionScene, timelineContentStyle]}>
            <KeyboardAwareLegendList
              key={timelineKey}
              ref={listRef}
              alignItemsAtEnd
              automaticallyAdjustContentInsets={false}
              contentInsetAdjustmentBehavior="never"
              contentInsetEndAdjustment={extraContentPadding}
              data={rows}
              estimatedItemSize={MESSAGE_ESTIMATED_ITEM_SIZE}
              freeze={keyboardLayoutFrozen}
              getItemType={timelineRowItemType}
              initialScrollAtEnd
              keyExtractor={timelineRowKeyExtractor}
              renderItem={renderRow}
              contentContainerStyle={styles.content}
              keyboardDismissMode="interactive"
              keyboardLiftBehavior="whenAtEnd"
              keyboardOffset={bottom - 24}
              keyboardShouldPersistTaps="handled"
              maintainScrollAtEnd={isAtLatest ? MAINTAIN_SCROLL_AT_END : false}
              maintainScrollAtEndThreshold={MAINTAIN_SCROLL_AT_END_THRESHOLD}
              maintainVisibleContentPosition={MAINTAIN_VISIBLE_CONTENT_POSITION}
              onLoad={handleTimelineLoad}
              onScroll={handleScroll}
              recycleItems={false}
              scrollEventThrottle={48}
              showsVerticalScrollIndicator={false}
              style={styles.list}
              ListFooterComponent={
                isRunning ? <RunningFooter /> : <View style={styles.listEndPad} />
              }
              ListHeaderComponent={
                messageWindow.hiddenCount > 0 ? (
                  <EarlierMessagesButton
                    hiddenCount={messageWindow.hiddenCount}
                    onPress={loadEarlierMessages}
                  />
                ) : null
              }
            />
            {!isAtLatest ? (
              <Pressable
                accessibilityLabel="Jump to latest message"
                accessibilityRole="button"
                onPress={jumpToLatest}
                style={({ pressed }) => [styles.jumpToLatest, pressed && styles.jumpPressed]}
              >
                <Icon name="expand" size={14} tintColor="#F5F5F7" strokeWidth={2.2} />
                <ThemedText type="smallBold" style={styles.jumpLabel}>
                  Latest
                </ThemedText>
              </Pressable>
            ) : null}
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

function EarlierMessagesButton({
  hiddenCount,
  onPress,
}: {
  hiddenCount: number;
  onPress: () => void;
}) {
  const nextCount = Math.min(TIMELINE_WINDOW_INCREMENT, hiddenCount);
  return (
    <Pressable
      accessibilityLabel={`Load ${nextCount} earlier messages`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.earlierMessages, pressed && styles.jumpPressed]}
    >
      <Icon name="expand" size={13} tintColor={Colors.dark.textSecondary} strokeWidth={2.1} />
      <ThemedText type="code" themeColor="textSecondary" style={styles.earlierMessagesLabel}>
        Show {nextCount} earlier · {hiddenCount} hidden
      </ThemedText>
    </Pressable>
  );
}

function timelineRowKeyExtractor(row: TimelineRow) {
  return row.key;
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
  earlierMessages: {
    alignItems: "center",
    alignSelf: "center",
    flexDirection: "row",
    gap: 6,
    marginBottom: Spacing.two,
    minHeight: 34,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  earlierMessagesLabel: {
    fontSize: 11,
    lineHeight: 16,
  },
  list: {
    flex: 1,
  },
  listEndPad: {
    height: Spacing.two,
  },
  jumpToLatest: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "rgba(42, 42, 44, 0.96)",
    borderColor: "rgba(255, 255, 255, 0.16)",
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    bottom: 12,
    flexDirection: "row",
    gap: 5,
    minHeight: 36,
    paddingHorizontal: 13,
    position: "absolute",
  },
  jumpLabel: {
    color: "#F5F5F7",
    fontSize: 12,
    lineHeight: 16,
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
