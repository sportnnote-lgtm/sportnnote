/**
 * FROZEN copy of the volleyball reducer as it was before SD-04 (git 89035b3,
 * src/sports/volleyball/index.tsx) plus the legacy EDIT_LOG replay from
 * src/sports/rallyEdit.ts. Test oracle only: the legacy-replay identity tests
 * replay the same old logs through this and the current engine and require the
 * same state. Do not "fix" this file.
 */
import type { ScoreAction } from '../src/sports/types.ts';
import type { VolleyballState } from '../src/sports/volleyball/engine.ts';

type LegacyPoint = { side: 'home' | 'away'; kind: 'point' | 'ace' | 'block'; playerName?: string; playerId?: string };
const LEGACY_ACTION_OF = { point: 'POINT', ace: 'ACE', block: 'BLOCK' } as const;
const legacyStatOf = (kind: LegacyPoint['kind']) => (kind === 'ace' ? 'aces' : kind === 'block' ? 'blocks' : 'points');
function replayPoints<S>(reducer: (s: S, a: ScoreAction) => S, cleared: S, points: LegacyPoint[]): S {
  return points.reduce(
    (s, p) => reducer(s, {
      type: LEGACY_ACTION_OF[p.kind], side: p.side,
      attribution: p.playerName ? { playerId: p.playerId ?? '', stat: legacyStatOf(p.kind), playerName: p.playerName } : undefined,
    }),
    cleared,
  );
}
type PointInput = LegacyPoint;

const TARGET = 25;
const DECIDER_TARGET = 15; // the final set is a shorter race to 15 (real-world rule)
const SETS_TO_WIN = 2;


const init = (config?: Record<string, unknown>): VolleyballState => ({
  current: { home: 0, away: 0 },
  setsWon: { home: 0, away: 0 },
  sets: [],
  setsToWin: Number(config?.setsToWin ?? SETS_TO_WIN),
  target: Number(config?.pointsPerSet ?? TARGET),
  deciderTarget: Number(config?.deciderPoints ?? DECIDER_TARGET),
  winByTwo: config?.winByTwo !== false, // default on (rally to 25, win by 2)
  events: [],
  seq: 0,
  ended: false,
});

/** Are we in the deciding set? (both sides one set from the match — e.g. 2-2 in
 *  a best-of-5, 1-1 in a best-of-3). The decider is a shorter race to 15. */
const isDecider = (s: VolleyballState) =>
  s.setsToWin > 1 && s.setsWon.home === s.setsToWin - 1 && s.setsWon.away === s.setsToWin - 1;
/** Points needed to win the current set (15 in the decider, else the set target). */
const setTarget = (s: VolleyballState) => (isDecider(s) ? s.deciderTarget : s.target);

/** Reset the match to 0-0 keeping its format (target/setsToWin/decider/win-by-2)
 *  — the clean slate an EDIT_LOG replay rebuilds the corrected point list onto. */
const clearMatch = (s: VolleyballState): VolleyballState => ({
  ...s, current: { home: 0, away: 0 }, setsWon: { home: 0, away: 0 }, sets: [], events: [], seq: 0, ended: false,
});

const reducer = (s: VolleyballState, a: ScoreAction): VolleyballState => {
  // Timeline correction: STAT_ADJUST only reconciles player profiles (no match
  // effect); EDIT_LOG replays a corrected point list so the score & sets re-derive.
  if (a.type === 'STAT_ADJUST') return s;
  if (a.type === 'EDIT_LOG') return replayPoints(reducer, clearMatch(s), (a.payload?.points as PointInput[]) ?? []);
  if (a.type === 'TIMEOUT') {
    // A team timeout — a non-scoring timeline marker (2 per set in indoor).
    if (s.ended || !a.side) return s;
    const setNo = s.setsWon.home + s.setsWon.away + 1;
    return { ...s, seq: s.seq + 1, events: [...s.events, { id: s.seq + 1, stamp: `Set ${setNo}`, icon: '⏱️', label: 'Timeout', detail: undefined, side: a.side, kind: 'timeout', set: setNo }] };
  }
  if (s.ended || !a.side || (a.type !== 'POINT' && a.type !== 'ACE' && a.type !== 'BLOCK')) return s;
  // Aces and (winning) blocks are also points — they just carry their own stat.
  const kind = a.type === 'ACE' ? 'ace' : a.type === 'BLOCK' ? 'block' : 'point';
  const icon = kind === 'ace' ? '🎯' : kind === 'block' ? '🧱' : '🏐';
  const label = kind === 'ace' ? 'Ace' : kind === 'block' ? 'Block' : 'Point';
  const who = a.attribution?.playerName;
  const current = { ...s.current, [a.side]: s.current[a.side] + 1 };
  const setNo = s.setsWon.home + s.setsWon.away + 1;
  const tgt = setTarget(s); // 15 in the decider, else the set target
  let seq = s.seq;
  const events = [...s.events];
  // Structured fields (kind/playerName/set/points) let the per-set box score
  // aggregate points/aces/blocks per player, filtered by set — the timeline ignores them.
  events.push({ id: ++seq, stamp: `Set ${setNo}`, icon, label, detail: `${current.home}-${current.away}${who ? ` · ${who}` : ''}`, side: a.side, kind, playerName: who, set: setNo, points: 1 });

  const h = current.home;
  const v = current.away;
  const m = (s.winByTwo ?? true) ? 2 : 1; // win-by-2, or first-to-target (casual)
  const won = h >= tgt && h - v >= m ? 'home' : v >= tgt && v - h >= m ? 'away' : null;
  if (!won) return { ...s, current, events, seq };

  const sets = [...s.sets, [h, v] as [number, number]];
  const setsWon = { ...s.setsWon, [won]: s.setsWon[won] + 1 };
  const ended = setsWon[won] >= s.setsToWin;
  events.push({ id: ++seq, stamp: 'Set', icon: '🎉', label: `Set ${sets.length} won`, detail: `${h}-${v}`, side: won });
  if (ended) events.push({ id: ++seq, stamp: 'Match', icon: '🏆', label: 'Match won', detail: `${setsWon.home}-${setsWon.away} sets`, side: won });
  return { ...s, current: { home: 0, away: 0 }, setsWon, sets, events, seq, ended };
};

export { reducer as legacyReducer, init as legacyInit };
