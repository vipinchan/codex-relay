import type { AppServerModel, CodexAppServerClient, AppServerTurn } from "./app-server.js";

const maxContextCharacters = 1_200;
const maxTitleDisplayUnits = 24;
const titleTurnTimeoutMs = 45_000;
type TitleModelOption = Pick<
  AppServerModel,
  "defaultReasoningEffort" | "id" | "isDefault" | "supportedReasoningEfforts"
>;

export type TitleGenerationContext = {
  firstPrompt: string;
  recentPrompt?: string;
};

export function selectTitleGenerationModel(models: TitleModelOption[], conversationModel?: string) {
  const supportsLowEffort = (model: TitleModelOption) =>
    model.supportedReasoningEfforts?.some((option) => option.reasoningEffort === "low") ?? false;
  const defaultModel = models.find((model) => model.isDefault);
  const model =
    (defaultModel && supportsLowEffort(defaultModel) ? defaultModel : undefined) ??
    models.find(supportsLowEffort) ??
    defaultModel ??
    models.find((candidate) => candidate.id === conversationModel) ??
    models[0];
  const supportedEfforts = model?.supportedReasoningEfforts?.map(
    (option) => option.reasoningEffort,
  );

  return {
    effort: supportedEfforts?.includes("low")
      ? "low"
      : (model?.defaultReasoningEffort ?? supportedEfforts?.[0] ?? "low"),
    model: model?.id ?? conversationModel,
  };
}

export function buildTitleGenerationPrompt(context: TitleGenerationContext) {
  const sections = [
    "Generate a concise, specific title for this Codex conversation. Keep it short enough to fit on one line in a mobile conversation list.",
    "Use only the supplied excerpts. Do not inspect files or use tools.",
    "Use the same language as the first user message. Return only the title, without quotes or explanation.",
    "Aim for 10–12 Chinese characters or at most 24 English characters including spaces.",
    `First user message:\n${boundedText(context.firstPrompt)}`,
  ];

  if (context.recentPrompt && context.recentPrompt !== context.firstPrompt) {
    sections.push(`Latest user message:\n${boundedText(context.recentPrompt)}`);
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
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const characters: string[] = [];
  let displayUnits = 0;
  let wasTruncated = false;

  for (const { segment } of segmenter.segment(firstLine)) {
    const units = isWideTitleCharacter(segment) ? 2 : 1;
    if (displayUnits + units > maxTitleDisplayUnits) {
      wasTruncated = true;
      break;
    }
    characters.push(segment);
    displayUnits += units;
  }

  let title = characters.join("").trim();
  if (wasTruncated && /[A-Za-z0-9]/u.test(title)) {
    const lastWordBoundary = title.lastIndexOf(" ");
    if (lastWordBoundary > 0) {
      title = title.slice(0, lastWordBoundary).trimEnd();
    }
  }
  return title.replace(/[\s,.;:!?—–-]+$/u, "") || undefined;
}

function isWideTitleCharacter(value: string) {
  return /[\u1100-\u115f\u2329\u232a\u2e80-\ua4c6\ua960-\ua97c\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe19\ufe30-\ufe6f\uff00-\uff60\uffe0-\uffe6\u{1f000}-\u{1faff}\u{20000}-\u{3fffd}]/u.test(
    value,
  );
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
