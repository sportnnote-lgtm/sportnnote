/**
 * SD-90 — athletics track on the results engine: the D9 school-meet programme
 * by category (age group × gender), World Athletics round presets by entry
 * count, seeding, the stopwatch-style time keypad, hand timing, reaction time,
 * start-list / results share text, the stat lines a finished round writes to
 * athletes' profiles, the measured career (PB / SB per event, medals, finals),
 * meet leaders, the medal-table input and a derived school record book. Pure.
 *
 * Field events (SD-91) live in field.ts and share the meet views, stat lines
 * and career here. Road / cross-country (SD-92) and combined events (SD-93)
 * add their own disciplines on the same engine.
 */
import type { Category, DisciplineDef, PhaseFormat, PhaseKind, Progression, RankedEntry, ResultEntry } from './model.ts';
import type { RecordMark } from './records.ts';
import { categoryKey, categoryLabel, disciplineOf, looseLegal } from './model.ts';
import { formatMark } from './marks.ts';
import { rankEntries, betterMark } from './rank.ts';
import { eventAwards, type Award, type FieldResultInput, type PointsConfig } from './medals.ts';
import type { PlannedPhase } from './plan.ts';
import { fieldRoundPresets } from './field.ts';
import { phaseLabel } from './plan.ts';
import { swimRoundPresets, courseShort, timedFinalPlan, SWIM_ORDER, swimMeetSettings } from './swimming.ts';
import { liftAwards, recordDefsFor, wlMeetSettings } from './weightlifting.ts';
import { shootMeetSettings } from './shooting.ts';
import { archMeetSettings, phaseNameOf } from './archery.ts';

/* ------------------------------ meet settings ----------------------------- */

export interface MeetSettings { positionPoints: number[]; relayFactor: number; handTimed: boolean; reaction: boolean }

/** The meet's points / timing settings from the tournament's athletics format
 *  (the plugin's formatFields: pointsScheme, relayFactor, handTimed, reaction). */
export function meetSettings(fmt?: Record<string, unknown>): MeetSettings {
  const scheme = String(fmt?.pointsScheme ?? '8,7,6,5,4,3,2,1').split(',').map(Number).filter((n) => Number.isFinite(n) && n >= 0);
  return {
    positionPoints: scheme.length ? scheme : [8, 7, 6, 5, 4, 3, 2, 1],
    relayFactor: Number(fmt?.relayFactor ?? 1) || 1,
    handTimed: fmt?.handTimed === true,
    reaction: fmt?.reaction === true,
  };
}

/** SD-97: any event sport's points settings (athletics, swimming, weightlifting). */
export function eventMeetSettings(sport: string, fmt?: Record<string, unknown>): { positionPoints: number[]; relayFactor: number; liftMedals?: boolean } {
  if (sport === 'swimming') return swimMeetSettings(fmt);
  if (sport === 'weightlifting') return wlMeetSettings(fmt);
  if (sport === 'shooting') return shootMeetSettings(fmt);
  if (sport === 'archery') return archMeetSettings(fmt);
  return meetSettings(fmt);
}

/* ------------------------------- categories ------------------------------- */

export const AGE_GROUPS = ['U10', 'U12', 'U14', 'U16', 'U18', 'U20', 'Open'] as const;
export type AgeGroup = (typeof AGE_GROUPS)[number];
export const GENDERS: { key: 'M' | 'F' | 'X'; label: string }[] = [
  { key: 'M', label: 'Boys / Men' }, { key: 'F', label: 'Girls / Women' }, { key: 'X', label: 'Mixed' },
];

/** The upper age of a group (U14 → 14), or undefined for Open. */
export const ageLimit = (age?: string): number | undefined => {
  const m = /^U(\d+)$/i.exec(age ?? '');
  return m ? Number(m[1]) : undefined;
};

/** Is a player eligible for a category? Unknown gender / age never excludes
 *  (the organiser checks); a known mismatch does. Age = years at the meet. */
export function eligibleFor(cat: Category, p: { gender?: string; age?: number }): boolean {
  const g = (p.gender ?? '').trim().toLowerCase();
  const male = /^(m|male|man|boy)/.test(g), female = /^(f|female|woman|girl)/.test(g);
  if (cat.gender === 'M' && female) return false;
  if (cat.gender === 'F' && male) return false;
  const lim = ageLimit(cat.age);
  if (lim != null && p.age != null && p.age >= lim) return false;
  return true;
}

/* ----------------------------- the programme ------------------------------ */

export type TrackGroup = 'sprint' | 'distance' | 'hurdles' | 'relay';
export interface ProgrammeItem { discipline: string; label: string; group: TrackGroup }

const item = (key: string, group: TrackGroup): ProgrammeItem => ({ discipline: `ath.${key}`, label: disciplineOf(`ath.${key}`)!.label, group });
const ageRank = (age?: string) => Math.max(0, AGE_GROUPS.indexOf((age ?? 'Open') as AgeGroup));

/**
 * The D9 school-meet track events offered for a category: 100 / 200 m for
 * everyone, 400 / 800 m from U12, 1500 m from U14, 3000 m from U16; hurdles by
 * age and gender (U14 80 mH; U16 girls 80 mH, boys 100 mH, 300 mH; U18 and up
 * women 100 mH, men 110 mH, 400 mH); 4 × 100 m, and 4 × 400 m from U14.
 * Steeplechase, road, walks and combined events come with SD-92 / SD-93.
 */
export function trackEventsFor(cat: Category): ProgrammeItem[] {
  const r = ageRank(cat.age);
  const U12 = ageRank("U12"), U14 = ageRank("U14"), U16 = ageRank("U16"), U18 = ageRank("U18");
  const out: ProgrammeItem[] = [item('100m', 'sprint'), item('200m', 'sprint')];
  if (r >= U12) out.push(item('400m', 'sprint'), item('800m', 'distance'));
  if (r >= U14) out.push(item('1500m', 'distance'));
  if (r >= U16) out.push(item('3000m', 'distance'));
  const girls = cat.gender !== 'M', boys = cat.gender !== 'F';
  if (r === U14) out.push(item('80mh', 'hurdles'));
  if (r === U16) {
    if (girls) out.push(item('80mh', 'hurdles'));
    if (boys) out.push(item('100mh', 'hurdles'));
    out.push(item('300mh', 'hurdles'));
  }
  if (r >= U18) {
    if (girls) out.push(item('100mh', 'hurdles'));
    if (boys) out.push(item('110mh', 'hurdles'));
    out.push(item('400mh', 'hurdles'));
  }
  out.push(item('4x100', 'relay'));
  if (r >= U14) out.push(item('4x400', 'relay'));
  return out;
}

/** World Athletics hurdle heights (U18, U20, senior). Younger groups follow the
 *  national federation / school board — no height is shown for them. */
export function hurdleHeight(discipline: string, cat: Category): string | undefined {
  const age = cat.age ?? 'Open';
  const H: Record<string, Partial<Record<string, string>>> = {
    'ath.100mh': { 'U18-F': '0.762 m', 'U20-F': '0.838 m', 'Open-F': '0.838 m' },
    'ath.110mh': { 'U18-M': '0.914 m', 'U20-M': '0.991 m', 'Open-M': '1.067 m' },
    'ath.400mh': { 'U18-M': '0.838 m', 'U18-F': '0.762 m', 'U20-M': '0.914 m', 'U20-F': '0.762 m', 'Open-M': '0.914 m', 'Open-F': '0.762 m' },
  };
  return H[discipline]?.[`${age}-${cat.gender ?? 'X'}`];
}

/* --------------------------------- rounds --------------------------------- */

const P = (byPlace: number, byMark: number): Progression => ({ byPlace, byMark });

/** World Athletics TR 20 round tables for races run in eight lanes (100 m to
 *  800 m, sprint hurdles, 400 mH and relays): first round heats / Q / q, then
 *  the semi-finals' heats / Q / q. 9–64 entries; beyond that, the generic plan. */
const WA_LANE_TABLE: { max: number; r1: [number, number, number]; semi?: [number, number, number] }[] = [
  { max: 16, r1: [2, 3, 2] },
  { max: 24, r1: [3, 2, 2] },
  { max: 32, r1: [4, 3, 4], semi: [2, 4, 0] },
  { max: 40, r1: [5, 4, 4], semi: [3, 2, 2] },
  { max: 48, r1: [6, 3, 6], semi: [3, 2, 2] },
  { max: 56, r1: [7, 3, 3], semi: [3, 2, 2] },
  { max: 64, r1: [8, 2, 8], semi: [3, 2, 2] },
];

/** Races without lanes: the final's size and the heats feeding it. */
const OPEN_FINAL: Record<string, number> = { 'ath.1500m': 12, 'ath.3000m': 15 };

const feed = (heats: number, size: number): Progression => {
  const byPlace = Math.max(1, Math.floor((size - 2) / heats));
  return { byPlace, byMark: Math.max(0, size - byPlace * heats) };
};

/** The recommended rounds for `n` entries (World Athletics tables where they
 *  apply). Lane races: straight final up to the lane count. */
export function recommendedRounds(def: DisciplineDef, n: number): PlannedPhase[] {
  if (def.capture !== 'single') return fieldRoundPresets(n)[0].plan;
  const lanes = def.lanes;
  if (!lanes) {
    const size = OPEN_FINAL[def.key] ?? 12;
    const straight = def.key === 'ath.3000m' ? 20 : size + 3;
    if (n <= straight) return [{ phase: 'final', heats: 1 }];
    if (def.key === 'ath.1500m') {
      if (n <= 30) return [{ phase: 'heat', heats: 2, progression: P(5, 2) }, { phase: 'final', heats: 1 }];
      if (n <= 45) return [{ phase: 'heat', heats: 3, progression: P(4, 0) }, { phase: 'final', heats: 1 }];
      if (n <= 60) return [{ phase: 'heat', heats: 4, progression: P(3, 0) }, { phase: 'final', heats: 1 }];
    }
    const heats = Math.ceil(n / Math.max(size + 3, 20));
    return [{ phase: 'heat', heats, progression: feed(heats, size) }, { phase: 'final', heats: 1 }];
  }
  if (n <= lanes) return [{ phase: 'final', heats: 1 }];
  const row = lanes === 8 ? WA_LANE_TABLE.find((r) => n <= r.max) : undefined;
  if (row) {
    const [h, q, qq] = row.r1;
    if (!row.semi) return [{ phase: 'heat', heats: h, progression: P(q, qq) }, { phase: 'final', heats: 1 }];
    const [sh, sq, sqq] = row.semi;
    return [{ phase: 'heat', heats: h, progression: P(q, qq) }, { phase: 'semi', heats: sh, progression: P(sq, sqq) }, { phase: 'final', heats: 1 }];
  }
  return heatsSemisFinal(def, n);
}

/** Heats → final, whatever the count (a final of `lanes`). */
export function heatsFinal(def: DisciplineDef, n: number): PlannedPhase[] {
  const size = def.lanes ?? OPEN_FINAL[def.key] ?? 12;
  const heats = Math.max(2, Math.ceil(n / (def.lanes ?? 20)));
  return [{ phase: 'heat', heats, progression: feed(heats, size) }, { phase: 'final', heats: 1 }];
}

/** Heats → semi-finals → final (two semis up to 24 entries, else three). */
export function heatsSemisFinal(def: DisciplineDef, n: number): PlannedPhase[] {
  const lanes = def.lanes ?? 8;
  const semis = n > 24 ? 3 : 2;
  const heats = Math.max(semis, Math.ceil(n / lanes));
  return [
    { phase: 'heat', heats, progression: feed(heats, semis * lanes) },
    { phase: 'semi', heats: semis, progression: feed(semis, lanes) },
    { phase: 'final', heats: 1 },
  ];
}

export interface RoundsPreset { key: 'wa' | 'final' | 'heats' | 'semis' | 'qual' | 'timed'; label: string; plan: PlannedPhase[] }

/** The round choices the setup screen offers for `n` entries (no duplicates).
 *  Field events (SD-91): straight final or qualification → final of 12. */
export function roundPresets(def: DisciplineDef, n: number): RoundsPreset[] {
  if (def.capture !== 'single') return fieldRoundPresets(n);
  if (def.sport === 'swimming') return swimRoundPresets(def, n);
  const out: RoundsPreset[] = [{ key: 'wa', label: 'Recommended (World Athletics)', plan: recommendedRounds(def, n) }];
  const add = (p: RoundsPreset) => { if (!out.some((x) => JSON.stringify(x.plan) === JSON.stringify(p.plan))) out.push(p); };
  if (!def.lanes || n <= def.lanes) add({ key: 'final', label: 'Straight final', plan: [{ phase: 'final', heats: 1 }] });
  if (n > 2) add({ key: 'heats', label: 'Heats → final', plan: heatsFinal(def, n) });
  if (def.lanes && n > def.lanes * 2) add({ key: 'semis', label: 'Heats → semis → final', plan: heatsSemisFinal(def, n) });
  // SD-94: a timed final — every heat is the final, ranked on time across heats.
  if (def.lanes && n > def.lanes) add({ key: 'timed', label: 'Timed final (heats ranked on time)', plan: timedFinalPlan(def, n) });
  return out;
}

/** "2 heats (first 3 + 2 fastest) → Final" */
export function describePlan(plan: { phase: PhaseKind; heats: number; progression?: Progression }[]): string {
  return plan.map((p) => {
    if (p.phase === 'final') return p.heats > 1 ? `Timed final in ${p.heats} heats (places on time across heats)` : 'Final';
    if (p.phase === 'qualification') {
      const pr = p.progression;
      return `Qualification${p.heats > 1 ? ` (${p.heats} groups)` : ''}${pr?.fillTo ? ` — ${pr.standard != null ? `standard ${pr.standard.toFixed(2)} m or ` : ''}best ${pr.fillTo}` : ''}`;
    }
    const name = p.phase === 'semi' ? (p.heats === 1 ? 'semi-final' : 'semi-finals') : p.heats === 1 ? 'heat' : 'heats';
    const pr = p.progression;
    const how = pr ? [pr.byPlace ? `first ${pr.byPlace}` : '', pr.byMark ? `${pr.byMark} fastest` : ''].filter(Boolean).join(' + ') : '';
    return `${p.heats} ${name}${how ? ` (${how})` : ''}`;
  }).join(' → ');
}

/* ------------------------------- seeding ---------------------------------- */

export interface SeedInput { id: string; seed?: number }

/** Best seed first (time: fastest), unseeded after them — shuffled by `rng`
 *  when given (a draw), else in the order given. */
export function seedOrder<T extends SeedInput>(list: T[], def: Pick<DisciplineDef, 'better'>, rng?: () => number): T[] {
  const seeded = list.filter((e) => e.seed != null).sort((a, b) => (def.better === 'higher' ? (b.seed as number) - (a.seed as number) : (a.seed as number) - (b.seed as number)));
  const rest = list.filter((e) => e.seed == null);
  if (rng) for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  return [...seeded, ...rest];
}

/** A seeded pseudo-random generator (mulberry32) — a reproducible draw. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Manual lane override: put `entryId` in `lane` of `heat`. Whoever had that
 * lane in that heat takes the moved athlete's old heat and lane (a swap).
 * Returns the changed rows only.
 */
export function moveLane(rows: { id: string; heat: number; lane?: number }[], entryId: string, heat: number, lane: number): { id: string; heat: number; lane: number }[] {
  const me = rows.find((r) => r.id === entryId);
  if (!me) return [];
  if (me.heat === heat && me.lane === lane) return [];
  const other = rows.find((r) => r.id !== entryId && r.heat === heat && r.lane === lane);
  const out = [{ id: entryId, heat, lane }];
  if (other) out.push({ id: other.id, heat: me.heat, lane: me.lane ?? lane });
  return out;
}

/* ------------------------------ time entry -------------------------------- */

/**
 * The stopwatch keypad: digits fill from the right — the last two are
 * hundredths, then seconds, minutes, hours. "1085" → 10.85, "15234" →
 * 1:52.34, "1020345" → 1:02:03.45. Seconds / minutes over 59 are rejected.
 */
export function digitsToTime(digits: string): number | null {
  const d = digits.replace(/\D/g, '').replace(/^0+(?=\d{3})/, '');
  if (!d || d.length > 8 || /^0+$/.test(d)) return null;
  const cc = Number(d.slice(-2));
  const ss = Number(d.slice(-4, -2) || 0);
  const mm = Number(d.slice(-6, -4) || 0);
  const hh = Number(d.slice(0, -6) || 0);
  const more = d.length > 4;
  if (more && ss >= 60) return null;
  if (d.length > 6 && mm >= 60) return null;
  return Math.round((hh * 3600 + mm * 60 + ss + cc / 100) * 100) / 100;
}

/** A hand time is read to the tenth; one not ending in a zero hundredth goes to
 *  the next longer tenth (World Athletics TR 19.21): 11.12 → 11.2. */
export const handTime = (v: number): number => Math.ceil(Math.round(v * 100) / 10 - 1e-9) / 10;

/** The usual hand → electronic conversion in ranking lists (statistics only —
 *  the official mark stays the hand time): +0.24 s up to 200 m and sprint
 *  hurdles, +0.14 s for 300 m – 400 m events; none from 800 m. */
export function handConversion(discipline: string): number | undefined {
  if (['ath.100m', 'ath.200m', 'ath.80mh', 'ath.100mh', 'ath.110mh', 'ath.4x100'].includes(discipline)) return 0.24;
  if (['ath.400m', 'ath.300mh', 'ath.400mh'].includes(discipline)) return 0.14;
  return undefined;
}

export function handNote(def: DisciplineDef, mark?: number): string {
  const c = handConversion(def.key);
  const base = 'Hand time: read to the tenth (TR 19.21).';
  if (c == null) return base;
  return `${base} ≈ ${mark != null ? formatMark(Math.round((mark + c) * 100) / 100, def) : `+${c.toFixed(2)} s`} electronic (+${c.toFixed(2)} s, statistics only).`;
}

/** A reaction time under 0.100 s is a false start (TR 16.6) — when the start was recalled. */
export const reactionFalseStart = (rt?: number): boolean => rt != null && rt < 0.1;

/* ---------------------------- share / heat sheets ------------------------- */

export interface SheetRow { heat: number; lane?: number; order?: number; name: string; team?: string; mark?: string; place?: string; flags?: string[] }

/** A WhatsApp-friendly start list ("Heat 1 · L3 Aarav Mehta (Red House)"). */
export function startListText(title: string, rows: SheetRow[], link?: string, icon = '🏃'): string {
  const heats = [...new Set(rows.map((r) => r.heat))].sort((a, b) => a - b);
  const out = [`${icon} START LIST · ${title}`];
  for (const h of heats) {
    if (heats.length > 1) out.push('', `Heat ${h}`);
    for (const r of rows.filter((x) => x.heat === h).sort((a, b) => (a.lane ?? a.order ?? 0) - (b.lane ?? b.order ?? 0))) {
      out.push(`${r.lane != null ? `L${r.lane}` : `#${r.order ?? ''}`} ${r.name}${r.team ? ` (${r.team})` : ''}`);
    }
  }
  if (link) out.push('', `Live results: ${link}`);
  return out.join('\n');
}

/** Results text: places, marks and flags per heat. */
export function resultsText(title: string, rows: SheetRow[], final: boolean, link?: string, icon = '🏃'): string {
  const heats = [...new Set(rows.map((r) => r.heat))].sort((a, b) => a - b);
  const out = [`${icon} ${final ? 'RESULTS' : 'LIVE'} · ${title}`];
  for (const h of heats) {
    if (heats.length > 1) out.push('', h === 0 ? 'Overall' : `Heat ${h}`);
    for (const r of rows.filter((x) => x.heat === h)) {
      if (!r.mark && !r.place) continue;
      out.push(`${r.place ? `${r.place}. ` : ''}${r.name}${r.team ? ` (${r.team})` : ''} ${r.mark ?? ''}${r.flags?.length ? ` ${r.flags.join(' ')}` : ''}`.trim());
    }
  }
  if (link) out.push('', `Full results: ${link}`);
  return out.join('\n');
}

/* ------------------------------ stat lines -------------------------------- */

/** The stat-line key for an athlete's legal mark in a discipline ('ath.100m' →
 *  'm_100m'). SD-94 swimming keeps the pool length in the key — long and short
 *  course are separate PBs / records: 'swim.50free' + LCM → 'm_sw_50free_lc'. */
export const markKey = (discipline: string, course?: 'LCM' | 'SCM') =>
  (/^swim\./.test(discipline) ? `m_sw_${discipline.slice(5)}_${course === 'SCM' ? 'sc' : 'lc'}` : `m_${discipline.replace(/^ath\./, '')}`);

/** The discipline + course a mark key came from ('m_sw_50free_sc' → swim.50free, SCM). */
export function markKeyDiscipline(key: string): { discipline: string; course?: 'LCM' | 'SCM' } {
  const m = /^m_sw_(.+)_(lc|sc)$/.exec(key);
  if (m) return { discipline: `swim.${m[1]}`, course: m[2] === 'sc' ? 'SCM' : 'LCM' };
  return { discipline: `ath.${key.slice(2)}` };
}

export interface PhaseLine { playerId: string; stats: Record<string, number>; won: boolean }

/**
 * The stat lines a finished round writes to athletes' profiles (one per
 * athlete; relay members get one too). `ranked` = the whole phase, ranked per
 * heat. In a final, medals and position points are added (`awards`).
 *   races / relays = started (DNS writes nothing), place, mark (+ the
 *   discipline's legal mark key), wind, hand, Q / q, finals, golds / silvers /
 *   bronzes, posPoints (position points), dnf / dq.
 */
export function phaseLines(f: Pick<PhaseFormat, 'discipline' | 'phase' | 'category'>, ranked: RankedEntry[], awards: Award[] = []): PhaseLine[] {
  const def = disciplineOf(f.discipline);
  if (!def) return [];
  const byEntry = new Map(awards.map((a) => [a.entryId, a]));
  const out: PhaseLine[] = [];
  for (const r of ranked) {
    if (r.status === 'DNS' || r.status === 'WD') continue;
    const s: Record<string, number> = {};
    const a = byEntry.get(r.id);
    if (r.position != null) s.place = r.position;
    if (r.status === 'DNF') s.dnf = 1;
    if (r.status === 'DQ' || r.status === 'FS') s.dq = 1;
    if (r.flags.includes('Q') || r.flags.includes('q')) s.qualified = 1;
    if (f.phase === 'final') s.finals = 1;
    if (a?.medal === 'gold') s.golds = 1;
    if (a?.medal === 'silver') s.silvers = 1;
    if (a?.medal === 'bronze') s.bronzes = 1;
    const relay = !r.entry.athleteId;
    if (relay) {
      s.relays = 1;
      for (const m of r.entry.result.members ?? []) if (m.playerId) out.push({ playerId: m.playerId, stats: { ...s }, won: a?.medal === 'gold' });
      continue;
    }
    // SD-91: a field event counts as an event, not a race
    if (def.capture === 'single') s.races = 1; else s.field = 1;
    if (a && a.points > 0) s.posPoints = a.points;
    if (r.best != null) s.mark = r.best;
    if (r.bestLegal != null) s[markKey(def.key, f.category?.course)] = r.bestLegal;
    if (r.entry.result.wind != null && def.wind === 'race') s.wind = r.entry.result.wind;
    // the best jump's wind (LJ / TJ)
    if (def.wind === 'attempt' && r.wind != null) s.wind = r.wind;
    if (r.entry.result.hand) s.hand = 1;
    out.push({ playerId: r.entry.athleteId!, stats: s, won: a?.medal === 'gold' });
  }
  return out;
}

/* --------------------------------- career --------------------------------- */

/** What the career needs to know about a phase a line came from. */
export interface PhaseInfo { discipline: string; category?: Category; phase: PhaseKind; title: string; date: string; eventTitle?: string; implement?: string }

export interface CareerBest { discipline: string; label: string; category?: string; value: number; text: string; date: string; eventId: string; wind?: number; hand?: boolean; implement?: string }
export interface CareerRace { eventId: string; title: string; date: string; discipline?: string; text: string; place?: number; medal?: 'gold' | 'silver' | 'bronze'; flags: string[] }
export interface AthleticsCareer {
  races: number; relays: number; finals: number; golds: number; silvers: number; bronzes: number; points: number;
  /** SD-91: field events competed in (one per round) */
  field: number;
  /** personal bests per event (hurdles per event + category: the barrier height
   *  differs; throws per implement — a 3 kg and a 4 kg shot are different events) */
  bests: { key: string; label: string; pb: CareerBest; sb?: CareerBest }[];
  history: CareerRace[];
}

/** The athletics career from a player's athletics stat lines (each carries
 *  `eventId` = the phase) and what's known of those phases. `seasonFrom` =
 *  the first day of "this season" (ISO date). History newest first. */
export function athleticsCareer(
  lines: { eventId?: string; stats: Record<string, number>; date?: string; opponent?: string }[],
  phases: Map<string, PhaseInfo>,
  seasonFrom: string,
): AthleticsCareer {
  const c: AthleticsCareer = { races: 0, relays: 0, field: 0, finals: 0, golds: 0, silvers: 0, bronzes: 0, points: 0, bests: [], history: [] };
  const bests = new Map<string, { key: string; label: string; pb: CareerBest; sb?: CareerBest }>();
  // Oldest first, so a PB / SB flag on the history reads "at the time".
  const sorted = [...lines].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  const pbSoFar = new Map<string, number>();
  for (const l of sorted) {
    const s = l.stats ?? {};
    c.races += s.races ?? 0; c.relays += s.relays ?? 0; c.field += s.field ?? 0; c.finals += s.finals ?? 0;
    c.golds += s.golds ?? 0; c.silvers += s.silvers ?? 0; c.bronzes += s.bronzes ?? 0;
    c.points += s.posPoints ?? 0;
    const info = l.eventId ? phases.get(l.eventId) : undefined;
    const key = Object.keys(s).find((k) => k.startsWith('m_'));
    const fromKey = key ? markKeyDiscipline(key) : undefined;
    const discipline = info?.discipline ?? fromKey?.discipline;
    // SD-94: swimming PBs per pool length
    const course = info?.category?.course ?? fromKey?.course;
    const def = discipline ? disciplineOf(discipline) : undefined;
    // the full timestamp (shown in local time); the day for the season
    const date = info?.date ?? l.date ?? '';
    const day = date.slice(0, 10);
    const flags: string[] = [];
    if (def && key && s[key] != null) {
      const v = s[key];
      const hurdles = /mh$/.test(def.key);
      const throwKey = THROWS.includes(def.key);
      const implement = throwKey ? info?.implement : undefined;
      const swim = def.sport === 'swimming';
      const bk = swim ? `${def.key}|${course ?? 'LCM'}` : hurdles || (throwKey && !implement) ? `${def.key}|${categoryKey(info?.category)}` : implement ? `${def.key}|${implement}` : def.key;
      const best: CareerBest = {
        discipline: def.key, label: def.label, category: info?.category ? categoryLabel(info.category) : undefined, value: v,
        text: formatMark(v, def) + (s.hand ? 'h' : ''), date, eventId: l.eventId ?? '', wind: s.wind, hand: !!s.hand, ...(implement ? { implement } : {}),
      };
      const prev = pbSoFar.get(bk);
      if (prev == null || betterMark(v, prev, def)) { if (prev != null) flags.push('PB'); pbSoFar.set(bk, v); }
      const label = swim ? `${def.label} (${courseShort(course)})` : implement ? `${def.label} (${implement})` : (hurdles || throwKey) && best.category ? `${def.label} (${best.category})` : def.label;
      const row = bests.get(bk) ?? { key: bk, label, pb: best };
      if (betterMark(v, row.pb.value, def)) row.pb = best;
      if (day >= seasonFrom && (!row.sb || betterMark(v, row.sb.value, def))) row.sb = best;
      bests.set(bk, row);
    }
    if (s.qualified) flags.push('Q');
    const medal = s.golds ? 'gold' : s.silvers ? 'silver' : s.bronzes ? 'bronze' : undefined;
    const markText = def && s.mark != null ? formatMark(s.mark, def) + (s.hand ? 'h' : '') : '';
    const text = [
      s.place ? `${s.place}${ordSuffix(s.place)}` : s.dnf ? 'DNF' : s.dq ? 'DQ' : '',
      markText,
      s.wind != null ? `(${s.wind > 0 ? '+' : ''}${s.wind.toFixed(1)})` : '',
      s.relays ? 'relay' : '',
    ].filter(Boolean).join(' ');
    c.history.push({ eventId: l.eventId ?? '', title: info?.title ?? l.opponent ?? (s.field ? 'Field event' : 'Race'), date, discipline, text, place: s.place, medal, flags });
  }
  c.points = Math.round(c.points * 100) / 100;
  c.bests = [...bests.values()].sort((a, b) => order(a.pb.discipline) - order(b.pb.discipline) || a.key.localeCompare(b.key));
  c.history.reverse();
  return c;
}

const ORDER = ['ath.100m', 'ath.200m', 'ath.400m', 'ath.800m', 'ath.1500m', 'ath.3000m', 'ath.80mh', 'ath.100mh', 'ath.110mh', 'ath.300mh', 'ath.400mh',
  'ath.lj', 'ath.tj', 'ath.hj', 'ath.pv', 'ath.sp', 'ath.dt', 'ath.jt', 'ath.ht', ...SWIM_ORDER];
const THROWS = ['ath.sp', 'ath.dt', 'ath.jt', 'ath.ht'];
const order = (d: string) => { const i = ORDER.indexOf(d); return i < 0 ? 99 : i; };
export const ordSuffix = (n: number) => { const v = n % 100; return ['th', 'st', 'nd', 'rd'][(v - 20) % 10] ?? ['th', 'st', 'nd', 'rd'][v] ?? 'th'; };

/* --------------------------- meet-level views ----------------------------- */

/** One event of a meet with every phase loaded. */
export interface MeetPhase { id: string; format: PhaseFormat; status: 'scheduled' | 'live' | 'completed'; date: string; entries: ResultEntry[] }
export interface MeetEvent { eventKey: string; title: string; discipline: string; category?: Category; phases: MeetPhase[] }

/** Group a meet's phases by event, phases in order. */
export function groupMeet(phases: MeetPhase[]): MeetEvent[] {
  const by = new Map<string, MeetEvent>();
  for (const p of phases) {
    const f = p.format;
    const ev = by.get(f.eventKey) ?? { eventKey: f.eventKey, title: f.eventTitle ?? disciplineOf(f.discipline)?.label ?? 'Event', discipline: f.discipline, category: f.category, phases: [] };
    ev.phases.push(p);
    by.set(f.eventKey, ev);
  }
  for (const e of by.values()) e.phases.sort((a, b) => a.format.phaseNo - b.format.phaseNo);
  return [...by.values()];
}

/** Where an event stands: "Heats · live", "Final ✓" … */
export function eventStatus(e: MeetEvent): { label: string; done: boolean; live: boolean } {
  const cur = [...e.phases].reverse().find((p) => p.status !== 'completed') ?? e.phases[e.phases.length - 1];
  const done = !!cur && cur.format.phase === 'final' && cur.status === 'completed';
  // SD-95: archery phases read "Ranking round" / "Match play"
  return { label: cur ? `${phaseNameOf(cur.format)}${done ? ' · final results' : cur.status === 'live' ? ' · live' : ' · start list'}` : '', done, live: cur?.status === 'live' };
}

export interface PointsSettings extends PointsConfig {
  /** relay points multiplier (many school meets score relays double) */
  relayFactor?: number;
  /** SD-97 weightlifting: medals (and points) for the snatch and the C&J too, not only the total */
  liftMedals?: boolean;
}

/** A finished final's medals and points (relays × relayFactor), or null. */
function finalAwards(e: MeetEvent, cfg: PointsSettings, handLegal?: boolean): { awards: Award[]; fin: MeetPhase } | null {
  const fin = e.phases.find((p) => p.format.phase === 'final' && p.status === 'completed');
  const def = disciplineOf(e.discipline);
  if (!fin || !def) return null;
  const rows = rankEntries(fin.entries, def, { handLegal: handLegal ?? looseLegal(fin.format) });
  let awards = eventAwards(rows, cfg);
  if (def.teamSize && cfg.relayFactor && cfg.relayFactor !== 1) awards = awards.map((a) => ({ ...a, points: Math.round(a.points * cfg.relayFactor! * 100) / 100 }));
  return { awards, fin };
}

/** Each finished final's medals and position points → the tournament's medal /
 *  house table (`medalStandings` fieldResults). */
export function meetFieldResults(events: MeetEvent[], cfg: PointsSettings = {}, handLegal?: boolean): FieldResultInput[] {
  const out: FieldResultInput[] = [];
  for (const e of events) {
    const r = finalAwards(e, cfg, handLegal);
    if (!r) continue;
    out.push({ sport: disciplineOf(e.discipline)!.sport, event: e.title, awards: r.awards });
    // SD-97: separate snatch and C&J medals when the meet awards them
    if (cfg.liftMedals && disciplineOf(e.discipline)?.capture === 'lifts') {
      const la = liftAwards(r.fin.entries, cfg);
      out.push({ sport: 'weightlifting', event: `${e.title} — Snatch`, awards: la.snatch }, { sport: 'weightlifting', event: `${e.title} — Clean & jerk`, awards: la.cj });
    }
  }
  return out;
}

export interface EventLeader { eventKey: string; title: string; category: string; discipline: string; name: string; team?: string; athleteId?: string; mark: number; text: string; legal: boolean; flags: string[] }

/** The best mark of each event over all its rounds (fastest time; SD-91: the
 *  longest / highest) — per event per category. Wind-aided / hand marks are
 *  shown with w / h. */
export function eventLeaders(events: MeetEvent[]): EventLeader[] {
  const out: EventLeader[] = [];
  for (const e of events) {
    const def = disciplineOf(e.discipline);
    if (!def) continue;
    let best: EventLeader | undefined;
    for (const p of e.phases) {
      for (const r of rankEntries(p.entries, def, { handLegal: looseLegal(p.format) })) {
        if (r.position == null || r.best == null) continue;
        if (!best || betterMark(r.best, best.mark, def)) {
          best = { eventKey: e.eventKey, title: e.title, category: categoryLabel(e.category), discipline: def.key, name: r.entry.name, team: r.entry.team?.name, athleteId: r.entry.athleteId, mark: r.best, text: r.bestText, legal: r.legal, flags: r.flags.filter((x) => x === 'w' || x === 'h') };
        }
      }
    }
    if (best) out.push(best);
  }
  return out;
}

export interface TopAthlete { athleteId: string; name: string; team?: string; points: number; golds: number; silvers: number; bronzes: number; events: number }

/** Best performers by position points from individual finals (relays score
 *  for the house, not the athlete), then golds, silvers, bronzes. Optionally
 *  within one category. */
export function topAthletes(events: MeetEvent[], cfg: PointsSettings = {}, category?: string): TopAthlete[] {
  const by = new Map<string, TopAthlete>();
  for (const e of events) {
    if (category && categoryKey(e.category) !== category) continue;
    const r = finalAwards(e, cfg);
    if (!r) continue;
    for (const a of r.awards) {
      const athleteId = r.fin.entries.find((x) => x.id === a.entryId)?.athleteId;
      if (!athleteId) continue;
      const t = by.get(athleteId) ?? { athleteId, name: a.name, team: a.team?.name, points: 0, golds: 0, silvers: 0, bronzes: 0, events: 0 };
      t.points = Math.round((t.points + a.points) * 100) / 100;
      t.events += 1;
      if (a.medal === 'gold') t.golds += 1; else if (a.medal === 'silver') t.silvers += 1; else if (a.medal === 'bronze') t.bronzes += 1;
      by.set(athleteId, t);
    }
  }
  return [...by.values()].sort((a, b) => b.points - a.points || b.golds - a.golds || b.silvers - a.silvers || b.bronzes - a.bronzes || a.name.localeCompare(b.name));
}

/**
 * A record book derived from completed results (no storage): the best legal
 * mark per discipline + category. Used for the school record (SR) — the best
 * ever at the organisation's other meets.
 */
export function deriveRecordBook(events: MeetEvent[], scope: 'MR' | 'SR'): RecordMark[] {
  const out = new Map<string, RecordMark>();
  for (const e of events) {
    const base = disciplineOf(e.discipline);
    if (!base) continue;
    const cat = categoryKey(e.category);
    // SD-97: a weightlifting session keeps snatch, C&J and total records
    for (const def of recordDefsFor(base)) for (const p of e.phases) {
      if (p.status !== 'completed') continue;
      for (const r of rankEntries(p.entries, def, { handLegal: looseLegal(p.format) })) {
        if (r.position == null || r.bestLegal == null) continue;
        const k = `${def.key}|${cat}`;
        const cur = out.get(k);
        if (!cur || betterMark(r.bestLegal, cur.value, def)) {
          out.set(k, { scope, discipline: def.key, category: cat, value: r.bestLegal, holder: r.entry.name, team: r.entry.team?.name, date: p.date.slice(0, 10), eventKey: e.eventKey });
        }
      }
    }
  }
  return [...out.values()];
}
