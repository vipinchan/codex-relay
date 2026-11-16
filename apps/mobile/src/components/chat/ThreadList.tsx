import { LegendList, type LegendListRenderItemProps } from "@legendapp/list/react-native";
import type { ThreadSummary } from "codex-relay/api-schema";
import { memo, useCallback } from "react";
import { Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";

const THREAD_ITEM_WIDTH = 190;
const THREAD_ITEM_ESTIMATED_SIZE = THREAD_ITEM_WIDTH + Spacing.two;

export function ThreadList({
  activeThreadId,
  onSelectThread,
  threads,
}: {
  activeThreadId?: string;
  onSelectThread: (threadId: string) => void;
  threads: ThreadSummary[];
}) {
  const renderThread = useCallback(
    ({ item }: LegendListRenderItemProps<ThreadSummary>) => (
      <ThreadListItem
        activeThreadId={activeThreadId}
        onSelectThread={onSelectThread}
        thread={item}
      />
    ),
    [activeThreadId, onSelectThread],
  );

  return (
    <View style={styles.container}>
      <LegendList
        horizontal
        data={threads}
        keyExtractor={threadKeyExtractor}
        estimatedItemSize={THREAD_ITEM_ESTIMATED_SIZE}
        getFixedItemSize={() => THREAD_ITEM_ESTIMATED_SIZE}
        recycleItems={false}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
        renderItem={renderThread}
      />
    </View>
  );
}

const ThreadListItem = memo(function ThreadListItem({
  activeThreadId,
  onSelectThread,
  thread,
}: {
  activeThreadId?: string;
  onSelectThread: (threadId: string) => void;
  thread: ThreadSummary;
}) {
  const selected = thread.id === activeThreadId;
  const handlePress = useCallback(() => onSelectThread(thread.id), [onSelectThread, thread.id]);

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.item,
        selected && styles.itemSelected,
        pressed && styles.pressed,
      ]}
    >
      <ThemedText type="smallBold" numberOfLines={1}>
        {thread.title}
      </ThemedText>
      <ThemedText type="code" themeColor="textSecondary" numberOfLines={1}>
        {thread.state} · {thread.messageCount} messages
      </ThemedText>
    </Pressable>
  );
});

function threadKeyExtractor(thread: ThreadSummary) {
  return thread.id;
}

const styles = StyleSheet.create((theme) => ({
  container: {
    minHeight: 70,
  },
  content: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  item: {
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    width: THREAD_ITEM_WIDTH,
  },
  itemSelected: {
    backgroundColor: theme.accentMuted,
    borderColor: theme.accentBorder,
  },
  pressed: {
    opacity: 0.72,
  },
}));
