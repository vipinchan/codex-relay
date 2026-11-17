import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@hot-updater/react-native", () => ({
  HotUpdater: {
    getAppVersion: () => "1.5.0",
    getBundleId: () => undefined,
  },
}));
vi.mock("@legendapp/state/react", () => ({ useSelector: (read: () => unknown) => read() }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined, isFetching: false }),
}));
vi.mock("expo-constants", () => ({ default: { expoConfig: { version: "1.5.0" } } }));
vi.mock("expo-router", () => ({ router: {} }));
vi.mock("lucide-react-native", () => ({ Heart: () => null }));
vi.mock("react-native", () => ({
  Alert: { alert: vi.fn<() => void>() },
  Linking: { openURL: vi.fn<() => void>() },
  Pressable: ({
    children,
    accessibilityLabel,
  }: React.PropsWithChildren<{ accessibilityLabel?: string }>) => (
    <button aria-label={accessibilityLabel}>{children}</button>
  ),
  ScrollView: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  Switch: ({ accessibilityLabel }: { accessibilityLabel: string }) => (
    <input aria-label={accessibilityLabel} type="checkbox" />
  ),
  View: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
vi.mock("react-native-unistyles", async () => {
  const { appearanceDark } = await import("@/constants/appearance");
  return {
    StyleSheet: {
      create: (styles: unknown) => (typeof styles === "function" ? styles(appearanceDark) : styles),
    },
    UnistylesRuntime: { getTheme: () => appearanceDark },
  };
});
vi.mock("react-native-reanimated", () => ({
  default: { View: ({ children }: React.PropsWithChildren) => <div>{children}</div> },
  FadeIn: { duration: () => undefined },
  FadeOut: { duration: () => undefined },
  LinearTransition: { duration: () => undefined },
}));
vi.mock("@/assets/icons/fa", () => ({ FaGithub: () => null }));
vi.mock("@/components/themed-text", () => ({
  ThemedText: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/components/ui/bottom-sheet", () => ({
  AppBottomSheet: ({ children, visible }: React.PropsWithChildren<{ visible: boolean }>) =>
    visible ? <div>{children}</div> : null,
  SheetActionRow: ({ title }: { title: string }) => <button>{title}</button>,
  SheetSelectedDot: () => null,
}));
vi.mock("@/hooks/use-theme", () => ({
  useTheme: () => ({ backgroundElement: "#eee", text: "#111", textSecondary: "#666" }),
  useThemeMode: () => "system",
}));
vi.mock("@/lib/theme-preference", () => ({ setThemeMode: vi.fn<(mode: string) => void>() }));
vi.mock("@/components/settings/ComputerSettings", () => ({
  ComputerSettings: () => <section>Saved computers</section>,
}));
vi.mock("@/constants/theme", () => ({
  Colors: { dark: {} },
  Fonts: {},
  Spacing: {},
  MaxContentWidth: 640,
}));
vi.mock("@/lib/computer-profiles", () => ({ getActiveComputer: () => undefined }));
vi.mock("@/lib/codex-relay-api", () => ({
  getPushNotificationSettings: vi.fn<() => void>(),
  registerPushNotifications: vi.fn<() => void>(),
  unregisterPushNotifications: vi.fn<() => void>(),
}));
vi.mock("@/lib/haptics", () => ({
  hapticSelection: vi.fn<() => void>(),
  hapticWarning: vi.fn<() => void>(),
}));
vi.mock("@/lib/hot-updater-logs", () => ({ useHotUpdaterLogs: () => [] }));
vi.mock("@/lib/push-notifications", () => ({
  defaultPushNotificationPreferences: {
    turnTerminal: true,
    includeRemainingUsage: true,
    actionRequired: true,
  },
  supportsPushNotifications: () => true,
}));
vi.mock("@/lib/rate-limits", () => ({ visibleRateLimitRows: () => [] }));
vi.mock("@/lib/server-state", () => ({
  serverStateKeys: { rateLimits: () => ["rate-limits"] },
  serverStateQueryFns: { rateLimits: vi.fn<() => void>() },
}));
vi.mock("@/state/chat-store", () => ({
  chatStore$: {
    connection: { get: () => "connected" },
    hasPairedSession: { get: () => true },
    serverUrl: { get: () => "http://relay.test" },
  },
}));

describe("full settings screen", () => {
  it("shows the current appearance selection", async () => {
    const { default: SettingsScreen } = await import("@/app/settings");
    const markup = renderToStaticMarkup(<SettingsScreen embedded />);

    expect(markup).toContain("Appearance");
    expect(markup).toContain('aria-label="Change theme"');
    expect(markup).toContain("System");
  });

  it("shows existing settings without a back-to-threads button inside the tab", async () => {
    const { default: SettingsScreen } = await import("@/app/settings");
    const markup = renderToStaticMarkup(<SettingsScreen embedded />);

    expect(markup).not.toContain("Back to threads");
    for (const content of [
      "Usage Limits",
      "Saved computers",
      "Turn complete",
      "Remaining usage",
      "Action required",
      "Sign out",
      "Version 1.5.0",
    ]) {
      expect(markup).toContain(content);
    }
  });

  it("keeps the back button when opened through the existing standalone route", async () => {
    const { default: SettingsScreen } = await import("@/app/settings");
    const markup = renderToStaticMarkup(<SettingsScreen />);

    expect(markup).toContain('aria-label="Back to threads"');
    expect(markup).toContain("Saved computers");
  });
});
