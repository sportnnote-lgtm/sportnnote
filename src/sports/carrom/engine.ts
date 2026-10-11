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
  /** SD-117c — who covered the Queen, when the scorer said so (the three-way
   *  chip): 'winner' (= `queen`), 'loser' (covered by the side that lost the
   *  board — it scores nobody anything) or 'none'. Absent = not recorded. */
  queenBy?: QueenBy;
  /** SD-68 (CR-07) — a penalty board: `PENALTY_POINTS` (3) to `winner` (the
   *  side NOT penalised). It is a board played (the break moves on, it counts
   *  toward the board limit) but not a board won, a Queen or a slam. Only on
   *  a board recorded as one (old logs: absent). */
  penalty?: true;
}

/** SD-68 (CR-07) — what a penalty board gives the opponent. */
export const PENALTY_POINTS = 3;

/** SD-117c — the three-way Queen chip. */
export type QueenBy = 'winner' | 'loser' | 'none';

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
  /** SD-117c (CR-04) — who broke the first board of game 1 (the toss /
   *  FIRST_BREAK). The break then alternates board by board, and the first
   *  break of each game alternates game by game. Absent = not recorded (every
   *  older match): no breaker is shown or counted. */
  firstBreak?: Side;
  /** SD-117c — the players each board credited (same order as `boards`), so
   *  the board editor can replay a corrected list with its credits. Absent
   *  until a credited board; not part of the score. */
  boardBy?: CarromCredit[][];
}

/** SD-117c — one board as the editor replays it (EDIT_LOG). */
export interface BoardInput {
  side: Side; coins: number; queen: boolean;
  queenBy?: QueenBy; slam?: Slam;
  /** SD-68 — a penalty board (3 to `side`) */
  penalty?: boolean;
  /** the players the board credited (attribution / attribution2) */
  by?: CarromCredit[];
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
 * SD-68 (CR-07): `penalty: true` (optional) = a penalty board — `side` is the
 * side awarded PENALTY_POINTS; coins / Queen / slam are ignored.
 */
export function reducer(s: CarromState, a: { type: string; side?: Side; payload?: Record<string, unknown>; attribution?: Attr; attribution2?: Attr }): CarromState {
  // SD-117c — corrections. STAT_ADJUST only reconciles player profiles (no
  // match effect); EDIT_LOG replays a corrected board list (the board editor).
  if (a.type === 'STAT_ADJUST') return s;
  if (a.type === 'EDIT_LOG') return replayBoards(s, (a.payload?.boards as BoardInput[] | undefined) ?? []);
  // SD-117c (CR-04) — the toss: who breaks the first board. Only names the
  // breaker (derived per board), so it may be fixed later; no score effect.
  if (a.type === 'FIRST_BREAK') {
    const side = (a.payload?.side ?? a.side) as Side | undefined;
    if (s.ended || (side !== 'home' && side !== 'away')) return s;
    return { ...s, firstBreak: side };
  }
  if (a.type !== 'BOARD' || s.ended || (a.side !== 'home' && a.side !== 'away')) return s;
  const side = a.side;
  const penalty = a.payload?.penalty === true;
  const coins = penalty ? 0 : Number(a.payload?.coins ?? 0);
  const qb = penalty ? undefined : a.payload?.queenBy;
  const queenBy: QueenBy | undefined = qb === 'winner' || qb === 'loser' || qb === 'none' ? qb : undefined;
  // the three-way chip wins over the old flag; old logs carry only `queen`
  const queen = penalty ? false : queenBy ? queenBy === 'winner' : !!a.payload?.queen;
  const slam = !penalty && (a.payload?.slam === 'white' || a.payload?.slam === 'black') ? (a.payload!.slam as Slam) : undefined;
  const pts = penalty ? PENALTY_POINTS : boardPoints(coins, queen, s.current[side], s);
  const gameNo = s.games.length + 1;
  const current = { ...s.current, [side]: s.current[side] + pts };
  const boardsInGame = s.boardsInGame + 1;
  const boards = [...s.boards, { winner: side, coins, queen, points: pts, game: gameNo, ...(slam ? { slam } : {}), ...(queenBy ? { queenBy } : {}), ...(penalty ? { penalty: true as const } : {}) }];
  const credited = creditsOf(side, a, s.credited);
  if (credited) s = { ...s, credited };
  // SD-117c — this board's own credits (for the editor's replay)
  const by = creditsOf(side, a, undefined) ?? [];
  if (by.length || s.boardBy) s = { ...s, boardBy: [...(s.boardBy ?? s.boards.map(() => [])), by] };

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

/** SD-116 — what recording this board would close, for the Record button
 *  ("✓ Record board · wins Game 2"). Pure: replays the board on a copy.
 *  `winner` is the side that takes the game — after the board limit that can
 *  be the side that LOST this board. null = the game goes on. */
export function boardCloses(s: CarromState, side: Side, coins: number, queen: boolean, penalty = false): { kind: 'game' | 'match'; game: number; winner: Side } | null {
  if (s.ended) return null;
  const next = reducer(s, { type: 'BOARD', side, payload: penalty ? { penalty: true } : { coins, queen } });
  if (next.games.length === s.games.length) return null;
  const winner: Side = next.gamesWon.home > s.gamesWon.home ? 'home' : 'away';
  return { kind: next.ended ? 'match' : 'game', game: next.games.length, winner };
}

// ------------------------------------------------ SD-117c · breaker --

/** The side that breaks the board at `index` (0-based, over the whole match)
 *  of `boards`, or null when the toss wasn't recorded. Game g's first break
 *  alternates (game 1: the toss winner), then the break alternates board by
 *  board inside the game — ICF. */
export function breakerAt(s: Pick<CarromState, 'firstBreak' | 'boards' | 'games'>, game: number, boardInGame: number): Side | null {
  if (!s.firstBreak) return null;
  const other: Side = s.firstBreak === 'home' ? 'away' : 'home';
  const opener = game % 2 === 1 ? s.firstBreak : other;
  return boardInGame % 2 === 0 ? opener : opener === 'home' ? 'away' : 'home';
}

/** Who broke each recorded board (same order as `s.boards`); null = unknown. */
export function boardBreakers(s: CarromState): Array<Side | null> {
  const seen = new Map<number, number>();
  return (s?.boards ?? []).map((b) => {
    const i = seen.get(b.game) ?? 0;
    seen.set(b.game, i + 1);
    return breakerAt(s, b.game, i);
  });
}

/** Who breaks the next board (null = the toss isn't recorded). */
export const nextBreaker = (s: CarromState): Side | null =>
  s.ended ? null : breakerAt(s, s.games.length + 1, s.boardsInGame);

/** SD-117c — the slam a board finished in the first turn is: White when the
 *  board's winner broke it, Black when they didn't. null = breaker unknown. */
export const slamFor = (winner: Side, breaker: Side | null): Slam | null =>
  (breaker ? (winner === breaker ? 'white' : 'black') : null);

// ------------------------------------------- SD-117c · board editor --

/** Back to board 1 of game 1 keeping the format, the toss and the players
 *  credited so far — the clean slate an EDIT_LOG replays onto. */
const clearMatch = (s: CarromState): CarromState => {
  const { boardBy: _b, ...rest } = s;
  return { ...rest, current: { home: 0, away: 0 }, boardsInGame: 0, boards: [], games: [], gamesWon: { home: 0, away: 0 }, ended: false, seq: 0 };
};

const attrOf = (c?: CarromCredit): Attr => (c ? { ...(c.id ? { playerId: c.id } : {}), ...(c.name ? { playerName: c.name } : {}) } : undefined);

/** The BOARD action one corrected board replays as. */
export function boardAction(b: BoardInput): { type: string; side: Side; payload: Record<string, unknown>; attribution?: Attr; attribution2?: Attr } {
  return {
    type: 'BOARD', side: b.side,
    payload: b.penalty ? { coins: 0, queen: false, penalty: true }
      : { coins: b.coins, queen: b.queenBy ? b.queenBy === 'winner' : !!b.queen, ...(b.queenBy ? { queenBy: b.queenBy } : {}), ...(b.slam ? { slam: b.slam } : {}) },
    attribution: attrOf(b.by?.[0]), attribution2: attrOf(b.by?.[1]),
  };
}

/** Replay a corrected board list through this reducer: games, totals and the
 *  match result re-derive (a board limit or a game end can move). */
export function replayBoards(s: CarromState, boards: BoardInput[]): CarromState {
  return boards.reduce((st, b) => reducer(st, boardAction(b)), clearMatch(s));
}

/** The board list a state replays from (the editor's rows). */
export function boardInputs(s: CarromState): BoardInput[] {
  return (s?.boards ?? []).map((b, i) => ({
    side: b.winner, coins: b.coins, queen: b.queen,
    ...(b.queenBy ? { queenBy: b.queenBy } : {}), ...(b.slam ? { slam: b.slam } : {}),
    ...(b.penalty ? { penalty: true } : {}),
    ...(s.boardBy?.[i]?.length ? { by: s.boardBy[i] } : {}),
  }));
}

/** What a board list credits each player LIVE (the controls' attribution:
 *  capped `points`, `boards`, `queens`), keyed by player id. */
export function liveCredits(s: CarromState): Map<string, { name?: string; points: number; boards: number; queens: number }> {
  const capped = creditedPoints(s);
  const out = new Map<string, { name?: string; points: number; boards: number; queens: number }>();
  (s?.boards ?? []).forEach((b, i) => {
    for (const c of s.boardBy?.[i] ?? []) {
      if (!c.id) continue;
      const t = out.get(c.id) ?? { name: c.name, points: 0, boards: 0, queens: 0 };
      // SD-68 — a penalty board's points count, but it is not a board won
      t.points += capped[i]; if (!b.penalty) t.boards += 1; if (b.queen) t.queens += 1;
      out.set(c.id, t);
    }
  });
  return out;
}

/** Everything one board-editor correction dispatches: the EDIT_LOG with the
 *  corrected list, then STAT_ADJUST deltas so the live profile lines match
 *  what the corrected boards credit (capped points move with the game). */
export function boardCorrection(s: CarromState, edited: BoardInput[]): Array<{ type: string; payload?: Record<string, unknown>; attribution?: { playerId: string; stat: string; by: number; playerName?: string } }> {
  const next = replayBoards(s, edited);
  const before = liveCredits(s);
  const after = liveCredits(next);
  const out: Array<{ type: string; payload?: Record<string, unknown>; attribution?: { playerId: string; stat: string; by: number; playerName?: string } }> = [
    { type: 'EDIT_LOG', payload: { boards: edited } },
  ];
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const b = before.get(id); const a = after.get(id);
    for (const stat of ['points', 'boards', 'queens'] as const) {
      const d = (a?.[stat] ?? 0) - (b?.[stat] ?? 0);
      if (d) out.push({ type: 'STAT_ADJUST', attribution: { playerId: id, stat, by: d, playerName: a?.name ?? b?.name } });
    }
  }
  return out;
}

// --------------------------------------------- SD-68 · ICF score sheet --

/** One row of the ICF score sheet: a board as the referee writes it. */
export interface SheetRow {
  /** board number inside the game (1-based) */
  n: number;
  /** who broke it (null = the toss wasn't recorded) */
  breaker: Side | null;
  winner: Side;
  /** opponent's coins left (0 on a penalty board) */
  coins: number;
  /** the Queen: 'winner' (+3 counted, or covered past 21), 'loser', 'none', or undefined (not recorded) */
  queen?: QueenBy;
  /** did the Queen add points on this board (under 22)? */
  queenCounted: boolean;
  slam?: Slam;
  penalty?: true;
  /** what the board added to the winner's GAME score (capped at the target) */
  pts: number;
  /** the game's running total after the board */
  total: { home: number; away: number };
  /** a tie-break board (after the board limit) */
  tieBreak: boolean;
}

export interface SheetGame {
  game: number;
  rows: SheetRow[];
  /** the final score, when the game is over (else the running total) */
  score: [number, number];
  done: boolean;
  winner?: Side;
}

/** SD-68 (CR-03) — the ICF score sheet: per game, board # · breaker · winner ·
 *  coins · Queen · points · running total; penalty boards and slams marked.
 *  Pure — derived from the boards (and the toss, when recorded). */
export function scoreSheet(s: CarromState): SheetGame[] {
  const capped = creditedPoints(s);
  const breakers = boardBreakers(s);
  const out: SheetGame[] = [];
  (s?.boards ?? []).forEach((b, i) => {
    let g = out.find((x) => x.game === b.game);
    if (!g) { g = { game: b.game, rows: [], score: [0, 0], done: false }; out.push(g); }
    const prev = g.rows[g.rows.length - 1]?.total ?? { home: 0, away: 0 };
    const total = { ...prev, [b.winner]: prev[b.winner] + capped[i] };
    const queen: QueenBy | undefined = b.queenBy ?? (b.queen ? 'winner' : undefined);
    g.rows.push({
      n: g.rows.length + 1, breaker: breakers[i], winner: b.winner, coins: b.coins,
      ...(queen ? { queen } : {}), queenCounted: b.queen && b.points > b.coins,
      ...(b.slam ? { slam: b.slam } : {}), ...(b.penalty ? { penalty: true as const } : {}),
      pts: capped[i], total, tieBreak: g.rows.length >= s.maxBoards,
    });
    g.score = [total.home, total.away];
  });
  for (const g of out) {
    const final = s.games?.[g.game - 1];
    if (final) { g.score = [final[0], final[1]]; g.done = true; g.winner = final[0] > final[1] ? 'home' : 'away'; }
  }
  return out;
}
