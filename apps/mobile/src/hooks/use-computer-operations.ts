import { useState } from "react";
import { captureConnection } from "@/lib/connection-context";

export function useComputerOperations<T extends object>(operations: T): T {
  const [scoped] = useState(() => {
    const context = captureConnection();
    return Object.fromEntries(
      Object.entries(operations).map(([key, operation]) => [
        key,
        (...args: unknown[]) => {
          context.assertCurrent();
          return Reflect.apply(operation, undefined, args);
        },
      ]),
    ) as T;
  });
  return scoped;
}
