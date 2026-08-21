import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { ThemedText } from "@/components/themed-text";
import { Icon, type AppIconName } from "@/components/ui/icon";
import { Colors } from "@/constants/theme";
import { hapticSelection } from "@/lib/haptics";

export type ChatShellAction = {
  readonly disabled?: boolean;
  readonly icon: AppIconName;
  readonly label: string;
  readonly onPress: () => void;
};

export function ChatShellHeader({
  leadingAction,
  subtitle,
  title,
  trailingActions,
}: {
  leadingAction: ChatShellAction;
  subtitle: string;
  title: string;
  trailingActions: readonly ChatShellAction[];
}) {
  return (
    <View pointerEvents="box-none" style={styles.header}>
      <HeaderButton action={leadingAction} />
      <View pointerEvents="none" style={styles.titleGroup}>
        <ThemedText type="smallBold" style={styles.title} numberOfLines={1}>
          {title}
        </ThemedText>
        <ThemedText
          type="small"
          themeColor="textSecondary"
          style={styles.subtitle}
          numberOfLines={1}
        >
          {subtitle}
        </ThemedText>
      </View>
      <View pointerEvents="box-none" style={styles.headerActions}>
        {trailingActions.map((action) => (
          <HeaderButton key={action.label} action={action} />
        ))}
      </View>
    </View>
  );
}

function HeaderButton({ action }: { action: ChatShellAction }) {
  const returnsToHistory = action.label === "Open threads";
  const icon = returnsToHistory ? "back" : action.icon;

  function handlePress() {
    if (returnsToHistory && router.canGoBack()) {
      router.back();
      return;
    }
    action.onPress();
  }

  return (
    <Pressable
      accessibilityLabel={returnsToHistory ? "Back to conversations" : action.label}
      accessibilityRole="button"
      disabled={action.disabled}
      hitSlop={8}
      onPress={handlePress}
      onPressIn={action.disabled ? undefined : hapticSelection}
      pressRetentionOffset={12}
      style={({ pressed }) => [
        styles.headerButton,
        action.disabled && styles.headerButtonDisabled,
        pressed && styles.pressed,
      ]}
    >
      <Icon name={icon} size={18} tintColor={Colors.dark.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    elevation: 4,
    flexDirection: "row",
    gap: 8,
    minHeight: 48,
    paddingBottom: 5,
    paddingHorizontal: 14,
    paddingTop: 3,
    zIndex: 4,
  },
  headerActions: {
    elevation: 6,
    flexDirection: "row",
    flexShrink: 0,
    gap: 10,
    zIndex: 6,
  },
  headerButton: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    position: "relative",
    width: 36,
    zIndex: 7,
  },
  headerButtonDisabled: {
    opacity: 0.45,
  },
  pressed: {
    backgroundColor: "rgba(255,255,255,0.08)",
    opacity: 0.72,
  },
  subtitle: {
    fontSize: 11,
    lineHeight: 14,
    maxWidth: "100%",
    opacity: 0.58,
    textAlign: "center",
  },
  title: {
    fontSize: 16,
    lineHeight: 20,
    textAlign: "center",
  },
  titleGroup: {
    alignItems: "center",
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
});
