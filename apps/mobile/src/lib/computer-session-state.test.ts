import { beforeEach, expect, it, vi } from "vitest";

const stores = vi.hoisted(() => new Map<string, Map<string, unknown>>());
vi.mock("react-native-mmkv", () => ({
  createMMKV: ({ id }: { id: string }) => {
    const values = stores.get(id) ?? new Map<string, unknown>();
    stores.set(id, values);
    return {
      getString: (key: string) => values.get(key),
      getNumber: (key: string) => values.get(key),
      set: (key: string, value: unknown) => values.set(key, value),
      remove: (key: string) => values.delete(key),
      getAllKeys: () => [...values.keys()],
    };
  },
}));
vi.mock("@/state/persistence", () => ({ persistLocalObservable: vi.fn<() => void>() }));

beforeEach(() => {
  vi.resetModules();
  stores.clear();
});

it("restores each computer's draft, active thread and workspace state", async () => {
  const p = await import("./computer-profiles");
  const { initializeComputerSessionState } = await import("./computer-session-state");
  const { chatStore$, setComposerDraft, setActiveThread } = await import("@/state/chat-store");
  const { pinThread, getPinnedThreadIds } = await import("@/state/pinned-thread-store");
  initializeComputerSessionState();
  const a = p.savePairedComputer({
    serverPublicKey: "a",
    clientToken: "a",
    credentialId: "a",
    serverUrl: "http://192.168.1.2:8787",
    serverUrls: [],
  });
  setActiveThread("same-thread");
  setComposerDraft("Mac A draft");
  pinThread("a-thread");
  const b = p.savePairedComputer({
    serverPublicKey: "b",
    clientToken: "b",
    credentialId: "b",
    serverUrl: "https://example.com",
    serverUrls: [],
  });
  expect(chatStore$.activeThreadId.peek()).toBeUndefined();
  expect(getPinnedThreadIds()).toEqual([]);
  setActiveThread("same-thread");
  setComposerDraft("Mac B draft");
  p.activateComputer(a.id);
  expect(chatStore$.composerDraftByThreadId["same-thread"].peek()).toBe("Mac A draft");
  expect(getPinnedThreadIds()).toEqual(["a-thread"]);
  p.activateComputer(b.id);
  expect(chatStore$.composerDraftByThreadId["same-thread"].peek()).toBe("Mac B draft");
  p.setComputerConnectionMode(b.id, "manual", "https://example.com");
  expect(chatStore$.composerDraftByThreadId["same-thread"].peek()).toBe("Mac B draft");
});
