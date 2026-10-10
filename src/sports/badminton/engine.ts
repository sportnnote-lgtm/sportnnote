/**
 * Badminton scoring engine (pure, BWF): rally scoring to 21, win by 2, cap 30
 * with a golden point; best of 3/5/single; serve side + service court derived
 * from the point log. Kept RN-free so node tests can replay matches through it.
 */
import type { LiveEvent } from '../liveEvents';
import type { ScoreAction, ScoreSummary } from '../types';
import { replayPoints, type PointInput } from '../rallyEdit.ts';
import { scoreLine as lineOf, finalSummary } from '../scoreline.ts';

const TARGET = 21;
const CAP = 30;
const GAMES_TO_WIN = 2;

export interface BadmintonState {
  current: { home: number; away: number };
  games: Array<[number, number]>;
  gamesWon: { home: number; away: number };
  /** points to win a game, win by 2 (format: pointsPerGame) */
  target: number;
  /** hard ceiling that settles a long deuce */
  cap: number;
  /** at the cap the next point wins (golden point); off = pure win-by-2 */
  goldenPoint: boolean;
  /** games a side must win to take the match (format: gamesToWin) */
  gamesToWin: number;
  /** doubles (2 a side) vs singles — drives the serve display */
  doubles: boolean;
  /** who serves the very first rally; after that the rally winner serves */
  firstServer: 'home' | 'away';
  events: LiveEvent[];
  seq: number;
  ended: boolean;
}

export const init = (config?: Record<string, unknown>): BadmintonState => {
  const target = Number(config?.pointsPerGame ?? TARGET);
  return {
    current: { home: 0, away: 0 },
    games: [],
    gamesWon: { home: 0, away: 0 },
    target,
    cap: Number(config?.cap ?? target + (CAP - TARGET)), // 21→30 by default; presets can override (5×11 caps at 15)
    goldenPoint: config?.goldenPoint !== false, // default on (BWF 29-29 golden point)
    gamesToWin: Number(config?.gamesToWin ?? GAMES_TO_WIN),
    doubles: Number(config?.playersPerSide ?? 1) >= 2,
    firstServer: (config?.firstServer as 'home' | 'away') ?? 'home',
    events: [],
    seq: 0,
    ended: false,
  };
};

/** Who serves the next rally: the last rally winner (badminton rally scoring),
 *  or the chosen first server before any point. The serving side's current-game
 *  score parity sets the service court (even = right, odd = left). Derived from
 *  the point log, so undo/replay stay correct. */
export function serve(s: BadmintonState): { side: 'home' | 'away'; court: 'right' | 'left' } {
  let last: 'home' | 'away' | undefined;
  for (let i = s.events.length - 1; i >= 0; i--) {
    if (s.events[i].kind === 'point') { last = s.events[i].side as 'home' | 'away'; break; }
  }
  const side = last ?? s.firstServer;
  return { side, court: s.current[side] % 2 === 0 ? 'right' : 'left' };
}

function gameWinner(h: number, a: number, target: number, cap: number, goldenPoint: boolean): 'home' | 'away' | null {
  // Golden point: at the cap the next point wins outright (skip when disabled).
  if (goldenPoint && h >= cap) return 'home';
  if (goldenPoint && a >= cap) return 'away';
  if (h >= target && h - a >= 2) return 'home';
  if (a >= target && a - h >= 2) return 'away';
  return null;
}

/** Reset the match to 0-0 keeping its format (target/cap/golden-point/games) —
 *  the clean slate an EDIT_LOG replay rebuilds the corrected point list onto. */
const clearMatch = (s: BadmintonState): BadmintonState => ({
  ...s, current: { home: 0, away: 0 }, games: [], gamesWon: { home: 0, away: 0 }, events: [], seq: 0, ended: false,
});

export const reducer = (s: BadmintonState, a: ScoreAction): BadmintonState => {
  // Timeline correction: STAT_ADJUST only reconciles player profiles (no match
  // effect); EDIT_LOG replays a corrected point list so the games re-derive.
  if (a.type === 'STAT_ADJUST') return s;
  if (a.type === 'EDIT_LOG') return replayPoints(reducer, clearMatch(s), (a.payload?.points as PointInput[]) ?? []);
  // Who serves the first rally — settable only before any point; after that the
  // rally winner serves. No `side` on this action.
  if (a.type === 'SET_FIRST_SERVER') {
    const played = s.current.home || s.current.away || s.games.length;
    const side = a.payload?.side as 'home' | 'away' | undefined;
    if (played || (side !== 'home' && side !== 'away')) return s;
    return { ...s, firstServer: side };
  }
  if (a.type !== 'POINT' || !a.side || s.ended) return s;
  const who = a.attribution?.playerName;
  // SD-19: keep the credited player's id on the point (absolute statTotals).
  const pid = a.attribution?.playerId ? { playerId: a.attribution.playerId } : {};
  const current = { ...s.current, [a.side]: s.current[a.side] + 1 };
  const gameNo = s.games.length + 1;
  let seq = s.seq;
  const events = [...s.events];
  // Structured fields (kind/playerName/game/points) let the per-game box score
  // aggregate points per player, filtered by game — the timeline ignores them.
  events.push({ id: ++seq, stamp: `Game ${gameNo}`, icon: '🏸', label: 'Point', detail: `${current.home}-${current.away}${who ? ` · ${who}` : ''}`, side: a.side, kind: 'point', playerName: who, ...pid, game: gameNo, points: 1 });

  const winner = gameWinner(current.home, current.away, s.target, s.cap, s.goldenPoint ?? true);
  if (!winner) return { ...s, current, events, seq };

  const games = [...s.games, [current.home, current.away] as [number, number]];
  const gamesWon = { ...s.gamesWon, [winner]: s.gamesWon[winner] + 1 };
  const ended = gamesWon[winner] >= s.gamesToWin;
  events.push({ id: ++seq, stamp: 'Game', icon: '🎉', label: `Game ${gameNo} won`, detail: `${current.home}-${current.away}`, side: winner });
  if (ended) events.push({ id: ++seq, stamp: 'Match', icon: '🏆', label: 'Match won', detail: `${gamesWon.home}-${gamesWon.away} games`, side: winner });
  return { ...s, current: { home: 0, away: 0 }, games, gamesWon, events, seq, ended };
};


/** SD-01 — the completed games, "21-18, 19-21, 21-15". */
export function scoreLine(s: BadmintonState, perspective?: 'home' | 'away'): string {
  return lineOf(s?.games, { perspective });
}

/** Scoreboard summary: live = the current game's points; once ended = games won
 *  + every game's score (not the reset 0–0). */
export function summary(s: BadmintonState): ScoreSummary {
  if (s.ended) return finalSummary(s.gamesWon, scoreLine(s));
  const line = scoreLine(s);
  return {
    homeScore: String(s.current.home),
    awayScore: String(s.current.away),
    statusLine: `Game ${s.games.length + 1}`,
    detailLine: `Games — ${s.gamesWon.home}:${s.gamesWon.away}${line ? ` (${line})` : ''} · to ${s.target} · ${s.gamesToWin === 1 ? 'single game' : `best of ${s.gamesToWin * 2 - 1}`}`,
  };
}

/** SD-17 standings units: rally points won by each side over every game (plus
 *  an unfinished one) — the BWF points difference. Games come from the score. */
export function standingsUnits(s: BadmintonState): { points: { home: number; away: number } } | null {
  if (!s || !Array.isArray(s.games)) return null;
  const points = s.games.reduce((t, [h, a]) => ({ home: t.home + h, away: t.away + a }), { home: s.current?.home ?? 0, away: s.current?.away ?? 0 });
  return { points };
}
