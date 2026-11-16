import { useState } from "react";
import { Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { ThemedText } from "@/components/themed-text";
import { AppBottomSheet, SheetActionRow, SheetSelectedDot } from "@/components/ui/bottom-sheet";
import { Icon } from "@/components/ui/icon";
import { type ThemeMode, Fonts, Spacing } from "@/constants/theme";
import { useTheme, useThemeMode } from "@/hooks/use-theme";
import { hapticSelection } from "@/lib/haptics";
import { setThemeMode } from "@/lib/theme-preference";

const modes: { value: ThemeMode; label: string; description: string }[] = [
  { value: "system", label: "System", description: "Follow your device appearance" },
  { value: "light", label: "Light", description: "Always use light appearance" },
  { value: "dark", label: "Dark", description: "Always use dark appearance" },
];

export function AppearanceSettings() {
  const theme = useTheme();
  const mode = useThemeMode();
  const [visible, setVisible] = useState(false);
  const currentLabel = modes.find((option) => option.value === mode)?.label ?? "System";

  return (
    <View style={styles.section}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
        Appearance
      </ThemedText>
      <Pressable
        accessibilityLabel="Change theme"
        accessibilityRole="button"
        accessibilityValue={{ text: currentLabel }}
        onPress={() => {
          hapticSelection();
          setVisible(true);
        }}
        style={[styles.row, { backgroundColor: theme.backgroundElement }]}
      >
        <ThemedText type="smallBold" style={styles.rowTitle}>
          Theme
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {currentLabel}
        </ThemedText>
        <Icon name="chevronRight" size={16} tintColor={theme.textSecondary} />
      </Pressable>
      <AppBottomSheet title="Theme" visible={visible} onClose={() => setVisible(false)}>
        {modes.map((option) => (
          <SheetActionRow
            key={option.value}
            accessibilityLabel={`${option.label} theme`}
            icon="settings"
            onPress={() => {
              setThemeMode(option.value);
              setVisible(false);
            }}
            selected={option.value === mode}
            subtitle={option.description}
            title={option.label}
            trailing={<SheetSelectedDot selected={option.value === mode} />}
          />
        ))}
      </AppBottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.two },
  sectionLabel: {
    fontFamily: Fonts.sansMedium,
    fontSize: 11,
    lineHeight: 16,
    opacity: 0.68,
  },
  row: {
    alignItems: "center",
    borderRadius: 8,
    flexDirection: "row",
    gap: Spacing.two,
    minHeight: 56,
    paddingHorizontal: 16,
  },
  rowTitle: { flex: 1 },
});
