/**
 * SD-117c — "Change ends" / interval cues for the racket sports, DERIVED from
 * the score (never stored, so old logs replay identically — Decision 8):
 *
 *  • tennis / padel (ITF Rule 10, FIP): change ends after every odd game,
 *    counted through the match (a set tiebreak counts as one game, a match
 *    tiebreak as one game) — so after an odd set they change at the set break
 *    and an even set moves the change to the end of game 1. Inside a tiebreak
 *    (set or match): every 6 points. 90 s at a changeover, none after the
 *    first game of a set, 120 s at a set break.
 *  • badminton (BWF Laws 16): a 60 s interval when the leading score first
 *    reaches 11 (half the game target, rounded up), 120 s between games, ends
 *    changed after each game and at 11 in the deciding game.
 *  • table tennis (ITTF 2.15): change ends after each game, and in the last
 *    possible game when a player first reaches 5 (10 in a 21-point game).
 *
 * `…Cue(state)` says what's due NOW (after the last point); `cueMarkers`
 * replays the log point by point to place the same cues on the timeline.
 * PURE (no React Native).
 */
import type { LiveEvent } from './liveEvents';
import type { ScoreAction } from './types';
import { replayPoints, type PointInput } from './rallyEdit.ts';

type Side = 'home' | 'away';
type PerSide = { home: number; away: number };

export interface Cue {
  kind: 'ends' | 'interval';
  /** "↔ Change ends · 90 s" */
  text: string;
}

const ENDS = '↔ Change ends';

// --------------------------------------------------------- tennis / padel --

export interface SetSportView {
  ended?: boolean;
  pts: PerSide;
  games: PerSide;
  sets: Array<[number, number]>;
  /** games counted through the match (standingsUnits: TB set = 7-6, match TB = 1) */
  matchGames: PerSide;
  inTiebreak: boolean;
}

/** Tennis / padel: the cue due after the last point (null = none). */
export function setSportCue(v: SetSportView): Cue | null {
  if (v.ended) return null;
  const n = v.pts.home + v.pts.away;
  if (v.inTiebreak && n > 0) {
    return n % 6 === 0 ? { kind: 'ends', text: `${ENDS} · tiebreak, every 6 points (no rest)` } : null;
  }
  // between games (a tiebreak at 0-0 still follows the odd-game rule)
  if (n) return null;
  const total = v.matchGames.home + v.matchGames.away;
  if (total === 0) return null;
  const inSet = v.games.home + v.games.away;
  const setBreak = inSet === 0 && v.sets.length > 0;
  if (total % 2 === 1) {
    if (setBreak) return { kind: 'ends', text: `${ENDS} · set break (120 s)` };
    return { kind: 'ends', text: inSet === 1 ? `${ENDS} · no rest after the first game` : `${ENDS} · 90 s changeover` };
  }
  return setBreak ? { kind: 'interval', text: '⏸ Set break (120 s) · ends change after game 1' } : null;
}

// --------------------------------------------------------------- games --

export interface GameSportView {
  ended?: boolean;
  current: PerSide;
  games: Array<[number, number]>;
  gamesWon: PerSide;
  gamesToWin: number;
  target: number;
  events?: LiveEvent[];
}

const lastPointSide = (events?: LiveEvent[]): Side | undefined => {
  for (let i = (events?.length ?? 0) - 1; i >= 0; i--) {
    const e = events![i];
    if (e.kind === 'point' || e.kind === 'ace') return e.side === 'home' || e.side === 'away' ? e.side : undefined;
  }
  return undefined;
};

/** Is the game in play the last possible one? */
export const isDecidingGame = (v: Pick<GameSportView, 'gamesWon' | 'gamesToWin'>): boolean =>
  v.gamesToWin > 1 && v.gamesWon.home === v.gamesToWin - 1 && v.gamesWon.away === v.gamesToWin - 1;

/** Did the last point just take a side FIRST to `at` in this game? */
const justReached = (v: GameSportView, at: number): boolean => {
  const { home, away } = v.current;
  const side = lastPointSide(v.events);
  if (!side) return false;
  const me = v.current[side];
  const them = side === 'home' ? away : home;
  return me === at && them < at && home + away > 0;
};

/** Badminton: interval at 11 (change ends in the decider), 120 s + ends between games. */
export function badmintonCue(v: GameSportView): Cue | null {
  if (v.ended) return null;
  if (!v.current.home && !v.current.away) {
    return v.games.length > 0 ? { kind: 'ends', text: `${ENDS} · 120 s between games` } : null;
  }
  const mid = Math.ceil(v.target / 2);
  if (!justReached(v, mid)) return null;
  return isDecidingGame(v)
    ? { kind: 'ends', text: `${ENDS} · interval at ${mid} in the deciding game (60 s)` }
    : { kind: 'interval', text: `⏸ Interval at ${mid} (60 s)` };
}

/** Table tennis: ends after each game, and at 5 (half the target) in the decider. */
export function tableTennisCue(v: GameSportView): Cue | null {
  if (v.ended) return null;
  if (!v.current.home && !v.current.away) {
    return v.games.length > 0 ? { kind: 'ends', text: `${ENDS} · up to 1 min between games` } : null;
  }
  const at = Math.floor(v.target / 2);
  return isDecidingGame(v) && justReached(v, at) ? { kind: 'ends', text: `${ENDS} · ${at} in the deciding game` } : null;
}

// --------------------------------------------------------- the timeline --

/**
 * The cues placed on a point log: replays `inputs` one point at a time through
 * the sport's reducer (from `cleared`, the match at 0-0 with its format) and
 * returns a marker event after the last event each cue-bearing point produced.
 * Marker ids sit between event ids (`id + 0.5`), so a newest-first timeline
 * puts them right after their point. Display only — never dispatched.
 */
export function cueMarkers<S extends { events: LiveEvent[] }>(
  reducer: (s: S, a: ScoreAction) => S,
  cleared: S,
  inputs: PointInput[],
  cueOf: (s: S) => Cue | null,
  events: LiveEvent[],
): LiveEvent[] {
  const out: LiveEvent[] = [];
  let s = cleared;
  for (const p of inputs) {
    s = replayPoints(reducer, s, [p]);
    const c = cueOf(s);
    if (!c) continue;
    const at = events[s.events.length - 1];
    if (!at) continue;
    out.push({ id: at.id + 0.5, stamp: c.kind === 'ends' ? 'Ends' : 'Break', icon: c.kind === 'ends' ? '↔️' : '⏸', label: c.text.replace(/^(↔|⏸)\s*/, '') });
  }
  return out;
}

/** The log plus its cue markers, for LiveTimeline. */
export const withCues = (events: LiveEvent[], markers: LiveEvent[]): LiveEvent[] => (markers.length ? [...events, ...markers] : events);
