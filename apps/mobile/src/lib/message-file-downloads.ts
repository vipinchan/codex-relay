import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import type { MessageFileRequest } from "codex-relay/api-schema";
import { Directory, File, Paths } from "expo-file-system";
import { isAvailableAsync, shareAsync } from "expo-sharing";

import { CodexRelayApiError, createMessageFileDownload } from "./codex-relay-api";
import { getActiveComputer } from "./computer-profiles";
import { onConnectionInvalidated } from "./connection-context";
import { MessageFileTransferError, transferMessageFile } from "./message-file-transfer";

type DownloadState =
  | { status: "preparing" }
  | { status: "downloading" | "verifying"; size: number; written: number }
  | { status: "ready"; size: number; file: File; directory: Directory }
  | {
      status: "error";
      code?: string;
      savedBytes?: number;
    };

const states = new Map<string, DownloadState>();
const listeners = new Set<() => void>();
let active: { key: string; controller: AbortController } | undefined;
let initialized = false;

export function subscribeMessageFiles(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function messageFileKey(request: MessageFileRequest) {
  return JSON.stringify([request.source, request.conversationId, request.messageId, request.path]);
}

export function getMessageFileState(key: string) {
  return states.get(key);
}

export function getActiveMessageFile() {
  return active?.key;
}

function publish() {
  for (const listener of listeners) listener();
}

function setState(key: string, state?: DownloadState) {
  states.delete(key);
  if (state) states.set(key, state);
  publish();
}

function removeDirectory(directory?: Directory) {
  try {
    if (directory?.exists) directory.delete();
  } catch {
    return;
  }
}

onConnectionInvalidated(() => {
  active?.controller.abort();
  for (const state of states.values()) {
    if (state.status === "ready") removeDirectory(state.directory);
  }
  states.clear();
  publish();
});

export function cancelMessageFile(key: string) {
  if (active?.key === key) active.controller.abort();
}

export async function downloadMessageFile(request: MessageFileRequest) {
  if (active) return;
  const key = messageFileKey(request);
  const credentialId = getActiveComputer()?.credentialId;
  const job = { key, controller: new AbortController() };
  const previous = states.get(key);
  if (previous?.status === "ready") removeDirectory(previous.directory);
  active = job;
  setState(key, { status: "preparing" });
  let download: ReturnType<typeof createMessageFileDownload> | undefined;
  let temporary: Directory | undefined;
  let readyDirectory: Directory | undefined;
  let savedBytes = previous?.status === "error" ? previous.savedBytes : undefined;
  try {
    download = createMessageFileDownload(job.controller.signal);
    const metadata = await download.prepare(request);
    download.assertActive();
    const root = new Directory(Paths.cache, "message-files");
    if (!initialized) {
      removeDirectory(root);
      initialized = true;
    }
    root.create({ idempotent: true, intermediates: true });
    const partialRoot = new Directory(Paths.cache, "message-file-partials");
    partialRoot.create({ idempotent: true, intermediates: true });
    const identity = JSON.stringify([
      credentialId,
      key,
      metadata.name,
      metadata.size,
      metadata.sha256,
    ]);
    const directory = new Directory(partialRoot, bytesToHex(sha256(utf8ToBytes(identity))));
    temporary = directory;
    for (const entry of partialRoot.list()) {
      if (entry.name !== directory.name) entry.delete();
    }
    directory.create({ idempotent: true, intermediates: true });
    const file = new File(directory, metadata.name);
    if (file.exists && file.size > metadata.size) file.delete();
    if (!file.exists) file.create();
    const handle = file.open();
    try {
      const savedSize = file.size;
      savedBytes = savedSize;
      setState(key, { status: "downloading", size: metadata.size, written: savedSize });
      await transferMessageFile(metadata, {
        read: download.read,
        savedSize,
        readSaved: (length) => handle.readBytes(length),
        write: (bytes) => handle.writeBytes(bytes),
        progress: (written) => {
          savedBytes = written;
          setState(key, { status: "downloading", size: metadata.size, written });
        },
        verifying: () =>
          setState(key, { status: "verifying", size: metadata.size, written: metadata.size }),
        assertActive: download.assertActive,
      });
    } finally {
      handle.close();
    }
    download.assertActive();
    if (file.size !== metadata.size) throw new MessageFileTransferError("download_integrity");
    readyDirectory = new Directory(root, metadata.downloadId);
    readyDirectory.create();
    file.move(new File(readyDirectory, metadata.name));
    const ready = [...states].filter(([, state]) => state.status === "ready");
    for (const [cachedKey, cachedState] of ready.slice(0, Math.max(0, ready.length - 2))) {
      if (cachedState.status === "ready") removeDirectory(cachedState.directory);
      states.delete(cachedKey);
    }
    setState(key, { status: "ready", file, directory: readyDirectory, size: metadata.size });
    readyDirectory = undefined;
  } catch (error) {
    if (active === job) {
      const canResume =
        !job.controller.signal.aborted &&
        error instanceof CodexRelayApiError &&
        error.code !== "file_changed" &&
        error.code !== "file_unavailable";
      if (canResume && savedBytes) temporary = undefined;
      setState(
        key,
        job.controller.signal.aborted
          ? undefined
          : {
              status: "error",
              code:
                error instanceof CodexRelayApiError || error instanceof MessageFileTransferError
                  ? error.code
                  : "download_storage",
              savedBytes: canResume ? savedBytes : undefined,
            },
      );
    }
  } finally {
    download?.close();
    removeDirectory(temporary);
    removeDirectory(readyDirectory);
    if (active === job) {
      active = undefined;
      publish();
    }
  }
}

export async function shareMessageFile(key: string) {
  const state = states.get(key);
  if (state?.status !== "ready") return;
  if (!state.file.exists) {
    removeDirectory(state.directory);
    setState(key, { status: "error", code: "cache_missing" });
    return;
  }
  if (!(await isAvailableAsync())) throw new Error("File sharing is unavailable.");
  if (states.get(key) === state) await shareAsync(state.file.uri);
}
