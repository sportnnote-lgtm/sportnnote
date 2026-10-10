/**
 * Personal bests, season bests and records (meet record MR, school record SR)
 * per discipline + category. Only record-legal marks count: a wind-aided
 * (> +2.0 m/s) or no-wind-reading sprint / horizontal jump, or a hand time, is
 * shown but never a PB / SB / record. "=" marks an equalled best. Pure.
 */
import type { DisciplineDef, RankedEntry, ResultFlag } from './model.ts';
import { betterMark } from './rank.ts';

/** One earlier legal mark by an athlete (from their completed results). */
export interface MarkHistory {
  athleteId: string;
  discipline: string;
  value: number;
  /** ISO date of the competition */
  date: string;
}

export type RecordScope = 'MR' | 'SR';

/** A standing record for one discipline + category. */
export interface RecordMark {
  scope: RecordScope;
  discipline: string;
  /** categoryKey() of the category */
  category: string;
  value: number;
  holder: string;
  team?: string;
  date?: string;
  /** the event (PhaseFormat.eventKey) that set it — its own sheet shows "MR", not "=MR" */
  eventKey?: string;
}

export interface RecordContext {
  history: MarkHistory[];
  records: RecordMark[];
  /** categoryKey() of this event */
  category: string;
  /** marks on or after this date are "this season" */
  seasonFrom: string;
  /** this event's key: a record it set itself reads "MR", not "=MR" */
  eventKey?: string;
}

const bestOf = (vals: number[], def: DisciplineDef): number | null =>
  vals.reduce<number | null>((b, v) => (b == null || betterMark(v, b, def) ? v : b), null);

/** Add PB / SB / MR / SR (or "=") flags to a ranking (a copy). The history must
 *  not include this event's own marks. */
export function withRecordFlags(rows: RankedEntry[], def: DisciplineDef, ctx: RecordContext): RankedEntry[] {
  const eventBest = bestOf(rows.filter((r) => r.position != null && r.bestLegal != null).map((r) => r.bestLegal as number), def);
  return rows.map((r) => {
    const v = r.bestLegal;
    if (v == null || r.position == null) return r;
    const add: ResultFlag[] = [];
    // Records: only the event's best legal mark can set one.
    for (const scope of ['MR', 'SR'] as const) {
      const rec = ctx.records.find((x) => x.scope === scope && x.discipline === def.key && x.category === ctx.category);
      if (!rec || eventBest == null || v !== eventBest) continue;
      if (betterMark(v, rec.value, def) || (v === rec.value && !!ctx.eventKey && rec.eventKey === ctx.eventKey)) add.push(scope);
      else if (v === rec.value) add.push(`=${scope}` as ResultFlag);
    }
    const athlete = r.entry.athleteId;
    if (athlete) {
      const mine = ctx.history.filter((h) => h.athleteId === athlete && h.discipline === def.key);
      const pb = bestOf(mine.map((h) => h.value), def);
      const sb = bestOf(mine.filter((h) => h.date >= ctx.seasonFrom).map((h) => h.value), def);
      if (pb != null && betterMark(v, pb, def)) add.push('PB');
      else if (pb != null && v === pb) add.push('=PB');
      else if (sb != null && betterMark(v, sb, def)) add.push('SB');
      else if (sb != null && v === sb) add.push('=SB');
      else if (pb != null && sb == null) add.push('SB'); // first mark of the season
    }
    return add.length ? { ...r, flags: [...r.flags, ...add] } : r;
  });
}

/**
 * The record book after this event: any MR / SR beaten (not equalled) is
 * replaced by the event's best legal mark; a scope with no record yet is set
 * by it (a new meet starts its book). Returns the full, updated list.
 */
export function updateRecords(rows: RankedEntry[], def: DisciplineDef, category: string, records: RecordMark[], date: string, scopes: RecordScope[] = ['MR'], eventKey?: string): RecordMark[] {
  const legal = rows.filter((r) => r.position != null && r.bestLegal != null);
  const best = bestOf(legal.map((r) => r.bestLegal as number), def);
  if (best == null) return records;
  const holder = legal.find((r) => r.bestLegal === best)!;
  let out = [...records];
  for (const scope of scopes) {
    const cur = out.find((x) => x.scope === scope && x.discipline === def.key && x.category === category);
    if (cur && !betterMark(best, cur.value, def)) continue;
    out = out.filter((x) => x !== cur);
    out.push({ scope, discipline: def.key, category, value: best, holder: holder.entry.name, team: holder.entry.team?.name, date, ...(eventKey ? { eventKey } : {}) });
  }
  return out;
}

/** An athlete's PB and SB in a discipline, from their history. */
export function personalBests(history: MarkHistory[], athleteId: string, def: DisciplineDef, seasonFrom: string): { pb: number | null; sb: number | null } {
  const mine = history.filter((h) => h.athleteId === athleteId && h.discipline === def.key);
  return { pb: bestOf(mine.map((h) => h.value), def), sb: bestOf(mine.filter((h) => h.date >= seasonFrom).map((h) => h.value), def) };
}
