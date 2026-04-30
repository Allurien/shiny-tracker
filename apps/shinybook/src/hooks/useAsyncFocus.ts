// Re-runs an async fetch every time the screen gains focus, so that adding
// a painting / drill on another screen reflects when the user navigates back.
// Returns { data, loading, refreshing, error, refresh }.
//
// Two loading-ish flags, each with a distinct purpose so tab-switch refetches
// stay silent:
//   - loading: true only until first data lands. Drives "blank → first paint"
//     UX. Stays false on every subsequent focus refetch.
//   - refreshing: true only when the caller explicitly calls refresh()
//     (pull-to-refresh). Background focus refetches don't toggle it, so the
//     RefreshControl chrome only appears in response to user action.
//
// Sync coupling: on focus and on refresh we also kick the sync layer so that
// data written on another device (e.g. mobile) shows up here without waiting
// for the 30s background tick. The local DB is read immediately for fast
// paint, then re-read once the server pull settles.

import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";

import { tickNow } from "../sync/manager";

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  refreshing: boolean;
  error: Error | null;
  refresh: () => void;
}

export function useAsyncFocus<T>(
  fetcher: () => Promise<T>,
  deps: ReadonlyArray<unknown> = []
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);
  // Refs so the focus effect can read these without depending on them — we
  // don't want a state-driven re-subscribe.
  const everLoadedRef = useRef(false);
  const userRefreshRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      // Only show the initial spinner before any data has arrived. After the
      // first successful fetch this stays false forever — focus refetches are
      // silent. Pull-to-refresh sets `refreshing` instead, via the ref guard.
      if (!everLoadedRef.current) setLoading(true);
      if (userRefreshRef.current) setRefreshing(true);

      const runFetch = () =>
        fetcher()
          .then((value) => {
            if (!cancelled) {
              setData(value);
              setError(null);
            }
          })
          .catch((err) => {
            if (!cancelled)
              setError(err instanceof Error ? err : new Error(String(err)));
          });

      // Paint local data immediately, then pull from the server and re-read
      // so cross-device writes surface without waiting for the 30s tick.
      runFetch().finally(() => {
        if (cancelled) return;
        tickNow()
          .then(() => {
            if (cancelled) return;
            return runFetch();
          })
          .catch(() => {
            // Sync errors are surfaced via the sync layer's own logs;
            // they shouldn't block local-data display.
          })
          .finally(() => {
            if (cancelled) return;
            everLoadedRef.current = true;
            setLoading(false);
            if (userRefreshRef.current) {
              userRefreshRef.current = false;
              setRefreshing(false);
            }
          });
      });

      return () => {
        cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tick, ...deps])
  );

  const refresh = useCallback(() => {
    userRefreshRef.current = true;
    setTick((t) => t + 1);
  }, []);
  return { data, loading, refreshing, error, refresh };
}
