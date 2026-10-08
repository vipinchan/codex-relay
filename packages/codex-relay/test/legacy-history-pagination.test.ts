import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";

describe("legacy rollout history pagination", () => {
  it("opens and pages a long rollout without asking Codex to replay its full history", async () => {
    const directory = await mkdtemp(join(tmpdir(), "relay-long-rollout-"));
    try {
      const path = join(directory, "history.jsonl");
      const records = [JSON.stringify({ type: "session_meta", payload: { id: "legacy-thread" } })];
      for (let index = 0; index < 1000; index += 1) {
        for (const payload of [
          { type: "task_started", turn_id: `turn-${index}` },
          { type: "user_message", message: `Question ${index}` },
          { type: "agent_message", message: `Answer ${index}` },
          { type: "task_complete" },
        ]) {
          records.push(
            JSON.stringify({
              type: "event_msg",
              timestamp: new Date((index + 1) * 1000).toISOString(),
              payload,
            }),
          );
        }
      }
      await writeFile(path, records.join("\n") + "\n");
      const readThread = vi.fn<() => Promise<unknown>>(async () => ({
        id: "legacy-thread",
        parentThreadId: null,
        createdAt: 1,
        updatedAt: 1001,
        cwd: directory,
        path,
        source: "app",
        modelProvider: "openai",
        name: "Legacy",
        preview: "Legacy",
        status: { type: "idle" },
        historyMode: "legacy",
      }));
      const listThreadTurns = vi.fn<() => Promise<never>>(async () => {
        throw new Error("Must not replay the rollout");
      });
      const app = createApp({
        codex: {} as never,
        appServer: {
          readThread,
          listThreadTurns,
          onNotification: () => () => undefined,
          onRequest: () => () => undefined,
        } as never,
      });
      const messages: { id: string; content: string; turnId: string }[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const query = new URLSearchParams({ limit: "20" });
        if (cursor) query.set("cursor", cursor);
        const response = await app.request(`/v1/threads/legacy-thread?${query}`);
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.messages.length).toBeLessThanOrEqual(40);
        messages.unshift(...body.messages);
        cursor = body.olderMessagesCursor;
        pages += 1;
        expect(pages).toBeLessThanOrEqual(50);
      } while (cursor);
      expect(pages).toBe(50);
      expect(messages).toHaveLength(2000);
      expect(new Set(messages.map((message) => message.id)).size).toBe(2000);
      expect(messages[0]).toMatchObject({ content: "Question 0", turnId: "turn-0" });
      expect(messages.at(-1)).toMatchObject({ content: "Answer 999", turnId: "turn-999" });
      expect(listThreadTurns).not.toHaveBeenCalled();
      expect(readThread).toHaveBeenCalledTimes(50);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
