import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve } from "node:path";

import {
  messageFileChunkSize,
  messageFileLinkPath,
  messageFileSizeLimit,
  messageMarkdownLinks,
  stagedMessageFilePath,
} from "./api-schema.js";

type DeliveredMessage = { id: string; role: string; content: string };
export type DeliveredFileInput = {
  workspace: string;
  staging?: string;
  message: DeliveredMessage;
  path: string;
};
type FileIdentity = {
  device: number;
  inode: number;
  size: number;
  modified: number;
  changed: number;
};
export type DeliveredFileMetadata = {
  name: string;
  size: number;
  sha256: string;
  identity: FileIdentity;
};

export class DeliveredFileTooLargeError extends Error {
  constructor() {
    super("File exceeds the 200 MB limit.");
  }
}

function identity(stat: {
  dev: number;
  ino: number;
  size: number;
  mtimeMs: number;
  ctimeMs: number;
}): FileIdentity {
  return {
    device: stat.dev,
    inode: stat.ino,
    size: stat.size,
    modified: stat.mtimeMs,
    changed: stat.ctimeMs,
  };
}

function sameIdentity(left: FileIdentity, right: FileIdentity) {
  return (
    left.device === right.device &&
    left.inode === right.inode &&
    left.size === right.size &&
    left.modified === right.modified &&
    left.changed === right.changed
  );
}

async function openDeliveredFile(input: DeliveredFileInput) {
  if (
    input.message.role !== "assistant" ||
    !messageMarkdownLinks(input.message.content).some(
      (link) => messageFileLinkPath(link) === input.path,
    )
  ) {
    throw new Error("File was not explicitly delivered in this assistant message.");
  }
  return openFile(input);
}

async function openFile(input: Pick<DeliveredFileInput, "workspace" | "staging" | "path">) {
  const staged = stagedMessageFilePath(input.path);
  if (input.path.startsWith("relay-file:") && (!staged || !input.staging)) {
    throw new Error("Invalid staged file reference.");
  }
  const workspace = await realpath(input.workspace);
  const root = staged ? await realpath(input.staging!) : workspace;
  const workspaceRelative = relative(
    resolve(input.workspace),
    resolve(input.workspace, input.path),
  );
  const path = staged ? resolve(root, staged) : resolve(workspace, workspaceRelative);
  const inside = relative(root, path);
  if (!inside || isAbsolute(inside) || inside.split(/[\\/]/).some((part) => part.startsWith("."))) {
    throw new Error("File paths must remain inside the workspace or delivery directory.");
  }
  const pathStat = await lstat(path);
  if (pathStat.isSymbolicLink()) throw new Error("Symbolic links cannot be downloaded.");
  if (!pathStat.isFile()) throw new Error("Only regular files can be downloaded.");
  const canonical = await realpath(path);
  if (canonical !== path || (staged && (await lstat(input.staging!)).isSymbolicLink())) {
    throw new Error("File paths must remain inside the workspace or delivery directory.");
  }
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const fileStat = await handle.stat();
    if (!sameIdentity(identity(pathStat), identity(fileStat)) || (await realpath(path)) !== path)
      throw new Error("File changed while opening.");
    if (fileStat.size > messageFileSizeLimit) throw new DeliveredFileTooLargeError();
    return { handle, fileStat, path: canonical };
  } catch (error) {
    await handle.close();
    throw error;
  }
}

export async function deliveredFileMetadata(
  input: DeliveredFileInput,
): Promise<DeliveredFileMetadata> {
  const { handle, fileStat, path } = await openDeliveredFile(input);
  try {
    const hash = createHash("sha256");
    const buffer = Buffer.alloc(messageFileChunkSize);
    for (let offset = 0; offset < fileStat.size; ) {
      const { bytesRead } = await handle.read(
        buffer,
        0,
        Math.min(buffer.length, fileStat.size - offset),
        offset,
      );
      if (!bytesRead) throw new Error("File changed while reading.");
      hash.update(buffer.subarray(0, bytesRead));
      offset += bytesRead;
    }
    if (!sameIdentity(identity(fileStat), identity(await handle.stat())))
      throw new Error("File changed while reading.");
    return {
      name: basename(path),
      size: fileStat.size,
      sha256: hash.digest("hex"),
      identity: identity(fileStat),
    };
  } finally {
    await handle.close();
  }
}

export async function readDeliveredFileChunk(
  input: Pick<DeliveredFileInput, "workspace" | "staging" | "path"> & {
    message?: DeliveredMessage;
    metadata: DeliveredFileMetadata;
    offset: number;
  },
) {
  if (!Number.isSafeInteger(input.offset) || input.offset < 0)
    throw new Error("Invalid file offset.");
  const { handle, fileStat } = await openFile(input);
  try {
    if (
      !sameIdentity(identity(fileStat), input.metadata.identity) ||
      input.offset > fileStat.size
    ) {
      throw new Error("File changed since download started.");
    }
    const buffer = Buffer.alloc(Math.min(messageFileChunkSize, fileStat.size - input.offset));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, input.offset);
    if (
      bytesRead !== buffer.length ||
      !sameIdentity(identity(fileStat), identity(await handle.stat()))
    ) {
      throw new Error("File changed while reading.");
    }
    return {
      data: buffer.toString("base64"),
      offset: input.offset,
      nextOffset: input.offset + bytesRead,
    };
  } finally {
    await handle.close();
  }
}
