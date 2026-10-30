import { beforeEach, describe, expect, it, vi } from "vitest";

const mmkvStorage = vi.hoisted(() => new Map<string, string | number>());

vi.mock("react-native-mmkv", () => ({
  createMMKV: () => ({
    getString: (key: string) => mmkvStorage.get(key),
    getNumber: (key: string) => mmkvStorage.get(key),
    set: (key: string, value: string | number) => mmkvStorage.set(key, value),
    remove: (key: string) => mmkvStorage.delete(key),
    clearAll: () => mmkvStorage.clear(),
  }),
}));

describe("conversationsViewStore", () => {
  beforeEach(() => {
    mmkvStorage.clear();
  });

  it("defaults to time grouping mode and allows toggling", async () => {
    const {
      conversationsViewStore$,
      getConversationsGroupingMode,
      setConversationsGroupingMode,
      toggleConversationsGroupingMode,
    } = await import("./conversations-view-store");

    setConversationsGroupingMode("time");
    expect(getConversationsGroupingMode()).toBe("time");
    expect(conversationsViewStore$.groupingMode.peek()).toBe("time");

    toggleConversationsGroupingMode();
    expect(getConversationsGroupingMode()).toBe("project");
    expect(conversationsViewStore$.groupingMode.peek()).toBe("project");

    toggleConversationsGroupingMode();
    expect(getConversationsGroupingMode()).toBe("time");

    setConversationsGroupingMode("project");
    expect(getConversationsGroupingMode()).toBe("project");
  });

  it("safeguards against unexpected values and falls back to time", async () => {
    const { conversationsViewStore$, getConversationsGroupingMode, setConversationsGroupingMode } =
      await import("./conversations-view-store");

    // Force an invalid value
    // @ts-expect-error test fallback
    conversationsViewStore$.groupingMode.set("invalid-mode");
    expect(getConversationsGroupingMode()).toBe("time");

    // @ts-expect-error test normalization
    setConversationsGroupingMode("unknown");
    expect(getConversationsGroupingMode()).toBe("time");
    expect(conversationsViewStore$.groupingMode.peek()).toBe("time");
  });
});
