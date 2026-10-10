/**
 * Carrom engine (ICF rules, singles/doubles). A game is a series of BOARDS. The
 * board winner scores 1 point for each of the opponent's coins left on the board,
 * plus 3 for the Queen if they pocketed and covered it — but the Queen only counts
 * while the winner's game total is under 22 (r.52-54: "3 points up to and
 * including 21"; a Queen covered by the LOSER scores nobody anything). The most
 * a board can be worth is 12. A game ends when a side reaches the
 * target (25), or after the board limit (8) — then the higher total wins; level
 * after the limit → an extra (tie-break) board. A match is best of 1 or 3 games.
 */
import type { ScoreSummary } from '../types';
import { scoreLine as lineOf, finalSummary, pointsLineScore, type LineScore } from '../scoreline.ts';

export type Side = 'home' | 'away';

/** SD-37/78 — a slam: the board finished in the first turn. White = by the
 *  side that broke; Black = by the side that didn't (ICF records). */
export type Slam = 'white' | 'black';

export interface BoardResult {
  winner: Side; coins: number; queen: boolean;
  /** the board's value as played (coins + a Queen that counted) — uncapped;
   *  `creditedPoints` gives what it adds to the game score (capped at 25) */
  points: number; game: number;
  /** SD-37 — only on a board recorded with a slam (old logs: absent) */
  slam?: Slam;
}

/** SD-37 — a player the log credited (the scorer's attribution on a BOARD). */
export interface CarromCredit { side: Side; id?: string; name?: string }

export interface CarromState {
  current: { home: number; away: number };
  /** boards played in the current game */
  boardsInGame: number;
  boards: BoardResult[];
  games: Array<[number, number]>;
  gamesWon: { home: number; away: number };
  target: number;
  maxBoards: number;
  gamesToWin: number;
  queenValue: number;
  /** the Queen stops counting once the board winner's total reaches this */
  queenCutoff: number;
  ended: boolean;
  seq: number;
  /** players per side (1 singles, 2 doubles) — which roster players a board credits */
  perSide?: number;
  /** SD-37 — every player the log credited, per side (absent until a credited
   *  board; deduplicated). `statTotals` adds them to the ctx players. */
  credited?: CarromCredit[];
}

export function init(config?: Record<string, unknown>): CarromState {
  return {
    current: { home: 0, away: 0 }, boardsInGame: 0, boards: [], games: [], gamesWon: { home: 0, away: 0 },
    target: Number(config?.target ?? 25),
    maxBoards: Number(config?.maxBoards ?? 8),
    gamesToWin: Number(config?.gamesToWin ?? 2),
    queenValue: 3,
    queenCutoff: Number(config?.queenCutoff ?? 22),
    ended: false, seq: 0,
    perSide: Number(config?.playersPerSide ?? 1) >= 2 ? 2 : 1,
  };
}

/** Points a board is worth to its winner, given their total before the board. */
export function boardPoints(coins: number, queen: boolean, winnerTotal: number, s: Pick<CarromState, 'queenValue' | 'queenCutoff'>): number {
  const c = Math.max(0, Math.min(9, Math.round(coins)));
  return c + (queen && winnerTotal < s.queenCutoff ? s.queenValue : 0);
}

/** SD-37 — what a board adds to its winner's GAME score: its value, capped so
 *  the game is recorded at the target (Laws r.56 — a 28 is written 25). The
 *  credited player points, so a player's points = their side's game scores. */
export function creditPoints(coins: number, queen: boolean, winnerTotal: number, s: Pick<CarromState, 'queenValue' | 'queenCutoff' | 'target'>): number {
  const pts = boardPoints(coins, queen, winnerTotal, s);
  return winnerTotal + pts >= s.target ? Math.max(0, s.target - winnerTotal) : pts;
}

/** SD-37 — the capped value of every board in `s.boards` (same order), replayed
 *  from the boards: per game, the winner's running total before each board. */
export function creditedPoints(s: Pick<CarromState, 'boards' | 'target'>): number[] {
  const run = new Map<number, { home: number; away: number }>();
  return (s?.boards ?? []).map((b) => {
    const t = run.get(b.game) ?? run.set(b.game, { home: 0, away: 0 }).get(b.game)!;
    const before = t[b.winner];
    const v = before + b.points >= s.target ? Math.max(0, s.target - before) : b.points;
    t[b.winner] = before + b.points;
    return v;
  });
}

type Attr = { playerId?: string; playerName?: string } | null | undefined;

/** The players a BOARD action credits (attribution + a doubles partner's
 *  `attribution2`, stored as `payload._attr2` on replay). */
function creditsOf(side: Side, a: { attribution?: Attr; attribution2?: Attr; payload?: Record<string, unknown> }, prior: CarromCredit[] | undefined): CarromCredit[] | undefined {
  let out = prior;
  for (const at of [a.attribution, a.attribution2 ?? (a.payload?._attr2 as Attr)]) {
    if (!at || (!at.playerId && !at.playerName)) continue;
    const c: CarromCredit = { side, ...(at.playerId ? { id: at.playerId } : {}), ...(at.playerName ? { name: at.playerName } : {}) };
    if ((out ?? []).some((o) => o.side === side && (c.id ? o.id === c.id : !o.id && o.name === c.name))) continue;
    out = [...(out ?? []), c];
  }
  return out;
}

/**
 * BOARD {side: winner, payload: {coins (opponent's left, 0-9), queen, slam?}}.
 * SD-37: `slam` ('white' | 'black') is optional — old logs replay identically.
 */
export function reducer(s: CarromState, a: { type: string; side?: Side; payload?: Record<string, unknown>; attribution?: Attr; attribution2?: Attr }): CarromState {
  if (a.type !== 'BOARD' || s.ended || (a.side !== 'home' && a.side !== 'away')) return s;
  const side = a.side;
  const coins = Number(a.payload?.coins ?? 0);
  const queen = !!a.payload?.queen;
  const slam = a.payload?.slam === 'white' || a.payload?.slam === 'black' ? (a.payload.slam as Slam) : undefined;
  const pts = boardPoints(coins, queen, s.current[side], s);
  const gameNo = s.games.length + 1;
  const current = { ...s.current, [side]: s.current[side] + pts };
  const boardsInGame = s.boardsInGame + 1;
  const boards = [...s.boards, { winner: side, coins, queen, points: pts, game: gameNo, ...(slam ? { slam } : {}) }];
  const credited = creditsOf(side, a, s.credited);
  if (credited) s = { ...s, credited };

  let gameWinner: Side | null = null;
  if (current[side] >= s.target) gameWinner = side;
  else if (boardsInGame >= s.maxBoards && current.home !== current.away) gameWinner = current.home > current.away ? 'home' : 'away';
  // Level after the board limit: keep playing (tie-break boards) until someone leads.

  if (!gameWinner) return { ...s, current, boardsInGame, boards, seq: s.seq + 1 };
  // Results are written with the winner on the target: a game "won 25-22" even if
  // the last board took them past 25 (Laws of Carrom r.56 — a game is 25 points).
  const final = { ...current, [gameWinner]: Math.min(current[gameWinner], s.target) };
  const games = [...s.games, [final.home, final.away] as [number, number]];
  const gamesWon = { ...s.gamesWon, [gameWinner]: s.gamesWon[gameWinner] + 1 };
  const ended = gamesWon[gameWinner] >= s.gamesToWin;
  return { ...s, current: { home: 0, away: 0 }, boardsInGame: 0, boards, games, gamesWon, ended, seq: s.seq + 1 };
}

export function result(s: CarromState): { winner: Side | 'draw'; home: number; away: number } | null {
  if (!s.ended) return null;
  return { winner: s.gamesWon.home > s.gamesWon.away ? 'home' : 'away', home: s.gamesWon.home, away: s.gamesWon.away };
}

/** SD-01 — the completed games, "25-18, 12-25, 25-20". */
export function scoreLine(s: CarromState, perspective?: Side): string {
  return lineOf(s?.games, { perspective });
}

/** SD-20 — the line score: every game + the one in play (board points). */
export const lineScore = (s: CarromState): LineScore | null =>
  pointsLineScore('game', s && { games: s.games, current: s.current, won: s.gamesWon, ended: s.ended, toWin: s.gamesToWin });

/** Scoreboard summary: live = this game's points; once ended = games won + every
 *  game's score (the board no longer reads the reset 0 : 0). */
export function summary(s: CarromState): ScoreSummary {
  if (s.ended) return finalSummary(s.gamesWon, scoreLine(s));
  const line = scoreLine(s);
  return {
    homeScore: String(s.current.home),
    awayScore: String(s.current.away),
    statusLine: `Game ${s.games.length + 1} · board ${s.boardsInGame + 1}`,
    detailLine: `Games — ${s.gamesWon.home}:${s.gamesWon.away}${line ? ` (${line})` : ''} · to ${s.target} · ${s.gamesToWin === 1 ? 'single game' : `best of ${s.gamesToWin * 2 - 1}`}`,
  };
}

/** SD-17 standings units: board points won by each side over every game (plus
 *  an unfinished one) — the carrom points-difference tie-break. */
export function standingsUnits(s: CarromState): { points: { home: number; away: number } } | null {
  if (!s || !Array.isArray(s.games)) return null;
  const points = s.games.reduce((t, [h, a]) => ({ home: t.home + h, away: t.away + a }), { home: s.current?.home ?? 0, away: s.current?.away ?? 0 });
  return { points };
}
