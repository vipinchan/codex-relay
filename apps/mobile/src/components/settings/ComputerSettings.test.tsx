import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const ui = vi.hoisted(() => ({
  stores: new Map<string, Map<string, unknown>>(),
  actions: new Map<string, () => void>(),
}));
vi.mock("react-native-mmkv", () => ({
  createMMKV: ({ id }: { id: string }) => {
    const values = ui.stores.get(id) ?? new Map<string, unknown>();
    ui.stores.set(id, values);
    return {
      getString: (key: string) => values.get(key),
      getNumber: (key: string) => values.get(key),
      set: (key: string, value: unknown) => values.set(key, value),
      remove: (key: string) => values.delete(key),
      getAllKeys: () => [...values.keys()],
    };
  },
}));
vi.mock("@legendapp/state/react", () => ({ useSelector: (read: () => unknown) => read() }));
vi.mock("react-native", () => ({
  View: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  Pressable: ({
    children,
    accessibilityLabel,
    onPress,
  }: React.PropsWithChildren<{
    accessibilityLabel: string;
    onPress: () => void;
  }>) => {
    ui.actions.set(accessibilityLabel, onPress);
    return <button aria-label={accessibilityLabel}>{children}</button>;
  },
  Alert: { alert: vi.fn<() => void>() },
}));
vi.mock("expo-camera", () => ({
  CameraView: () => null,
  useCameraPermissions: () => [{ granted: true }, vi.fn<() => void>()],
}));
vi.mock("react-native-unistyles", () => ({ StyleSheet: { create: (styles: unknown) => styles } }));
vi.mock("@/components/themed-text", () => ({
  ThemedText: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
vi.mock("@/components/ui/bottom-sheet", () => ({
  AppBottomSheet: ({ visible, children }: React.PropsWithChildren<{ visible: boolean }>) =>
    visible ? <div>{children}</div> : null,
  AppBottomSheetTextInput: () => null,
  SheetActionRow: ({
    title,
    accessibilityLabel,
    onPress,
  }: {
    title: string;
    accessibilityLabel: string;
    onPress: () => void;
  }) => {
    ui.actions.set(accessibilityLabel, onPress);
    return <button>{title}</button>;
  },
}));
vi.mock("@/state/chat-store", () => ({
  chatStore$: { connection: { get: () => "connected" } },
}));
vi.mock("@/lib/codex-relay-api", () => ({ pairWithQrPayload: vi.fn<() => void>() }));

beforeEach(() => {
  vi.resetModules();
  ui.stores.clear();
  ui.actions.clear();
});

it("lists saved computers separately from connection state and selects the requested one", async () => {
  const p = await import("@/lib/computer-profiles");
  const a = p.savePairedComputer({
    serverPublicKey: "a",
    clientToken: "a",
    credentialId: "a",
    serverUrl: "http://192.168.1.2:8787",
    serverUrls: [],
  });
  p.renameComputer(a.id, "Home Mac");
  p.savePairedComputer({
    serverPublicKey: "b",
    clientToken: "b",
    credentialId: "b",
    serverUrl: "https://example.com",
    serverUrls: [],
  });
  const { ComputerSettings } = await import("./ComputerSettings");
  const html = renderToStaticMarkup(<ComputerSettings />);
  expect(html).toContain("Home Mac");
  expect(html).toContain("SAVED");
  expect(html).toContain("CONNECTED");
  expect(html).toContain("Add computer");
  ui.actions.get("Use Home Mac")!();
  expect(p.getActiveComputer()?.id).toBe(a.id);
});

it("offers pairing when no computer is selected without showing a false online computer", async () => {
  const { ComputerSettings } = await import("./ComputerSettings");
  const html = renderToStaticMarkup(<ComputerSettings />);
  expect(html).toContain("Add computer");
  expect(html).not.toContain("CONNECTED");
});
