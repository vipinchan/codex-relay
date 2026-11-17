import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => {
  const values = new Map<string, string>();
  const listeners = new Set<(key: string) => void>();
  return {
    values,
    getString: (key: string) => values.get(key),
    set(key: string, value: string) {
      values.set(key, value);
      for (const listener of listeners) listener(key);
    },
    addOnValueChangedListener(listener: (key: string) => void) {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    },
  };
});

vi.mock("react-native", () => ({
  Platform: { select: (values: Record<string, unknown>) => values.ios ?? values.default },
}));
vi.mock("react-native-mmkv", () => ({ createMMKV: () => storage }));

beforeEach(() => storage.values.clear());

describe("theme preference", () => {
  it("defaults to system and persists choices across reads", async () => {
    const preference = await import("./theme-preference");

    expect(preference.readThemeMode()).toBe("system");
    preference.setThemeMode("dark");
    expect(preference.readThemeMode()).toBe("dark");
    preference.setThemeMode("light");
    expect(preference.readThemeMode()).toBe("light");
    preference.setThemeMode("system");
    expect(preference.readThemeMode()).toBe("system");
  });

  it("notifies subscribers when the theme changes and supports unsubscribe", async () => {
    const preference = await import("./theme-preference");
    const onChange = vi.fn<() => void>();
    const unsubscribe = preference.subscribeThemeMode(onChange);

    preference.setThemeMode("dark");
    expect(onChange).toHaveBeenCalledOnce();
    unsubscribe();
    preference.setThemeMode("light");
    expect(onChange).toHaveBeenCalledOnce();
  });
});
