import { randomUUID } from "node:crypto";
import { chmod, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import {
  BotConversationSchema,
  BotMemorySchema,
  BotMessageSchema,
  BotMessageRuntimeSchema,
  BotSchema,
  ChatMessageSchema,
  PromptAttachmentSummarySchema,
  PromptSkillSchema,
  type Bot,
  type BotConversation,
  type BotMemory,
  type BotMessage,
  type BotMessageRuntime,
  type ChatMessage,
  type PromptAttachment,
  type PromptSkill,
} from "./api-schema.js";
import { connect } from "./libsql-database.js";

type BotInput = Pick<Bot, "name" | "color" | "instructions" | "runtimeMode"> &
  Partial<
    Pick<Bot, "model" | "reasoningEffort" | "serviceTier" | "preferredSkills" | "preferredPlugins">
  >;
type BotPatch = Partial<Omit<BotInput, "model" | "reasoningEffort" | "serviceTier">> & {
  model?: string | null;
  reasoningEffort?: Bot["reasoningEffort"] | null;
  serviceTier?: string | null;
};
type ConversationInput =
  | { kind: "direct"; botId: string; workspacePath: string }
  | {
      kind: "group";
      name: string;
      workspacePath: string;
      botIds: string[];
      defaultBotId: string;
    };

export type BotStore = Awaited<ReturnType<typeof createBotStore>>;

export async function createBotStore(path: string) {
  if (path !== ":memory:") {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await chmod(dirname(path), 0o700);
  }
  const db = connect(path);
  const requiresFtsBackfill = !(await db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = 'bot_messages_fts_update'",
    )
    .get());
  await db.exec(`
    CREATE TABLE IF NOT EXISTS bots (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL,
      instructions TEXT NOT NULL, model TEXT, reasoning_effort TEXT,
      service_tier TEXT, runtime_mode TEXT NOT NULL,
      preferred_skills_json TEXT NOT NULL DEFAULT '[]',
      preferred_plugins_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS bot_conversations (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL,
      workspace_path TEXT NOT NULL, direct_bot_id TEXT, default_bot_id TEXT,
      last_seq INTEGER NOT NULL DEFAULT 0, preferences_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS bot_group_members (
      conversation_id TEXT NOT NULL, bot_id TEXT NOT NULL,
      position INTEGER NOT NULL, left_seq INTEGER,
      PRIMARY KEY (conversation_id, bot_id)
    );
    CREATE TABLE IF NOT EXISTS bot_messages (
      id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, seq INTEGER NOT NULL,
      sender TEXT NOT NULL, bot_id TEXT, content TEXT NOT NULL,
      status TEXT NOT NULL, request_id TEXT, reply_to_message_id TEXT,
      activity_json TEXT,
      attachments_json TEXT, skills_json TEXT,
      created_at TEXT NOT NULL,
      UNIQUE (conversation_id, seq)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS bot_user_request_once
      ON bot_messages(conversation_id, request_id)
      WHERE sender = 'user' AND request_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS bot_messages_by_conversation
      ON bot_messages(conversation_id, seq DESC);
    CREATE INDEX IF NOT EXISTS bot_messages_by_reply
      ON bot_messages(reply_to_message_id, seq);
    CREATE VIRTUAL TABLE IF NOT EXISTS bot_message_search USING fts5(content, tokenize='trigram');
    CREATE TRIGGER IF NOT EXISTS bot_messages_fts_insert AFTER INSERT ON bot_messages BEGIN
      INSERT INTO bot_message_search(rowid, content) VALUES (new.rowid, new.content);
    END;
    CREATE TRIGGER IF NOT EXISTS bot_messages_fts_update AFTER UPDATE OF content ON bot_messages BEGIN
      DELETE FROM bot_message_search WHERE rowid = old.rowid;
      INSERT INTO bot_message_search(rowid, content) VALUES (new.rowid, new.content);
    END;
    CREATE TRIGGER IF NOT EXISTS bot_messages_fts_delete AFTER DELETE ON bot_messages BEGIN
      DELETE FROM bot_message_search WHERE rowid = old.rowid;
    END;
    CREATE TABLE IF NOT EXISTS bot_threads (
      conversation_id TEXT NOT NULL, bot_id TEXT NOT NULL,
      thread_id TEXT NOT NULL, last_seen_seq INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (conversation_id, bot_id)
    );
    CREATE TABLE IF NOT EXISTS bot_memories (
      id TEXT PRIMARY KEY, bot_id TEXT NOT NULL, content TEXT NOT NULL,
      source_message_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
  `);
  const messageColumnsBeforeMigration = await db.prepare("PRAGMA table_info(bot_messages)").all();
  if (!messageColumnsBeforeMigration.some((column) => column.name === "runtime_json")) {
    await db.exec("ALTER TABLE bot_messages ADD COLUMN runtime_json TEXT");
  }
  if (!messageColumnsBeforeMigration.some((column) => column.name === "attachments_json")) {
    await db.exec("ALTER TABLE bot_messages ADD COLUMN attachments_json TEXT");
  }
  if (!messageColumnsBeforeMigration.some((column) => column.name === "skills_json")) {
    await db.exec("ALTER TABLE bot_messages ADD COLUMN skills_json TEXT");
  }
  const conversationColumns = await db.prepare("PRAGMA table_info(bot_conversations)").all();
  if (!conversationColumns.some((column) => column.name === "preferences_json")) {
    await db.exec(
      "ALTER TABLE bot_conversations ADD COLUMN preferences_json TEXT NOT NULL DEFAULT '{}'",
    );
  }
  const botColumnsBeforeMigration = await db.prepare("PRAGMA table_info(bots)").all();
  if (!botColumnsBeforeMigration.some((column) => column.name === "preferred_skills_json")) {
    await db.exec("ALTER TABLE bots ADD COLUMN preferred_skills_json TEXT NOT NULL DEFAULT '[]'");
  }
  if (!botColumnsBeforeMigration.some((column) => column.name === "preferred_plugins_json")) {
    await db.exec("ALTER TABLE bots ADD COLUMN preferred_plugins_json TEXT NOT NULL DEFAULT '[]'");
  }
  if (requiresFtsBackfill) {
    await db.exec(`DELETE FROM bot_message_search;
      INSERT INTO bot_message_search(rowid, content)
      SELECT rowid, content FROM bot_messages;`);
  }
  if (path !== ":memory:") await chmod(path, 0o600);
  await db.prepare("UPDATE bot_messages SET status = 'interrupted' WHERE status = 'running'").run();
  const activities = await db
    .prepare("SELECT id, activity_json FROM bot_messages WHERE activity_json IS NOT NULL")
    .all();
  for (const row of activities) {
    const activity = ChatMessageSchema.parse(JSON.parse(String(row.activity_json)));
    if (!activity.details?.approvalId || activity.details.approvalResolved) continue;
    await db.prepare("UPDATE bot_messages SET activity_json = ? WHERE id = ?").run(
      JSON.stringify({
        ...activity,
        details: { ...activity.details, approvalResolved: true, approvalDecision: "cancel" },
        updatedAt: new Date().toISOString(),
      }),
      String(row.id),
    );
  }

  const botColumns = `id, name, color, instructions, model, reasoning_effort AS reasoningEffort,
    service_tier AS serviceTier, runtime_mode AS runtimeMode,
    preferred_skills_json AS preferredSkillsJson,
    preferred_plugins_json AS preferredPluginsJson,
    created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt`;
  const messageColumns = `id, conversation_id AS conversationId, seq, sender, bot_id AS botId,
    content, status, request_id AS requestId, reply_to_message_id AS replyToMessageId,
    activity_json AS activityJson, runtime_json AS runtimeJson,
    attachments_json AS attachmentsJson, skills_json AS skillsJson, created_at AS createdAt`;
  const joinedMessageColumns = `m.id, m.conversation_id AS conversationId, m.seq,
    m.sender, m.bot_id AS botId, m.content, m.status, m.request_id AS requestId,
    m.reply_to_message_id AS replyToMessageId, m.activity_json AS activityJson,
    m.runtime_json AS runtimeJson, m.attachments_json AS attachmentsJson,
    m.skills_json AS skillsJson,
    m.created_at AS createdAt`;
  const parseMessage = (row: Record<string, unknown>) =>
    BotMessageSchema.parse({
      ...row,
      activity: row.activityJson
        ? ChatMessageSchema.parse(JSON.parse(String(row.activityJson)))
        : undefined,
      runtime: row.runtimeJson
        ? BotMessageRuntimeSchema.parse(JSON.parse(String(row.runtimeJson)))
        : undefined,
      attachments: row.attachmentsJson
        ? PromptAttachmentSummarySchema.array().parse(JSON.parse(String(row.attachmentsJson)))
        : undefined,
      skills: row.skillsJson
        ? PromptSkillSchema.array().parse(JSON.parse(String(row.skillsJson)))
        : undefined,
    });
  const memoryColumns = `id, bot_id AS botId, content, source_message_id AS sourceMessageId,
    (SELECT conversation_id FROM bot_messages WHERE id = source_message_id) AS sourceConversationId,
    (SELECT content FROM bot_messages WHERE id = source_message_id) AS sourceMessageContent,
    created_at AS createdAt, updated_at AS updatedAt`;

  async function getBot(id: string, includeDeleted = false): Promise<Bot | undefined> {
    const row = await db.prepare(`SELECT ${botColumns} FROM bots WHERE id = ?`).get(id);
    const bot = row
      ? BotSchema.parse({
          ...row,
          model: row.model ?? undefined,
          reasoningEffort: row.reasoningEffort ?? undefined,
          serviceTier: row.serviceTier ?? undefined,
          preferredSkills: JSON.parse(String(row.preferredSkillsJson ?? "[]")),
          preferredPlugins: JSON.parse(String(row.preferredPluginsJson ?? "[]")),
        })
      : undefined;
    return bot && (includeDeleted || !bot.deletedAt) ? bot : undefined;
  }

  async function listBots(): Promise<Bot[]> {
    const rows = await db
      .prepare(`SELECT ${botColumns} FROM bots WHERE deleted_at IS NULL ORDER BY created_at, id`)
      .all();
    return rows.map((row) =>
      BotSchema.parse({
        ...row,
        model: row.model ?? undefined,
        reasoningEffort: row.reasoningEffort ?? undefined,
        serviceTier: row.serviceTier ?? undefined,
        preferredSkills: JSON.parse(String(row.preferredSkillsJson ?? "[]")),
        preferredPlugins: JSON.parse(String(row.preferredPluginsJson ?? "[]")),
      }),
    );
  }

  async function createBot(input: BotInput): Promise<Bot> {
    const now = new Date().toISOString();
    const id = randomUUID();
    await db
      .prepare(`INSERT INTO bots
      (id, name, color, instructions, model, reasoning_effort, service_tier, runtime_mode,
       preferred_skills_json, preferred_plugins_json,
       created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        id,
        input.name,
        input.color,
        input.instructions,
        input.model ?? null,
        input.reasoningEffort ?? null,
        input.serviceTier ?? null,
        input.runtimeMode,
        JSON.stringify(input.preferredSkills ?? []),
        JSON.stringify(input.preferredPlugins ?? []),
        now,
        now,
      );
    return (await getBot(id))!;
  }

  async function updateBot(id: string, patch: BotPatch): Promise<Bot | undefined> {
    const current = await getBot(id);
    if (!current) return undefined;
    const next = { ...current, ...patch };
    await db.transaction(async (tx) => {
      await tx
        .prepare(`UPDATE bots SET name = ?, color = ?, instructions = ?, model = ?,
      reasoning_effort = ?, service_tier = ?, runtime_mode = ?,
      preferred_skills_json = ?, preferred_plugins_json = ?, updated_at = ? WHERE id = ?`)
        .run(
          next.name,
          next.color,
          next.instructions,
          next.model ?? null,
          next.reasoningEffort ?? null,
          next.serviceTier ?? null,
          next.runtimeMode,
          JSON.stringify(next.preferredSkills),
          JSON.stringify(next.preferredPlugins),
          new Date().toISOString(),
          id,
        );
      if (next.name !== current.name) {
        await tx
          .prepare(`UPDATE bot_conversations SET name = ?
          WHERE kind = 'direct' AND direct_bot_id = ? AND deleted_at IS NULL`)
          .run(next.name, id);
      }
    })();
    return getBot(id);
  }

  async function deleteBot(id: string): Promise<boolean> {
    const bot = await getBot(id);
    if (!bot) return false;
    const defaultGroup = await db
      .prepare(`SELECT id FROM bot_conversations
      WHERE kind = 'group' AND default_bot_id = ? AND deleted_at IS NULL LIMIT 1`)
      .get(id);
    if (defaultGroup) throw new Error("Choose another default BOT before deleting this BOT.");
    await db.transaction(async (tx) => {
      await tx
        .prepare("UPDATE bots SET deleted_at = ?, updated_at = ? WHERE id = ?")
        .run(new Date().toISOString(), new Date().toISOString(), id);
      await tx
        .prepare(`UPDATE bot_group_members SET left_seq =
        (SELECT last_seq FROM bot_conversations WHERE id = conversation_id)
        WHERE bot_id = ? AND left_seq IS NULL`)
        .run(id);
    })();
    return true;
  }

  async function getConversation(
    id: string,
    includeDeleted = false,
  ): Promise<BotConversation | undefined> {
    const row = await db
      .prepare(`SELECT id, kind, name, workspace_path AS workspacePath,
      direct_bot_id AS botId, default_bot_id AS defaultBotId,
      preferences_json AS preferencesJson,
      created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt
      FROM bot_conversations WHERE id = ?`)
      .get(id);
    if (!row || (!includeDeleted && row.deletedAt)) return undefined;
    const members =
      row.kind === "direct"
        ? [row.botId]
        : (
            await db
              .prepare(`SELECT bot_id FROM bot_group_members
          WHERE conversation_id = ? AND left_seq IS NULL ORDER BY position`)
              .all(id)
          ).map((member) => member.bot_id);
    return BotConversationSchema.parse({
      ...row,
      botIds: members,
      preferences: JSON.parse(String(row.preferencesJson ?? "{}")),
    });
  }

  async function listConversations(): Promise<BotConversation[]> {
    const rows = await db
      .prepare(`SELECT id FROM bot_conversations WHERE deleted_at IS NULL
      ORDER BY updated_at DESC, id DESC`)
      .all();
    return (await Promise.all(rows.map((row) => getConversation(String(row.id))))).filter(
      (value): value is BotConversation => value !== undefined,
    );
  }

  async function createConversation(input: ConversationInput): Promise<BotConversation> {
    const botIds = input.kind === "direct" ? [input.botId] : input.botIds;
    if (new Set(botIds).size !== botIds.length) throw new Error("BOT members must be unique.");
    for (const botId of botIds)
      if (!(await getBot(botId))) throw new Error(`Unknown BOT ${botId}.`);
    if (input.kind === "group" && !botIds.includes(input.defaultBotId)) {
      throw new Error("Default BOT must be a group member.");
    }
    const bot = input.kind === "direct" ? (await getBot(input.botId))! : undefined;
    const now = new Date().toISOString();
    const id = randomUUID();
    await db.transaction(async (tx) => {
      await tx
        .prepare(`INSERT INTO bot_conversations
        (id, kind, name, workspace_path, direct_bot_id, default_bot_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(
          id,
          input.kind,
          bot?.name ?? (input.kind === "group" ? input.name : "BOT"),
          input.workspacePath,
          input.kind === "direct" ? input.botId : null,
          input.kind === "group" ? input.defaultBotId : null,
          now,
          now,
        );
      if (input.kind === "group") {
        for (const [position, botId] of botIds.entries()) {
          await tx
            .prepare(`INSERT INTO bot_group_members (conversation_id, bot_id, position)
            VALUES (?, ?, ?)`)
            .run(id, botId, position);
        }
      }
    })();
    return (await getConversation(id))!;
  }

  async function updateConversation(
    id: string,
    patch: {
      name?: string;
      workspacePath?: string;
      botIds?: string[];
      defaultBotId?: string;
    },
  ): Promise<BotConversation | undefined> {
    const current = await getConversation(id);
    if (!current) return undefined;
    if (current.kind === "direct") throw new Error("Direct conversations cannot be edited.");
    const botIds = patch.botIds ?? current.botIds;
    if (new Set(botIds).size !== botIds.length) throw new Error("BOT members must be unique.");
    for (const botId of botIds)
      if (!(await getBot(botId))) throw new Error(`Unknown BOT ${botId}.`);
    const defaultBotId = patch.defaultBotId ?? current.defaultBotId;
    if (!defaultBotId || !botIds.includes(defaultBotId))
      throw new Error("Default BOT must be a group member.");
    const lastSeq = await lastSequence(id);
    await db.transaction(async (tx) => {
      await tx
        .prepare(`UPDATE bot_conversations SET name = ?, workspace_path = ?,
        default_bot_id = ?, updated_at = ? WHERE id = ?`)
        .run(
          patch.name ?? current.name,
          patch.workspacePath ?? current.workspacePath,
          defaultBotId,
          new Date().toISOString(),
          id,
        );
      for (const [position, botId] of botIds.entries()) {
        await tx
          .prepare(`INSERT INTO bot_group_members (conversation_id, bot_id, position, left_seq)
          VALUES (?, ?, ?, NULL) ON CONFLICT(conversation_id, bot_id)
          DO UPDATE SET position = excluded.position, left_seq = NULL`)
          .run(id, botId, position);
      }
      for (const botId of current.botIds.filter((member) => !botIds.includes(member))) {
        await tx
          .prepare(`UPDATE bot_group_members SET left_seq = ?
          WHERE conversation_id = ? AND bot_id = ?`)
          .run(lastSeq, id, botId);
      }
    })();
    return getConversation(id);
  }

  async function updateConversationPreferences(
    id: string,
    patch: Partial<
      Record<"model" | "reasoningEffort" | "serviceTier" | "runtimeMode", string | null>
    >,
  ): Promise<BotConversation | undefined> {
    const current = await getConversation(id);
    if (!current) return undefined;
    if (current.kind !== "direct")
      throw new Error("Only direct chats have conversation preferences.");
    await db.transaction(async (tx) => {
      const row = await tx
        .prepare(`SELECT preferences_json FROM bot_conversations
        WHERE id = ? AND deleted_at IS NULL`)
        .get(id);
      if (!row) throw new Error("Conversation not found.");
      const preferences = BotConversationSchema.shape.preferences.parse(
        JSON.parse(String(row.preferences_json)),
      );
      for (const [key, value] of Object.entries(patch)) {
        if (value === null && key !== "serviceTier")
          delete preferences[key as keyof typeof preferences];
        else if (value !== undefined) Object.assign(preferences, { [key]: value });
      }
      await tx
        .prepare(`UPDATE bot_conversations SET preferences_json = ?, updated_at = ?
        WHERE id = ?`)
        .run(JSON.stringify(preferences), new Date().toISOString(), id);
    })();
    return getConversation(id);
  }

  async function resetConversationPreferences(id: string) {
    const current = await getConversation(id);
    if (!current) return undefined;
    if (current.kind !== "direct")
      throw new Error("Only direct chats have conversation preferences.");
    await db
      .prepare(`UPDATE bot_conversations SET preferences_json = '{}', updated_at = ?
      WHERE id = ?`)
      .run(new Date().toISOString(), id);
    return getConversation(id);
  }

  async function deleteConversation(id: string): Promise<boolean> {
    if (!(await getConversation(id))) return false;
    await db
      .prepare("UPDATE bot_conversations SET deleted_at = ? WHERE id = ?")
      .run(new Date().toISOString(), id);
    return true;
  }

  async function lastSequence(conversationId: string): Promise<number> {
    const row = await db
      .prepare("SELECT last_seq FROM bot_conversations WHERE id = ?")
      .get(conversationId);
    return Number(row?.last_seq ?? 0);
  }

  async function appendMessage(input: {
    conversationId: string;
    sender: "user" | "bot" | "status";
    botId?: string;
    content: string;
    status?: "completed" | "running" | "failed" | "interrupted";
    requestId?: string;
    replyToMessageId?: string;
    activity?: ChatMessage;
  }): Promise<BotMessage> {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    await db.transaction(async (tx) => {
      const next = await tx
        .prepare(`UPDATE bot_conversations SET last_seq = last_seq + 1,
        updated_at = ? WHERE id = ? RETURNING last_seq`)
        .get(createdAt, input.conversationId);
      if (!next) throw new Error("Conversation not found.");
      await tx
        .prepare(`INSERT INTO bot_messages
        (id, conversation_id, seq, sender, bot_id, content, status, request_id,
         reply_to_message_id, activity_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(
          id,
          input.conversationId,
          Number(next.last_seq),
          input.sender,
          input.botId ?? null,
          input.content,
          input.status ?? "completed",
          input.requestId ?? null,
          input.replyToMessageId ?? null,
          input.activity ? JSON.stringify(ChatMessageSchema.parse(input.activity)) : null,
          createdAt,
        );
    })();
    return (await getMessage(id))!;
  }

  async function appendUserWithReplies(input: {
    conversationId: string;
    content: string;
    requestId: string;
    botIds: string[];
    attachments?: PromptAttachment[];
    skills?: PromptSkill[];
  }) {
    const createdAt = new Date().toISOString();
    const userId = randomUUID();
    const replyIds = input.botIds.map(() => randomUUID());
    const created = await db.transaction(async (tx) => {
      const existing = await tx
        .prepare(`SELECT id FROM bot_messages
        WHERE conversation_id = ? AND sender = 'user' AND request_id = ?`)
        .get(input.conversationId, input.requestId);
      if (existing) return { userId: String(existing.id), created: false };
      const total = 1 + input.botIds.length;
      const latest = await tx
        .prepare(`UPDATE bot_conversations
        SET last_seq = last_seq + ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL
        RETURNING last_seq`)
        .get(total, createdAt, input.conversationId);
      if (!latest) throw new Error("Conversation not found.");
      const firstSeq = Number(latest.last_seq) - total + 1;
      await tx
        .prepare(`INSERT INTO bot_messages
        (id, conversation_id, seq, sender, bot_id, content, status, request_id,
         reply_to_message_id, attachments_json, skills_json, created_at)
         VALUES (?, ?, ?, 'user', NULL, ?, 'completed', ?, NULL, ?, ?, ?)`)
        .run(
          userId,
          input.conversationId,
          firstSeq,
          input.content,
          input.requestId,
          input.attachments?.length
            ? JSON.stringify(PromptAttachmentSummarySchema.array().parse(input.attachments))
            : null,
          input.skills?.length
            ? JSON.stringify(PromptSkillSchema.array().parse(input.skills))
            : null,
          createdAt,
        );
      for (const [index, botId] of input.botIds.entries()) {
        await tx
          .prepare(`INSERT INTO bot_messages
          (id, conversation_id, seq, sender, bot_id, content, status, request_id,
           reply_to_message_id, created_at)
          VALUES (?, ?, ?, 'bot', ?, '', 'running', NULL, ?, ?)`)
          .run(
            replyIds[index]!,
            input.conversationId,
            firstSeq + index + 1,
            botId,
            userId,
            createdAt,
          );
      }
      return { userId, created: true };
    })();
    const message = (await getMessage(created.userId))!;
    return { message, replies: await listReplies(message.id), created: created.created };
  }

  async function completeMessage(
    id: string,
    content: string,
    status: "completed" | "failed" | "interrupted",
  ) {
    await db
      .prepare("UPDATE bot_messages SET content = ?, status = ? WHERE id = ?")
      .run(content, status, id);
    return getMessage(id);
  }

  async function setMessageRuntime(id: string, runtime: BotMessageRuntime) {
    await db
      .prepare("UPDATE bot_messages SET runtime_json = ? WHERE id = ? AND status = 'running'")
      .run(JSON.stringify(BotMessageRuntimeSchema.parse(runtime)), id);
    return getMessage(id);
  }

  async function resolveActivity(id: string, decision: string) {
    const message = await getMessage(id);
    if (!message?.activity) return undefined;
    const activity = {
      ...message.activity,
      details: { ...message.activity.details, approvalResolved: true, approvalDecision: decision },
      updatedAt: new Date().toISOString(),
    };
    await db
      .prepare("UPDATE bot_messages SET activity_json = ? WHERE id = ?")
      .run(JSON.stringify(ChatMessageSchema.parse(activity)), id);
    return getMessage(id);
  }

  async function getMessage(id: string): Promise<BotMessage | undefined> {
    const row = await db.prepare(`SELECT ${messageColumns} FROM bot_messages WHERE id = ?`).get(id);
    return row ? parseMessage(row) : undefined;
  }

  async function getMessageByRequestId(conversationId: string, requestId: string) {
    const row = await db
      .prepare(`SELECT ${messageColumns} FROM bot_messages
      WHERE conversation_id = ? AND request_id = ? AND sender = 'user'`)
      .get(conversationId, requestId);
    return row ? parseMessage(row) : undefined;
  }

  async function listMessages(conversationId: string, cursor?: number, limit = 50) {
    const rows = await db
      .prepare(`SELECT ${messageColumns} FROM bot_messages
      WHERE conversation_id = ? AND seq < ? ORDER BY seq DESC LIMIT ?`)
      .all(conversationId, cursor ?? Number.MAX_SAFE_INTEGER, limit + 1);
    const more = rows.length > limit;
    const messages = rows.slice(0, limit).map((row) => parseMessage(row));
    return { messages, nextCursor: more ? String(messages.at(-1)!.seq) : null };
  }

  async function listMessagesAfter(conversationId: string, afterSeq: number, untilSeq: number) {
    const rows = await db
      .prepare(`SELECT ${messageColumns} FROM bot_messages
      WHERE conversation_id = ? AND seq > ? AND seq <= ? ORDER BY seq`)
      .all(conversationId, afterSeq, untilSeq);
    return rows.map((row) => parseMessage(row));
  }

  async function listReplies(messageId: string): Promise<BotMessage[]> {
    const rows = await db
      .prepare(`SELECT ${messageColumns} FROM bot_messages
      WHERE reply_to_message_id = ? ORDER BY seq`)
      .all(messageId);
    return rows.map((row) => parseMessage(row));
  }

  async function searchHistory(botId: string, query: string, cursor?: number, limit = 30) {
    if (!(await getBot(botId, true))) return { hits: [], nextCursor: null };
    const useFts = [...query].length >= 3;
    const phrase = `"${query.replaceAll('"', '""')}"`;
    const rows = await db
      .prepare(`SELECT m.rowid AS cursor, ${joinedMessageColumns},
      c.id AS historyConversationId
      FROM bot_messages m
      JOIN bot_conversations c ON c.id = m.conversation_id
      LEFT JOIN bot_group_members gm ON gm.conversation_id = c.id AND gm.bot_id = ?
      ${useFts ? "JOIN bot_message_search f ON f.rowid = m.rowid" : ""}
      WHERE ((c.kind = 'direct' AND c.direct_bot_id = ?)
        OR (c.kind = 'group' AND gm.bot_id IS NOT NULL
          AND (gm.left_seq IS NULL OR m.seq <= gm.left_seq)))
        AND m.rowid < ?
        ${
          useFts
            ? "AND f.content MATCH ? AND instr(lower(m.content), lower(?)) > 0"
            : "AND (? = '' OR instr(lower(m.content), lower(?)) > 0)"
        }
      ORDER BY m.rowid DESC LIMIT ?`)
      .all(
        botId,
        botId,
        cursor ?? Number.MAX_SAFE_INTEGER,
        useFts ? phrase : query,
        query,
        limit + 1,
      );
    const more = rows.length > limit;
    const page = rows.slice(0, limit);
    const hits = await Promise.all(
      page.map(async (row) => ({
        message: parseMessage(row),
        conversation: (await getConversation(String(row.historyConversationId), true))!,
      })),
    );
    return { hits, nextCursor: more ? String(page.at(-1)!.cursor) : null };
  }

  async function readHistory(botId: string, conversationId: string, cursor?: number, limit = 50) {
    const rows = await db
      .prepare(`SELECT ${joinedMessageColumns} FROM bot_messages m
      JOIN bot_conversations c ON c.id = m.conversation_id
      LEFT JOIN bot_group_members gm ON gm.conversation_id = c.id AND gm.bot_id = ?
      WHERE c.id = ? AND m.seq < ? AND ((c.kind = 'direct' AND c.direct_bot_id = ?)
        OR (c.kind = 'group' AND gm.bot_id IS NOT NULL
          AND (gm.left_seq IS NULL OR m.seq <= gm.left_seq)))
      ORDER BY m.seq DESC LIMIT ?`)
      .all(botId, conversationId, cursor ?? Number.MAX_SAFE_INTEGER, botId, limit + 1);
    const messages = rows.slice(0, limit).map((row) => parseMessage(row));
    return { messages, nextCursor: rows.length > limit ? String(messages.at(-1)!.seq) : null };
  }

  async function canSeeMessage(botId: string, messageId: string) {
    const row = await db
      .prepare(`SELECT m.id FROM bot_messages m
      JOIN bot_conversations c ON c.id = m.conversation_id
      LEFT JOIN bot_group_members gm ON gm.conversation_id = c.id AND gm.bot_id = ?
      WHERE m.id = ? AND ((c.kind = 'direct' AND c.direct_bot_id = ?)
        OR (c.kind = 'group' AND gm.bot_id IS NOT NULL
          AND (gm.left_seq IS NULL OR m.seq <= gm.left_seq)))`)
      .get(botId, messageId, botId);
    return Boolean(row);
  }

  async function listThreadIds() {
    const rows = await db.prepare("SELECT thread_id FROM bot_threads").all();
    return new Set(rows.map((row) => String(row.thread_id)));
  }

  async function getThread(conversationId: string, botId: string) {
    const row = await db
      .prepare(`SELECT thread_id AS threadId, last_seen_seq AS lastSeenSeq
      FROM bot_threads WHERE conversation_id = ? AND bot_id = ?`)
      .get(conversationId, botId);
    return row
      ? { threadId: String(row.threadId), lastSeenSeq: Number(row.lastSeenSeq) }
      : undefined;
  }

  async function getLatestThreadRuntime(conversationId: string, botId: string, threadId: string) {
    const row = await db
      .prepare(`SELECT runtime_json FROM bot_messages
      WHERE conversation_id = ? AND sender = 'bot' AND bot_id = ?
        AND runtime_json IS NOT NULL
        AND json_extract(runtime_json, '$.threadId') = ?
      ORDER BY seq DESC LIMIT 1`)
      .get(conversationId, botId, threadId);
    return row ? BotMessageRuntimeSchema.parse(JSON.parse(String(row.runtime_json))) : undefined;
  }

  async function resetThread(conversationId: string, botId: string) {
    await db
      .prepare("DELETE FROM bot_threads WHERE conversation_id = ? AND bot_id = ?")
      .run(conversationId, botId);
  }

  async function setThread(
    conversationId: string,
    botId: string,
    threadId: string,
    lastSeenSeq: number,
  ) {
    await db
      .prepare(`INSERT INTO bot_threads (conversation_id, bot_id, thread_id, last_seen_seq)
      VALUES (?, ?, ?, ?) ON CONFLICT(conversation_id, bot_id)
      DO UPDATE SET thread_id = excluded.thread_id, last_seen_seq = excluded.last_seen_seq`)
      .run(conversationId, botId, threadId, lastSeenSeq);
  }

  async function listMemories(botId: string): Promise<BotMemory[]> {
    const rows = await db
      .prepare(`SELECT ${memoryColumns} FROM bot_memories
      WHERE bot_id = ? ORDER BY created_at, id`)
      .all(botId);
    return rows.map((row) => BotMemorySchema.parse(row));
  }

  async function createMemory(
    botId: string,
    content: string,
    sourceMessageId?: string,
  ): Promise<BotMemory> {
    const id = randomUUID();
    const now = new Date().toISOString();
    await db
      .prepare(`INSERT INTO bot_memories
      (id, bot_id, content, source_message_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .run(id, botId, content, sourceMessageId ?? null, now, now);
    return (await getMemory(botId, id))!;
  }

  async function getMemory(botId: string, memoryId: string): Promise<BotMemory | undefined> {
    const row = await db
      .prepare(`SELECT ${memoryColumns} FROM bot_memories
      WHERE id = ? AND bot_id = ?`)
      .get(memoryId, botId);
    return row ? BotMemorySchema.parse(row) : undefined;
  }

  async function updateMemory(botId: string, memoryId: string, content: string) {
    await db
      .prepare(`UPDATE bot_memories SET content = ?, updated_at = ?
      WHERE id = ? AND bot_id = ?`)
      .run(content, new Date().toISOString(), memoryId, botId);
    return getMemory(botId, memoryId);
  }

  async function deleteMemory(botId: string, memoryId: string) {
    const result = await db
      .prepare("DELETE FROM bot_memories WHERE id = ? AND bot_id = ?")
      .run(memoryId, botId);
    return Number(result.rowsAffected) > 0;
  }

  return {
    appendMessage,
    appendUserWithReplies,
    canSeeMessage,
    completeMessage,
    createBot,
    createConversation,
    createMemory,
    deleteBot,
    deleteConversation,
    deleteMemory,
    getBot,
    getConversation,
    getMemory,
    getMessage,
    getMessageByRequestId,
    getLatestThreadRuntime,
    getThread,
    lastSequence,
    listBots,
    listConversations,
    listMemories,
    listMessages,
    listThreadIds,
    listMessagesAfter,
    listReplies,
    readHistory,
    resetConversationPreferences,
    resetThread,
    resolveActivity,
    searchHistory,
    setMessageRuntime,
    setThread,
    updateBot,
    updateConversation,
    updateConversationPreferences,
    updateMemory,
  };
}
