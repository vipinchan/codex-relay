/**
 * OpenMinis-inspired native iOS palette for the personal Codex Relay client.
 * The app intentionally stays dark-only; semantic surfaces mirror iOS system
 * background/fill hierarchy so chat content remains the visual focus.
 */

import { Platform } from "react-native";

const nativeDark = {
  text: "#F5F5F7",
  background: "#000000",
  backgroundElement: "#1C1C1E",
  backgroundSelected: "#2C2C2E",
  textSecondary: "#8E8E93",
  textSecondaryStrong: "#AEAEB2",
  powerTrack: "#3A3A3C",
  powerBlue: "#5E9EFF",
  powerViolet: "#8B7BFF",
  powerMagenta: "#C77DFF",
  agentGreen: "#70C769",
  agentViolet: "#A68BDD",
  agentCyan: "#55C2DE",
  agentTeal: "#59BDB5",
} as const;

export const Colors = {
  light: nativeDark,
  dark: nativeDark,
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

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
