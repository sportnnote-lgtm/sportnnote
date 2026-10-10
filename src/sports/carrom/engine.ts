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
import { scoreLine as lineOf, finalSummary } from '../scoreline.ts';

export type Side = 'home' | 'away';

export interface BoardResult { winner: Side; coins: number; queen: boolean; points: number; game: number }

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
  };
}

/** Points a board is worth to its winner, given their total before the board. */
export function boardPoints(coins: number, queen: boolean, winnerTotal: number, s: Pick<CarromState, 'queenValue' | 'queenCutoff'>): number {
  const c = Math.max(0, Math.min(9, Math.round(coins)));
  return c + (queen && winnerTotal < s.queenCutoff ? s.queenValue : 0);
}

/** BOARD {side: winner, payload: {coins (opponent's left, 0-9), queen}}. */
export function reducer(s: CarromState, a: { type: string; side?: Side; payload?: Record<string, unknown> }): CarromState {
  if (a.type !== 'BOARD' || s.ended || (a.side !== 'home' && a.side !== 'away')) return s;
  const side = a.side;
  const coins = Number(a.payload?.coins ?? 0);
  const queen = !!a.payload?.queen;
  const pts = boardPoints(coins, queen, s.current[side], s);
  const gameNo = s.games.length + 1;
  const current = { ...s.current, [side]: s.current[side] + pts };
  const boardsInGame = s.boardsInGame + 1;
  const boards = [...s.boards, { winner: side, coins, queen, points: pts, game: gameNo }];

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
