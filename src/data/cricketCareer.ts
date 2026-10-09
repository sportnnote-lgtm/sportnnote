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

export interface CareerStat { key: string; label: string; value: string }
export interface CricketCareer { batting: CareerStat[]; bowling: CareerStat[]; fielding: CareerStat[] }

const DASH = '–';
const n = (l: StatLine, k: string) => Number(l.stats?.[k] ?? 0) || 0;
const has = (l: StatLine, k: string) => l.stats != null && Object.prototype.hasOwnProperty.call(l.stats, k);
const sum = (ls: StatLine[], k: string) => ls.reduce((a, l) => a + n(l, k), 0);
/** x / y to `dp` places, or "–" when y is 0. */
export const rate = (x: number, y: number, dp = 2): string => (y > 0 ? (x / y).toFixed(dp) : DASH);
/** Balls → "o.b" overs (6-ball overs). */
export const careerOvers = (balls: number): string => `${Math.floor(balls / 6)}.${balls % 6}`;

/** Did the player bat in this match? (#19 lines say so; an older line with a
 *  `runs` key was credited at least one ball faced.) */
const batted = (l: StatLine) => (has(l, 'innings') ? n(l, 'innings') > 0 : has(l, 'runs'));

/** Best bowling, e.g. "3/12": most wickets, then fewest runs. "–" when none. */
export function bestBowling(lines: StatLine[]): string {
  let best: { w: number; r: number } | null = null;
  for (const l of lines) {
    if (!has(l, 'runsConceded')) continue;
    const w = n(l, 'wickets'), r = n(l, 'runsConceded');
    if (!best || w > best.w || (w === best.w && r < best.r)) best = { w, r };
  }
  return best ? `${best.w}/${best.r}` : DASH;
}

/** Highest score, e.g. "54*" (a not-out wins a tie). "–" when they never batted. */
export function highestScore(lines: StatLine[]): string {
  let best: { r: number; no: boolean } | null = null;
  for (const l of lines) {
    if (!batted(l)) continue;
    const r = n(l, 'runs'), no = has(l, 'notOut') && n(l, 'notOut') > 0;
    if (!best || r > best.r || (r === best.r && no && !best.no)) best = { r, no };
  }
  return best ? `${best.r}${best.no ? '*' : ''}` : DASH;
}

export function cricketCareer(all: StatLine[]): CricketCareer {
  const lines = all.filter((l) => l.sport === 'cricket');
  // ── batting
  const batLines = lines.filter(batted);
  const full = batLines.filter((l) => has(l, 'innings')); // #19 lines: innings / notOut / ballsFaced known
  const runs = sum(lines, 'runs');
  const innings = sum(full, 'innings') + (batLines.length - full.length);
  const notOut = sum(full, 'notOut');
  const fullRuns = sum(full, 'runs');
  const outs = sum(full, 'innings') - notOut;
  const faced = sum(full, 'ballsFaced');
  const scored = (lo: number, hi: number) => batLines.filter((l) => n(l, 'runs') >= lo && n(l, 'runs') < hi).length;
  const batting: CareerStat[] = [
    { key: 'runs', label: 'Runs', value: String(runs) },
    { key: 'innings', label: 'Innings', value: String(innings) },
    { key: 'notOut', label: 'Not out', value: String(notOut) },
    { key: 'highest', label: 'Highest', value: highestScore(lines) },
    { key: 'avg', label: 'Avg', value: rate(fullRuns, outs) },
    { key: 'sr', label: 'SR', value: rate(fullRuns * 100, faced) },
    { key: 'fours', label: '4s', value: String(sum(lines, 'fours')) },
    { key: 'sixes', label: '6s', value: String(sum(lines, 'sixes')) },
    { key: 'fifties', label: '50s', value: String(scored(50, 100)) },
    { key: 'hundreds', label: '100s', value: String(scored(100, Infinity)) },
  ];
  // ── bowling (rates from lines that know balls & runs conceded)
  const bowlLines = lines.filter((l) => has(l, 'ballsBowled'));
  const balls = sum(bowlLines, 'ballsBowled');
  const conceded = sum(bowlLines, 'runsConceded');
  const rateWkts = sum(bowlLines, 'wickets');
  const bowling: CareerStat[] = [
    { key: 'overs', label: 'Overs', value: careerOvers(balls) },
    { key: 'wickets', label: 'Wickets', value: String(sum(lines, 'wickets')) },
    { key: 'runsConceded', label: 'Runs', value: String(conceded) },
    { key: 'maidens', label: 'Maidens', value: String(sum(lines, 'maidens')) },
    { key: 'dots', label: 'Dots', value: String(sum(lines, 'dots')) },
    { key: 'econ', label: 'Econ', value: rate(conceded * 6, balls) },
    { key: 'bowlAvg', label: 'Avg', value: rate(conceded, rateWkts) },
    { key: 'bowlSr', label: 'SR', value: rate(balls, rateWkts, 1) },
    { key: 'best', label: 'Best', value: bestBowling(lines) },
  ];
  const fielding: CareerStat[] = [
    { key: 'catches', label: 'Catches', value: String(sum(lines, 'catches')) },
    { key: 'stumpings', label: 'Stumpings', value: String(sum(lines, 'stumpings')) },
    { key: 'runouts', label: 'Run outs', value: String(sum(lines, 'runouts')) },
    // parity #20 — fielding notes
    { key: 'dropped', label: 'Drops', value: String(sum(lines, 'dropped')) },
    { key: 'runsSaved', label: 'Runs saved', value: String(sum(lines, 'runsSaved')) },
    { key: 'runsMissed', label: 'Runs missed', value: String(sum(lines, 'runsMissed')) },
  ];
  return { batting, bowling, fielding };
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
