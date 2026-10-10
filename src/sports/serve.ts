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
 */
export type Side = 'home' | 'away';

export interface ServeState {
  sets: Array<[number, number]>;
  games: { home: number; away: number };
  pts: { home: number; away: number };
  /** which side served game 1 */
  firstServer: Side;
}

const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');

/** Completed games in the match so far — the current game's 0-based index. */
export const gamesPlayed = (s: ServeState) => s.sets.reduce((n, g) => n + g[0] + g[1], 0) + s.games.home + s.games.away;

/** Which side serves the current game, before in-tiebreak point rotation. */
const gameServer = (s: ServeState): Side => (gamesPlayed(s) % 2 === 0 ? s.firstServer : other(s.firstServer));

/** Doubles slot of whoever serves game index `g`: each side serves every other
 *  game, and alternates its two players across its own service games. */
const slotForGame = (g: number) => (Math.floor(g / 2) % 2) as 0 | 1;

/** Who is serving right now: side + (doubles) which of the pair (slot 0/1).
 *  `inTiebreak` is passed in because each sport decides its own tiebreak rule. */
export function serveInfo(s: ServeState, inTiebreak: boolean): { side: Side; slot: 0 | 1 } {
  const G = gamesPlayed(s);
  if (!inTiebreak) return { side: gameServer(s), slot: slotForGame(G) };
  // Tiebreak: service turns are pt 1, then pairs of points (2-3, 4-5, …).
  const p = s.pts.home + s.pts.away; // points played in the breaker so far
  const turn = Math.floor((p + 1) / 2);
  const opener = turn % 2 === 0; // the side due to serve this "game" has this turn
  const side = opener ? gameServer(s) : other(gameServer(s));
  // Each pair starts with the player due to serve its next game (opener: game G,
  // receivers: game G+1), then the partner takes the pair's next turn, and so on.
  const k = opener ? turn / 2 : (turn - 1) / 2; // this pair's 0-based turn number
  const slot = ((slotForGame(opener ? G : G + 1) + k) % 2) as 0 | 1;
  return { side, slot };
}
