import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { toByteArray } from "base64-js";

type FileTransfer = {
  read: (offset: number) => Promise<{ data: string; offset: number; nextOffset: number }>;
  write: (bytes: Uint8Array) => void | Promise<void>;
  progress: (written: number) => void;
  verifying: () => void;
  assertActive: () => void;
};

export async function transferMessageFile(
  metadata: { size: number; sha256: string },
  transfer: FileTransfer,
) {
  const hash = sha256.create();
  let written = 0;
  while (written < metadata.size) {
    transfer.assertActive();
    const chunk = await transfer.read(written);
    transfer.assertActive();
    const bytes = toByteArray(chunk.data);
    if (
      chunk.offset !== written ||
      !bytes.length ||
      chunk.nextOffset !== written + bytes.length ||
      chunk.nextOffset > metadata.size
    ) {
      throw new Error("Invalid file chunk.");
    }
    await transfer.write(bytes);
    transfer.assertActive();
    hash.update(bytes);
    written += bytes.length;
    transfer.progress(written);
  }
  transfer.assertActive();
  transfer.verifying();
  if (bytesToHex(hash.digest()) !== metadata.sha256) {
    throw new Error("File integrity check failed.");
  }
}
