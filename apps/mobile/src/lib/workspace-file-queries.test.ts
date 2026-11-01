import { expect, it, vi } from "vitest";
const identity = vi.hoisted(() => ({ computer: "mac-a" }));
vi.mock("./codex-relay-api", () => ({ getCodexRelayCacheIdentity: () => identity.computer }));
import {
  workspaceFileContentQueryKey,
  workspaceFilesQueryKey,
  workspaceFilesQueryKeyPrefix,
} from "./workspace-file-queries";

it("isolates identical workspace paths and file names on different computers", () => {
  const a = workspaceFileContentQueryKey("/work", "README.md");
  const aList = workspaceFilesQueryKeyPrefix("/work");
  const aDetailed = workspaceFilesQueryKey("/work", "src", "index");
  expect(aDetailed.slice(0, 3)).toEqual(aList);
  identity.computer = "mac-b";
  expect(workspaceFileContentQueryKey("/work", "README.md")).not.toEqual(a);
  expect(workspaceFilesQueryKeyPrefix("/work")).not.toEqual(aList);
  expect(workspaceFilesQueryKey("/work", "src", "index")).not.toEqual(aDetailed);
});
