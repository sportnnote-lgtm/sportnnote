/**
 * Results engine (SD-28 / GEN-27) — the model for timed / measured events:
 * athletics, swimming, archery, shooting, weightlifting, cycling, rowing, canoe.
 * Generalises golf's field competition (one leaderboard, N entries, statuses,
 * cut / positions with ties). Pure types + the discipline catalogue; the maths
 * lives in marks.ts / rank.ts / progression.ts / records.ts / medals.ts.
 *
 * Storage (resultsStore.ts): one PHASE (heats, semi-finals, final, field
 * qualification …) = one `field_events` row (format.results = PhaseFormat);
 * one entry = one `field_entries` row (group_no = heat / flight number,
 * result = EntryResult, team_id = relay team / crew or the athlete's school /
 * house / contingent once migration 0051 is in).
 *
 * Per-sport work (Wave 4: SD-90 … SD-100) only adds DisciplineDefs and phase
 * presets — the entry screen, ranking, Q/q, records and medals are generic.
 */

import type { RecordMark } from './records.ts';

export type Better = 'higher' | 'lower';

/** What a mark measures. Times are seconds, distance / height metres, mass kg. */
export type ResultUnit = 'time' | 'distance' | 'height' | 'points' | 'mass';

/** How marks are captured on the entry screen. */
export type MarkCapture =
  | 'single' // one mark per entry (track, swim, road, rowing, canoe, cycling TT)
  | 'attempts' // N attempts, best counts (LJ, TJ, SP, DT, JT, HT)
  | 'heights' // bar progression with O / X / – (HJ, PV)
  | 'lifts' // snatch + clean & jerk, 3 attempts each, good / no lift
  | 'target'; // a score with 10s / X (inner-ten) counts (archery, shooting)

/** How equal marks are separated (per discipline / governing body). */
export type TieRule =
  | 'photo' // track (World Athletics): hundredths, then thousandths if both have them, then the tie stands
  | 'stands' // swimming (World Aquatics): hundredths; ties stand (a swim-off only decides a qualifying spot)
  | 'countback' // horizontal jumps / throws: next-best mark, then the next …
  | 'vertical' // HJ / PV: fewer failures at the tie height, then fewer total failures; jump-off for 1st
  | 'lifted-first' // weightlifting (IWF): the lifter who reached the total first
  | 'inner-count'; // archery (10s incl. X, then X) / shooting (inner tens); then shoot-off

export type ResultStatus =
  | 'ok' // a valid mark (or still competing)
  | 'DNS' // did not start
  | 'DNF' // did not finish
  | 'DQ' // disqualified (with a rule reference)
  | 'FS' // false start (a DQ under World Athletics TR 16.8, shown as FS)
  | 'NM' // no valid mark in a field event / no total in weightlifting
  | 'WD'; // withdrew (golf / multi-day events)

/** Unranked statuses, in the order they are listed under the ranked entries. */
export const STATUS_ORDER: Record<ResultStatus, number> = { ok: 0, NM: 1, DNF: 2, FS: 3, DQ: 4, WD: 5, DNS: 6 };

export type PhaseKind = 'heat' | 'repechage' | 'semi' | 'qualification' | 'final';

export interface DisciplineDef {
  /** stable key: 'ath.100m', 'ath.lj', 'swim.50free' … */
  key: string;
  label: string;
  /** the sport it belongs to ('athletics', 'swimming' …) — not necessarily a live SportId yet */
  sport: string;
  unit: ResultUnit;
  better: Better;
  /** decimals the official mark is shown / compared at (time 2, distance 2, kg 0) */
  dp: number;
  capture: MarkCapture;
  tie: TieRule;
  /** field events: attempts for everyone, and the extra attempts for the top N */
  attempts?: { count: number; finalists?: number; extra?: number };
  /** a wind gauge is read (100 / 200 / sprint hurdles per race; LJ / TJ per attempt) */
  wind?: 'race' | 'attempt';
  /** max legal tail-wind for records (World Athletics: +2.0 m/s) */
  windLimit?: number;
  /** relay / crew size (4 × 100 m = 4, K4 = 4, rowing 8+ = 9) */
  teamSize?: number;
  /** lanes on the track / in the pool (lane races) */
  lanes?: number;
  /** a 'lifts' discipline: which lifts make the result */
  lifts?: ('snatch' | 'cj')[];
}

export interface Category {
  /** 'U14', 'U17', 'Open' … */
  age?: string;
  gender?: 'M' | 'F' | 'X';
  /** bodyweight class for weightlifting ('61 kg') */
  weightClass?: string;
  /** SD-94 swimming: the pool length — 'LCM' (50 m, long course) or 'SCM'
   *  (25 m, short course). Part of the key, so records and PBs are kept apart
   *  per course (World Aquatics SW 12.1 / 12.2); not shown in the label. */
  course?: 'LCM' | 'SCM';
}

export const categoryKey = (c?: Category): string =>
  [c?.age ?? 'open', c?.gender ?? 'X', c?.weightClass ?? '', c?.course ?? ''].filter(Boolean).join('-');

export const categoryLabel = (c?: Category): string => {
  // SD-97: senior / junior weightlifting categories read "Men 79 kg" / "Women 58 kg"
  const adult = !!c?.weightClass && /^(Senior|Junior)$/.test(c?.age ?? '');
  const g = c?.gender === 'M' ? (adult ? 'Men' : 'Boys') : c?.gender === 'F' ? (adult ? 'Women' : 'Girls') : c?.gender === 'X' ? 'Mixed' : '';
  return [c?.age, g, c?.weightClass].filter(Boolean).join(' ') || 'Open';
};

/** How a phase feeds the next one. Q = by place in each heat (or by reaching a
 *  qualifying standard); q = the fastest / best of the rest across all heats. */
export interface Progression {
  /** first N of every heat → Q */
  byPlace?: number;
  /** the next best N across all heats → q */
  byMark?: number;
  /** field qualification: reaching this mark → Q */
  standard?: number;
  /** field qualification: fill with q until this many qualifiers */
  fillTo?: number;
}

/** What `field_events.format.results` holds for one phase. */
export interface PhaseFormat {
  discipline: string;
  category?: Category;
  phase: PhaseKind;
  /** phase number within the event (1 = first round) — field_events.round_no */
  phaseNo: number;
  heats: number;
  progression?: Progression;
  /** vertical jumps: the bar heights, in order */
  bar?: number[];
  /** the event this phase belongs to (all phases share it) */
  eventKey: string;
  /** the whole event's rounds, in order (this phase is plan[phaseNo - 1]) */
  plan?: { phase: PhaseKind; heats: number; progression?: Progression }[];
  /** the event's title without the phase ("100 m U14 Boys") */
  eventTitle?: string;
  /** SD-90: a hand-timed meet (stopwatches, usually no wind gauge) — hand
   *  times and races without a wind reading count for PB / SB / records (still
   *  shown "h"). Off = only fully automatic, wind-legal times count (World Athletics). */
  handTimed?: boolean;
  /** SD-90: reaction times are read at this meet (start-information system) */
  reaction?: boolean;
  /** SD-91: no wind gauge at the jumps pit — LJ / TJ marks without a reading
   *  count for PB / SB / records (a reading over +2.0 still doesn't) */
  noWindGauge?: boolean;
  /** SD-91: the implement for this category ("4 kg", "600 g") — throws */
  implement?: string;
  /** SD-91: triple-jump take-off board, metres from the landing area */
  board?: number;
  /** SD-91: a vertical-jump jump-off for 1st (TR 26.9), or the tied athletes' choice to share */
  jumpOff?: JumpOff;
  /** SD-94: lanes in use at this venue when they differ from the discipline's
   *  default (a 6- or 10-lane pool; 10 lanes are numbered 0–9, SW 3.1.2) */
  lanes?: number;
  /** SD-94: 50 m split times are recorded at this meet */
  splits?: boolean;
  /** SD-112: the record book's entries for this discipline + category as they
   *  stood before "Finish & lock" — what "Reopen final" puts back */
  recordsBefore?: RecordMark[];
}

/** SD-91: a jump-off for 1st place in HJ / PV — one try per height (TR 26.9). */
export interface JumpOff {
  /** entry ids of the athletes tied for 1st */
  athletes: string[];
  /** the tied athletes agreed not to jump further and share 1st */
  shared?: boolean;
  /** each jump-off height in order, with each remaining athlete's try ('O' / 'X') */
  rounds: { height: number; tries: Record<string, 'O' | 'X'> }[];
}

/** Lenient legality for a phase: a hand-timed meet (SD-90) or a jumps pit with
 *  no wind gauge (SD-91) — a missing wind reading doesn't stop a mark counting. */
export const looseLegal = (f?: Pick<PhaseFormat, 'handTimed' | 'noWindGauge'> | null): boolean => !!(f?.handTimed || f?.noWindGauge);

export interface Attempt {
  /** the mark; absent on a foul or pass */
  mark?: number;
  foul?: boolean;
  pass?: boolean;
  wind?: number;
  /** SD-112: the official confirmed a mark outside the event's usual range */
  rangeOk?: boolean;
}

/** One bar height and the tries at it: 'O', 'XO', 'XXO', 'XXX', '-', 'X-', 'XX-'. */
export interface HeightAttempt { height: number; tries: string }

export interface LiftAttempt {
  kg: number;
  /** true = good lift, false = no lift, undefined = not yet taken (a declared weight) */
  good?: boolean;
  /** competition-wide attempt order — earlier = smaller (IWF tie rule) */
  seq?: number;
  /** SD-97: the three referees' lights (true = white / good) when the official
   *  enters them — the decision is the majority (IWF TCRR) */
  lights?: boolean[];
  /** SD-97: the lifter declined (forfeited) this attempt — it counts as no lift
   *  for the result but not as attempted for the make rate */
  pass?: boolean;
  /** SD-97: the declaration was made by the app (+1 kg after a good lift, the
   *  same weight after a no lift) — the lifter / coach can still change it */
  auto?: boolean;
  /** SD-112 / SD-97: the official confirmed a weight outside the usual range */
  rangeOk?: boolean;
}

/** The result payload stored in `field_entries.result`. Absent fields = not tracked. */
export interface EntryResult {
  status?: ResultStatus;
  /** rule reference for DQ / FS ('TR 16.8', 'SW 7.6' …) */
  ruleRef?: string;
  /** single-mark disciplines: the official mark (time at 0.01 s, points …) */
  mark?: number;
  /** photo-finish reading to the thousandth (track ties) */
  thousandths?: number;
  /** race wind (m/s, + = tail) */
  wind?: number;
  /** reaction time (s) */
  reaction?: number;
  /** hand-timed (shown "h", not record-eligible for sprints) */
  hand?: boolean;
  attempts?: Attempt[];
  heights?: HeightAttempt[];
  lifts?: { snatch?: LiftAttempt[]; cj?: LiftAttempt[] };
  bodyweight?: number;
  /** archery 10s incl. X / shooting inner tens */
  tens?: number;
  /** archery X count */
  xs?: number;
  /** jump-off / shoot-off / swim-off place (1 = won it). Only compared when both rows have one. */
  decider?: number;
  /** start-list fields */
  lane?: number;
  order?: number;
  bib?: string;
  /** relay / crew members, in leg / seat order */
  members?: { playerId?: string; name: string }[];
  /** snapshot of the team the entry scores for (school / house / relay team) —
   *  kept in the row so a sheet survives the team being renamed or deleted */
  team?: { id?: string; name: string; colorHex?: string };
  /** a relay / crew entry's display name ("Red House A") */
  name?: string;
  /** SD-94 swimming: cumulative split times (s) every 50 m, the last one before the finish */
  splits?: number[];
  /** SD-94: what the DQ was for ("Early take-off, leg 3") — shown with the rule reference */
  reason?: string;
  /** SD-94: the manual times from the lane's watches (SW 11.3) the official time came from */
  watches?: number[];
  /** SD-112: the time as typed (before hand-time rounding, with any photo-finish
   *  thousandths) — toggling Hand off restores it, no thousandths are lost */
  raw?: { mark: number; thousandths?: number };
  /** SD-112: the official confirmed a mark outside the event's usual range —
   *  without it an out-of-range mark never shows PB / SB / MR or sets a record */
  rangeOk?: boolean;
}

/** One entry in one phase, as the engine sees it. */
export interface ResultEntry {
  id: string;
  /** individual athlete (player id) — absent for a relay / crew */
  athleteId?: string;
  name: string;
  /** the team the entry scores for: relay team / crew, or the athlete's school / house / contingent */
  team?: { id?: string; name: string; colorHex?: string };
  /** heat / flight number (1-based) */
  heat: number;
  result: EntryResult;
}

/** Markers shown next to a result. */
export type ResultFlag = 'Q' | 'q' | 'PB' | '=PB' | 'SB' | '=SB' | 'MR' | '=MR' | 'SR' | '=SR' | 'w' | 'h' | 'JO' | 'SO';

export interface RankedEntry {
  id: string;
  entry: ResultEntry;
  /** null for DNS / DNF / DQ / FS / NM / WD and entries without a mark yet */
  position: number | null;
  /** "1", "=3", "DNF", "DQ" … ("" while no mark yet) */
  label: string;
  tie: boolean;
  status: ResultStatus;
  /** the ranking mark (best attempt / time / height / total), null without one */
  best: number | null;
  /** the mark as text in its unit ("10.85", "6.45", "1:52.34", "185") */
  bestText: string;
  /** wind for the ranking mark (race wind or the best attempt's wind) */
  wind?: number;
  /** the ranking mark is record-legal (wind ≤ limit and measured, not hand-timed) */
  legal: boolean;
  /** the best record-legal mark (PB / SB / records use it; a wind-aided best doesn't count) */
  bestLegal: number | null;
  flags: ResultFlag[];
  /** tie that the rules settle by a jump-off / shoot-off still to be held */
  needsDecider?: boolean;
}

/* ------------------------------ the catalogue ------------------------------ */

const track = (key: string, label: string, extra: Partial<DisciplineDef> = {}): DisciplineDef => ({
  key: `ath.${key}`, label, sport: 'athletics', unit: 'time', better: 'lower', dp: 2, capture: 'single', tie: 'photo', lanes: 8, ...extra,
});
const horizontal = (key: string, label: string, wind: boolean): DisciplineDef => ({
  key: `ath.${key}`, label, sport: 'athletics', unit: 'distance', better: 'higher', dp: 2, capture: 'attempts', tie: 'countback',
  attempts: { count: 3, finalists: 8, extra: 3 }, ...(wind ? { wind: 'attempt' as const, windLimit: 2.0 } : {}),
});
const vertical = (key: string, label: string): DisciplineDef => ({
  key: `ath.${key}`, label, sport: 'athletics', unit: 'height', better: 'higher', dp: 2, capture: 'heights', tie: 'vertical',
});
const swim = (key: string, label: string, extra: Partial<DisciplineDef> = {}): DisciplineDef => ({
  key: `swim.${key}`, label, sport: 'swimming', unit: 'time', better: 'lower', dp: 2, capture: 'single', tie: 'stands', lanes: 8, ...extra,
});

/**
 * Disciplines the engine knows today: the D9 school-meet core for athletics
 * (100–3000 m, sprint hurdles, 4 × 100 / 4 × 400, LJ / HJ / TJ, shot, discus,
 * javelin; SD-91 adds pole vault and hammer as optional events) plus one
 * example per other family so the tie rules are exercised.
 * Wave 4 adds the rest (steeplechase, road, walks, combined, the
 * full swimming / archery / shooting / lifting programmes).
 */
export const DISCIPLINES: DisciplineDef[] = [
  track('100m', '100 m', { wind: 'race', windLimit: 2.0 }),
  track('200m', '200 m', { wind: 'race', windLimit: 2.0 }),
  track('400m', '400 m'),
  track('800m', '800 m', { lanes: 8 }),
  track('1500m', '1500 m', { lanes: undefined }),
  track('3000m', '3000 m', { lanes: undefined }),
  track('100mh', '100 m hurdles', { wind: 'race', windLimit: 2.0 }),
  track('110mh', '110 m hurdles', { wind: 'race', windLimit: 2.0 }),
  track('80mh', '80 m hurdles', { wind: 'race', windLimit: 2.0 }),
  track('300mh', '300 m hurdles'),
  track('400mh', '400 m hurdles'),
  track('4x100', '4 × 100 m relay', { teamSize: 4 }),
  track('4x400', '4 × 400 m relay', { teamSize: 4 }),
  horizontal('lj', 'Long jump', true),
  horizontal('tj', 'Triple jump', true),
  horizontal('sp', 'Shot put', false),
  horizontal('dt', 'Discus throw', false),
  horizontal('jt', 'Javelin throw', false),
  horizontal('ht', 'Hammer throw', false),
  vertical('hj', 'High jump'),
  vertical('pv', 'Pole vault'),
  // SD-94: the World Aquatics programme (SW 12.1 / 12.2) — 100 m IM is short course only.
  ...(['50', '100', '200', '400', '800', '1500'].map((d) => swim(`${d}free`, `${d} m freestyle`))),
  ...(['back', 'breast', 'fly'] as const).flatMap((s) => ['50', '100', '200'].map((d) => swim(`${d}${s}`, `${d} m ${s === 'back' ? 'backstroke' : s === 'breast' ? 'breaststroke' : 'butterfly'}`))),
  swim('100im', '100 m individual medley'),
  swim('200im', '200 m individual medley'),
  swim('400im', '400 m individual medley'),
  swim('4x50free', '4 × 50 m freestyle relay', { teamSize: 4 }),
  swim('4x100free', '4 × 100 m freestyle relay', { teamSize: 4 }),
  swim('4x200free', '4 × 200 m freestyle relay', { teamSize: 4 }),
  swim('4x50medley', '4 × 50 m medley relay', { teamSize: 4 }),
  swim('4x100medley', '4 × 100 m medley relay', { teamSize: 4 }),
  { key: 'wl.total', label: 'Weightlifting total', sport: 'weightlifting', unit: 'mass', better: 'higher', dp: 0, capture: 'lifts', tie: 'lifted-first', lifts: ['snatch', 'cj'] },
  // SD-97: each lift ranked on its own (separate snatch / C&J medals, records, PBs).
  // Not events of their own — a weightlifting event is always 'wl.total'.
  { key: 'wl.snatch', label: 'Snatch', sport: 'weightlifting', unit: 'mass', better: 'higher', dp: 0, capture: 'lifts', tie: 'lifted-first', lifts: ['snatch'] },
  { key: 'wl.cj', label: 'Clean & jerk', sport: 'weightlifting', unit: 'mass', better: 'higher', dp: 0, capture: 'lifts', tie: 'lifted-first', lifts: ['cj'] },
  { key: 'arch.720', label: 'Archery 70 m ranking round (72 arrows)', sport: 'archery', unit: 'points', better: 'higher', dp: 0, capture: 'target', tie: 'inner-count' },
  { key: 'shoot.10mar', label: '10 m air rifle qualification', sport: 'shooting', unit: 'points', better: 'higher', dp: 1, capture: 'target', tie: 'inner-count' },
];

export const disciplineOf = (key: string): DisciplineDef | undefined => DISCIPLINES.find((d) => d.key === key);

/** SD-94: the discipline as raced at this phase's venue (a 6- or 10-lane pool). */
export const phaseDiscipline = (def: DisciplineDef, f?: Pick<PhaseFormat, 'lanes'> | null): DisciplineDef =>
  (f?.lanes && def.lanes ? { ...def, lanes: f.lanes } : def);

/** SD-94: the lane numbers of a venue — a 10-lane pool uses 0–9 (SW 3.1.2), else 1…n. */
export const laneNumbers = (lanes: number): number[] => Array.from({ length: lanes }, (_, i) => (lanes === 10 ? i : i + 1));

/** Whether a discipline races in lanes (start list shows Lane; else Order). */
export const usesLanes = (d: DisciplineDef) => !!d.lanes && d.capture === 'single';
