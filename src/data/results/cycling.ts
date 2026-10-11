/**
 * SD-98 — cycling (UCI) on the results engine. Pure. Road: individual time
 * trial (start list at intervals, ranked on time), road race (finish order with
 * same-time groups, DNF / DNS / OTL / DQ, intermediate sprint and KOM points on
 * a stage), stage race (one phase per stage, GC by cumulative time with time
 * bonuses, points and mountains classifications). Track: individual pursuit
 * (qualifying → finals for gold / bronze, a catch ends the race), time trial
 * (500 m / kilo), sprint (flying 200 m qualifying → a seeded bracket of best-of-
 * three matches with a bronze match — the archery bracket), keirin (heats →
 * final by finish order), scratch race, points race and elimination race.
 *
 * Rules as implemented are from memory of the UCI Regulations (Part 2 road,
 * Part 3 track) — the SD-98 report lists what is unverified.
 */
import type { Category, DisciplineDef, EntryResult, PhaseFormat, PhaseKind, RankedEntry, ResultEntry, ResultStatus } from './model.ts';
import { disciplineOf, categoryLabel } from './model.ts';
import type { PlannedPhase } from './plan.ts';
import type { Award } from './medals.ts';
import { formatMark } from './marks.ts';
import { betterMark } from './rank.ts';
import { bracketState, isBracketRows } from './archeryBracket.ts';
import { cycEventOf, cycKind, CYC_EVENTS, sprintPoints, LAP_POINTS, SPRINT_POINTS, type CycKind } from './cyclingDefs.ts';
import { pointsTotal, sprintMatch, sprintBo, stageTimes, gcAfter, roadTimes } from './cyclingRank.ts';

export * from './cyclingDefs.ts';
export * from './cyclingRank.ts';

export const isCycling = (s?: string | null): boolean => s === 'cycling';

/* ------------------------------ meet settings ------------------------------ */

export interface CycMeetSettings { positionPoints: number[]; relayFactor: number; handTimed: boolean; reaction: false }

export function cycMeetSettings(fmt?: Record<string, unknown>): CycMeetSettings {
  const scheme = String(fmt?.pointsScheme ?? '8,7,6,5,4,3,2,1').split(',').map(Number).filter((n) => Number.isFinite(n) && n >= 0);
  return { positionPoints: scheme.length ? scheme : [8, 7, 6, 5, 4, 3, 2, 1], relayFactor: 1, handTimed: fmt?.handTimed === true, reaction: false };
}

/* --------------------------------- rounds ---------------------------------- */

/** The keirin's riders per heat (UCI: 6, at most 7). */
export const KEIRIN_HEAT = 6;

/** The bracket sizes offered for sprint match play (none under 2 riders). */
export function sprintFields(n: number): number[] {
  return [...new Set([2, 4, 8, 16].filter((k) => k <= n).concat(n >= 3 && n <= 16 ? [n] : []))].sort((a, b) => a - b);
}
/** The default sprint field: the biggest of 4 / 8 / 16 that fits (2 for 2–3 riders). */
export function defaultSprintField(n: number): number {
  if (n < 4) return Math.max(2, Math.min(n, 2));
  let s = 4;
  while (s * 2 <= n && s < 16) s *= 2;
  return s;
}

export interface CycPlanOpts { field?: number; stages?: ('road' | 'itt')[] }

/**
 * The rounds of a cycling event for `n` riders:
 *  - time trials, road race, scratch, points and elimination races: one race;
 *  - individual pursuit / time trial with 4+ riders: qualifying, then the two
 *    fastest race for gold and 3rd–4th for bronze (Finals A / B, places run on);
 *  - sprint: flying 200 m qualifying → match play for the best `field`;
 *  - keirin: heats of up to 6 → a final of 6 (the first of each heat);
 *  - stage race: one phase per stage, everyone who finishes starts the next.
 */
export function cycPlan(kind: CycKind, n: number, o: CycPlanOpts = {}): PlannedPhase[] {
  if (kind === 'stage') {
    const stages = o.stages?.length ? o.stages : ['road' as const];
    return stages.map((_, i): PlannedPhase => (i < stages.length - 1 ? { phase: 'stage', heats: 1, progression: { stage: true } } : { phase: 'final', heats: 1 }));
  }
  if (kind === 'ip' && n >= 4) {
    return [
      { phase: 'qualification', heats: 1, progression: { routes: [{ from: 1, to: 2, phase: 2, race: 1 }, { from: 3, to: 4, phase: 2, race: 2 }] } },
      { phase: 'final', heats: 2, races: ['A', 'B'] },
    ];
  }
  if (kind === 'sprint' && n >= 2) {
    const field = Math.max(2, Math.min(o.field ?? defaultSprintField(n), n));
    return [{ phase: 'qualification', heats: 1, progression: { fillTo: field } }, { phase: 'final', heats: 1 }];
  }
  if (kind === 'keirin' && n > KEIRIN_HEAT + 1) {
    const heats = Math.ceil(n / KEIRIN_HEAT);
    return [{ phase: 'heat', heats, progression: { byPlace: Math.max(1, Math.floor(KEIRIN_HEAT / heats)) } }, { phase: 'final', heats: 1 }];
  }
  return [{ phase: 'final', heats: 1 }];
}

/** "Qualifying → Finals for gold (1st v 2nd) and bronze (3rd v 4th)" … */
export function describeCycPlan(kind: CycKind, plan: PlannedPhase[], stages?: ('road' | 'itt')[]): string {
  if (kind === 'stage') return (stages ?? ['road']).map((t, i) => `Stage ${i + 1} ${t === 'itt' ? '(time trial)' : '(road)'}`).join(' → ') + ' · GC on cumulative time';
  if (plan.length === 1) return kind === 'keirin' || kind === 'scratch' || kind === 'elim' || kind === 'points' || kind === 'rr' ? 'One race — the order on the line decides' : 'One race against the clock';
  if (kind === 'ip' || kind === 'tt') return 'Qualifying → the two fastest ride for gold, 3rd and 4th for bronze';
  if (kind === 'sprint') return `Flying 200 m qualifying → the best ${plan[0].progression?.fillTo ?? 2} seeded into match play (1 v ${plan[0].progression?.fillTo ?? 2} …), semi-final losers race for bronze`;
  if (kind === 'keirin') return `${plan[0].heats} heats (first ${plan[0].progression?.byPlace ?? 1} of each) → Final`;
  return '';
}

/* ------------------------------ time trial starts ------------------------------ */

/** A starter's offset from the first rider: (order − 1) × interval. */
export const ittStart = (order: number | undefined, interval: number): number => Math.max(0, ((order ?? 1) - 1) * interval);
/** "+0:00", "+2:30", "+1:02:00" */
export const startText = (secs: number): string => `+${secs >= 3600 ? formatMark(secs, { unit: 'time', dp: 0 }) : `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`}`;

/* ------------------------------ finish order ------------------------------- */

/** The next place on the line (1 + the riders already placed). */
export const nextFin = (entries: ResultEntry[]): number => 1 + Math.max(0, ...entries.map((e) => e.result?.fin ?? 0));

/**
 * Put a rider on the line at `place` (other riders move down one) — or take
 * them off (`null`: the riders behind move up). Returns the rows that change.
 */
export function placeOnLine(entries: ResultEntry[], id: string, place: number | null): { id: string; result: EntryResult }[] {
  const cur = entries.find((e) => e.id === id)?.result?.fin;
  const out: { id: string; result: EntryResult }[] = [];
  for (const e of entries) {
    const f = e.result?.fin;
    if (e.id === id) { out.push({ id, result: { ...e.result, fin: place ?? undefined } }); continue; }
    if (f == null) continue;
    let nf = f;
    if (cur != null && f > cur) nf -= 1;
    if (place != null && nf >= place) nf += 1;
    if (nf !== f) out.push({ id: e.id, result: { ...e.result, fin: nf } });
  }
  return out;
}

/** Elimination race: the place the next rider out takes (the field size minus the riders already out). */
export function nextOutPlace(entries: ResultEntry[]): number {
  const n = entries.filter((e) => (e.result?.status ?? 'ok') === 'ok').length;
  const out = entries.filter((e) => e.result?.fin != null && e.result.fin > 0).map((e) => e.result.fin!);
  let p = n;
  while (out.includes(p) && p > 1) p -= 1;
  return p;
}

/* ------------------------------ points race ------------------------------- */

/** The points race's sprint count: laps ÷ sprint interval (the last one is the finish). */
export const sprintCount = (laps?: number, every?: number): number => (laps && every ? Math.max(1, Math.floor(laps / every)) : 0);

/** A rider's sprint line: "S1 5 · S3 2 · Finish 6 · +1 lap (+20) = 33". */
export function pointsLine(r: EntryResult): string {
  const t = pointsTotal(r);
  const parts = Object.entries(r.spr ?? {}).sort((a, b) => Number(a[0]) - Number(b[0])).filter(([, p]) => sprintPoints(p, 1, 2) > 0).map(([k, p]) => `S${k} ${sprintPoints(p, 1, 2)}`);
  if (r.fin != null && (SPRINT_POINTS[r.fin - 1] ?? 0) > 0) parts.push(`Finish ${SPRINT_POINTS[r.fin - 1] * 2}`);
  if (r.laps) parts.push(`${r.laps > 0 ? '+' : ''}${r.laps} lap${Math.abs(r.laps) === 1 ? '' : 's'} (${r.laps > 0 ? '+' : ''}${r.laps * LAP_POINTS})`);
  return parts.length ? `${parts.join(' · ')} = ${t.total}` : '';
}

/** Set (or clear) a rider's place in intermediate sprint `n`; the rider who had that place loses it. */
export function setSprintPlace(entries: ResultEntry[], id: string, n: number, place: number | null): { id: string; result: EntryResult }[] {
  const k = String(n);
  const out: { id: string; result: EntryResult }[] = [];
  for (const e of entries) {
    const spr = { ...(e.result?.spr ?? {}) };
    if (e.id === id) {
      if (place == null) delete spr[k]; else spr[k] = place;
      out.push({ id, result: { ...e.result, spr } });
    } else if (place != null && spr[k] === place) {
      delete spr[k];
      out.push({ id: e.id, result: { ...e.result, spr } });
    }
  }
  return out;
}

/* ------------------------------- sprint bracket ------------------------------ */

/** A sprint bracket row from a qualifying row: seed, the 200 m time kept (sheet / records), heats per match. */
export function sprintEntrant(q: EntryResult, seed: number, bo: 1 | 3 = 3): Pick<EntryResult, 'seed' | 'mp' | 'qual' | 'order' | 'bo'> {
  return { seed, order: seed, mp: {}, qual: { mark: q.mark ?? 0 }, bo };
}

/** Record heat `k` (0-based) of match `key`: `winner` takes it (both rows change). `null` clears that heat and the ones after. */
export function setSprintHeat(a: EntryResult, b: EntryResult, key: string, k: number, winner: 'a' | 'b' | null): [EntryResult, EntryResult] {
  const upd = (r: EntryResult, won: number | null): EntryResult => {
    const side = { ...(r.mp?.[key] ?? {}) };
    const heats = [...(side.heats ?? [])].slice(0, k);
    while (heats.length < k) heats.push(0);
    if (won != null) heats[k] = won;
    side.heats = heats;
    return { ...r, mp: { ...(r.mp ?? {}), [key]: side } };
  };
  if (winner == null) return [upd(a, null), upd(b, null)];
  return [upd(a, winner === 'a' ? 1 : 0), upd(b, winner === 'b' ? 1 : 0)];
}

/** The sprint bracket of a phase (null when the rows aren't match play). */
export const sprintBracket = (entries: ResultEntry[]) => (isBracketRows(entries) ? bracketState(entries, 'sets', sprintMatch(sprintBo(entries))) : null);

/* -------------------------------- statuses ---------------------------------- */

/** Statuses an official can set: road — DNS, DNF, OTL (outside the time limit), DQ; track — DNS, DNF, DQ. */
export const cycStatuses = (def: Pick<DisciplineDef, 'key'>): ResultStatus[] => (cycEventOf(def.key)?.setting === 'road' ? ['DNS', 'DNF', 'OTL', 'DQ'] : ['DNS', 'DNF', 'DQ']);

/* --------------------------------- sheet text -------------------------------- */

/** The detail line under a rider on the results sheet. */
export function cycRowText(r: RankedEntry, def: DisciplineDef): string {
  const res = r.entry.result ?? {};
  const kind = cycKind(def.key);
  if (kind === 'points') return pointsLine(res);
  if (kind === 'stage') {
    const st = stageTimes([r.entry]).get(r.id);
    return [
      res.fin != null ? `Stage ${ordinal(res.fin)}` : res.mark != null ? `Stage ${formatMark(res.mark, { unit: 'time', dp: 2 })}` : '',
      res.bonus ? `bonus −${res.bonus}″` : '', res.pts ? `${res.pts} pts` : '', res.kom ? `${res.kom} KOM` : '',
      res.gc?.stages ? `${res.gc.stages + (st ? 1 : 0)} stage${res.gc.stages + (st ? 1 : 0) === 1 ? '' : 's'}` : '',
    ].filter(Boolean).join(' · ');
  }
  if (kind === 'scratch' && res.laps) return `${res.laps > 0 ? 'gained' : 'lost'} ${Math.abs(res.laps)} lap${Math.abs(res.laps) === 1 ? '' : 's'}`;
  if (res.caught) return 'caught';
  return '';
}

const ordinal = (n: number) => { const v = n % 100; return `${n}${['th', 'st', 'nd', 'rd'][(v - 20) % 10] ?? ['th', 'st', 'nd', 'rd'][v] ?? 'th'}`; };

/* -------------------------------- stat lines -------------------------------- */

/** 'cyc.itt.10' → 'm_cyc_itt_10' (a timed event's best, under its own key). */
export const cycMarkKey = (discipline: string) => `m_${discipline.replace(/\./g, '_')}`;
export const cycKeyDiscipline = (key: string): string | null => {
  const m = /^m_cyc_([a-z0-9]+(?:_\d+)?)$/.exec(key);
  if (!m) return null;
  const d = `cyc.${m[1].replace('_', '.')}`;
  return cycEventOf(d)?.timed ? d : null;
};

export interface CycLine { playerId: string; stats: Record<string, number>; won: boolean }

/**
 * The stat lines a closed phase writes (one per rider): races, place, finals,
 * medals, position points, DNF / OTL / DQ; a timed event's time and its legal
 * time under `m_cyc_*`; wins (1st on the line / in a race); points-race points
 * and laps gained; sprint matches won / lost; stage race — stages, stage wins
 * (and on the last stage the GC place, its medals and points).
 */
export function cycLines(f: Pick<PhaseFormat, 'discipline' | 'phase'>, ranked: RankedEntry[], awards: Award[] = []): CycLine[] {
  const def = disciplineOf(f.discipline);
  const kind = cycKind(f.discipline);
  if (!def || !kind) return [];
  const byEntry = new Map(awards.map((a) => [a.entryId, a]));
  const rows = ranked.map((r) => r.entry);
  const bracket = isBracketRows(rows) ? bracketState(rows, 'sets', sprintMatch(sprintBo(rows))) : null;
  const stage = kind === 'stage' ? stageTimes(rows) : null;
  const out: CycLine[] = [];
  for (const r of ranked) {
    if (r.status === 'DNS' || r.status === 'WD' || !r.entry.athleteId) continue;
    const s: Record<string, number> = { races: 1 };
    const res = r.entry.result ?? {};
    const a = byEntry.get(r.id);
    if (r.position != null) s.place = r.position;
    if (r.status === 'DNF') s.dnf = 1;
    if (r.status === 'OTL') s.otl = 1;
    if (r.status === 'DQ') s.dq = 1;
    if (f.phase === 'final') s.finals = 1;
    if (a?.medal === 'gold') s.golds = 1; else if (a?.medal === 'silver') s.silvers = 1; else if (a?.medal === 'bronze') s.bronzes = 1;
    if (a && a.points > 0) s.posPoints = a.points;
    if (bracket) {
      let w = 0, l = 0;
      for (const m of bracket.matches) {
        if (!m.decided || m.bye || m.out?.walkover || (m.a !== r.id && m.b !== r.id)) continue;
        if (m.winner === r.id) w += 1; else if (m.loser === r.id) l += 1;
      }
      s.sprintW = w; s.sprintL = l;
    } else if (def.capture === 'single') {
      if (r.best != null) s.mark = r.best;
      if (r.bestLegal != null) s[cycMarkKey(def.key)] = r.bestLegal;
      if (res.hand) s.hand = 1;
    }
    if (kind === 'points') {
      s.prPts = pointsTotal(res).total;
      if ((res.laps ?? 0) > 0) s.lapsGained = res.laps!;
    }
    if (kind === 'scratch' && (res.laps ?? 0) > 0) s.lapsGained = res.laps!;
    if (stage) {
      s.stages = 1;
      const st = stage.get(r.id);
      if (st?.place === 1) s.stageWins = 1;
      if (f.phase !== 'final') delete s.place; // a stage's GC place isn't a result until the last stage
      if (st?.place != null) s.stagePlace = st.place;
    }
    if (kind !== 'stage' && r.position === 1 && (f.phase === 'final' || kind === 'rr' || kind === 'itt')) s.raceWins = 1;
    if (kind === 'stage' && f.phase === 'final' && r.position === 1) s.raceWins = 1;
    out.push({ playerId: r.entry.athleteId, stats: s, won: a?.medal === 'gold' || s.raceWins === 1 });
  }
  return out;
}

/* ---------------------------------- career ---------------------------------- */

export interface CycPhaseInfo { discipline: string; category?: Category; phase: PhaseKind; title: string; date: string }
export interface CycBest { key: string; label: string; value: number; text: string; date: string; eventId: string; category?: string }
export interface CyclingCareer {
  races: number; wins: number; finals: number; golds: number; silvers: number; bronzes: number; points: number;
  stages: number; stageWins: number; prPts: number; sprintW: number; sprintL: number; dnf: number;
  bests: { key: string; label: string; pb: CycBest; sb?: CycBest }[];
  history: { eventId: string; title: string; date: string; text: string; place?: number; medal?: 'gold' | 'silver' | 'bronze'; flags: string[] }[];
}

/** A rider's career from their cycling lines (oldest first for "PB at the time"; history newest first). */
export function cyclingCareer(lines: { eventId?: string; stats: Record<string, number>; date?: string; opponent?: string }[], phases: Map<string, CycPhaseInfo>, seasonFrom: string): CyclingCareer {
  const c: CyclingCareer = { races: 0, wins: 0, finals: 0, golds: 0, silvers: 0, bronzes: 0, points: 0, stages: 0, stageWins: 0, prPts: 0, sprintW: 0, sprintL: 0, dnf: 0, bests: [], history: [] };
  const bests = new Map<string, CyclingCareer['bests'][number]>();
  const pbSoFar = new Map<string, number>();
  for (const l of [...lines].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))) {
    const s = l.stats ?? {};
    c.races += s.races ?? 0; c.wins += s.raceWins ?? 0; c.finals += s.finals ?? 0;
    c.golds += s.golds ?? 0; c.silvers += s.silvers ?? 0; c.bronzes += s.bronzes ?? 0; c.points += s.posPoints ?? 0;
    c.stages += s.stages ?? 0; c.stageWins += s.stageWins ?? 0; c.prPts += s.prPts ?? 0;
    c.sprintW += s.sprintW ?? 0; c.sprintL += s.sprintL ?? 0; c.dnf += (s.dnf ?? 0) + (s.otl ?? 0);
    const info = l.eventId ? phases.get(l.eventId) : undefined;
    const key = Object.keys(s).find((k) => cycKeyDiscipline(k));
    const discipline = info?.discipline ?? (key ? cycKeyDiscipline(key)! : undefined);
    const def = discipline ? disciplineOf(discipline) : undefined;
    const date = info?.date ?? l.date ?? '';
    const flags: string[] = [];
    if (def && key && s[key] != null) {
      const v = s[key];
      const best: CycBest = { key: def.key, label: def.label, value: v, text: formatMark(v, def), date, eventId: l.eventId ?? '', category: info?.category ? categoryLabel(info.category) : undefined };
      const prev = pbSoFar.get(def.key);
      if (prev == null || betterMark(v, prev, def)) { if (prev != null) flags.push('PB'); pbSoFar.set(def.key, v); }
      const row = bests.get(def.key) ?? { key: def.key, label: def.key === 'cyc.sprint' ? 'Sprint — flying 200 m' : def.label, pb: best };
      if (betterMark(v, row.pb.value, def)) row.pb = best;
      if (date.slice(0, 10) >= seasonFrom && (!row.sb || betterMark(v, row.sb.value, def))) row.sb = best;
      bests.set(def.key, row);
    }
    const medal = s.golds ? 'gold' : s.silvers ? 'silver' : s.bronzes ? 'bronze' : undefined;
    const text = [
      s.place ? ordinal(s.place) : s.stagePlace ? `stage ${ordinal(s.stagePlace)}` : s.dnf ? 'DNF' : s.otl ? 'OTL' : s.dq ? 'DQ' : '',
      def && s.mark != null ? formatMark(s.mark, def) : '',
      s.prPts != null ? `${s.prPts} pts` : '',
      s.sprintW != null ? `matches ${s.sprintW}–${s.sprintL ?? 0}` : '',
    ].filter(Boolean).join(' · ');
    c.history.push({ eventId: l.eventId ?? '', title: info?.title ?? l.opponent ?? 'Race', date, text, place: s.place, medal, flags });
  }
  c.points = Math.round(c.points * 100) / 100;
  const order = (k: string) => { const i = CYC_EVENTS.findIndex((e) => e.key === k); return i < 0 ? 999 : i; };
  c.bests = [...bests.values()].sort((a, b) => order(a.key) - order(b.key));
  c.history.reverse();
  return c;
}

/* ------------------------------ stage advance ------------------------------ */

/**
 * Close a stage: every rider who finished it (status ok, with a stage time)
 * starts the next stage carrying the GC after this one; DNF / OTL / DQ / DNS
 * riders are out of the race. Returns entry id → GC, in GC order.
 */
export function stageFinishers(entries: ResultEntry[]): { id: string; gc: NonNullable<ReturnType<typeof gcAfter>> }[] {
  const times = stageTimes(entries);
  return entries.flatMap((e) => { const g = gcAfter(e, times.get(e.id)); return g ? [{ id: e.id, gc: g }] : []; })
    .sort((a, b) => a.gc.time - b.gc.time || a.gc.frac - b.gc.frac || a.gc.places - b.gc.places);
}

/** Road race / stage: does any rider on the line still lack a time while others have one (the winner's time is needed)? */
export function roadTimeMissing(entries: ResultEntry[]): boolean {
  const t = roadTimes(entries);
  return [...t.values()].some((x) => x.time == null) && [...t.values()].some((x) => x.time != null);
}

