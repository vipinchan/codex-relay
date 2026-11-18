import { describe, expect, it } from "vitest";

import {
  groupSettingsPatch,
  toggleGroupSettingsMember,
  validGroupSettings,
} from "./bot-group-settings";

const saved = { name: "Team", workspacePath: "/work/old", botIds: ["a", "b"], defaultBotId: "b" };

describe("group settings", () => {
  it("omits the workspace when renaming a group, including surrounding path whitespace", () => {
    expect(
      groupSettingsPatch(saved, { ...saved, name: " New team ", workspacePath: " /work/old " }),
    ).toEqual({ name: "New team" });
  });

  it("sends a changed workspace without resending unrelated settings", () => {
    expect(groupSettingsPatch(saved, { ...saved, workspacePath: " /work/new " })).toEqual({
      workspacePath: "/work/new",
    });
  });

  it("requires choosing a new default when the current default is removed", () => {
    const draft = toggleGroupSettingsMember(saved, "b");
    expect(draft.botIds).toEqual(["a"]);
    expect(draft.defaultBotId).toBe("");
    expect(validGroupSettings(draft)).toBe(false);
    expect(validGroupSettings({ ...draft, defaultBotId: "a" })).toBe(true);
  });

  it("requires an absolute workspace path and at least one member", () => {
    expect(validGroupSettings({ ...saved, workspacePath: "work/new" })).toBe(false);
    expect(validGroupSettings({ ...saved, botIds: [] })).toBe(false);
  });
});
