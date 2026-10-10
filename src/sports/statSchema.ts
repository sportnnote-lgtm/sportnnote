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
 * layer can import it. It also holds the aggregate engine (SD-16, GEN-03):
 * every `StatAgg` kind over a set of lines (`aggregateValue`), the career grid
 * built from it (`careerFromSchema`) and the leaderboard ranking
 * (`rankPlayers`: qualifiers, coverage, the schema tie-break chain).
 */
import type { LineResult, SportId, StatLine } from '../core/types';

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

/** Minimum sample before a rate / average / per-game figure RANKS on a
 *  leaderboard (careers always show the figure). Applied by `rankPlayers`. */
export interface Qualifier {
  /** at least this much of the rate's denominator (e.g. 30 balls faced; for
   *  per-set: sets played) */
  den?: number;
  /** at least this many games — the lines that count toward the stat (after
   *  its `over` filter and coverage: innings batted for a batting average,
   *  appearances for a per-game figure) */
  games?: number;
  /** how the minimum reads on a leaderboard ("min 10 overs"); default built
   *  from the numbers ("min 30 balls faced", "min 3 games") */
  note?: string;
  /** SD-27 — the unit an organiser types the minimum in, and how it reads
   *  ("overs" = 6 balls of an economy's `den`; "matches" for a racket win %).
   *  `per` = line units per typed unit (default 1). */
  unit?: { label: string; one: string; per?: number };
}

/** How a stat aggregates over many stat lines (career, tournament, team). */
export type StatAgg =
  /** total of `key` (default: the stat's own key) over the lines (`over` = a
   *  named line filter); a line without the key counts `missing` (default 0) */
  | { kind: 'sum'; key?: string; over?: string; missing?: number;
      /** SD-24 — a signed sum of several keys instead of one (kabaddi total
       *  points = raid + tackle), times `scale` (chess score = (2W + D) × ½) */
      keys?: SignedKeys; scale?: number }
  /** highest / lowest single-line value of `key` (default: the stat's own key),
   *  over lines that carry the key; the result keeps the line it came from */
  | { kind: 'max'; key?: string; over?: string;
      /** SD-82 — the best single line by a signed sum of keys instead of one
       *  (kabaddi best match = raid + tackle points); a line counts when it
       *  carries any of them */
      keys?: SignedKeys }
  | { kind: 'min'; key?: string; over?: string }
  /** best single-line figure: order lines by `by` (first decides, the rest
   *  break ties), render the winning line. "–" when no line qualifies. */
  | { kind: 'best'; by: { key: string; better: Better }[]; over?: string; render: (stats: Record<string, number>) => string }
  /** Σnum × scale ÷ Σden to `dp` places over the filtered lines; "–" when the
   *  denominator is 0. `qualifier` is applied by SD-16 leaderboards. */
  | { kind: 'rate'; num: SignedKeys; den: SignedKeys; scale?: number; dp?: number; over?: string; qualifier?: Qualifier }
  /** Σkey ÷ games: the distinct matches whose line TRACKED the key (SD-11
   *  appearance lines count; a match that didn't track it isn't a 0) */
  | { kind: 'perGame'; key: SignedKeys; dp?: number; qualifier?: Qualifier; over?: string }
  /** Σkey ÷ sets played (`sets`, default setsWon + setsLost), over the lines
   *  that tracked the key AND carry the set keys */
  | { kind: 'perSet'; key: string; sets?: SignedKeys; dp?: number; qualifier?: Qualifier; over?: string }
  /** SD-24 — a won-lost pair "12-5" (Σa – Σb) over the lines that CARRY one of
   *  the keys (a legacy line without them is not a 0-0); value = Σa */
  | { kind: 'pair'; a: SignedKeys; b: SignedKeys; over?: string }
  /** number of lines where gte ≤ key < lt (centuries: runs ≥ 100). With
   *  `keys`: lines where at least `atLeast` (default all) of them are in range
   *  (a double-double: 2 of points / rebounds / assists / steals / blocks ≥ 10) */
  | { kind: 'countIf'; key?: string; keys?: string[]; atLeast?: number; gte?: number; lt?: number; over?: string }
  /** an appearance key (apps / starts): counted with the record, never listed
   *  as a counting stat */
  | { kind: 'appearance' }
  /** SD-27 — the player's match results (each line's `result`, see
   *  `lineOutcome`): the number of lines whose result is in `count` (matches
   *  won), or with `of` that number × `scale` ÷ the lines whose result is in
   *  `of` (win % over decided matches). Lines without a result (in play, a
   *  field event) don't count. `games` = lines with a result in `of` (else
   *  `count`) — the qualifier's "matches" */
  | { kind: 'result'; count: LineResult[]; of?: LineResult[]; scale?: number; dp?: number; qualifier?: Qualifier };

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
   *  whose `tracked` list omits the key reads "not tracked", never 0.
   *  'present' (SD-24) = tracked wherever the key is on the line, whatever
   *  the `tracked` list says (absolute keys statTotals writes)
   *  'keyed' (SD-107) = tracked ONLY on a line that carries the key itself
   *  (racket point detail: statTotals writes it only for a match that
   *  captured it — a racket line's record keys don't make it a 0) */
  coverage?: 'core' | 'optional' | 'present' | 'keyed';
  mode?: string;
  /** who can lead / win on this stat (football clean sheets: keepers only) */
  eligible?: 'goalkeeper';
  /** a card / foul that suspends the player for a time (hockey, handball) */
  suspension?: Suspension;
  /** the leaderboard card title when it differs from `label` ("Highest
   *  score" for the career row "Highest") */
  leaderLabel?: string;
  /** leaderboard tie-breaks after the value (and, for a best figure, its
   *  `by` chain): other stats of this schema, aggregated the same way. Still
   *  level = the order the players first appear in (stable) */
  tieBreak?: { key: string; better: Better }[];
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
  /** SD-27 — the stat the slot RANKS by when it isn't `stat` itself (the slot
   *  key stays `stat`, so published awards keep matching): basketball's Top
   *  scorer ranks by points per game, volleyball's Best blocker by blocks per
   *  set. Its qualifier (and an organiser's minimum) applies. */
  rankBy?: string;
  /** hand-written "How is this ranked?" text, when the generated one reads
   *  worse (the Golden Glove) */
  howRanked?: string;
}

/** SD-27 — a sport whose Player of the Tournament ranks by one stat (and its
 *  tie-breaks) instead of the summed MVP weights: racket sports by matches
 *  won, chess by score, basketball by efficiency per game. */
export interface MvpDef {
  stat: string;
  tieBreak?: { key: string; better: Better }[];
  howRanked?: string;
}

/** A career section: an ordered list of stats (with an optional row label
 *  that overrides the stat's own, e.g. bowling "Runs" for runsConceded). */
export interface SectionDef {
  id: string;
  title: string;
  /** `hideZero` (SD-24): a milestone row ("Hat-tricks", "Super 10s") shows
   *  only once the player has one */
  rows: { stat: string; label?: string; hideZero?: boolean }[];
}

/** SD-23 — a box-score column with more than a plain stat key. */
export interface BoxColumnSpec {
  /** the stat key; with `pair` / `sum`, a box-only id */
  key: string;
  /** header (default: the stat's `abbr`, else its label) */
  abbr?: string;
  /** long name for the column key / screen readers (default: the stat's label) */
  label?: string;
  /** made-attempted pair ("3-5"): [made key, attempted key] — FGM-A, FTM-A */
  pair?: [string, string];
  /** a box-only total of line keys (kabaddi PTS = raid + tackle points) */
  sum?: string[];
  /** show the sign (+3 / −2 / 0) — plus / minus */
  signed?: boolean;
  /** false = blank in the team totals row (+/-) — default true */
  total?: boolean;
  /** the headline column, drawn bold */
  emphasis?: boolean;
  /** only on the Overall view, never per period (MIN, +/-: whole-game figures) */
  overallOnly?: boolean;
}

/** A box-score block: ordered columns, optionally titled ("Batting"). A column
 *  is a stat key or a `BoxColumnSpec` (SD-23 — read by src/sports/boxScore.ts). */
export interface BoxDef {
  title?: string;
  columns: (string | BoxColumnSpec)[];
}

/** SD-23 — one row of the team comparison panel: a stat key (line keys are
 *  summed over the side's box rows, `source: 'team'` keys come from the
 *  sport's team figures, derived rates are recomputed), with an optional
 *  label that overrides the stat's own. */
export type CompareDef = string | { key: string; label?: string; overallOnly?: boolean };

/** A timed / measured event (athletics, swimming, weightlifting …): the mark
 *  that ranks, its unit and which way is better, and how many attempts count. */
export interface MeasuredEventDef {
  key: string;
  label: string;
  format: StatFormat;
  /** best of N attempts (field events 3 + 3, lifts 3); absent = one mark */
  attempts?: number;
}

/** SD-25 (GEN-12) — a context split a career can be filtered by. Each line's
 *  context is derived at read time from its match (`src/data/lineContext.ts`). */
export type SplitDim =
  | 'format' // cricket overs category, best-of, indoor / beach, n-a-side …
  | 'ball' // cricket ball type
  | 'discipline' // singles / doubles / mixed
  | 'competition' // tournament vs friendly
  | 'tournament' // which tournament
  | 'season' // year, or a school season
  | 'opponent'
  | 'colour' // chess
  | 'timeControl' // chess
  | 'venue'
  | 'homeAway';

export interface SportStatSchema<S extends string = SportId> {
  sport: S;
  /** every stat, in display order; MVP weights keep this order */
  stats: StatDef[];
  /** named line filters used by `agg.over` (e.g. cricket 'batted') */
  filters?: Record<string, (l: StatLine) => boolean>;
  /** SD-25 — the context splits this sport's career offers as filter chips,
   *  in chip order. A chip shows only when the player's lines carry ≥ 2
   *  values of it. Absent = no split chips (golf). */
  splits?: SplitDim[];
  /** career sections, in order */
  sections?: SectionDef[];
  /** how the profile renders the career: 'sections' from the schema (SD-24:
   *  every sport but golf), 'totals' = the summed-counter grid (a sport without
   *  sections yet), 'custom' = the sport's own block (golf), 'measured' (SD-90)
   *  = a timed / measured career from the results engine: PB / SB per event,
   *  medals, finals, results history (athletics) */
  careerView?: 'sections' | 'totals' | 'custom' | 'measured';
  /** SD-24 — the key stats a match-history row shows after the score line, in
   *  priority order (zeros skipped, at most 3). Default: `headline`. */
  history?: string[];
  /** box-score blocks (the shared box score reads these — SD-23) */
  box?: BoxDef[];
  /** SD-23 — the team comparison panel's rows, in order */
  compare?: CompareDef[];
  /** leaderboard categories, in order; the first is the headline leader */
  leaders: string[];
  /** SD-27 — the Player of the Tournament by a stat (absent = summed weights) */
  mvp?: MvpDef;
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

/* -------------------------- aggregate engine (SD-16) -------------------------- */

const DASH = '–';
const num = (l: StatLine, k: string) => Number(l.stats?.[k] ?? 0) || 0;
export const hasKey = (l: StatLine, k: string) => l.stats != null && Object.prototype.hasOwnProperty.call(l.stats, k);
const keyList = (keys: SignedKeys) => (Array.isArray(keys) ? keys : [keys]);
const bare = (keys: SignedKeys) => keyList(keys).map((k) => k.replace(/^-/, ''));
const signed = (l: StatLine, keys: SignedKeys) =>
  keyList(keys).reduce((a, k) => (k.startsWith('-') ? a - num(l, k.slice(1)) : a + num(l, k)), 0);

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

/** D8 coverage: was `key` being tracked on this line? The line's `tracked`
 *  list decides when present; a legacy line (no list) counts as tracking every stat — the same rule the
 *  leaderboard coverage note always used. */
export const isTracked = (l: StatLine, key: string): boolean => (l.tracked ? l.tracked.includes(key) : true);

/** SD-24 — `isTracked`, plus a `coverage: 'present'` stat counts as tracked on
 *  any line that carries it or another 'present' key (keys statTotals writes
 *  outside the line's `tracked` list: football minutes and keeper goals
 *  conceded, racket / volleyball record keys). */
export function trackedIn<S extends string>(schema: SportStatSchema<S>, l: StatLine, key: string): boolean {
  if (statDefIn(schema, key)?.coverage === 'keyed') return hasKey(l, key);
  if (isTracked(l, key)) return true;
  if (statDefIn(schema, key)?.coverage !== 'present') return false;
  // on the line, or the line carries a sibling 'present' key (statTotals wrote
  // the set: a missing setsLost next to setsWon is 0)
  return hasKey(l, key) || schema.stats.some((d) => d.coverage === 'present' && hasKey(l, d.key));
}

/** The line keys an aggregation reads (SD-24: a career row with none of them
 *  on any line is "not tracked" and hidden). */
export const statInputs = (def: StatDef): string[] => inputsOf(def);

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

/** Distinct matches among the lines (a field-event line counts by its id). */
const gamesIn = (ls: StatLine[]) => new Set(ls.map((l) => l.matchId || `line:${l.id}`)).size;

/** One stat aggregated over many lines. */
export interface AggValue {
  /** the number that ranks; undefined = no figure (rate with a 0 denominator,
   *  no qualifying line, nothing tracked) */
  value?: number;
  /** as displayed ("54*", "3/12", "128.57", "1.5", "–") */
  text: string;
  /** D8: false when no line tracked the stat's inputs — show "not tracked",
   *  never 0 */
  tracked: boolean;
  /** lines that count toward it (after `over` + coverage): innings for a
   *  batting average, appearances for a per-game figure — `Qualifier.games` */
  games: number;
  /** the rate / per-game / per-set denominator — `Qualifier.den` */
  den?: number;
  /** max / min / best: the line the figure came from (link to its match) */
  line?: StatLine;
  /** best: the winning line's `by` chain, signed so bigger is better —
   *  compares best figures across players (3/12 beats 3/15) */
  order?: number[];
}

/** The input keys an aggregation reads (for coverage). */
function inputsOf(def: StatDef): string[] {
  const a: StatAgg = def.agg ?? { kind: 'sum' };
  switch (a.kind) {
    case 'sum': return a.keys ? bare(a.keys) : [a.key ?? def.key];
    case 'max': return a.keys ? bare(a.keys) : [a.key ?? def.key];
    case 'min': return [a.key ?? def.key];
    case 'rate': return [...bare(a.num), ...bare(a.den)];
    case 'perGame': return bare(a.key);
    case 'pair': return [...bare(a.a), ...bare(a.b)];
    case 'perSet': return [a.key];
    case 'countIf': return a.keys ?? (a.key ? [a.key] : []);
    case 'best': return a.by.map((b) => b.key);
    case 'appearance': return [def.key];
    case 'result': return [];
  }
}

/** SD-27 — a line's match result for the record stats: the stored / filled-in
 *  `result`, else the legacy `won` flag (a win only — a line without a result
 *  may be a match still in play, so it is never read as a loss). Undefined for
 *  a pending line or a field-event line. Callers that have the matches fill
 *  `result` first (`withLineResults`, standings.ts). */
export function lineOutcome(l: StatLine): LineResult | undefined {
  if (l.pending || l.eventId) return undefined;
  return l.result ?? (l.won ? 'W' : undefined);
}

/** Aggregate one stat over lines (already this sport's) — every `StatAgg`
 *  kind. Careers show `text`; leaderboards rank `value` (see `rankPlayers`). */
export function aggregateValue<S extends string>(schema: SportStatSchema<S>, def: StatDef, lines: StatLine[]): AggValue {
  const agg: StatAgg = def.agg ?? { kind: 'sum' };
  const covered = (ls: StatLine[], keys = inputsOf(def)) => ls.filter((l) => keys.every((k) => trackedIn(schema, l, k)));
  const none = (games = 0): AggValue => ({ text: DASH, tracked: true, games });
  const untracked: AggValue = { text: DASH, tracked: false, games: 0 };
  switch (agg.kind) {
    case 'sum': {
      // Totals keep today's behaviour: every line counts (an untracked line
      // carries no value, so it adds nothing).
      const ls = linesFor(schema, lines, agg.over);
      if (agg.keys) {
        const t = ls.reduce((a, l) => a + signed(l, agg.keys!), 0) * (agg.scale ?? 1);
        return { value: t, text: formatValue(t, def.format), tracked: true, games: ls.length };
      }
      const k = agg.key ?? def.key;
      const total = ls.reduce((a, l) => a + (agg.missing !== undefined && !hasKey(l, k) ? agg.missing : num(l, k)), 0);
      return { value: total, text: formatValue(total, def.format), tracked: true, games: ls.length };
    }
    case 'appearance': {
      const total = lines.reduce((a, l) => a + num(l, def.key), 0);
      return { value: total, text: String(total), tracked: true, games: lines.length };
    }
    case 'max': case 'min': {
      const k = agg.key ?? def.key;
      const multi = agg.kind === 'max' ? agg.keys : undefined;
      const val = (l: StatLine) => (multi ? signed(l, multi) : num(l, k));
      const carries = (l: StatLine) => (multi ? bare(multi).some((x) => hasKey(l, x)) : hasKey(l, k));
      const all = linesFor(schema, lines, agg.over);
      const cov = covered(all);
      if (all.length && !cov.length) return untracked;
      let line: StatLine | undefined;
      for (const l of cov) {
        if (!carries(l)) continue;
        if (!line || (agg.kind === 'max' ? val(l) > val(line) : val(l) < val(line))) line = l;
      }
      if (!line) return none(cov.length);
      const v = val(line);
      return { value: v, text: formatValue(v, def.format), tracked: true, games: cov.length, line };
    }
    case 'best': {
      const ls = linesFor(schema, lines, agg.over);
      const b = bestLine(ls, agg.by);
      if (!b) return none();
      return {
        value: num(b, agg.by[0].key), text: agg.render(b.stats ?? {}), tracked: true, games: ls.length, line: b,
        order: agg.by.map((c) => (c.better === 'higher' ? 1 : -1) * num(b, c.key)),
      };
    }
    case 'rate': {
      const all = linesFor(schema, lines, agg.over);
      const ls = covered(all);
      if (all.length && !ls.length) return untracked;
      const n = ls.reduce((a, l) => a + signed(l, agg.num), 0) * (agg.scale ?? 1);
      const d = ls.reduce((a, l) => a + signed(l, agg.den), 0);
      const t = rateText(n, d, agg.dp ?? def.format?.dp ?? 2);
      if (t === DASH) return { ...none(ls.length), den: d };
      return { value: n / d, text: def.format?.unit === 'percent' ? `${t}%` : t, tracked: true, games: ls.length, den: d };
    }
    case 'perGame': {
      const all = linesFor(schema, lines, agg.over);
      const ls = covered(all);
      if (all.length && !ls.length) return untracked;
      const g = gamesIn(ls);
      if (!g) return none();
      const v = ls.reduce((a, l) => a + signed(l, agg.key), 0) / g;
      return { value: v, text: v.toFixed(agg.dp ?? def.format?.dp ?? 1), tracked: true, games: g, den: g };
    }
    case 'perSet': {
      const sets = agg.sets ?? ['setsWon', 'setsLost'];
      const all = linesFor(schema, lines, agg.over);
      const tracked = covered(all);
      if (all.length && !tracked.length) return untracked;
      // a line counts only when it says how many sets were played
      const ls = tracked.filter((l) => keyList(sets).some((k) => !k.startsWith('-') && hasKey(l, k)));
      const d = ls.reduce((a, l) => a + signed(l, sets), 0);
      if (d <= 0) return { ...none(ls.length), den: d };
      const v = ls.reduce((a, l) => a + num(l, agg.key), 0) / d;
      return { value: v, text: v.toFixed(agg.dp ?? def.format?.dp ?? 2), tracked: true, games: ls.length, den: d };
    }
    case 'pair': {
      const ls = linesFor(schema, lines, agg.over).filter((l) => inputsOf(def).some((k) => hasKey(l, k)));
      if (!ls.length) return untracked;
      const x = ls.reduce((s, l) => s + signed(l, agg.a), 0);
      const y = ls.reduce((s, l) => s + signed(l, agg.b), 0);
      return { value: x, text: `${x}-${y}`, tracked: true, games: ls.length, den: x + y };
    }
    case 'result': {
      const outs = lines.map(lineOutcome);
      const n = outs.filter((r) => r && agg.count.includes(r)).length;
      if (!agg.of) return { value: n, text: String(n), tracked: true, games: n };
      const d = outs.filter((r) => r && agg.of!.includes(r)).length;
      if (!d) return { ...none(0), den: 0 };
      const v = (n * (agg.scale ?? 1)) / d;
      const t = v.toFixed(agg.dp ?? def.format?.dp ?? 0);
      return { value: v, text: def.format?.unit === 'percent' ? `${t}%` : t, tracked: true, games: d, den: d };
    }
    case 'countIf': {
      const ls = linesFor(schema, lines, agg.over);
      const keys = agg.keys ?? (agg.key ? [agg.key] : []);
      const need = agg.atLeast ?? keys.length;
      const inRange = (v: number) => v >= (agg.gte ?? -Infinity) && v < (agg.lt ?? Infinity);
      const c = ls.filter((l) => keys.filter((k) => inRange(num(l, k))).length >= need).length;
      return { value: c, text: String(c), tracked: true, games: ls.length };
    }
  }
}

/** One stat's aggregate over the lines, formatted. `undefined` for an
 *  appearance key (counted with the record) and for a stat nobody tracked
 *  (D8: "not tracked", never a false 0). */
export function aggregateStat<S extends string>(schema: SportStatSchema<S>, def: StatDef, lines: StatLine[]): string | undefined {
  if (def.agg?.kind === 'appearance') return undefined;
  const v = aggregateValue(schema, def, lines);
  return v.tracked ? v.text : undefined;
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

/* ----------------------------- leaderboards (SD-16) ----------------------------- */

/** Which way a stat's leaderboard ranks: totals, counts and single-match
 *  highs "most first"; lows / rates / averages by the stat's own direction. */
export function rankDirection(def: StatDef): Better {
  const k = (def.agg ?? { kind: 'sum' }).kind;
  if (k === 'min') return 'lower';
  if (k === 'rate' || k === 'perGame' || k === 'perSet') return betterOf(def.format);
  if (k === 'result' && def.agg?.kind === 'result' && def.agg.of) return betterOf(def.format);
  return 'higher';
}

/** The qualifier a stat declares (rates / per-game / per-set). */
export const qualifierOf = (def: StatDef): Qualifier | undefined => {
  const a = def.agg;
  return a && (a.kind === 'rate' || a.kind === 'perGame' || a.kind === 'perSet' || a.kind === 'result') ? a.qualifier : undefined;
};

/** SD-27 — the minimum's size in the unit an organiser types it in (and the
 *  leaderboard reads): `games`, else `den` ÷ `unit.per`. */
export function qualifierAmount(q: Qualifier): number {
  if (q.games != null) return q.games;
  return (q.den ?? 0) / (q.unit?.per ?? 1);
}

/** SD-27 — the stat's qualifier with an organiser's minimum (`n` in the
 *  qualifier's own unit; 0 = no minimum). The dimension (games or the rate's
 *  denominator) and the unit stay the stat's; the note is rebuilt from `n`. */
export function qualifierWithMin(def: StatDef, n: number | undefined): Qualifier | null | undefined {
  const base = qualifierOf(def);
  if (n === undefined || !base) return base;
  if (!(n > 0)) return null;
  const amount = Math.round(n);
  if (base.games != null || base.den == null) return { games: amount, ...(base.unit ? { unit: base.unit } : {}) };
  return { den: amount * (base.unit?.per ?? 1), ...(base.unit ? { unit: base.unit } : {}) };
}

/** "min 30 balls faced" / "min 3 games" — the note a leaderboard shows. */
export function qualifierText<S extends string>(schema: SportStatSchema<S>, def: StatDef, q?: Qualifier | null): string | undefined {
  if (!q) return undefined;
  if (q.note) return q.note;
  if (q.unit) {
    const n = qualifierAmount(q);
    return `min ${n} ${n === 1 ? q.unit.one : q.unit.label}`;
  }
  const parts: string[] = [];
  if (q.games) parts.push(`${q.games} ${q.games === 1 ? 'game' : 'games'}`);
  if (q.den) {
    const a = def.agg;
    const denKey = a?.kind === 'rate' ? bare(a.den)[0] : undefined;
    const d = denKey ? statDefIn(schema, denKey) : undefined;
    const unit = a?.kind === 'perSet' ? (q.den === 1 ? 'set' : 'sets') : d ? (q.den === 1 ? oneOf(d) : shortOf(d)) : '';
    parts.push(`${q.den}${unit ? ` ${unit}` : ''}`);
  }
  return parts.length ? `min ${parts.join(', ')}` : undefined;
}

export interface RankedPlayer {
  playerId: string;
  value: number;
  /** display string ("54*", "3/12", "7.25") */
  text: string;
  /** lines that count toward the stat (Qualifier.games) */
  games: number;
  den?: number;
  /** lines that tracked the stat's inputs (≤ totalGames) */
  trackedGames: number;
  /** the player's lines in this sport */
  totalGames: number;
  /** max / min / best: the line the figure came from */
  line?: StatLine;
}

export interface RankOptions {
  /** override the stat's own qualifier (an organiser's minimum); `null` = none */
  qualifier?: Qualifier | null;
  /** who may appear (football clean sheets: keepers only) */
  eligible?: (playerId: string, lines: StatLine[]) => boolean;
  limit?: number;
  /** SD-27 — the last tie-break, after the stat's chain (awards: by name);
   *  default the order players first appear in */
  finalTie?: (a: string, b: string) => number;
  /** SD-27 — tie-breaks to use instead of the stat's own `tieBreak` (an award's) */
  tieBreak?: { key: string; better: Better }[];
}

/** Rank players by any stat of the schema. Lines should already be this
 *  sport's (and this tournament's). Drops players with no figure, below the
 *  qualifier, or (for totals / counts / highs / best figures) on 0. Orders by
 *  the value in the stat's direction — a best figure by its `by` chain — then
 *  the stat's `tieBreak` chain, then first appearance (stable). */
export function rankPlayers<S extends string>(schema: SportStatSchema<S>, def: StatDef, lines: StatLine[], opts: RankOptions = {}): RankedPlayer[] {
  const by = new Map<string, StatLine[]>();
  for (const l of lines) (by.get(l.playerId) ?? by.set(l.playerId, []).get(l.playerId)!).push(l);
  const kind = (def.agg ?? { kind: 'sum' }).kind;
  const q = opts.qualifier === undefined ? qualifierOf(def) : opts.qualifier;
  const dir = rankDirection(def) === 'higher' ? 1 : -1;
  const mustBePositive = kind === 'sum' || kind === 'countIf' || kind === 'max' || kind === 'appearance'
    || (def.agg?.kind === 'result' && !def.agg.of)
    // SD-27: a per-game / per-set average of 0 is no "best" (0.00 blocks per set)
    || ((kind === 'perGame' || kind === 'perSet') && dir === 1)
    || (def.agg?.kind === 'best' && def.agg.by[0].better === 'higher');
  const inputs = inputsOf(def);
  const ties = (opts.tieBreak ?? def.tieBreak ?? []).map((t) => ({ def: statDefIn(schema, t.key), better: t.better }));
  const rows: (RankedPlayer & { order: number[] })[] = [];
  for (const [playerId, ls] of by) {
    if (opts.eligible && !opts.eligible(playerId, ls)) continue;
    const v = aggregateValue(schema, def, ls);
    if (!v.tracked || v.value === undefined || !Number.isFinite(v.value)) continue;
    if (mustBePositive && !(v.value > 0)) continue;
    if (q?.games && v.games < q.games) continue;
    if (q?.den && (v.den ?? 0) < q.den) continue;
    const order = [...(v.order ?? [dir * v.value]), ...ties.map((t) => {
      const tv = t.def ? aggregateValue(schema, t.def, ls).value : undefined;
      return tv === undefined ? -Infinity : (t.better === 'higher' ? 1 : -1) * tv;
    })];
    rows.push({
      playerId, value: v.value, text: v.text, games: v.games, den: v.den, line: v.line, order,
      trackedGames: ls.filter((l) => inputs.every((k) => trackedIn(schema, l, k))).length, totalGames: ls.length,
    });
  }
  const cmp = (a: number[], b: number[]) => {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const d = (b[i] ?? -Infinity) - (a[i] ?? -Infinity);
      if (d !== 0 && !Number.isNaN(d)) return d;
    }
    return 0;
  };
  return rows
    .sort((a, b) => cmp(a.order, b.order) || (opts.finalTie ? opts.finalTie(a.playerId, b.playerId) : 0)) // stable
    .slice(0, opts.limit ?? rows.length)
    .map(({ order: _o, ...r }) => r);
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
    if (s.source === 'derived' && (!a || (a.kind === 'sum' && !a.key && !a.keys))) errs.push(`${w}: a derived stat needs an agg over other keys`);
    if (!a) continue;
    if (a.kind === 'sum' && a.key) need(a.key, w);
    if (a.kind === 'sum' && a.keys) signedKeys(a.keys).forEach((k) => need(k, w));
    if (a.kind === 'pair') [...signedKeys(a.a), ...signedKeys(a.b)].forEach((k) => need(k, w));
    needFilter(a.kind === 'appearance' || a.kind === 'result' ? undefined : a.over, w);
    if (a.kind === 'rate') [...signedKeys(a.num), ...signedKeys(a.den)].forEach((k) => need(k, w));
    if (a.kind === 'perGame' || a.kind === 'perSet') signedKeys(a.key).forEach((k) => need(k, w));
    if (a.kind === 'perSet' && a.sets) signedKeys(a.sets).forEach((k) => need(k, w));
    if (a.kind === 'countIf') {
      if (!a.key && !a.keys?.length) errs.push(`${w}: countIf needs key or keys`);
      [...(a.key ? [a.key] : []), ...(a.keys ?? [])].forEach((k) => need(k, w));
    }
    if ((a.kind === 'max' || a.kind === 'min') && a.key) need(a.key, w);
    if (a.kind === 'max' && a.keys) signedKeys(a.keys).forEach((k) => need(k, w));
    if (a.kind === 'best') a.by.forEach((b) => need(b.key, w));
  }
  for (const s of schema.stats) s.tieBreak?.forEach((t) => need(t.key, `stat ${s.key} tie-break`));
  for (const sec of schema.sections ?? []) sec.rows.forEach((r) => need(r.stat, `section ${sec.id}`));
  for (const b of schema.box ?? []) {
    for (const c of b.columns) {
      const where = `box ${b.title ?? ''}`;
      if (typeof c === 'string') { need(c, where); continue; }
      if (c.pair || c.sum) [...(c.pair ?? []), ...(c.sum ?? [])].forEach((k) => need(k, where));
      else need(c.key, where);
    }
  }
  for (const c of schema.compare ?? []) need(typeof c === 'string' ? c : c.key, 'compare');
  schema.leaders.forEach((k) => need(k, 'leaders'));
  schema.headline.forEach((k) => need(k, 'headline'));
  for (const a of schema.awards) {
    need(a.stat, 'award');
    if (a.rankBy) need(a.rankBy, `award ${a.stat} rankBy`);
    a.tieBreak?.forEach((t) => need(t.key, `award ${a.stat} tie-break`));
  }
  if (schema.mvp) {
    need(schema.mvp.stat, 'mvp');
    schema.mvp.tieBreak?.forEach((t) => need(t.key, 'mvp tie-break'));
  }
  for (const s of schema.stats) {
    const q = qualifierOf(s);
    if (q && q.games == null && q.den == null) errs.push(`stat ${s.key}: a qualifier needs games or den`);
  }
  return errs;
}
