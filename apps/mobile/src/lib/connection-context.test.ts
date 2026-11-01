import { describe, expect, it, vi } from "vitest";
import {
  captureConnection,
  guardConnectionOperation,
  guardConnectionWrite,
  invalidateConnection,
  onConnectionInvalidated,
} from "./connection-context";

describe("connection generations", () => {
  it("aborts old work and rejects late responses even after switching back", () => {
    const first = captureConnection();
    const stop = vi.fn<() => void>();
    const unsubscribe = onConnectionInvalidated(stop);
    invalidateConnection();
    const second = captureConnection();
    invalidateConnection();
    expect(first.isCurrent()).toBe(false);
    expect(second.isCurrent()).toBe(false);
    expect(first.signal.aborted).toBe(true);
    expect(stop).toHaveBeenCalledTimes(2);
    expect(() => first.assertCurrent()).toThrow(/changed/i);
    unsubscribe();
  });

  it("drops late UI writes and prevents queued operations from using a new connection", () => {
    const context = captureConnection();
    const write = vi.fn<(value: string) => void>();
    const operation = vi.fn<(id: string) => Promise<void>>(async () => undefined);
    const scopedWrite = guardConnectionWrite(write, context);
    const scopedOperation = guardConnectionOperation(operation, context);
    scopedWrite("before");
    invalidateConnection();
    scopedWrite("after");
    expect(() => scopedOperation("old-thread")).toThrow(/changed/);
    expect(operation).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledExactlyOnceWith("before");
  });
});
