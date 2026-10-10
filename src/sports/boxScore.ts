/**
 * SD-23 (GEN-10) — the shared, schema-driven box score model. PURE (no React
 * Native), so the node tests and any screen can build the same table.
 *
 * Input: the sport's stat schema (`box` = the columns, `compare` = the team
 * comparison rows) and one match's per-player figures for a period scope —
 * rows built from that match's own live tally (src/sports/boxSources.ts),
 * never the career.
 *
 * Output:
 *  - `buildBoxTable`: the visible columns, each side's rows as display text,
 *    and a team totals row. A column is shown only when it was TRACKED (D8):
 *    at least one row carries all of its input keys and the source didn't
 *    list it as untracked — a stat the match didn't capture is hidden, never
 *    shown as a column of false zeros. A row that lacks a shown column's key
 *    reads "–". `overallOnly` columns (MIN, +/-) drop out of period views.
 *  - `comparisonRows`: the two-column team comparison (shots, fouls, FT%,
 *    aces, raid points …): a side's team figure when the source gives one,
 *    else a derived rate recomputed over the side's rows, else the rows' sum.
 *  - `boxLayout`: the sticky-name layout at a given width — when the numbers
 *    don't fit beside a readable name, the name column is pinned and the
 *    numbers scroll sideways (the page never overflows at 375 px).
 */
import type { StatLine } from '../core/types';
import {
  aggregateValue, formatValue, statDefIn,
  type BoxColumnSpec, type CompareDef, type SportStatSchema, type StatDef,
} from './statSchema.ts';

export type BoxScope = 'all' | number;
type Side = 'home' | 'away';

/** One player's figures for the scope. Put a key in `stats` only when the
 *  match tracked it for that player (0 included); a missing key reads "–". */
export interface BoxRowInput {
  name: string;
  playerId?: string;
  stats: Record<string, number>;
  /** in the starting line-up (marked in the table) */
  starter?: boolean;
  /** on the court / pitch right now (live dot) */
  on?: boolean;
  /** did not play — listed only with `showDnp` */
  dnp?: boolean;
}

export interface BoxSideInput {
  rows: BoxRowInput[];
  /** points the side scored with no player on them (basketball "Team",
   *  volleyball opponent errors) — its own row, counted in the totals */
  team?: { label: string; stats: Record<string, number> };
  /** team-level figures for the comparison panel (corners, possession, all-outs) */
  teamStats?: Record<string, number>;
}

/** What a sport hands the shared box score for one scope. */
export interface BoxData {
  home: BoxSideInput;
  away: BoxSideInput;
  /** keys the match did not track (D8): their columns / comparison rows hide */
  untracked?: string[];
}

/** A match's box score source: the periods its events carry and the data per scope. */
export interface MatchBoxSource {
  /** e.g. Q1…Q4 / OT1, 1st half / 2nd half, Set 1 … — the toggle shows at ≥ 2 */
  periods: { value: number; label: string }[];
  data: (scope: BoxScope) => BoxData;
  /** false = no per-player table (carrom: boards aren't credited to a player) */
  players?: boolean;
  /** the table's empty text ("No points yet.") */
  emptyText?: string;
  /** re-render every N ms while live (football possession is time-based) */
  tickMs?: number;
  /** said under the comparison when some rows aren't tracked */
  untrackedHint?: string;
  /** SD-40 — short lines under the tables (basketball: team fouls per period) */
  notes?: () => string[];
}

/* --------------------------------- columns --------------------------------- */

export interface BoxColumn {
  key: string;
  abbr: string;
  label: string;
  spec: BoxColumnSpec;
  def?: StatDef;
}

const specOf = (c: string | BoxColumnSpec): BoxColumnSpec => (typeof c === 'string' ? { key: c } : c);

/** Every column the schema's box declares, in order (blocks flattened). */
export function boxColumns<S extends string>(schema: SportStatSchema<S>): BoxColumn[] {
  const out: BoxColumn[] = [];
  for (const b of schema.box ?? []) {
    for (const c of b.columns) {
      const spec = specOf(c);
      const def = spec.pair || spec.sum ? undefined : statDefIn(schema, spec.key);
      out.push({
        key: spec.key,
        abbr: spec.abbr ?? def?.abbr ?? def?.label ?? spec.key,
        label: spec.label ?? def?.label ?? spec.key,
        spec,
        def,
      });
    }
  }
  return out;
}

/** The line keys a column reads. */
export function inputsOf(c: BoxColumn): string[] {
  if (c.spec.pair) return [...c.spec.pair];
  if (c.spec.sum) return [...c.spec.sum];
  const a = c.def?.agg;
  if (c.def?.source === 'derived' && a) {
    const bare = (k: string | string[]) => (Array.isArray(k) ? k : [k]).map((x) => x.replace(/^-/, ''));
    if (a.kind === 'rate') return [...bare(a.num), ...bare(a.den)];
    if (a.kind === 'sum' && a.keys) return bare(a.keys);
    if (a.kind === 'sum' && a.key) return [a.key];
    if (a.kind === 'perGame' || a.kind === 'perSet') return bare(a.key);
    if (a.kind === 'pair') return [...bare(a.a), ...bare(a.b)];
  }
  return [c.key];
}

const has = (stats: Record<string, number>, k: string) => Object.prototype.hasOwnProperty.call(stats, k);
const lineOf = (stats: Record<string, number>): StatLine => ({ id: 'box', playerId: 'box', sport: 'football', stats } as unknown as StatLine);
export const signedText = (n: number): string => (n > 0 ? `+${n}` : String(n));

/** One cell: the column over one player's (or the totals') stats. */
export function cellText<S extends string>(schema: SportStatSchema<S>, c: BoxColumn, stats: Record<string, number>): string {
  const keys = inputsOf(c);
  if (!keys.every((k) => has(stats, k))) return '–';
  const v = (k: string) => Number(stats[k]) || 0;
  if (c.spec.pair) return `${v(c.spec.pair[0])}-${v(c.spec.pair[1])}`;
  if (c.spec.sum) return String(c.spec.sum.reduce((a, k) => a + v(k), 0));
  if (c.def?.source === 'derived' && c.def.agg) return aggregateValue(schema, c.def, [lineOf(stats)]).text;
  if (c.spec.signed) return signedText(v(c.key));
  return formatValue(v(c.key), c.def?.format);
}

/** Sum each key over stat records — a key no record carries stays absent. */
export function sumStats(list: Record<string, number>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of list) for (const [k, n] of Object.entries(s)) out[k] = (out[k] ?? 0) + (Number(n) || 0);
  return out;
}

/* ---------------------------------- table ---------------------------------- */

export interface BoxTableRow {
  name: string;
  playerId?: string;
  starter?: boolean;
  on?: boolean;
  dnp?: boolean;
  /** the side's unattributed row ("Team", "Opp. errors") */
  team?: boolean;
  cells: string[];
}

export interface BoxTableSide {
  rows: BoxTableRow[];
  /** the totals row, one cell per column ('' = not totalled, e.g. +/-) */
  totals: string[];
}

export interface BoxTable {
  columns: BoxColumn[];
  /** schema columns hidden because the match didn't track them (labels) */
  hidden: string[];
  home: BoxTableSide;
  away: BoxTableSide;
}

export interface BoxOptions {
  scope?: BoxScope;
  /** list players who did not play (bench) — off by default */
  showDnp?: boolean;
}

/** Is a column tracked in this data (D8)? */
function trackedIn(c: BoxColumn, data: BoxData): boolean {
  if (data.untracked?.includes(c.key)) return false;
  const keys = inputsOf(c);
  const all = [data.home, data.away].flatMap((s) => [...s.rows.map((r) => r.stats), ...(s.team ? [s.team.stats] : [])]);
  return all.some((st) => keys.every((k) => has(st, k)));
}

export function buildBoxTable<S extends string>(schema: SportStatSchema<S>, data: BoxData, opts: BoxOptions = {}): BoxTable {
  const scope = opts.scope ?? 'all';
  const all = boxColumns(schema).filter((c) => scope === 'all' || !c.spec.overallOnly);
  const columns = all.filter((c) => trackedIn(c, data));
  const hidden = all.filter((c) => !columns.includes(c)).map((c) => c.label);
  const side = (s: BoxSideInput): BoxTableSide => {
    const players = s.rows.filter((r) => opts.showDnp || !r.dnp);
    const rows: BoxTableRow[] = players.map((r) => ({
      name: r.name,
      ...(r.playerId ? { playerId: r.playerId } : null),
      ...(r.starter ? { starter: true } : null),
      ...(r.on ? { on: true } : null),
      ...(r.dnp ? { dnp: true } : null),
      cells: columns.map((c) => cellText(schema, c, r.stats)),
    }));
    const teamHasAny = s.team && Object.values(s.team.stats).some((n) => Number(n) !== 0);
    if (s.team && teamHasAny) rows.push({ name: s.team.label, team: true, cells: columns.map((c) => cellText(schema, c, s.team!.stats)) });
    const tot = sumStats([...players.map((r) => r.stats), ...(s.team ? [s.team.stats] : [])]);
    const totals = columns.map((c) => (c.spec.total === false ? '' : cellText(schema, c, tot)));
    return { rows, totals };
  };
  return { columns, hidden, home: side(data.home), away: side(data.away) };
}

/* ------------------------------- comparison -------------------------------- */

export interface CompareRow {
  key: string;
  label: string;
  home: string;
  away: string;
  /** the numbers behind the text, for the bars (NaN-free; 0 when none) */
  h: number;
  a: number;
}

export interface Comparison {
  rows: CompareRow[];
  /** labels of the schema rows the match didn't track */
  untracked: string[];
}

const DASH = '–';

/** A side's figure for one comparison key: its team figure, else a derived
 *  rate over its rows, else the sum over its rows. undefined = none at all. */
function sideValue<S extends string>(schema: SportStatSchema<S>, def: StatDef | undefined, key: string, s: BoxSideInput): { text: string; n: number } | undefined {
  if (s.teamStats && has(s.teamStats, key)) {
    const n = Number(s.teamStats[key]) || 0;
    return { text: formatValue(n, def?.format), n };
  }
  const lines = [...s.rows.map((r) => r.stats), ...(s.team ? [s.team.stats] : [])];
  if (def?.source === 'derived' && def.agg) {
    const v = aggregateValue(schema, def, [lineOf(sumStats(lines))]);
    return { text: v.text, n: v.value ?? 0 };
  }
  if (!lines.some((l) => has(l, key))) return undefined;
  const n = lines.reduce((a, l) => a + (Number(l[key]) || 0), 0);
  return { text: formatValue(n, def?.format), n };
}

export function comparisonRows<S extends string>(schema: SportStatSchema<S>, data: BoxData, scope: BoxScope = 'all'): Comparison {
  const rows: CompareRow[] = [];
  const untracked: string[] = [];
  for (const c of schema.compare ?? []) {
    const spec = typeof c === 'string' ? { key: c } : c;
    const def = statDefIn(schema, spec.key);
    const label = spec.label ?? def?.label ?? spec.key;
    if (data.untracked?.includes(spec.key)) { untracked.push(label); continue; }
    if (spec.overallOnly && scope !== 'all') continue;
    const h = sideValue(schema, def, spec.key, data.home);
    const a = sideValue(schema, def, spec.key, data.away);
    if (!h && !a) continue; // nothing on either side: the sport doesn't carry it here
    rows.push({ key: spec.key, label, home: h?.text ?? DASH, away: a?.text ?? DASH, h: h?.n ?? 0, a: a?.n ?? 0 });
  }
  return { rows, untracked };
}

/** Which side leads a comparison row (higher number), or null when level. */
export const leaderOf = (r: Pick<CompareRow, 'h' | 'a'>): Side | null => (r.h === r.a ? null : r.h > r.a ? 'home' : 'away');

/** The bar split: each side's share (0–1) of the two values; 0.5 / 0.5 when both are 0. */
export function barShares(r: Pick<CompareRow, 'h' | 'a'>): { home: number; away: number } {
  const h = Math.max(0, r.h), a = Math.max(0, r.a);
  return h + a > 0 ? { home: h / (h + a), away: a / (h + a) } : { home: 0.5, away: 0.5 };
}

/* --------------------------------- layout ---------------------------------- */

/** Narrowest a name may get before the table pins it and scrolls the numbers. */
export const NAME_MIN = 96;
/** The pinned name column's width in the scrolling layout. */
export const STICKY_NAME_W = 120;

/** Width of one number column: wide enough for its header and its widest cell. */
export function columnWidth(c: BoxColumn, cells: string[] = []): number {
  const chars = Math.max(c.abbr.length, ...cells.map((x) => x.length), 2);
  return Math.max(30, Math.min(56, 8 + chars * 8));
}

export interface BoxLayout {
  /** pinned names + sideways-scrolling numbers */
  sticky: boolean;
  /** the name column's width (sticky) — else it flexes (≥ NAME_MIN) */
  nameWidth: number;
  /** each number column's width, in column order */
  widths: number[];
  /** the numbers' total width */
  numbersWidth: number;
}

/** The layout at `width` px of table (inside the card's padding). */
export function boxLayout(table: Pick<BoxTable, 'columns' | 'home' | 'away'>, width: number): BoxLayout {
  const widths = table.columns.map((c, i) => columnWidth(c, [
    ...[table.home, table.away].flatMap((s) => [...s.rows.map((r) => r.cells[i] ?? ''), s.totals[i] ?? '']),
  ]));
  const numbersWidth = widths.reduce((a, w) => a + w, 0);
  const sticky = width - numbersWidth < NAME_MIN;
  return { sticky, nameWidth: sticky ? Math.min(STICKY_NAME_W, Math.max(80, Math.round(width * 0.36))) : Math.max(NAME_MIN, width - numbersWidth), widths, numbersWidth };
}

/** A row's spoken summary for screen readers ("Asha Rao: PTS 12, REB 4 …"). */
export const rowLabel = (cols: BoxColumn[], r: Pick<BoxTableRow, 'name' | 'cells'>): string =>
  `${r.name}: ${cols.map((c, i) => `${c.label} ${r.cells[i]}`).join(', ')}`;
