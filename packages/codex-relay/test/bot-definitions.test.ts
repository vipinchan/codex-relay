import {
  access,
  mkdir,
  mkdtemp,
  open,
  readFile,
  rename,
  rm,
  symlink,
  truncate,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, expect, test } from "vitest";

import { BotSchema } from "../src/api-schema.js";
import {
  createBotDefinitionStore,
  DefinitionConflictError,
  DefinitionValidationError,
  validateBotDefinitionDraft,
} from "../src/bot-definitions.js";

const temporaryPaths: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function fixture() {
  const path = await mkdtemp(join(tmpdir(), "codex-relay-bot-definition-"));
  temporaryPaths.push(path);
  const bot = BotSchema.parse({
    id: "a30f4aaf-5888-44e0-9c25-d2a87229ef95",
    name: "Research",
    color: "#123456",
    instructions: "Research carefully.",
    runtimeMode: "default",
    createdAt: "2026-10-17T00:00:00.000Z",
    updatedAt: "2026-10-17T00:00:00.000Z",
    deletedAt: null,
  });
  return { bot, store: createBotDefinitionStore(join(path, "definitions")) };
}

test("Mac file edits become the next valid BOT definition and preserve capability preferences", async () => {
  const { bot, store } = await fixture();
  const initial = await store.read(bot);
  expect(initial.status).toBe("valid");
  expect(initial.definition.name).toBe("Research");

  const external = {
    ...initial.definition,
    instructions: "Focus on scientific papers.",
    preferredSkills: ["arxiv"],
    preferredPlugins: ["research@marketplace"],
  };
  await writeFile(initial.path, `${JSON.stringify(external, null, 2)}\n`, "utf8");
  const updated = await store.read(bot);
  expect(updated.revision).not.toBe(initial.revision);
  expect(updated.definition).toMatchObject(external);
});

test("invalid Mac edits retain the last valid definition until the file is repaired", async () => {
  const { bot, store } = await fixture();
  const initial = await store.read(bot);
  await writeFile(initial.path, '{"schemaVersion":1,"botId":"wrong"}', "utf8");

  const invalid = await store.read(bot);
  expect(invalid.status).toBe("invalid");
  expect(invalid.definition).toEqual(initial.definition);
  expect(invalid.error).toMatch(/BOT definition/i);
  await expect(store.update(bot, { name: "Changed" }, invalid.revision)).rejects.toBeInstanceOf(
    DefinitionValidationError,
  );

  const repaired = await store.write(
    bot,
    JSON.stringify({ ...initial.definition, name: "Repaired" }),
    invalid.revision,
  );
  expect(repaired.status).toBe("valid");
  expect(repaired.definition.name).toBe("Repaired");
});

test("a stale phone revision cannot overwrite a newer Mac edit", async () => {
  const { bot, store } = await fixture();
  const initial = await store.read(bot);
  await writeFile(
    initial.path,
    JSON.stringify({ ...initial.definition, name: "Mac edit" }),
    "utf8",
  );

  await expect(store.update(bot, { name: "Phone edit" }, initial.revision)).rejects.toBeInstanceOf(
    DefinitionConflictError,
  );
  expect(JSON.parse(await readFile(initial.path, "utf8")).name).toBe("Mac edit");
});

test("Unicode capability preferences exceeding the byte limit cannot replace a valid file", async () => {
  const { bot, store } = await fixture();
  const initial = await store.read(bot);
  const capabilities = Array.from(
    { length: 70 },
    (_, index) => `capability-${index}-${"界".repeat(400)}`,
  );
  const patch = { preferredSkills: capabilities, preferredPlugins: capabilities };
  const raw = JSON.stringify({ ...initial.definition, ...patch });
  expect(raw.length).toBeLessThan(128_000);
  expect(Buffer.byteLength(raw, "utf8")).toBeGreaterThan(128_000);

  await expect(store.write(bot, raw, initial.revision)).rejects.toThrow(/128,000-byte/);
  await expect(store.update(bot, patch, initial.revision)).rejects.toThrow(/128,000-byte/);
  const after = await store.read(bot);
  expect(after.status).toBe("valid");
  expect(after.revision).toBe(initial.revision);
  expect(await readFile(initial.path, "utf8")).toBe(initial.content);
});

test("oversized files edited on the Mac report invalid status and retain the last valid profile", async () => {
  const { bot, store } = await fixture();
  const initial = await store.read(bot);
  await writeFile(initial.path, "界".repeat(50_000), "utf8");

  const invalid = await store.read(bot);
  expect(invalid.status).toBe("invalid");
  expect(invalid.error).toMatch(/128,000-byte/);
  expect(invalid.definition).toEqual(initial.definition);
  expect(invalid.revision).toMatch(/^[0-9a-f]{64}$/);
  expect(Buffer.byteLength(invalid.content, "utf8")).toBeLessThanOrEqual(128_002);

  const repaired = await store.write(bot, JSON.stringify(initial.definition), invalid.revision);
  expect(repaired.status).toBe("valid");
  expect(repaired.definition).toEqual(initial.definition);
});

test("a giant sparse file has a bounded preview and an opaque revision that detects tail edits", async () => {
  const { bot, store } = await fixture();
  const initial = await store.read(bot);
  const sparseSize = 8 * 1024 * 1024 * 1024;
  await truncate(initial.path, sparseSize);
  const oversized = await store.read(bot);
  expect(oversized.status).toBe("invalid");
  expect(oversized.revision).toMatch(/^[0-9a-f]{64}$/);
  expect(Buffer.byteLength(oversized.content, "utf8")).toBeLessThanOrEqual(128_002);

  const handle = await open(initial.path, "r+");
  try {
    await handle.write(Buffer.from("x"), 0, 1, sparseSize - 1);
  } finally {
    await handle.close();
  }
  const changed = await store.read(bot);
  expect(changed.revision).not.toBe(oversized.revision);
  await expect(
    store.write(bot, JSON.stringify(initial.definition), oversized.revision),
  ).rejects.toBeInstanceOf(DefinitionConflictError);
  const repaired = await store.write(bot, JSON.stringify(initial.definition), changed.revision);
  expect(repaired.status).toBe("valid");
}, 5_000);

test("an oversized initial profile is rejected without creating an unreadable file", async () => {
  const { bot, store } = await fixture();
  const capabilities = Array.from(
    { length: 70 },
    (_, index) => `capability-${index}-${"界".repeat(400)}`,
  );
  await expect(
    store.read({ ...bot, preferredSkills: capabilities, preferredPlugins: capabilities }),
  ).rejects.toThrow(/128,000-byte/);
  await expect(access(store.pathFor(bot.id))).rejects.toMatchObject({ code: "ENOENT" });
});

test("creation validates serialized bytes before a BOT database row is inserted", async () => {
  const { bot } = await fixture();
  const capabilities = Array.from(
    { length: 70 },
    (_, index) => `capability-${index}-${"界".repeat(400)}`,
  );
  expect(() =>
    validateBotDefinitionDraft({
      ...bot,
      preferredSkills: capabilities,
      preferredPlugins: capabilities,
    }),
  ).toThrow(DefinitionValidationError);
});

test("a symlinked definition directory is rejected before it can be read or changed", async () => {
  const root = await mkdtemp(join(tmpdir(), "codex-relay-bot-definition-link-"));
  temporaryPaths.push(root);
  const destination = join(root, "elsewhere");
  const linkPath = join(root, "definitions");
  const { bot } = await fixture();
  await mkdir(destination);
  await symlink(destination, linkPath);
  const store = createBotDefinitionStore(linkPath);

  await expect(store.read(bot)).rejects.toThrow(/real directory/);
  await expect(access(join(destination, `${bot.id}.json`))).rejects.toMatchObject({
    code: "ENOENT",
  });
});

test("replacing the definition directory after use blocks subsequent writes", async () => {
  const { bot, store } = await fixture();
  const initial = await store.read(bot);
  const directory = dirname(initial.path);
  const originalDirectory = `${directory}-original`;
  await rename(directory, originalDirectory);
  await symlink(originalDirectory, directory);

  await expect(store.update(bot, { name: "Changed" }, initial.revision)).rejects.toThrow(
    /real directory/,
  );
  expect(JSON.parse(await readFile(join(originalDirectory, `${bot.id}.json`), "utf8")).name).toBe(
    "Research",
  );
});

test("definition synchronization keeps a database mirror callback inside the write lock", async () => {
  const { bot, store } = await fixture();
  const initial = await store.read(bot);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const applied: string[] = [];
  const syncing = store.synchronize(bot, async (snapshot) => {
    started();
    await gate;
    applied.push(snapshot.definition.name);
  });
  await entered;
  const updating = store.updateAndSynchronize(
    bot,
    { name: "Changed" },
    initial.revision,
    async (snapshot) => {
      applied.push(snapshot.definition.name);
    },
  );
  expect(await readFile(initial.path, "utf8")).toBe(initial.content);
  release();
  await Promise.all([syncing, updating]);
  expect(applied).toEqual(["Research", "Changed"]);
});

test("a Mac edit during database synchronization is applied before the request returns", async () => {
  const { bot, store } = await fixture();
  const initial = await store.read(bot);
  const applied: string[] = [];
  const snapshot = await store.synchronize(bot, async (current) => {
    applied.push(current.definition.name);
    if (applied.length === 1) {
      await writeFile(
        current.path,
        JSON.stringify({ ...current.definition, name: "Mac edit" }),
        "utf8",
      );
    }
  });

  expect(applied).toEqual(["Research", "Mac edit"]);
  expect(snapshot.definition.name).toBe("Mac edit");
  expect(snapshot.revision).not.toBe(initial.revision);
});
