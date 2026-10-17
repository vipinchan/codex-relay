import { describe, expect, it } from "vitest";

import { botModelUnavailable, botUpdatePayload } from "./bot-editor-config";

describe("BOT editor configuration", () => {
  it("clears previously saved model preferences when default is restored", () => {
    expect(
      botUpdatePayload({
        name: " Assistant ",
        color: "#6EA8FF",
        instructions: " Help ",
        model: undefined,
        reasoningEffort: undefined,
        serviceTier: undefined,
        runtimeMode: "default",
      }),
    ).toMatchObject({
      name: "Assistant",
      instructions: "Help",
      model: null,
      reasoningEffort: null,
      serviceTier: null,
    });
  });

  it("clears stale reasoning and service tier overrides when model is changed", () => {
    const payload = botUpdatePayload({
      name: "A",
      color: "#4778d9",
      instructions: "",
      model: "GPT-6-Luna",
      reasoningEffort: "medium",
      serviceTier: undefined,
      runtimeMode: "default",
    });
    expect(payload).toEqual({
      name: "A",
      color: "#4778d9",
      instructions: "",
      model: "GPT-6-Luna",
      reasoningEffort: "medium",
      serviceTier: null,
      runtimeMode: "default",
    });
    expect(
      botUpdatePayload({
        name: "A",
        color: "#4778d9",
        instructions: "",
        model: "new-model",
        reasoningEffort: undefined,
        serviceTier: undefined,
        runtimeMode: "default",
      }),
    ).toMatchObject({ reasoningEffort: null, serviceTier: null });
  });

  it("keeps saved model settings while the catalog is unavailable, then identifies a removed model", () => {
    expect(botModelUnavailable("removed-model", false, [])).toBe(false);
    expect(botModelUnavailable("removed-model", true, [])).toBe(true);
  });
});
