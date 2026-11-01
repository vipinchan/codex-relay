function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    if (typeof signal.throwIfAborted === "function") {
      signal.throwIfAborted();
    }
    throw new Error("This operation was aborted");
  }
}

type AddressProfile = {
  activeUrl: string;
  addresses: string[];
  connectionMode: "auto" | "manual";
};

export function computerAddressType(address: string) {
  const host = new URL(address).hostname.toLowerCase();
  const octets = host.split(".").map(Number);
  if (host.endsWith(".ts.net") || (octets[0] === 100 && octets[1]! >= 64 && octets[1]! <= 127)) {
    return "Tailscale";
  }
  if (
    host.endsWith(".local") ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    octets[0] === 10 ||
    (octets[0] === 192 && octets[1] === 168) ||
    (octets[0] === 172 && octets[1]! >= 16 && octets[1]! <= 31) ||
    (octets[0] === 169 && octets[1] === 254) ||
    (host.includes(":") && /^\[?(fe80:|fc|fd)/i.test(host))
  )
    return "LAN";
  return "Public";
}

export function orderedComputerAddresses(profile: AddressProfile) {
  if (profile.connectionMode === "manual") return [profile.activeUrl];
  const priority = { LAN: 0, Tailscale: 1, Public: 2 };
  return [...profile.addresses].sort(
    (a, b) =>
      priority[computerAddressType(a)] - priority[computerAddressType(b)] ||
      Number(b === profile.activeUrl) - Number(a === profile.activeUrl),
  );
}

export async function connectComputerAddress(
  profile: AddressProfile,
  probe: (url: string, signal: AbortSignal) => Promise<void>,
  signal?: AbortSignal,
) {
  for (const url of orderedComputerAddresses(profile)) {
    assertNotAborted(signal);
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        probe(url, controller.signal),
        new Promise<never>((_, reject) => {
          const cancel = () => reject(new Error("Connection probe cancelled."));
          controller.signal.addEventListener("abort", cancel, { once: true });
          timer = setTimeout(() => {
            reject(new Error("Connection probe timed out."));
            controller.abort();
          }, 2500);
        }),
      ]);
      assertNotAborted(signal);
      return url;
    } catch {
      assertNotAborted(signal);
    } finally {
      clearTimeout(timer);
      controller.abort();
      signal?.removeEventListener("abort", abort);
    }
  }
  throw new Error("Could not reach this computer at any saved address.");
}
