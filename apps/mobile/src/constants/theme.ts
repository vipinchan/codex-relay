import { Platform } from "react-native";

import { appearanceDark, appearanceLight, type AppearanceColors } from "./appearance";

export const Colors: Record<ThemeScheme, AppearanceColors> = {
  light: appearanceLight,
  dark: appearanceDark,
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;
export type ThemeColors = AppearanceColors;
export type ThemeMode = "system" | "light" | "dark";
export type ThemeScheme = "light" | "dark";

export function normalizeThemeMode(value: unknown): ThemeMode {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

export function resolveThemeScheme(
  mode: ThemeMode,
  systemScheme: ThemeScheme | null | undefined,
): ThemeScheme {
  return mode === "system" ? (systemScheme ?? "light") : mode;
}

declare module "react-native-unistyles" {
  interface UnistylesThemes {
    light: AppearanceColors;
    dark: AppearanceColors;
  }
}

export const Fonts = Platform.select({
  default: {
    sans: "System",
    sansBold: "System",
    sansMedium: "System",
    sansSemiBold: "System",
    serif: "serif",
    rounded: "System",
    mono: "monospace",
    monoMedium: "monospace",
  },
  android: {
    sans: "sans-serif",
    sansBold: "sans-serif",
    sansMedium: "sans-serif-medium",
    sansSemiBold: "sans-serif-medium",
    serif: "serif",
    rounded: "sans-serif",
    mono: "monospace",
    monoMedium: "monospace",
  },
  ios: {
    sans: "System",
    sansBold: "System",
    sansMedium: "System",
    sansSemiBold: "System",
    serif: "serif",
    rounded: "System",
    mono: "Menlo",
    monoMedium: "Menlo",
  },
  web: {
    sans: "var(--font-display)",
    sansBold: "var(--font-display-bold)",
    sansMedium: "var(--font-display-medium)",
    sansSemiBold: "var(--font-display-semibold)",
    serif: "var(--font-serif)",
    rounded: "var(--font-rounded)",
    mono: "var(--font-mono)",
    monoMedium: "var(--font-mono-medium)",
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
