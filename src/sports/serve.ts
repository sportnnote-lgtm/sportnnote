/**
 * Shared serve derivation for game/set racket sports (tennis, padel). Who serves
 * is derived from a first-server choice + the number of games played, so it stays
 * correct under undo/replay (nothing is stored mutably).
 *
 * The serving side alternates every game; games-played parity also gets the side
 * right across set boundaries and after tiebreaks (a tiebreak counts as one game).
 * In a set tiebreak the side rotates every two points after the first. For
 * doubles, each pair's two players alternate their service games (slot 0/1 in
 * roster order).
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

/** Who is serving right now: side + (doubles) which of the pair (slot 0/1).
 *  `inTiebreak` is passed in because each sport decides its own tiebreak rule. */
export function serveInfo(s: ServeState, inTiebreak: boolean): { side: Side; slot: 0 | 1 } {
  let side = gameServer(s);
  if (inTiebreak) {
    const p = s.pts.home + s.pts.away; // points played in the breaker so far
    if (Math.floor((p + 1) / 2) % 2 === 1) side = other(side); // passes after pts 1,3,5…
  }
  const G = gamesPlayed(s);
  const seed = gameServer(s) === s.firstServer ? G / 2 : (G - 1) / 2;
  const slot = (Math.floor(Math.max(0, seed)) % 2) as 0 | 1;
  return { side, slot };
}
