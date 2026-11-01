import { beforeEach, describe, expect, it, vi } from "vitest";

const stores = vi.hoisted(() => new Map<string, Map<string, unknown>>());
const failure = vi.hoisted(() => ({ commit: false }));
vi.mock("react-native-mmkv", () => ({
  createMMKV: ({ id }: { id: string }) => {
    const values = stores.get(id) ?? new Map<string, unknown>();
    stores.set(id, values);
    return {
      getString: (key: string) => values.get(key),
      getNumber: (key: string) => values.get(key),
      getBoolean: (key: string) => values.get(key),
      set: (key: string, value: unknown) => {
        if (failure.commit && id === "codex-relay-computers" && key === "profiles-v1") {
          throw new Error("Storage interrupted.");
        }
        values.set(key, value);
      },
      remove: (key: string) => values.delete(key),
      getAllKeys: () => [...values.keys()],
    };
  },
}));

beforeEach(() => {
  vi.resetModules();
  stores.clear();
  failure.commit = false;
});

describe("saved computers", () => {
  it("migrates the existing pairing without changing counters or identity", async () => {
    stores.set(
      "codex-relay",
      new Map<string, unknown>([
        ["codex-relay.client-token", "old-token"],
        ["codex-relay.pairing-identity", "old-identity"],
        ["codex-relay.server-url", "http://192.168.1.2:8787"],
      ]),
    );
    stores.set(
      "codex-relay-secure",
      new Map<string, unknown>([
        ["next-mobile-counter", 123],
        ["last-server-counter", 98],
        ["key-epoch", 1],
        ["mobile-to-server-key", "key-a"],
        ["server-to-mobile-key", "key-b"],
      ]),
    );
    const profiles = await import("./computer-profiles");
    const first = profiles.getActiveComputer()!;
    expect(first.pairingIdentity).toBe("old-identity");
    expect(profiles.getComputerToken(first)).toBe("old-token");
    expect(stores.get("codex-relay-secure")!.get(`${first.credentialId}:next-mobile-counter`)).toBe(
      123,
    );
    vi.resetModules();
    expect((await import("./computer-profiles")).getActiveComputer()).toEqual(first);
  });

  it("keeps independent credentials and complete LAN and public URLs", async () => {
    const p = await import("./computer-profiles");
    const a = p.savePairedComputer({
      serverPublicKey: "public-a",
      clientToken: "token-a",
      credentialId: "credential-a",
      serverUrl: "http://192.168.1.2:8787",
      serverUrls: ["http://192.168.1.2:8787", "http://example.com:18787"],
    });
    const b = p.savePairedComputer({
      serverPublicKey: "public-b",
      clientToken: "token-b",
      credentialId: "credential-b",
      serverUrl: "https://example.org",
      serverUrls: ["https://example.org"],
    });
    p.activateComputer(a.id);
    expect(p.getComputerToken(p.getActiveComputer()!)).toBe("token-a");
    p.activateComputer(b.id);
    expect(p.getComputerToken(p.getActiveComputer()!)).toBe("token-b");
    expect(p.getComputers()[0]!.addresses).toContain("http://example.com:18787");
    p.removeComputer(b.id);
    expect(p.getActiveComputer()).toBeUndefined();
    expect(p.getComputers().map((c) => c.id)).toEqual([a.id]);
  });

  it("updates a verified identity without merging different keys at the same URL", async () => {
    const p = await import("./computer-profiles");
    const input = {
      serverPublicKey: "a",
      clientToken: "one",
      credentialId: "one",
      serverUrl: "https://example.com",
      serverUrls: ["https://example.com"],
    };
    const first = p.savePairedComputer(input);
    expect(p.savePairedComputer({ ...input, credentialId: "two", clientToken: "two" }).id).toBe(
      first.id,
    );
    p.savePairedComputer({ ...input, serverPublicKey: "b", credentialId: "three" });
    expect(p.getComputers()).toHaveLength(2);
  });

  it("filters listen-only URLs and preserves fixed selection", async () => {
    const p = await import("./computer-profiles");
    const a = p.savePairedComputer({
      serverPublicKey: "a",
      clientToken: "a",
      credentialId: "a",
      serverUrl: "https://example.com",
      serverUrls: ["https://example.com", "http://0.0.0.0:8787"],
    });
    expect(a.addresses).toEqual(["https://example.com"]);
    p.setComputerConnectionMode(a.id, "manual", "https://example.com");
    expect(p.getActiveComputer()?.connectionMode).toBe("manual");
    expect(() => p.removeComputerAddress(a.id, "https://example.com")).toThrow(/last address/i);
  });

  it("edits a selected address atomically and accepts equivalent URL spelling", async () => {
    const p = await import("./computer-profiles");
    const a = p.savePairedComputer({
      serverPublicKey: "a",
      clientToken: "a",
      credentialId: "a",
      serverUrl: "https://example.com",
      serverUrls: [],
    });
    p.replaceComputerAddress(a.id, "https://example.com", "https://example.com/");
    expect(p.getActiveComputer()?.addresses).toEqual(["https://example.com"]);
    p.replaceComputerAddress(a.id, "https://example.com", "http://example.com:18787");
    expect(p.getActiveComputer()?.activeUrl).toBe("http://example.com:18787");
    expect(p.getActiveComputer()?.addresses).toEqual(["http://example.com:18787"]);
  });

  it("retries an interrupted migration without clearing the source or reducing counters", async () => {
    stores.set(
      "codex-relay",
      new Map<string, unknown>([
        ["codex-relay.client-token", "old-token"],
        ["codex-relay.server-url", "https://example.com"],
      ]),
    );
    stores.set(
      "codex-relay-secure",
      new Map<string, unknown>([
        ["next-mobile-counter", 100],
        ["legacy-pairing:next-mobile-counter", 101],
      ]),
    );
    failure.commit = true;
    const p = await import("./computer-profiles");
    expect(() => p.getActiveComputer()).toThrow(/interrupted/);
    expect(stores.get("codex-relay")!.get("codex-relay.client-token")).toBe("old-token");
    failure.commit = false;
    const restored = p.getActiveComputer()!;
    expect(p.getComputerToken(restored)).toBe("old-token");
    expect(stores.get("codex-relay-secure")!.get("legacy-pairing:next-mobile-counter")).toBe(101);
    expect(stores.get("codex-relay")!.has("codex-relay.client-token")).toBe(false);
  });

  it("does not revive old notification routing after another computer is removed", async () => {
    const p = await import("./computer-profiles");
    p.savePairedComputer({
      serverPublicKey: "a",
      clientToken: "a",
      credentialId: "a",
      serverUrl: "https://a.example.com",
      serverUrls: [],
    });
    expect(p.canRouteLegacyNotification()).toBe(true);
    const second = p.savePairedComputer({
      serverPublicKey: "b",
      clientToken: "b",
      credentialId: "b",
      serverUrl: "https://b.example.com",
      serverUrls: [],
    });
    expect(p.canRouteLegacyNotification()).toBe(false);
    p.removeComputer(second.id);
    expect(p.canRouteLegacyNotification()).toBe(false);
  });

  it("does not switch UI state when committing a new pairing fails", async () => {
    const p = await import("./computer-profiles");
    const first = p.savePairedComputer({
      serverPublicKey: "a",
      clientToken: "a",
      credentialId: "a",
      serverUrl: "https://a.example.com",
      serverUrls: [],
    });
    const switchState = vi.fn<() => void>();
    p.onComputerSwitch(switchState);
    failure.commit = true;
    expect(() =>
      p.savePairedComputer({
        serverPublicKey: "b",
        clientToken: "b",
        credentialId: "b",
        serverUrl: "https://b.example.com",
        serverUrls: [],
      }),
    ).toThrow(/interrupted/);
    expect(p.getActiveComputer()?.id).toBe(first.id);
    expect(switchState).not.toHaveBeenCalled();
    expect(stores.get("codex-relay-credentials")!.has("b")).toBe(false);
  });
});
