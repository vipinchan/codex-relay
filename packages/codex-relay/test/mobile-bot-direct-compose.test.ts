import { describe, expect, it } from "vitest";

import {
  botComposerKey,
  createBotSubmission,
  remainingBotDraft,
} from "../../../apps/mobile/src/components/bots/bot-direct-compose.js";

describe("private BOT composer submissions", () => {
  it("isolates drafts by relay and BOT conversation", () => {
    expect(botComposerKey("https://one", "conversation")).not.toBe(
      botComposerKey("https://two", "conversation"),
    );
    expect(botComposerKey("https://one", "conversation")).not.toBe("conversation");
  });

  it("keeps the submitted images and skill references stable across retry", () => {
    const attachment = { id: "image-1", uri: "file:///photo", path: "/uploaded/one.jpg" };
    const skill = { name: "research", path: "/skills/research/SKILL.md" };
    const submission = createBotSubmission("request-1", {
      text: "  compare these  ",
      attachments: [attachment],
      skills: [skill],
    });
    attachment.path = "/uploaded/changed.jpg";
    skill.path = "/skills/changed/SKILL.md";
    expect(submission.requestId).toBe("request-1");
    expect(submission.text).toBe("compare these");
    expect(submission.attachments?.[0].path).toBe("/uploaded/one.jpg");
    expect(submission.skills?.[0].path).toBe("/skills/research/SKILL.md");
  });

  it("preserves edits and new images made while a previous request was being sent", () => {
    const first = { id: "first", uri: "file:///one", path: "/uploaded/one.jpg" };
    const second = { id: "second", uri: "file:///two", path: "/uploaded/two.jpg" };
    const submission = createBotSubmission("request-1", {
      text: "First question",
      attachments: [first],
      skills: [{ name: "research", path: "/skills/research" }],
    });
    expect(
      remainingBotDraft(
        {
          text: "Next question",
          attachments: [first, second],
          skills: [
            { name: "research", path: "/skills/research" },
            { name: "writing", path: "/skills/writing" },
          ],
        },
        submission,
      ),
    ).toEqual({
      text: "Next question",
      attachments: [second],
      skills: [{ name: "writing", path: "/skills/writing" }],
    });
  });

  it("allows image-only prompts without inserting a fake user question", () => {
    expect(
      createBotSubmission("request-image", {
        text: "",
        attachments: [{ id: "photo", uri: "file:///photo", path: "/uploaded/photo.jpg" }],
        skills: [],
      }).text,
    ).toBe("");
  });
});
