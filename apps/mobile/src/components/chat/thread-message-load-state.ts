type ThreadMessageLoadInput = {
  hasActiveThread: boolean;
  hasSnapshot: boolean;
  isFetching: boolean;
  isPending: boolean;
  isRunningAppThread?: boolean;
  queryError?: string;
  snapshotUpdateCount?: number;
  syncError?: { message: string; snapshotUpdateCount: number };
  syncLoading?: boolean;
};

export function threadMessageLoadState(input: ThreadMessageLoadInput) {
  const isLoading =
    input.hasActiveThread &&
    !input.hasSnapshot &&
    !input.isRunningAppThread &&
    (input.syncLoading === true || (input.isPending && input.isFetching));
  const syncError =
    input.syncError && (input.snapshotUpdateCount ?? 0) <= input.syncError.snapshotUpdateCount
      ? input.syncError.message
      : undefined;
  return {
    isLoading,
    error:
      input.hasActiveThread && !isLoading && !input.syncLoading && !input.isFetching
        ? (syncError ?? input.queryError)
        : undefined,
  };
}
