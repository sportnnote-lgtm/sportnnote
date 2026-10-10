/**
 * Cricket career figures (parity #19) — PURE, computed on read from a player's
 * cricket stat lines (one line per match, written absolute at completion by the
 * stat sync). Three sections for the sport profile: batting, bowling, fielding.
 *
 * Lines from before #19 carry only `runs` / `wickets` (live increments). They
 * count in the totals, but the rates (Avg, SR, Econ, Best) use only lines that
 * carry the inputs they need — so an old line never fakes a 400 strike rate.
 * A rate whose denominator is 0 reads "–". No React Native imports.
 */
import type { StatLine } from '../core/types';
import { careerFromSchema, aggregateStat, statDefIn, rateText, oversText, type CareerStat } from '../sports/statSchema.ts';
import { cricketStats, batted } from '../sports/cricket/stats.ts';

export type { CareerStat };
export interface CricketCareer { batting: CareerStat[]; bowling: CareerStat[]; fielding: CareerStat[] }

const n = (l: StatLine, k: string) => Number(l.stats?.[k] ?? 0) || 0;
const has = (l: StatLine, k: string) => l.stats != null && Object.prototype.hasOwnProperty.call(l.stats, k);
/** x / y to `dp` places, or "–" when y is 0. */
export const rate = rateText;
/** Balls → "o.b" overs (6-ball overs). */
export const careerOvers = oversText;

/** One derived figure from the schema over the given lines. */
const figure = (lines: StatLine[], key: string): string => aggregateStat(cricketStats, statDefIn(cricketStats, key)!, lines)!;

/** Best bowling, e.g. "3/12": most wickets, then fewest runs. "–" when none. */
export const bestBowling = (lines: StatLine[]): string => figure(lines, 'best');

/** Highest score, e.g. "54*" (a not-out wins a tie). "–" when they never batted. */
export const highestScore = (lines: StatLine[]): string => figure(lines, 'highest');

/** Batting / bowling / fielding, rendered from cricket's stat schema (SD-15:
 *  the sections, their rows, labels and aggregations all live in
 *  src/sports/cricket/stats.ts). */
export function cricketCareer(all: StatLine[]): CricketCareer {
  const c = careerFromSchema(cricketStats, all.filter((l) => l.sport === 'cricket'));
  return { batting: c.batting, bowling: c.bowling, fielding: c.fielding };
}

/** One match's figures for the profile's history row, e.g.
 *  "54* (40) · 2/18 (4.0 ov) · 1 ct" — instead of listing every stat key. */
export function cricketMatchLine(stats: Record<string, number>): string {
  const l = { stats } as StatLine;
  const parts: string[] = [];
  if (batted(l)) {
    const no = n(l, 'notOut') > 0 ? '*' : '';
    parts.push(has(l, 'ballsFaced') ? `${n(l, 'runs')}${no} (${n(l, 'ballsFaced')})` : `${n(l, 'runs')}${no} runs`);
  }
  if (has(l, 'ballsBowled')) parts.push(`${n(l, 'wickets')}/${n(l, 'runsConceded')} (${careerOvers(n(l, 'ballsBowled'))} ov)`);
  else if (n(l, 'wickets') > 0) parts.push(`${n(l, 'wickets')} wkt${n(l, 'wickets') === 1 ? '' : 's'}`);
  for (const [k, tag] of [['catches', 'ct'], ['stumpings', 'st'], ['runouts', 'ro']] as const) if (n(l, k) > 0) parts.push(`${n(l, k)} ${tag}`);
  return parts.join(' · ');
}
