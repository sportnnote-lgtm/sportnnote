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

/** SD-117c — where the server is in their turn: the n-th serve of `of` (2 each
 *  — 5 in a 21-point game), or `deuce` from 10-10 (20-20) when service
 *  alternates every point. Derived from the score. */
export function ttServeTurn(home: number, away: number, target = 11): { n: number; of: number; deuce: boolean } {
  const deuce = Math.max(1, (Number(target) || 11) - 1);
  if (home >= deuce && away >= deuce) return { n: 1, of: 1, deuce: true };
  const each = ttServesEach(target);
  return { n: ((home + away) % each) + 1, of: each, deuce: false };
}

const ORD = ['1st', '2nd', '3rd', '4th', '5th'];

/** "2nd serve of 2 · service changes after this point" / "Deuce: service
 *  alternates every point". */
export function ttServeHint(home: number, away: number, target = 11): string {
  const t = ttServeTurn(home, away, target);
  const deuce = Math.max(1, (Number(target) || 11) - 1);
  if (t.deuce) return home === deuce && away === deuce ? `Deuce at ${deuce}-${deuce}: service now alternates every point` : 'Deuce: service alternates every point';
  return `${ORD[t.n - 1] ?? `${t.n}th`} serve of ${t.of}${t.n === t.of ? ' · service changes after this point' : ''}`;
}
