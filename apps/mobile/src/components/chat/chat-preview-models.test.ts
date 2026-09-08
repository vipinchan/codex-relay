import { describe, expect, it } from "vitest";

import { modelsForPicker, previewModels } from "./chat-preview-models";

describe("modelsForPicker", () => {
  it("restores the full picker catalog when the relay falls back to Astra only", () => {
    const serverAstra = {
      ...previewModels[0],
      description: "Server-provided Astra metadata",
    };

    const models = modelsForPicker([serverAstra]);

    expect(models.map((model) => model.model)).toEqual(previewModels.map((model) => model.model));
    expect(models[0]).toBe(serverAstra);
  });

  it("leaves a normal dynamic model catalog unchanged", () => {
    const models = previewModels.slice(0, 2);

    expect(modelsForPicker(models)).toBe(models);
  });

  it("does not expand a legitimate single non-Astra model", () => {
    const models = [previewModels[1]];

    expect(modelsForPicker(models)).toBe(models);
  });
});
