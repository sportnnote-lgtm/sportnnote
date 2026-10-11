/**
 * Surgical timeline editing for rally / running-point sports (volleyball, tennis,
 * badminton). Unlike football/basketball/kabaddi — where the score is an
 * order-independent sum, so a correction can be a single compensating event —
 * a rally sport's score is path-dependent: removing or inserting one mid-match
 * point shifts every downstream game/set boundary. So corrections here REPLAY the
 * corrected point list through the sport's own (tested) pure reducer, which
 * recomputes the running score, games/sets and box-score fields from scratch and
 * can never drift.
 *
 * The point log is the only history we need: for these sports each point event's
 * `side` is exactly who won the rally, so `pointInputs()` reconstructs the exact
 * scoring sequence from `state.events`. An edit rewrites that list and dispatches
 * one `EDIT_LOG` event carrying it; on replay the reducer rebuilds from it. Player
 * profile tallies are reconciled separately via no-op `STAT_ADJUST` events (see
 * `reconcileStatActions`) so both the match AND career stats add up.
 */
import type { LiveEvent } from './liveEvents';
import type { ScoreAction } from './types';
import { DOUBLE_FAULT_STAT } from './tennis/doubleFault.ts';
import type { PointDetail } from './pointDetail.ts';

/** Kinds of scored point a rally sport logs — each is a single point for `side`.
 *  'point' = a point whose outcome wasn't recorded (every legacy point). The rest
 *  are volleyball outcomes (SD-04): 'attack' = a kill, 'block' = a point won on a
 *  block, 'opperror' / 'serveerror' = the OPPONENT erred (no player credited). */
export type PointKind = 'point' | 'ace' | 'block' | 'attack' | 'opperror' | 'serveerror' | 'rally';
// SD-21 — 'rally' = a side-out sport's rally that scored NO point (a hand-out /
// side-out, or the hand to the 2nd server). Its PointInput `side` is who WON the
// rally (the event's `wonBy`), so replaying it as a POINT for that side lets the
// rally engine re-derive whether it scores or hands out. Never credits a player.

const KINDS: readonly string[] = ['point', 'ace', 'block', 'attack', 'opperror', 'serveerror', 'rally'];

export interface PointInput {
  side: 'home' | 'away';
  kind: PointKind;
  playerName?: string;
  /** resolved when the scorer picks a player in the editor; reconstructed events
   *  only carry the name, so profile reconciliation resolves the id by name. */
  playerId?: string;
  /** SD-104 — tennis: the point was the opponent's double fault (the faulting
   *  server, if named). Replays as a double fault, so a correction that keeps,
   *  changes or drops it moves the server's `doubleFaults` with it. */
  df?: { playerId?: string; playerName?: string };
  /** SD-107 — how the point was won (optional point detail); replayed as a
   *  POINT_DETAIL right after the point. */
  pd?: PointDetail;
  /** SD-107 — tennis: served on the 1st or 2nd serve (serve tracking on). */
  serve?: 1 | 2;
  /** SD-117b — volleyball: an "Opp. fault" point's optional detail (error
   *  type + the erring opponent). Replayed with the fault; charges `errors`. */
  oe?: { type?: string; playerId?: string; playerName?: string };
}

/** SD-117b — the stat an erring volleyball opponent is charged with. */
const FAULT_STAT = 'errors';
/** SD-58 — a volleyball missed serve: the opponent's server is charged this. */
const SERVE_FAULT_STAT = 'serveErrors';
const faultStatOf = (k: PointKind) => (k === 'serveerror' ? SERVE_FAULT_STAT : FAULT_STAT);

/** Every scored-point kind (skip game/set/match banner rows). Must match the
 *  editor's displayed rows so their indices stay aligned. */
export const isPointKind = (k?: string): k is PointKind => k != null && KINDS.includes(k);

/** One editable timeline row: the log event and the input it replays as. */
export interface EditRow { e: LiveEvent; p: PointInput }

/** Every editable row of a point log, in order. A scored point's `side` IS who
 *  won the rally; a `rally` row (SD-21, side-out) uses its `wonBy`. */
export const pointRows = (events: LiveEvent[]): EditRow[] =>
  events
    .filter((e) => isPointKind(e.kind) && (e.kind === 'rally' ? e.wonBy : e.side))
    .map((e) => ({
      e,
      p: e.kind === 'rally'
        ? { side: e.wonBy as 'home' | 'away', kind: 'rally' as const, ...(e.pd ? { pd: { ...e.pd } } : {}) }
        // SD-19: the credited player's id rides along when the event has one,
        // so an EDIT_LOG keeps ids (absolute statTotals) instead of names only.
        : { side: e.side as 'home' | 'away', kind: e.kind as PointKind, playerName: e.playerName, ...(e.playerId ? { playerId: e.playerId } : {}), ...(e.df ? { df: { ...e.df } } : {}), ...(e.pd ? { pd: { ...e.pd } } : {}), ...(e.serve ? { serve: e.serve } : {}), ...(e.oe ? { oe: { ...e.oe } } : {}) },
    }));

/** Reconstruct the ordered scoring inputs from a sport's point log, so replaying
 *  them rebuilds the match. */
export const pointInputs = (events: LiveEvent[]): PointInput[] => pointRows(events).map((r) => r.p);

const ACTION_OF: Record<PointKind, string> = {
  point: 'POINT', ace: 'ACE', block: 'BLOCK', attack: 'ATTACK', opperror: 'OPP_ERROR', serveerror: 'SERVE_ERROR',
  // a rally is replayed as "this side won the rally" — the engine decides if it scores
  rally: 'POINT',
};

/** The profile stats one point of `kind` credits to the player on it. The default
 *  mirrors how tennis/badminton dispatch (an ace → 'aces' only, else 'points');
 *  volleyball passes its own (`volleyballCredits`), where an ace or block is ALSO
 *  a point. An empty map = nobody is credited (an opponent's error). */
export type PointCredits = (kind: PointKind) => Record<string, number>;
export const defaultCredits: PointCredits = (kind) => (kind === 'rally' ? {} : { [statOf(kind)]: 1 });

/** Replay a corrected point list through the sport's own pure reducer so every
 *  downstream game/set boundary recomputes correctly. `cleared` = the match reset
 *  to 0-0 with its format/config kept. */
export function replayPoints<S>(reducer: (s: S, a: ScoreAction) => S, cleared: S, points: PointInput[]): S {
  return points.reduce((s, p) => {
    const next = reducer(s, replayAction(p));
    // SD-107 — the point's detail rides along (old lists carry none)
    return p.pd ? reducer(next, { type: 'POINT_DETAIL', payload: { pd: p.pd } }) : next;
  }, cleared);
}

/** The action one corrected point replays as. */
function replayAction(p: PointInput): ScoreAction {
  // SD-104 — a double-fault point replays as one (point to the receiver, the
  // fault marked on the server); the reducer re-records the marker.
  if (p.df) {
    return {
      type: 'POINT', side: p.side, payload: { df: true, ...(p.serve ? { serve: p.serve } : {}) },
      attribution2: p.df.playerName ? { playerId: p.df.playerId ?? '', stat: DOUBLE_FAULT_STAT, playerName: p.df.playerName } : undefined,
    };
  }
  // SD-117b — a volleyball fault keeps its type and erring opponent
  if (p.kind === 'opperror' && p.oe) {
    return {
      type: 'OPP_ERROR', side: p.side,
      ...(p.oe.type ? { payload: { err: p.oe.type } } : {}),
      attribution2: p.oe.playerName ? { playerId: p.oe.playerId ?? '', stat: FAULT_STAT, playerName: p.oe.playerName } : undefined,
    };
  }
  // SD-58 — a missed serve keeps the opponent's server who missed it
  if (p.kind === 'serveerror' && p.oe?.playerName) {
    return { type: 'SERVE_ERROR', side: p.side, attribution2: { playerId: p.oe.playerId ?? '', stat: SERVE_FAULT_STAT, playerName: p.oe.playerName } };
  }
  return {
    type: ACTION_OF[p.kind],
    side: p.side,
    // SD-107 — a tracked point keeps its 1st / 2nd serve (only such points carry it)
    ...(p.serve ? { payload: { serve: p.serve } } : {}),
    // Only a creditable kind carries a player (an opponent's error never does).
    attribution: p.playerName && p.kind !== 'opperror' && p.kind !== 'serveerror' && p.kind !== 'rally'
      ? { playerId: p.playerId ?? '', stat: statOf(p.kind), playerName: p.playerName }
      : undefined,
  };
}

/** The primary stat a point credits to a player profile, mirroring how it was
 *  originally dispatched: an ace→'aces', a block→'blocks', any other point→'points'.
 *  (Only labels the replayed attribution, which the reducer ignores; profile
 *  reconciliation uses the sport's `PointCredits`.) */
function statOf(kind: PointKind): string {
  return kind === 'ace' ? 'aces' : kind === 'block' ? 'blocks' : 'points';
}

/** No-op `STAT_ADJUST` actions that reconcile player-profile tallies after an
 *  edit — +/- per (player, stat) for the difference between the old and new point
 *  lists. The reducer ignores STAT_ADJUST (match state comes from the replay); the
 *  live-match layer records the stat line, so careers stay consistent with the
 *  match. Players not found in a roster are skipped (no id to credit). */
export function reconcileStatActions(
  oldPts: PointInput[],
  newPts: PointInput[],
  resolveId: (name?: string) => string | undefined,
  creditsOf: PointCredits = defaultCredits,
): ScoreAction[] {
  const tally = (pts: PointInput[]) => {
    const m = new Map<string, { playerId: string; stat: string; name: string; n: number }>();
    for (const p of pts) {
      const id = p.playerId ?? resolveId(p.playerName);
      if (!id || !p.playerName) continue;
      for (const [stat, by] of Object.entries(creditsOf(p.kind))) {
        const key = `${id}|${stat}`;
        const cur = m.get(key) ?? { playerId: id, stat, name: p.playerName, n: 0 };
        cur.n += by;
        m.set(key, cur);
      }
    }
    // SD-104 — a double-fault point debits the faulting server's doubleFaults.
    for (const p of pts) {
      if (!p.df?.playerName) continue;
      const id = p.df.playerId || resolveId(p.df.playerName);
      if (!id) continue;
      const key = `${id}|${DOUBLE_FAULT_STAT}`;
      const cur = m.get(key) ?? { playerId: id, stat: DOUBLE_FAULT_STAT, name: p.df.playerName, n: 0 };
      cur.n += 1;
      m.set(key, cur);
    }
    // SD-117b — a volleyball fault charges the erring opponent's errors;
    // SD-58 — a missed serve the opponent's server's serveErrors.
    for (const p of pts) {
      if ((p.kind !== 'opperror' && p.kind !== 'serveerror') || !p.oe?.playerName) continue;
      const id = p.oe.playerId || resolveId(p.oe.playerName);
      if (!id) continue;
      const stat = faultStatOf(p.kind);
      const key = `${id}|${stat}`;
      const cur = m.get(key) ?? { playerId: id, stat, name: p.oe.playerName, n: 0 };
      cur.n += 1;
      m.set(key, cur);
    }
    return m;
  };
  const before = tally(oldPts);
  const after = tally(newPts);
  const actions: ScoreAction[] = [];
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const b = before.get(key);
    const a = after.get(key);
    const delta = (a?.n ?? 0) - (b?.n ?? 0);
    if (delta === 0) continue;
    const meta = (a ?? b)!;
    actions.push({ type: 'STAT_ADJUST', attribution: { playerId: meta.playerId, stat: meta.stat, by: delta, playerName: meta.name } });
  }
  return actions;
}

/** SD-21 — everything one editor correction dispatches: the EDIT_LOG with the
 *  corrected list, then the STAT_ADJUST deltas. `normalize` (side-out sports)
 *  maps the edited list to what it actually replays to — a rally the server now
 *  loses is a hand-out that credits nobody — so the EDIT_LOG and the credit diff
 *  both follow the replay and nothing is counted twice. */
export function correctionActions(
  oldPts: PointInput[],
  edited: PointInput[],
  resolveId: (name?: string) => string | undefined,
  creditsOf: PointCredits = defaultCredits,
  normalize?: (points: PointInput[]) => PointInput[],
): ScoreAction[] {
  const next = normalize ? normalize(edited) : edited;
  return [{ type: 'EDIT_LOG', payload: { points: next } }, ...reconcileStatActions(oldPts, next, resolveId, creditsOf)];
}
