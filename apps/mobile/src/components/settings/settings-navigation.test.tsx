import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("expo-router", () => ({
  Redirect: ({ href }: { href: string }) => <a href={href}>Settings</a>,
  router: {},
}));
vi.mock("react-native", () => ({
  Pressable: ({ children }: React.PropsWithChildren) => <button>{children}</button>,
  ScrollView: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  View: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
vi.mock("react-native-unistyles", () => ({ StyleSheet: { create: (styles: unknown) => styles } }));
vi.mock("@/components/themed-text", () => ({
  ThemedText: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/constants/theme", () => ({ Colors: { dark: {} } }));
vi.mock("@/lib/haptics", () => ({ hapticSelection: vi.fn<() => void>() }));
vi.mock("@/app/settings", () => ({
  default: ({ embedded }: { embedded?: boolean }) => (
    <main data-embedded={String(embedded)}>Full settings content</main>
  ),
}));

describe("settings navigation", () => {
  it("opens the existing full settings directly in the Settings tab", async () => {
    const { default: SettingsTabRoute } = await import("@/app/(drawer)/settings-tab");
    const markup = renderToStaticMarkup(<SettingsTabRoute />);

    expect(markup).toContain("Full settings content");
    expect(markup).toContain('data-embedded="true"');
    expect(markup).not.toContain("Codex Runtime");
    expect(markup).not.toContain("Advanced Settings");
  });

  it("redirects the old settings home route to the Settings tab", async () => {
    const { default: SettingsHomeRoute } = await import("@/app/settings-home");
    const markup = renderToStaticMarkup(<SettingsHomeRoute />);

    expect(markup).toContain('href="/settings-tab"');
    expect(markup).not.toContain("Connected Computer");
    expect(markup).not.toContain("Codex Runtime");
  });
});
