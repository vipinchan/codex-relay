import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  readSync,
  renameSync,
  rmSync,
  statSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type {
  MessageFileChunkResponseSchema,
  MessageFileResponseSchema,
} from "codex-relay/api-schema";
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cache: "",
  prepare: vi.fn<() => Promise<ReturnType<typeof MessageFileResponseSchema.parse>>>(),
  read: vi.fn<
    (offset: number) => Promise<ReturnType<typeof MessageFileChunkResponseSchema.parse>>
  >(),
  share: vi.fn<(uri: string) => Promise<void>>(),
}));
vi.mock("expo-file-system", () => {
  class Directory {
    uri: string;
    constructor(parent: Directory | string, name: string) {
      this.uri = join(typeof parent === "string" ? parent : parent.uri, name);
    }
    get exists() {
      return existsSync(this.uri);
    }
    get name() {
      return basename(this.uri);
    }
    create(options?: { intermediates?: boolean }) {
      mkdirSync(this.uri, { recursive: options?.intermediates });
    }
    delete() {
      rmSync(this.uri, { recursive: true });
    }
    list() {
      return readdirSync(this.uri).map((name) => new Directory(this, name));
    }
  }
  return {
    Directory,
    Paths: {
      get cache() {
        return mocks.cache;
      },
    },
    File: class {
      uri: string;
      name: string;
      constructor(parent: Directory, name: string) {
        this.uri = join(parent.uri, name);
        this.name = name;
      }
      get exists() {
        return existsSync(this.uri);
      }
      get size() {
        return this.exists ? statSync(this.uri).size : 0;
      }
      create() {
        closeSync(openSync(this.uri, "wx"));
      }
      delete() {
        rmSync(this.uri);
      }
      move(destination: { uri: string }) {
        renameSync(this.uri, destination.uri);
        this.uri = destination.uri;
      }
      open() {
        const descriptor = openSync(this.uri, "r+");
        return {
          readBytes(length: number) {
            const bytes = Buffer.alloc(length);
            return bytes.subarray(0, readSync(descriptor, bytes, 0, length, null));
          },
          writeBytes(bytes: Uint8Array) {
            writeSync(descriptor, bytes);
          },
          close() {
            closeSync(descriptor);
          },
        };
      }
    },
  };
});
vi.mock("expo-sharing", () => ({ isAvailableAsync: async () => true, shareAsync: mocks.share }));
vi.mock("./computer-profiles", () => ({ getActiveComputer: () => ({ credentialId: "paired" }) }));
vi.mock("./codex-relay-api", () => ({
  CodexRelayApiError: class extends Error {
    code = "download_network";
  },
  createMessageFileDownload: () => ({
    prepare: mocks.prepare,
    read: mocks.read,
    assertActive: () => undefined,
    close: () => undefined,
  }),
}));

it("resumes a failed download after an app restart and shares the verified file", async ({
  onTestFinished,
}) => {
  mocks.cache = mkdtempSync(join(tmpdir(), "relay-mobile-download-"));
  onTestFinished(() => rmSync(mocks.cache, { recursive: true, force: true }));
  const path = process.env.CODEX_RELAY_TEST_IPA;
  const bytes = path ? readFileSync(path) : Buffer.alloc(3 * 1024 * 1024, 19);
  const chunkSize = 512 * 1024;
  const checkpoint = 2 * chunkSize;
  const request = {
    source: "session" as const,
    conversationId: "thread",
    messageId: "reply",
    path: "./build.ipa",
  };
  const { CodexRelayApiError } = await import("./codex-relay-api");
  mocks.prepare.mockImplementation(async () => ({
    name: "build.ipa",
    downloadId: randomUUID(),
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  }));
  const read = async (offset: number) => {
    const part = bytes.subarray(offset, offset + chunkSize);
    return { offset, nextOffset: offset + part.length, data: part.toString("base64") };
  };
  mocks.read.mockImplementation(async (offset: number) => {
    if (offset >= checkpoint) throw new CodexRelayApiError("Offline", 0, "download_network");
    return read(offset);
  });
  const beforeRestart = await import("./message-file-downloads");
  const key = beforeRestart.messageFileKey(request);
  await beforeRestart.downloadMessageFile(request);
  expect(beforeRestart.getMessageFileState(key)?.status).toBe("error");

  vi.resetModules();
  mocks.read.mockClear().mockImplementation(read);
  const afterRestart = await import("./message-file-downloads");
  await afterRestart.downloadMessageFile(request);
  expect(mocks.read).toHaveBeenNthCalledWith(1, checkpoint);
  expect(afterRestart.getMessageFileState(key)?.status).toBe("ready");
  await afterRestart.shareMessageFile(key);
  expect(readFileSync(mocks.share.mock.calls[0]![0]).equals(bytes)).toBe(true);
});
