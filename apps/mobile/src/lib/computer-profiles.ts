import { createMMKV } from "react-native-mmkv";
import { invalidateConnection } from "./connection-context";

export type ComputerProfile = {
  id: string;
  name: string;
  customName?: boolean;
  serverPublicKey?: string;
  credentialId: string;
  pairingIdentity: string;
  addresses: string[];
  activeUrl: string;
  connectionMode: "auto" | "manual";
};

type Profiles = {
  version: 1;
  computers: ComputerProfile[];
  activeComputerId?: string;
  legacyNotificationRoutingDisabled?: boolean;
};
const storage = createMMKV({ id: "codex-relay-computers" });
const credentials = createMMKV({ id: "codex-relay-credentials" });
const legacy = createMMKV({ id: "codex-relay" });
const secure = createMMKV({ id: "codex-relay-secure" });
const storageKey = "profiles-v1";
const listeners = new Set<() => void>();
const switching = new Set<(previous?: ComputerProfile, next?: ComputerProfile) => void>();
let state: Profiles | undefined;

export function createComputerId() {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function normalizeComputerAddress(value: string) {
  const url = new URL(value.trim());
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    ["0.0.0.0", "[::]"].includes(url.hostname) ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "Use a complete http:// or https:// server address without credentials or a query.",
    );
  }
  return url.toString().replace(/\/$/, "");
}

function validAddresses(values: string[]) {
  return [
    ...new Set(
      values.flatMap((value) => {
        try {
          return [normalizeComputerAddress(value)];
        } catch {
          return [];
        }
      }),
    ),
  ];
}

function readState(): Profiles {
  if (state) return state;
  const stored = storage.getString(storageKey);
  if (stored) {
    const parsed: unknown = JSON.parse(stored);
    if (
      typeof parsed !== "object" ||
      !parsed ||
      !("version" in parsed) ||
      parsed.version !== 1 ||
      !("computers" in parsed) ||
      !Array.isArray(parsed.computers)
    ) {
      throw new Error("Saved computer profiles could not be read.");
    }
    state = parsed as Profiles;
    return state;
  }
  const token = legacy.getString("codex-relay.client-token");
  const url = legacy.getString("codex-relay.server-url");
  const initial: Profiles = { version: 1, computers: [] };
  if (token && url) {
    // Deterministic IDs make an interrupted first migration safe to retry.
    const id = "legacy-computer";
    const credentialId = "legacy-pairing";
    const addresses = validAddresses([url, ...readLegacyAddresses()]);
    if (!addresses.length) throw new Error("The existing relay address is invalid.");
    const profile: ComputerProfile = {
      id,
      credentialId,
      pairingIdentity: legacy.getString("codex-relay.pairing-identity") ?? id,
      name: "My computer",
      activeUrl: addresses[0]!,
      addresses,
      connectionMode: "auto",
    };
    credentials.set(credentialId, token);
    for (const key of [
      "key-epoch",
      "mobile-to-server-key",
      "server-to-mobile-key",
      "next-mobile-counter",
      "last-server-counter",
      "server-replay-window",
    ]) {
      const number = key.includes("counter") || key === "key-epoch";
      const value = number ? secure.getNumber(key) : secure.getString(key);
      if (value !== undefined) {
        const scopedKey = `${credentialId}:${key}`;
        const existing = number ? secure.getNumber(scopedKey) : undefined;
        secure.set(scopedKey, typeof value === "number" ? Math.max(existing ?? 0, value) : value);
      }
    }
    if (credentials.getString(credentialId) !== token) {
      throw new Error("The existing pairing could not be migrated.");
    }
    initial.computers.push(profile);
    initial.activeComputerId = id;
  }
  // This single record is the migration commit marker. Legacy keys are retained
  // until the new record exists, and are never used again after it is written.
  const serialized = JSON.stringify(initial);
  storage.set(storageKey, serialized);
  if (storage.getString(storageKey) !== serialized)
    throw new Error("Could not save computer profiles.");
  if (initial.computers.length) {
    for (const key of [
      "codex-relay.client-token",
      "codex-relay.pairing-identity",
      "codex-relay.client-token-expires-at",
    ])
      legacy.remove(key);
    for (const key of [
      "key-epoch",
      "mobile-to-server-key",
      "server-to-mobile-key",
      "next-mobile-counter",
      "last-server-counter",
      "server-replay-window",
    ])
      secure.remove(key);
  }
  state = initial;
  return state;
}

function readLegacyAddresses(): string[] {
  try {
    const value: unknown = JSON.parse(
      legacy.getString("codex-relay.server-url-candidates") ?? "[]",
    );
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function getComputers() {
  return readState().computers;
}
export function getActiveComputer() {
  const current = readState();
  return current.computers.find((computer) => computer.id === current.activeComputerId);
}
export function getComputerToken(profile = getActiveComputer()) {
  return profile ? credentials.getString(profile.credentialId) : undefined;
}
export function subscribeComputerProfiles(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function onComputerSwitch(
  listener: (previous?: ComputerProfile, next?: ComputerProfile) => void,
) {
  switching.add(listener);
  return () => {
    switching.delete(listener);
  };
}

function save(next: Profiles, connectionChanged = false) {
  const previous = getActiveComputer();
  const selected = next.computers.find((c) => c.id === next.activeComputerId);
  storage.set(storageKey, JSON.stringify(next));
  state = next;
  if (connectionChanged) {
    const switchListeners = Array.from(switching);
    for (const listener of switchListeners) listener(previous, selected);
  }
  if (connectionChanged) invalidateConnection();
  const subscribers = Array.from(listeners);
  for (const listener of subscribers) listener();
}

export function getComputerProfilesSnapshot() {
  return readState();
}

export function activateComputer(id: string | undefined) {
  const current = readState();
  if (id && !current.computers.some((computer) => computer.id === id)) {
    throw new Error("This computer is no longer saved.");
  }
  if (current.activeComputerId !== id) save({ ...current, activeComputerId: id }, true);
}

export function savePairedComputer(input: {
  serverPublicKey: string;
  clientToken: string;
  credentialId: string;
  serverUrl: string;
  serverUrls: string[];
  replaceComputerId?: string;
}) {
  const current = readState();
  const existing =
    current.computers.find((c) => c.serverPublicKey === input.serverPublicKey) ??
    current.computers.find((c) => c.id === input.replaceComputerId && !c.serverPublicKey);
  const addresses = validAddresses([
    input.serverUrl,
    ...input.serverUrls,
    ...(existing?.addresses ?? []),
  ]);
  const profile: ComputerProfile = {
    id: existing?.id ?? createComputerId(),
    name: existing?.name ?? new URL(input.serverUrl).hostname,
    customName: existing?.customName,
    serverPublicKey: input.serverPublicKey,
    credentialId: input.credentialId,
    pairingIdentity: createComputerId(),
    addresses,
    activeUrl: normalizeComputerAddress(input.serverUrl),
    connectionMode: existing?.connectionMode ?? "auto",
  };
  credentials.set(input.credentialId, input.clientToken);
  try {
    save(
      {
        ...current,
        activeComputerId: profile.id,
        legacyNotificationRoutingDisabled:
          current.legacyNotificationRoutingDisabled ||
          current.computers.some((c) => c.id !== profile.id),
        computers: existing
          ? current.computers.map((c) => (c.id === existing.id ? profile : c))
          : [...current.computers, profile],
      },
      true,
    );
  } catch (error) {
    if (getActiveComputer()?.credentialId !== profile.credentialId)
      credentials.remove(profile.credentialId);
    throw error;
  }
  if (existing && existing.credentialId !== profile.credentialId) deleteCredentials(existing);
  return profile;
}

function updateComputer(
  id: string,
  change: (profile: ComputerProfile) => ComputerProfile,
  reconnect = false,
) {
  const current = readState();
  save(
    { ...current, computers: current.computers.map((c) => (c.id === id ? change(c) : c)) },
    reconnect && current.activeComputerId === id,
  );
}
export function renameComputer(id: string, name: string) {
  if (!name.trim()) throw new Error("Enter a computer name.");
  updateComputer(id, (c) => ({ ...c, name: name.trim(), customName: true }));
}
export function updateComputerMachineName(name: string) {
  const active = getActiveComputer();
  if (active && !active.customName && active.name !== name) {
    updateComputer(active.id, (c) => ({ ...c, name }));
  }
}
export function addComputerAddress(id: string, value: string) {
  const url = normalizeComputerAddress(value);
  updateComputer(id, (c) => ({ ...c, addresses: validAddresses([...c.addresses, url]) }));
}
export function replaceComputerAddress(id: string, previous: string, value: string) {
  const url = normalizeComputerAddress(value);
  const selected = getComputers().find((c) => c.id === id)?.activeUrl === previous;
  updateComputer(
    id,
    (c) => ({
      ...c,
      addresses: validAddresses(
        c.addresses.map((address) => (address === previous ? url : address)),
      ),
      activeUrl: c.activeUrl === previous ? url : c.activeUrl,
    }),
    selected && previous !== url,
  );
}
export function removeComputerAddress(id: string, url: string) {
  updateComputer(
    id,
    (c) => {
      const addresses = c.addresses.filter((address) => address !== url);
      if (!addresses.length)
        throw new Error("Add another address before removing the last address.");
      return {
        ...c,
        addresses,
        activeUrl: addresses.includes(c.activeUrl) ? c.activeUrl : addresses[0]!,
      };
    },
    getComputers().find((c) => c.id === id)?.activeUrl === url,
  );
}
export function setComputerConnectionMode(id: string, mode: "auto" | "manual", url?: string) {
  updateComputer(
    id,
    (c) => {
      if (url && !c.addresses.includes(url)) throw new Error("This address is not saved.");
      return { ...c, connectionMode: mode, activeUrl: url ?? c.activeUrl };
    },
    true,
  );
}
export function rememberComputerAddress(id: string, url: string) {
  updateComputer(id, (c) => ({ ...c, activeUrl: normalizeComputerAddress(url) }));
}
export function saveComputerAddresses(urls: string[]) {
  const active = getActiveComputer();
  if (active)
    updateComputer(active.id, (c) => ({
      ...c,
      addresses: validAddresses([c.activeUrl, ...urls]),
    }));
}
function deleteCredentials(profile: ComputerProfile) {
  credentials.remove(profile.credentialId);
  for (const key of secure.getAllKeys()) {
    if (key.startsWith(`${profile.credentialId}:`)) secure.remove(key);
  }
}
export function removeComputer(id: string) {
  const current = readState();
  const profile = current.computers.find((c) => c.id === id);
  if (!profile) return;
  save(
    {
      ...current,
      computers: current.computers.filter((c) => c.id !== id),
      activeComputerId: current.activeComputerId === id ? undefined : current.activeComputerId,
    },
    current.activeComputerId === id,
  );
  deleteCredentials(profile);
  legacy.remove(`codex-relay.initial-push-notification-registration-completed:${id}`);
  legacy.remove(`codex-relay.client-session-id:${id}`);
  const botSubmissions = createMMKV({ id: "codex-relay-bot-submissions" });
  const prefix = `bot:[${JSON.stringify(profile.pairingIdentity)},`;
  for (const key of botSubmissions.getAllKeys())
    if (key.startsWith(prefix)) botSubmissions.remove(key);
}

export function canRouteLegacyNotification() {
  return getComputers().length === 1 && !readState().legacyNotificationRoutingDisabled;
}
