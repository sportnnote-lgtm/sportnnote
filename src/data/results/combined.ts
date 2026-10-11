/**
 * SD-93 — athletics combined events (decathlon, heptathlon, indoor pentathlon
 * / heptathlon, school pentathlon / tetrathlon) on the results engine. Pure.
 *
 * Model: one combined event = one `eventKey` whose phases are its events in
 * order (phase n = event n, `PhaseFormat.combined.index` = n − 1). Each phase
 * is an ordinary track / field phase — heats and lanes, 3 trials, the bar —
 * so the existing entry screen runs it; this file scores it and keeps the
 * running total.
 *
 * Rules (World Athletics TR 39 — sub-rule numbers from memory, verify):
 *  - 3 trials only in the horizontal jumps and throws; the HJ bar goes up 3 cm
 *    and the PV bar 10 cm throughout (TR 39.8);
 *  - one false start per race is allowed: it is charged to the race (warning)
 *    and anyone responsible for a further false start in that race is
 *    disqualified (TR 39.8.3 / TR 16.8);
 *  - an athlete who fails to start, or to make a trial, in an event may not
 *    take part in the later events and is out of the final classification
 *    ("abandoned" — TR 39.10). A DNF, a no-mark or a DQ in an event scores 0
 *    for it, and the athlete carries on;
 *  - ties on total: the athlete with more points than the other(s) in more
 *    events is ahead; still level → the higher score in any single event,
 *    then the next-best event … (TR 39.12); still level → a shared place.
 *  - Heats / groups: athletes with similar totals together, the leaders in
 *    the last heat (TR 39 — heats arranged by performance, the last event's
 *    final heat holds the leaders).
 *  - Records on the total (CR 31, from memory): fully automatic timing (or a
 *    hand-timed meet), and either no wind-measured event over +4.0 m/s or an
 *    average wind over those events of no more than +2.0 m/s.
 */
import type { Category, DisciplineDef, PhaseFormat, RankedEntry, ResultEntry, ResultStatus } from './model.ts';
import { disciplineOf, phaseDiscipline, looseLegal } from './model.ts';
import { performanceOf } from './rank.ts';
import { formatMark } from './marks.ts';
import { sharedPositions } from './positions.ts';
import { DEFAULT_EVENT_POINTS, type Award, type PointsConfig } from './medals.ts';
import { laneOrder, type Seeded } from './progression.ts';
import { barPlan, defaultBar } from './field.ts';
import { phaseLines, markKey, type PhaseLine } from './athletics.ts';
import { combinedPoints, combinedEventOf, shortName, type CombinedFormat } from './combinedDefs.ts';

export * from './combinedDefs.ts';

/** Is this phase one event of a combined event? */
export const isCombinedPhase = (f?: Pick<PhaseFormat, 'combined'> | null): f is Pick<PhaseFormat, 'combined'> & { combined: CombinedFormat } => !!f?.combined;

/** "3. Shot put" — the phase name of a combined event's event. */
export const combinedPhaseName = (f: Pick<PhaseFormat, 'discipline' | 'combined'>): string =>
  `${(f.combined?.index ?? 0) + 1}. ${disciplineOf(f.discipline)?.label ?? shortName(f.discipline)}`;

/** Day 1 / Day 2 of a two-day event ('' for a one-day event). */
export const combinedDay = (c: Pick<CombinedFormat, 'day2'>, index: number): string => (c.day2 == null ? '' : index < c.day2 ? 'Day 1' : 'Day 2');

/* ----------------------------- one event's score ----------------------------- */

export type CellState = 'ok' | 'zero' | 'out' | 'pending';

export interface CombinedCell {
  index: number;
  discipline: string;
  entryId: string;
  /** the points for this event (0 for a DNF / NM / DQ / no result yet) */
  points: number;
  /** ok = scored · zero = DNF / NM / DQ / FS (0, carries on) · out = DNS / WD (abandoned, TR 39.10) · pending = nothing yet */
  state: CellState;
  status: ResultStatus;
  /** "11.02", "6.45", "1.85", "4:35.10h", "NM" */
  text: string;
  wind?: number;
  hand?: boolean;
  /** a wind-measured event with no reading at a fully equipped meet (not record-legal) */
  windMissing?: boolean;
  /** a hand time at a fully timed meet (not record-legal) */
  handIllegal?: boolean;
}

/** One athlete's result in one event of a combined event. */
export function cellOf(e: ResultEntry, f: PhaseFormat): CombinedCell {
  const c = f.combined!;
  const base = disciplineOf(f.discipline);
  const def = base ? phaseDiscipline(base, f) : undefined;
  const index = c.index;
  const shell = { index, discipline: f.discipline, entryId: e.id };
  if (!def) return { ...shell, points: 0, state: 'pending', status: 'ok', text: '' };
  const loose = looseLegal(f);
  const p = performanceOf(e, def, undefined, loose);
  const r = e.result ?? {};
  if (p.status === 'DNS' || p.status === 'WD') return { ...shell, points: 0, state: 'out', status: p.status, text: p.status };
  if (p.status !== 'ok') return { ...shell, points: 0, state: 'zero', status: p.status, text: p.status };
  if (p.best == null) return { ...shell, points: 0, state: 'pending', status: 'ok', text: '' };
  const hand = def.capture === 'single' && !!r.hand;
  const wind = def.wind === 'race' ? r.wind : def.wind === 'attempt' ? p.wind : undefined;
  return {
    ...shell, points: combinedPoints(def.key, c.table, p.best, { hand }), state: 'ok', status: 'ok',
    text: formatMark(p.best, def) + (hand ? 'h' : ''),
    ...(wind != null ? { wind } : {}), ...(hand ? { hand } : {}),
    ...(def.wind && wind == null && !loose ? { windMissing: true } : {}),
    ...(hand && !loose ? { handIllegal: true } : {}),
  };
}

/** Points per entry id for one phase (the live points column). */
export function phasePoints(entries: ResultEntry[], f: PhaseFormat): Map<string, CombinedCell> {
  return new Map(entries.map((e) => [e.id, cellOf(e, f)]));
}

/* --------------------------------- standings --------------------------------- */

export interface CombinedPhaseInput { id?: string; format: PhaseFormat; status: string; entries: ResultEntry[]; date?: string }

export interface CombinedRow {
  athleteId: string;
  name: string;
  team?: { id?: string; name: string; colorHex?: string };
  /** one cell per event (undefined = not reached / not entered) */
  cells: (CombinedCell | undefined)[];
  total: number;
  /** events with a result (scored or 0) */
  done: number;
  /** abandoned (DNS / WD in an event — TR 39.10): not classified */
  out: boolean;
  outAt?: number;
  /** every event has a result and the athlete didn't abandon */
  complete: boolean;
  position: number | null;
  /** "1", "=3", "DNF" (abandoned), "" (no result yet) */
  label: string;
  tie: boolean;
  /** level on points with a neighbour but placed by TR 39.12 */
  tieBreak?: 'events' | 'best';
  /** the total may count for records / PBs (complete, timing + wind conditions) */
  legal: boolean;
}

/** The events of a combined event from any of its phases. */
export const eventsOf = (phases: CombinedPhaseInput[]): string[] => phases.find((p) => p.format.combined)?.format.combined?.events ?? [];

const pts = (r: CombinedRow, i: number) => r.cells[i]?.points ?? 0;

/** CR 31 (from memory): all wind-measured events ≤ +4.0 m/s, or their average ≤ +2.0 m/s; automatic timing. */
export function combinedWindLegal(cells: (CombinedCell | undefined)[]): boolean {
  const list = cells.filter((c): c is CombinedCell => !!c);
  if (list.some((c) => c.handIllegal || c.windMissing)) return false;
  const winds = list.filter((c) => c.wind != null).map((c) => c.wind!);
  if (!winds.length) return true;
  if (winds.every((w) => w <= 4.0 + 1e-9)) return true;
  return winds.reduce((a, b) => a + b, 0) / winds.length <= 2.0 + 1e-9;
}

/**
 * The standings over the events entered so far: total points, the TR 39.12
 * tie-break, abandoned athletes (TR 39.10) listed last as DNF. `final` = the
 * event is over: an event with nothing entered for an athlete counts 0.
 */
export function combinedStandings(phases: CombinedPhaseInput[], o: { final?: boolean } = {}): CombinedRow[] {
  const events = eventsOf(phases);
  const n = events.length;
  const byAthlete = new Map<string, CombinedRow>();
  const sorted = [...phases].filter((p) => p.format.combined).sort((a, b) => a.format.combined!.index - b.format.combined!.index);
  for (const p of sorted) {
    for (const e of p.entries) {
      if (!e.athleteId) continue;
      const row = byAthlete.get(e.athleteId) ?? { athleteId: e.athleteId, name: e.name, team: e.team, cells: Array.from({ length: n }, () => undefined), total: 0, done: 0, out: false, complete: false, position: null, label: '', tie: false, legal: false };
      row.name = e.name || row.name;
      if (e.team?.name) row.team = e.team;
      row.cells[p.format.combined!.index] = cellOf(e, p.format);
      byAthlete.set(e.athleteId, row);
    }
  }
  const rows = [...byAthlete.values()];
  for (const r of rows) {
    r.total = r.cells.reduce((s, c) => s + (c?.points ?? 0), 0);
    r.done = r.cells.filter((c) => c && (c.state === 'ok' || c.state === 'zero')).length;
    const outAt = r.cells.findIndex((c) => c?.state === 'out');
    r.out = outAt >= 0;
    if (r.out) r.outAt = outAt;
    r.complete = !r.out && n > 0 && r.cells.every((c) => !!c && (c.state !== 'pending' || !!o.final));
    r.legal = r.complete && combinedWindLegal(r.cells);
  }
  const active = rows.filter((r) => !r.out && r.done > 0);
  // TR 39.12 within each group level on points
  const score = new Map<string, number>();
  const groups = new Map<number, CombinedRow[]>();
  for (const r of active) groups.set(r.total, [...(groups.get(r.total) ?? []), r]);
  for (const g of groups.values()) {
    for (const a of g) {
      let s = 0;
      for (const b of g) if (b !== a) for (let i = 0; i < n; i++) if (pts(a, i) > pts(b, i)) s++;
      score.set(a.athleteId, s);
    }
  }
  const desc = (r: CombinedRow) => r.cells.map((c) => c?.points ?? 0).sort((x, y) => y - x);
  const lex = (a: CombinedRow, b: CombinedRow) => { const x = desc(a), y = desc(b); for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (y[i] ?? 0) - (x[i] ?? 0); return 0; };
  const cmp = (a: CombinedRow, b: CombinedRow) => b.total - a.total || (score.get(b.athleteId)! - score.get(a.athleteId)!) || lex(a, b);
  active.sort((a, b) => cmp(a, b) || a.name.localeCompare(b.name));
  sharedPositions(active, (a, b) => cmp(a, b) === 0).forEach((x, i) => {
    const r = active[i];
    r.position = x.position; r.tie = x.tie; r.label = `${x.tie ? '=' : ''}${x.position}`;
    const level = active.filter((y) => y !== r && y.total === r.total);
    if (level.length && !x.tie) r.tieBreak = level.some((y) => score.get(y.athleteId) !== score.get(r.athleteId)) ? 'events' : 'best';
  });
  const waiting = rows.filter((r) => !r.out && r.done === 0).sort((a, b) => a.name.localeCompare(b.name));
  const out = rows.filter((r) => r.out).sort((a, b) => (b.outAt ?? 0) - (a.outAt ?? 0) || b.total - a.total || a.name.localeCompare(b.name));
  for (const r of out) r.label = 'DNF';
  return [...active, ...waiting, ...out];
}

/** The standings as ranked rows of the combined discipline (records / PB / SB flags). */
export function combinedRanked(rows: CombinedRow[], key: string): RankedEntry[] {
  const def = disciplineOf(key);
  return rows.map((r): RankedEntry => {
    const last = [...r.cells].reverse().find((c) => !!c);
    return {
      id: last?.entryId ?? r.athleteId,
      entry: { id: last?.entryId ?? r.athleteId, athleteId: r.athleteId, name: r.name, team: r.team, heat: 1, result: {} },
      position: r.position, label: r.label, tie: r.tie, status: r.out ? 'DNF' : 'ok',
      best: r.out ? null : r.total, bestText: r.out ? '' : `${r.total}`, legal: r.legal,
      bestLegal: r.complete && r.legal && def ? r.total : null, flags: [],
    };
  });
}

/** Medals and position points once the last event is over (abandoned athletes get none). */
export function combinedAwards(rows: CombinedRow[], cfg: PointsConfig = {}): Award[] {
  const table = cfg.positionPoints?.length ? cfg.positionPoints : DEFAULT_EVENT_POINTS;
  const ranked = rows.filter((r) => r.position != null && !r.out);
  const MED = ['gold', 'silver', 'bronze'] as const;
  return ranked.map((r) => {
    const pos = r.position!;
    const group = ranked.filter((x) => x.position === pos).length;
    let points = table[pos - 1] ?? 0;
    if (group > 1 && (cfg.ties ?? 'share') === 'share') {
      let sum = 0;
      for (let i = 0; i < group; i++) sum += table[pos - 1 + i] ?? 0;
      points = Math.round((sum / group) * 100) / 100;
    }
    const last = [...r.cells].reverse().find((c) => !!c);
    return { entryId: last?.entryId ?? r.athleteId, name: r.name, team: r.team, position: pos, medal: MED[pos - 1], points };
  });
}

/** Is the whole combined event over (its last event locked)? */
export function combinedDone(phases: CombinedPhaseInput[]): boolean {
  const n = eventsOf(phases).length;
  return n > 0 && phases.some((p) => p.format.combined?.index === n - 1 && p.status === 'completed');
}

/* ------------------------------- the next event ------------------------------- */

/** The athletes who go on to the next event: everyone who didn't abandon (TR 39.10). */
export function continuing(entries: ResultEntry[], f: PhaseFormat): ResultEntry[] {
  return entries.filter((e) => cellOf(e, f).state !== 'out');
}

/**
 * Heats / groups for an event: athletes with similar totals together, the
 * leaders in the LAST heat (lowest totals first); in a heat the leader gets
 * the best lane. Track: heats of up to the lane count (16 without lanes);
 * field: one group, two over 20 athletes (order: leader last).
 */
export function combinedSeed(rows: { id: string; total: number }[], def: DisciplineDef): Seeded[] {
  const list = [...rows].map((r, i) => ({ ...r, i })).sort((a, b) => a.total - b.total || b.i - a.i);
  const track = def.capture === 'single';
  const cap = track ? def.lanes ?? 16 : 20;
  const heats = Math.max(1, Math.ceil(list.length / cap));
  const base = Math.floor(list.length / heats), extra = list.length % heats;
  const out: Seeded[] = [];
  let k = 0;
  for (let h = 0; h < heats; h++) {
    // later heats take the remainder (the leaders' heat is never the short one)
    const size = base + (h >= heats - extra ? 1 : 0);
    const group = list.slice(k, k + size);
    k += size;
    if (track && def.lanes) {
      const lanes = laneOrder(Math.max(def.lanes, group.length), undefined, def.key);
      // best total first → the centre lanes
      [...group].reverse().forEach((g, i) => out.push({ id: g.id, heat: h + 1, lane: lanes[i], order: i + 1 }));
    } else {
      // no lanes / field order: the leader runs / jumps / throws last
      group.forEach((g, i) => out.push({ id: g.id, heat: h + 1, order: i + 1 }));
    }
  }
  return out;
}

/** HJ / PV bar for a combined event: uniform raises, 3 cm HJ / 10 cm PV (TR 39.8). */
export function combinedBar(discipline: string, cat: Category): number[] | undefined {
  if (discipline !== 'ath.hj' && discipline !== 'ath.pv') return undefined;
  const pv = discipline === 'ath.pv';
  const start = defaultBar({ key: discipline }, cat).start;
  return barPlan(start, pv ? 0.1 : 0.03, undefined, undefined, pv ? 16 : 24);
}

/** The next event's phase format (null after the last event). */
export function nextCombinedFormat(f: PhaseFormat, heats: number): PhaseFormat | null {
  const c = f.combined;
  if (!c || c.index >= c.events.length - 1) return null;
  const index = c.index + 1;
  const discipline = c.events[index];
  const bar = combinedBar(discipline, f.category ?? {});
  const implement = c.implements?.[discipline];
  return {
    ...f, discipline, phase: 'final', phaseNo: f.phaseNo + 1, heats, progression: undefined,
    bar, implement, jumpOff: undefined, recordsBefore: undefined, board: undefined,
    combined: { ...c, index, fsWarned: undefined },
  };
}

/* --------------------------------- false starts --------------------------------- */

/** TR 39.8.3 (from memory): the first false start in a race is charged to the
 *  race (warning); anyone responsible for a further one is disqualified. */
export const falseStartAction = (c: Pick<CombinedFormat, 'fsWarned'>, heat: number): 'warn' | 'dq' => ((c.fsWarned ?? []).includes(heat) ? 'dq' : 'warn');

/* ---------------------------------- stat lines ---------------------------------- */

/**
 * One event's stat lines: the athlete's mark (and its legal key — individual
 * PBs ARE credited from combined events), races / field, DNF / DQ, plus the
 * combined points (`cePts`) and `ceEvent`. No place, no medal, no position
 * points — those come from the total.
 */
export function combinedEventLines(f: PhaseFormat, ranked: RankedEntry[]): PhaseLine[] {
  const pts = phasePoints(ranked.map((r) => r.entry), f);
  const lines = phaseLines({ ...f, phase: 'heat' }, ranked.map((r) => ({ ...r, position: null, flags: [] })));
  const byAthlete = new Map(ranked.filter((r) => r.entry.athleteId).map((r) => [r.entry.athleteId!, pts.get(r.id)]));
  return lines.map((l) => {
    const c = byAthlete.get(l.playerId);
    return { ...l, stats: { ...l.stats, ceEvent: 1, ...(c && c.points > 0 ? { cePts: c.points } : {}) }, won: false };
  });
}

/**
 * The total's stat lines (written when the last event is locked): `combined`,
 * place, the total as `mark`, the legal total under `m_ce_<kind>` (PBs and
 * the career best), medals and position points; abandoned athletes `dnf`.
 */
export function combinedLines(f: PhaseFormat, rows: CombinedRow[], awards: Award[] = []): PhaseLine[] {
  const key = f.combined?.key;
  if (!key) return [];
  const mk = markKey(key);
  const byAthlete = new Map<string, Award>();
  for (const a of awards) { const r = rows.find((x) => x.cells.some((c) => c?.entryId === a.entryId)); if (r) byAthlete.set(r.athleteId, a); }
  return rows.filter((r) => r.done > 0 || r.out).map((r) => {
    const s: Record<string, number> = { combined: 1 };
    if (r.out) s.dnf = 1;
    else {
      if (r.position != null) s.place = r.position;
      s.mark = r.total;
      if (r.complete && r.legal) s[mk] = r.total;
    }
    const a = byAthlete.get(r.athleteId);
    if (a?.medal === 'gold') s.golds = 1; else if (a?.medal === 'silver') s.silvers = 1; else if (a?.medal === 'bronze') s.bronzes = 1;
    if (a && a.points > 0) s.posPoints = a.points;
    return { playerId: r.athleteId, stats: s, won: a?.medal === 'gold' };
  });
}

/* ------------------------------------ text ------------------------------------ */

/** The rules line under the event's title. */
export function combinedHeader(f: Pick<PhaseFormat, 'discipline' | 'combined'>, def: DisciplineDef): string {
  const c = f.combined!;
  const name = combinedEventOf(c.key)?.label ?? 'Combined event';
  const day = combinedDay(c, c.index);
  const rule = def.capture === 'attempts' ? '3 trials each (TR 39.8)'
    : def.capture === 'heights' ? `bar up ${def.key === 'ath.pv' ? '10' : '3'} cm each time (TR 39.8)`
      : 'one false start per race — the next one disqualifies (TR 39.8.3)';
  return `${name} · event ${c.index + 1} of ${c.events.length}${day ? ` · ${day}` : ''} · ${c.table === 'M' ? 'men’s' : 'women’s'} scoring tables · ${rule} · DNS = out of the competition (TR 39.10); DNF / NM / DQ score 0 and carry on`;
}

/** "1. Arjun 4012 · 2. …" share text for the standings. */
export function combinedText(title: string, rows: CombinedRow[], events: string[], final: boolean, link?: string): string {
  const out = [`🏅 ${final ? 'RESULTS' : 'STANDINGS'} · ${title}`];
  const done = Math.max(0, ...rows.map((r) => r.cells.filter(Boolean).length));
  if (!final && done) out.push(`after ${done} of ${events.length} events`);
  for (const r of rows) {
    if (!r.done && !r.out) continue;
    out.push(`${r.label ? `${r.label}. ` : ''}${r.name}${r.team?.name ? ` (${r.team.name})` : ''} ${r.out ? `DNF (no ${shortName(events[r.outAt ?? 0])})` : `${r.total} pts`}`);
  }
  if (link) out.push('', `Full results: ${link}`);
  return out.join('\n');
}

/** "11.02 (892) · 6.45 (698) · …" — an athlete's marks and points so far. */
export function cellsText(r: CombinedRow, events: string[]): string {
  return r.cells.map((c, i) => (c && c.state !== 'pending' ? `${shortName(events[i])} ${c.text}${c.state === 'ok' ? ` (${c.points})` : ''}` : '')).filter(Boolean).join(' · ');
}

