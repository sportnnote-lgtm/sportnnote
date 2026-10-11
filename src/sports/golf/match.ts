/**
 * Golf match play state + reducer (moved out of index.tsx so it is testable in
 * node; index.tsx re-exports it). The original HOLE / CONCEDE behaviour is
 * unchanged — SD-87 only ADDS keys, so every older event log replays to the
 * same state:
 *   • `firstHole` — set only for a back-nine match (10), so holes read 10–18;
 *   • `strokes`   — the handicap strokes (SET_STROKES; absent = a plain match);
 *   • `scores`    — per-hole gross strokes, only once a HOLE carries
 *                   `{ home, away }`. The winner still comes from `winner`
 *                   (the scorer's screen works it out with `holeWinner`).
 */
import { matchState, type HoleWinner } from './engine.ts';
import type { MatchStrokes } from './matchStrokes.ts';

export interface GolfMatchState {
  /** holes in the match (18 or 9) */
  regulation: number;
  /** knockout: an all-square match goes to extra holes */
  extraHoles: boolean;
  holes: HoleWinner[];
  /** a side conceded the match */
  conceded?: 'home' | 'away';
  ended: boolean;
  seq: number;
  /** SD-87 — the first hole's number: 10 on a back-nine match (absent = 1) */
  firstHole?: number;
  /** SD-87 — handicap strokes for the match (absent = none set) */
  strokes?: MatchStrokes;
  /** SD-87 — each hole's gross strokes, when they were entered */
  scores?: ({ home: number; away: number } | null)[];
}

export const initGolfMatch = (config?: Record<string, unknown>): GolfMatchState => ({
  regulation: String(config?.holes ?? '18') === '18' ? 18 : 9,
  extraHoles: config?.extraHoles === true,
  holes: [],
  ended: false,
  seq: 0,
  ...(String(config?.holes) === 'back9' ? { firstHole: 10 } : {}),
});

const strokeCount = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 20 ? v : null);

export const golfMatchReducer = (s: GolfMatchState, a: { type: string; side?: 'home' | 'away'; payload?: Record<string, unknown> }): GolfMatchState => {
  if (s.ended) return s;
  if (a.type === 'HOLE') {
    const w = a.payload?.winner as HoleWinner | undefined;
    if (w !== 'home' && w !== 'away' && w !== 'halved') return s;
    const holes = [...s.holes, w];
    const m = matchState(holes, s.regulation, s.extraHoles);
    const next: GolfMatchState = { ...s, holes, ended: m.decided, seq: s.seq + 1 };
    // SD-87 — keep the gross strokes when the hole was scored stroke by stroke
    const home = strokeCount(a.payload?.home), away = strokeCount(a.payload?.away);
    if (home != null && away != null) {
      const scores = [...(s.scores ?? s.holes.map(() => null))];
      scores[holes.length - 1] = { home, away };
      next.scores = scores;
    } else if (s.scores) {
      next.scores = [...s.scores, null];
    }
    return next;
  }
  if (a.type === 'CONCEDE' && (a.side === 'home' || a.side === 'away')) {
    return { ...s, conceded: a.side, ended: true, seq: s.seq + 1 };
  }
  // SD-87 — set (or clear, with no payload) the handicap strokes
  if (a.type === 'SET_STROKES') {
    const ms = a.payload?.strokes as MatchStrokes | undefined;
    if (ms && (!Array.isArray(ms.holes) || !Array.isArray(ms.home) || !Array.isArray(ms.away))) return s;
    const { strokes: _old, ...rest } = s;
    return ms ? { ...rest, strokes: ms, seq: s.seq + 1 } : { ...rest, seq: s.seq + 1 };
  }
  return s;
};

export const golfMatchStateOf = (s: GolfMatchState) => matchState(s.holes, s.regulation, s.extraHoles, s.firstHole ?? 1);
