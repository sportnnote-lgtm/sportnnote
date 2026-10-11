/**
 * SD-98 — cycling rankings (UCI), pure; imported by rank.ts (no import of
 * rank.ts, so no cycle).
 *
 *  - Road race (mass start): the order on the line. Times: riders finishing in
 *    a group are credited with the group's time ("s.t."); a gap of one second
 *    or more between consecutive riders starts a new group with its own time
 *    (UCI Reg. 2.3.039 as remembered — the one-second rule; verify).
 *  - Stage race: each stage's own result (road: the order on the line; time
 *    trial: the time), and the general classification (GC) by cumulative time
 *    in whole seconds minus time bonuses. Equal GC times (UCI 2.6.015 as
 *    remembered): the hundredths dropped from the time-trial stages are added
 *    back, then the sum of stage places, then the place on the last stage.
 *  - Points race: 5-3-2-1 at each intermediate sprint, double (10-6-4-2) at the
 *    finish; +20 for a lap gained on the main field, −20 for a lap lost; equal
 *    points → the order in the final sprint (UCI Part 3, points race).
 *  - Scratch race: laps gained first, then the order on the line.
 *  - Keirin / elimination: the order on the line (an elimination race's order
 *    is built from the back — the last rider every two laps is out).
 *  - Sprint match play: the archery bracket (archeryBracket.ts) with a best-of-
 *    three (or one-heat) match: first to 2 heats wins.
 */
import type { ArchSide, CycGc, DisciplineDef, RankedEntry, ResultEntry, ResultFlag, ResultStatus } from './model.ts';
import { STATUS_ORDER } from './model.ts';
import { compareKeys, sharedPositions } from './positions.ts';
import { formatMark } from './marks.ts';
import { cycKind, sprintPoints, LAP_POINTS, SPRINT_POINTS } from './cyclingDefs.ts';
import { isBracketRows, rankArcheryBracket, type MatchFn, type MatchOutcome } from './archeryBracket.ts';

const ok = (e: ResultEntry) => (e.result?.status ?? 'ok') === 'ok';
const TIME0 = { unit: 'time' as const, dp: 0 };

/** "+0:12", "+1:05:03" — a gap behind the leader (whole seconds). */
export const gapText = (secs: number): string => (secs <= 0 ? 's.t.' : `+${formatMark(secs, TIME0).replace(/^(\d+)$/, (x) => `0:${x.padStart(2, '0')}`)}`);
/** whole seconds as h:mm:ss / m:ss */
export const secsText = (secs: number): string => { const t = formatMark(secs, TIME0); return /^\d+$/.test(t) ? `0:${t.padStart(2, '0')}` : t; };

/* -------------------------------- road times -------------------------------- */

export interface RoadTime {
  /** the credited time (whole seconds), undefined while no time is known */
  time?: number;
  /** the time as entered for this rider (absent = same time as the rider ahead) */
  raw?: number;
  /** credited with the group's time (s.t.) */
  st: boolean;
  /** seconds behind the winner */
  gap?: number;
}

/**
 * Credited road-race times from the order on the line: the first rider's time
 * as entered; each next rider gets the time entered for them only when it is
 * at least 1 s after the rider ahead (a new group) — otherwise, or with no
 * time entered, the time of the rider ahead ("same time").
 */
export function roadTimes(entries: ResultEntry[]): Map<string, RoadTime> {
  const out = new Map<string, RoadTime>();
  const line = entries.filter((e) => ok(e) && e.result?.fin != null).sort((a, b) => a.result.fin! - b.result.fin!);
  let prevRaw: number | undefined, prevTime: number | undefined, lead: number | undefined;
  for (const e of line) {
    const raw = e.result.mark != null ? Math.floor(e.result.mark) : undefined;
    let time: number | undefined, st = false;
    if (raw != null && (prevRaw == null || raw - prevRaw >= 1)) time = raw;
    else if (prevTime != null) { time = prevTime; st = true; }
    if (lead == null && time != null) lead = time;
    out.set(e.id, { time, raw, st, gap: time != null && lead != null ? time - lead : undefined });
    if (raw != null && (prevRaw == null || raw > prevRaw)) prevRaw = raw;
    if (time != null) prevTime = time;
  }
  return out;
}

/* ------------------------------- points race -------------------------------- */

export interface PointsTotal { total: number; sprints: number; finish: number; laps: number }

/** A points-race rider's total: intermediate sprints + the final sprint (double) + 20 per lap gained (−20 per lap lost). */
export function pointsTotal(r: ResultEntry['result']): PointsTotal {
  const sprints = Object.values(r?.spr ?? {}).reduce((s, p) => s + sprintPoints(p, 1, 2), 0);
  const finish = r?.fin != null ? (SPRINT_POINTS[r.fin - 1] ?? 0) * 2 : 0;
  const laps = (r?.laps ?? 0) * LAP_POINTS;
  return { total: sprints + finish + laps, sprints, finish, laps };
}

/** Has anything been entered in this race (a sprint place, a lap, a finish place)? */
const raceStarted = (entries: ResultEntry[]) => entries.some((e) => e.result?.fin != null || !!Object.keys(e.result?.spr ?? {}).length || !!e.result?.laps);

/* -------------------------------- stage race -------------------------------- */

/** Is this stage a road stage (finish order) — else a time trial (times)? */
export const isRoadStage = (entries: ResultEntry[]): boolean => entries.some((e) => e.result?.fin != null) || !entries.some((e) => e.result?.mark != null);

export interface StageTime { id: string; secs: number; frac: number; place?: number }

/** Each rider's time on this stage (whole seconds + the dropped fraction of an ITT time) and stage place. */
export function stageTimes(entries: ResultEntry[]): Map<string, StageTime> {
  const out = new Map<string, StageTime>();
  if (isRoadStage(entries)) {
    const rt = roadTimes(entries);
    const anyTime = [...rt.values()].some((t) => t.time != null);
    for (const e of entries) {
      const t = rt.get(e.id);
      if (!t) continue;
      if (t.time == null && anyTime) continue;
      out.set(e.id, { id: e.id, secs: t.time ?? 0, frac: 0, place: e.result.fin });
    }
    return out;
  }
  const timed = entries.filter((e) => ok(e) && e.result?.mark != null).sort((a, b) => (a.result.thousandths ?? a.result.mark!) - (b.result.thousandths ?? b.result.mark!));
  const places = sharedPositions(timed, (a, b) => (a.result.thousandths ?? a.result.mark) === (b.result.thousandths ?? b.result.mark));
  timed.forEach((e, i) => {
    const v = e.result.mark!;
    out.set(e.id, { id: e.id, secs: Math.floor(v), frac: Math.round((v - Math.floor(v)) * 1000) / 1000, place: places[i].position });
  });
  return out;
}

/** The GC after this stage for one rider (null = not classified yet). */
export function gcAfter(e: ResultEntry, st: StageTime | undefined): CycGc | null {
  if (!st || !ok(e)) return null;
  const g = e.result.gc;
  return {
    time: (g?.time ?? 0) + st.secs - (e.result.bonus ?? 0),
    frac: Math.round(((g?.frac ?? 0) + st.frac) * 1000) / 1000,
    places: (g?.places ?? 0) + (st.place ?? 0),
    pts: (g?.pts ?? 0) + (e.result.pts ?? 0),
    kom: (g?.kom ?? 0) + (e.result.kom ?? 0),
    stages: (g?.stages ?? 0) + 1,
    wins: (g?.wins ?? 0) + (st.place === 1 ? 1 : 0),
  };
}

/* ------------------------------ sprint matches ------------------------------ */

/** The heats per match of a sprint bracket (stored on its rows; best of three by default). */
export const sprintBo = (entries: ResultEntry[]): 1 | 3 => (entries.find((e) => e.result?.bo != null)?.result.bo === 1 ? 1 : 3);

/** A sprint match: best of `bo` heats (first to 2 of 3), a walkover when a rider doesn't start. */
export function sprintMatch(bo: 1 | 3 = 3): MatchFn {
  return (A?: ArchSide, B?: ArchSide, okA = true, okB = true): MatchOutcome => {
    const base: MatchOutcome = { ends: [], a: 0, b: 0, ta: 0, tb: 0, shootOff: false, done: false };
    okA = okA && !A?.wo; okB = okB && !B?.wo;
    if (!okA || !okB) return { ...base, done: true, walkover: true, ...(okA ? { winner: 'a' as const } : okB ? { winner: 'b' as const } : {}) };
    const need = bo === 1 ? 1 : 2;
    const n = Math.min(A?.heats?.length ?? 0, B?.heats?.length ?? 0);
    const o = { ...base };
    for (let k = 0; k < n; k++) {
      const wa = A!.heats![k] === 1 ? 1 : 0;
      const wb = wa ? 0 : 1;
      o.ends.push({ a: wa, b: wb, pa: wa, pb: wb });
      o.a += wa; o.b += wb;
      if (o.a >= need || o.b >= need) break;
    }
    o.ta = o.a; o.tb = o.b;
    if (o.a >= need) return { ...o, winner: 'a', done: true };
    if (o.b >= need) return { ...o, winner: 'b', done: true };
    return { ...o, nextEnd: o.ends.length + 1 };
  };
}

/* --------------------------------- ranking ---------------------------------- */

/** Rows a cycling ranking handles itself: an order event, or a sprint bracket. */
export const isCyclingRanked = (entries: ResultEntry[], def: DisciplineDef): boolean => def.sport === 'cycling' && (def.capture === 'order' || isBracketRows(entries));

/**
 * Rank a cycling heat / race: a sprint bracket by its matches; order events by
 * the order on the line (points race by points, a stage race by GC). Ranked
 * rows first (shared places when the rules can't separate them), then riders
 * still without a result, then DNF, OTL, DQ, DNS.
 */
export function rankCycling(entries: ResultEntry[], def: DisciplineDef, o: { tiePrefix?: string } = {}): RankedEntry[] {
  if (isBracketRows(entries)) return rankArcheryBracket(entries, def, sprintMatch(sprintBo(entries)));
  const kind = cycKind(def.key);
  const prefix = o.tiePrefix ?? '=';
  type Row = { e: ResultEntry; keys: (number | undefined)[]; best: number | null; text: string; ranked: boolean };
  const rows: Row[] = [];
  if (kind === 'stage') {
    const times = stageTimes(entries);
    for (const e of entries) {
      const st = times.get(e.id);
      const g = gcAfter(e, st);
      rows.push({ e, keys: g ? [-g.time, -g.frac, -g.places, -(st?.place ?? 999)] : [], best: g?.time ?? null, text: '', ranked: !!g });
    }
  } else if (kind === 'points') {
    const started = raceStarted(entries);
    for (const e of entries) {
      const t = pointsTotal(e.result);
      rows.push({ e, keys: [t.total, -(e.result?.fin ?? 9999)], best: t.total, text: `${t.total} pts`, ranked: ok(e) && started });
    }
  } else {
    const rt = kind === 'rr' ? roadTimes(entries) : null;
    for (const e of entries) {
      const fin = e.result?.fin;
      const t = rt?.get(e.id);
      const laps = kind === 'scratch' ? e.result?.laps ?? 0 : 0;
      const text = t?.time != null ? (t.gap ? gapText(t.gap) : t.st ? 's.t.' : secsText(t.time)) : laps ? `${laps > 0 ? '+' : ''}${laps} lap${Math.abs(laps) === 1 ? '' : 's'}` : '';
      rows.push({ e, keys: [laps, fin != null ? -fin : undefined], best: t?.time ?? null, text, ranked: ok(e) && fin != null });
    }
  }
  const ranked = rows.filter((r) => r.ranked).sort((a, b) => compareKeys(a.keys, b.keys) || (a.e.result?.order ?? 99) - (b.e.result?.order ?? 99) || a.e.name.localeCompare(b.e.name));
  const places = kind === 'elim'
    // an elimination race's places are fixed as riders go out (from the back), not by count
    ? ranked.map((r) => ({ position: r.e.result.fin!, tie: false }))
    : sharedPositions(ranked, (a, b) => compareKeys(a.keys, b.keys) === 0);
  // GC: the leader's time, everyone else's gap behind ("s.t." when level)
  if (kind === 'stage' && ranked.length) ranked.forEach((r, i) => { r.text = i === 0 ? secsText(r.best!) : gapText(r.best! - ranked[0].best!); });
  const make = (r: Row, position: number | null, label: string, tie: boolean, status: ResultStatus): RankedEntry => ({
    id: r.e.id, entry: r.e, position, label, tie, status, best: r.best, bestText: r.text, legal: false, bestLegal: null, flags: [] as ResultFlag[],
  });
  const out: RankedEntry[] = ranked.map((r, i) => make(r, places[i].position, `${places[i].tie ? prefix : ''}${places[i].position}`, places[i].tie, 'ok'));
  const startOrder = (r: Row) => r.e.result?.order ?? 999;
  for (const r of rows.filter((x) => !x.ranked && ok(x.e)).sort((a, b) => startOrder(a) - startOrder(b))) out.push(make(r, null, '', false, 'ok'));
  const st = (r: Row) => (r.e.result?.status ?? 'ok') as ResultStatus;
  for (const r of rows.filter((x) => !ok(x.e)).sort((a, b) => STATUS_ORDER[st(a)] - STATUS_ORDER[st(b)] || startOrder(a) - startOrder(b))) out.push(make(r, null, st(r), false, st(r)));
  return out;
}

/**
 * A stage's own result (not the GC): road — the order on the line with the
 * group times; time trial — the times, fastest first.
 */
export function rankStage(entries: ResultEntry[]): RankedEntry[] {
  const times = stageTimes(entries);
  const road = isRoadStage(entries);
  const rt = road ? roadTimes(entries) : null;
  const lead = Math.min(...[...times.values()].map((t) => t.secs + t.frac));
  const rows = entries.map((e) => {
    const t = times.get(e.id);
    const r = rt?.get(e.id);
    const v = t ? t.secs + t.frac : null;
    const text = !t ? '' : road
      ? (r?.time == null ? '' : r.gap ? gapText(r.gap) : r.st ? 's.t.' : secsText(r.time))
      : v === lead ? formatMark(v, { unit: 'time', dp: 2 }) : `+${formatMark(Math.round((v! - lead) * 100) / 100, { unit: 'time', dp: 2 })}`;
    return { e, place: t?.place, v, text };
  });
  const placed = rows.filter((r) => r.place != null && ok(r.e)).sort((a, b) => a.place! - b.place!);
  const out: RankedEntry[] = placed.map((r) => {
    const tie = placed.filter((x) => x.place === r.place).length > 1;
    return { id: r.e.id, entry: r.e, position: r.place!, label: `${tie ? '=' : ''}${r.place}`, tie, status: 'ok' as ResultStatus, best: r.v, bestText: r.text, legal: false, bestLegal: null, flags: [] };
  });
  for (const r of rows.filter((x) => x.place == null || !ok(x.e))) {
    const s = (r.e.result?.status ?? 'ok') as ResultStatus;
    out.push({ id: r.e.id, entry: r.e, position: null, label: s === 'ok' ? '' : s, tie: false, status: s, best: null, bestText: '', legal: false, bestLegal: null, flags: [] });
  }
  return out;
}

export interface Classification { id: string; name: string; team?: string; value: number; wins: number }

/** The points and mountains classifications of a stage race after this stage (most points first; ties: stage wins). */
export function stageClassifications(entries: ResultEntry[]): { points: Classification[]; kom: Classification[] } {
  const times = stageTimes(entries);
  const rows = entries.flatMap((e) => { const g = gcAfter(e, times.get(e.id)); return g ? [{ e, g }] : []; });
  const list = (k: 'pts' | 'kom') => rows.filter((r) => r.g[k] > 0).map((r) => ({ id: r.e.id, name: r.e.name, team: r.e.team?.name, value: r.g[k], wins: r.g.wins }))
    .sort((a, b) => b.value - a.value || b.wins - a.wins || a.name.localeCompare(b.name));
  return { points: list('pts'), kom: list('kom') };
}
