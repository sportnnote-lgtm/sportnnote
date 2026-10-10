/**
 * Shared serve derivation for game/set racket sports (tennis, padel). Who serves
 * is derived from a first-server choice + the number of games played, so it stays
 * correct under undo/replay (nothing is stored mutably).
 *
 * The serving side alternates every game; games-played parity also gets the side
 * right across set boundaries and after tiebreaks (a tiebreak counts as one game),
 * so the side that received first in a tiebreak serves the next set's first game
 * (ITF Rule 5(b) / FIP). In a tiebreak (set or match tiebreak) the side rotates
 * every two points after the first. For doubles, each pair's two players alternate
 * their service games (slot 0/1 in roster order); inside a tiebreak they alternate
 * service TURNS too (ITF Rule 5(b), FIP): A1 serves pt 1, B1 pts 2-3, A2 pts 4-5,
 * B2 pts 6-7, A1 pts 8-9… where A1/B1 are each pair's player due to serve.
 * The slot is ignored for singles.
 *
 * SD-104 — doubles serving order: at the start of every set each pair chooses
 * which of its players serves its first service game (ITF Rule 5/6, FIP). The
 * pick is stored per set (`serveOrder[setIndex][side]` = roster slot 0/1, from a
 * SET_SERVE_ORDER action). With a pick the pair's server alternates from it
 * inside the set; without one (every older match) the slot stays the match-wide
 * roster-order rotation, so old logs derive the same servers.
 */
export type Side = 'home' | 'away';

export interface ServeState {
  sets: Array<[number, number]>;
  games: { home: number; away: number };
  pts: { home: number; away: number };
  /** which side served game 1 */
  firstServer: Side;
  /** SD-104 — doubles: per set index, the roster slot (0/1) each pair chose to
   *  serve its first service game of that set. Absent → roster order. */
  serveOrder?: ServeOrder;
}

/** SD-104 — per set (index = completed sets before it), each pair's first server slot. */
export type ServeOrder = Array<{ home?: 0 | 1; away?: 0 | 1 } | null | undefined>;

const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');

/** Completed games in the match so far — the current game's 0-based index. */
export const gamesPlayed = (s: ServeState) => s.sets.reduce((n, g) => n + g[0] + g[1], 0) + s.games.home + s.games.away;

/** Which side serves the current game, before in-tiebreak point rotation. */
const gameServer = (s: ServeState): Side => (gamesPlayed(s) % 2 === 0 ? s.firstServer : other(s.firstServer));

/** Doubles slot of whoever serves game index `g`: each side serves every other
 *  game, and alternates its two players across its own service games. */
const slotForGame = (g: number) => (Math.floor(g / 2) % 2) as 0 | 1;

/** Games played before the current set started. */
const gamesBeforeSet = (s: ServeState) => s.sets.reduce((n, g) => n + g[0] + g[1], 0);

/** Doubles slot of `side`'s server for game index `g` (a game `side` serves, or
 *  — in a tiebreak — the game it would serve next). Uses the set's serving-order
 *  pick when there is one, else the roster-order rotation. */
function slotFor(s: ServeState, g: number, side: Side): 0 | 1 {
  const pick = s.serveOrder?.[s.sets.length]?.[side];
  if (pick !== 0 && pick !== 1) return slotForGame(g);
  const local = g - gamesBeforeSet(s); // 0-based game index inside this set
  return ((pick + Math.floor(local / 2)) % 2) as 0 | 1;
}

/** SD-104 — the slot of `side`'s first server in the current set: the pick if
 *  made, else who roster order puts there (what the picker shows as chosen). */
export function setFirstSlot(s: ServeState, side: Side): 0 | 1 {
  const g0 = gamesBeforeSet(s);
  const opener = g0 % 2 === 0 ? s.firstServer : other(s.firstServer);
  return slotFor(s, side === opener ? g0 : g0 + 1, side);
}

/** SD-104 — may the doubles serving order still be chosen for this set? Only
 *  before its first point. */
export const serveOrderOpen = (s: ServeState & { ended?: boolean; doubles?: boolean }) =>
  !!s.doubles && !s.ended && s.games.home === 0 && s.games.away === 0 && s.pts.home === 0 && s.pts.away === 0;

/** SD-104 — apply a SET_SERVE_ORDER payload ({ side, slot }) to a set-sport
 *  state: pre-first-point of the set, doubles only; else unchanged. */
export function withServeOrder<T extends ServeState & { ended?: boolean; doubles?: boolean }>(s: T, payload: Record<string, unknown> | undefined): T {
  const side = payload?.side;
  const slot = payload?.slot;
  if (!serveOrderOpen(s) || (side !== 'home' && side !== 'away') || (slot !== 0 && slot !== 1)) return s;
  const order: ServeOrder = [...(s.serveOrder ?? [])];
  const i = s.sets.length;
  order[i] = { ...(order[i] ?? {}), [side]: slot };
  return { ...s, serveOrder: order };
}

/** Who is serving right now: side + (doubles) which of the pair (slot 0/1).
 *  `inTiebreak` is passed in because each sport decides its own tiebreak rule. */
export function serveInfo(s: ServeState, inTiebreak: boolean): { side: Side; slot: 0 | 1 } {
  const G = gamesPlayed(s);
  if (!inTiebreak) return { side: gameServer(s), slot: slotFor(s, G, gameServer(s)) };
  // Tiebreak: service turns are pt 1, then pairs of points (2-3, 4-5, …).
  const p = s.pts.home + s.pts.away; // points played in the breaker so far
  const turn = Math.floor((p + 1) / 2);
  const opener = turn % 2 === 0; // the side due to serve this "game" has this turn
  const side = opener ? gameServer(s) : other(gameServer(s));
  // Each pair starts with the player due to serve its next game (opener: game G,
  // receivers: game G+1), then the partner takes the pair's next turn, and so on.
  const k = opener ? turn / 2 : (turn - 1) / 2; // this pair's 0-based turn number
  const slot = ((slotFor(s, opener ? G : G + 1, side) + k) % 2) as 0 | 1;
  return { side, slot };
}
