/**
 * SD-27 (GEN-14) — leaderboard minimums an organiser sets per tournament, and
 * the match results the record leaders (racket "Most wins", "Best win %") read.
 *
 * A rate / average / per-set figure ranks only once a player has enough of a
 * sample (the schema's `qualifier`: "min 2 games", "min 5 sets", "min 30
 * service points"). An organiser can change any of those for one tournament.
 * The overrides live in the sport's `formats` entry as `leaderMins`, a JSON
 * string `{ "<statKey>": n }` (n in the qualifier's own unit, 0 = no minimum),
 * written through `patchTournamentFormat` like every other format key.
 *
 * PURE (no React Native) — node tests load it.
 */
import type { Match, SportId, StatLine } from '../core/types';
import { statSchema } from '../sports/statSchemas.ts';
import { qualifierAmount, qualifierOf, qualifierText, qualifierWithMin, statDefIn, type Qualifier, type StatDef } from '../sports/statSchema.ts';
import { lineResult } from './appearances.ts';

export const LEADER_MINS_KEY = 'leaderMins';

/** Organiser minimums, by stat key. */
export type LeaderMins = Record<string, number>;

/** The minimums saved on a sport's format (a JSON string, or an object). Bad
 *  values are dropped. */
export function readLeaderMins(format: Record<string, unknown> | null | undefined): LeaderMins {
  const raw = format?.[LEADER_MINS_KEY];
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw); } catch { return {}; }
  }
  if (!obj || typeof obj !== 'object') return {};
  const out: LeaderMins = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) out[k] = Math.round(n);
  }
  return out;
}

/** The format patch that saves `mins` (only values that differ from the
 *  schema's default; none left = the key is removed). */
export function leaderMinsPatch(sport: SportId, mins: LeaderMins): Record<string, unknown> {
  const keep: LeaderMins = {};
  for (const [k, n] of Object.entries(mins)) {
    const def = statDefOf(sport, k);
    const base = def && qualifierOf(def);
    if (base && Math.round(n) !== qualifierAmount(base)) keep[k] = Math.round(n);
  }
  return { [LEADER_MINS_KEY]: Object.keys(keep).length ? JSON.stringify(keep) : undefined };
}

const statDefOf = (sport: SportId, key: string): StatDef | undefined => {
  const s = statSchema(sport);
  return s ? statDefIn(s, key) : undefined;
};

/** The qualifier a stat ranks with in this tournament (`undefined` = the
 *  stat has none; `null` = the organiser removed it). */
export function effectiveQualifier(sport: SportId, key: string, mins: LeaderMins = {}): Qualifier | null | undefined {
  const def = statDefOf(sport, key);
  if (!def) return undefined;
  return qualifierWithMin(def, mins[key]);
}

export interface MinimumRow {
  key: string;
  /** the leaderboard / award name ("Best win %", "Points per game") */
  label: string;
  /** the schema's default, in its unit */
  defaultValue: number;
  /** this tournament's value */
  value: number;
  /** plural / singular unit ("games" / "game") */
  unit: string;
  unitOne: string;
  /** "min 3 matches" (or "No minimum") */
  text: string;
}

/** Every stat with a minimum that this sport's leaders or award slots use, in
 *  leaderboard order (award-only stats after). */
export function minimumRows(sport: SportId, mins: LeaderMins = {}): MinimumRow[] {
  const schema = statSchema(sport);
  if (!schema) return [];
  const keys = [
    ...schema.leaders,
    ...schema.awards.filter((a) => a.tournament !== false).map((a) => a.rankBy ?? a.stat),
    ...(schema.mvp ? [schema.mvp.stat] : []),
  ];
  const seen = new Set<string>();
  const rows: MinimumRow[] = [];
  for (const key of keys) {
    if (seen.has(key)) continue;
    seen.add(key);
    const def = statDefIn(schema, key);
    const base = def && qualifierOf(def);
    if (!def || !base) continue;
    const q = qualifierWithMin(def, mins[key]);
    const unit = base.unit?.label ?? (base.games != null ? 'games' : 'units');
    const unitOne = base.unit?.one ?? (base.games != null ? 'game' : 'unit');
    rows.push({
      key, label: def.leaderLabel ?? def.label, defaultValue: qualifierAmount(base), value: q ? qualifierAmount(q) : 0,
      unit, unitOne, text: q ? qualifierText(schema, def, q) ?? '' : 'No minimum',
    });
  }
  return rows;
}

/** SD-27 — lines with their match result filled in from the matches (the
 *  record leaders count W / L): `lineResult` where the match is known, and a
 *  line whose match isn't decided yet is marked `pending` (never a loss). */
export function withLineResults(lines: StatLine[], matches: Match[] | undefined): StatLine[] {
  if (!matches?.length) return lines;
  const byId = new Map(matches.map((m) => [m.id, m] as const));
  return lines.map((l) => {
    const m = l.matchId ? byId.get(l.matchId) : undefined;
    if (!m) return l;
    const r = lineResult(l, m);
    if (r === undefined) return l.pending ? l : { ...l, pending: true };
    return r === l.result ? l : { ...l, result: r };
  });
}
