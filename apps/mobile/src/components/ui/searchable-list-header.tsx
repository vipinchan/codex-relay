import type { ReactNode } from "react";
import { Pressable, TextInput, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { ThemedText } from "@/components/themed-text";
import { Icon } from "@/components/ui/icon";
import { useTheme } from "@/hooks/use-theme";
import { hapticSelection } from "@/lib/haptics";

type SearchableListHeaderProps = {
  title: string;
  rightAction: ReactNode;
  searchOpen: boolean;
  query: string;
  searchLabel: string;
  closeLabel: string;
  clearLabel: string;
  onToggleSearch: () => void;
  onChangeQuery: (query: string) => void;
};

export function SearchableListHeader({
  title,
  rightAction,
  searchOpen,
  query,
  searchLabel,
  closeLabel,
  clearLabel,
  onToggleSearch,
  onChangeQuery,
}: SearchableListHeaderProps) {
  const theme = useTheme();
  return (
    <>
      <View style={styles.topBar}>
        <View style={styles.topBarSide}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={searchOpen ? closeLabel : searchLabel}
            hitSlop={8}
            onPress={() => {
              hapticSelection();
              onToggleSearch();
            }}
            style={({ pressed }) => [styles.searchButton, pressed && styles.pressed]}
          >
            <Icon
              name={searchOpen ? "x" : "search"}
              size={27}
              tintColor={theme.accent}
              strokeWidth={1.8}
            />
          </Pressable>
        </View>
        <ThemedText accessibilityRole="header" style={styles.title}>
          {title}
        </ThemedText>
        <View style={[styles.topBarSide, styles.topBarSideEnd]}>{rightAction}</View>
      </View>
      {searchOpen ? (
        <View style={styles.searchWrap}>
          <Icon name="search" size={18} tintColor={theme.textSecondary} />
          <TextInput
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel={searchLabel}
            placeholder={searchLabel}
            placeholderTextColor={theme.textSecondary}
            value={query}
            onChangeText={onChangeQuery}
            style={styles.searchInput}
          />
          {query ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={clearLabel}
              hitSlop={8}
              onPress={() => onChangeQuery("")}
            >
              <Icon name="x" size={17} tintColor={theme.textSecondary} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  topBar: {
    height: 64,
    alignItems: "center",
    justifyContent: "space-between",
    flexDirection: "row",
    paddingHorizontal: 22,
  },
  topBarSide: { width: 90, alignItems: "flex-start" },
  topBarSideEnd: { alignItems: "flex-end" },
  title: { fontSize: 22, lineHeight: 27, fontWeight: "700", color: theme.text },
  searchButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.64, transform: [{ scale: 0.96 }] },
  searchWrap: {
    marginHorizontal: 18,
    marginBottom: 8,
    minHeight: 42,
    borderRadius: 14,
    paddingHorizontal: 13,
    gap: 9,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.backgroundElement,
  },
  searchInput: { flex: 1, color: theme.text, fontSize: 16, paddingVertical: 9 },
}));
