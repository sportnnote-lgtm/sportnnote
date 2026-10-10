/**
 * SD-96 — shooting rankings (ISSF), pure; imported by rank.ts.
 *
 * Qualification / match (GTR ties, as implemented):
 *   integer scoring: total → inner tens (X) → the last 10-shot series, then
 *     back series by series → shot by shot from the last shot (an inner ten
 *     beats a ten);
 *   decimal scoring (10 m air rifle): total → the last 10-shot series back →
 *     shot by shot back (decimal values) — no inner-ten count;
 *   3 positions: total → X → standing, kneeling, prone totals → series back;
 *   shotgun: hits → the last round of 25 back.
 *   A tie still standing shares the place (a medal place can be decided by a
 *   shoot-off — `decider`, the house rule for a match with no final).
 *
 * Elimination final (GTR finals, 10 m and 3P): finalists start from zero; at
 * each elimination point the lowest total (after that shot) is out, a tie for
 * it is decided by single-shot shoot-offs (decimal, not added to the total);
 * the last shot decides gold, a tie for gold is shot off. Eliminated finalists
 * take the places from the bottom up.
 */
import type { DisciplineDef, RankedEntry, ResultEntry, ResultFlag, ResultStatus } from './model.ts';
import { STATUS_ORDER } from './model.ts';
import { sharedPositions } from './positions.ts';
import { finalSchedule, fromTenths, positionOf, shootEventOf, sumTenths, tenths, type ShootEventDef } from './shootingDefs.ts';

/** An inner ten beats a plain ten shot by shot. */
const shotValue = (v: number | 'X'): number => (v === 'X' ? 10.5 : v);

/** The 10-shot series totals (25 m pistol: two series of 5 make one 10). */
function countbackBlocks(series: number[], ev: ShootEventDef): number[] {
  if (ev.seriesOf >= 10 || ev.scoring === 'hits') return series.map(tenths);
  const per = Math.max(1, Math.round(10 / ev.seriesOf));
  const out: number[] = [];
  for (let i = 0; i < series.length; i += per) out.push(series.slice(i, i + per).reduce((a, v) => a + tenths(v), 0));
  return out;
}

/** Comparison keys for a qualification / match result (bigger first). */
export function qualKeys(r: ResultEntry['result'], ev: ShootEventDef): (number | undefined)[] {
  const series = r.series ?? [];
  const total = r.mark != null ? tenths(r.mark) : sumTenths(series);
  const keys: (number | undefined)[] = [total];
  if (ev.scoring === 'integer') keys.push(r.xs ?? 0);
  if (ev.positions) {
    const shots = series.length * ev.seriesOf;
    const by = new Map<string, number>();
    series.forEach((v, i) => { const p = positionOf(ev, Math.max(shots, ev.shots), i); if (p) by.set(p, (by.get(p) ?? 0) + tenths(v)); });
    for (const p of ['S', 'K', 'P']) keys.push(by.get(p) ?? 0);
  }
  // fixed widths, so a decider appended after these keys lines up across rows
  const most = Math.max(ev.shots, ...ev.shotOptions);
  const B = Math.ceil(most / (ev.scoring === 'hits' ? ev.seriesOf : 10));
  const blocks: (number | undefined)[] = countbackBlocks(series, ev).reverse();
  while (blocks.length < B) blocks.push(undefined);
  keys.push(...blocks.slice(0, B));
  // shot by shot from the last shot — only when every series was entered shot by shot
  const shots = r.shots ?? [];
  const byShot: (number | undefined)[] = series.length && shots.length === series.length && shots.every((x) => x && x.length)
    ? shots.flat().map((v) => tenths(shotValue(v))).reverse() : [];
  while (byShot.length < most) byShot.push(undefined);
  keys.push(...byShot.slice(0, most));
  return keys;
}

/* ------------------------------ elimination final ------------------------------ */

export interface FinalElimination { id: string; after: number; place: number }
export interface FinalState {
  /** competing finalists */
  n: number;
  /** elimination points for this final (shot numbers) */
  schedule: number[];
  last: number;
  /** still in, by current total (best first) */
  alive: string[];
  /** out so far, in the order they went out */
  out: FinalElimination[];
  /** places for every finalist once known (eliminated ones as they go; all when done) */
  places: Map<string, { place: number; tie: boolean }>;
  /** the next shot the remaining finalists fire (1-based) */
  nextShot: number;
  /** a shoot-off needed at an elimination point (or for gold) */
  shootOff?: { after: number; ids: string[]; round: number };
  /** the next elimination point not yet reached */
  nextElim?: number;
  done: boolean;
  /** each finalist's total (tenths): to the shot they were eliminated at, else all shots */
  totals: Map<string, number>;
}

const competing = (e: ResultEntry) => !['DNS', 'WD', 'DQ'].includes(e.result?.status ?? 'ok');
const tot = (e: ResultEntry, upTo: number) => sumTenths((e.result.fshots ?? []).slice(0, upTo));

/**
 * Resolve a tie at an elimination point: `k` of `group` go out. Shoot-off shots
 * are `so[after][round]`; a round compares the shooters still tied. Returns the
 * eliminated ids worst first, or the shoot-off still to fire.
 */
function resolveShootOff(group: ResultEntry[], k: number, after: number): { out: string[] } | { pending: { ids: string[]; round: number } } {
  let remaining = [...group];
  let toOut = k;
  const out: string[] = [];
  let round = 0;
  while (toOut > 0) {
    if (remaining.length <= toOut) { out.push(...remaining.map((e) => e.id)); break; }
    const v = (e: ResultEntry) => e.result.so?.[String(after)]?.[round];
    if (remaining.some((e) => v(e) == null)) return { pending: { ids: remaining.map((e) => e.id), round: round + 1 } };
    const sorted = [...remaining].sort((a, b) => tenths(v(a)!) - tenths(v(b)!));
    const cut = tenths(v(sorted[toOut - 1])!);
    const below = sorted.filter((e) => tenths(v(e)!) < cut);
    const at = sorted.filter((e) => tenths(v(e)!) === cut);
    out.push(...below.map((e) => e.id));
    toOut -= below.length;
    if (at.length === toOut) { out.push(...at.map((e) => e.id)); toOut = 0; break; }
    remaining = at;
    round += 1;
  }
  return { out };
}

/** Where an elimination final stands (pure — from the finalists' shots). */
export function finalState(entries: ResultEntry[], ev: ShootEventDef): FinalState {
  const fin = ev.final ?? { finalists: 8, elims: [12, 14, 16, 18, 20, 22], last: 24, stage: '' };
  const field = entries.filter(competing);
  const n = field.length;
  const schedule = finalSchedule(fin, n);
  const last = fin.last;
  const places = new Map<string, { place: number; tie: boolean }>();
  const outList: FinalElimination[] = [];
  const totals = new Map<string, number>();
  let alive = [...field];
  let placeNext = n;
  let shootOff: FinalState['shootOff'];
  let stopped = false;
  let nextElim: number | undefined;
  const points = [...new Set(schedule)];
  for (const p of points) {
    const k = schedule.filter((x) => x === p).length;
    if (alive.some((e) => (e.result.fshots ?? []).length < p)) { nextElim = p; stopped = true; break; }
    const sorted = [...alive].sort((a, b) => tot(a, p) - tot(b, p));
    const cut = tot(sorted[k - 1], p);
    const below = sorted.filter((e) => tot(e, p) < cut);
    const at = sorted.filter((e) => tot(e, p) === cut);
    let outIds: string[];
    if (below.length + at.length <= k) outIds = [...below, ...at].map((e) => e.id);
    else {
      const res = resolveShootOff(at, k - below.length, p);
      if ('pending' in res) { shootOff = { after: p, ids: res.pending.ids, round: res.pending.round }; nextElim = p; stopped = true; break; }
      outIds = [...below.map((e) => e.id), ...res.out];
    }
    // worst first: the first out takes the lowest place; equal totals out together (no shoot-off between them) share
    const outRows = outIds.map((id) => alive.find((e) => e.id === id)!);
    const placeOf = new Map<string, number>();
    outRows.forEach((e, i) => placeOf.set(e.id, placeNext - i));
    for (let i = outRows.length - 1; i > 0; i--) {
      const a = outRows[i], b = outRows[i - 1];
      const soA = a.result.so?.[String(p)], soB = b.result.so?.[String(p)];
      if (tot(a, p) === tot(b, p) && !soA?.length && !soB?.length) placeOf.set(b.id, placeOf.get(a.id)!);
    }
    for (const e of outRows) {
      const place = placeOf.get(e.id)!;
      const tie = outRows.some((x) => x.id !== e.id && placeOf.get(x.id) === place);
      places.set(e.id, { place, tie });
      outList.push({ id: e.id, after: p, place });
      totals.set(e.id, tot(e, p));
    }
    placeNext -= outRows.length;
    alive = alive.filter((e) => !outIds.includes(e.id));
  }
  let done = false;
  if (!stopped && alive.length) {
    if (alive.every((e) => (e.result.fshots ?? []).length >= last)) {
      // the last shot: rank by total; a tie is shot off (one round decides, again if still level)
      const sorted = [...alive].sort((a, b) => tot(b, last) - tot(a, last));
      const order: string[] = [];
      let i = 0;
      while (i < sorted.length) {
        const group = sorted.filter((e) => tot(e, last) === tot(sorted[i], last));
        if (group.length === 1) { order.push(group[0].id); i += 1; continue; }
        // the group's order: eliminate the worst one by one by shoot-off
        const res = resolveShootOff(group, group.length - 1, last);
        if ('pending' in res) { shootOff = { after: last, ids: res.pending.ids, round: res.pending.round }; break; }
        // res.out = worst first; the one not out wins the shoot-off
        const best = group.find((e) => !res.out.includes(e.id))!;
        order.push(best.id, ...[...res.out].reverse());
        i += group.length;
      }
      if (!shootOff) {
        order.forEach((id, j) => places.set(id, { place: j + 1, tie: false }));
        done = true;
      }
      for (const e of alive) totals.set(e.id, tot(e, last));
    }
  }
  for (const e of alive) if (!totals.has(e.id)) totals.set(e.id, tot(e, (e.result.fshots ?? []).length));
  const aliveSorted = [...alive].sort((a, b) => (totals.get(b.id)! - totals.get(a.id)!));
  const fired = alive.length ? Math.min(...alive.map((e) => (e.result.fshots ?? []).length)) : last;
  return {
    n, schedule, last, alive: aliveSorted.map((e) => e.id), out: outList, places,
    nextShot: Math.min(last, fired + 1), shootOff, nextElim: done ? undefined : nextElim ?? (schedule.find((p) => p > fired) ?? last), done, totals,
  };
}

/** Is this a phase of finalists (elimination final rows carry `fshots`)? */
export const isFinalRows = (entries: ResultEntry[]): boolean => entries.some((e) => Array.isArray(e.result?.fshots));

/** Rank an elimination final: places by elimination, the rest live by total. */
export function rankShootFinal(entries: ResultEntry[], def: DisciplineDef): RankedEntry[] {
  const ev = shootEventOf(def.key)!;
  const st = finalState(entries, ev);
  const anyShot = entries.some((e) => (e.result.fshots ?? []).length > 0);
  const byId = new Map(entries.map((e) => [e.id, e]));
  const make = (e: ResultEntry, position: number | null, label: string, tie: boolean, status: ResultStatus, flags: ResultFlag[] = []): RankedEntry => {
    const t = st.totals.get(e.id);
    const best = status === 'ok' && anyShot && t != null ? fromTenths(t) : null;
    return { id: e.id, entry: e, position, label, tie, status, best, bestText: best != null ? best.toFixed(1) : '', legal: false, bestLegal: null, flags };
  };
  const out: RankedEntry[] = [];
  if (!anyShot) {
    for (const e of [...entries].filter(competing).sort((a, b) => (a.result.order ?? 99) - (b.result.order ?? 99))) out.push(make(e, null, '', false, 'ok'));
  } else {
    // the shooters still in, by current total (shared live places), then the eliminated
    const alive = st.alive.map((id) => byId.get(id)!).filter((e) => !st.places.has(e.id));
    const live = sharedPositions(alive, (a, b) => st.totals.get(a.id) === st.totals.get(b.id));
    const so = new Set(st.shootOff?.ids ?? []);
    alive.forEach((e, i) => out.push(make(e, live[i].position, `${live[i].tie ? '=' : ''}${live[i].position}`, live[i].tie, 'ok', so.has(e.id) ? ['SO'] : [])));
    const placed = [...st.places].map(([id, p]) => ({ e: byId.get(id)!, ...p })).sort((a, b) => a.place - b.place);
    for (const p of placed) out.push(make(p.e, p.place, `${p.tie ? '=' : ''}${p.place}`, p.tie, 'ok', so.has(p.e.id) ? ['SO'] : []));
    out.sort((a, b) => (a.position ?? 99) - (b.position ?? 99));
  }
  const unranked = entries.filter((e) => !competing(e)).sort((a, b) => STATUS_ORDER[(a.result.status ?? 'ok') as ResultStatus] - STATUS_ORDER[(b.result.status ?? 'ok') as ResultStatus]);
  for (const e of unranked) out.push(make(e, null, e.result.status ?? '', false, (e.result.status ?? 'ok') as ResultStatus));
  return out;
}

/** The match's full length for a shooting event (the category's shorter match, or the standard). */
export const matchShots = (ev: ShootEventDef, shots?: number): number => shots ?? ev.shots;
