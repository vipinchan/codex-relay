import { describe, expect, it, vi } from "vitest";
import { connectComputerAddress, orderedComputerAddresses } from "./computer-addresses";

const profile = {
  activeUrl: "https://example.com",
  addresses: ["https://example.com", "http://100.70.0.2:8787", "http://192.168.1.2:8787"],
  connectionMode: "auto" as "auto" | "manual",
};
describe("computer address selection", () => {
  it("prefers LAN, then Tailscale, then public endpoints", () => {
    expect(orderedComputerAddresses(profile)).toEqual([...profile.addresses].reverse());
  });
  it("falls back when LAN is unreachable without changing ports", async () => {
    const probe = vi.fn<(url: string) => Promise<void>>(async (url: string) => {
      if (!url.startsWith("https:")) throw new Error("offline");
    });
    expect(await connectComputerAddress(profile, probe)).toBe("https://example.com");
    expect(probe).toHaveBeenCalledTimes(3);
  });
  it("never falls back from a manually fixed address", async () => {
    const probe = vi.fn<() => Promise<void>>(async () => {
      throw new Error("offline");
    });
    await expect(
      connectComputerAddress({ ...profile, connectionMode: "manual" }, probe),
    ).rejects.toThrow(/reach/i);
    expect(probe).toHaveBeenCalledTimes(1);
  });
  it("does not continue to another endpoint after cancellation", async () => {
    const controller = new AbortController();
    const probe = vi.fn<() => Promise<void>>(async () => {
      controller.abort();
      throw new Error("offline");
    });
    await expect(connectComputerAddress(profile, probe, controller.signal)).rejects.toThrow(
      /aborted|cancelled/,
    );
    expect(probe).toHaveBeenCalledTimes(1);
  });
});
