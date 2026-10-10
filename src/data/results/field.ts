/**
 * SD-91 — athletics field events on the results engine: the school-meet
 * programme by category (long / high / triple jump, shot, discus, javelin;
 * pole vault and hammer as optional events), implement specs per age group,
 * the triple-jump take-off board, round presets (straight final, or a
 * qualification round to a standard / filled to 12), the attempt card's
 * "who is up next" (3 trials, then 3 more for the top 8 in reverse order),
 * the vertical-jump bar progression and current height, the jump-off for 1st
 * (TR 26.9) and the optional trial time limits (TR 25.17). Pure.
 *
 * Rules: World Athletics Competition & Technical Rules — TR 25 (field
 * events: 25.5 trials, 25.6 order, 25.17 time, 25.22 ties), TR 26 (vertical
 * jumps: 26.4 bar raising, 26.8 ties, 26.9 jump-off), TR 29–30 (horizontal
 * jumps), TR 32 (throws: implements). Implement weights below U18 are not
 * World Athletics specs — they follow common Indian (AFI / school) practice and
 * are shown as "check your federation"; the organiser can change them.
 */
import type { Category, DisciplineDef, JumpOff, PhaseKind, Progression, ResultEntry } from './model.ts';
import { disciplineOf } from './model.ts';
import { summarizeAttempts, summarizeHeights } from './marks.ts';
import { attemptOrder, fieldFinalists, firstRoundsDone } from './progression.ts';
import { rankEntries } from './rank.ts';
import type { PlannedPhase } from './plan.ts';

const AGES = ['U10', 'U12', 'U14', 'U16', 'U18', 'U20', 'Open'];
const ageRank = (age?: string) => Math.max(0, AGES.indexOf(age ?? 'Open'));
const r2 = (v: number) => Math.round(v * 100) / 100;

/* ------------------------------- programme -------------------------------- */

export type FieldGroup = 'jumps' | 'throws';
export interface FieldProgrammeItem {
  discipline: string;
  label: string;
  group: FieldGroup;
  /** pole vault / hammer: need a vault bed / a hammer cage — not every school has one */
  optional?: boolean;
}

const fItem = (key: string, group: FieldGroup, optional = false): FieldProgrammeItem =>
  ({ discipline: `ath.${key}`, label: disciplineOf(`ath.${key}`)!.label, group, ...(optional ? { optional } : {}) });

/**
 * The field events offered for a category (D9 school core first): long jump
 * for everyone; high jump and shot from U12; discus and javelin from U14;
 * triple jump from U16; pole vault and hammer (optional) from U16.
 */
export function fieldEventsFor(cat: Category): FieldProgrammeItem[] {
  const r = ageRank(cat.age);
  const out: FieldProgrammeItem[] = [fItem('lj', 'jumps')];
  if (r >= ageRank('U12')) out.push(fItem('hj', 'jumps'));
  if (r >= ageRank('U16')) out.push(fItem('tj', 'jumps'), fItem('pv', 'jumps', true));
  if (r >= ageRank('U12')) out.push(fItem('sp', 'throws'));
  if (r >= ageRank('U14')) out.push(fItem('dt', 'throws'), fItem('jt', 'throws'));
  if (r >= ageRank('U16')) out.push(fItem('ht', 'throws', true));
  return out;
}

export const isFieldDiscipline = (d?: Pick<DisciplineDef, 'capture'> | null) => !!d && (d.capture === 'attempts' || d.capture === 'heights');

/* ------------------------------- implements ------------------------------- */

/** World Athletics implement weights (TR 32: U18, U20, senior) and, below U18,
 *  common national / school practice (AFI-style). Key: `${age}-${gender}`. */
const IMPLEMENTS: Record<string, Record<string, string>> = {
  'ath.sp': {
    'U12-M': '2 kg', 'U12-F': '2 kg', 'U14-M': '3 kg', 'U14-F': '2 kg', 'U16-M': '4 kg', 'U16-F': '3 kg',
    'U18-M': '5 kg', 'U18-F': '3 kg', 'U20-M': '6 kg', 'U20-F': '4 kg', 'Open-M': '7.26 kg', 'Open-F': '4 kg',
  },
  'ath.dt': {
    'U14-M': '750 g', 'U14-F': '750 g', 'U16-M': '1 kg', 'U16-F': '750 g',
    'U18-M': '1.5 kg', 'U18-F': '1 kg', 'U20-M': '1.75 kg', 'U20-F': '1 kg', 'Open-M': '2 kg', 'Open-F': '1 kg',
  },
  'ath.jt': {
    'U14-M': '400 g', 'U14-F': '400 g', 'U16-M': '600 g', 'U16-F': '500 g',
    'U18-M': '700 g', 'U18-F': '500 g', 'U20-M': '800 g', 'U20-F': '600 g', 'Open-M': '800 g', 'Open-F': '600 g',
  },
  'ath.ht': {
    'U16-M': '4 kg', 'U16-F': '3 kg',
    'U18-M': '5 kg', 'U18-F': '3 kg', 'U20-M': '6 kg', 'U20-F': '4 kg', 'Open-M': '7.26 kg', 'Open-F': '4 kg',
  },
};

export interface ImplementSpec {
  /** "4 kg", "600 g" */
  text: string;
  /** 'wa' = World Athletics TR 32 (U18 / U20 / senior); 'national' = common school / federation practice */
  source: 'wa' | 'national';
}

/** The implement for a throw in a category, or undefined (jumps, Mixed, U10). */
export function implementSpec(discipline: string, cat: Category): ImplementSpec | undefined {
  const age = cat.age ?? 'Open';
  const text = IMPLEMENTS[discipline]?.[`${age}-${cat.gender ?? 'X'}`];
  if (!text) return undefined;
  return { text, source: ['U18', 'U20', 'Open'].includes(age) ? 'wa' : 'national' };
}

/** "4 kg · World Athletics U18" / "3 kg · check your federation" */
export function implementNote(spec: ImplementSpec | undefined, cat: Category): string {
  if (!spec) return '';
  return `${spec.text} · ${spec.source === 'wa' ? `World Athletics ${cat.age ?? 'senior'}` : 'school / federation practice — check yours'}`;
}

/* --------------------------- triple-jump board ---------------------------- */

/** The usual take-off board distances (metres from the landing area). */
export const TJ_BOARDS = [7, 9, 11, 13];

/** A sensible board for a category. World Athletics recommends at least 13 m
 *  (men) / 11 m (women) at international meets; school meets use shorter ones. */
export function defaultBoard(cat: Category): number {
  const r = ageRank(cat.age);
  const women = cat.gender === 'F';
  if (r >= ageRank('U20')) return women ? 11 : 13;
  if (r >= ageRank('U16')) return women ? 9 : 11;
  return women ? 7 : 9;
}

/* ------------------------------ round presets ----------------------------- */

export interface FieldRoundsPreset { key: 'wa' | 'final' | 'qual'; label: string; plan: PlannedPhase[] }

/** A qualification round (World Athletics TR 25: the standard → Q; fewer than
 *  12 reach it → filled to 12 with the best of the rest, q; ties at 12th all go). Over
 *  16 athletes in two groups (A / B) — each group a "heat". */
export function qualificationPlan(n: number, standard?: number): PlannedPhase[] {
  const groups = n > 16 ? 2 : 1;
  const progression: Progression = { fillTo: 12, ...(standard != null ? { standard } : {}) };
  return [{ phase: 'qualification', heats: groups, progression }, { phase: 'final', heats: 1 }];
}

/** Round choices for a field event: a straight final (3 trials, then 3 more for
 *  the best 8), or qualification → final of 12 (recommended above 16). */
export function fieldRoundPresets(n: number): FieldRoundsPreset[] {
  const final: PlannedPhase[] = [{ phase: 'final', heats: 1 }];
  const out: FieldRoundsPreset[] = [{ key: 'final', label: 'Straight final', plan: final }];
  if (n > 12) out.push({ key: 'qual', label: 'Qualification → final of 12', plan: qualificationPlan(n) });
  const rec = n > 16 ? out[1].plan : final;
  return [{ key: 'wa', label: 'Recommended', plan: rec }, ...out.filter((p) => JSON.stringify(p.plan) !== JSON.stringify(rec))];
}

/* ------------------------------ attempt flow ------------------------------ */

const out = (e: ResultEntry) => ['DNS', 'WD', 'DQ'].includes(e.result?.status ?? 'ok');
const taken = (e: ResultEntry) => (e.result?.attempts ?? []).filter((a) => !!a && (a.foul || a.pass || a.mark != null)).length;

/** Trials an athlete gets in this phase: 3 in a qualification round; 3 + 3 in a
 *  final for the top 8 (everyone when 8 or fewer). */
export const trialsFor = (def: DisciplineDef, phase?: PhaseKind) =>
  (def.attempts?.count ?? 3) + (phase === 'qualification' ? 0 : def.attempts?.extra ?? 0);

export interface NextUp { round: number; entry: ResultEntry }

/**
 * Who takes the next trial: round by round, in the round's order (start order
 * for 1–3; then reverse ranking — TR 25.6). Rounds 4+ only for the finalists
 * (top 8 + ties). In a qualification round an athlete who has reached the
 * standard stops (they're through). null = every trial has been taken.
 */
export function attemptNextUp(entries: ResultEntry[], def: DisciplineDef, o: { phase?: PhaseKind; standard?: number } = {}): NextUp | null {
  const count = def.attempts?.count ?? 3;
  const slots = trialsFor(def, o.phase);
  const competing = entries.filter((e) => !out(e));
  if (!competing.length) return null;
  for (let r = 1; r <= slots; r++) {
    if (r > count && !firstRoundsDone(competing, def)) return null;
    const finalists = r > count ? fieldFinalists(competing, def) : null;
    for (const e of attemptOrder(competing, def, r)) {
      if (finalists && !finalists.has(e.id)) continue;
      if (o.phase === 'qualification' && o.standard != null) {
        const best = summarizeAttempts(e.result?.attempts, def).best;
        if (best != null && best >= o.standard - 1e-9) continue;
      }
      if (taken(e) < r) return { round: r, entry: e };
    }
  }
  return null;
}

/** Where an athlete stands now and who leads (for the attempt card). */
export function standing(entries: ResultEntry[], def: DisciplineDef, id: string, handLegal?: boolean): { label: string; leader?: { name: string; text: string; id: string } } {
  const rows = rankEntries(entries, def, { handLegal });
  const me = rows.find((r) => r.id === id);
  const lead = rows.find((r) => r.position === 1);
  return { label: me?.label ?? '', leader: lead ? { name: lead.entry.name, text: lead.bestText, id: lead.id } : undefined };
}

/* --------------------------- vertical jumps: bar -------------------------- */

/** The smallest raise of the bar after each round: 2 cm HJ, 5 cm PV (TR 26.4). */
export const minBarStep = (def: Pick<DisciplineDef, 'key'>) => (def.key === 'ath.pv' ? 0.05 : 0.02);

/** A suggested opening height and raises for a category (the organiser changes them). */
export function defaultBar(def: Pick<DisciplineDef, 'key'>, cat: Category): { start: number; step: number; changeAt: number; step2: number } {
  const r = ageRank(cat.age), w = cat.gender === 'F';
  if (def.key === 'ath.pv') {
    const start = r >= ageRank('U20') ? (w ? 2.6 : 3.4) : r >= ageRank('U18') ? (w ? 2.2 : 2.8) : (w ? 1.8 : 2.2);
    return { start, step: 0.1, changeAt: r2(start + 0.6), step2: 0.05 };
  }
  const start = r >= ageRank('U20') ? (w ? 1.4 : 1.65) : r >= ageRank('U18') ? (w ? 1.3 : 1.45) : r >= ageRank('U16') ? (w ? 1.2 : 1.3)
    : r >= ageRank('U14') ? (w ? 1.05 : 1.15) : 0.95;
  return { start, step: 0.05, changeAt: r2(start + 0.25), step2: 0.03 };
}

/** The bar heights: from `start`, raising by `step` up to `changeAt`, then by
 *  `step2` — `count` heights in all (more can be added during the event). */
export function barPlan(start: number, step: number, changeAt?: number, step2?: number, count = 14): number[] {
  const out: number[] = [];
  let h = r2(start);
  while (out.length < count) {
    out.push(h);
    h = r2(h + (changeAt != null && step2 && h >= changeAt - 1e-9 ? step2 : step));
  }
  return out;
}

/** TR 26.4: the bar never goes up by less than 2 cm (HJ) / 5 cm (PV), and the
 *  raise never increases (until one athlete is left — then they choose). */
export function barProgressionError(bar: number[], def: Pick<DisciplineDef, 'key'>): string | null {
  const min = minBarStep(def);
  const hs = [...bar].sort((a, b) => a - b);
  let prev: number | null = null;
  for (let i = 1; i < hs.length; i++) {
    const d = r2(hs[i] - hs[i - 1]);
    if (d < min - 1e-9) return `${hs[i - 1].toFixed(2)} → ${hs[i].toFixed(2)} raises the bar by ${Math.round(d * 100)} cm — at least ${Math.round(min * 100)} cm (TR 26.4).`;
    if (prev != null && d > prev + 1e-9) return `The raise grows from ${Math.round(prev * 100)} to ${Math.round(d * 100)} cm at ${hs[i].toFixed(2)} — raises may not increase (TR 26.4).`;
    prev = d;
  }
  return null;
}

const finishedAt = (tries: string) => tries.endsWith('O') || tries.endsWith('-') || tries.length >= 3;

export interface VerticalState {
  /** the height being jumped now (null: nobody is left to jump at any listed height) */
  height: number | null;
  /** the athlete up next at that height */
  up: ResultEntry | null;
  /** their try number at that height (1–3) */
  attempt: number;
  /** athletes still in the competition (not out on three failures) */
  active: ResultEntry[];
  /** nobody left in, or every listed height done — the next height to add (last + last raise) */
  suggestNext?: number;
}

/**
 * The bar right now: the lowest listed height at which someone still in the
 * competition hasn't finished (cleared, passed, or failed three times) and
 * hasn't already jumped higher. At a height, first trials go round in start
 * order, then second trials, then third.
 */
export function verticalState(entries: ResultEntry[], bar: number[]): VerticalState {
  const hs = [...bar].sort((a, b) => a - b);
  const competing = entries.filter((e) => !out(e)).sort((a, b) => (a.result?.order ?? 999) - (b.result?.order ?? 999));
  const active = competing.filter((e) => !summarizeHeights(e.result?.heights).eliminated);
  for (const h of hs) {
    const pending = active.filter((e) => {
      const list = e.result?.heights ?? [];
      if (list.some((x) => x.height > h + 1e-9 && x.tries)) return false;
      return !finishedAt(list.find((x) => Math.abs(x.height - h) < 1e-9)?.tries ?? '');
    });
    if (pending.length) {
      const triesAt = (e: ResultEntry) => (e.result?.heights ?? []).find((x) => Math.abs(x.height - h) < 1e-9)?.tries.length ?? 0;
      const up = [...pending].sort((a, b) => triesAt(a) - triesAt(b))[0];
      return { height: h, up, attempt: triesAt(up) + 1, active };
    }
  }
  const last = hs[hs.length - 1], prev = hs[hs.length - 2];
  return { height: null, up: null, attempt: 0, active, suggestNext: active.length && last != null ? r2(last + (prev != null ? last - prev : 0.05)) : undefined };
}

/* ---------------------------- jump-off (TR 26.9) -------------------------- */

export interface JumpOffStatus {
  /** athletes still in the jump-off */
  remaining: string[];
  /** the jump-off height now (null before it starts) */
  height: number | null;
  /** who jumps next */
  up: string | null;
  decided: boolean;
  /** entry id → jump-off place (1 = won), once decided or shared */
  places: Map<string, number>;
}

/** Where the jump-off starts: the next height of the progression above the tie
 *  height (the height the tied athletes all failed), else tie + the minimum raise. */
export function jumpOffStart(bar: number[], tieHeight: number, def: Pick<DisciplineDef, 'key'>): number {
  const next = [...bar].sort((a, b) => a - b).find((h) => h > tieHeight + 1e-9);
  return next ?? r2(tieHeight + minBarStep(def));
}

/**
 * Replay a jump-off: each remaining athlete has ONE try per height. All fail →
 * the bar comes down by 2 cm (HJ) / 5 cm (PV); more than one clear → up by the
 * same; those who fail while someone clears are out (tied with each other).
 * Decided when exactly one clears. Shared = everyone 1st.
 */
export function jumpOffStatus(jo: JumpOff, def: Pick<DisciplineDef, 'key'>, start: number): JumpOffStatus {
  const step = minBarStep(def);
  if (jo.shared) return { remaining: [], height: null, up: null, decided: true, places: new Map(jo.athletes.map((a) => [a, 1])) };
  let remaining = [...jo.athletes];
  const outGroups: string[][] = [];
  let height: number = start;
  let decided = false;
  for (const round of jo.rounds) {
    height = round.height;
    const missing = remaining.filter((id) => !round.tries[id]);
    if (missing.length) return { remaining, height, up: missing[0], decided: false, places: new Map() };
    const cleared = remaining.filter((id) => round.tries[id] === 'O');
    if (cleared.length === 0) { height = r2(height - step); continue; }
    const failed = remaining.filter((id) => round.tries[id] !== 'O');
    if (failed.length) outGroups.push(failed);
    remaining = cleared;
    if (cleared.length === 1) { decided = true; break; }
    height = r2(height + step);
  }
  const places = new Map<string, number>();
  if (decided) {
    places.set(remaining[0], 1);
    let placed = 1;
    for (const g of [...outGroups].reverse()) { for (const id of g) places.set(id, placed + 1); placed += g.length; }
  }
  return { remaining, height: decided ? null : height, up: decided ? null : remaining[0] ?? null, decided, places };
}

/** Record one jump-off try: into the open round, or a new round at the status height. */
export function jumpOffTry(jo: JumpOff, def: Pick<DisciplineDef, 'key'>, start: number, id: string, t: 'O' | 'X'): JumpOff {
  const s = jumpOffStatus(jo, def, start);
  if (s.decided || s.height == null || !s.remaining.includes(id)) return jo;
  const last = jo.rounds[jo.rounds.length - 1];
  const open = last && Math.abs(last.height - s.height) < 1e-9 && s.remaining.some((x) => !last.tries[x]);
  const rounds = open
    ? [...jo.rounds.slice(0, -1), { ...last, tries: { ...last.tries, [id]: t } }]
    : [...jo.rounds, { height: s.height, tries: { [id]: t } }];
  return { ...jo, rounds };
}

/* --------------------------- trial time (TR 25.17) ------------------------ */

/**
 * The time an athlete has to start a trial (seconds), World Athletics TR 25.17:
 * 1 min normally; in HJ 1½ min and PV 2 min with 2–3 athletes left, 3 / 5 min
 * with one left; consecutive trials by the same athlete 2 min (PV 3 min).
 */
export function trialSeconds(def: Pick<DisciplineDef, 'key' | 'capture'>, athletesLeft: number, consecutive = false): number {
  const pv = def.key === 'ath.pv', hj = def.capture === 'heights' && !pv;
  if (consecutive) return pv ? 180 : 120;
  if (athletesLeft <= 1 && (hj || pv)) return pv ? 300 : 180;
  if (athletesLeft <= 3 && (hj || pv)) return pv ? 120 : 90;
  return 60;
}
