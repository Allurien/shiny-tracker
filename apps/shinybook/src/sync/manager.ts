// Sync manager. Owns the lifecycle of the background sync loop and exposes
// `kick()` for repo-layer callers to nudge a flush after a local write.
//
// Design:
//   - One in-flight tick at a time. Concurrent kicks coalesce — if a tick is
//     running we set a `pendingRetick` flag so the loop runs again immediately
//     after the current tick finishes (catches writes enqueued mid-tick).
//   - A periodic timer also ticks every TICK_INTERVAL_MS so backed-off rows
//     and remote changes get picked up even without local activity.
//   - `start()` / `stop()` are idempotent. AuthProvider calls start on
//     signedIn and stop on signedOut.
//
// Errors inside a tick are caught and logged — they must not crash the app.
// Per-row failures are handled by the outbox processor (bump w/ backoff).

import { tick as runTick } from "./processors";

const TICK_INTERVAL_MS = 30 * 1000;

let started = false;
let intervalHandle: ReturnType<typeof setInterval> | null = null;
let inFlight: Promise<void> | null = null;
let pendingRetick = false;

export function start(): void {
  if (started) return;
  started = true;
  intervalHandle = setInterval(kick, TICK_INTERVAL_MS);
  kick();
}

export function stop(): void {
  if (!started) return;
  started = false;
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

export function isStarted(): boolean {
  return started;
}

// Coalescing kick. Safe to call from anywhere — repo writes, foreground
// resume hooks, manual "sync now" buttons, etc.
export function kick(): void {
  if (!started) return;
  if (inFlight) {
    pendingRetick = true;
    return;
  }
  inFlight = (async () => {
    try {
      await runTick();
    } catch (err) {
      console.warn("[sync] tick failed", err);
    } finally {
      inFlight = null;
      if (pendingRetick) {
        pendingRetick = false;
        kick();
      }
    }
  })();
}

// Awaitable form, useful for tests and "pull-to-refresh" UIs.
export async function tickNow(): Promise<void> {
  if (inFlight) {
    await inFlight;
    return;
  }
  inFlight = (async () => {
    try {
      await runTick();
    } finally {
      inFlight = null;
    }
  })();
  await inFlight;
}
