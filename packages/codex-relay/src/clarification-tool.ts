import { z } from "zod";

import type { PendingInputRequestQuestion } from "./api-schema.js";
import type { AppServerRequest, AppServerThreadStartParams } from "./app-server.js";

const modes = ["single", "multi", "text"] as const;
const name = "relay_ask_user";
const optionSchema = z.object({
  label: z.string().trim().min(1).max(120),
  description: z.string().trim().max(300).optional(),
});
const questionSchema = z.object({
  id: z.string().trim().min(1).max(80),
  header: z.string().trim().min(1).max(120).optional(),
  question: z.string().trim().min(1).max(500),
  mode: z.enum(modes),
  options: z.array(optionSchema).max(10).optional(),
});
const argumentsSchema = z.object({
  questions: z.array(questionSchema).min(1).max(3),
});

export const clarificationTool = {
  type: "function",
  name,
  description:
    "Ask the user for information or a decision that materially affects the task. Use single for mutually exclusive choices, multi for independently selectable answers, or text for free-form input. Ask the most important unresolved question first. Use the returned answers to continue. If the user cancels, do not treat any option as their choice.",
  inputSchema: z.toJSONSchema(argumentsSchema),
} satisfies NonNullable<AppServerThreadStartParams["dynamicTools"]>[number];

export function isClarificationRequest(request: AppServerRequest) {
  const params = request.params;
  return (
    request.method === "item/tool/call" &&
    params !== null &&
    typeof params === "object" &&
    "tool" in params &&
    params.tool === name
  );
}

export function clarificationQuestions(value: unknown): PendingInputRequestQuestion[] | undefined {
  const parsed = argumentsSchema.safeParse(value);
  if (!parsed.success) return undefined;
  const { questions } = parsed.data;
  if (new Set(questions.map((question) => question.id)).size !== questions.length) return undefined;
  if (
    questions.some(({ mode, options = [] }) =>
      mode === "text"
        ? options.length > 0
        : options.length < 2 || new Set(options.map(({ label }) => label)).size !== options.length,
    )
  )
    return undefined;
  return questions;
}

export function clarificationResponse(
  questions: PendingInputRequestQuestion[],
  values?: string[][],
) {
  const result =
    values === undefined
      ? { cancelled: true }
      : {
          answers: Object.fromEntries(
            questions.map((question, index) => {
              const answers = values[index]?.map((value) => value.trim()) ?? [];
              if (
                answers.length === 0 ||
                answers.some((value) => !value || value.length > 4000) ||
                new Set(answers).size !== answers.length ||
                (question.mode === "multi"
                  ? answers.length > 1 &&
                    answers.some((value) => !question.options?.some(({ label }) => label === value))
                  : answers.length !== 1)
              ) {
                throw new Error("Invalid answer for the clarification request.");
              }
              return [question.id, answers];
            }),
          ),
        };
  if (values && values.length !== questions.length) throw new Error("Invalid answer count.");
  return { success: true, contentItems: [{ type: "inputText", text: JSON.stringify(result) }] };
}
