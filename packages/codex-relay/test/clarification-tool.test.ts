import { describe, expect, it } from "vitest";

import { clarificationQuestions, clarificationResponse } from "../src/clarification-tool.js";

describe("Relay clarification tool", () => {
  const questions = [
    {
      id: "topics",
      question: "Which topics?",
      mode: "multi" as const,
      options: [{ label: "Costs" }, { label: "Risks" }],
    },
    { id: "context", question: "What else?", mode: "text" as const },
  ];

  it("preserves the mode and sends a separate value for every selection", () => {
    expect(clarificationQuestions({ questions })).toEqual(questions);
    const response = clarificationResponse(questions, [["Costs", "Risks"], ["Some context"]]);
    expect(JSON.parse(response.contentItems[0].text)).toEqual({
      answers: { topics: ["Costs", "Risks"], context: ["Some context"] },
    });
  });

  it("rejects invalid options and duplicate question IDs", () => {
    expect(clarificationQuestions({ questions: [questions[0], questions[0]] })).toBeUndefined();
    expect(() => clarificationResponse(questions, [["Costs", "Unknown"], [""]])).toThrow(
      "Invalid answer for the clarification request.",
    );
  });

  it("reports cancellation without providing inferred answers", () => {
    expect(JSON.parse(clarificationResponse(questions).contentItems[0].text)).toEqual({
      cancelled: true,
    });
  });
});
