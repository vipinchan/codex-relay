import { describe, expect, it } from "vitest";

import { threadMessageLoadState } from "./thread-message-load-state";

describe("threadMessageLoadState", () => {
  it("stops loading and offers a retry when the initial request fails", () => {
    expect(
      threadMessageLoadState({
        hasActiveThread: true,
        hasSnapshot: false,
        isFetching: false,
        isPending: true,
        queryError: "Request timed out",
      }),
    ).toEqual({ isLoading: false, error: "Request timed out" });
  });

  it("shows loading only while the initial request is in flight", () => {
    expect(
      threadMessageLoadState({
        hasActiveThread: true,
        hasSnapshot: false,
        isFetching: true,
        isPending: true,
      }),
    ).toEqual({ isLoading: true, error: undefined });
  });

  it("keeps cached messages visible after refresh fails", () => {
    expect(
      threadMessageLoadState({
        hasActiveThread: true,
        hasSnapshot: true,
        isFetching: false,
        isPending: false,
        snapshotUpdateCount: 1,
        syncError: { message: "Request timed out", snapshotUpdateCount: 1 },
      }),
    ).toEqual({ isLoading: false, error: "Request timed out" });
  });

  it("clears a failed refresh banner after a later query succeeds", () => {
    expect(
      threadMessageLoadState({
        hasActiveThread: true,
        hasSnapshot: true,
        isFetching: false,
        isPending: false,
        snapshotUpdateCount: 2,
        syncError: { message: "Old timeout", snapshotUpdateCount: 1 },
      }),
    ).toEqual({ isLoading: false, error: undefined });
  });

  it("ignores a stale error while retrying", () => {
    expect(
      threadMessageLoadState({
        hasActiveThread: true,
        hasSnapshot: false,
        isFetching: true,
        isPending: true,
        queryError: "Old failure",
      }),
    ).toEqual({ isLoading: true, error: undefined });
  });

  it("does not show another thread's loading state or error", () => {
    expect(
      threadMessageLoadState({
        hasActiveThread: false,
        hasSnapshot: false,
        isFetching: false,
        isPending: false,
        syncError: { message: "Other thread failed", snapshotUpdateCount: 0 },
      }),
    ).toEqual({ isLoading: false, error: undefined });
  });
});
