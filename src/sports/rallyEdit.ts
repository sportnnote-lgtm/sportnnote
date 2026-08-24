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

/** Kinds of scored point a rally sport logs — each is a single point for `side`.
 *  ('block' = a volleyball point won on a block.) */
export type PointKind = 'point' | 'ace' | 'block';

export interface PointInput {
  side: 'home' | 'away';
  kind: PointKind;
  playerName?: string;
  /** resolved when the scorer picks a player in the editor; reconstructed events
   *  only carry the name, so profile reconciliation resolves the id by name. */
  playerId?: string;
}

/** Every scored-point kind (skip game/set/match banner rows). Must match the
 *  editor's displayed rows so their indices stay aligned. */
export const isPointKind = (k?: string): k is PointKind => k === 'point' || k === 'ace' || k === 'block';

/** Reconstruct the ordered scoring inputs from a sport's point log. Each scored
 *  point's `side` IS who won the rally, so replaying them rebuilds the match. */
export const pointInputs = (events: LiveEvent[]): PointInput[] =>
  events
    .filter((e) => isPointKind(e.kind) && e.side)
    .map((e) => ({ side: e.side as 'home' | 'away', kind: e.kind as PointKind, playerName: e.playerName }));

const ACTION_OF: Record<PointKind, string> = { point: 'POINT', ace: 'ACE', block: 'BLOCK' };

/** Replay a corrected point list through the sport's own pure reducer so every
 *  downstream game/set boundary recomputes correctly. `cleared` = the match reset
 *  to 0-0 with its format/config kept. */
export function replayPoints<S>(reducer: (s: S, a: ScoreAction) => S, cleared: S, points: PointInput[]): S {
  return points.reduce(
    (s, p) =>
      reducer(s, {
        type: ACTION_OF[p.kind],
        side: p.side,
        attribution: p.playerName
          ? { playerId: p.playerId ?? '', stat: statOf(p.kind), playerName: p.playerName }
          : undefined,
      }),
    cleared,
  );
}

/** The stat a point credits to a player profile, mirroring how it was originally
 *  dispatched: an ace→'aces', a block→'blocks', any other point→'points'. */
const statOf = (kind: PointKind) => (kind === 'ace' ? 'aces' : kind === 'block' ? 'blocks' : 'points');

/** No-op `STAT_ADJUST` actions that reconcile player-profile tallies after an
 *  edit — +/- per (player, stat) for the difference between the old and new point
 *  lists. The reducer ignores STAT_ADJUST (match state comes from the replay); the
 *  live-match layer records the stat line, so careers stay consistent with the
 *  match. Players not found in a roster are skipped (no id to credit). */
export function reconcileStatActions(
  oldPts: PointInput[],
  newPts: PointInput[],
  resolveId: (name?: string) => string | undefined,
): ScoreAction[] {
  const tally = (pts: PointInput[]) => {
    const m = new Map<string, { playerId: string; stat: string; name: string; n: number }>();
    for (const p of pts) {
      const id = p.playerId ?? resolveId(p.playerName);
      if (!id || !p.playerName) continue;
      const stat = statOf(p.kind);
      const key = `${id}|${stat}`;
      const cur = m.get(key) ?? { playerId: id, stat, name: p.playerName, n: 0 };
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
