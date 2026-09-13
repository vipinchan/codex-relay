import { describe, expect, it, vi } from "vitest";

import { navigateModelPickerBack } from "./model-picker-navigation";

describe("navigateModelPickerBack", () => {
  it("returns from a model subsection without changing the selected model", () => {
    const collapseAdvancedSection = vi.fn();
    const returnToCompactPower = vi.fn();

    navigateModelPickerBack("model", collapseAdvancedSection, returnToCompactPower);

    expect(collapseAdvancedSection).toHaveBeenCalledOnce();
    expect(returnToCompactPower).not.toHaveBeenCalled();
  });

  it("returns from the advanced summary to compact power", () => {
    const collapseAdvancedSection = vi.fn();
    const returnToCompactPower = vi.fn();

    navigateModelPickerBack(undefined, collapseAdvancedSection, returnToCompactPower);

    expect(collapseAdvancedSection).not.toHaveBeenCalled();
    expect(returnToCompactPower).toHaveBeenCalledOnce();
  });
});
