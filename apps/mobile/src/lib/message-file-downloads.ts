import type { MessageFileRequest } from "codex-relay/api-schema";
import { Directory, File, Paths } from "expo-file-system";
import { isAvailableAsync, shareAsync } from "expo-sharing";

import { CodexRelayApiError, createMessageFileDownload } from "./codex-relay-api";
import { onConnectionInvalidated } from "./connection-context";
import { transferMessageFile } from "./message-file-transfer";

type DownloadState =
  | { status: "preparing" }
  | { status: "downloading" | "verifying"; size: number; written: number }
  | { status: "ready"; size: number; file: File; directory: Directory }
  | { status: "error"; code?: string };

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
  active = undefined;
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
  const job = { key, controller: new AbortController() };
  const previous = states.get(key);
  if (previous?.status === "ready") removeDirectory(previous.directory);
  active = job;
  setState(key, { status: "preparing" });
  const download = createMessageFileDownload(job.controller.signal);
  let temporary: Directory | undefined;
  try {
    const metadata = await download.prepare(request);
    download.assertActive();
    const root = new Directory(Paths.cache, "message-files");
    if (!initialized) {
      removeDirectory(root);
      initialized = true;
    }
    root.create({ idempotent: true, intermediates: true });
    const directory = new Directory(root, metadata.downloadId);
    temporary = directory;
    directory.create();
    const file = new File(directory, metadata.name);
    file.create();
    const handle = file.open();
    try {
      setState(key, { status: "downloading", size: metadata.size, written: 0 });
      await transferMessageFile(metadata, {
        read: (offset) => download.read(metadata.downloadId, offset),
        write: (bytes) => handle.writeBytes(bytes),
        progress: (written) =>
          setState(key, { status: "downloading", size: metadata.size, written }),
        verifying: () =>
          setState(key, { status: "verifying", size: metadata.size, written: metadata.size }),
        assertActive: download.assertActive,
      });
    } finally {
      handle.close();
    }
    download.assertActive();
    if (file.size !== metadata.size) throw new Error("File size check failed.");
    const ready = [...states].filter(([, state]) => state.status === "ready");
    for (const [cachedKey, cachedState] of ready.slice(0, Math.max(0, ready.length - 2))) {
      if (cachedState.status === "ready") removeDirectory(cachedState.directory);
      states.delete(cachedKey);
    }
    temporary = undefined;
    setState(key, { status: "ready", file, directory, size: metadata.size });
  } catch (error) {
    if (active === job) {
      setState(
        key,
        job.controller.signal.aborted
          ? undefined
          : {
              status: "error",
              code: error instanceof CodexRelayApiError ? error.code : undefined,
            },
      );
    }
  } finally {
    download.close();
    removeDirectory(temporary);
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
