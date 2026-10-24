import { ActivityIndicator, Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { Icon } from "@/components/ui/icon";
import { useTheme } from "@/hooks/use-theme";

type MessageJumpNavigationProps = {
  visible: boolean;
  canJumpPrevious: boolean;
  isLoadingPrevious?: boolean;
  onJumpPrevious: () => void;
  onJumpLatest: () => void;
};

const zh = (Intl.DateTimeFormat().resolvedOptions().locale || "en").toLowerCase().startsWith("zh");

export function MessageJumpNavigation({
  visible,
  canJumpPrevious,
  isLoadingPrevious = false,
  onJumpPrevious,
  onJumpLatest,
}: MessageJumpNavigationProps) {
  const theme = useTheme();
  if (!visible) return null;

  return (
    <View pointerEvents="box-none" style={styles.position}>
      <View style={[styles.surface, { backgroundColor: theme.backgroundElement }]}>
        {canJumpPrevious ? (
          <>
            <Pressable
              accessibilityLabel={zh ? "上一条提问" : "Jump to previous message you sent"}
              accessibilityRole="button"
              accessibilityState={{ busy: isLoadingPrevious, disabled: isLoadingPrevious }}
              disabled={isLoadingPrevious}
              hitSlop={4}
              onPress={onJumpPrevious}
              style={({ pressed }) => [
                styles.button,
                pressed && { backgroundColor: theme.backgroundSelected },
              ]}
            >
              {isLoadingPrevious ? (
                <ActivityIndicator size="small" color={theme.textSecondaryStrong} />
              ) : (
                <Icon name="up" size={19} tintColor={theme.text} strokeWidth={2} />
              )}
            </Pressable>
            <View pointerEvents="none" style={styles.divider} />
          </>
        ) : null}
        <Pressable
          accessibilityLabel={zh ? "回到最新消息" : "Jump to latest message"}
          accessibilityRole="button"
          hitSlop={4}
          onPress={onJumpLatest}
          style={({ pressed }) => [
            styles.button,
            pressed && { backgroundColor: theme.backgroundSelected },
          ]}
        >
          <Icon name="down" size={19} tintColor={theme.text} strokeWidth={2} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  position: {
    bottom: 0,
    justifyContent: "center",
    position: "absolute",
    right: 12,
    top: 0,
    width: 42,
  },
  surface: {
    alignItems: "center",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 21,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  button: {
    borderRadius: 20,
    alignItems: "center",
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  divider: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 10,
  },
});
