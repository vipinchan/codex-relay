let generation = 0;
let controller = new AbortController();
const listeners = new Set<() => void>();

export class ConnectionChangedError extends Error {
  constructor() {
    super("The selected computer or connection changed.");
    this.name = "ConnectionChangedError";
  }
}

export function captureConnection() {
  const capturedGeneration = generation;
  return {
    generation: capturedGeneration,
    signal: controller.signal,
    isCurrent: () => capturedGeneration === generation,
    assertCurrent() {
      if (capturedGeneration !== generation) throw new ConnectionChangedError();
    },
  };
}

export function invalidateConnection() {
  generation += 1;
  controller.abort();
  controller = new AbortController();
  const subscribers = Array.from(listeners);
  for (const listener of subscribers) listener();
}

export function onConnectionInvalidated(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getConnectionGeneration() {
  return generation;
}

export function guardConnectionWrite<Args extends unknown[]>(
  write: (...args: Args) => void,
  context: ReturnType<typeof captureConnection>,
) {
  return (...args: Args) => {
    if (context.isCurrent()) write(...args);
  };
}

export function guardConnectionOperation<Args extends unknown[], Result>(
  operation: (...args: Args) => Result,
  context: ReturnType<typeof captureConnection>,
) {
  return (...args: Args) => {
    context.assertCurrent();
    return operation(...args);
  };
}
