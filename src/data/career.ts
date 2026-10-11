/**
 * SD-24 (GEN-11) — the shared career framework. A sport profile's career is
 * built from the sport's stat schema (SD-15) by the SD-16 aggregate engine:
 *   - the headline record (Apps · W-D-L or W-L · Win %) — `recordTiles`;
 *   - the schema's sections (per-game / per-set averages, rates, bests,
 *     totals), with rows nobody tracked hidden (D8) — `careerSections`;
 *   - the framework's own figures over lines + their matches: best winning
 *     run, singles / doubles W-L (SD-25 context), titles / finals (knockout
 *     finals the player's side won / reached) and, for doubles, the record
 *     with each partner (paired from the same match + side, since a stat line
 *     doesn't store its partner — SD-19) — `disciplineRecords`, `partnerRecords`,
 *     `titlesAndFinals`, `bestWinRun`;
 *   - the match-history key-stat text (zeros and record keys skipped, plural-
 *     aware) — `historyStats`.
 * Every function takes the (possibly SD-25-filtered) lines, so a filter chip
 * recomputes every section. Cricket keeps `careerFromSchema` byte-for-byte.
 *
 * PURE (no React Native) — node tests load it.
 */
import type { Match, SportId, StatLine } from '../core/types';
import type { LineResult } from '../core/types';
import { aggregateValue, careerFromSchema, coverageOf, hasKey, lineOutcome, trackedIn, statDefIn, statInputs, type SportStatSchema } from '../sports/statSchema.ts';
import { labelShort, statSchema } from '../sports/statSchemas.ts';
import { sideOf, type LineContext } from './lineContext.ts';
import { deriveSeries, readSeriesMeta, seriesWinnerId } from './series.ts';
import type { Record5 } from './stats.ts';

/* --------------------------------- record --------------------------------- */

/** Sports with no drawn result: the record reads W-L (a draw would show). */
const NO_DRAW = new Set<SportId>(['tennis', 'badminton', 'tabletennis', 'squash', 'padel', 'pickleball', 'volleyball', 'basketball']);

/** Win % over matches with a result (W + D + L + T), rounded — "100%", "67%", "0%". */
export function winPctText(r: Record5): string {
  const decided = r.wins + r.draws + r.losses + r.ties;
  return `${decided > 0 ? Math.round((r.wins / decided) * 100) : 0}%`;
}

/** The record tile's label + value: W-L where the sport can't draw (and none
 *  is on record), else W-D-L. */
export function recordFigure(sport: SportId, r: Record5): { label: string; value: string } {
  if (NO_DRAW.has(sport) && r.draws === 0) return { label: 'W-L', value: `${r.wins}-${r.losses}` };
  return { label: 'W-D-L', value: `${r.wins}-${r.draws}-${r.losses}` };
}

/** A stat tile's value needs the smaller font from 4 characters ("100%",
 *  "12-3", "3-0-1"): the big figure fits a third of a 375 px row only up to 3. */
export const tileValueIsLong = (value: string): boolean => value.length >= 4;

/* ------------------------------- sections ------------------------------- */

export interface CareerRow {
  key: string;
  label: string;
  value: string;
  /** an optional stat tracked in fewer of the player's games than played */
  coverage?: { tracked: number; total: number };
}
export interface CareerSection { id: string; title: string; rows: CareerRow[] }

/** The schema's sections over the lines (this sport's). A row shows only when
 *  some line carries one of its inputs (D8: never a false 0 for a stat nobody
 *  tracked), it has a figure (no "–" for a rate over 0) and, for a `hideZero`
 *  milestone, once it isn't 0. Empty sections
 *  are dropped. Cricket renders exactly `careerFromSchema` (golden). */
export function careerSections(schema: SportStatSchema<SportId>, lines: StatLine[]): CareerSection[] {
  if (schema.sport === 'cricket') {
    const c = careerFromSchema(schema, lines);
    // SD-79: a row only some lines can give (BF, ducks, 4w…) says over how many
    return (schema.sections ?? []).map((s) => ({ id: s.id, title: s.title, rows: (c[s.id] ?? []).map((r) => {
      const def = statDefIn(schema, r.key);
      const coverage = def ? coverageOf(schema, def, lines) : undefined;
      return coverage ? { ...r, coverage } : r;
    }) }));
  }
  const out: CareerSection[] = [];
  for (const sec of schema.sections ?? []) {
    const rows: CareerRow[] = [];
    const secKeys = sec.rows.flatMap((r) => { const d = statDefIn(schema, r.stat); return d ? statInputs(d) : []; });
    for (const r of sec.rows) {
      const def = statDefIn(schema, r.stat);
      if (!def || def.agg?.kind === 'appearance') continue;
      const inputs = statInputs(def);
      // a 'core' stat is on every line in spirit (a chess line carries only
      // its outcome key: no loss key still means 0 losses) — shown once the
      // section has any data
      const carried = def.coverage === 'core' ? secKeys : inputs;
      if (!lines.some((l) => carried.some((k) => hasKey(l, k)))) continue;
      const v = aggregateValue(schema, def, lines);
      // not tracked, or no figure yet (a rate over 0: save % with no shots faced)
      if (!v.tracked || v.value === undefined) continue;
      if (r.hideZero && !v.value) continue;
      const row: CareerRow = { key: def.key, label: r.label ?? def.label, value: v.text };
      if (def.coverage === 'optional' || def.coverage === 'keyed') {
        // SD-44: a stat whose aggregation reads only a filtered set of lines
        // (basketball FG% — the games that tracked missed shots) is covered
        // by those lines
        const over = def.agg && 'over' in def.agg && def.agg.over ? schema.filters?.[def.agg.over] : undefined;
        const tracked = lines.filter((l) => inputs.every((k) => trackedIn(schema, l, k)) && (!over || over(l))).length;
        if (tracked < lines.length) row.coverage = { tracked, total: lines.length };
      } else if (def.coverOf) {
        // SD-36: a figure only some lines can give (chess wins by method —
        // the wins that recorded how) says over how many of the lines that
        // should have (all wins)
        const c = coverageOf(schema, def, lines);
        if (c) row.coverage = c;
      }
      rows.push(row);
    }
    if (rows.length) out.push({ id: sec.id, title: sec.title, rows });
  }
  return leadSections(schema, out, lines);
}

/** SD-39 — a section with `leadWhen` moves to the top when more than half of
 *  the lines pass its filter (a football player who mostly kept goal reads
 *  Goalkeeping first, an outfielder Attack first). */
function leadSections(schema: SportStatSchema<SportId>, secs: CareerSection[], lines: StatLine[]): CareerSection[] {
  if (!lines.length) return secs;
  const lead = (schema.sections ?? []).filter((s) => {
    const f = s.leadWhen ? schema.filters?.[s.leadWhen] : undefined;
    return !!f && lines.filter(f).length * 2 > lines.length;
  }).map((s) => s.id);
  if (!lead.length) return secs;
  return [...secs.filter((s) => lead.includes(s.id)), ...secs.filter((s) => !lead.includes(s.id))];
}

/* ------------------------------ framework figures ------------------------------ */

const byDate = (a: StatLine, b: StatLine) => (a.date ?? '').localeCompare(b.date ?? '') || a.id.localeCompare(b.id);

/** SD-36 (CH-05) — longest unbeaten run (wins and draws), oldest → newest.
 *  A loss breaks it; a no result or a match in play neither extends nor
 *  breaks it (as `bestWinRun`). Chess: a forfeit loss is a loss. */
export function bestUnbeatenRun(lines: StatLine[]): number {
  let best = 0;
  let cur = 0;
  for (const l of [...lines].sort(byDate)) {
    if (l.pending || !l.result || l.result === 'NR') continue;
    cur = l.result === 'L' ? 0 : cur + 1;
    best = Math.max(best, cur);
  }
  return best;
}

/** Longest run of consecutive wins, oldest → newest. A no result or a match
 *  still in play neither extends nor breaks it. */
export function bestWinRun(lines: StatLine[]): number {
  let best = 0;
  let cur = 0;
  for (const l of [...lines].sort(byDate)) {
    if (l.pending || !l.result || l.result === 'NR') continue;
    cur = l.result === 'W' ? cur + 1 : 0;
    best = Math.max(best, cur);
  }
  return best;
}

export interface WL { played: number; wins: number; losses: number; draws: number }
const blankWL = (): WL => ({ played: 0, wins: 0, losses: 0, draws: 0 });
function addResult(r: WL, res: LineResult | undefined) {
  if (!res || res === 'NR') return;
  r.played += 1;
  if (res === 'W') r.wins += 1;
  else if (res === 'L') r.losses += 1;
  else r.draws += 1;
}
/** "5-2" (a drawn / tied match adds a middle figure: "5-1-2"). */
export const wlText = (r: WL): string => (r.draws ? `${r.wins}-${r.draws}-${r.losses}` : `${r.wins}-${r.losses}`);

/** W-L per discipline (singles / doubles / mixed) from the SD-25 context, in
 *  that order; only disciplines the player has played. */
export function disciplineRecords(lines: StatLine[], ctxOf: Map<string, LineContext>): { key: string; label: string; record: WL }[] {
  const by = new Map<string, { key: string; label: string; record: WL }>();
  for (const l of lines) {
    const d = ctxOf.get(l.id)?.discipline;
    if (!d || l.pending) continue;
    const e = by.get(d.key) ?? by.set(d.key, { key: d.key, label: d.label, record: blankWL() }).get(d.key)!;
    addResult(e.record, l.result);
  }
  const order = ['singles', 'doubles', 'mixed'];
  return [...by.values()].filter((e) => e.record.played > 0).sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
}

export interface TitlesFinals { titles: number; finals: number }

/** Knockout finals the player's side reached (a completed match tagged
 *  `stage: 'final'`; a multi-leg final counts once) and won. A single-match
 *  final is won when the line's result is W; a series by its winner. */
export function titlesAndFinals(lines: StatLine[], matchById: Map<string, Match>): TitlesFinals {
  const finals = new Map<string, boolean>();
  const all = [...matchById.values()];
  for (const l of lines) {
    const m = matchById.get(l.matchId);
    if (!m || m.stage !== 'final' || l.pending || !l.result) continue;
    const meta = readSeriesMeta(m);
    if (!meta) { finals.set(m.id, l.result === 'W'); continue; }
    const key = `series:${meta.id}`;
    if (finals.has(key)) continue;
    const s = deriveSeries(all.filter((x) => readSeriesMeta(x)?.id === meta.id))[0];
    const side = sideOf(l, m);
    const teamId = side === 'home' ? m.homeTeam.id : side === 'away' ? m.awayTeam.id : undefined;
    const w = s ? seriesWinnerId(s) : undefined;
    if (!w) continue; // the tie is still going
    finals.set(key, !!teamId && w === teamId);
  }
  return { finals: finals.size, titles: [...finals.values()].filter(Boolean).length };
}

export interface PartnerRecord extends WL { partnerId: string }

/** SD-24 — doubles record per partner (SD-118: doubles / mixed lines only —
 *  needs the line context). The partner of a line is the other
 *  player on the same side of the same match: another stat line of that match
 *  on the same side (`matchLines`), else the side's two-player roster. Only
 *  matches with a result count; most-played partner first. */
export function partnerRecords(
  lines: StatLine[],
  matchLines: StatLine[],
  matchById: Map<string, Match>,
  ctxOf?: Map<string, LineContext>,
): PartnerRecord[] {
  const byMatch = new Map<string, StatLine[]>();
  for (const l of matchLines) (byMatch.get(l.matchId) ?? byMatch.set(l.matchId, []).get(l.matchId)!).push(l);
  const out = new Map<string, PartnerRecord>();
  for (const l of lines) {
    // SD-118 — only a doubles / mixed line of a sport that has a singles /
    // doubles discipline (racket sports, carrom) has a partner. A team sport's
    // 2-player team (a 2-a-side kabaddi / football squad that only named two
    // players) is not a pair.
    const disc = ctxOf?.get(l.id)?.discipline?.key;
    if (disc !== 'doubles' && disc !== 'mixed') continue;
    const m = matchById.get(l.matchId);
    if (!m || l.pending || !l.result || l.result === 'NR') continue;
    const side = ctxOf?.get(l.id)?.side ?? sideOf(l, m);
    if (!side) continue;
    const mates = new Set<string>();
    for (const o of byMatch.get(l.matchId) ?? []) {
      if (o.playerId !== l.playerId && sideOf(o, m) === side) mates.add(o.playerId);
    }
    if (!mates.size) {
      const roster = (side === 'home' ? m.homeTeam : m.awayTeam)?.roster ?? [];
      if (roster.length === 2 && roster.includes(l.playerId)) mates.add(roster.find((p) => p !== l.playerId)!);
    }
    if (mates.size !== 1) continue; // not a pair (or not known)
    const pid = [...mates][0];
    const e = out.get(pid) ?? out.set(pid, { partnerId: pid, ...blankWL() }).get(pid)!;
    addResult(e, l.result);
  }
  return [...out.values()].sort((a, b) => b.played - a.played || b.wins - a.wins || a.partnerId.localeCompare(b.partnerId));
}

/** Doubles lines the partner pairing needs other players' lines for. */
export const doublesMatchIds = (lines: StatLine[], ctxOf: Map<string, LineContext>): string[] =>
  [...new Set(lines.filter((l) => l.matchId && ['doubles', 'mixed'].includes(ctxOf.get(l.id)?.discipline?.key ?? '')).map((l) => l.matchId))];

/* -------------------------------- captaincy -------------------------------- */

export interface CaptaincyRecord {
  /** matches as captain (in play ones included) */
  matches: number;
  wins: number;
  losses: number;
  ties: number;
  noResults: number;
  /** "67%" — wins over matches with a result (W + L + T), as the header's Win % */
  winPct: string;
  /** "5-2" or, with a tie, "5-2-1" (W-L-T) */
  record: string;
}

/** SD-69 — a cricket player's record as captain: the lines stamped `capt`
 *  (statTotals, from SET_CAPTAIN — lines synced before SD-69 carry it only
 *  after the backfill re-sync). Null when they never captained. */
export function captaincyRecord(lines: StatLine[]): CaptaincyRecord | null {
  const mine = lines.filter((l) => (Number(l.stats?.capt ?? 0) || 0) > 0);
  if (!mine.length) return null;
  const r = { matches: mine.length, wins: 0, losses: 0, ties: 0, noResults: 0 };
  for (const l of mine) {
    const o = lineOutcome(l);
    if (o === 'W') r.wins += 1;
    else if (o === 'L') r.losses += 1;
    else if (o === 'T' || o === 'D') r.ties += 1;
    else if (o === 'NR') r.noResults += 1;
  }
  const decided = r.wins + r.losses + r.ties;
  return {
    ...r,
    winPct: decided ? `${Math.round((r.wins / decided) * 100)}%` : '–',
    record: r.ties ? `${r.wins}-${r.losses}-${r.ties}` : `${r.wins}-${r.losses}`,
  };
}

/* ------------------------------- match history ------------------------------- */

/** The key stats a history row shows after the score line: the sport's
 *  `history` keys (default: headline), non-zero only, at most `max`, plural-
 *  aware ("1 ace", "2 aces"). Chess shows colour · time control instead. */
export function historyStats(line: StatLine, ctx?: LineContext, max = 3): string {
  const schema = statSchema(line.sport);
  const parts: string[] = [];
  if (line.sport === 'chess') {
    if (ctx?.colour) parts.push(ctx.colour.label);
    if (ctx?.timeControl) parts.push(ctx.timeControl.label);
  }
  const keys = schema?.history ?? schema?.headline ?? [];
  for (const k of keys) {
    if (parts.length >= max) break;
    const v = Number(line.stats?.[k] ?? 0);
    if (!v) continue;
    // "1 pt", not "1 pts" (the invariant abbreviation reads wrong in a sentence)
    const label = labelShort(k, v, line.sport);
    parts.push(`${v} ${v === 1 ? label.replace(/\bpts\b/, 'pt') : label}`);
  }
  return parts.join(' · ');
}
