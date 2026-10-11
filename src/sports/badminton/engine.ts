/**
 * Badminton scoring engine (pure, BWF): rally scoring to 21, win by 2, cap 30
 * with a golden point; best of 3/5/single; serve side + service court derived
 * from the point log. Kept RN-free so node tests can replay matches through it.
 */
import type { LiveEvent } from '../liveEvents';
import type { ScoreAction, ScoreSummary } from '../types';
import type { PointInput } from '../rallyEdit.ts';
import { applyPointDetail, detailFlags, initDetailFlags } from '../pointDetail.ts';
import { scoreLine as lineOf, finalSummary, pointsLineScore, type LineScore } from '../scoreline.ts';
import { badmintonCue as cueOf, type Cue } from '../courtCues.ts';
import { applyRacketExtras, replayKeepingMarks, withStamps, type ConductOps } from '../conduct.ts';
import { withDoublesOrder, type DoublesOrder } from '../doublesOrder.ts';

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
  /** SD-115 — the scorer has picked who serves first (SET_FIRST_SERVER); the
   *  point buttons stay disabled until then (no silent "home" default). */
  serverPicked?: boolean;
  /** SD-107 — optional point detail (how each point was won) is being
   *  captured; absent / false = off (D8). Format key / SET_DETAIL. */
  pointDetail?: boolean;
  /** SD-74 — doubles: per game, who serves first / receives first (player ids,
   *  SET_SERVE_ORDER; BWF Law 11.5–11.6). Absent → roster order. */
  dblOrder?: DoublesOrder;
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
    ...initDetailFlags(config),
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

/** SD-53 — the generic conduct step's hooks: a fault (red card, BWF Law
 *  16.7) is a rally lost — a plain point to the opponent, who then serves. */
const conductOps: ConductOps<BadmintonState> = {
  sport: 'badminton',
  point: (s, side) => core(s, { type: 'POINT', side }),
  gameKey: (s) => `${s.games.length}${s.ended ? 'E' : ''}`,
  where: (s) => ({ stamp: `Game ${s.games.length + 1}`, game: s.games.length + 1 }),
};

const core = (s: BadmintonState, a: ScoreAction): BadmintonState => {
  // Timeline correction: STAT_ADJUST only reconciles player profiles (no match
  // effect); EDIT_LOG replays a corrected point list so the games re-derive.
  if (a.type === 'STAT_ADJUST') return s;
  if (a.type === 'EDIT_LOG') return replayKeepingMarks(reducer, clearMatch(s), (a.payload?.points as PointInput[]) ?? [], s.events);
  // SD-53 — misconduct (warning / fault / disqualification)
  const extra = applyRacketExtras(s, a, conductOps);
  if (extra) return extra;
  // Who serves the first rally — settable only before any point; after that the
  // rally winner serves. No `side` on this action.
  // SD-115: a `v:2` payload may fix it mid-match — it only names who served the
  // first rally (the rally winner serves after that), so the score never changes.
  if (a.type === 'SET_FIRST_SERVER') {
    const played = s.current.home || s.current.away || s.games.length;
    const side = a.payload?.side as 'home' | 'away' | undefined;
    if (side !== 'home' && side !== 'away') return s;
    if (played && (a.payload?.v !== 2 || s.ended)) return s;
    return { ...s, firstServer: side, serverPicked: true };
  }
  // SD-74 — doubles: who serves / receives first in this game (player ids).
  // No score effect, no timeline event; mid-game only with v:2 (a fix).
  if (a.type === 'SET_SERVE_ORDER') return withDoublesOrder(s, a.payload);
  // SD-107 — capture setting (from the next point) and a point's detail
  // (annotates the last point; allowed after the match point too).
  if (a.type === 'SET_DETAIL') { const f = detailFlags(a.payload, s); return f ? { ...s, ...f } : s; }
  if (a.type === 'POINT_DETAIL') { const ev = applyPointDetail(s.events, a.payload); return ev ? { ...s, events: ev } : s; }
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
// SD-54 — every new event carries the step's `payload.at` (durations)
export const reducer = withStamps(core);


/** SD-01 — the completed games, "21-18, 19-21, 21-15". */
export function scoreLine(s: BadmintonState, perspective?: 'home' | 'away'): string {
  return lineOf(s?.games, { perspective });
}

/** SD-20 — the line score: every game + the one in play. */
export const lineScore = (s: BadmintonState): LineScore | null =>
  pointsLineScore('game', s && { games: s.games, current: s.current, won: s.gamesWon, ended: s.ended, toWin: s.gamesToWin });

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

/** SD-117c — interval / change-ends cue due after the last rally (BWF; derived). */
export const badmintonCue = (s: BadmintonState): Cue | null => cueOf(s);
