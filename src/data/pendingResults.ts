/**
 * SD-111 — results held on this device (see resultHold.ts), persisted so a result
 * still goes out if the app is closed or killed during the ~60 s hold.
 *
 * The live hook saves a record when it arms a hold and removes it when the hold
 * is sent or cancelled by Undo. Whatever is left on the next open is sent by
 * `flushPendingResults()` (RootNavigator, on sign-in): it pushes any queued taps,
 * replays the match's log and, if the match is still decided, writes the
 * completed snapshot (winner, W/L, standings → the follower push).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSport } from '../sports/registry';
import { getMatchEvents, updateMatchSnapshot, syncMatchStatLines, matchStatTotals } from './repos';
import { matchOutbox } from './matchOutbox';
import { mergeLog } from './eventLog';
import { effectiveLog } from '../sports/amend';
import type { MatchEventRecord, SportId } from '../core/types';
import { parsePending, withPending, withoutPending, type PendingResult } from './resultHold';

const KEY = 'sportfolio.pendingResults';

// Matches a mounted live-scoring screen is holding right now — the boot flush
// leaves those to their own countdown.
const heldHere = new Set<string>();
let chain: Promise<unknown> = Promise.resolve();

async function load(): Promise<PendingResult[]> {
  try { return parsePending(await AsyncStorage.getItem(KEY)); } catch { return []; }
}
async function store(list: PendingResult[]) {
  try {
    if (list.length) await AsyncStorage.setItem(KEY, JSON.stringify(list));
    else await AsyncStorage.removeItem(KEY);
  } catch { /* storage unavailable — the in-session hold still sends on leave */ }
}
// Serialise read-modify-write so a save and a remove can't overwrite each other.
const update = (fn: (l: PendingResult[]) => PendingResult[]) => {
  const p = chain.then(async () => store(fn(await load())));
  chain = p.catch(() => {});
  return p;
};

export const pendingResults = {
  save(rec: PendingResult) { heldHere.add(rec.matchId); return update((l) => withPending(l, rec)); },
  remove(matchId: string) { heldHere.delete(matchId); return update((l) => withoutPending(l, matchId)); },
  /** The screen stopped holding (sent, cancelled or unmounted). */
  release(matchId: string) { heldHere.delete(matchId); },
  list: load,
};

const toAction = (e: MatchEventRecord) => ({
  type: e.type,
  side: e.side ?? undefined,
  payload: e.payload ?? undefined,
  attribution: e.attribution ?? undefined,
});

/** Send one left-over result: replay the log; write the completed snapshot if decided. */
async function finalize(r: PendingResult): Promise<void> {
  await matchOutbox.hydrate(r.matchId);
  await matchOutbox.flush(r.matchId);
  const raw = mergeLog(await getMatchEvents(r.matchId), matchOutbox.getPending(r.matchId));
  const plugin = getSport(r.sport as SportId);
  let s: unknown = plugin.createInitialState(r.config);
  for (const e of effectiveLog(raw)) s = plugin.reducer(s, toAction(e));
  if (!plugin.isComplete(s as never)) return; // undone before the app closed — nothing to send
  if (plugin.statTotals) {
    const totals = await matchStatTotals(r.matchId, r.sport as SportId, s).catch(() => null);
    if (totals) await syncMatchStatLines(r.matchId, r.sport as SportId, totals, { home: r.homeTeamName, away: r.awayTeamName }).catch(() => 0);
  }
  await updateMatchSnapshot(r.matchId, (plugin.snapshot?.(s as never) ?? s) as object, true);
}

/** Send every result a previous session held but never sent. A failure (offline)
 *  keeps the record for the next open. */
export async function flushPendingResults(): Promise<number> {
  let sent = 0;
  for (const r of await load()) {
    if (heldHere.has(r.matchId)) continue;
    try {
      await finalize(r);
      await update((l) => withoutPending(l, r.matchId));
      sent++;
    } catch { /* keep it — try again next open */ }
  }
  return sent;
}

(globalThis as unknown as Record<string, unknown>).__sportfolioPendingResults = {
  list: load,
  flush: flushPendingResults,
};
