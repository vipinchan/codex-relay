import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { fromByteArray } from "base64-js";
import { expect, it, vi } from "vitest";

import { transferMessageFile } from "./message-file-transfer";

const bytes = Uint8Array.of(1, 2, 3, 4);
const metadata = { size: bytes.length, sha256: bytesToHex(sha256(bytes)) };

it("reports bytes only after writing each chunk and verifies the complete file", async () => {
  const events: string[] = [];
  await transferMessageFile(metadata, {
    read: async (offset) => ({
      offset,
      nextOffset: offset + 2,
      data: fromByteArray(bytes.slice(offset, offset + 2)),
    }),
    write: async (part) => {
      events.push(`write:${part[0]}`);
    },
    progress: (written) => events.push(`progress:${written}`),
    verifying: () => events.push("verify"),
    assertActive: () => undefined,
  });
  expect(events).toEqual(["write:1", "progress:2", "write:3", "progress:4", "verify"]);
});

it("rejects corruption and refuses to write a response received after cancellation", async () => {
  const write = vi.fn<(bytes: Uint8Array) => void>();
  const transfer = {
    read: async () => ({ offset: 0, nextOffset: 4, data: "AAAAAA==" }),
    write,
    progress: vi.fn<(written: number) => void>(),
    verifying: vi.fn<() => void>(),
    assertActive: vi.fn<() => void>(),
  };
  await expect(transferMessageFile(metadata, transfer)).rejects.toThrow("integrity");
  write.mockClear();
  transfer.assertActive
    .mockImplementationOnce(() => undefined)
    .mockImplementation(() => {
      throw new Error("Cancelled");
    });
  await expect(transferMessageFile(metadata, transfer)).rejects.toThrow("Cancelled");
  expect(write).not.toHaveBeenCalled();
});
