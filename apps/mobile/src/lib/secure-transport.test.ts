import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSecurePairing,
  createServerIdentity,
  encryptForMobile,
  type SecureSession,
} from "../../../../packages/codex-relay/src/secure-transport";

const values = vi.hoisted(() => new Map<string, string | number>());
vi.mock("react-native-get-random-values", () => ({}));
vi.mock("react-native-mmkv", () => ({
  createMMKV: () => ({
    getString: (key: string) => values.get(key),
    getNumber: (key: string) => values.get(key),
    set: (key: string, value: string | number) => values.set(key, value),
    clearAll: () => values.clear(),
  }),
}));

const key = new Uint8Array(32).fill(7);
let server: SecureSession;

async function client() {
  return import("./secure-transport");
}

function response(payload: unknown = { ok: true }) {
  return encryptForMobile(server, JSON.stringify(payload));
}

beforeEach(() => {
  vi.resetModules();
  values.clear();
  const encodedKey = Buffer.from(key).toString("base64");
  values.set("key-epoch", 1);
  values.set("mobile-to-server-key", encodedKey);
  values.set("server-to-mobile-key", encodedKey);
  values.set("last-server-counter", 0);
  server = {
    keyEpoch: 1,
    mobileToServerKey: key,
    serverToMobileKey: key,
    lastMobileCounter: 0,
    nextServerCounter: 1,
  };
});

describe("encrypted response delivery", () => {
  it("loads a large conversation after later health responses arrive first", async () => {
    const { decryptResponsePayload } = await client();
    const history = { messages: [{ content: "long history ".repeat(100_000) }] };
    const slow = response(history);
    const health = response();
    expect(decryptResponsePayload(health)).toEqual({ ok: true });
    expect(decryptResponsePayload(slow)).toEqual(history);
  });

  it("accepts unseen out-of-order counters and rejects duplicates after reload", async () => {
    const { decryptResponsePayload } = await client();
    const responses = Array.from({ length: 4 }, (_, i) => response({ i }));
    for (const i of [3, 1, 2, 0]) {
      expect(decryptResponsePayload(responses[i])).toEqual({ i });
    }
    vi.resetModules();
    const reloaded = await client();
    for (const envelope of responses) {
      expect(() => reloaded.decryptResponsePayload(envelope)).toThrow("invalid encrypted payload");
    }
  });

  it("does not consume a counter when authentication fails", async () => {
    const { decryptResponsePayload } = await client();
    const valid = response();
    const bytes = Buffer.from(valid.ciphertext, "base64");
    bytes[0] ^= 1;
    expect(() =>
      decryptResponsePayload({ ...valid, ciphertext: bytes.toString("base64") }),
    ).toThrow(/tag/);
    expect(decryptResponsePayload(valid)).toEqual({ ok: true });
  });

  it("does not consume a counter when authenticated JSON is invalid", async () => {
    const { decryptResponsePayload } = await client();
    expect(() => decryptResponsePayload(encryptForMobile(server, "invalid JSON"))).toThrow(
      SyntaxError,
    );
    expect(values.get("last-server-counter")).toBe(0);
  });

  it("preserves unseen counters across a module reload", async () => {
    const { decryptResponsePayload } = await client();
    const slow = response();
    expect(decryptResponsePayload(response())).toEqual({ ok: true });
    vi.resetModules();
    expect((await client()).decryptResponsePayload(slow)).toEqual({ ok: true });
  });

  it("resets the replay window when pairing again with the same epoch", async () => {
    const mobile = await client();
    server.nextServerCounter = 20;
    mobile.decryptResponsePayload(response());
    const identity = createServerIdentity();
    const attempt = mobile.createSecurePairingAttempt({
      serverPublicKey: identity.publicKey,
      serverUrl: "http://localhost:8787",
    });
    const paired = createSecurePairing({
      clientEphemeralPublicKey: attempt.clientEphemeralPublicKey,
      clientNonce: attempt.clientNonce,
      clientToken: "test-token",
      clientTokenExpiresAt: "2027-01-01T00:00:00.000Z",
      keyEpoch: 1,
      approvalCode: "",
      serverIdentity: identity,
      serverUrl: attempt.serverUrl,
    });
    mobile.completeSecurePairing(attempt, { secure: paired.response } as Parameters<
      typeof mobile.completeSecurePairing
    >[1]);
    expect(mobile.decryptResponsePayload(encryptForMobile(paired.session, '{"ok":true}'))).toEqual({
      ok: true,
    });
  });

  it("rejects the wrong sender or key epoch without consuming the response", async () => {
    const { decryptResponsePayload } = await client();
    const valid = response();
    expect(() => decryptResponsePayload({ ...valid, sender: "mobile" })).toThrow(
      /invalid encrypted payload/,
    );
    expect(() => decryptResponsePayload({ ...valid, keyEpoch: 2 })).toThrow(
      /invalid encrypted payload/,
    );
    expect(decryptResponsePayload(valid)).toEqual({ ok: true });
  });

  it("preserves the legacy high water mark when upgrading stored sessions", async () => {
    values.set("last-server-counter", 10);
    const { decryptResponsePayload } = await client();
    server.nextServerCounter = 10;
    const old = response();
    const slow = response();
    const fast = response();
    expect(decryptResponsePayload(fast)).toEqual({ ok: true });
    expect(decryptResponsePayload(slow)).toEqual({ ok: true });
    expect(() => decryptResponsePayload(old)).toThrow(/invalid encrypted payload/);
  });

  it("rejects counters outside the bounded window while accepting its oldest unseen counter", async () => {
    const { decryptResponsePayload } = await client();
    const expired = response();
    const oldest = response();
    server.nextServerCounter = 4097;
    expect(decryptResponsePayload(response())).toEqual({ ok: true });
    expect(() => decryptResponsePayload(expired)).toThrow(/invalid encrypted payload/);
    expect(decryptResponsePayload(oldest)).toEqual({ ok: true });
  });
});
