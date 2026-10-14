import type { CodexAppServerClient, AppServerTurn } from "./app-server.js";

const maxContextCharacters = 1_200;
const maxTitleCharacters = 120;
const titleTurnTimeoutMs = 45_000;

export type TitleGenerationContext = {
  firstPrompt: string;
  recentPrompt?: string;
  recentResponse?: string;
};

export function buildTitleGenerationPrompt(context: TitleGenerationContext) {
  const sections = [
    "Generate a concise, specific title for this Codex conversation.",
    "Use only the supplied excerpts. Do not inspect files or use tools.",
    "Use the same language as the first user message. Return only the title, without quotes or explanation.",
    `First user message:\n${boundedText(context.firstPrompt)}`,
  ];

  if (context.recentPrompt && context.recentPrompt !== context.firstPrompt) {
    sections.push(`Latest user message:\n${boundedText(context.recentPrompt)}`);
  }
  if (context.recentResponse) {
    sections.push(`Latest assistant response:\n${boundedText(context.recentResponse)}`);
  }

  return sections.join("\n\n");
}

export function normalizeGeneratedTitle(value: string) {
  const firstLine = value
    .split(/\r?\n/, 1)[0]
    ?.trim()
    .replace(/^#{1,6}\s*/, "")
    .replace(/^(["'“‘「『])(.+)(["'”’」』])$/, "$2")
    .trim();
  if (!firstLine) {
    return undefined;
  }
  return Array.from(firstLine).slice(0, maxTitleCharacters).join("");
}

export async function generateTitleWithAppServer(input: {
  appServer: Pick<
    CodexAppServerClient,
    "archiveThread" | "onNotification" | "startThread" | "startTurn"
  >;
  context: TitleGenerationContext;
  cwd: string;
  effort?: string;
  model?: string;
  onThreadCreated?: (threadId: string) => void;
  serviceTier?: string;
}) {
  const titleThread = await input.appServer.startThread({
    approvalPolicy: "never",
    cwd: input.cwd,
    model: input.model ?? null,
    sandbox: "read-only",
    serviceTier: input.serviceTier ?? null,
    threadSource: "codex-relay-title",
  });
  input.onThreadCreated?.(titleThread.id);

  try {
    const terminalTurns = new Map<string, { method: string; turn?: AppServerTurn }>();
    const waiters = new Map<
      string,
      { reject(error: Error): void; resolve(value: { method: string; turn?: AppServerTurn }): void }
    >();
    const unsubscribe = input.appServer.onNotification((notification) => {
      if (
        !["turn/completed", "turn/failed", "turn/aborted", "turn/cancelled"].includes(
          notification.method,
        )
      ) {
        return;
      }
      const params = objectRecord(notification.params);
      if (params?.threadId !== titleThread.id) {
        return;
      }
      const turn = appServerTurn(params?.turn);
      const turnId = turn?.id ?? (typeof params?.turnId === "string" ? params.turnId : undefined);
      if (!turnId) {
        return;
      }
      const terminal = { method: notification.method, turn };
      terminalTurns.set(turnId, terminal);
      waiters.get(turnId)?.resolve(terminal);
    });

    try {
      const turn = await input.appServer.startTurn({
        approvalPolicy: "never",
        cwd: input.cwd,
        effort: input.effort ?? null,
        input: [
          { type: "text", text: buildTitleGenerationPrompt(input.context), text_elements: [] },
        ],
        model: input.model ?? null,
        serviceTier: input.serviceTier ?? null,
        threadId: titleThread.id,
      });
      const directTerminalMethod = terminalTurnMethod(turn);
      const terminal = directTerminalMethod
        ? { method: directTerminalMethod, turn }
        : await waitForTerminalTurn(turn.id, terminalTurns, waiters);
      if (terminal.method !== "turn/completed" || !terminal.turn) {
        throw new Error("Codex did not complete title generation.");
      }
      const response = terminal.turn.items
        .filter(
          (item): item is Extract<AppServerTurn["items"][number], { type: "agentMessage" }> =>
            item.type === "agentMessage" &&
            "text" in item &&
            (!("delivery" in item) || item.delivery !== "async"),
        )
        .map((item) => item.text)
        .join("\n")
        .trim();
      const title = normalizeGeneratedTitle(response);
      if (!title) {
        throw new Error("Codex returned an empty title.");
      }
      return title;
    } finally {
      unsubscribe();
    }
  } finally {
    await input.appServer.archiveThread({ threadId: titleThread.id }).catch(() => undefined);
  }
}

function waitForTerminalTurn(
  turnId: string,
  terminalTurns: Map<string, { method: string; turn?: AppServerTurn }>,
  waiters: Map<
    string,
    { reject(error: Error): void; resolve(value: { method: string; turn?: AppServerTurn }): void }
  >,
) {
  const existing = terminalTurns.get(turnId);
  if (existing) {
    return Promise.resolve(existing);
  }
  return new Promise<{ method: string; turn?: AppServerTurn }>((resolve, reject) => {
    const timeout = setTimeout(() => {
      waiters.delete(turnId);
      reject(new Error("Timed out while generating a conversation title."));
    }, titleTurnTimeoutMs);
    waiters.set(turnId, {
      reject,
      resolve(value) {
        clearTimeout(timeout);
        waiters.delete(turnId);
        resolve(value);
      },
    });
  });
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function appServerTurn(value: unknown): AppServerTurn | undefined {
  const record = objectRecord(value);
  return typeof record?.id === "string" && Array.isArray(record.items)
    ? (record as unknown as AppServerTurn)
    : undefined;
}

function terminalTurnMethod(turn: AppServerTurn) {
  const status = objectRecord(turn.status)?.type ?? turn.status;
  if (typeof status !== "string") {
    return undefined;
  }
  switch (status.toLowerCase()) {
    case "completed":
      return "turn/completed";
    case "failed":
      return "turn/failed";
    case "aborted":
      return "turn/aborted";
    case "cancelled":
    case "canceled":
      return "turn/cancelled";
    default:
      return undefined;
  }
}

function boundedText(value: string) {
  const normalized = value.trim();
  const characters = Array.from(normalized);
  if (characters.length <= maxContextCharacters) {
    return normalized;
  }
  return `${characters.slice(0, maxContextCharacters).join("")}…`;
}
