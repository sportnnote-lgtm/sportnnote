/**
 * Volleyball scoring engine (pure) — rally scoring, set to 25 (win by 2), a
 * shorter deciding set to 15, best of 3/5. Kept RN-free so it's unit-testable.
 *
 * Point outcomes (SD-04 / VB-01, VB-02). Every rally is won by a side, and HOW
 * decides who (if anyone) gets the credit:
 *   ATTACK      a kill            → the attacker: points +1, attackPoints +1
 *   BLOCK       a winning block   → the blocker:  blocks +1, points +1
 *   ACE         a service ace     → the server:   aces +1,   points +1
 *   OPP_ERROR   the opponent erred (attack out, net, rotation…) → nobody
 *   SERVE_ERROR the opponent missed their serve                 → nobody
 *   POINT       legacy / outcome not recorded → the player picked, points +1
 * Old logs only contain POINT / ACE / BLOCK and replay exactly as before; their
 * stat lines (aces/blocks without the point) heal on the absolute re-sync (SD-32).
 */
import type { LiveEvent } from '../liveEvents';
import type { Attribution, ScoreAction } from '../types';
import { replayPoints, type PointCredits, type PointInput, type PointKind } from '../rallyEdit.ts';

const TARGET = 25;
const DECIDER_TARGET = 15; // the final set is a shorter race to 15 (real-world rule)
const SETS_TO_WIN = 2;

export interface VolleyballState {
  current: { home: number; away: number };
  setsWon: { home: number; away: number };
  sets: Array<[number, number]>;
  /** sets a side must win to take the match (format: setsToWin) */
  setsToWin: number;
  /** points to win a normal set, win by 2 (format: pointsPerSet — 25 indoor, 21 beach) */
  target: number;
  /** points to win the deciding set (shorter — 15) */
  deciderTarget: number;
  /** must a set be won by two clear points? off = first to target (casual) */
  winByTwo: boolean;
  events: LiveEvent[];
  seq: number;
  ended: boolean;
}

export const init = (config?: Record<string, unknown>): VolleyballState => ({
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
export const isDecider = (s: VolleyballState) =>
  s.setsToWin > 1 && s.setsWon.home === s.setsToWin - 1 && s.setsWon.away === s.setsToWin - 1;
/** Points needed to win the current set (15 in the decider, else the set target). */
export const setTarget = (s: VolleyballState) => (isDecider(s) ? s.deciderTarget : s.target);

/** Reset the match to 0-0 keeping its format (target/setsToWin/decider/win-by-2)
 *  — the clean slate an EDIT_LOG replay rebuilds the corrected point list onto. */
const clearMatch = (s: VolleyballState): VolleyballState => ({
  ...s, current: { home: 0, away: 0 }, setsWon: { home: 0, away: 0 }, sets: [], events: [], seq: 0, ended: false,
});

/** How a point was won — the outcomes the scorer picks from. */
export type VbOutcome = 'attack' | 'block' | 'ace' | 'opperror' | 'serveerror';

export interface OutcomeDef {
  kind: VbOutcome;
  /** the scoring action dispatched */
  type: string;
  icon: string;
  /** button / chip label */
  label: string;
  /** does a player of the scoring side get credit? (errors credit nobody) */
  credited: boolean;
}

/** In the order the scorer sees them. Attack first — it's the commonest point. */
export const VB_OUTCOMES: OutcomeDef[] = [
  { kind: 'attack', type: 'ATTACK', icon: '⚡', label: 'Attack', credited: true },
  { kind: 'block', type: 'BLOCK', icon: '🧱', label: 'Block', credited: true },
  { kind: 'ace', type: 'ACE', icon: '🎯', label: 'Ace', credited: true },
  { kind: 'opperror', type: 'OPP_ERROR', icon: '🎁', label: 'Opp. error', credited: false },
  { kind: 'serveerror', type: 'SERVE_ERROR', icon: '🎁', label: 'Opp. serve error', credited: false },
];

/** Timeline icon/label per scored kind (legacy 'point' keeps its 🏐 "Point"). */
const KIND_OF: Record<string, { kind: PointKind; icon: string; label: string }> = {
  POINT: { kind: 'point', icon: '🏐', label: 'Point' },
  ...Object.fromEntries(VB_OUTCOMES.map((o) => [o.type, { kind: o.kind, icon: o.icon, label: o.label }])),
};

/** Stats one point of `kind` credits to the player on it. An ace or block is also
 *  a point (VB-02), so profile/tournament "Points" match the live box score. */
export const volleyballCredits: PointCredits = (kind): Record<string, number> => {
  switch (kind) {
    case 'attack': return { points: 1, attackPoints: 1 };
    case 'block': return { blocks: 1, points: 1 };
    case 'ace': return { aces: 1, points: 1 };
    case 'point': return { points: 1 };
    default: return {}; // an opponent's error — nobody on the scoring side earned it
  }
};

/** The stat keys a volleyball stat line covers from SD-04 on (coverage flags). */
export const VB_TRACKED = ['points', 'attackPoints', 'aces', 'blocks'];

/** The attribution a credited outcome carries: primary stat + `extra` for the
 *  rest of `volleyballCredits`, so forward recording, undo (statReversals) and the
 *  editor's reconciliation all agree. */
export function outcomeAttribution(kind: VbOutcome | 'point', player?: { id: string; fullName: string }): Attribution | undefined {
  if (!player) return undefined;
  const credits = volleyballCredits(kind);
  const keys = Object.keys(credits);
  if (keys.length === 0) return undefined;
  // primary = the outcome's own stat (aces / blocks), else points
  const stat = kind === 'ace' ? 'aces' : kind === 'block' ? 'blocks' : 'points';
  const extra = Object.fromEntries(keys.filter((k) => k !== stat).map((k) => [k, credits[k]]));
  return {
    playerId: player.id, stat, playerName: player.fullName,
    ...(Object.keys(extra).length ? { extra } : {}),
    tracked: VB_TRACKED,
  };
}

/** The scoring action for one outcome (player optional; ignored for errors). */
export const outcomeAction = (kind: VbOutcome, side: 'home' | 'away', player?: { id: string; fullName: string }): ScoreAction => {
  const def = VB_OUTCOMES.find((o) => o.kind === kind)!;
  return { type: def.type, side, attribution: def.credited ? outcomeAttribution(kind, player) : undefined };
};

export const reducer = (s: VolleyballState, a: ScoreAction): VolleyballState => {
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
  const def = KIND_OF[a.type];
  if (s.ended || !a.side || !def) return s;
  const { kind, icon, label } = def;
  // An opponent's error is nobody's point on the scoring side.
  const who = kind === 'opperror' || kind === 'serveerror' ? undefined : a.attribution?.playerName;
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

export interface BoxLine { name: string; points: number; aces: number; blocks: number }

/** Box score: points, aces & blocks per player for one side (`scope` = one set).
 *  An ace or block is also a point, so it counts in both columns — the same credit
 *  the player's profile gets (`volleyballCredits`). */
export function tally(events: LiveEvent[], side: 'home' | 'away', scope: 'all' | number = 'all'): BoxLine[] {
  const byName = new Map<string, BoxLine>();
  const ensure = (name: string) => {
    if (!byName.has(name)) byName.set(name, { name, points: 0, aces: 0, blocks: 0 });
    return byName.get(name)!;
  };
  for (const e of events) {
    // Player-credited kinds only — an opponent's error (opperror/serveerror) is
    // the side's point but nobody's stat.
    if (e.side !== side || !e.playerName || (e.kind !== 'point' && e.kind !== 'attack' && e.kind !== 'ace' && e.kind !== 'block')) continue;
    if (scope !== 'all' && e.set !== scope) continue;
    const l = ensure(e.playerName);
    l.points += 1;            // every scored point counts…
    if (e.kind === 'ace') l.aces += 1; // …an ace also lands in the ace column
    if (e.kind === 'block') l.blocks += 1; // …a winning block in the block column
  }
  return [...byName.values()].sort((a, b) => b.points - a.points || b.aces - a.aces);
}


/** SD-17 standings units: rally points won by each side over every set (plus
 *  an unfinished one) — the FIVB point ratio. Sets come from the match score. */
export function standingsUnits(s: VolleyballState): { points: { home: number; away: number } } | null {
  if (!s || !Array.isArray(s.sets)) return null;
  const points = s.sets.reduce((t, [h, a]) => ({ home: t.home + h, away: t.away + a }), { home: s.current?.home ?? 0, away: s.current?.away ?? 0 });
  return { points };
}
