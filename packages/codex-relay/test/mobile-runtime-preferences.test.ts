import { describe, expect, it } from "vitest";
import type { RuntimePreferences, ThreadSummary } from "../src/api-schema.js";

import {
  runtimePreferencesForThread,
  runtimePreferencesForWorkspace,
  runtimePreferencesScope,
} from "../../../apps/mobile/src/lib/runtime-preferences.js";

describe("mobile runtime preferences", () => {
  it("uses pending workspace selections before global defaults", () => {
    const fallback: RuntimePreferences = {
      model: "global-model",
      serviceTier: "priority",
      reasoningEffort: "medium",
      runtimeMode: "default",
    };
    const pending: RuntimePreferences = {
      model: "pending-model",
      serviceTier: "priority",
      reasoningEffort: "high",
      runtimeMode: "full-access",
    };

    expect(runtimePreferencesForWorkspace(pending, fallback)).toEqual(pending);
  });

  it("uses global defaults when workspace has no override", () => {
    const fallback: RuntimePreferences = {
      model: "global-model",
      serviceTier: "priority",
      reasoningEffort: "medium",
      runtimeMode: "default",
    };

    expect(runtimePreferencesForWorkspace(undefined, fallback)).toEqual(fallback);
  });

  it("uses workspace preferences as one workspace-scoped selection", () => {
    const fallback: RuntimePreferences = {
      model: "global-model",
      serviceTier: "priority",
      reasoningEffort: "medium",
      runtimeMode: "default",
    };

    expect(runtimePreferencesForWorkspace({ runtimeMode: "auto" }, fallback)).toEqual({
      runtimeMode: "auto",
    });
  });

  it("uses workspace model and reasoning instead of stale thread-scoped values", () => {
    const fallback: RuntimePreferences = {
      model: "global-model",
      serviceTier: "priority",
      reasoningEffort: "medium",
      runtimeMode: "default",
    };
    const workspace: RuntimePreferences = {
      model: "workspace-model",
      serviceTier: "priority",
      reasoningEffort: "high",
      runtimeMode: "full-access",
    };

    expect(runtimePreferencesForWorkspace(workspace, fallback)).toEqual({
      model: "workspace-model",
      serviceTier: "priority",
      reasoningEffort: "high",
      runtimeMode: "full-access",
    });
  });

  it("keeps runtime preferences isolated between existing threads", () => {
    const workspace: RuntimePreferences = {
      model: "gpt-6-astra",
      reasoningEffort: "medium",
      runtimeMode: "default",
      serviceTier: "standard",
    };
    const astraThread = thread("thread-a", {
      model: "gpt-6-astra",
      reasoningEffort: "medium",
      runtimeMode: "default",
      serviceTier: "standard",
    });
    const solThread = thread("thread-b", {
      model: "gpt-5.6-sol",
      reasoningEffort: "high",
      runtimeMode: "full-access",
      serviceTier: "fast",
    });

    expect(runtimePreferencesForThread(undefined, astraThread, workspace)).toEqual({
      model: "gpt-6-astra",
      reasoningEffort: "medium",
      runtimeMode: "default",
      serviceTier: "standard",
    });
    expect(runtimePreferencesForThread(undefined, solThread, workspace)).toEqual({
      model: "gpt-5.6-sol",
      reasoningEffort: "high",
      runtimeMode: "full-access",
      serviceTier: "fast",
    });

    const pendingSolPreferences: RuntimePreferences = {
      model: "gpt-5.6-luna",
      reasoningEffort: "low",
      runtimeMode: "on-request",
    };
    expect(runtimePreferencesForThread(pendingSolPreferences, solThread, workspace)).toEqual(
      pendingSolPreferences,
    );
    expect(runtimePreferencesForThread(undefined, astraThread, workspace).model).toBe(
      "gpt-6-astra",
    );
  });

  it("inherits workspace defaults for a thread without runtime metadata", () => {
    const workspace: RuntimePreferences = {
      model: "gpt-6-astra",
      reasoningEffort: "medium",
      runtimeMode: "default",
      serviceTier: "standard",
    };

    expect(runtimePreferencesForThread(undefined, thread("thread-a"), workspace)).toEqual(
      workspace,
    );
  });

  it("updates workspace defaults only from the new-thread scope", () => {
    expect(runtimePreferencesScope(undefined)).toBe("workspace");
    expect(runtimePreferencesScope("thread-a")).toBe("thread");
  });
});

function thread(
  id: string,
  runtime: Partial<
    Pick<ThreadSummary, "model" | "reasoningEffort" | "runtimeMode" | "serviceTier">
  > = {},
) {
  return {
    id,
    title: id,
    cwd: "/workspace",
    state: "completed" as const,
    createdAt: "2026-09-13T00:00:00.000Z",
    updatedAt: "2026-09-13T00:00:00.000Z",
    messageCount: 0,
    ...runtime,
  } satisfies ThreadSummary;
}
