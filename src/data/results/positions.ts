/**
 * Shared ranking primitives for every field competition (golf leaderboards and
 * the timed / measured results engine). Dependency-free so the golf engine and
 * the results engine can both import it.
 */

/** Positions for an already-sorted list: a row tied with the row above shares
 *  its position (1, 2, 2, 4). `tie` = tied with a neighbour (shown "T2" / "=2"). */
export function sharedPositions<T>(sorted: T[], tied: (a: T, b: T) => boolean): { position: number; tie: boolean }[] {
  return sorted.map((x, i) => {
    let j = i;
    while (j > 0 && tied(sorted[j - 1], x)) j--;
    const tie = (i > 0 && tied(sorted[i - 1], x)) || (i < sorted.length - 1 && tied(sorted[i + 1], x));
    return { position: j + 1, tie };
  });
}

/** Top N **and ties**: everyone inside the first N plus anyone level with the
 *  N-th row (`same` decides "level"). Used by the golf cut and the results
 *  engine's "top 8 to the final three attempts". */
export function topNAndTies<T>(sorted: T[], n: number, same: (a: T, b: T) => boolean): T[] {
  if (sorted.length <= n) return [...sorted];
  if (n <= 0) return [];
  const line = sorted[n - 1];
  return sorted.filter((r, i) => i < n || same(r, line));
}

/** Compare two key vectors where a BIGGER value is better at every index.
 *  `undefined` at an index means "not comparable" — that key is skipped (used
 *  for deciders that only count when both rows have them, e.g. a jump-off). */
export function compareKeys(a: (number | undefined)[], b: (number | undefined)[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i], y = b[i];
    if (x === undefined || y === undefined) continue;
    if (x !== y) return x > y ? -1 : 1; // descending: bigger first (safe with ±Infinity)
  }
  return 0;
}
