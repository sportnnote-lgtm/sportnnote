/**
 * SD-15 — the stat-schema registry: every sport's schema, plus the lookups the
 * data layer and screens use for labels, leaders, awards and MVP weights.
 * PURE (no React Native) — kept apart from registry.ts (which pulls in the
 * plugins' UI) so the node test runner and the data layer can import it.
 */
import type { SportId } from '../core/types';
import { compactOf, compactOneOf, oneOf, shortOf, type AwardDef, type SportStatSchema, type StatDef } from './statSchema.ts';
import { SHARED_STATS } from './sharedStats.ts';
import { footballStats } from './football/stats.ts';
import { cricketStats } from './cricket/stats.ts';
import { basketballStats } from './basketball/stats.ts';
import { badmintonStats } from './badminton/stats.ts';
import { tennisStats } from './tennis/stats.ts';
import { volleyballStats } from './volleyball/stats.ts';
import { kabaddiStats } from './kabaddi/stats.ts';
import { pickleballStats } from './pickleball/stats.ts';
import { padelStats } from './padel/stats.ts';
import { squashStats } from './squash/stats.ts';
import { tableTennisStats } from './tabletennis/stats.ts';
import { chessStats } from './chess/stats.ts';
import { carromStats } from './carrom/stats.ts';
import { golfStats } from './golf/stats.ts';
import { athleticsStats } from './athletics/stats.ts';
import { hockeyStats } from './hockey/stats.ts';
import { swimmingStats } from './swimming/stats.ts';
import { weightliftingStats } from './weightlifting/stats.ts';
import { shootingStats } from './shooting/stats.ts';
import { archeryStats } from './archery/stats.ts';
import { rowingStats } from './rowing/stats.ts';
import { canoeStats } from './canoe/stats.ts';
import { handballStats } from './handball/stats.ts';

export const STAT_SCHEMAS: { [S in SportId]: SportStatSchema<S> } = {
  football: footballStats,
  cricket: cricketStats,
  basketball: basketballStats,
  badminton: badmintonStats,
  tennis: tennisStats,
  volleyball: volleyballStats,
  kabaddi: kabaddiStats,
  pickleball: pickleballStats,
  padel: padelStats,
  squash: squashStats,
  tabletennis: tableTennisStats,
  chess: chessStats,
  carrom: carromStats,
  golf: golfStats,
  athletics: athleticsStats,
  hockey: hockeyStats,
  swimming: swimmingStats,
  weightlifting: weightliftingStats,
  shooting: shootingStats,
  archery: archeryStats,
  rowing: rowingStats,
  canoe: canoeStats,
  handball: handballStats,
};

export const STAT_SPORTS = Object.keys(STAT_SCHEMAS) as SportId[];

export const statSchema = (sport: SportId): SportStatSchema<SportId> | undefined => STAT_SCHEMAS[sport] as SportStatSchema<SportId> | undefined;

/** Key → its definition across all sports (a key means the same in every sport
 *  that writes it — tests hold the labels equal), then the shared keys. */
const GLOBAL = new Map<string, StatDef>();
for (const sp of STAT_SPORTS) for (const d of STAT_SCHEMAS[sp].stats) if (!GLOBAL.has(d.key)) GLOBAL.set(d.key, d);
for (const d of SHARED_STATS) if (!GLOBAL.has(d.key)) GLOBAL.set(d.key, d);

/** A stat's definition: the sport's own when given, else any sport's / shared. */
export function statDef(key: string, sport?: SportId): StatDef | undefined {
  return (sport && statSchema(sport)?.stats.find((s) => s.key === key)) || GLOBAL.get(key);
}

/** Long label ("Shots on target"); the raw key for an undeclared stat. */
export const labelLong = (key: string, sport?: SportId): string => statDef(key, sport)?.label ?? key;

/** Short label, count-aware ("1 goal" / "2 goals"; "pts" either way). */
export function labelShort(key: string, count?: number, sport?: SportId): string {
  const d = statDef(key, sport);
  if (!d) return key;
  return count === 1 ? oneOf(d) : shortOf(d);
}

/** Compact label for the per-match rating line ("on target", "att. plays"). */
export function labelCompact(key: string, count?: number, sport?: SportId): string {
  const d = statDef(key, sport);
  if (!d) return key;
  return count === 1 ? compactOneOf(d) : compactOf(d);
}

/** Every key listed on the per-match rating line → its compact plural label. */
export function matchSummaryLabels(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, d] of GLOBAL) if (d.matchSummary) out[k] = compactOf(d);
  return out;
}

/** MVP weights in schema order: { key: weight } (only weighted stats). */
export function mvpWeights(sport: SportId): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of statSchema(sport)?.stats ?? []) if (d.weight !== undefined && d.weight !== 0) out[d.key] = d.weight;
  return out;
}

/** Leaderboard categories in order ({ key, label }). */
export const leaderCategories = (sport: SportId): { key: string; label: string }[] =>
  (statSchema(sport)?.leaders ?? []).map((key) => ({ key, label: statDef(key, sport)?.leaderLabel ?? labelLong(key, sport) }));

/** Award definitions for the per-match summary / the tournament slots. */
export const matchAwards = (sport: SportId): AwardDef[] => (statSchema(sport)?.awards ?? []).filter((a) => a.match !== false);
export const tournamentAwards = (sport: SportId): AwardDef[] => (statSchema(sport)?.awards ?? []).filter((a) => a.tournament !== false);
export const awardDef = (sport: SportId, stat: string): AwardDef | undefined => statSchema(sport)?.awards.find((a) => a.stat === stat);

/** Can only players of a role lead / win on this stat? (football clean sheets: keepers) */
export const eligibilityOf = (sport: SportId, key: string): StatDef['eligible'] => statSchema(sport)?.stats.find((s) => s.key === key)?.eligible;

/** Every key a sport may write on a line (its line stats + the shared keys). */
export function lineKeys(sport: SportId): Set<string> {
  const keys = new Set<string>(SHARED_STATS.map((s) => s.key));
  for (const d of statSchema(sport)?.stats ?? []) if ((d.source ?? 'line') === 'line') keys.add(d.key);
  return keys;
}
