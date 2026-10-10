/**
 * Final-score helpers shared by every set/game sport (SD-01): tennis, padel,
 * badminton, table tennis, squash, pickleball, carrom.
 *
 * Once a match ends, the "current game" points are reset to 0-0, so a summary
 * built from them read "0–0" on the result alert, ticker, MiniScore and the
 * correction screen. These helpers turn the completed sets/games already in the
 * state into the line every published result uses — sets/games won as the big
 * score plus the per-set line ("21-18, 19-21, 21-15"; tennis "6-4, 3-6, 7-6(4)";
 * a match tiebreak "[10-8]"). Pure projections: nothing here changes the state,
 * so event logs replay to exactly the same scores.
 */
import type { ScoreSummary } from './types';

export type Pair = [number, number];
export type Side = 'home' | 'away';

export interface SetScoreOpts {
  /** the set ended in a tiebreak: its points [home, away] → "7-6(4)" */
  tb?: Pair | null;
  /** the whole set was a match (champions') tiebreak → "[10-8]" */
  matchTb?: boolean;
  /** read the score from the away side's point of view (history rows) */
  flip?: boolean;
}

/** One set/game: "6-4", "7-6(4)" (loser's tiebreak points), "[10-8]". */
export function setScore(g: Pair, opts: SetScoreOpts = {}): string {
  const [a, b] = opts.flip ? [g[1], g[0]] : [g[0], g[1]];
  if (opts.matchTb) {
    const t = opts.tb ?? g;
    const [x, y] = opts.flip ? [t[1], t[0]] : [t[0], t[1]];
    return `[${x}-${y}]`;
  }
  const base = `${a}-${b}`;
  if (!opts.tb) return base;
  return `${base}(${Math.min(opts.tb[0], opts.tb[1])})`;
}

/** The whole line, comma-separated: "6-4, 3-6, 7-6(4)". '' when nothing is complete. */
export function scoreLine(
  sets: ReadonlyArray<Pair> | undefined,
  opts: { tb?: ReadonlyArray<Pair | null | undefined>; matchTb?: ReadonlyArray<boolean>; perspective?: Side } = {},
): string {
  if (!Array.isArray(sets) || !sets.length) return '';
  const flip = opts.perspective === 'away';
  return sets.map((g, i) => setScore(g, { tb: opts.tb?.[i] ?? null, matchTb: !!opts.matchTb?.[i], flip })).join(', ');
}

/** The summary a finished set/game match shows everywhere: the sets/games won as
 *  the big score and the per-set line as the detail. */
export function finalSummary(won: { home: number; away: number }, line: string): ScoreSummary {
  return {
    homeScore: String(won.home),
    awayScore: String(won.away),
    statusLine: 'Match Over',
    ...(line ? { detailLine: line } : {}),
  };
}

/** "2–1 · 21-18, 19-21, 21-15" — the one-line result (full-time alert, share). */
export function resultText(won: { home: number; away: number }, line: string): string {
  return `${won.home}–${won.away}${line ? ` · ${line}` : ''}`;
}
