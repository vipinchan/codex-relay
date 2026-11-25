export type InputRequestQuestion = {
  id: string;
  question: string;
  header?: string;
  mode?: "single" | "multi" | "text";
  options?: { label: string; description?: string }[];
};

export function inputRequestQuestions(value: unknown): InputRequestQuestion[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const question = item as Record<string, unknown>;
    if (typeof question.id !== "string" || typeof question.question !== "string") return [];
    const options = Array.isArray(question.options)
      ? question.options.flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const option = item as Record<string, unknown>;
          if (typeof option.label !== "string") return [];
          return [
            {
              label: option.label,
              ...(typeof option.description === "string"
                ? { description: option.description }
                : {}),
            },
          ];
        })
      : undefined;
    return [
      {
        id: question.id,
        question: question.question,
        ...(typeof question.header === "string" ? { header: question.header } : {}),
        ...(question.mode === "single" || question.mode === "multi" || question.mode === "text"
          ? { mode: question.mode }
          : {}),
        ...(options ? { options } : {}),
      },
    ];
  });
}

export function inputRequestAnswers(
  questions: InputRequestQuestion[],
  answers: ReadonlyMap<string, readonly string[]>,
): string[][] | undefined {
  const result = questions.map((question) =>
    (answers.get(question.id) ?? []).map((answer) => answer.trim()).filter(Boolean),
  );
  return result.length > 0 && result.every((group) => group.length > 0) ? result : undefined;
}
