/**
 * Table-tennis service order (ITTF): in an 11-point game each player serves 2
 * points in turn; from 10-10 (deuce) service alternates every point. The legacy
 * 21-point game (pre-2001 ITTF rules) gives 5 serves each and alternates from
 * 20-20. In general: deuce = (target − 1)-all; 5 serves each in a game to 21 or
 * more, else 2. The player who served first in a game receives first in the next,
 * so the game's opening server alternates.
 * Pure + derived from the score, so undo/replay stay correct.
 *
 * SD-104: before this, the switch was hard-coded at 10-10 with 2 serves each
 * whatever the target. Serve is derived (display + SD-22 serve figures), never
 * part of the score, so the fix is not gated: an old 21-point match shows the
 * right server and re-derives correct serve figures on its next totals sync.
 * 11-point games (the default, and every pinned log) are unchanged.
 */
export type Side = 'home' | 'away';
const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');

/** Serves each player takes in turn before deuce, for a game to `target`. */
export const ttServesEach = (target = 11): number => (target >= 21 ? 5 : 2);

/** Who serves the NEXT point, given the current game score and how many games
 *  are complete. `opening` = who served first in game 1; `target` = points to
 *  win a game (default 11). */
export function ttServer(home: number, away: number, gamesPlayed: number, opening: Side = 'home', target = 11): Side {
  const first = gamesPlayed % 2 === 0 ? opening : other(opening);
  const total = home + away;
  const deuce = Math.max(1, (Number(target) || 11) - 1);
  if (home >= deuce && away >= deuce) return total % 2 === 0 ? first : other(first);
  return Math.floor(total / ttServesEach(target)) % 2 === 0 ? first : other(first);
}
