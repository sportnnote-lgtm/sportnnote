/**
 * SD-94 — swimming on the results engine (World Aquatics Swimming Rules, SW).
 * The programme by category and pool length, meet settings (course, lanes,
 * manual timing, splits), round presets (straight / timed final, heats →
 * final, heats → semi-finals → final), seeding (SW 3.1.1 heats, SW 3.1.2 lanes,
 * SW 3.2.1 semi-finals), swim-offs (SW 3.2.3), DQ codes (SW 4–10), manual
 * timing from three watches (SW 11.3), 50 m splits and relay legs (SW 9.3,
 * 10.11–10.15). Ranking, Q / q, records and medals are the generic engine:
 * times to 1/100, ties stand (SW 11.2, 13.4.2). Pure — no imports from
 * athletics.ts (it imports this file).
 *
 * Rule text read from the World Aquatics Swimming Rules 2023–2025 (valid from
 * 1 January 2023). The school programme by age group is a house choice (no
 * World Aquatics rule) — organisers can add any event.
 */
import type { Category, DisciplineDef, PhaseKind } from './model.ts';
import { DISCIPLINES, disciplineOf } from './model.ts';
import type { PlannedPhase } from './plan.ts';
import type { Seeded } from './progression.ts';

/* ------------------------------ events ------------------------------------ */

export type Stroke = 'free' | 'back' | 'breast' | 'fly' | 'im' | 'medley';
export type Course = 'LCM' | 'SCM';

export const COURSES: { key: Course; label: string; short: string; pool: number }[] = [
  { key: 'LCM', label: '50 m pool (long course)', short: 'LC', pool: 50 },
  { key: 'SCM', label: '25 m pool (short course)', short: 'SC', pool: 25 },
];
/** "LC" / "SC" (long course when not set). */
export const courseShort = (c?: Course | string): string => (c === 'SCM' ? 'SC' : 'LC');
export const courseLabel = (c?: Course | string): string => (c === 'SCM' ? COURSES[1].label : COURSES[0].label);

export interface SwimEvent { distance: number; stroke: Stroke; relay: boolean; legs: number; legDistance: number }

/** 'swim.4x100medley' → 400 m medley relay, 4 legs of 100 m. */
export function swimEventOf(key: string): SwimEvent | null {
  const m = /^swim\.(4x)?(\d+)(free|back|breast|fly|im|medley)$/.exec(key);
  if (!m) return null;
  const leg = Number(m[2]);
  const relay = !!m[1];
  return { distance: relay ? leg * 4 : leg, stroke: m[3] as Stroke, relay, legs: relay ? 4 : 1, legDistance: leg };
}

/** Every swimming discipline in programme order (careers, record books). */
export const SWIM_ORDER: string[] = DISCIPLINES.filter((d) => d.sport === 'swimming').map((d) => d.key);

/* ---------------------------- meet settings -------------------------------- */

export interface SwimMeetSettings {
  positionPoints: number[];
  relayFactor: number;
  /** manual timing (stopwatches, SW 11.3) — times still to 1/100, count for meet records */
  manual: boolean;
  reaction: boolean;
  course: Course;
  lanes: number;
  splits: boolean;
}

/** The meet's settings from the tournament's swimming format (the plugin's formatFields). */
export function swimMeetSettings(fmt?: Record<string, unknown>): SwimMeetSettings {
  const scheme = String(fmt?.pointsScheme ?? '8,7,6,5,4,3,2,1').split(',').map(Number).filter((n) => Number.isFinite(n) && n >= 0);
  const lanes = Number(fmt?.lanes ?? 8);
  return {
    positionPoints: scheme.length ? scheme : [8, 7, 6, 5, 4, 3, 2, 1],
    relayFactor: Number(fmt?.relayFactor ?? 1) || 1,
    manual: fmt?.handTimed === true,
    reaction: fmt?.reaction === true,
    course: fmt?.course === 'SCM' ? 'SCM' : 'LCM',
    lanes: [4, 5, 6, 8, 10].includes(lanes) ? lanes : 8,
    splits: fmt?.splits !== false,
  };
}

/* ------------------------------ programme ---------------------------------- */

export type SwimGroup = 'free' | 'back' | 'breast' | 'fly' | 'im' | 'relay';
export interface SwimProgrammeItem { discipline: string; label: string; group: SwimGroup }

const AGES = ['U10', 'U12', 'U14', 'U16', 'U18', 'U20', 'Open'];
const ageRank = (age?: string) => Math.max(0, AGES.indexOf(age ?? 'Open'));
const sItem = (key: string, group: SwimGroup): SwimProgrammeItem => ({ discipline: `swim.${key}`, label: disciplineOf(`swim.${key}`)!.label, group });

/**
 * The events offered for a category in a pool (a school-meet default, not a
 * World Aquatics rule): 50 m of every stroke and the 4 × 50 m relays for
 * everyone; 100 m of every stroke, 200 m free and 200 m IM from U12; 400 m free,
 * 200 m back / breast / fly and the 4 × 100 m relays from U14; 800 / 1500 m free,
 * 400 m IM and the 4 × 200 m free relay from U16. 100 m IM is short course only
 * (SW 12.2). Mixed (2 + 2, SW 10.11) is relays only — individual races are by
 * gender (SW 10.1).
 */
export function swimEventsFor(cat: Category, course: Course = 'LCM'): SwimProgrammeItem[] {
  const r = ageRank(cat.age);
  const U12 = ageRank('U12'), U14 = ageRank('U14'), U16 = ageRank('U16');
  const out: SwimProgrammeItem[] = [];
  if (cat.gender !== 'X') {
    out.push(sItem('50free', 'free'));
    if (r >= U12) out.push(sItem('100free', 'free'), sItem('200free', 'free'));
    if (r >= U14) out.push(sItem('400free', 'free'));
    if (r >= U16) out.push(sItem('800free', 'free'), sItem('1500free', 'free'));
    for (const s of ['back', 'breast', 'fly'] as const) {
      out.push(sItem(`50${s}`, s));
      if (r >= U12) out.push(sItem(`100${s}`, s));
      if (r >= U14) out.push(sItem(`200${s}`, s));
    }
    if (course === 'SCM') out.push(sItem('100im', 'im'));
    if (r >= U12) out.push(sItem('200im', 'im'));
    if (r >= U16) out.push(sItem('400im', 'im'));
  }
  out.push(sItem('4x50free', 'relay'), sItem('4x50medley', 'relay'));
  if (r >= U14) out.push(sItem('4x100free', 'relay'), sItem('4x100medley', 'relay'));
  if (r >= U16 && cat.gender !== 'X') out.push(sItem('4x200free', 'relay'));
  return out;
}

/* -------------------------------- rounds ----------------------------------- */

const lanesOf = (def: Pick<DisciplineDef, 'lanes'>, lanes?: number) => lanes ?? def.lanes ?? 8;

/** One timed final: as many heats as the lanes need, ranked on time across heats. */
export function timedFinalPlan(def: Pick<DisciplineDef, 'lanes'>, n: number, lanes?: number): PlannedPhase[] {
  return [{ phase: 'final', heats: Math.max(1, Math.ceil(n / lanesOf(def, lanes))) }];
}

export interface SwimRoundsPreset { key: 'final' | 'timed' | 'heats' | 'semis'; label: string; plan: PlannedPhase[] }

/**
 * Round choices for `n` entries in a pool of `lanes`: a straight final when the
 * field fits (SW 3.1.1.1 — one heat is seeded as a final); else a timed final
 * (common at school meets: every heat counts, places on time), heats → final
 * (the fastest `lanes` on time, q), and heats → two semi-finals → final once
 * there are more than two pools' worth (fastest 2 × lanes, then `lanes`).
 */
export function swimRoundPresets(def: Pick<DisciplineDef, 'lanes'>, n: number, lanes?: number): SwimRoundsPreset[] {
  const L = lanesOf(def, lanes);
  if (n <= L) return [{ key: 'final', label: 'Straight final', plan: [{ phase: 'final', heats: 1 }] }];
  const H = Math.ceil(n / L);
  const out: SwimRoundsPreset[] = [
    { key: 'timed', label: 'Timed final (heats ranked on time)', plan: timedFinalPlan(def, n, L) },
    { key: 'heats', label: 'Heats → final', plan: [{ phase: 'heat', heats: H, progression: { byMark: L } }, { phase: 'final', heats: 1 }] },
  ];
  if (n > 2 * L) {
    out.push({ key: 'semis', label: 'Heats → semi-finals → final', plan: [
      { phase: 'heat', heats: H, progression: { byMark: 2 * L } },
      { phase: 'semi', heats: 2, progression: { byMark: L } },
      { phase: 'final', heats: 1 },
    ] });
  }
  return out;
}

/* ------------------------------- seeding ----------------------------------- */

/**
 * Heat sizes, heat 1 first: the last heats are full, the first takes the rest —
 * but at least three swimmers (SW 3.1.1.6), taken from the next heat.
 */
export function heatSizes(n: number, lanes: number, heats?: number): number[] {
  const H = Math.max(1, heats ?? 0, Math.ceil(n / Math.max(1, lanes)));
  if (H === 1) return [n];
  const sizes = Array.from({ length: H }, () => lanes);
  sizes[0] = n - lanes * (H - 1);
  // more heats planned than the field needs: spread from the back
  for (let i = 0; sizes[i] < 0 && i < H - 1; i++) { sizes[i + 1] += sizes[i]; sizes[i] = 0; }
  if (sizes[0] < 3 && sizes[1] != null) { const need = Math.min(3 - sizes[0], Math.max(0, sizes[1] - 3)); sizes[0] += need; sizes[1] -= need; }
  return sizes;
}

/**
 * Which ranks (0 = fastest entry time) swim in which heat (index 0 = heat 1).
 * Preliminary heats (SW 3.1.1): two heats alternate from the last heat
 * (3.1.1.2); three or more circle-seed the last three heats (3.1.1.3–4) and the
 * heats before them take the next fastest in turn; 400 / 800 / 1500 m circle the
 * last two only (3.1.1.5). A timed final — or `consecutive` — fills the last
 * heat with the fastest, the heat before with the next, and so on.
 */
export function heatAssignment(n: number, lanes: number, opts: { heats?: number; consecutive?: boolean; distance?: number } = {}): number[][] {
  const sizes = heatSizes(n, lanes, opts.heats);
  const H = sizes.length;
  const out: number[][] = sizes.map(() => []);
  if (H === 1) { out[0] = Array.from({ length: n }, (_, i) => i); return out; }
  let rank = 0;
  const k = opts.consecutive ? 0 : (opts.distance ?? 0) >= 400 ? 2 : Math.min(3, H);
  // circle seeding over the last k heats
  const circle = Array.from({ length: k }, (_, i) => H - 1 - i);
  const circleTotal = circle.reduce((t, h) => t + sizes[h], 0);
  while (rank < circleTotal) {
    for (const h of circle) if (out[h].length < sizes[h] && rank < circleTotal) out[h].push(rank++);
  }
  // then heat by heat, fastest first, from the back
  for (let h = H - 1 - k; h >= 0; h--) while (out[h].length < sizes[h] && rank < n) out[h].push(rank++);
  return out;
}

/**
 * Lane order, fastest first (SW 3.1.2): the fastest in the centre lane (odd
 * lane counts), lane 3 of 6, lane 4 of 8, lane 4 of a 10-lane pool (lanes 0–9);
 * the next fastest on their left (the next lane up), then alternating right
 * and left. 8 lanes: 4 5 3 6 2 7 1 8 · 10 lanes: 4 5 3 6 2 7 1 8 0 9.
 */
export function swimLaneOrder(lanes: number): number[] {
  const first = lanes === 10 ? 0 : 1;
  const last = first + lanes - 1;
  const centre = lanes === 10 ? 4 : lanes % 2 ? (lanes + 1) / 2 : lanes / 2;
  const out = [centre];
  for (let d = 1; out.length < lanes; d++) {
    if (centre + d <= last) out.push(centre + d);
    if (centre - d >= first && out.length < lanes) out.push(centre - d);
  }
  return out;
}

/**
 * Seed ranked ids (fastest first; no-time entries last, already drawn) into a
 * phase's heats and lanes: preliminary heats per SW 3.1.1, semi-finals per
 * SW 3.2.1 (alternating, the fastest in the last semi), a final or a timed
 * final fastest-heat-last; lanes per SW 3.1.2 inside every heat.
 */
export function swimSeed(rankedIds: string[], phase: PhaseKind, heats: number, lanes: number, discipline: string): Seeded[] {
  const n = rankedIds.length;
  let groups: number[][];
  if (phase === 'semi') {
    const H = Math.max(1, heats);
    groups = Array.from({ length: H }, () => [] as number[]);
    rankedIds.forEach((_, i) => groups[H - 1 - (i % H)].push(i));
  } else if (phase === 'final' && heats <= 1) {
    // one final, even with a tie at the line still to be swum off (extra lanes)
    groups = [Array.from({ length: n }, (_, i) => i)];
  } else {
    groups = heatAssignment(n, lanes, { heats, consecutive: phase === 'final', distance: swimEventOf(discipline)?.distance });
  }
  const pattern = swimLaneOrder(lanes);
  const out: Seeded[] = [];
  groups.forEach((ranks, h) => {
    [...ranks].sort((a, b) => a - b).forEach((rank, i) => {
      // more swimmers than lanes (a tie at the line): extra lanes past the pattern
      const lane = pattern[i] ?? pattern[pattern.length - 1] + (i - pattern.length + 1);
      out.push({ id: rankedIds[rank], heat: h + 1, lane, order: i + 1 });
    });
  });
  return out;
}

/** Timed-final heats for any lane race (athletics too): fastest heat last,
 *  at least three in the first heat. Ranks (0 = best seed) per heat. */
export const timedFinalHeats = (n: number, lanes: number): number[][] => heatAssignment(n, lanes, { consecutive: true });

/* ----------------------------- relays ------------------------------------- */

/** SW 9.3: the medley relay order. */
export const MEDLEY_LEGS = ['Backstroke', 'Breaststroke', 'Butterfly', 'Freestyle'] as const;
/** SW 9.1: the individual medley order. */
export const IM_ORDER = ['Butterfly', 'Backstroke', 'Breaststroke', 'Freestyle'] as const;

/** The leg names for a relay: the medley strokes, else "Leg 1" … "Leg 4". */
export function legLabels(discipline: string): string[] {
  const e = swimEventOf(discipline);
  if (e?.stroke === 'medley') return [...MEDLEY_LEGS];
  return ['Leg 1', 'Leg 2', 'Leg 3', 'Leg 4'];
}

/** SW 10.11: a mixed relay is two men and two women. Unknown genders aren't held against it. */
export function mixedRelayError(genders: (string | undefined)[]): string | null {
  const g = genders.slice(0, 4).map((x) => (x ?? '').trim().toLowerCase());
  const men = g.filter((x) => /^(m|male|man|boy)/.test(x)).length;
  const women = g.filter((x) => /^(f|female|woman|girl)/.test(x)).length;
  if (men > 2 || women > 2) return `A mixed relay is 2 men and 2 women (SW 10.11) — this team has ${men} and ${women}.`;
  return null;
}

/* ---------------------------- disqualifications ---------------------------- */

export interface DqCode { ref: string; label: string; strokes?: Stroke[]; relay?: boolean; legged?: boolean }

const STROKES4: Stroke[] = ['free', 'back', 'breast', 'fly'];

/** World Aquatics disqualifications an official picks from (SW 4–10). */
export const SWIM_DQ: DqCode[] = [
  { ref: 'SW 4.4', label: 'Started before the signal' },
  { ref: 'SW 5.2', label: 'No touch at a turn or the finish', strokes: ['free'] },
  { ref: 'SW 5.3', label: 'Under water past 15 m', strokes: ['free'] },
  { ref: 'SW 6.2', label: 'Not on the back', strokes: ['back'] },
  { ref: 'SW 6.3', label: 'Under water past 15 m', strokes: ['back'] },
  { ref: 'SW 6.4', label: 'Illegal turn', strokes: ['back'] },
  { ref: 'SW 6.5', label: 'Finish not on the back', strokes: ['back'] },
  { ref: 'SW 7.1', label: 'Illegal pull-out / extra dolphin kick', strokes: ['breast'] },
  { ref: 'SW 7.2', label: 'Off the breast / arms alternating', strokes: ['breast'] },
  { ref: 'SW 7.4', label: 'Head under for a cycle / legs alternating', strokes: ['breast'] },
  { ref: 'SW 7.5', label: 'Scissor, flutter or butterfly kick', strokes: ['breast'] },
  { ref: 'SW 7.6', label: 'One-hand or non-simultaneous touch', strokes: ['breast'] },
  { ref: 'SW 8.2', label: 'Arms not simultaneous', strokes: ['fly'] },
  { ref: 'SW 8.3', label: 'Alternating or breaststroke kick', strokes: ['fly'] },
  { ref: 'SW 8.4', label: 'One-hand or non-simultaneous touch', strokes: ['fly'] },
  { ref: 'SW 8.5', label: 'Under water past 15 m', strokes: ['fly'] },
  { ref: 'SW 9.1', label: 'Strokes out of order (fly, back, breast, free)', strokes: ['im'] },
  { ref: 'SW 9.3', label: 'Strokes out of order (back, breast, fly, free)', strokes: ['medley'] },
  { ref: 'SW 10.2', label: 'Did not complete the distance' },
  { ref: 'SW 10.4', label: 'Did not finish in own lane' },
  { ref: 'SW 10.5', label: 'Stepped off the bottom at a turn' },
  { ref: 'SW 10.7', label: 'Pulled on the lane rope' },
  { ref: 'SW 10.8', label: 'Obstructed another swimmer' },
  { ref: 'SW 10.13', label: 'Early take-off', relay: true, legged: true },
  { ref: 'SW 10.14', label: 'Team member entered the water', relay: true },
  { ref: 'SW 10.15', label: 'Swam out of the listed order', relay: true },
];

/** The DQ codes that apply to an event: its stroke(s) — all four in a medley —
 *  plus the general ones, and the relay ones for a relay. */
export function dqCodesFor(discipline: string): DqCode[] {
  const e = swimEventOf(discipline);
  if (!e) return SWIM_DQ.filter((c) => !c.strokes && !c.relay);
  const strokes = e.stroke === 'im' || e.stroke === 'medley' ? [...STROKES4, e.stroke] : [e.stroke];
  return SWIM_DQ.filter((c) => (!c.strokes || c.strokes.some((s) => strokes.includes(s))) && (!c.relay || e.relay));
}

/** "Early take-off — leg 3" / "One-hand or non-simultaneous touch — Breaststroke leg". */
export function dqReason(code: DqCode, leg?: number, discipline?: string): string {
  if (leg == null) return code.label;
  const legs = discipline ? legLabels(discipline) : [];
  const name = legs[leg - 1] && !/^Leg /.test(legs[leg - 1]) ? `${legs[leg - 1]} leg` : `leg ${leg}`;
  return `${code.label} — ${name}`;
}

/* ------------------------------- timing ------------------------------------ */

/**
 * The official manual time from a lane's watches (SW 11.3): two of three equal
 * → that time; all three different → the middle one; two watches → their
 * average with the thousandth dropped (not rounded); one watch → its time.
 */
export function officialManualTime(watches: (number | undefined | null)[]): number | null {
  const w = watches.filter((x): x is number => x != null && Number.isFinite(x) && x > 0).map((x) => Math.round(x * 100) / 100);
  if (!w.length) return null;
  if (w.length === 1) return w[0];
  if (w.length === 2) return Math.floor(((w[0] + w[1]) / 2) * 100 + 1e-6) / 100;
  const [a, b, c] = [...w.slice(0, 3)].sort((x, y) => x - y);
  if (a === b || b === c) return b;
  if (a === c) return a;
  return b;
}

/** Where splits are read: every 50 m before the finish (relays: every 50 m
 *  across the legs — each leg's end is a split). 50 m events have none. */
export function splitDistances(discipline: string): number[] {
  const e = swimEventOf(discipline);
  if (!e) return [];
  const out: number[] = [];
  for (let d = 50; d < e.distance; d += 50) out.push(d);
  return out;
}

/** A splits list must rise and stay under the final time. */
export function splitsError(splits: (number | undefined)[], final?: number): string | null {
  let prev = 0;
  for (const [i, s] of splits.entries()) {
    if (s == null) continue;
    if (s <= prev) return `Split ${i + 1} (${s.toFixed(2)}) isn't after the one before.`;
    prev = s;
  }
  if (final != null && prev >= final) return 'The last split is not before the final time.';
  return null;
}

/** "50 m 31.20 · 100 m 1:05.30 (34.10) · …" — cumulative splits with each 50 m lap. */
export function splitsText(splits: (number | undefined)[] | undefined, fmt: (v: number) => string, discipline: string): string {
  const ds = splitDistances(discipline);
  if (!splits?.length) return '';
  let prev: number | undefined = 0;
  return splits.map((s, i) => {
    if (s == null) { prev = undefined; return ''; }
    const lap = prev != null && i > 0 ? ` (${fmt(Math.round((s - prev) * 100) / 100)})` : '';
    prev = s;
    return `${ds[i] ?? (i + 1) * 50} m ${fmt(s)}${lap}`;
  }).filter(Boolean).join(' · ');
}

/** The relay lead-off swimmer's split (SW 11.6: published; SW 12.12: may stand
 *  as a record, except in mixed relays) — the split at the first leg's distance. */
export function leadOffSplit(discipline: string, splits?: (number | undefined)[]): number | undefined {
  const e = swimEventOf(discipline);
  if (!e?.relay) return undefined;
  const i = splitDistances(discipline).indexOf(e.legDistance);
  return i >= 0 ? splits?.[i] ?? undefined : undefined;
}
