/**
 * SD-111 — hold a match result for a short window before it goes out.
 *
 * The tap that decides a match used to write `matches.status = 'completed'` at
 * once. That status change is what fires the "Full time" push to followers (the
 * `match_status_notify` trigger → notify-followers, which records one result
 * push per follower in `reminder_sends`, so it can never be recalled) and what
 * writes the result back (winner, stat-line W/L, standings, the bracket). A
 * mis-tap on match point therefore told every follower a wrong result.
 *
 * Now the deciding tap ARMS a hold: the scoreboard shows full time straight away,
 * but the completed status is written only when the hold runs out (~60 s). Undo
 * inside the window cancels it, so nothing was ever sent. The hold is sent at
 * once if the scorer leaves the screen or the app goes to the background, and a
 * persisted record (pendingResults.ts) sends it on the next open if the app is
 * killed — a result is never lost, only delayed.
 *
 * Pure (timers injected) so the rules can be tested without React.
 */

export const RESULT_HOLD_MS = 60_000;

export interface HoldTimers {
  now: () => number;
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
}

const realTimers: HoldTimers = {
  now: () => Date.now(),
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export interface ResultHold {
  /** When the held result goes out (ms epoch), or null when nothing is held. */
  sendsAt: () => number | null;
  /** Start holding (keeps the original deadline if already holding). */
  arm: () => void;
  /** Stop the clock without dropping the hold (an Undo is in flight). */
  pause: () => void;
  /** Restart the clock for the remaining time (no-op when nothing is held). */
  resume: () => void;
  /** Drop the hold — the result will NOT be sent (Undo removed the deciding tap). */
  cancel: () => void;
  /** Send now (timer ran out, screen closed, app backgrounded). True if it sent. */
  sendNow: () => boolean;
  subscribe: (fn: () => void) => () => void;
}

export function createResultHold(onSend: () => void, timers: HoldTimers = realTimers, holdMs = RESULT_HOLD_MS): ResultHold {
  let sendsAt: number | null = null;
  let handle: unknown = null;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  const stop = () => { if (handle != null) { timers.clear(handle); handle = null; } };
  const schedule = () => {
    stop();
    if (sendsAt == null) return;
    handle = timers.set(() => { handle = null; api.sendNow(); }, Math.max(0, sendsAt - timers.now()));
  };
  const api: ResultHold = {
    sendsAt: () => sendsAt,
    arm() {
      if (sendsAt == null) { sendsAt = timers.now() + holdMs; emit(); }
      schedule();
    },
    pause: stop,
    resume() { if (sendsAt != null && handle == null) schedule(); },
    cancel() {
      stop();
      if (sendsAt != null) { sendsAt = null; emit(); }
    },
    sendNow() {
      if (sendsAt == null) return false;
      stop();
      sendsAt = null;
      emit();
      onSend();
      return true;
    },
    subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  };
  return api;
}

/** "0:58" — the countdown on the "Result sent to followers in …" note. */
export function formatHold(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** What a persisted pending result needs to rebuild and send itself on the next open. */
export interface PendingResult {
  matchId: string;
  sport: string;
  config?: Record<string, unknown>;
  homeTeamName?: string;
  awayTeamName?: string;
  sendsAt: number;
}

/** Add or replace a match's pending record (one per match). */
export function withPending(list: PendingResult[], rec: PendingResult): PendingResult[] {
  return [...list.filter((r) => r.matchId !== rec.matchId), rec];
}

export function withoutPending(list: PendingResult[], matchId: string): PendingResult[] {
  return list.filter((r) => r.matchId !== matchId);
}

/** Parse the stored list, dropping anything malformed. */
export function parsePending(raw: string | null | undefined): PendingResult[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v)
      ? v.filter((r): r is PendingResult => !!r && typeof r === 'object' && typeof (r as PendingResult).matchId === 'string' && typeof (r as PendingResult).sport === 'string')
      : [];
  } catch {
    return [];
  }
}
