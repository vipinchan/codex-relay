import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { appearanceDark, appearanceLight } from "@/constants/appearance";

const ui = vi.hoisted(() => ({
  dark: false,
  tabBarStyle: {} as { backgroundColor?: string; borderTopColor?: string },
}));

vi.mock("@/hooks/use-theme", () => ({
  useTheme: () => (ui.dark ? appearanceDark : appearanceLight),
}));
vi.mock("lucide-react-native", () => ({
  Bot: () => null,
  MessageSquare: () => null,
  Settings: () => null,
}));
vi.mock("react-native-unistyles", async () => {
  const { appearanceLight } = await import("@/constants/appearance");
  return {
    StyleSheet: {
      create: (styles: unknown) =>
        typeof styles === "function" ? styles(appearanceLight) : styles,
    },
  };
});
vi.mock("expo-router", () => ({
  Tabs: Object.assign(
    ({ screenOptions }: { screenOptions: { tabBarStyle: typeof ui.tabBarStyle } }) => {
      ui.tabBarStyle = screenOptions.tabBarStyle;
      return null;
    },
    { Screen: () => null },
  ),
}));

import MainTabsLayout from "@/app/(drawer)/_layout";

describe("tab appearance", () => {
  it("uses the resolved palette immediately while Unistyles is still on the old theme", () => {
    ui.dark = false;
    renderToStaticMarkup(<MainTabsLayout />);
    expect(ui.tabBarStyle.backgroundColor).toBe(appearanceLight.backgroundAlt);

    ui.dark = true;
    renderToStaticMarkup(<MainTabsLayout />);
    expect(ui.tabBarStyle.backgroundColor).toBe(appearanceDark.backgroundAlt);
    expect(ui.tabBarStyle.borderTopColor).toBe(appearanceDark.borderSubtle);
  });
});
