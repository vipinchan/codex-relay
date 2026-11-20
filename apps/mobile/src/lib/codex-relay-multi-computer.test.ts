import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSecurePairing,
  createServerIdentity,
  decryptFromMobile,
  encryptForMobile,
} from "../../../../packages/codex-relay/src/secure-transport";

const mocks = vi.hoisted(() => ({
  stores: new Map<string, Map<string, unknown>>(),
  fetch: vi.fn<typeof fetch>(),
}));
vi.mock("react-native-get-random-values", () => ({}));
vi.mock("react-native", () => ({ Platform: { OS: "web" } }));
vi.mock("react-native-direct-fetch", () => ({
  dfetch: mocks.fetch,
  dfetchStream: vi.fn<() => void>(),
}));
vi.mock("react-native-nitro-fetch", () => ({ fetch: mocks.fetch }));
vi.mock("react-native-sse", () => ({ default: vi.fn<() => void>() }));
vi.mock("react-native-mmkv", () => ({
  createMMKV: ({ id }: { id: string }) => {
    const values = mocks.stores.get(id) ?? new Map<string, unknown>();
    mocks.stores.set(id, values);
    return {
      getString: (key: string) => values.get(key),
      getNumber: (key: string) => values.get(key),
      getBoolean: (key: string) => values.get(key),
      set: (key: string, value: unknown) => values.set(key, value),
      remove: (key: string) => values.delete(key),
      getAllKeys: () => [...values.keys()],
    };
  },
}));

const status = {
  ok: true,
  service: "codex-relay-server",
  sdkAvailable: true,
  machineName: "Mac",
  workspacePath: "/work",
  threadCount: 0,
};

beforeEach(() => {
  vi.resetModules();
  mocks.stores.clear();
  mocks.fetch.mockReset();
});

async function paired(id: string, url: string, urls = [url]) {
  const mobile = await import("./secure-transport");
  const profiles = await import("./computer-profiles");
  const identity = createServerIdentity();
  const attempt = mobile.createSecurePairingAttempt({
    serverUrl: url,
    serverPublicKey: identity.publicKey,
  });
  const pairing = createSecurePairing({
    clientEphemeralPublicKey: attempt.clientEphemeralPublicKey,
    clientNonce: attempt.clientNonce,
    clientToken: `token-${id}`,
    clientTokenExpiresAt: "2027-01-01T00:00:00.000Z",
    keyEpoch: 1,
    approvalCode: "",
    serverIdentity: identity,
    serverUrl: url,
  });
  mobile.completeSecurePairing(attempt, { secure: pairing.response }, id);
  const profile = profiles.savePairedComputer({
    serverPublicKey: identity.publicKey,
    credentialId: id,
    clientToken: `token-${id}`,
    serverUrl: url,
    serverUrls: urls,
  });
  return { profile, server: pairing.session, profiles, mobile };
}

describe("scoped relay requests", () => {
  it("retries an interrupted file chunk at the same offset and renews a consumed ticket", async () => {
    const { server } = await paired("a", "https://example.com");
    const metadata = {
      name: "build.ipa",
      size: 4,
      sha256: "a".repeat(64),
    };
    const ids = ["a41a970f-8f18-4df5-b28f-1332fc2ebc5c", "b41a970f-8f18-4df5-b28f-1332fc2ebc5c"];
    let prepared = 0;
    const counters: number[] = [];
    const requests: number[] = [];
    const reply = (body: object, responseStatus = 200) =>
      Response.json(encryptForMobile(server, JSON.stringify(body)), { status: responseStatus });
    mocks.fetch.mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/status")) return reply({ ...status, messageFileDownloads: true });
      const envelope = JSON.parse(String(init?.body));
      counters.push(envelope.counter);
      if (path.endsWith("/chunk") && requests.length === 0) {
        server.lastMobileCounter = envelope.counter;
        requests.push(0);
        return reply({ error: { code: "invalid_request", message: "Invalid file chunk" } }, 400);
      }
      if (path.endsWith("/chunk") && requests.length === 1) {
        const valid = encryptForMobile(
          server,
          JSON.stringify({ offset: 0, nextOffset: 2, data: "AQI=" }),
        );
        requests.push(0);
        return Response.json({ ...valid, ciphertext: "AAAA" });
      }
      if (path.endsWith("/chunk") && requests.length === 2) {
        requests.push(0);
        return reply({ offset: 0, nextOffset: 2, data: "AQI=" });
      }
      if (path.endsWith("/prepare")) return reply({ ...metadata, downloadId: ids[prepared++] });
      const payload = JSON.parse(decryptFromMobile(server, envelope));
      requests.push(payload.offset);
      if (payload.offset === 0) return reply({ offset: 0, nextOffset: 2, data: "AQI=" });
      if (payload.downloadId === ids[0]) {
        return reply({ error: { code: "download_expired", message: "Start over" } }, 404);
      }
      return reply({ offset: 2, nextOffset: 4, data: "AwQ=" });
    });
    const api = await import("./codex-relay-api");
    const request = {
      source: "session" as const,
      conversationId: "thread",
      messageId: "reply",
      path: "./build.ipa",
    };
    const download = api.createMessageFileDownload(new AbortController().signal);
    try {
      await download.prepare(request);
      await expect(download.read(0)).resolves.toMatchObject({ nextOffset: 2 });
      await expect(download.read(2)).resolves.toMatchObject({ nextOffset: 4 });
      expect(counters).toHaveLength(7);
      expect(requests).toEqual([0, 0, 0, 2, 2]);
      expect(prepared).toBe(2);
      expect(new Set(counters).size).toBe(counters.length);
    } finally {
      download.close();
    }
  }, 15_000);

  it("rejects a late Mac A response without touching Mac B's crypto session", async () => {
    const a = await paired("a", "http://192.168.1.2:8787");
    let resolve!: (response: Response) => void;
    mocks.fetch
      .mockResolvedValueOnce(Response.json(encryptForMobile(a.server, JSON.stringify(status))))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((done) => {
            resolve = done;
          }),
      );
    const api = await import("./codex-relay-api");
    const pending = api.getStatus();
    await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));
    const b = await paired("b", "https://example.com");
    const bCounter = mocks.stores.get("codex-relay-secure")!.get("b:last-server-counter");
    resolve(Response.json(encryptForMobile(a.server, JSON.stringify(status))));
    await expect(pending).rejects.toThrow(/changed/);
    expect(mocks.stores.get("codex-relay-secure")!.get("b:last-server-counter")).toBe(bCounter);
    expect(b.profiles.getComputerToken()).toBe("token-b");
  });

  it("connects through a public port after LAN fails and keeps the pairing", async () => {
    const a = await paired("a", "http://192.168.1.2:8787", [
      "http://192.168.1.2:8787",
      "https://example.com:18787",
    ]);
    mocks.fetch.mockImplementation(async (input, init) => {
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer token-a");
      if (String(input).includes("192.168")) throw new Error("offline");
      return Response.json(encryptForMobile(a.server, JSON.stringify(status)));
    });
    const api = await import("./codex-relay-api");
    // Changing the transport invalidates the old callbacks before reconnect.
    await expect(api.getStatus()).rejects.toThrow(/changed/);
    expect((await api.getStatus()).machineName).toBe("Mac");
    expect(a.profiles.getActiveComputer()?.activeUrl).toBe("https://example.com:18787");
    expect(a.profiles.getActiveComputer()?.credentialId).toBe("a");
  });

  it("does not replay a submitted operation after a network failure", async () => {
    const a = await paired("a", "https://example.com");
    mocks.fetch
      .mockResolvedValueOnce(Response.json(encryptForMobile(a.server, JSON.stringify(status))))
      .mockRejectedValueOnce(new Error("connection lost after sending"));
    const api = await import("./codex-relay-api");
    await expect(api.interruptThreadRun("thread-a")).rejects.toThrow(/connection lost/);
    expect(mocks.fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it("rejects plaintext status at a saved address instead of trusting reachability", async () => {
    await paired("a", "https://example.com");
    mocks.fetch.mockResolvedValue(Response.json(status));
    const api = await import("./codex-relay-api");
    await expect(api.getStatus()).rejects.toThrow(/reach/i);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("pairs two independent relay apps and switches LAN/public routes without pairing again", async () => {
    const { createApp } = await import("../../../../packages/codex-relay/src/app");
    const { createTursoPairingSessionStore } =
      await import("../../../../packages/codex-relay/src/pairing-store");
    const api = await import("./codex-relay-api");
    const profiles = await import("./computer-profiles");
    const mobile = await import("./secure-transport");
    async function relay(name: string) {
      const identity = createServerIdentity();
      const app = createApp({
        appServer: null,
        botStorePath: ":memory:",
        workspacePath: `/tmp/${name}`,
        codex: {
          startThread: () => {
            throw new Error("No Codex process is used in this test.");
          },
          resumeThread: () => {
            throw new Error("No Codex process is used in this test.");
          },
        },
        pairing: {
          dangerouslyAutoApprove: true,
          serverIdentity: identity,
          createClientToken: () => `test-token-${name}`,
          hashClientToken: (token) => token,
          sessions: await createTursoPairingSessionStore(":memory:"),
        },
      });
      return { identity, app };
    }
    const a = await relay("mac-a");
    const b = await relay("mac-b");
    let lanAvailable = true;
    mocks.fetch.mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      if (url.hostname === "192.168.1.2" && !lanAvailable) throw new Error("LAN offline");
      const relay = url.hostname === "mac-b.example.com" ? b : a;
      return relay.app.request(new Request(url, init));
    });
    function qr(key: string, urls: string[]) {
      const url = new URL("codex-relay://pair");
      url.searchParams.set("serverPublicKey", key);
      url.searchParams.set("serverUrl", urls[0]!);
      url.searchParams.set("serverUrls", JSON.stringify(urls));
      return url.toString();
    }
    await api.pairWithQrPayload(
      qr(a.identity.publicKey, ["http://192.168.1.2:8787", "https://mac-a.example.com:18787"]),
    );
    const first = profiles.getActiveComputer()!;
    expect((await api.getStatus()).workspacePath).toBe("/tmp/mac-a");
    expect(JSON.parse(mobile.encryptRequestPayload({})).counter).toBe(0);
    await api.pairWithQrPayload(qr(b.identity.publicKey, ["https://mac-b.example.com"]));
    expect((await api.getStatus()).workspacePath).toBe("/tmp/mac-b");
    expect(JSON.parse(mobile.encryptRequestPayload({})).counter).toBe(0);
    profiles.activateComputer(first.id);
    expect(JSON.parse(mobile.encryptRequestPayload({})).counter).toBe(1);
    expect((await api.getStatus()).workspacePath).toBe("/tmp/mac-a");
    lanAvailable = false;
    profiles.setComputerConnectionMode(first.id, "auto");
    await expect(api.getStatus()).rejects.toThrow(/changed/);
    expect((await api.getStatus()).workspacePath).toBe("/tmp/mac-a");
    expect(profiles.getActiveComputer()?.activeUrl).toBe("https://mac-a.example.com:18787");
    expect(profiles.getActiveComputer()?.credentialId).toBe(first.credentialId);
    expect(
      mocks.fetch.mock.calls.filter(([input]) => String(input).endsWith("/v1/pair")),
    ).toHaveLength(2);
  }, 15000);
});
