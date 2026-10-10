/**
 * SD-97 — weightlifting on the results engine (IWF Technical & Competition
 * Rules & Regulations, TCRR). One event = one bodyweight category's session
 * ('wl.total', a single final): the snatch, then the clean & jerk, three
 * attempts each; best snatch + best C&J = the total. Pure.
 *
 *  - bodyweight categories: the IWF senior / junior and youth categories in
 *    force from 1 June 2025 (revised by the IWF on 7 May 2025: men's 98 kg →
 *    94 kg) plus a school preset (a house choice — no IWF rule);
 *  - weigh-in: the bodyweight must sit inside the category (over the next
 *    lighter limit, at or under its own) — a mismatch is confirmed, not refused;
 *  - declarations: whole kilograms; never lighter than the previous attempt;
 *    at least +1 kg after a good lift; the same weight may be taken again after
 *    a no lift. With no declaration the app enters the automatic one (+1 kg
 *    after a good lift, the same weight after a no lift);
 *  - decisions: good lift / no lift, or the three referees' lights (majority);
 *  - the calling order: lighter bar first, then the lower attempt number, then
 *    the larger progression, then whoever took the previous attempt earlier,
 *    then the lower lot (start) number;
 *  - ranking (rank.ts): total (no total — "bomb out" — if either lift has no
 *    good attempt), equal totals → whoever reached the total first (bodyweight
 *    no longer breaks ties: IWF Executive Board 2016, in force 2017), then lot;
 *    snatch and C&J ranked the same way for their own medals (a meet setting:
 *    IWF World Championships award all three, the Olympic Games the total only);
 *  - stat lines, careers (best snatch / C&J / total, make rate, Sinclair) and
 *    the record books for each lift and the total.
 *
 * The rule text could not be read from the IWF PDF in this session; rule
 * numbers in comments are from the TCRR 2020 edition as remembered (6.4
 * weigh-in, 6.6.6 calling order, 6.8 classification) — see the SD-97 report.
 */
import type { Category, DisciplineDef, EntryResult, LiftAttempt, PhaseFormat, RankedEntry, ResultEntry } from './model.ts';
import { disciplineOf, categoryLabel } from './model.ts';
import { bestLiftAttempt, liftFailed, summarizeLifts } from './marks.ts';
import { rankEntries } from './rank.ts';
import { eventAwards, type Award, type PointsConfig } from './medals.ts';
import type { RecordMark } from './records.ts';

export type Lift = 'snatch' | 'cj';
export const LIFTS: Lift[] = ['snatch', 'cj'];
export const LIFT_LABEL: Record<Lift, string> = { snatch: 'Snatch', cj: 'Clean & jerk' };
export const LIFT_SHORT: Record<Lift, string> = { snatch: 'Sn', cj: 'C&J' };
export const LIFT_DISCIPLINE: Record<Lift | 'total', string> = { snatch: 'wl.snatch', cj: 'wl.cj', total: 'wl.total' };

/** The disciplines a weightlifting event keeps records / medals for: snatch,
 *  clean & jerk and total. Any other discipline: itself. */
export function recordDefsFor(def: DisciplineDef): DisciplineDef[] {
  if (def.capture !== 'lifts') return [def];
  return [LIFT_DISCIPLINE.snatch, LIFT_DISCIPLINE.cj, LIFT_DISCIPLINE.total].map((k) => disciplineOf(k)!);
}

/* ------------------------------ categories -------------------------------- */

export type WlAge = 'Youth' | 'Junior' | 'Senior' | 'School';
export const WL_AGES: { key: WlAge; label: string; note: string }[] = [
  { key: 'Youth', label: 'Youth', note: 'IWF youth: 13–17 years (by year of birth)' },
  { key: 'Junior', label: 'Junior', note: 'IWF junior: 15–20 years — senior categories' },
  { key: 'Senior', label: 'Senior', note: 'IWF senior: 15 years and up' },
  { key: 'School', label: 'School', note: 'school categories (a house choice — check your federation / school board)' },
];

/** Category upper limits in kg (the last one is also the "+" category's floor). */
const CLASSES: Record<'senior' | 'youth' | 'school', Record<'M' | 'F', number[]>> = {
  // IWF from 1 June 2025 (after the 7 May 2025 revision): 8 categories a gender
  senior: { M: [60, 65, 71, 79, 88, 94, 110], F: [48, 53, 58, 63, 69, 77, 86] },
  youth: { M: [56, 60, 65, 71, 79, 88, 94], F: [44, 48, 53, 58, 63, 69, 77] },
  // house choice for U14–U17 school meets (lighter, closer steps)
  school: { M: [40, 45, 49, 55, 61, 67, 73, 81], F: [36, 40, 45, 49, 55, 59, 64, 71] },
};
const tableFor = (age?: string) => (age === 'Youth' ? CLASSES.youth : age === 'School' || /^U\d+$/i.test(age ?? '') ? CLASSES.school : CLASSES.senior);

/** The bodyweight categories for an age group and gender: "60 kg" … "+110 kg". */
export function weightClasses(age: string | undefined, gender: 'M' | 'F'): string[] {
  const lims = tableFor(age)[gender];
  return [...lims.map((n) => `${n} kg`), `+${lims[lims.length - 1]} kg`];
}

/** "79 kg" → { upTo: 79 }; "+110 kg" → { over: 110 }. */
export function classLimit(cls: string): { upTo?: number; over?: number } {
  const m = /^\s*(\+)?\s*(\d+(?:\.\d+)?)/.exec(cls);
  if (!m) return {};
  return m[1] ? { over: Number(m[2]) } : { upTo: Number(m[2]) };
}

/** The bodyweight range of a category within its list: over `above`, at most `upTo` (none for "+"). */
export function classBounds(classes: string[], cls: string): { above: number; upTo: number | null } {
  const lim = classLimit(cls);
  if (lim.over != null) return { above: lim.over, upTo: null };
  const ups = classes.map((c) => classLimit(c).upTo).filter((x): x is number => x != null).sort((a, b) => a - b);
  const i = ups.indexOf(lim.upTo ?? -1);
  return { above: i > 0 ? ups[i - 1] : 0, upTo: lim.upTo ?? null };
}

/** The category a bodyweight falls in (the lightest whose limit it doesn't exceed). */
export function classForBodyweight(classes: string[], bw: number): string | undefined {
  for (const c of classes) {
    const { above, upTo } = classBounds(classes, c);
    if (bw > above && (upTo == null || bw <= upTo + 1e-9)) return c;
  }
  return undefined;
}

/** Weigh-in (IWF TCRR 6.4): is the bodyweight inside the category? null = fine. */
export function weighInIssue(classes: string[], cls: string | undefined, bw: number): string | null {
  if (!cls || !classes.includes(cls)) return null;
  const { above, upTo } = classBounds(classes, cls);
  const fits = classForBodyweight(classes, bw);
  if (upTo != null && bw > upTo + 1e-9) return `${fmtKg(bw)} kg is over the ${cls} limit — at an IWF meet they can't lift in this category${fits ? ` (that bodyweight is in ${fits})` : ''}.`;
  if (bw <= above + 1e-9) return `${fmtKg(bw)} kg is in a lighter category${fits ? ` (${fits})` : ''} — at an IWF meet an athlete lifts in the category their bodyweight falls in.`;
  return null;
}

/** Bodyweight is weighed to 0.01 kg. */
export const fmtKg = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, ''));

/* ------------------------------ plausibility ------------------------------ */

/** The usual range of a declared / lifted weight, and of a bodyweight (kg). A
 *  weight outside it asks first (SD-112 pattern) — never refused. The heavy end
 *  sits a little over the senior world records; the light end allows a school
 *  technique bar. */
export const WL_RANGE: Record<string, { min: number; max: number }> = {
  'wl.snatch': { min: 5, max: 230 },
  'wl.cj': { min: 5, max: 280 },
  'wl.total': { min: 10, max: 500 },
  bodyweight: { min: 20, max: 250 },
};

/** A jump of more than this between attempts asks first ("870" for 87). */
export const BIG_JUMP = 20;

/* ------------------------------ declarations ------------------------------ */

/** An attempt that has been taken (a decision, or declined). */
export const taken = (a?: LiftAttempt): boolean => !!a && (a.good !== undefined || !!a.pass);
/** The index of the declared, not yet taken attempt (or -1). */
export const pendingIndex = (list?: LiftAttempt[]): number => (list ?? []).findIndex((a) => !taken(a));
/** Attempts taken in a lift (declined ones too). */
export const takenCount = (list?: LiftAttempt[]): number => (list ?? []).filter(taken).length;

/** May attempt `idx` of a lift be declared at `kg`? null = yes. IWF: whole
 *  kilograms; never lighter than the attempt before; at least 1 kg more after a
 *  good lift; a no lift (or a declined attempt) may be repeated at the same weight. */
export function declareError(list: LiftAttempt[] | undefined, idx: number, kg: number): string | null {
  if (!Number.isFinite(kg) || kg <= 0) return 'Type the weight in kg.';
  if (!Number.isInteger(kg)) return 'Weights go up in whole kilograms (IWF).';
  if (idx > 2) return 'Only three attempts per lift.';
  const prev = idx > 0 ? (list ?? [])[idx - 1] : undefined;
  if (prev && taken(prev)) {
    if (prev.good === true && kg < prev.kg + 1) return `After a good lift at ${prev.kg} kg the next attempt is at least ${prev.kg + 1} kg.`;
    if (kg < prev.kg) return `The next attempt can't be lighter than ${prev.kg} kg.`;
  }
  return null;
}

/** Declare (or change) the next attempt's weight. Returns the new list. */
export function declare(list: LiftAttempt[] | undefined, kg: number, rangeOk?: boolean): LiftAttempt[] {
  const l = [...(list ?? [])];
  const i = pendingIndex(l);
  const a: LiftAttempt = { kg, ...(rangeOk ? { rangeOk: true } : {}) };
  if (i >= 0) l[i] = a;
  else if (l.length < 3) l.push(a);
  return l;
}

/** The automatic next declaration: +1 kg after a good lift, the same after a no lift. */
export const autoNext = (kg: number, good: boolean): number => (good ? kg + 1 : kg);

/** The referees' decision from their lights: two or three white = good lift. */
export const majority = (lights: boolean[]): boolean => lights.filter(Boolean).length >= 2;

/**
 * Record the decision on the declared attempt (`good`, or declined with
 * `pass`), stamped with the competition-wide attempt number `seq`. Unless it
 * was the third attempt, the next attempt is declared automatically.
 */
export function recordLift(list: LiftAttempt[] | undefined, decision: { good?: boolean; pass?: boolean; lights?: boolean[] }, seq: number): LiftAttempt[] {
  const l = [...(list ?? [])];
  const i = pendingIndex(l);
  if (i < 0) return l;
  const good = decision.pass ? undefined : decision.lights?.length === 3 ? majority(decision.lights) : !!decision.good;
  const done: LiftAttempt = { kg: l[i].kg, seq, ...(l[i].rangeOk ? { rangeOk: true } : {}), ...(decision.pass ? { pass: true, good: false } : { good }), ...(decision.lights?.length === 3 ? { lights: decision.lights } : {}) };
  l[i] = done;
  if (i < 2 && l.length === i + 1) l.push({ kg: autoNext(done.kg, done.good === true), auto: true });
  return l;
}

/** The next competition-wide attempt number in a session. */
export function nextSeq(entries: { result?: EntryResult | null }[]): number {
  let max = 0;
  for (const e of entries) for (const lift of LIFTS) for (const a of e.result?.lifts?.[lift] ?? []) if (a.seq != null && a.seq > max) max = a.seq;
  return max + 1;
}

/* ------------------------------ calling order ----------------------------- */

const inPlay = (r: EntryResult) => !['DNS', 'WD', 'DQ'].includes(r.status ?? 'ok');
/** Still has attempts to take in this lift (not three taken). */
const liftOpen = (r: EntryResult, lift: Lift) => inPlay(r) && takenCount(r.lifts?.[lift]) < 3;

/** The lift being contested: the snatch until every lifter in it has taken
 *  three attempts, then the clean & jerk; null when the session is over. */
export function activeLift(entries: ResultEntry[]): Lift | null {
  if (entries.some((e) => liftOpen(e.result ?? {}, 'snatch'))) return 'snatch';
  if (entries.some((e) => liftOpen(e.result ?? {}, 'cj'))) return 'cj';
  return null;
}

export interface LiftCall {
  entryId: string;
  name: string;
  team?: string;
  lift: Lift;
  /** 1, 2 or 3 */
  attempt: number;
  /** the declared weight (undefined = not declared yet) */
  kg?: number;
  lot?: number;
}

/**
 * The calling order for a lift (IWF TCRR 6.6.6 as implemented): lighter bar
 * first; the same weight → the lower attempt number; then the larger
 * progression from the lifter's previous attempt; then whoever took their
 * previous attempt earlier; then the lower lot / start number. Lifters with an
 * attempt still to declare come last (they must declare before the bar reaches
 * their weight).
 */
export function liftingOrder(entries: ResultEntry[], lift: Lift): LiftCall[] {
  const calls: (LiftCall & { prog: number; prevSeq: number })[] = [];
  const undeclared: LiftCall[] = [];
  for (const e of entries) {
    const r = e.result ?? {};
    if (!liftOpen(r, lift)) continue;
    const list = r.lifts?.[lift] ?? [];
    const i = pendingIndex(list);
    const attempt = takenCount(list) + 1;
    const base = { entryId: e.id, name: e.name, team: e.team?.name, lift, attempt, lot: r.order };
    if (i < 0) { undeclared.push(base); continue; }
    const prev = i > 0 ? list[i - 1] : undefined;
    calls.push({ ...base, kg: list[i].kg, prog: prev ? list[i].kg - prev.kg : 0, prevSeq: prev?.seq ?? 0 });
  }
  calls.sort((a, b) => (a.kg! - b.kg!) || (a.attempt - b.attempt) || (b.prog - a.prog) || (a.prevSeq - b.prevSeq) || ((a.lot ?? 999) - (b.lot ?? 999)) || a.name.localeCompare(b.name));
  return [...calls.map(({ prog: _p, prevSeq: _s, ...c }) => c), ...undeclared.sort((a, b) => (a.lot ?? 999) - (b.lot ?? 999))];
}

/** Who lifts next: the head of the active lift's calling order. */
export function nextLift(entries: ResultEntry[]): LiftCall | null {
  const lift = activeLift(entries);
  return lift ? liftingOrder(entries, lift)[0] ?? null : null;
}

export const ordinal = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][((n % 100) - 20) % 10] ?? ['th', 'st', 'nd', 'rd'][n % 100] ?? 'th'}`;

/** "Next: Asha Rao · 87 kg · 2nd attempt" (snatch / C&J named when asked). */
export function callText(c: LiftCall, withLift = false): string {
  return `${c.name} · ${c.kg != null ? `${c.kg} kg` : 'weight to declare'} · ${ordinal(c.attempt)} attempt${withLift ? ` (${LIFT_LABEL[c.lift].toLowerCase()})` : ''}`;
}

/* ------------------------------ result helpers ---------------------------- */

/** Good lifts out of attempts taken (declined attempts aren't attempts). */
export function makeCount(lifts: EntryResult['lifts']): { made: number; attempted: number } {
  let made = 0, attempted = 0;
  for (const l of LIFTS) for (const a of lifts?.[l] ?? []) {
    if (a.pass || a.good === undefined) continue;
    attempted += 1;
    if (a.good) made += 1;
  }
  return { made, attempted };
}

/** One lift's attempts for a sheet: "80 (83) 83" — no lifts in brackets, declined "–". */
export function liftSeries(list?: LiftAttempt[]): string {
  return (list ?? []).filter(taken).map((a) => (a.pass ? '–' : a.good ? String(a.kg) : `(${a.kg})`)).join(' ');
}

/** No good attempt in a lift after all three — the total is gone ("bomb out"). */
export const bombedOutOf = (r: EntryResult): Lift | null => (liftFailed(r.lifts?.snatch) ? 'snatch' : liftFailed(r.lifts?.cj) ? 'cj' : null);

/* -------------------------------- Sinclair -------------------------------- */

/** IWF Sinclair coefficients for the 2021–2024 Olympiad (the 2025–2028 values
 *  were not published when this was built — check iwf.sport). */
export const SINCLAIR = { period: '2021–2024', M: { A: 0.722762521, b: 193.609 }, F: { A: 0.787004341, b: 153.757 } } as const;

/** 10^(A·log10(bw / b)²) under b, else 1. */
export function sinclairCoefficient(bw: number, gender: 'M' | 'F'): number {
  const { A, b } = SINCLAIR[gender];
  if (!(bw > 0)) return 1;
  if (bw >= b) return 1;
  return 10 ** (A * Math.log10(bw / b) ** 2);
}

/** The Sinclair total to 0.01 (total × coefficient), or null without the inputs. */
export function sinclairTotal(total: number | null | undefined, bw: number | undefined, gender?: string): number | null {
  if (total == null || bw == null || (gender !== 'M' && gender !== 'F')) return null;
  return Math.round(total * sinclairCoefficient(bw, gender) * 100) / 100;
}

/* ------------------------------ meet settings ----------------------------- */

export interface WlMeetSettings {
  positionPoints: number[];
  relayFactor: 1;
  /** medals for the snatch and the C&J too (IWF World Championships) — else the total only (Olympic Games) */
  liftMedals: boolean;
  /** show Sinclair totals (best lifter across categories) */
  sinclair: boolean;
  handTimed: false;
  reaction: false;
}

/** IWF team classification points, 1st–25th. */
export const IWF_TEAM_POINTS = '28,25,23,22,21,20,19,18,17,16,15,14,13,12,11,10,9,8,7,6,5,4,3,2,1';

/** "IWF team points 28-25-23-…-1" or "8-7-6-5-4-3-2-1". */
export const pointsLabel = (points: number[]): string => (points.join(',') === IWF_TEAM_POINTS ? 'IWF team points 28-25-23-…-1' : points.join('-'));

export function wlMeetSettings(fmt?: Record<string, unknown>): WlMeetSettings {
  const scheme = String(fmt?.pointsScheme ?? '8,7,6,5,4,3,2,1').split(',').map(Number).filter((n) => Number.isFinite(n) && n >= 0);
  return {
    positionPoints: scheme.length ? scheme : [8, 7, 6, 5, 4, 3, 2, 1],
    relayFactor: 1,
    liftMedals: fmt?.liftMedals === true,
    sinclair: fmt?.sinclair === true,
    handTimed: false,
    reaction: false,
  };
}

/* ---------------------------- medals and points --------------------------- */

export interface LiftAwards { total: Award[]; snatch: Award[]; cj: Award[] }

/** Medals + points for a finished session: the total always; the snatch and the
 *  C&J too when the meet awards them (each with the same points table). */
export function liftAwards(entries: ResultEntry[], cfg: PointsConfig & { liftMedals?: boolean } = {}): LiftAwards {
  const rows = (k: Lift | 'total') => rankEntries(entries, disciplineOf(LIFT_DISCIPLINE[k])!);
  return {
    total: eventAwards(rows('total'), cfg),
    snatch: cfg.liftMedals ? eventAwards(rows('snatch'), cfg) : [],
    cj: cfg.liftMedals ? eventAwards(rows('cj'), cfg) : [],
  };
}

/* -------------------------------- stat lines ------------------------------ */

export interface LiftLine { playerId: string; stats: Record<string, number>; won: boolean }

/**
 * The stat lines a finished session writes (one per lifter who started):
 *   comps, place (total), golds / silvers / bronzes (total), liftGolds /
 *   liftSilvers / liftBronzes (snatch + C&J medals, when awarded), posPoints,
 *   m_wl_snatch / m_wl_cj / m_wl_total (best good lifts — an out-of-range weight
 *   nobody confirmed is left out), made / attempted, bombOut, bw, sinclair, dq.
 */
export function liftLines(f: Pick<PhaseFormat, 'category'>, entries: ResultEntry[], cfg: PointsConfig & { liftMedals?: boolean } = {}): LiftLine[] {
  const total = rankEntries(entries, disciplineOf('wl.total')!);
  const aw = liftAwards(entries, cfg);
  const by = (list: Award[]) => new Map(list.map((a) => [a.entryId, a]));
  const T = by(aw.total), S = by(aw.snatch), C = by(aw.cj);
  const out: LiftLine[] = [];
  for (const r of total) {
    const e = r.entry;
    if (!e.athleteId || r.status === 'DNS' || r.status === 'WD') continue;
    const res = e.result ?? {};
    const s: Record<string, number> = { comps: 1 };
    if (r.position != null) s.place = r.position;
    if (r.status === 'DQ') s.dq = 1;
    const t = T.get(e.id);
    if (t?.medal === 'gold') s.golds = 1; else if (t?.medal === 'silver') s.silvers = 1; else if (t?.medal === 'bronze') s.bronzes = 1;
    let pts = t?.points ?? 0;
    for (const a of [S.get(e.id), C.get(e.id)]) {
      if (!a) continue;
      pts += a.points;
      if (a.medal === 'gold') s.liftGolds = (s.liftGolds ?? 0) + 1;
      else if (a.medal === 'silver') s.liftSilvers = (s.liftSilvers ?? 0) + 1;
      else if (a.medal === 'bronze') s.liftBronzes = (s.liftBronzes ?? 0) + 1;
    }
    if (pts > 0) s.posPoints = Math.round(pts * 100) / 100;
    const sum = summarizeLifts(res.lifts);
    const okLift = (lift: Lift) => { const b = bestLiftAttempt(res.lifts?.[lift]); return b && !outOfRange(LIFT_DISCIPLINE[lift], b) ? b.kg : null; };
    const sn = okLift('snatch'), cj = okLift('cj');
    if (sn != null) s.m_wl_snatch = sn;
    if (cj != null) s.m_wl_cj = cj;
    if (sum.total != null && sn != null && cj != null) { s.m_wl_total = sum.total; s.mark = sum.total; }
    const mc = makeCount(res.lifts);
    s.made = mc.made; s.attempted = mc.attempted;
    if (r.status === 'NM') s.bombOut = 1;
    if (res.bodyweight != null) s.bw = res.bodyweight;
    const sin = sinclairTotal(s.m_wl_total, res.bodyweight, f.category?.gender);
    if (sin != null) s.sinclair = sin;
    out.push({ playerId: e.athleteId, stats: s, won: t?.medal === 'gold' });
  }
  return out;
}

/** An attempt outside the usual range that nobody confirmed. */
export const outOfRange = (discipline: string, a: LiftAttempt): boolean => {
  const r = WL_RANGE[discipline];
  return !!r && (a.kg < r.min || a.kg > r.max) && !a.rangeOk;
};

/* --------------------------------- career --------------------------------- */

export interface LiftBest { value: number; text: string; date: string; eventId: string; category?: string }
export interface LiftingCareer {
  comps: number; golds: number; silvers: number; bronzes: number; liftMedals: number; points: number;
  made: number; attempted: number;
  /** good lifts ÷ attempts, 0–100 (null with no attempts) */
  makeRate: number | null;
  bombOuts: number;
  bests: { key: 'snatch' | 'cj' | 'total' | 'sinclair'; label: string; pb: LiftBest; sb?: LiftBest }[];
  history: { eventId: string; title: string; date: string; text: string; place?: number; medal?: 'gold' | 'silver' | 'bronze'; flags: string[] }[];
}

const BEST_KEYS = [
  { key: 'snatch', stat: 'm_wl_snatch', label: 'Snatch' },
  { key: 'cj', stat: 'm_wl_cj', label: 'Clean & jerk' },
  { key: 'total', stat: 'm_wl_total', label: 'Total' },
  { key: 'sinclair', stat: 'sinclair', label: 'Sinclair total' },
] as const;

/** A lifter's career from their weightlifting stat lines (each `eventId` = the
 *  session) and what's known of those sessions. History newest first. */
export function liftingCareer(
  lines: { eventId?: string; stats: Record<string, number>; date?: string; opponent?: string }[],
  phases: Map<string, { title: string; date: string; category?: Category; eventTitle?: string }>,
  seasonFrom: string,
): LiftingCareer {
  const c: LiftingCareer = { comps: 0, golds: 0, silvers: 0, bronzes: 0, liftMedals: 0, points: 0, made: 0, attempted: 0, makeRate: null, bombOuts: 0, bests: [], history: [] };
  const bests = new Map<string, { key: LiftingCareer['bests'][number]['key']; label: string; pb: LiftBest; sb?: LiftBest }>();
  const sorted = [...lines].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  const pbSoFar = new Map<string, number>();
  for (const l of sorted) {
    const s = l.stats ?? {};
    c.comps += s.comps ?? 0; c.golds += s.golds ?? 0; c.silvers += s.silvers ?? 0; c.bronzes += s.bronzes ?? 0;
    c.liftMedals += (s.liftGolds ?? 0) + (s.liftSilvers ?? 0) + (s.liftBronzes ?? 0);
    c.points += s.posPoints ?? 0; c.made += s.made ?? 0; c.attempted += s.attempted ?? 0; c.bombOuts += s.bombOut ?? 0;
    const info = l.eventId ? phases.get(l.eventId) : undefined;
    const date = info?.date ?? l.date ?? '';
    const day = date.slice(0, 10);
    const flags: string[] = [];
    for (const b of BEST_KEYS) {
      const v = s[b.stat];
      if (v == null) continue;
      const best: LiftBest = { value: v, text: b.key === 'sinclair' ? v.toFixed(2) : `${v} kg`, date, eventId: l.eventId ?? '', category: info?.category ? categoryLabel(info.category) : undefined };
      const prev = pbSoFar.get(b.key);
      if (prev == null || v > prev) { if (prev != null && b.key !== 'sinclair') flags.push(`PB ${b.key === 'cj' ? 'C&J' : b.label.toLowerCase()}`); pbSoFar.set(b.key, v); }
      const row = bests.get(b.key) ?? { key: b.key, label: b.label, pb: best };
      if (v > row.pb.value) row.pb = best;
      if (day >= seasonFrom && (!row.sb || v > row.sb.value)) row.sb = best;
      bests.set(b.key, row);
    }
    if (s.bombOut) flags.push('no total');
    const medal = s.golds ? 'gold' : s.silvers ? 'silver' : s.bronzes ? 'bronze' : undefined;
    const text = [
      s.place ? `${s.place}${ordinal(s.place).replace(/^\d+/, '')}` : s.dq ? 'DQ' : '',
      `${s.m_wl_snatch ?? '–'} / ${s.m_wl_cj ?? '–'} = ${s.m_wl_total ?? '—'}`,
      s.bw != null ? `bw ${fmtKg(s.bw)}` : '',
    ].filter(Boolean).join(' · ');
    c.history.push({ eventId: l.eventId ?? '', title: info?.eventTitle ?? info?.title ?? l.opponent ?? 'Weightlifting', date, text, place: s.place, medal, flags });
  }
  c.points = Math.round(c.points * 100) / 100;
  c.makeRate = c.attempted ? Math.round((c.made / c.attempted) * 1000) / 10 : null;
  c.bests = BEST_KEYS.map((b) => bests.get(b.key)).filter((x): x is NonNullable<typeof x> => !!x);
  c.history.reverse();
  return c;
}

/* --------------------------------- records -------------------------------- */

/** "New meet record: snatch 98 kg by …" lines for a finished session. */
export function recordLines(recs: { rec: RecordMark; old?: RecordMark }[]): string {
  return recs.map(({ rec, old }) => `New ${rec.scope === 'MR' ? 'meet' : 'school'} record — ${disciplineOf(rec.discipline)?.label.replace('Weightlifting total', 'total').toLowerCase() ?? rec.discipline}: ${rec.value} kg by ${rec.holder}${old ? ` (was ${old.value} kg)` : ''}. `).join('');
}

/** Rank one lift of a session (snatch / C&J standings during the session). */
export const rankLift = (entries: ResultEntry[], lift: Lift | 'total'): RankedEntry[] => rankEntries(entries, disciplineOf(LIFT_DISCIPLINE[lift])!);
