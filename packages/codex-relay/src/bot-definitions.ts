import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { link, lstat, mkdir, open, rename, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";

import { BotDefinitionSchema, BotSchema, type Bot, type BotDefinition } from "./api-schema.js";

export { BotDefinitionSchema } from "./api-schema.js";
export type { BotDefinition } from "./api-schema.js";
export type BotDefinitionPatch = Partial<
  Pick<
    BotDefinition,
    | "name"
    | "color"
    | "instructions"
    | "model"
    | "reasoningEffort"
    | "serviceTier"
    | "runtimeMode"
    | "preferredSkills"
    | "preferredPlugins"
  >
> & {
  model?: string | null;
  reasoningEffort?: BotDefinition["reasoningEffort"] | null;
  serviceTier?: string | null;
};

export type BotDefinitionDraft = Pick<
  Bot,
  | "name"
  | "color"
  | "instructions"
  | "model"
  | "reasoningEffort"
  | "serviceTier"
  | "runtimeMode"
  | "preferredSkills"
  | "preferredPlugins"
>;

export type BotDefinitionSnapshot = {
  definition: BotDefinition;
  content: string;
  revision: string;
  path: string;
  status: "valid" | "invalid";
  error?: string;
};

type ExistingDefinition = {
  content: string;
  revision: string;
  oversized: boolean;
};

export class DefinitionConflictError extends Error {
  constructor(public readonly currentRevision: string) {
    super("The BOT definition changed since it was opened. Reload it before saving.");
    this.name = "DefinitionConflictError";
  }
}

export class DefinitionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DefinitionValidationError";
  }
}

const serialized = (definition: BotDefinition) => `${JSON.stringify(definition, null, 2)}\n`;
const maxDefinitionBytes = 128_000;

function requireSupportedSize(content: string) {
  if (Buffer.byteLength(content, "utf8") > maxDefinitionBytes) {
    throw new DefinitionValidationError("BOT definition exceeds the 128,000-byte file limit.");
  }
}

function fromBot(bot: Bot): BotDefinition {
  return BotDefinitionSchema.parse({
    schemaVersion: 1,
    botId: bot.id,
    name: bot.name,
    color: bot.color,
    instructions: bot.instructions,
    model: bot.model,
    reasoningEffort: bot.reasoningEffort,
    serviceTier: bot.serviceTier,
    runtimeMode: bot.runtimeMode,
    preferredSkills: bot.preferredSkills,
    preferredPlugins: bot.preferredPlugins,
  });
}

export function validateBotDefinitionDraft(input: BotDefinitionDraft): void {
  const definition = BotDefinitionSchema.parse({
    schemaVersion: 1,
    botId: "00000000-0000-4000-8000-000000000000",
    name: input.name,
    color: input.color,
    instructions: input.instructions,
    model: input.model,
    reasoningEffort: input.reasoningEffort,
    serviceTier: input.serviceTier,
    runtimeMode: input.runtimeMode,
    preferredSkills: input.preferredSkills,
    preferredPlugins: input.preferredPlugins,
  });
  requireSupportedSize(serialized(definition));
}

function parseDefinition(content: string, botId: string): BotDefinition {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new DefinitionValidationError(
      `Invalid JSON: ${error instanceof Error ? error.message : "unknown parse error"}`,
    );
  }
  const result = BotDefinitionSchema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new DefinitionValidationError(
      `Invalid BOT definition at ${issue.path.join(".") || "root"}: ${issue.message}`,
    );
  }
  if (result.data.botId !== botId) {
    throw new DefinitionValidationError("The BOT ID in the file does not match its filename.");
  }
  return result.data;
}

export function createBotDefinitionStore(rootPath: string) {
  const directoryPath = resolve(rootPath);
  const lastValid = new Map<string, BotDefinition>();
  const locks = new Map<string, Promise<void>>();
  let directoryIdentity: { dev: number; ino: number } | undefined;

  function definitionPath(botId: string) {
    const id = BotSchema.shape.id.parse(botId);
    return join(directoryPath, `${id}.json`);
  }

  async function verifyDirectory() {
    const entry = await lstat(directoryPath);
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      throw new DefinitionValidationError("BOT definition directory must be a real directory.");
    }
    let handle;
    try {
      handle = await open(
        directoryPath,
        constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ELOOP") {
        throw new DefinitionValidationError("BOT definition directory must be a real directory.");
      }
      throw error;
    }
    try {
      const metadata = await handle.stat();
      if (!metadata.isDirectory() || metadata.dev !== entry.dev || metadata.ino !== entry.ino) {
        throw new DefinitionValidationError("BOT definition directory changed during access.");
      }
      if (
        directoryIdentity &&
        (metadata.dev !== directoryIdentity.dev || metadata.ino !== directoryIdentity.ino)
      ) {
        throw new DefinitionValidationError("BOT definition directory was replaced.");
      }
      directoryIdentity ??= { dev: metadata.dev, ino: metadata.ino };
      await handle.chmod(0o700);
    } finally {
      await handle.close();
    }
  }

  async function directory() {
    await mkdir(directoryPath, { recursive: true, mode: 0o700 });
    await verifyDirectory();
  }

  async function readExisting(path: string): Promise<ExistingDefinition | undefined> {
    await verifyDirectory();
    let handle;
    try {
      handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      if ((error as NodeJS.ErrnoException).code === "ELOOP") {
        throw new DefinitionValidationError("BOT definition must be a regular file, not a link.");
      }
      throw error;
    }
    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const before = await handle.stat({ bigint: true });
        if (!before.isFile()) throw new DefinitionValidationError("BOT definition is not a file.");
        const buffer = Buffer.allocUnsafe(maxDefinitionBytes + 1);
        let bytesRead = 0;
        while (bytesRead < buffer.length) {
          const result = await handle.read(buffer, bytesRead, buffer.length - bytesRead, bytesRead);
          if (result.bytesRead === 0) break;
          bytesRead += result.bytesRead;
        }
        const after = await handle.stat({ bigint: true });
        if (
          before.dev !== after.dev ||
          before.ino !== after.ino ||
          before.size !== after.size ||
          before.mtimeNs !== after.mtimeNs ||
          before.ctimeNs !== after.ctimeNs
        ) {
          continue;
        }
        const oversized = after.size > BigInt(maxDefinitionBytes) || bytesRead > maxDefinitionBytes;
        const prefix = buffer.subarray(0, Math.min(bytesRead, maxDefinitionBytes));
        const revision = oversized
          ? createHash("sha256")
              .update(
                [
                  "oversized-v1",
                  after.dev,
                  after.ino,
                  after.size,
                  after.mtimeNs,
                  after.ctimeNs,
                  createHash("sha256").update(prefix).digest("hex"),
                ].join(":"),
              )
              .digest("hex")
          : createHash("sha256").update(prefix).digest("hex");
        return { content: prefix.toString("utf8"), revision, oversized };
      }
      throw new DefinitionValidationError("BOT definition changed while it was being read.");
    } finally {
      await handle.close();
    }
  }

  async function writeInitial(path: string, content: string) {
    const temporaryPath = `${path}.${randomUUID()}.tmp`;
    try {
      await writeTemporary(temporaryPath, content);
      try {
        await verifyDirectory();
        await link(temporaryPath, path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
    } finally {
      await unlink(temporaryPath).catch(() => undefined);
    }
  }

  async function writeTemporary(path: string, content: string) {
    requireSupportedSize(content);
    await verifyDirectory();
    const handle = await open(path, "wx", 0o600);
    try {
      await handle.writeFile(content, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  async function readUnlocked(bot: Bot): Promise<BotDefinitionSnapshot> {
    await directory();
    const path = definitionPath(bot.id);
    let file: ExistingDefinition | undefined;
    try {
      file = await readExisting(path);
    } catch (error) {
      if (!(error instanceof DefinitionValidationError)) throw error;
      return {
        definition: lastValid.get(bot.id) ?? fromBot(bot),
        content: "",
        revision: "",
        path,
        status: "invalid",
        error: error.message,
      };
    }
    if (file === undefined) {
      await writeInitial(path, serialized(lastValid.get(bot.id) ?? fromBot(bot)));
      try {
        file = await readExisting(path);
      } catch (error) {
        if (!(error instanceof DefinitionValidationError)) throw error;
        return {
          definition: lastValid.get(bot.id) ?? fromBot(bot),
          content: "",
          revision: "",
          path,
          status: "invalid",
          error: error.message,
        };
      }
    }
    if (file === undefined) throw new Error("Could not create the BOT definition file.");
    const { content, revision } = file;
    if (file.oversized) {
      return {
        definition: lastValid.get(bot.id) ?? fromBot(bot),
        content,
        revision,
        path,
        status: "invalid",
        error: "BOT definition exceeds the 128,000-byte file limit. Preview is truncated.",
      };
    }
    try {
      const definition = parseDefinition(content, bot.id);
      lastValid.set(bot.id, definition);
      return { definition, content, revision, path, status: "valid" };
    } catch (error) {
      if (!(error instanceof DefinitionValidationError)) throw error;
      return {
        definition: lastValid.get(bot.id) ?? fromBot(bot),
        content,
        revision,
        path,
        status: "invalid",
        error: error.message,
      };
    }
  }

  async function withLock<T>(botId: string, operation: () => Promise<T>): Promise<T> {
    const previous = locks.get(botId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    locks.set(botId, current);
    await previous;
    try {
      return await operation();
    } finally {
      if (locks.get(botId) === current) locks.delete(botId);
      release();
    }
  }

  async function read(bot: Bot): Promise<BotDefinitionSnapshot> {
    return withLock(bot.id, () => readUnlocked(bot));
  }

  async function applyUntilStable(
    bot: Bot,
    snapshot: BotDefinitionSnapshot,
    apply: (snapshot: BotDefinitionSnapshot) => Promise<void>,
  ): Promise<BotDefinitionSnapshot> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await apply(snapshot);
      const latest = await readUnlocked(bot);
      if (latest.revision === snapshot.revision) return latest;
      snapshot = latest;
    }
    throw new DefinitionConflictError(snapshot.revision);
  }

  async function synchronize(
    bot: Bot,
    apply: (snapshot: BotDefinitionSnapshot) => Promise<void>,
  ): Promise<BotDefinitionSnapshot> {
    return withLock(bot.id, async () => {
      const snapshot = await readUnlocked(bot);
      return applyUntilStable(bot, snapshot, apply);
    });
  }

  async function writeUnlocked(
    bot: Bot,
    content: string,
    expectedRevision: string,
  ): Promise<BotDefinitionSnapshot> {
    const current = await readUnlocked(bot);
    if (current.revision !== expectedRevision) {
      throw new DefinitionConflictError(current.revision);
    }
    const definition = parseDefinition(content, bot.id);
    const path = current.path;
    const temporaryPath = `${path}.${randomUUID()}.tmp`;
    try {
      await writeTemporary(temporaryPath, serialized(definition));
      const latest = await readExisting(path);
      if (latest === undefined || latest.revision !== expectedRevision) {
        throw new DefinitionConflictError(latest?.revision ?? "");
      }
      await verifyDirectory();
      await rename(temporaryPath, path);
    } finally {
      await unlink(temporaryPath).catch(() => undefined);
    }
    lastValid.set(bot.id, definition);
    return readUnlocked(bot);
  }

  async function write(
    bot: Bot,
    content: string,
    expectedRevision: string,
  ): Promise<BotDefinitionSnapshot> {
    return withLock(bot.id, () => writeUnlocked(bot, content, expectedRevision));
  }

  async function writeAndSynchronize(
    bot: Bot,
    content: string,
    expectedRevision: string,
    apply: (snapshot: BotDefinitionSnapshot) => Promise<void>,
  ): Promise<BotDefinitionSnapshot> {
    return withLock(bot.id, async () => {
      const snapshot = await writeUnlocked(bot, content, expectedRevision);
      return applyUntilStable(bot, snapshot, apply);
    });
  }

  async function updateUnlocked(
    bot: Bot,
    patch: BotDefinitionPatch,
    expectedRevision: string,
  ): Promise<BotDefinitionSnapshot> {
    const current = await readUnlocked(bot);
    if (current.revision !== expectedRevision) {
      throw new DefinitionConflictError(current.revision);
    }
    if (current.status === "invalid") {
      throw new DefinitionValidationError(
        "The BOT definition file is invalid. Repair it in the file editor before saving form changes.",
      );
    }
    const next = { ...current.definition, ...patch };
    for (const field of ["model", "reasoningEffort", "serviceTier"] as const) {
      if (next[field] === null) delete next[field];
    }
    return writeUnlocked(bot, serialized(next as BotDefinition), expectedRevision);
  }

  async function update(
    bot: Bot,
    patch: BotDefinitionPatch,
    expectedRevision: string,
  ): Promise<BotDefinitionSnapshot> {
    return withLock(bot.id, () => updateUnlocked(bot, patch, expectedRevision));
  }

  async function updateAndSynchronize(
    bot: Bot,
    patch: BotDefinitionPatch,
    expectedRevision: string,
    apply: (snapshot: BotDefinitionSnapshot) => Promise<void>,
  ): Promise<BotDefinitionSnapshot> {
    return withLock(bot.id, async () => {
      const snapshot = await updateUnlocked(bot, patch, expectedRevision);
      return applyUntilStable(bot, snapshot, apply);
    });
  }

  return {
    read,
    synchronize,
    write,
    writeAndSynchronize,
    update,
    updateAndSynchronize,
    pathFor: definitionPath,
  };
}
