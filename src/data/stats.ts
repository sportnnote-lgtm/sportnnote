/**
 * Stat rollups. Given a player's StatLines (one per match they featured in),
 * aggregate them into the totals a profile shows: matches, wins, per-sport
 * breakdowns and summed counters. Pure functions — easy to unit test and reuse
 * on client or server.
 */
import type { LineResult, SportId, StatLine } from '../core/types';
import { labelShort, statSchema } from '../sports/statSchemas.ts';

export interface Record5 {
  /** appearances: every line is one match the player took part in */
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  ties: number;
  noResults: number;
  /** starts (sum of the `starts` key) and how many lines recorded it — Starts is
   *  only shown where a lineup was known (SD-11) */
  starts: number;
  startsKnown: number;
}

export interface SportBreakdown extends Record5 {
  sport: SportId;
  totals: Record<string, number>;
}

export interface PlayerStats extends Record5 {
  /** wins over matches with a result (W + D + L + T), 0..1 */
  winRate: number;
  sports: SportId[];
  /** every counter summed across all sports, e.g. {goals: 3, points: 56} */
  totals: Record<string, number>;
  bySport: SportBreakdown[];
  /** most recent first */
  recent: StatLine[];
}

/** Line keys that describe the appearance, not a performance — summed into
 *  their own figures, never listed with the counting stats. */
export const APPEARANCE_KEYS = new Set(['starts', 'apps']);

function addInto(target: Record<string, number>, src: Record<string, number>) {
  for (const [k, v] of Object.entries(src)) if (!APPEARANCE_KEYS.has(k)) target[k] = (target[k] ?? 0) + v;
}

/** A line's result for the record: the stored / derived `result` (set by
 *  `lineResult` before aggregating), else the legacy `won` flag. A golf round
 *  without a win counts as played only. */
function effectiveResult(l: StatLine): LineResult | undefined {
  if (l.pending) return undefined;
  return l.result ?? (l.won ? 'W' : l.eventId ? undefined : 'L');
}

const blank = (): Record5 => ({ matches: 0, wins: 0, draws: 0, losses: 0, ties: 0, noResults: 0, starts: 0, startsKnown: 0 });

function count(r: Record5, l: StatLine) {
  r.matches += 1;
  const res = effectiveResult(l);
  if (res === 'W') r.wins += 1;
  else if (res === 'D') r.draws += 1;
  else if (res === 'L') r.losses += 1;
  else if (res === 'T') r.ties += 1;
  else if (res === 'NR') r.noResults += 1;
  if (typeof l.stats?.starts === 'number') { r.startsKnown += 1; r.starts += l.stats.starts; }
}

/** "3W 1D 1L" (+ " 1T" / " 1NR" only when there are any) — the record line. */
export const recordText = (r: Record5): string =>
  [`${r.wins}W`, `${r.draws}D`, `${r.losses}L`, r.ties ? `${r.ties}T` : '', r.noResults ? `${r.noResults}NR` : ''].filter(Boolean).join(' ');

/** Win % over matches with a result (W + D + L + T): no-results — and lines
 *  with no result at all (a golf round that wasn't won) — don't count. */
export const winRateOf = (r: Record5): number => {
  const decided = r.wins + r.draws + r.losses + r.ties;
  return decided > 0 ? r.wins / decided : 0;
};

export function aggregate(lines: StatLine[]): PlayerStats {
  const totals: Record<string, number> = {};
  const bySportMap = new Map<SportId, SportBreakdown>();
  const all = blank();

  for (const l of lines) {
    addInto(totals, l.stats);
    count(all, l);
    let b = bySportMap.get(l.sport);
    if (!b) {
      b = { sport: l.sport, ...blank(), totals: {} };
      bySportMap.set(l.sport, b);
    }
    count(b, l);
    addInto(b.totals, l.stats);
  }

  const recent = [...lines].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));

  return {
    ...all,
    winRate: winRateOf(all),
    sports: [...bySportMap.keys()],
    totals,
    bySport: [...bySportMap.values()].sort((a, b) => b.matches - a.matches),
    recent,
  };
}

/**
 * How many of a player's games (in one sport) actually *tracked* a given stat.
 * A stat line's `tracked` list says which stats its match was capturing; lines
 * without it (legacy / core stats) count as tracked. So a total like "shots on
 * target" can correctly read "over 32 of 50 games" when some scorers didn't track it.
 */
export function statCoverage(lines: StatLine[], sport: SportId, statKey: string): { tracked: number; total: number } {
  const sportLines = lines.filter((l) => l.sport === sport);
  const tracked = sportLines.filter((l) => (l.tracked ? l.tracked.includes(statKey) : true)).length;
  return { tracked, total: sportLines.length };
}

/** Readable short label for a stat key, e.g. "raidPoints" → "raid pts". Pass the
 *  count to get the singular for exactly one ("1 goal" vs "2 goals"). Read from
 *  the stat schema (SD-15); falls back to the raw key so an undeclared stat
 *  still renders (just un-prettified). */
export const statLabelShort = (key: string, count?: number, sport?: SportId): string => labelShort(key, count, sport);

/** A compact "8 goals · 2 assists · 9 shots on target" line for one sport. */
export function sportSummary(b: SportBreakdown): string {
  if (b.sport === 'golf') {
    // Golf reads in rounds + scoring average, not summed counters.
    const t = b.totals;
    // 18-hole-equivalent scoring average over complete rounds (see golf engine).
    const avg = t.completeRounds ? t.completeStrokes / t.completeRounds : null;
    return [
      t.rounds ? `${t.rounds} ${t.rounds === 1 ? 'round' : 'rounds'}` : '',
      avg != null ? `avg ${avg.toFixed(1)}` : '',
      t.birdies ? `${t.birdies} ${statLabelShort('birdies', t.birdies)}` : '',
    ].filter(Boolean).join(' · ');
  }
  // which stats lead the summary: the schema's headline order
  const order = statSchema(b.sport)?.headline ?? Object.keys(b.totals);
  const keys = order.filter((k) => (b.totals[k] ?? 0) > 0).slice(0, 3);
  return keys.map((k) => `${b.totals[k]} ${statLabelShort(k, b.totals[k], b.sport)}`).join(' · ');
}

/** Whether any of a player's stats in a sport were tracked in fewer games than played. */
export function hasPartialCoverage(lines: StatLine[], b: SportBreakdown): boolean {
  return Object.keys(b.totals).some((k) => {
    const c = statCoverage(lines, b.sport, k);
    return c.tracked < c.total;
  });
}

/** A short headline stat for list rows, e.g. "12 goals" or "18.0 ppg". */
export function headline(stats: PlayerStats): string {
  const t = stats.totals;
  if (t.goals) return `${t.goals} ${statLabelShort('goals', t.goals)}`;
  if (t.points && stats.bySport.some((s) => s.sport === 'basketball'))
    return `${(t.points / Math.max(1, stats.matches)).toFixed(1)} ppg`;
  if (t.raidPoints) return `${t.raidPoints} raid pts`;
  if (t.golds) return `${t.golds}🥇`;
  if (t.points) return `${t.points} pts`;
  return `${stats.matches} ${stats.matches === 1 ? 'match' : 'matches'}`;
}
