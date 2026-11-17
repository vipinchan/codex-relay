import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { appearanceDark, appearanceLight } from "@/constants/appearance";

const ui = vi.hoisted(() => ({
  visible: false,
  systemScheme: "dark" as "light" | "dark",
  values: new Map<string, string>(),
  actions: new Map<string, () => void>(),
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof React>()),
  useState: () => [
    ui.visible,
    (visible: boolean) => {
      ui.visible = visible;
    },
  ],
}));
vi.mock("react-native", () => ({
  Platform: { select: (values: Record<string, unknown>) => values.ios ?? values.default },
  useColorScheme: () => ui.systemScheme,
  Pressable: ({
    children,
    accessibilityLabel,
    accessibilityValue,
    onPress,
    style,
  }: React.PropsWithChildren<{
    accessibilityLabel: string;
    accessibilityValue: { text: string };
    onPress: () => void;
    style: unknown[];
  }>) => {
    ui.actions.set(accessibilityLabel, onPress);
    return (
      <button
        aria-label={accessibilityLabel}
        data-value={accessibilityValue.text}
        style={Object.assign({}, ...style)}
      >
        {children}
      </button>
    );
  },
  View: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
vi.mock("react-native-mmkv", () => ({
  createMMKV: () => ({
    getString: (key: string) => ui.values.get(key),
    set: (key: string, value: string) => ui.values.set(key, value),
    addOnValueChangedListener: () => ({ remove: () => undefined }),
  }),
}));
vi.mock("react-native-unistyles", async () => {
  const { appearanceDark } = await import("@/constants/appearance");
  return {
    StyleSheet: {
      create: (styles: unknown) => (typeof styles === "function" ? styles(appearanceDark) : styles),
    },
  };
});
vi.mock("@/components/themed-text", () => ({
  ThemedText: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/components/ui/bottom-sheet", () => ({
  AppBottomSheet: ({ children, visible }: React.PropsWithChildren<{ visible: boolean }>) =>
    visible ? <section>{children}</section> : null,
  SheetActionRow: ({
    title,
    onPress,
    selected,
  }: {
    title: string;
    onPress: () => void;
    selected: boolean;
  }) => {
    ui.actions.set(title, onPress);
    return <button aria-pressed={selected}>{title}</button>;
  },
  SheetSelectedDot: () => null,
}));
vi.mock("@/lib/haptics", () => ({ hapticSelection: () => undefined }));

import { AppearanceSettings } from "./AppearanceSettings";
import { useTheme } from "@/hooks/use-theme";
import { readThemeMode } from "@/lib/theme-preference";

function ThemeSample() {
  const theme = useTheme();
  return <span style={{ color: theme.text, backgroundColor: theme.background }}>Sample</span>;
}

beforeEach(() => {
  ui.visible = false;
  ui.systemScheme = "dark";
  ui.values.clear();
  ui.actions.clear();
});

describe("appearance settings", () => {
  it("switches each setting and updates the selected option and palette", () => {
    renderToStaticMarkup(<AppearanceSettings />);
    ui.actions.get("Change theme")!();
    let markup = renderToStaticMarkup(<AppearanceSettings />);
    expect(markup).toContain('aria-pressed="true">System');

    for (const [label, mode, background] of [
      ["Light", "light", appearanceLight.background],
      ["Dark", "dark", appearanceDark.background],
      ["System", "system", appearanceDark.background],
    ] as const) {
      ui.actions.get(label)!();
      expect(readThemeMode()).toBe(mode);
      expect(ui.visible).toBe(false);
      markup = renderToStaticMarkup(<AppearanceSettings />);
      expect(markup).toContain(`data-value="${label}"`);
      expect(renderToStaticMarkup(<ThemeSample />)).toContain(`background-color:${background}`);
      ui.actions.get("Change theme")!();
      markup = renderToStaticMarkup(<AppearanceSettings />);
      expect(markup).toContain(`aria-pressed="true">${label}`);
    }
  });

  it("responds to system changes and preserves an explicit choice", () => {
    expect(renderToStaticMarkup(<ThemeSample />)).toContain(appearanceDark.background);
    ui.systemScheme = "light";
    expect(renderToStaticMarkup(<ThemeSample />)).toContain(appearanceLight.background);
    ui.values.set("theme-mode", "dark");
    expect(renderToStaticMarkup(<ThemeSample />)).toContain(appearanceDark.background);
    ui.systemScheme = "dark";
    expect(renderToStaticMarkup(<ThemeSample />)).toContain(appearanceDark.background);
  });
});
