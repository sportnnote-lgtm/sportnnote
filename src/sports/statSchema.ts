/**
 * SD-15 (GEN-02) — the declarative per-sport stat schema. ONE definition per
 * sport says, for every stat key a plugin writes on a player's stat line (and
 * every figure derived from those keys):
 *   - its labels (long / short plural + singular / compact / abbreviation),
 *   - its unit and format (count, decimal, %, ratio, overs o.b, minutes, time,
 *     distance, height, points, kg, strokes) and which way is better,
 *   - how it aggregates over many lines (sum / max / min / best figure / rate
 *     num ÷ den with a qualifier / per game / per set / count-if / derived),
 *   - where it shows: box score columns, career sections, leaderboards,
 *     headline order, award slots, MVP weight, the per-match rating line,
 *   - whether it is always tracked or only in an optional detail mode (D8:
 *     "not tracked" rather than a false 0).
 *
 * Per-sport schemas live next to each plugin (`src/sports/<sport>/stats.ts`)
 * and are collected in `statSchemas.ts`. The old label / weight / award /
 * leader maps are now derived views of these (see ratings.ts, stats.ts,
 * standings.ts, teamStats.ts, cricketCareer.ts, SportProfileScreen).
 *
 * This file is PURE (no React Native) so the node test runner and the data
 * layer can import it. It implements only the aggregations needed to keep
 * today's behaviour identical (sum, rate, count-if, best figure — cricket's
 * career); max / min / per-game / per-set / qualifiers are DECLARED here and
 * implemented by the aggregate engine (SD-16).
 */
import type { SportId, StatLine } from '../core/types';

export type Better = 'higher' | 'lower';

/** What a value measures — drives formatting and, for timed / measured
 *  results, which way is better (time: lower; distance / height: higher). */
export type StatUnit =
  | 'count' // an integer tally (goals, runs, aces)
  | 'decimal' // a plain decimal (averages)
  | 'percent' // 0–100, shown with "%"
  | 'ratio' // e.g. set ratio 1.250
  | 'overs' // cricket balls shown as "o.b" (6-ball overs)
  | 'minutes' // time on the pitch / suspension minutes
  | 'time' // a race time in seconds (lower is better by default)
  | 'distance' // metres (higher is better)
  | 'height' // metres (higher is better)
  | 'points' // a judged / scored total (higher is better)
  | 'mass' // kilograms lifted (higher is better)
  | 'strokes' // golf strokes (lower is better)
  | 'figure'; // a composite rendered figure, e.g. best bowling "3/12", highest "54*"

export interface StatFormat {
  unit: StatUnit;
  /** decimal places for rates / averages / measured marks */
  dp?: number;
  /** default 'higher' — except time / strokes, which default to 'lower' */
  better?: Better;
}

/** A sum of signed line keys: 'runs', or ['innings', '-notOut'] (= outs). */
export type SignedKeys = string | string[];

/** Minimum sample before a rate / average ranks or shows (SD-16 applies it). */
export interface Qualifier {
  /** at least this much of the rate's denominator (e.g. 30 balls faced) */
  den?: number;
  /** at least this many games with a line in this sport */
  games?: number;
}

/** How a stat aggregates over many stat lines (career, tournament, team). */
export type StatAgg =
  /** total of `key` (default: the stat's own key) over the lines (`over` = a
   *  named line filter); a line without the key counts `missing` (default 0) */
  | { kind: 'sum'; key?: string; over?: string; missing?: number }
  /** highest / lowest single-line value of `key` (default: the stat's own key) — SD-16 */
  | { kind: 'max'; key?: string; over?: string }
  | { kind: 'min'; key?: string; over?: string }
  /** best single-line figure: order lines by `by` (first decides, the rest
   *  break ties), render the winning line. "–" when no line qualifies. */
  | { kind: 'best'; by: { key: string; better: Better }[]; over?: string; render: (stats: Record<string, number>) => string }
  /** Σnum × scale ÷ Σden to `dp` places over the filtered lines; "–" when the
   *  denominator is 0. `qualifier` is applied by SD-16 leaderboards. */
  | { kind: 'rate'; num: SignedKeys; den: SignedKeys; scale?: number; dp?: number; over?: string; qualifier?: Qualifier }
  /** Σkey ÷ games (appearances) — SD-16 */
  | { kind: 'perGame'; key: string; dp?: number; qualifier?: Qualifier }
  /** Σkey ÷ sets played — SD-16 */
  | { kind: 'perSet'; key: string; dp?: number; qualifier?: Qualifier }
  /** number of lines where gte ≤ key < lt */
  | { kind: 'countIf'; key: string; gte?: number; lt?: number; over?: string }
  /** an appearance key (apps / starts): counted with the record, never listed
   *  as a counting stat */
  | { kind: 'appearance' };

/** Labels. Only `label` is required; the rest fall back as documented. */
export interface StatLabels {
  /** long / title-case: profiles, leaderboards ("Shots on target") */
  label: string;
  /** short plural for compact summaries ("shots on target", "pts", "wkts").
   *  Default: `label` lower-cased. */
  short?: string;
  /** singular of `short` for a count of exactly 1 ("shot on target"). Absent =
   *  invariant (mass nouns / abbreviations: "pts", "wkts", "open-play"). */
  one?: string;
  /** the tighter plural on the per-match rating line ("on target", "att.
   *  plays"). Default: `short`. */
  compact?: string;
  /** singular of `compact`. Default: `compact` when set (invariant), else `one`. */
  compactOne?: string;
  /** column abbreviation for box scores ("PTS", "REB", "SR") */
  abbr?: string;
}

/** Timed suspension a card / foul carries (hockey green 2', yellow 5–10',
 *  handball 2'); `permanent` = sent off for the rest of the match. Read by the
 *  time-on-field tracker (SD-29). */
export interface Suspension {
  minutes?: number;
  /** umpire's choice up to this many minutes (hockey yellow: 5–10) */
  maxMinutes?: number;
  permanent?: boolean;
}

export interface StatDef extends StatLabels {
  key: string;
  /** 'line' (default) = a key plugins write on player stat lines; 'derived' =
   *  computed from other keys (career / box only, never written); 'team' = a
   *  team-level match stat (e.g. football corners), never on a player line */
  source?: 'line' | 'derived' | 'team';
  /** the section / box-score group it belongs to (e.g. 'batting', 'serve') */
  group?: string;
  format?: StatFormat;
  /** default `{ kind: 'sum' }` */
  agg?: StatAgg;
  /** MVP / Player of the Tournament points per unit (negative penalises) */
  weight?: number;
  /** listed on the generic per-match rating line (MatchSummary) */
  matchSummary?: boolean;
  /** D8: 'optional' stats are captured only in a detail mode (`mode`); a line
   *  whose `tracked` list omits the key reads "not tracked", never 0 */
  coverage?: 'core' | 'optional';
  mode?: string;
  /** who can lead / win on this stat (football clean sheets: keepers only) */
  eligible?: 'goalkeeper';
  /** a card / foul that suspends the player for a time (hockey, handball) */
  suspension?: Suspension;
}

/** A "best in role" award. `match` = shown on the per-match summary;
 *  `tournament` = a fixed tournament award slot (both default true). */
export interface AwardDef {
  stat: string;
  icon: string;
  label: string;
  /** the tournament's name for it, if different ("Golden Glove") */
  tournamentLabel?: string;
  match?: boolean;
  tournament?: boolean;
  /** tie-breaks after the stat itself */
  tieBreak?: { key: string; better: Better }[];
}

/** A career section: an ordered list of stats (with an optional row label
 *  that overrides the stat's own, e.g. bowling "Runs" for runsConceded). */
export interface SectionDef {
  id: string;
  title: string;
  rows: { stat: string; label?: string }[];
}

/** A box-score block: ordered columns, optionally titled ("Batting"). */
export interface BoxDef {
  title?: string;
  columns: string[];
}

/** A timed / measured event (athletics, swimming, weightlifting …): the mark
 *  that ranks, its unit and which way is better, and how many attempts count. */
export interface MeasuredEventDef {
  key: string;
  label: string;
  format: StatFormat;
  /** best of N attempts (field events 3 + 3, lifts 3); absent = one mark */
  attempts?: number;
}

export interface SportStatSchema<S extends string = SportId> {
  sport: S;
  /** every stat, in display order; MVP weights keep this order */
  stats: StatDef[];
  /** named line filters used by `agg.over` (e.g. cricket 'batted') */
  filters?: Record<string, (l: StatLine) => boolean>;
  /** career sections, in order */
  sections?: SectionDef[];
  /** how the profile renders the career today: 'sections' from the schema,
   *  'totals' = the summed-counter grid (until SD-24), 'custom' = the sport's
   *  own block (golf) */
  careerView?: 'sections' | 'totals' | 'custom';
  /** box-score blocks (the shared box score reads these — SD-23) */
  box?: BoxDef[];
  /** leaderboard categories, in order; the first is the headline leader */
  leaders: string[];
  /** which stats lead a compact one-line summary, in priority order */
  headline: string[];
  awards: AwardDef[];
  /** what the team score counts ("goals", "runs", "sets") */
  scoreUnit?: string;
  /** timed / measured events (results engine, SD-28) */
  events?: MeasuredEventDef[];
}

/* ------------------------------ label helpers ------------------------------ */

export const shortOf = (d: StatLabels): string => d.short ?? d.label.toLowerCase();
export const oneOf = (d: StatLabels): string => d.one ?? shortOf(d);
export const compactOf = (d: StatLabels): string => d.compact ?? shortOf(d);
export const compactOneOf = (d: StatLabels): string => d.compactOne ?? (d.compact !== undefined ? d.compact : oneOf(d));

/** Default "better" direction for a format. */
export const betterOf = (f?: StatFormat): Better => f?.better ?? (f?.unit === 'time' || f?.unit === 'strokes' ? 'lower' : 'higher');

export const statDefIn = <S extends string>(schema: SportStatSchema<S>, key: string): StatDef | undefined =>
  schema.stats.find((s) => s.key === key);

/* ------------------------- aggregation (SD-15 subset) ------------------------- */

const DASH = '–';
const num = (l: StatLine, k: string) => Number(l.stats?.[k] ?? 0) || 0;
export const hasKey = (l: StatLine, k: string) => l.stats != null && Object.prototype.hasOwnProperty.call(l.stats, k);
const signed = (l: StatLine, keys: SignedKeys) =>
  (Array.isArray(keys) ? keys : [keys]).reduce((a, k) => (k.startsWith('-') ? a - num(l, k.slice(1)) : a + num(l, k)), 0);

/** x / y to `dp` places, or "–" when y is 0. */
export const rateText = (x: number, y: number, dp = 2): string => (y > 0 ? (x / y).toFixed(dp) : DASH);
/** Balls → "o.b" overs (6-ball overs). */
export const oversText = (balls: number): string => `${Math.floor(balls / 6)}.${balls % 6}`;

/** A value in a stat's unit, as shown on a career / box cell. */
export function formatValue(v: number, f?: StatFormat): string {
  switch (f?.unit) {
    case 'overs': return oversText(v);
    case 'percent': return `${v.toFixed(f.dp ?? 0)}%`;
    case 'decimal': case 'ratio': case 'time': case 'distance': case 'height': case 'mass': case 'points':
      return f.dp != null ? v.toFixed(f.dp) : String(v);
    default: return String(v);
  }
}

function linesFor<S extends string>(schema: SportStatSchema<S>, lines: StatLine[], over?: string): StatLine[] {
  if (!over) return lines;
  const f = schema.filters?.[over];
  if (!f) throw new Error(`stat schema ${schema.sport}: unknown line filter "${over}"`);
  return lines.filter(f);
}

/** The line that holds the best figure by `by` (first wins a full tie). */
export function bestLine(lines: StatLine[], by: { key: string; better: Better }[]): StatLine | undefined {
  let best: StatLine | undefined;
  for (const l of lines) {
    if (!best) { best = l; continue; }
    for (const c of by) {
      const d = num(l, c.key) - num(best, c.key);
      if (d === 0) continue;
      if ((c.better === 'higher') === d > 0) best = l;
      break;
    }
  }
  return best;
}

/** One stat's aggregate over the lines, formatted. `undefined` when its agg
 *  kind belongs to the aggregate engine (SD-16) and isn't implemented here. */
export function aggregateStat<S extends string>(schema: SportStatSchema<S>, def: StatDef, lines: StatLine[]): string | undefined {
  const agg: StatAgg = def.agg ?? { kind: 'sum' };
  switch (agg.kind) {
    case 'sum': {
      const ls = linesFor(schema, lines, agg.over);
      const k = agg.key ?? def.key;
      const total = ls.reduce((a, l) => a + (agg.missing !== undefined && !hasKey(l, k) ? agg.missing : num(l, k)), 0);
      return formatValue(total, def.format);
    }
    case 'rate': {
      const ls = linesFor(schema, lines, agg.over);
      const n = ls.reduce((a, l) => a + signed(l, agg.num), 0);
      const d = ls.reduce((a, l) => a + signed(l, agg.den), 0);
      const t = rateText(n * (agg.scale ?? 1), d, agg.dp ?? def.format?.dp ?? 2);
      return t !== DASH && def.format?.unit === 'percent' ? `${t}%` : t;
    }
    case 'countIf': {
      const ls = linesFor(schema, lines, agg.over);
      return String(ls.filter((l) => num(l, agg.key) >= (agg.gte ?? -Infinity) && num(l, agg.key) < (agg.lt ?? Infinity)).length);
    }
    case 'best': {
      const b = bestLine(linesFor(schema, lines, agg.over), agg.by);
      return b ? agg.render(b.stats ?? {}) : DASH;
    }
    default:
      return undefined; // max / min / perGame / perSet / appearance — SD-16
  }
}

export interface CareerStat { key: string; label: string; value: string }

/** Career sections computed from the schema: { [sectionId]: rows }. The lines
 *  should already be this sport's. */
export function careerFromSchema<S extends string>(schema: SportStatSchema<S>, lines: StatLine[]): Record<string, CareerStat[]> {
  const out: Record<string, CareerStat[]> = {};
  for (const sec of schema.sections ?? []) {
    out[sec.id] = sec.rows.flatMap((r) => {
      const def = statDefIn(schema, r.stat);
      if (!def) throw new Error(`stat schema ${schema.sport}: section ${sec.id} names unknown stat "${r.stat}"`);
      const value = aggregateStat(schema, def, lines);
      return value === undefined ? [] : [{ key: def.key, label: r.label ?? def.label, value }];
    });
  }
  return out;
}

/* -------------------------------- validation -------------------------------- */

/** Every reference in a schema points at a declared stat / filter; keys are
 *  unique. Returns the problems (empty = valid). Run over every schema in tests. */
export function validateSchema<S extends string>(schema: SportStatSchema<S>): string[] {
  const errs: string[] = [];
  const keys = new Set<string>();
  for (const s of schema.stats) {
    if (keys.has(s.key)) errs.push(`duplicate stat "${s.key}"`);
    keys.add(s.key);
  }
  const need = (k: string, where: string) => { if (!keys.has(k)) errs.push(`${where} names unknown stat "${k}"`); };
  const needFilter = (f: string | undefined, where: string) => { if (f && !schema.filters?.[f]) errs.push(`${where} uses unknown filter "${f}"`); };
  const signedKeys = (k: SignedKeys) => (Array.isArray(k) ? k : [k]).map((x) => x.replace(/^-/, ''));
  for (const s of schema.stats) {
    const a = s.agg;
    const w = `stat ${s.key}`;
    if (s.source === 'derived' && (!a || (a.kind === 'sum' && !a.key))) errs.push(`${w}: a derived stat needs an agg over other keys`);
    if (!a) continue;
    if (a.kind === 'sum' && a.key) need(a.key, w);
    if (a.kind === 'sum' || a.kind === 'countIf' || a.kind === 'best' || a.kind === 'rate' || a.kind === 'max' || a.kind === 'min') needFilter(a.over, w);
    if (a.kind === 'rate') [...signedKeys(a.num), ...signedKeys(a.den)].forEach((k) => need(k, w));
    if (a.kind === 'countIf' || a.kind === 'perGame' || a.kind === 'perSet') need(a.key, w);
    if ((a.kind === 'max' || a.kind === 'min') && a.key) need(a.key, w);
    if (a.kind === 'best') a.by.forEach((b) => need(b.key, w));
  }
  for (const sec of schema.sections ?? []) sec.rows.forEach((r) => need(r.stat, `section ${sec.id}`));
  for (const b of schema.box ?? []) b.columns.forEach((c) => need(c, `box ${b.title ?? ''}`));
  schema.leaders.forEach((k) => need(k, 'leaders'));
  schema.headline.forEach((k) => need(k, 'headline'));
  for (const a of schema.awards) {
    need(a.stat, 'award');
    a.tieBreak?.forEach((t) => need(t.key, `award ${a.stat} tie-break`));
  }
  return errs;
}
