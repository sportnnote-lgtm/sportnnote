/**
 * SD-99 rowing (World Rowing) and SD-100 canoe sprint (ICF) on the results
 * engine: crews in lanes racing for time, a configurable progression system
 * (heats → repechage → semi-finals → Finals A / B / C, routed by place), lane
 * allocation by ranking, crew stat lines (every rower / paddler and the cox is
 * credited) and the crew career. Times to 1/100 with the photo-finish reading
 * kept to 1/1000 (it decides the order; a dead heat stands unless a re-row /
 * draw is entered). Ranking, records, medals and the reopen / safety rules are
 * the generic engine. Pure.
 *
 * Rules as implemented (from memory of the rule books — see the SD-99 / SD-100
 * report for what is unverified):
 *  - World Rowing Rules of Racing — the progression systems (the Rules of
 *    Racing's appendix of progression tables by number of entries): heat
 *    winners straight to the next main round, the rest to a repechage that
 *    fills it, the remainder to the lower final(s). The presets below follow
 *    the shape of the 7–12 and 13–18 crew tables for a 6-lane course; any
 *    other split is a custom rule. Finals A / B: places run on (FB winner = 7th).
 *    Lane allocation by ranking 3, 4, 2, 5, 1, 6 (8 lanes: 4, 5, 3, 6, 2, 7, 1, 8).
 *  - ICF Canoe Sprint Competition Rules — heats → semi-finals → Finals A / B
 *    by the number of boats on a 9-lane course; the best from the heats may
 *    go straight to Final A; the best ranked in the centre lane (5).
 */
import type { PhaseFormat, RankedEntry, Route, CarriedCrew, Progression, Category } from './model.ts';
import { disciplineOf, categoryLabel } from './model.ts';
import type { PlannedPhase } from './plan.ts';
import { phaseLabel } from './plan.ts';
import { formatMark } from './marks.ts';
import { betterMark } from './rank.ts';
import { swimLaneOrder } from './swimming.ts';
import type { Award } from './medals.ts';
import { crewEventOf, seatNames, CREW_LANES, CREW_EVENTS, type CrewSport } from './crewDefs.ts';
export * from './crewDefs.ts';

export const isCrewSport = (s?: string | null): s is CrewSport => s === 'rowing' || s === 'canoe';

/* ------------------------------ meet settings ------------------------------ */

export interface CrewMeetSettings {
  positionPoints: number[];
  /** crew-boat points multiplier for the house table (like relays) */
  relayFactor: number;
  /** stopwatches, no photo finish: times to 1/100, record-eligible here */
  handTimed: boolean;
  reaction: boolean;
  lanes: number;
  /** intermediate times (500 m rowing / 250 m canoe) are recorded */
  splits: boolean;
}

export function crewMeetSettings(sport: CrewSport, fmt?: Record<string, unknown>): CrewMeetSettings {
  const scheme = String(fmt?.pointsScheme ?? '8,7,6,5,4,3,2,1').split(',').map(Number).filter((n) => Number.isFinite(n) && n >= 0);
  const lanes = Number(fmt?.lanes ?? CREW_LANES[sport]);
  return {
    positionPoints: scheme.length ? scheme : [8, 7, 6, 5, 4, 3, 2, 1],
    relayFactor: Number(fmt?.relayFactor ?? 1) || 1,
    handTimed: fmt?.handTimed === true,
    reaction: false,
    lanes: lanes >= 2 && lanes <= 10 ? lanes : CREW_LANES[sport],
    splits: fmt?.splits === true,
  };
}

/* -------------------------------- lanes ------------------------------------ */

/** Lanes by ranking, best first: centre out, the next best on the higher side
 *  (6 lanes: 3 4 2 5 1 6 · 8 lanes: 4 5 3 6 2 7 1 8 · 9 lanes: 5 6 4 7 3 8 2 9 1).
 *  The swimming pattern (SW 3.1.2) — the same shape. */
export const crewLaneOrder = (lanes: number): number[] => swimLaneOrder(Math.min(lanes, 9));

/* ------------------------------ progression -------------------------------- */

export interface CrewPreset { key: 'final' | 'rep' | 'semis' | 'ab' | 'direct' | 'heatsSemis'; label: string; plan: PlannedPhase[] }

const letters = (n: number) => 'ABCDEF'.slice(0, Math.max(1, n)).split('');
const finalPhase = (races: number): PlannedPhase => (races > 1 ? { phase: 'final', heats: races, races: letters(races) } : { phase: 'final', heats: 1 });

/**
 * Heats → repechage → Finals A / B (the World Rowing shape for up to two
 * courses' worth of crews): the first `direct` of each heat go straight to
 * Final A; everyone else races the repechage(s), whose best fill Final A and
 * the next ones Final B. 9 crews, 6 lanes: 2 heats (1st → FA), 2 repechages
 * (1–2 → FA, 3–5 → FB).
 */
export function repechagePlan(n: number, lanes: number, direct = 1, heats?: number): PlannedPhase[] {
  const L = Math.max(2, lanes);
  const H = Math.max(1, heats ?? Math.ceil(n / L));
  const d = Math.max(1, Math.min(direct, Math.floor(L / H)));
  const toRep = Math.max(0, n - H * d);
  const R = Math.max(1, Math.ceil(toRep / L));
  const left = Math.max(0, L - H * d);
  const k = Math.floor(left / R);
  const restPerRep = Math.ceil(toRep / R) - k;
  const b = restPerRep > 0 ? Math.min(restPerRep, Math.floor(L / R)) : 0;
  const repRoutes: Route[] = [];
  if (k > 0) repRoutes.push({ from: 1, to: k, phase: 3, race: 1 });
  if (b > 0) repRoutes.push({ from: k + 1, to: k + b, phase: 3, race: 2 });
  return [
    { phase: 'heat', heats: H, progression: { routes: [{ from: 1, to: d, phase: 3, race: 1 }, { from: d + 1, phase: 2 }] } },
    { phase: 'repechage', heats: R, progression: { routes: repRoutes } },
    finalPhase(b > 0 ? 2 : 1),
  ];
}

/**
 * Heats → repechage → semi-finals A/B → Finals A / B / C (the World Rowing
 * shape for 13–18 crews on six lanes, 3 heats): heat winners to the semis, the
 * repechages fill the semis (two of `lanes`), the rest of the repechages race
 * Final C; semi-finals 1–3 → Final A, 4–6 → Final B.
 */
export function semisPlan(n: number, lanes: number, direct = 1): PlannedPhase[] {
  const L = Math.max(2, lanes);
  const H = Math.ceil(n / L);
  const d = Math.max(1, Math.min(direct, Math.floor((2 * L) / H)));
  const toRep = Math.max(0, n - H * d);
  const R = Math.max(1, Math.ceil(toRep / L));
  const left = Math.max(0, 2 * L - H * d);
  const k = Math.floor(left / R);
  const restPerRep = Math.ceil(toRep / R) - k;
  const c = restPerRep > 0 ? Math.min(restPerRep, Math.floor(L / R)) : 0;
  const half = Math.floor(L / 2);
  const repRoutes: Route[] = [];
  if (k > 0) repRoutes.push({ from: 1, to: k, phase: 3 });
  if (c > 0) repRoutes.push({ from: k + 1, to: k + c, phase: 4, race: 3 });
  return [
    { phase: 'heat', heats: H, progression: { routes: [{ from: 1, to: d, phase: 3 }, { from: d + 1, phase: 2 }] } },
    { phase: 'repechage', heats: R, progression: { routes: repRoutes } },
    { phase: 'semi', heats: 2, progression: { routes: [{ from: 1, to: half, phase: 4, race: 1 }, { from: half + 1, to: 2 * half, phase: 4, race: 2 }] } },
    finalPhase(c > 0 ? 3 : 2),
  ];
}

/** Heats → Finals A / B by place, no repechage (a quick school regatta, or an
 *  ICF-style heats → final): the first `perHeat` of each heat to Final A, the
 *  next `perHeat` to Final B. */
export function heatsToFinalsPlan(n: number, lanes: number, withB = true): PlannedPhase[] {
  const L = Math.max(2, lanes);
  const H = Math.max(2, Math.ceil(n / L));
  const k = Math.max(1, Math.floor(L / H));
  const routes: Route[] = [{ from: 1, to: k, phase: 2, race: 1 }];
  const restPerHeat = Math.ceil(n / H) - k;
  const b = withB && restPerHeat > 0 ? Math.min(restPerHeat, k) : 0;
  if (b > 0) routes.push({ from: k + 1, to: k + b, phase: 2, race: 2 });
  return [{ phase: 'heat', heats: H, progression: { routes } }, finalPhase(b > 0 ? 2 : 1)];
}

/**
 * ICF-style: heats → semi-final(s) → Finals A / B, the best `direct` of each
 * heat straight to Final A (10–18 boats on 9 lanes: 2 heats, 1–3 → FA, the
 * rest → one semi-final or two; the semis fill Final A, the next go to
 * Final B). With `direct` 0 every heat place that fits goes to the semis.
 */
export function icfSemisPlan(n: number, lanes: number, direct = 3): PlannedPhase[] {
  const L = Math.max(2, lanes);
  const H = Math.max(2, Math.ceil(n / L));
  const d = Math.max(0, Math.min(direct, Math.floor((L - 1) / H)));
  const toSemi = Math.max(0, n - H * d);
  const S = Math.max(1, Math.min(3, Math.ceil(toSemi / L)));
  const perHeatToSemi = Math.min(Math.ceil(n / H) - d, Math.floor((S * L) / H));
  const heatRoutes: Route[] = [];
  if (d > 0) heatRoutes.push({ from: 1, to: d, phase: 3, race: 1 });
  heatRoutes.push({ from: d + 1, to: d + perHeatToSemi, phase: 2 });
  const k = Math.max(1, Math.floor((L - H * d) / S));
  const restPerSemi = Math.ceil((perHeatToSemi * H) / S) - k;
  const b = restPerSemi > 0 ? Math.min(restPerSemi, Math.floor(L / S)) : 0;
  const semiRoutes: Route[] = [{ from: 1, to: k, phase: 3, race: 1 }];
  if (b > 0) semiRoutes.push({ from: k + 1, to: k + b, phase: 3, race: 2 });
  return [
    { phase: 'heat', heats: H, progression: { routes: heatRoutes } },
    { phase: 'semi', heats: S, progression: { routes: semiRoutes } },
    finalPhase(b > 0 ? 2 : 1),
  ];
}

/** The progression choices for `n` crews on a course of `lanes`. */
export function crewRoundPresets(sport: CrewSport, n: number, lanes: number = CREW_LANES[sport]): CrewPreset[] {
  const L = Math.max(2, lanes);
  if (n <= L) return [{ key: 'final', label: 'Straight final', plan: [{ phase: 'final', heats: 1 }] }];
  const out: CrewPreset[] = [];
  if (sport === 'rowing') {
    if (n <= 2 * L) out.push({ key: 'rep', label: `Repechage → Finals A/B (${L + 1}–${2 * L})`, plan: repechagePlan(n, L) });
    else out.push({ key: 'semis', label: `Repechage → semis → Finals (${2 * L + 1}+)`, plan: semisPlan(n, L) });
    if (n <= 2 * L) out.push({ key: 'ab', label: 'Finals A/B, no repechage', plan: heatsToFinalsPlan(n, L) });
    else {
      // only while the repechages still reach Final A
      const rep = repechagePlan(n, L);
      if (rep[1].progression?.routes?.some((r) => r.race === 1)) out.push({ key: 'rep', label: 'Repechage → Finals A/B', plan: rep });
    }
  } else {
    if (n <= 2 * L) out.push({ key: 'direct', label: 'Top 3 to Final A → semi', plan: icfSemisPlan(n, L, 3) });
    out.push({ key: 'heatsSemis', label: 'Heats → semis → Finals A/B', plan: icfSemisPlan(n, L, 0) });
    if (n <= 2 * L) out.push({ key: 'ab', label: 'Heats → Finals A/B', plan: heatsToFinalsPlan(n, L) });
  }
  return out;
}

/** The custom rule an organiser builds on the setup screen. */
export interface CustomCrewRule { heats: number; direct: number; repechage: boolean; finalB: boolean }

export function customCrewPlan(n: number, lanes: number, rule: CustomCrewRule): PlannedPhase[] {
  const L = Math.max(2, lanes);
  const H = Math.max(1, rule.heats);
  if (H <= 1 && n <= L) return [{ phase: 'final', heats: 1 }];
  if (rule.repechage) {
    const p = repechagePlan(n, L, rule.direct, H);
    if (rule.finalB) return p;
    // no Final B: the repechages only fill Final A; the rest are out
    const routes = (p[1].progression?.routes ?? []).filter((r) => r.race !== 2);
    return [p[0], { ...p[1], progression: { routes } }, finalPhase(1)];
  }
  // no repechage: the first `direct` of each heat → Final A, the next ones → Final B
  const d = Math.max(1, Math.min(rule.direct, Math.floor(L / H)));
  const routes: Route[] = [{ from: 1, to: d, phase: 2, race: 1 }];
  const b = rule.finalB ? Math.min(Math.ceil(n / H) - d, Math.floor(L / H)) : 0;
  if (b > 0) routes.push({ from: d + 1, to: d + b, phase: 2, race: 2 });
  return [{ phase: 'heat', heats: H, progression: { routes } }, finalPhase(b > 0 ? 2 : 1)];
}

/* --------------------------- describing a route ---------------------------- */

const ord = (n: number) => { const v = n % 100; return `${n}${['th', 'st', 'nd', 'rd'][(v - 20) % 10] ?? ['th', 'st', 'nd', 'rd'][v] ?? 'th'}`; };
const placesText = (r: Route) => (r.to == null ? `${r.from === 1 ? 'all' : `${ord(r.from)} on`}` : r.to === r.from ? ord(r.from) : `${r.from}–${r.to}`);

type PlanLike = { phase: PhaseFormat['phase']; heats: number; progression?: Progression; races?: string[] }[];

/** Where a route leads: "Final A", "Repechage", "Semi-finals". */
export function routeTarget(plan: PlanLike | undefined, r: Pick<Route, 'phase' | 'race'>): string {
  const p = plan?.[r.phase - 1];
  if (!p) return 'out';
  if (p.phase === 'final') return `Final ${p.races?.[(r.race ?? 1) - 1] ?? 'A'}`;
  return p.phase === 'semi' ? 'Semi-finals' : phaseLabel(p.phase);
}

/** "1st → Final A · 2nd on → Repechage" */
export function describeRoutes(routes: Route[], plan?: PlanLike): string {
  return routes.map((r) => `${placesText(r)} → ${routeTarget(plan, r)}`).join(' · ');
}

/** "2 heats (1st → Final A · 2nd on → Repechage) → 2 repechages (1–2 → Final A · 3–5 → Final B) → Finals A/B" */
export function describeCrewPlan(plan: PlanLike): string {
  return plan.map((p) => {
    if (p.phase === 'final') return p.races && p.races.length > 1 ? `Finals ${p.races.join('/')}` : 'Final';
    const name = p.phase === 'repechage' ? (p.heats === 1 ? 'repechage' : 'repechages') : p.phase === 'semi' ? (p.heats === 1 ? 'semi-final' : 'semi-finals') : p.heats === 1 ? 'heat' : 'heats';
    const routes = p.progression?.routes;
    return `${p.heats} ${name}${routes?.length ? ` (${describeRoutes(routes, plan)})` : ''}`;
  }).join(' → ');
}

/* ------------------------------- routing ----------------------------------- */

export interface CrewRouting {
  /** entry id → where it goes (no entry = out) */
  dest: Map<string, { phase: number; race?: number }>;
  /** crews level (dead heat) across a route boundary — both go to the better
   *  destination unless a re-row / draw place is entered */
  tieAtLine: string[];
}

const routeFor = (routes: Route[], place: number) => routes.find((r) => place >= r.from && (r.to == null || place <= r.to));
const sameDest = (a?: Route, b?: Route) => (a?.phase ?? 0) === (b?.phase ?? 0) && (a?.race ?? 0) === (b?.race ?? 0);

/** Route every heat's ranked crews by place. A dead heat takes the better
 *  place's route; when the tied places straddle a boundary it is listed. */
export function routeCrews(byHeat: Map<number, RankedEntry[]>, prog: Progression): CrewRouting {
  const dest = new Map<string, { phase: number; race?: number }>();
  const tieAtLine: string[] = [];
  const routes = prog.routes ?? [];
  for (const rows of byHeat.values()) {
    const ranked = rows.filter((r) => r.position != null);
    for (const r of ranked) {
      const pos = r.position as number;
      const route = routeFor(routes, pos);
      if (route) dest.set(r.id, { phase: route.phase, ...(route.race ? { race: route.race } : {}) });
      const group = ranked.filter((x) => x.position === pos);
      if (group.length > 1 && !sameDest(route, routeFor(routes, pos + group.length - 1)) && !tieAtLine.includes(r.id)) tieAtLine.push(r.id);
    }
  }
  return { dest, tieAtLine };
}

export interface CrewSeeded { ref: string; heat: number; lane: number; order: number; race?: string; carried?: CarriedCrew }

const carrySnap = (r: RankedEntry, phase: number, race: number | undefined, heatName: string): CarriedCrew => ({
  ref: r.id, playerId: r.entry.athleteId, teamId: r.entry.team?.id,
  result: { bib: r.entry.result.bib, team: r.entry.result.team ?? r.entry.team, name: r.entry.result.name, members: r.entry.result.members },
  place: r.position ?? 99, mark: r.best ?? undefined, phase, ...(race ? { race } : {}), from: `${heatName} · ${ord(r.position ?? 0)}`, label: r.entry.name,
});

/**
 * Close a crew round: who goes to the next round (seeded into its heats or
 * lettered finals, lanes by ranking — place in the heat, then time), and who
 * waits for a later round (carried on the next round's format).
 */
export function advanceCrews(byHeat: Map<number, RankedEntry[]>, f: Pick<PhaseFormat, 'phaseNo' | 'progression' | 'carry' | 'phase'>, next: { heats: number; races?: string[] }, lanes: number): { seeded: CrewSeeded[]; carry: CarriedCrew[]; tieAtLine: string[] } {
  const target = f.phaseNo + 1;
  const routing = routeCrews(byHeat, f.progression ?? {});
  const heatName = (h: number) => `${f.phase === 'repechage' ? 'Repechage' : f.phase === 'semi' ? 'Semi-final' : 'Heat'} ${h}`;
  type Arrival = { ref: string; place: number; mark?: number; heat: number; race?: number; carried?: CarriedCrew };
  const arrivals: Arrival[] = [];
  const carry: CarriedCrew[] = [];
  for (const c of f.carry ?? []) {
    if (c.phase === target) arrivals.push({ ref: c.ref, place: c.place, mark: c.mark, heat: 0, race: c.race, carried: c });
    else if (c.phase > target) carry.push(c);
  }
  for (const [h, rows] of byHeat) {
    for (const r of rows) {
      const d = routing.dest.get(r.id);
      if (!d) continue;
      if (d.phase === target) arrivals.push({ ref: r.id, place: r.position ?? 99, mark: r.best ?? undefined, heat: h, race: d.race });
      else if (d.phase > target) carry.push(carrySnap(r, d.phase, d.race, heatName(h)));
    }
  }
  arrivals.sort((a, b) => a.place - b.place || (a.mark ?? Infinity) - (b.mark ?? Infinity) || a.heat - b.heat);
  const order = crewLaneOrder(lanes);
  const laneAt = (i: number) => order[i] ?? (order[order.length - 1] + (i - order.length + 1));
  const seeded: CrewSeeded[] = [];
  if (next.races && next.races.length > 1) {
    next.races.forEach((L, i) => {
      arrivals.filter((a) => (a.race ?? 1) === i + 1).forEach((a, j) => seeded.push({ ref: a.ref, heat: i + 1, lane: laneAt(j), order: j + 1, race: L, carried: a.carried }));
    });
  } else {
    const H = Math.max(1, next.heats);
    const buckets: Arrival[][] = Array.from({ length: H }, () => []);
    arrivals.forEach((a, i) => { const round = Math.floor(i / H), k = i % H; buckets[round % 2 === 0 ? k : H - 1 - k].push(a); });
    buckets.forEach((list, h) => list.forEach((a, j) => seeded.push({ ref: a.ref, heat: h + 1, lane: laneAt(j), order: j + 1, carried: a.carried })));
  }
  return { seeded, carry, tieAtLine: routing.tieAtLine };
}

/* ------------------------------- stat lines -------------------------------- */

/** 'row.8p.2000' → 'm_row_8p_2000', 'cs.k1.500' → 'm_cs_k1_500'. */
export const crewMarkKey = (discipline: string) => `m_${discipline.replace(/\./g, '_')}`;
/** The discipline a crew mark key came from. */
export const crewKeyDiscipline = (key: string): string | null => {
  const m = /^m_(row|cs)_([0-9a-z]+)_(\d+)$/.exec(key);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : null;
};

export interface CrewLine { playerId: string; stats: Record<string, number>; won: boolean }

/**
 * One line per rower / paddler (and the cox) for a closed round: races, place,
 * the crew's time (+ its legal time under the boat / distance key), finals and
 * A finals reached, medals, DNF / DQ, the seat (1 = bow / front) and `cox`.
 * Singles also get position points (crew boats score for the house only).
 */
export function crewLines(f: Pick<PhaseFormat, 'discipline' | 'phase'>, ranked: RankedEntry[], awards: Award[] = []): CrewLine[] {
  const def = disciplineOf(f.discipline);
  if (!def) return [];
  const byEntry = new Map(awards.map((a) => [a.entryId, a]));
  const out: CrewLine[] = [];
  for (const r of ranked) {
    if (r.status === 'DNS' || r.status === 'WD') continue;
    const a = byEntry.get(r.id);
    const s: Record<string, number> = { races: 1 };
    if (r.position != null) s.place = r.position;
    if (r.status === 'DNF') s.dnf = 1;
    if (r.status === 'DQ' || r.status === 'FS') s.dq = 1;
    if (f.phase === 'final') { s.finals = 1; if ((r.entry.result.race ?? 'A') === 'A') s.finalsA = 1; }
    if (a?.medal === 'gold') s.golds = 1;
    if (a?.medal === 'silver') s.silvers = 1;
    if (a?.medal === 'bronze') s.bronzes = 1;
    if (r.best != null) s.mark = r.best;
    if (r.bestLegal != null) s[crewMarkKey(def.key)] = r.bestLegal;
    if (r.entry.result.hand) s.hand = 1;
    if (r.entry.athleteId) {
      if (a && a.points > 0) s.posPoints = a.points;
      out.push({ playerId: r.entry.athleteId, stats: s, won: a?.medal === 'gold' });
      continue;
    }
    (r.entry.result.members ?? []).forEach((m, i) => {
      if (!m.playerId) return;
      out.push({ playerId: m.playerId, stats: { ...s, ...(m.cox ? { cox: 1 } : { seat: i + 1 }) }, won: a?.medal === 'gold' });
    });
  }
  return out;
}

/* --------------------------------- career ---------------------------------- */

export interface CrewPhaseInfo { discipline: string; category?: Category; phase: PhaseFormat['phase']; title: string; date: string }
export interface CrewBest { key: string; label: string; value: number; text: string; date: string; eventId: string; category?: string }
export interface CrewCareer {
  races: number; finals: number; finalsA: number; golds: number; silvers: number; bronzes: number; points: number;
  /** races steered as the cox */
  coxed: number;
  bests: { key: string; label: string; pb: CrewBest; sb?: CrewBest }[];
  history: { eventId: string; title: string; date: string; text: string; place?: number; medal?: 'gold' | 'silver' | 'bronze'; flags: string[] }[];
}

/** The rowing / canoe career from a player's lines (oldest → PB flags "at the time"). History newest first. */
export function crewCareer(lines: { eventId?: string; stats: Record<string, number>; date?: string; opponent?: string }[], phases: Map<string, CrewPhaseInfo>, seasonFrom: string): CrewCareer {
  const c: CrewCareer = { races: 0, finals: 0, finalsA: 0, golds: 0, silvers: 0, bronzes: 0, points: 0, coxed: 0, bests: [], history: [] };
  const bests = new Map<string, CrewCareer['bests'][number]>();
  const pbSoFar = new Map<string, number>();
  for (const l of [...lines].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))) {
    const s = l.stats ?? {};
    c.races += s.races ?? 0; c.finals += s.finals ?? 0; c.finalsA += s.finalsA ?? 0; c.coxed += s.cox ?? 0;
    c.golds += s.golds ?? 0; c.silvers += s.silvers ?? 0; c.bronzes += s.bronzes ?? 0; c.points += s.posPoints ?? 0;
    const info = l.eventId ? phases.get(l.eventId) : undefined;
    const key = Object.keys(s).find((k) => crewKeyDiscipline(k));
    const discipline = info?.discipline ?? (key ? crewKeyDiscipline(key)! : undefined);
    const def = discipline ? disciplineOf(discipline) : undefined;
    const date = info?.date ?? l.date ?? '';
    const flags: string[] = [];
    if (def && key && s[key] != null) {
      const v = s[key];
      const best: CrewBest = { key: def.key, label: def.label, value: v, text: formatMark(v, def), date, eventId: l.eventId ?? '', category: info?.category ? categoryLabel(info.category) : undefined };
      const prev = pbSoFar.get(def.key);
      if (prev == null || betterMark(v, prev, def)) { if (prev != null) flags.push('PB'); pbSoFar.set(def.key, v); }
      const row = bests.get(def.key) ?? { key: def.key, label: `${def.label} — ${crewEventOf(def.key)?.boat.label ?? ''}`, pb: best };
      if (betterMark(v, row.pb.value, def)) row.pb = best;
      if (date.slice(0, 10) >= seasonFrom && (!row.sb || betterMark(v, row.sb.value, def))) row.sb = best;
      bests.set(def.key, row);
    }
    const medal = s.golds ? 'gold' : s.silvers ? 'silver' : s.bronzes ? 'bronze' : undefined;
    const ce = def ? crewEventOf(def.key) : null;
    const seat = s.cox ? 'cox' : s.seat && ce && ce.boat.seats > 1 ? seatNames(ce)[s.seat - 1]?.toLowerCase() : '';
    const text = [s.place ? ord(s.place) : s.dnf ? 'DNF' : s.dq ? 'DQ' : '', def && s.mark != null ? formatMark(s.mark, def) : '', seat ? `(${/^\d+$/.test(seat) ? `seat ${seat}` : seat})` : ''].filter(Boolean).join(' ');
    c.history.push({ eventId: l.eventId ?? '', title: info?.title ?? l.opponent ?? 'Race', date, text, place: s.place, medal, flags });
  }
  c.points = Math.round(c.points * 100) / 100;
  const order = (k: string) => { const i = DISC_ORDER.indexOf(k); return i < 0 ? 999 : i; };
  c.bests = [...bests.values()].sort((a, b) => order(a.key) - order(b.key));
  c.history.reverse();
  return c;
}

const DISC_ORDER: string[] = CREW_EVENTS.map((e) => e.key);

/* --------------------------------- helpers --------------------------------- */

/** "Bow Asha · 2 Riya · Stroke Meena · Cox Tara" (a crew's line on a sheet). */
export function crewMembersText(discipline: string, members?: { name: string; cox?: boolean }[]): string {
  const e = crewEventOf(discipline);
  if (!e || !members?.length) return '';
  const seats = seatNames(e);
  const rowers = members.filter((m) => !m.cox);
  const cox = members.find((m) => m.cox);
  const parts = rowers.map((m, i) => `${seats[i] ?? `Seat ${i + 1}`} ${m.name.split(' ')[0]}`);
  if (cox) parts.push(`Cox ${cox.name.split(' ')[0]}`);
  return parts.join(' · ');
}

/** A crew short of rowers / paddlers or missing its cox, or with someone twice. */
export function crewError(discipline: string, members: ({ playerId?: string; name: string; cox?: boolean } | undefined)[]): string | null {
  const e = crewEventOf(discipline);
  if (!e) return null;
  const rowers = members.filter((m) => m && !m.cox).length;
  const cox = members.some((m) => m?.cox);
  const word = e.sport === 'rowing' ? (e.boat.rig === 'scull' ? 'scullers' : 'rowers') : 'paddlers';
  if (rowers < e.boat.seats) return `${e.boat.short} needs ${e.boat.seats} ${word} — ${rowers} picked.`;
  if (e.boat.cox && !cox) return `${e.boat.short} needs a cox.`;
  const ids = members.map((m) => m?.playerId).filter(Boolean);
  if (new Set(ids).size !== ids.length) return 'The same person is in two seats.';
  return null;
}
