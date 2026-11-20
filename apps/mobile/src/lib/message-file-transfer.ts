import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { toByteArray } from "base64-js";

type FileTransfer = {
  read: (offset: number) => Promise<{ data: string; offset: number; nextOffset: number }>;
  write: (bytes: Uint8Array) => void | Promise<void>;
  progress: (written: number) => void;
  verifying: () => void;
  assertActive: () => void;
  savedSize?: number;
  readSaved?: (length: number) => Uint8Array;
};

export class MessageFileTransferError extends Error {
  constructor(readonly code: "download_integrity" | "download_chunk") {
    super(code === "download_integrity" ? "File integrity check failed." : "Invalid file chunk.");
  }
}

export async function transferMessageFile(
  metadata: { size: number; sha256: string },
  transfer: FileTransfer,
) {
  const hash = sha256.create();
  let written = 0;
  const savedSize = transfer.savedSize ?? 0;
  if (savedSize < 0 || savedSize > metadata.size || (savedSize > 0 && !transfer.readSaved)) {
    throw new Error("Invalid saved file.");
  }
  while (written < savedSize) {
    transfer.assertActive();
    const bytes = transfer.readSaved!(Math.min(256 * 1024, savedSize - written));
    if (!bytes.length || bytes.length > savedSize - written) throw new Error("Invalid saved file.");
    hash.update(bytes);
    written += bytes.length;
  }
  if (written) transfer.progress(written);
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
      throw new MessageFileTransferError("download_chunk");
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
    throw new MessageFileTransferError("download_integrity");
  }
}
