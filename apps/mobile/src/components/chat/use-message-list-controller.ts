import type { LegendListRef } from "@legendapp/list/react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { previousMessageIndex } from "./previous-user-jump-step";
import {
  INITIAL_TIMELINE_WINDOW_SIZE,
  nextTimelineWindowSize,
  TIMELINE_WINDOW_INCREMENT,
} from "./timeline-rows";

type SourceStatus = "idle" | "looking" | "found" | "unavailable";
type Navigation = {
  kind: "previous" | "source" | "latest";
  key?: string;
};

type MessageListOptions<Message, Row> = {
  timelineKey: string;
  messages: Message[];
  buildRows: (messages: Message[], previousRows: readonly Row[]) => Row[];
  keyExtractor: (row: Row) => string;
  isUserRow: (row: Row) => boolean;
  isLoading?: boolean;
  isLoadingEarlierMessages?: boolean;
  hasEarlierMessages?: boolean;
  onLoadEarlierMessages?: () => Promise<boolean>;
  olderMessagesError?: string;
  isRunning?: boolean;
  followTrigger: string;
  sourceKey?: string;
};

export function useMessageListController<Message, Row>({
  timelineKey,
  messages,
  buildRows,
  keyExtractor,
  isUserRow,
  isLoading = false,
  isLoadingEarlierMessages = false,
  hasEarlierMessages = false,
  onLoadEarlierMessages,
  olderMessagesError,
  isRunning = false,
  followTrigger,
  sourceKey,
}: MessageListOptions<Message, Row>) {
  const listRef = useRef<LegendListRef | null>(null);
  const mountedRef = useRef(false);
  const generationRef = useRef(0);
  const previousRowsRef = useRef({ timelineKey, rows: [] as Row[] });
  const firstVisibleKeyRef = useRef<string | undefined>(undefined);
  const navigationAnchorRef = useRef<string | undefined>(undefined);
  const navigationRef = useRef<Navigation | undefined>(undefined);
  const scrollingRef = useRef<Navigation | undefined>(undefined);
  const pagingNavigationRef = useRef<Navigation | undefined>(undefined);
  const pageRequestRef = useRef<Promise<boolean> | undefined>(undefined);
  const pageCancellationRef = useRef<{ request: Promise<boolean>; cancel: () => void } | undefined>(
    undefined,
  );
  const windowRequestRef = useRef<
    | {
        timelineKey: string;
        count: number;
        request: Promise<boolean>;
        resolve: (loaded: boolean) => void;
      }
    | undefined
  >(undefined);
  const followingRef = useRef(!sourceKey);
  const [window, setWindow] = useState({
    timelineKey,
    count: INITIAL_TIMELINE_WINDOW_SIZE,
  });
  const [settledKey, setSettledKey] = useState<string>();
  const [isAtLatest, setAtLatest] = useState(!sourceKey);
  const [visibleKey, setVisibleKey] = useState<string>();
  const [navigation, setNavigation] = useState<Navigation>();
  const [isFetching, setFetching] = useState(false);
  const [pageError, setPageError] = useState<string>();
  const [sourceStatus, setSourceStatus] = useState<SourceStatus>(sourceKey ? "looking" : "idle");
  const [pageRevision, setPageRevision] = useState(0);
  const visibleCount =
    window.timelineKey === timelineKey ? window.count : INITIAL_TIMELINE_WINDOW_SIZE;
  const hiddenCount = Math.max(0, messages.length - visibleCount);
  const messageWindow = useMemo(
    () => (hiddenCount > 0 ? messages.slice(hiddenCount) : messages),
    [hiddenCount, messages],
  );
  const rows = useMemo(
    () =>
      buildRows(
        messageWindow,
        previousRowsRef.current.timelineKey === timelineKey ? previousRowsRef.current.rows : [],
      ),
    [buildRows, messageWindow, timelineKey],
  );
  const isReady = !isLoading && (rows.length === 0 || settledKey === timelineKey);
  const isLoadingEarlier = isFetching || isLoadingEarlierMessages;
  const currentRef = useRef({
    timelineKey,
    rows,
    keyExtractor,
    isUserRow,
    hiddenCount,
    messageCount: messages.length,
    visibleCount,
    hasEarlierMessages,
    isLoadingEarlierMessages,
    onLoadEarlierMessages,
    sourceKey,
  });
  currentRef.current = {
    timelineKey,
    rows,
    keyExtractor,
    isUserRow,
    hiddenCount,
    messageCount: messages.length,
    visibleCount,
    hasEarlierMessages,
    isLoadingEarlierMessages,
    onLoadEarlierMessages,
    sourceKey,
  };

  useEffect(() => {
    previousRowsRef.current = { timelineKey, rows };
  }, [rows, timelineKey]);

  useEffect(() => {
    mountedRef.current = true;
    generationRef.current += 1;
    firstVisibleKeyRef.current = undefined;
    navigationAnchorRef.current = undefined;
    pageRequestRef.current = undefined;
    followingRef.current = !currentRef.current.sourceKey;
    setAtLatest(!currentRef.current.sourceKey);
    setSettledKey(undefined);
    setVisibleKey(undefined);
    setFetching(false);
    setPageError(undefined);
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      navigationRef.current = undefined;
      scrollingRef.current = undefined;
      pagingNavigationRef.current = undefined;
      windowRequestRef.current?.resolve(false);
      windowRequestRef.current = undefined;
      pageCancellationRef.current?.cancel();
      pageCancellationRef.current = undefined;
    };
  }, [timelineKey]);

  useEffect(() => {
    const pending = windowRequestRef.current;
    if (!pending || pending.timelineKey !== timelineKey || visibleCount < pending.count) return;
    windowRequestRef.current = undefined;
    if (pageRequestRef.current === pending.request) pageRequestRef.current = undefined;
    setFetching(false);
    pending.resolve(true);
  }, [timelineKey, visibleCount]);

  useEffect(() => {
    const next: Navigation | undefined = sourceKey ? { kind: "source", key: sourceKey } : undefined;
    navigationRef.current = next;
    scrollingRef.current = undefined;
    pagingNavigationRef.current = undefined;
    navigationAnchorRef.current = undefined;
    setNavigation(next);
    setSourceStatus(sourceKey ? "looking" : "idle");
    if (sourceKey) {
      followingRef.current = false;
      setAtLatest(false);
    }
  }, [sourceKey, timelineKey]);

  const onLoad = useCallback(() => {
    if (currentRef.current.timelineKey === timelineKey) setSettledKey(timelineKey);
  }, [timelineKey]);

  const hasRows = rows.length > 0;
  useEffect(() => {
    if (isLoading || !hasRows) return;
    let secondFrame: number | undefined;
    const frame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => setSettledKey(timelineKey));
    });
    return () => {
      cancelAnimationFrame(frame);
      if (secondFrame !== undefined) cancelAnimationFrame(secondFrame);
    };
  }, [isLoading, hasRows, timelineKey]);

  const loadEarlier = useCallback((): Promise<boolean> => {
    if (pageRequestRef.current) return pageRequestRef.current;
    const current = currentRef.current;
    const key = current.timelineKey;
    if (current.hiddenCount > 0) {
      followingRef.current = false;
      setAtLatest(false);
      setPageError(undefined);
      const count = nextTimelineWindowSize(current.visibleCount, current.messageCount);
      let resolve!: (loaded: boolean) => void;
      const request = new Promise<boolean>((complete) => {
        resolve = complete;
      });
      windowRequestRef.current = { timelineKey: key, count, request, resolve };
      pageRequestRef.current = request;
      setFetching(true);
      setWindow({ timelineKey: key, count });
      return request;
    }
    if (
      !current.hasEarlierMessages ||
      !current.onLoadEarlierMessages ||
      current.isLoadingEarlierMessages
    )
      return Promise.resolve(false);
    const generation = generationRef.current;
    const isCurrent = () =>
      mountedRef.current &&
      generationRef.current === generation &&
      currentRef.current.timelineKey === key;
    followingRef.current = false;
    setAtLatest(false);
    setFetching(true);
    setPageError(undefined);
    let cancel!: () => void;
    const cancelled = new Promise<boolean>((resolve) => {
      cancel = () => resolve(false);
    });
    const work = Promise.resolve()
      .then(() => (isCurrent() ? current.onLoadEarlierMessages!() : false))
      .then((loaded) => {
        if (!isCurrent()) return false;
        if (!loaded) return false;
        const count = currentRef.current.visibleCount + TIMELINE_WINDOW_INCREMENT;
        return new Promise<boolean>((resolve) => {
          windowRequestRef.current = { timelineKey: key, count, request, resolve };
          setWindow({ timelineKey: key, count });
        });
      })
      .catch((error: unknown) => {
        if (isCurrent()) {
          setPageError(error instanceof Error ? error.message : "Could not load earlier messages.");
        }
        return false;
      });
    const request = Promise.race([work, cancelled]).finally(() => {
      if (pageCancellationRef.current?.request === request) {
        pageCancellationRef.current = undefined;
      }
      if (pageRequestRef.current === request) {
        pageRequestRef.current = undefined;
        if (isCurrent()) setFetching(false);
      }
    });
    pageRequestRef.current = request;
    pageCancellationRef.current = { request, cancel };
    return request;
  }, []);

  const cancelNavigation = useCallback(() => {
    navigationRef.current = undefined;
    navigationAnchorRef.current = undefined;
    scrollingRef.current = undefined;
    pagingNavigationRef.current = undefined;
    setNavigation(undefined);
    setSourceStatus((status) => (status === "looking" ? "idle" : status));
  }, []);

  const onScroll = useCallback(() => {
    if (currentRef.current.timelineKey !== timelineKey || navigationRef.current) return;
    const next = listRef.current?.getState().isAtEnd;
    if (next === undefined || next === followingRef.current) return;
    followingRef.current = next;
    setAtLatest(next);
  }, [timelineKey]);

  const onFirstVisibleItemChanged = useCallback(
    ({ index }: { index: number }) => {
      const current = currentRef.current;
      if (current.timelineKey !== timelineKey) return;
      const row = current.rows[index];
      if (!row) return;
      const key = current.keyExtractor(row);
      firstVisibleKeyRef.current = key;
      setVisibleKey((previous) => (previous === key ? previous : key));
    },
    [timelineKey],
  );

  const jumpToPrevious = useCallback(() => {
    if (navigationRef.current) return;
    const key = navigationAnchorRef.current ?? firstVisibleKeyRef.current;
    if (!key) return;
    const next: Navigation = { kind: "previous", key };
    navigationRef.current = next;
    followingRef.current = false;
    setAtLatest(false);
    setNavigation(next);
  }, []);

  const jumpToLatest = useCallback(() => {
    cancelNavigation();
    const next: Navigation = { kind: "latest" };
    navigationRef.current = next;
    followingRef.current = true;
    setAtLatest(true);
    setNavigation(next);
  }, [cancelNavigation]);

  useEffect(() => {
    if (!navigation || !isReady || navigationRef.current !== navigation) return;
    const generation = generationRef.current;
    const isCurrent = () =>
      mountedRef.current &&
      generationRef.current === generation &&
      currentRef.current.timelineKey === timelineKey &&
      navigationRef.current === navigation;
    const finish = (success: boolean) => {
      if (!isCurrent()) return;
      if (navigation.kind === "source") setSourceStatus(success ? "found" : "unavailable");
      navigationAnchorRef.current = success && navigation.kind !== "latest" ? targetKey : undefined;
      navigationRef.current = undefined;
      scrollingRef.current = undefined;
      setNavigation(undefined);
      const next = listRef.current?.getState().isAtEnd ?? false;
      followingRef.current = next;
      setAtLatest(next);
    };
    let targetKey = navigation.key;
    let targetIndex =
      navigation.kind === "latest"
        ? rows.length - 1
        : rows.findIndex((row) => keyExtractor(row) === navigation.key);
    if (navigation.kind === "previous") {
      if (targetIndex < 0) {
        finish(false);
        return;
      }
      targetIndex = previousMessageIndex(rows, targetIndex, isUserRow) ?? -1;
      targetKey = targetIndex >= 0 ? keyExtractor(rows[targetIndex]) : undefined;
    }
    if (navigation.kind === "latest" && rows.length === 0) {
      finish(true);
      return;
    }
    if (targetIndex < 0) {
      if (isLoadingEarlier || pagingNavigationRef.current === navigation) return;
      if (hiddenCount === 0 && !hasEarlierMessages) {
        finish(false);
        return;
      }
      pagingNavigationRef.current = navigation;
      void loadEarlier().then((loaded) => {
        if (pagingNavigationRef.current === navigation) pagingNavigationRef.current = undefined;
        if (!isCurrent()) return;
        if (!loaded) finish(false);
        else setPageRevision((revision) => revision + 1);
      });
      return;
    }
    if (scrollingRef.current === navigation) return;
    scrollingRef.current = navigation;
    void (async () => {
      const list = listRef.current;
      if (!list) {
        scrollingRef.current = undefined;
        return;
      }
      if (navigation.kind === "latest") {
        try {
          await list.scrollToIndex({ index: rows.length - 1, animated: true, viewPosition: 1 });
        } catch {
          // Finish against measured content even when the estimated index jump fails.
        }
        if (!isCurrent()) return;
        try {
          await list.scrollToEnd({ animated: false });
        } catch {
          finish(false);
          return;
        }
        if (isCurrent()) finish(true);
        return;
      }
      for (let attempt = 0; attempt < 3 && isCurrent(); attempt += 1) {
        const current = currentRef.current;
        const index = current.rows.findIndex((row) => current.keyExtractor(row) === targetKey);
        if (index < 0) break;
        try {
          await list.scrollToIndex({
            index,
            animated: true,
            viewPosition: navigation.kind === "source" ? 0.32 : 0.08,
          });
          if (isCurrent()) finish(true);
          return;
        } catch {
          if (!isCurrent()) return;
          try {
            await list.scrollToOffset({
              offset: Math.max(0, list.getState().positionAtIndex(index)),
              animated: false,
            });
          } catch {
            // Let the next measured index attempt decide whether the target is reachable.
          }
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        }
      }
      if (isCurrent()) finish(false);
    })();
  }, [
    hasEarlierMessages,
    hiddenCount,
    isLoadingEarlier,
    isReady,
    isUserRow,
    keyExtractor,
    loadEarlier,
    navigation,
    pageRevision,
    rows,
    timelineKey,
  ]);

  useEffect(() => {
    if (!isReady || !followingRef.current || navigationRef.current) return;
    const follow = () => {
      if (
        currentRef.current.timelineKey === timelineKey &&
        followingRef.current &&
        !navigationRef.current
      )
        void listRef.current?.scrollToEnd({ animated: false }).catch(() => undefined);
    };
    const frame = requestAnimationFrame(follow);
    const settle = isRunning ? undefined : setTimeout(follow, 240);
    const lateSettle = isRunning ? undefined : setTimeout(follow, 900);
    return () => {
      cancelAnimationFrame(frame);
      if (settle !== undefined) clearTimeout(settle);
      if (lateSettle !== undefined) clearTimeout(lateSettle);
    };
  }, [followTrigger, isReady, isRunning, timelineKey]);

  const anchorKey = navigationAnchorRef.current ?? visibleKey;
  const anchorIndex = rows.findIndex((row) => keyExtractor(row) === anchorKey);
  const canJumpPrevious =
    anchorIndex >= 0 &&
    (previousMessageIndex(rows, anchorIndex, isUserRow) !== undefined ||
      hiddenCount > 0 ||
      hasEarlierMessages);

  return {
    timelineKey,
    rows,
    listRef,
    keyExtractor,
    hiddenCount,
    hasEarlier: hiddenCount > 0 || hasEarlierMessages,
    isLoadingEarlier,
    earlierError: olderMessagesError ?? pageError,
    isAtLatest,
    isReady,
    sourceStatus,
    canJumpPrevious,
    isLoadingPrevious: navigation?.kind === "previous" || isLoadingEarlier,
    initialScrollAtEnd: !sourceKey,
    loadEarlier,
    jumpToPrevious,
    jumpToLatest,
    onLoad,
    onScroll,
    onScrollBeginDrag: cancelNavigation,
    onFirstVisibleItemChanged,
  };
}

export type MessageListController<Row> = ReturnType<typeof useMessageListController<unknown, Row>>;
