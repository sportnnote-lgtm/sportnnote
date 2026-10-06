/**
 * Table-tennis service order (ITTF): each player serves 2 points in turn; from
 * 10-10 (deuce) service alternates every point. The player who served first in a
 * game receives first in the next, so the game's opening server alternates.
 * Pure + derived from the score, so undo/replay stay correct.
 */
export type Side = 'home' | 'away';
const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');

/** Who serves the NEXT point, given the current game score and how many games
 *  are complete. `opening` = who served first in game 1. */
export function ttServer(home: number, away: number, gamesPlayed: number, opening: Side = 'home'): Side {
  const first = gamesPlayed % 2 === 0 ? opening : other(opening);
  const total = home + away;
  if (home >= 10 && away >= 10) return total % 2 === 0 ? first : other(first);
  return Math.floor(total / 2) % 2 === 0 ? first : other(first);
}
