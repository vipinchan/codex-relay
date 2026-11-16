import { describe, expect, it } from "vitest";
import { computerChangeDestination } from "./computer-navigation";

describe("navigation after changing the selected computer", () => {
  it.each(["/settings-tab", "/settings", "/settings-home"])(
    "keeps %s in the Settings tab with or without a paired computer",
    (pathname) => {
      expect(computerChangeDestination(pathname, true)).toBe("/settings-tab");
      expect(computerChangeDestination(pathname, false)).toBe("/settings-tab");
    },
  );

  it.each(["/chat", "/bot-chat/conversation", "/preview", "/"])(
    "leaves computer-specific routes at %s",
    (pathname) => {
      expect(computerChangeDestination(pathname, true)).toBe("/chat");
      expect(computerChangeDestination(pathname, false)).toBe("/");
    },
  );
});
