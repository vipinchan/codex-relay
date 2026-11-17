import { useSyncExternalStore } from "react";
import { useColorScheme } from "react-native";

import { Colors, resolveThemeScheme } from "@/constants/theme";
import { readThemeMode, subscribeThemeMode } from "@/lib/theme-preference";

export function useThemeMode() {
  return useSyncExternalStore(subscribeThemeMode, readThemeMode, readThemeMode);
}

export function useThemeScheme() {
  const mode = useThemeMode();
  const systemScheme = useColorScheme();
  return resolveThemeScheme(
    mode,
    systemScheme === "light" || systemScheme === "dark" ? systemScheme : null,
  );
}

export function useTheme() {
  return Colors[useThemeScheme()];
}
