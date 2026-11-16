import { describe, expect, it } from "vitest";

import appConfig from "../../app.config";

describe("native appearance", () => {
  it("allows the operating system appearance to change", () => {
    expect(appConfig({} as Parameters<typeof appConfig>[0]).userInterfaceStyle).toBe("automatic");
  });
});
