import {
  type LegendListRenderItemProps,
  type MaintainScrollAtEndOptions,
} from "@legendapp/list/react-native";
import { KeyboardAwareLegendList } from "@legendapp/list/keyboard";
import { useEffect, type ReactElement } from "react";
import { ActivityIndicator, Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { Easing, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";

import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/use-theme";

import { MessageJumpNavigation } from "./MessageJumpNavigation";
import { TIMELINE_WINDOW_INCREMENT } from "./timeline-rows";
import type { MessageListController } from "./use-message-list-controller";

const MAINTAIN_SCROLL_AT_END: MaintainScrollAtEndOptions = {
  animated: false,
  on: { dataChange: true, itemLayout: true, layout: true },
};
const MAINTAIN_VISIBLE_CONTENT_POSITION = { data: true, size: true };
const zh = (Intl.DateTimeFormat().resolvedOptions().locale || "en").toLowerCase().startsWith("zh");

export function MessageList<Row>({
  controller,
  renderItem,
  getItemType,
  contentContainerStyle,
  bottomAccessoryHeight = 0,
  keyboardLayoutFrozen = false,
  ListEmptyComponent,
  ListFooterComponent,
}: {
  controller: MessageListController<Row>;
  renderItem: (info: LegendListRenderItemProps<Row>) => ReactElement | null;
  getItemType?: (item: Row, index: number) => string;
  contentContainerStyle?: StyleProp<ViewStyle>;
  bottomAccessoryHeight?: number;
  keyboardLayoutFrozen?: boolean;
  ListEmptyComponent?: ReactElement;
  ListFooterComponent?: ReactElement;
}) {
  const { bottom } = useSafeAreaInsets();
  const theme = useTheme();
  const extraContentPadding = useSharedValue(0);
  useEffect(() => {
    extraContentPadding.value = withTiming(Math.max(0, bottomAccessoryHeight), {
      duration: 140,
      easing: Easing.out(Easing.cubic),
    });
  }, [bottomAccessoryHeight, extraContentPadding]);

  return (
    <View style={styles.host}>
      <KeyboardAwareLegendList
        key={controller.timelineKey}
        ref={controller.listRef}
        data={controller.rows}
        keyExtractor={controller.keyExtractor}
        renderItem={renderItem}
        getItemType={getItemType}
        estimatedItemSize={48}
        initialScrollAtEnd={controller.initialScrollAtEnd}
        alignItemsAtEnd
        automaticallyAdjustContentInsets={false}
        contentInsetAdjustmentBehavior="never"
        contentInsetEndAdjustment={extraContentPadding}
        contentContainerStyle={contentContainerStyle}
        freeze={keyboardLayoutFrozen}
        keyboardDismissMode="interactive"
        keyboardLiftBehavior="whenAtEnd"
        keyboardOffset={bottom - 24}
        keyboardShouldPersistTaps="handled"
        maintainScrollAtEnd={controller.isAtLatest ? MAINTAIN_SCROLL_AT_END : false}
        maintainScrollAtEndThreshold={0.1}
        maintainVisibleContentPosition={MAINTAIN_VISIBLE_CONTENT_POSITION}
        onFirstVisibleItemChanged={controller.onFirstVisibleItemChanged}
        onLoad={controller.onLoad}
        onScroll={controller.onScroll}
        onScrollBeginDrag={controller.onScrollBeginDrag}
        recycleItems={false}
        scrollEventThrottle={48}
        showsVerticalScrollIndicator={false}
        style={styles.host}
        ListEmptyComponent={ListEmptyComponent}
        ListFooterComponent={ListFooterComponent}
        ListHeaderComponent={
          controller.hasEarlier && controller.sourceStatus !== "looking" ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={zh ? "加载更早消息" : "Load earlier messages"}
              accessibilityState={{ busy: controller.isLoadingEarlier }}
              disabled={controller.isLoadingEarlier}
              onPress={() => void controller.loadEarlier()}
              style={({ pressed }) => [styles.earlier, pressed && styles.pressed]}
            >
              {controller.isLoadingEarlier ? (
                <ActivityIndicator size="small" color={theme.textSecondary} />
              ) : null}
              <Text style={[styles.earlierText, { color: theme.textSecondary }]}>
                {controller.earlierError
                  ? `${controller.earlierError} · ${zh ? "重试" : "Retry"}`
                  : controller.hiddenCount > 0
                    ? zh
                      ? `显示更早的 ${Math.min(TIMELINE_WINDOW_INCREMENT, controller.hiddenCount)} 条消息`
                      : `Show ${Math.min(TIMELINE_WINDOW_INCREMENT, controller.hiddenCount)} earlier · ${controller.hiddenCount} hidden`
                    : controller.isLoadingEarlier
                      ? zh
                        ? "加载中…"
                        : "Loading earlier messages…"
                      : zh
                        ? "加载更早消息"
                        : "Show earlier messages"}
              </Text>
            </Pressable>
          ) : null
        }
      />
      <MessageJumpNavigation
        visible={!controller.isAtLatest && controller.sourceStatus !== "looking"}
        canJumpPrevious={controller.canJumpPrevious}
        isLoadingPrevious={controller.isLoadingPrevious}
        onJumpPrevious={controller.jumpToPrevious}
        onJumpLatest={controller.jumpToLatest}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1 },
  earlier: {
    alignItems: "center",
    alignSelf: "center",
    flexDirection: "row",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  earlierText: { fontSize: 11, lineHeight: 16, flexShrink: 1 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
});
