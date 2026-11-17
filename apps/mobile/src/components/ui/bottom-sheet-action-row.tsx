import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { Fonts } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { hapticSelection } from "@/lib/haptics";

import { Icon, type AppIconName } from "./icon";
import { Text } from "./text";

export function SheetActionRow({
  accessibilityLabel,
  disabled,
  expanded,
  icon,
  iconBackgroundColor,
  iconTintColor,
  onPress,
  selected,
  selectedTitleColor,
  subtitle,
  subtitleNumberOfLines = 1,
  title,
  trailing,
}: {
  accessibilityLabel: string;
  disabled?: boolean;
  expanded?: boolean;
  icon: AppIconName;
  iconBackgroundColor?: string;
  iconTintColor?: string;
  onPress?: () => void;
  selected?: boolean;
  selectedTitleColor?: string;
  subtitle?: string;
  subtitleNumberOfLines?: number;
  title: string;
  trailing?: ReactNode;
}) {
  const theme = useTheme();
  const tintColor = disabled
    ? theme.textSecondary
    : (iconTintColor ?? (selected ? theme.text : theme.textSecondary));
  const titleColor = disabled
    ? theme.textSecondary
    : selectedTitleColor && selected
      ? selectedTitleColor
      : theme.text;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled, expanded, selected }}
      disabled={disabled}
      onPress={
        onPress
          ? () => {
              hapticSelection();
              onPress();
            }
          : undefined
      }
      style={[
        styles.actionRow,
        selected ? { backgroundColor: theme.backgroundSelected } : null,
        disabled ? styles.disabled : null,
      ]}
    >
      <View
        style={[
          styles.actionIcon,
          iconBackgroundColor ? { backgroundColor: iconBackgroundColor } : null,
        ]}
      >
        <Icon name={icon} size={18} tintColor={tintColor} />
      </View>
      <View style={styles.actionCopy}>
        <Text numberOfLines={1} style={[styles.actionTitle, { color: titleColor }]}>
          {title}
        </Text>
        {subtitle ? (
          <Text
            numberOfLines={subtitleNumberOfLines}
            style={[styles.actionSubtitle, { color: theme.textSecondaryStrong }]}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </Pressable>
  );
}

export function SheetSelectedDot({ selected }: { selected?: boolean }) {
  return <View style={[styles.selectedDot, selected ? null : styles.unselectedDot]} />;
}

const styles = StyleSheet.create((theme) => ({
  actionRow: {
    alignItems: "center",
    alignSelf: "stretch",
    borderCurve: "continuous",
    borderRadius: 12,
    flexDirection: "row",
    minHeight: 58,
    paddingHorizontal: 10,
    paddingVertical: 10,
    width: "100%",
  },
  disabled: {
    opacity: 0.5,
  },
  actionIcon: {
    alignItems: "center",
    backgroundColor: theme.tintSoft,
    borderCurve: "continuous",
    borderRadius: 16,
    height: 32,
    justifyContent: "center",
    marginRight: 12,
    width: 32,
  },
  actionCopy: {
    alignSelf: "stretch",
    flexBasis: 0,
    flexGrow: 1,
    flexShrink: 1,
    justifyContent: "center",
    minWidth: 0,
  },
  actionTitle: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 14,
    lineHeight: 18,
  },
  actionSubtitle: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 16,
  },
  trailing: {
    marginLeft: 12,
  },
  selectedDot: {
    backgroundColor: theme.accent,
    borderRadius: 6,
    height: 12,
    width: 12,
  },
  unselectedDot: {
    backgroundColor: "transparent",
    borderColor: theme.borderStrong,
    borderWidth: 1,
  },
}));
