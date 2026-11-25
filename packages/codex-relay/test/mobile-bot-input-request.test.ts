import { describe, expect, it } from "vitest";

import {
  inputRequestAnswers,
  inputRequestQuestions,
} from "../../../apps/mobile/src/components/chat/input-request-answers.js";

describe("structured input requests", () => {
  it("reads the question options and preserves their descriptions", () => {
    expect(
      inputRequestQuestions([
        {
          id: "audience",
          question: "Who is this for?",
          options: [
            { label: "Beginners", description: "New to the subject" },
            { label: "Experts" },
          ],
        },
      ]),
    ).toEqual([
      {
        id: "audience",
        question: "Who is this for?",
        options: [{ label: "Beginners", description: "New to the subject" }, { label: "Experts" }],
      },
    ]);
  });

  it("sends one answer per question in order, including free-form answers", () => {
    const questions = inputRequestQuestions([
      { id: "audience", question: "Who?", options: [{ label: "Beginners" }] },
      { id: "goal", question: "What is the goal?" },
    ]);
    expect(
      inputRequestAnswers(
        questions,
        new Map([
          ["audience", ["Beginners"]],
          ["goal", ["  Learn  "]],
        ]),
      ),
    ).toEqual([["Beginners"], ["Learn"]]);
    expect(inputRequestAnswers(questions, new Map([["audience", ["Beginners"]]]))).toBeUndefined();
  });

  it("keeps all checked values together for a multi-select question", () => {
    const questions = inputRequestQuestions([
      {
        id: "topics",
        question: "Which topics?",
        mode: "multi",
        options: [{ label: "Costs" }, { label: "Risks" }],
      },
    ]);
    expect(questions[0].mode).toBe("multi");
    expect(inputRequestAnswers(questions, new Map([["topics", ["Costs", "Risks"]]]))).toEqual([
      ["Costs", "Risks"],
    ]);
  });
});
