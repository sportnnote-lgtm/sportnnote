/**
 * SD-115 — the "what's at stake on the next point" chip for racket sports:
 * MATCH POINT / SET POINT / GAME POINT / BREAK POINT (+ the side that has it).
 *
 * Derived, never stored: each side's next point is played through the sport's
 * own (pure) reducer and the result compared with now — so every format rule
 * (no-ad, golden point, tiebreaks, Fast4 sudden death, caps, side-out scoring
 * where only the server can score) is handled by the engine itself.
 *
 *  • `unit: 'set'` (tennis, padel): MATCH POINT › SET POINT › BREAK POINT (the
 *    receiver would win the game). A plain game point for the server isn't shown.
 *  • `unit: 'game'` (badminton, table tennis, squash, pickleball): MATCH POINT ›
 *    GAME POINT.
 */
import type { ScoreAction } from './types';

type Side = 'home' | 'away';
export type PressureKind = 'MATCH POINT' | 'SET POINT' | 'GAME POINT' | 'BREAK POINT';
export interface Pressure { side: Side; kind: PressureKind }

interface AnyMatch {
  ended?: boolean;
  setsWon?: { home: number; away: number };
  games?: { home: number; away: number } | Array<[number, number]>;
  sets?: unknown[];
}

const setsDone = (s: AnyMatch) => (s.setsWon ? s.setsWon.home + s.setsWon.away : 0);
const gamesDone = (s: AnyMatch) => {
  const g = s.games;
  if (Array.isArray(g)) return g.length;
  return g ? g.home + g.away : 0;
};

export function pointPressure<S extends AnyMatch>(
  reducer: (s: S, a: ScoreAction) => S,
  s: S,
  opts: { unit: 'set' | 'game'; server?: Side | null },
): Pressure[] {
  if (!s || s.ended) return [];
  const out: Pressure[] = [];
  for (const side of ['home', 'away'] as const) {
    let next: S;
    try { next = reducer(s, { type: 'POINT', side }); } catch { continue; }
    if (!next || next === s) continue;
    if (next.ended) { out.push({ side, kind: 'MATCH POINT' }); continue; }
    if (opts.unit === 'set') {
      if (setsDone(next) > setsDone(s)) { out.push({ side, kind: 'SET POINT' }); continue; }
      if (opts.server && side !== opts.server && gamesDone(next) > gamesDone(s)) out.push({ side, kind: 'BREAK POINT' });
    } else if (gamesDone(next) > gamesDone(s)) {
      out.push({ side, kind: 'GAME POINT' });
    }
  }
  return out;
}

/** "MATCH POINT · Nadal" lines for the board (one per side that has one). */
export function pressureText(p: Pressure[], names: { home: string; away: string }): Array<{ side: Side; text: string }> {
  return p.map((x) => ({ side: x.side, text: `${x.kind} · ${names[x.side]}` }));
}
