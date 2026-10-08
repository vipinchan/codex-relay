import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { readRolloutHistoryPage } from "../src/rollout-history-page.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function writeRollout(records: unknown[]) {
  const directory = await mkdtemp(join(tmpdir(), "codex-relay-rollout-page-"));
  directories.push(directory);
  const path = join(directory, "rollout.jsonl");
  await writeFile(path, records.map((record) => JSON.stringify(record)).join("\n") + "\n");
  return path;
}

describe("readRolloutHistoryPage", () => {
  it("returns complete recent turns and a stable cursor without reading the whole rollout", async () => {
    const records: unknown[] = [{ type: "session_meta", payload: { id: "thread-1" } }];
    for (let turn = 0; turn < 200; turn += 1) {
      const turnId = `turn-${turn}`;
      records.push({ type: "event_msg", payload: { type: "task_started", turn_id: turnId } });
      records.push({ type: "event_msg", payload: { type: "turn_context", turn_id: turnId } });
      records.push({ type: "event_msg", payload: { type: "turn_context", turn_id: turnId } });
      records.push({
        type: "event_msg",
        payload: { type: "user_message", message: `question-${turn}` },
      });
      records.push({
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: `question-${turn}` }],
        },
      });
      records.push({
        type: "event_msg",
        payload: { type: "patch_apply_end", patch: "x".repeat(1024) },
      });
      records.push({
        type: "event_msg",
        payload: { type: "agent_message", message: `answer-${turn}` },
      });
    }
    const path = await writeRollout(records);
    const first = await readRolloutHistoryPage(path, { limit: 20 });
    const second = await readRolloutHistoryPage(path, {
      limit: 20,
      cursor: first.olderOffset ?? undefined,
    });

    expect(first.lines).toHaveLength(20 * 7);
    expect(JSON.parse(first.lines[0]!.text).payload.turn_id).toBe("turn-180");
    expect(JSON.parse(first.lines.at(-1)!.text).payload.message).toBe("answer-199");
    expect(second.lines).toHaveLength(20 * 7);
    expect(JSON.parse(second.lines[0]!.text).payload.turn_id).toBe("turn-160");
    expect(second.lines.at(-1)!.offset).toBeLessThan(first.lines[0]!.offset);
    expect(first.olderOffset).toBe(first.lines[0]!.offset);
    expect(second.olderOffset).toBe(second.lines[0]!.offset);
    expect(first.bytesRead).toBeLessThan((200 * 1024) / 2);
    expect(
      first.lines.every(
        (line, index) => index === 0 || line.offset > first.lines[index - 1]!.offset,
      ),
    ).toBe(true);
  });

  it("skips an incomplete trailing line and keeps UTF-8 byte offsets stable", async () => {
    const path = await writeRollout([
      { type: "event_msg", payload: { type: "task_started", turn_id: "一" } },
      { type: "event_msg", payload: { type: "agent_message", message: "你好" } },
      { type: "event_msg", payload: { type: "task_started", turn_id: "二" } },
      { type: "event_msg", payload: { type: "agent_message", message: "世界" } },
    ]);
    const { appendFile } = await import("node:fs/promises");
    await appendFile(path, '{"type":"event_msg","payload":');
    const newest = await readRolloutHistoryPage(path, { limit: 1 });
    const older = await readRolloutHistoryPage(path, { limit: 1, cursor: newest.olderOffset! });
    expect(newest.lines).toHaveLength(2);
    expect(JSON.parse(newest.lines[0]!.text).payload.turn_id).toBe("二");
    expect(older.lines).toHaveLength(2);
    expect(JSON.parse(older.lines[0]!.text).payload.turn_id).toBe("一");
    expect(older.olderOffset).toBeNull();
  });

  it("uses distinct turn_context IDs when task_started markers are absent", async () => {
    const path = await writeRollout(
      Array.from({ length: 5 }, (_, index) => [
        { type: "event_msg", payload: { type: "turn_context", turn_id: `turn-${index}` } },
        { type: "event_msg", payload: { type: "turn_context", turn_id: `turn-${index}` } },
        { type: "event_msg", payload: { type: "agent_message", message: `answer-${index}` } },
      ]).flat(),
    );
    const page = await readRolloutHistoryPage(path, { limit: 2 });
    expect(page.lines).toHaveLength(6);
    expect(JSON.parse(page.lines[0]!.text).payload.turn_id).toBe("turn-3");
    expect(page.olderOffset).toBe(page.lines[0]!.offset);
  });

  it("uses top-level turn_context boundaries even with repeated user records or no user message", async () => {
    const records: unknown[] = [];
    for (let turn = 0; turn < 5; turn += 1) {
      records.push({ type: "turn_context", payload: { turn_id: `turn-${turn}` } });
      records.push({ type: "turn_context", payload: { turn_id: `turn-${turn}` } });
      if (turn !== 3) {
        records.push({
          type: "event_msg",
          payload: { type: "user_message", message: `question-${turn}` },
        });
        records.push({
          type: "event_msg",
          payload: { type: "user_message", message: `injected-${turn}` },
        });
      }
      records.push({
        type: "event_msg",
        payload: { type: "agent_message", message: `answer-${turn}` },
      });
    }
    const path = await writeRollout(records);
    const page = await readRolloutHistoryPage(path, { limit: 2 });
    expect(page.lines).toHaveLength(8);
    expect(JSON.parse(page.lines[0]!.text).payload.turn_id).toBe("turn-3");
    expect(JSON.parse(page.lines.at(-1)!.text).payload.message).toBe("answer-4");
    const older = await readRolloutHistoryPage(path, { limit: 2, cursor: page.olderOffset! });
    expect(JSON.parse(older.lines[0]!.text).payload.turn_id).toBe("turn-1");
  });

  it("falls back to user_message boundaries for unmarked legacy rollouts", async () => {
    const path = await writeRollout(
      Array.from({ length: 4 }, (_, index) => [
        { type: "event_msg", payload: { type: "user_message", message: `question-${index}` } },
        {
          type: "response_item",
          payload: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: `question-${index}` }],
          },
        },
        { type: "event_msg", payload: { type: "agent_message", message: `answer-${index}` } },
      ]).flat(),
    );
    const page = await readRolloutHistoryPage(path, { limit: 2 });
    expect(page.lines).toHaveLength(6);
    expect(JSON.parse(page.lines[0]!.text).payload.message).toBe("question-2");
  });

  it("reads a single large UTF-8 line across multiple chunks", async () => {
    const path = await writeRollout([
      { type: "event_msg", payload: { type: "task_started", turn_id: "old" } },
      { type: "event_msg", payload: { type: "agent_message", message: "old answer" } },
      { type: "event_msg", payload: { type: "task_started", turn_id: "new" } },
      { type: "event_msg", payload: { type: "agent_message", message: "界".repeat(40_000) } },
    ]);
    const page = await readRolloutHistoryPage(path, { limit: 1 });
    expect(page.lines).toHaveLength(2);
    expect(JSON.parse(page.lines[1]!.text).payload.message).toBe("界".repeat(40_000));
    expect(page.bytesRead).toBeGreaterThan(64 * 1024);
    const older = await readRolloutHistoryPage(path, { limit: 1, cursor: page.olderOffset! });
    expect(older.lines).toHaveLength(2);
    expect(JSON.parse(older.lines[0]!.text).payload.turn_id).toBe("old");
  });

  it("terminates when a 64KB read begins exactly on a newline", async () => {
    const directory = await mkdtemp(join(tmpdir(), "codex-relay-rollout-boundary-"));
    directories.push(directory);
    const path = join(directory, "rollout.jsonl");
    const start = JSON.stringify({
      type: "event_msg",
      payload: { type: "task_started", turn_id: "one" },
    });
    const message = { type: "event_msg", payload: { type: "agent_message", message: "" } };
    const baseLength = JSON.stringify(message).length;
    message.payload.message = "x".repeat(65_534 - baseLength);
    await writeFile(path, `${start}\n${JSON.stringify(message)}\n`);
    const moduleUrl = new URL("../src/rollout-history-page.ts", import.meta.url).href;
    const result = execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        `const { readRolloutHistoryPage } = await import(${JSON.stringify(moduleUrl)}); const page = await readRolloutHistoryPage(process.env.ROLLOUT_PAGE_TEST_PATH, { limit: 1 }); process.stdout.write(String(page.lines.length));`,
      ],
      {
        cwd: join(import.meta.dirname, ".."),
        env: { ...process.env, ROLLOUT_PAGE_TEST_PATH: path },
        timeout: 2_000,
      },
    ).toString();
    expect(result).toBe("2");
  });

  it("finds turn markers after a large session_meta record and keeps turns intact", async () => {
    const records: unknown[] = [
      { type: "session_meta", payload: { instructions: "x".repeat(140 * 1024) } },
    ];
    for (let turn = 0; turn < 400; turn += 1) {
      records.push({
        type: "event_msg",
        payload: { type: "task_started", turn_id: `turn-${turn}` },
      });
      records.push({ type: "turn_context", payload: { turn_id: `turn-${turn}` } });
      if (turn % 5 !== 0) {
        records.push({
          type: "event_msg",
          payload: { type: "user_message", message: `question-${turn}` },
        });
        records.push({
          type: "event_msg",
          payload: { type: "user_message", message: `injected-${turn}` },
        });
      }
      records.push({
        type: "event_msg",
        payload: { type: "agent_message", message: `answer-${turn}-${"z".repeat(1024)}` },
      });
    }
    const path = await writeRollout(records);
    const page = await readRolloutHistoryPage(path, { limit: 20 });
    expect(JSON.parse(page.lines[0]!.text).payload.turn_id).toBe("turn-380");
    expect(
      page.lines.filter((line) => JSON.parse(line.text).payload?.type === "task_started"),
    ).toHaveLength(20);
    expect(page.lines.at(-1)!.text).toContain("answer-399");
    expect(page.olderOffset).toBe(page.lines[0]!.offset);
    const { stat } = await import("node:fs/promises");
    expect(page.bytesRead).toBeLessThan((await stat(path)).size / 2);
  });
});
