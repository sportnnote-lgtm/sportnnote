/**
 * SD-112 — results-entry safety for athletics and swimming (scorer UX audit,
 * docs/sport-depth/scorer-ux-audit-events.md). Pure:
 *
 *  - a plausible range per event (and pool length) — a mark outside it is never
 *    rejected, only confirmed; an unconfirmed out-of-range mark shows no
 *    PB / SB / MR and sets no record;
 *  - the stopwatch keypad in hand-time mode (the last digit is the tenth) and
 *    photo-finish mode (the last three digits are the thousandths);
 *  - the Hand chip keeps the time as typed (no thousandths lost);
 *  - what "Close round" / "Finish & lock" warn about (blank rows, new records);
 *  - when an organiser may reopen a round or a final, and the record rollback.
 *
 * Ranges: the fast end sits just under the senior world record (World
 * Athletics / World Aquatics record lists), the slow / short end is generous
 * enough for a U10–U19 school meet. Lighter school implements throw further
 * than the senior ones, so the throws' upper ends sit above the senior records.
 */
import type { Attempt, Category, DisciplineDef, EntryResult, RankedEntry, ResultEntry, ResultFlag } from './model.ts';
import type { RecordMark } from './records.ts';
import { formatMark } from './marks.ts';
import { disciplineOf } from './model.ts';
import { digitsToTime, handTime } from './athletics.ts';
import { WL_RANGE, outOfRange } from './weightlifting.ts';

export interface MarkRange { min: number; max: number }

/** Athletics: [min, max] — seconds for races, metres for jumps / throws. */
const ATHLETICS: Record<string, [number, number]> = {
  'ath.100m': [9.3, 30],
  'ath.200m': [18.8, 60],
  'ath.400m': [42, 150],
  'ath.800m': [98, 360],
  'ath.1500m': [200, 720],
  'ath.3000m': [430, 1500],
  'ath.80mh': [10, 30],
  'ath.100mh': [11.9, 35],
  'ath.110mh': [12.5, 35],
  'ath.300mh': [33, 90],
  'ath.400mh': [45, 120],
  'ath.4x100': [36, 120],
  'ath.4x400': [170, 480],
  'ath.lj': [1, 9.2],
  'ath.tj': [3, 18.8],
  'ath.sp': [1.5, 26],
  'ath.dt': [3, 85],
  'ath.jt': [3, 100],
  'ath.ht': [3, 95],
  'ath.hj': [0.6, 2.5],
  'ath.pv': [1, 6.4],
};

/** Swimming, 50 m pool (LCM): the fast end in seconds. A 25 m pool (SCM) is
 *  quicker (more turns): its fast end is 95 % of this. The slow end is 4.5 ×
 *  the fast end for both (a U10 50 m breaststroke still fits). */
const SWIM_LCM_MIN: Record<string, number> = {
  '50free': 20.5, '100free': 45.5, '200free': 100, '400free': 215, '800free': 445, '1500free': 855,
  '50back': 23, '100back': 50.5, '200back': 110,
  '50breast': 25.5, '100breast': 56, '200breast': 123,
  '50fly': 21.8, '100fly': 48.5, '200fly': 108,
  '100im': 50.5, '200im': 110, '400im': 238,
  '4x50free': 84, '4x100free': 185, '4x200free': 410, '4x50medley': 94, '4x100medley': 203,
};

/** The usual range of marks for an event (and pool length), or null when the
 *  event has none (weightlifting, archery …). */
export function markRange(discipline: string, course?: Category['course']): MarkRange | null {
  const a = ATHLETICS[discipline];
  if (a) return { min: a[0], max: a[1] };
  // SD-97: weightlifting — kg per lift / total (and bodyweight, see weightlifting.ts)
  if (WL_RANGE[discipline]) return { ...WL_RANGE[discipline] };
  if (discipline.startsWith('swim.')) {
    const base = SWIM_LCM_MIN[discipline.slice(5)];
    if (base == null) return null;
    const min = course === 'SCM' ? Math.floor(base * 95) / 100 : base;
    return { min, max: Math.round(base * 4.5) };
  }
  return null;
}

export interface RangeIssue { side: 'low' | 'high'; range: MarkRange; message: string }

/** Is this mark outside the event's usual range? null = fine (or no range). */
export function rangeCheck(def: Pick<DisciplineDef, 'key' | 'label' | 'unit' | 'dp' | 'better'>, mark: number | null | undefined, course?: Category['course']): RangeIssue | null {
  if (mark == null || !Number.isFinite(mark)) return null;
  const range = markRange(def.key, course);
  if (!range) return null;
  if (mark >= range.min && mark <= range.max) return null;
  const side = mark < range.min ? 'low' : 'high';
  const time = def.unit === 'time';
  const mass = def.unit === 'mass';
  const word = time ? (side === 'low' ? 'fast' : 'slow') : mass ? (side === 'low' ? 'light' : 'heavy') : (side === 'low' ? 'short' : def.unit === 'height' ? 'high' : 'long');
  const unit = time ? '' : mass ? ' kg' : ' m';
  const usual = `${formatMark(range.min, def)}${unit} – ${formatMark(range.max, def)}${unit}`;
  return { side, range, message: `${formatMark(mark, def)}${unit} looks too ${word} for the ${def.label.toLowerCase()} — the usual range is ${usual}. Check the digits before saving.` };
}

/* ------------------------------ the keypad ------------------------------- */

/**
 * Hand-time mode: the LAST digit is the tenth (hand times are read to the
 * tenth, TR 19.21). "108" → 10.8 · "1053" → 1:05.3 · "25307" → 25:30.7.
 */
export function digitsToHandTime(digits: string): number | null {
  const d = digits.replace(/\D/g, '');
  if (d.length < 2 || /^0+$/.test(d)) return null;
  const rest = d.slice(0, -1);
  const secs = digitsToTime(`${rest}00`);
  if (secs == null) return null;
  return Math.round((secs + Number(d.slice(-1)) / 10) * 10) / 10;
}

/**
 * Photo-finish mode: the last THREE digits are the thousandths. "10853" →
 * 10.853 (official 10.86, TR 19.24, thousandths kept for ties).
 */
export function digitsToPhotoTime(digits: string): { mark: number; thousandths: number } | null {
  const d = digits.replace(/\D/g, '');
  if (d.length < 4 || /^0+$/.test(d)) return null;
  const head = digitsToTime(`${d.slice(0, -3)}00`);
  if (head == null) return null;
  const thousandths = Math.round((head + Number(d.slice(-3)) / 1000) * 1000) / 1000;
  return { mark: Math.ceil(thousandths * 100 - 1e-9) / 100, thousandths };
}

/** Which keypad reading applies: swimming manual times stay at 1/100 (SW 11.3). */
export type KeypadMode = 'auto' | 'hand' | 'photo';
export function readDigits(digits: string, mode: KeypadMode): { mark: number; thousandths?: number } | null {
  if (mode === 'hand') { const v = digitsToHandTime(digits); return v == null ? null : { mark: v }; }
  if (mode === 'photo') return digitsToPhotoTime(digits);
  const v = digitsToTime(digits);
  return v == null ? null : { mark: v };
}

/**
 * The Hand chip. ON: the official mark becomes the hand time (to the tenth,
 * TR 19.21; a swimming manual time stays at 1/100) and the time as typed is
 * kept in `raw`. OFF: the typed time comes back, thousandths and all.
 */
export function toggleHand(r: EntryResult, on: boolean, swim = false): EntryResult {
  if (r.mark == null) return { ...r, hand: on };
  const raw = r.raw ?? { mark: r.mark, ...(r.thousandths != null ? { thousandths: r.thousandths } : {}) };
  if (on) return { ...r, hand: true, raw, mark: swim ? raw.mark : handTime(raw.mark), thousandths: undefined };
  return { ...r, hand: false, raw, mark: raw.mark, thousandths: raw.thousandths };
}

/* --------------------------- out-of-range marks --------------------------- */

const outside = (def: DisciplineDef, v: number | undefined, course?: Category['course']) => v != null && !!rangeCheck(def, v, course);

/** An out-of-range mark nobody confirmed (a single mark or any attempt). */
export function unconfirmedOutOfRange(r: EntryResult, def: DisciplineDef, course?: Category['course']): boolean {
  if (def.capture === 'single') return outside(def, r.mark, course) && !r.rangeOk;
  if (def.capture === 'attempts') return (r.attempts ?? []).some((a: Attempt | undefined) => !!a && !a.foul && !a.pass && outside(def, a.mark, course) && !a.rangeOk);
  // SD-97: a good lift at a weight outside the usual range, not confirmed
  if (def.capture === 'lifts') {
    const lifts = def.lifts ?? ['snatch', 'cj'];
    return lifts.some((l) => (r.lifts?.[l] ?? []).some((a) => a.good === true && outOfRange(l === 'snatch' ? 'wl.snatch' : 'wl.cj', a)));
  }
  // HJ / PV: the bar heights are confirmed when they are added
  return false;
}

const RECORD_FLAGS: ResultFlag[] = ['PB', '=PB', 'SB', '=SB', 'MR', '=MR', 'SR', '=SR'];

/** Drop PB / SB / MR / SR from rows whose mark is out of range and unconfirmed. */
export function stripUnconfirmedFlags(rows: RankedEntry[], def: DisciplineDef, course?: Category['course']): RankedEntry[] {
  return rows.map((r) => (unconfirmedOutOfRange(r.entry.result, def, course) ? { ...r, flags: r.flags.filter((x) => !RECORD_FLAGS.includes(x)) } : r));
}

/** The rows a record may come from: unconfirmed out-of-range marks don't count. */
export function rowsForRecords(rows: RankedEntry[], def: DisciplineDef, course?: Category['course']): RankedEntry[] {
  return rows.map((r) => (unconfirmedOutOfRange(r.entry.result, def, course) ? { ...r, bestLegal: null } : r));
}

/* ------------------------- close / finish warnings ------------------------ */

/** Entries still in the event (no DNS / DQ …) with nothing entered. */
export function blankEntries(entries: ResultEntry[], def: DisciplineDef): ResultEntry[] {
  return entries.filter((e) => {
    const r = e.result ?? {};
    if ((r.status ?? 'ok') !== 'ok') return false;
    if (def.capture === 'single' || def.capture === 'target') return r.mark == null;
    if (def.capture === 'attempts') return !(r.attempts ?? []).some((a) => !!a && (a.mark != null || a.foul || a.pass));
    if (def.capture === 'heights') return !(r.heights ?? []).some((h) => !!h.tries);
    if (def.capture === 'lifts') return !r.lifts?.snatch?.length && !r.lifts?.cj?.length;
    return false;
  });
}

/** Records in `after` that are new (set or broken by this event). */
export function newRecords(before: RecordMark[], after: RecordMark[]): { rec: RecordMark; old?: RecordMark }[] {
  return after.filter((r) => !before.includes(r)).map((rec) => ({ rec, old: before.find((b) => b.scope === rec.scope && b.discipline === rec.discipline && b.category === rec.category) }));
}

const athleteWord = (def: Pick<DisciplineDef, 'teamSize' | 'sport'>, n: number) =>
  def.teamSize ? (n === 1 ? 'team' : 'teams') : def.sport === 'swimming' ? (n === 1 ? 'swimmer' : 'swimmers') : def.sport === 'weightlifting' ? (n === 1 ? 'lifter' : 'lifters') : (n === 1 ? 'athlete' : 'athletes');

/** "3 athletes have no result (Asha, Riya, Meena) — …" or ''. */
export function blankWarning(blank: ResultEntry[], def: Pick<DisciplineDef, 'teamSize' | 'sport'>, after: string): string {
  if (!blank.length) return '';
  const names = blank.slice(0, 4).map((e) => e.name.split(' ')[0]).join(', ') + (blank.length > 4 ? ' …' : '');
  return `${blank.length} ${athleteWord(def, blank.length)} ${blank.length === 1 ? 'has' : 'have'} no result (${names}) — ${after}. `;
}

/** The Close-round confirm message. */
export function closeRoundDetail(blank: ResultEntry[], def: DisciplineDef, nextLabel: string): string {
  return `${blankWarning(blank, def, 'they drop out without a place; mark DNS if they didn’t start')}The qualifiers (Q / q) are seeded into the ${nextLabel}. An organiser can reopen this round until the ${nextLabel} has results.`;
}

/** The Finish-&-lock confirm message. */
export function finishDetail(opts: {
  blank: ResultEntry[]; def: DisciplineDef; records: { rec: RecordMark; old?: RecordMark }[]; unconfirmed: number; jumpOff?: boolean;
}): string {
  const { def } = opts;
  const unit = def.unit === 'time' ? '' : def.unit === 'mass' ? ' kg' : ' m';
  // SD-97: a weightlifting session can set snatch, C&J and total records
  const what = (d: string) => (def.capture === 'lifts' ? ` (${(disciplineOf(d)?.label ?? d).replace('Weightlifting total', 'total').toLowerCase()})` : '');
  const rec = opts.records.map(({ rec, old }) => `New ${rec.scope === 'MR' ? 'meet record' : 'school record'}${what(rec.discipline)}: ${formatMark(rec.value, def)}${unit} by ${rec.holder}${old ? ` (was ${formatMark(old.value, def)}${unit})` : ''}. `).join('');
  return [
    opts.jumpOff ? 'The tie for 1st has no jump-off result — the athletes will share 1st. ' : '',
    blankWarning(opts.blank, def, 'they get no place or points'),
    opts.unconfirmed ? `${opts.unconfirmed} mark${opts.unconfirmed === 1 ? ' is' : 's are'} outside the usual range and not confirmed — no record from ${opts.unconfirmed === 1 ? 'it' : 'them'}. ` : '',
    rec,
    'Places, medals and points go to the meet table. An organiser can reopen the final.',
  ].join('');
}

/* ---------------------------------- reopen -------------------------------- */

/** Anything entered on a phase (a mark, a status, a trial, a bar try)? */
export function hasAnyResult(results: (EntryResult | null | undefined)[]): boolean {
  return results.some((r) => !!r && (r.mark != null || (r.status ?? 'ok') !== 'ok' || !!r.attempts?.length || !!r.heights?.some((h) => !!h.tries) || !!r.lifts?.snatch?.length || !!r.lifts?.cj?.length));
}

export type ReopenVerdict = { ok: true; kind: 'round' | 'final' } | { ok: false; reason: string };

/** May this completed phase be reopened? A round only while the next round has
 *  no results; a final always (its records and points are rolled back). */
export function reopenVerdict(phase: { status: string }, next: { status: string; results: (EntryResult | null | undefined)[] } | null, isFinal: boolean): ReopenVerdict {
  if (phase.status !== 'completed') return { ok: false, reason: 'This round is still open.' };
  if (isFinal) return { ok: true, kind: 'final' };
  if (!next) return { ok: true, kind: 'round' };
  if (next.status === 'completed' || hasAnyResult(next.results)) return { ok: false, reason: 'The next round already has results — clear them first.' };
  return { ok: true, kind: 'round' };
}

/** The record book's entries for one discipline + category (the "before" snapshot). */
export const recordsFor = (book: RecordMark[], discipline: string, category: string): RecordMark[] =>
  book.filter((r) => r.discipline === discipline && r.category === category);

/**
 * Reopen final: take out every record this event set (by its eventKey) for
 * the discipline + category and put back what stood before it finished. A
 * record a LATER event has set since stays (it beat this one anyway).
 */
export function rollbackRecords(book: RecordMark[], discipline: string, category: string, eventKey: string, before: RecordMark[] = []): RecordMark[] {
  const mine = (r: RecordMark) => r.discipline === discipline && r.category === category && r.eventKey === eventKey;
  const removed = book.filter(mine);
  const out = book.filter((r) => !mine(r));
  for (const r of removed) {
    const prev = before.find((b) => b.scope === r.scope && b.discipline === discipline && b.category === category && b.eventKey !== eventKey);
    if (prev && !out.some((x) => x.scope === prev.scope && x.discipline === discipline && x.category === category)) out.push(prev);
  }
  return out;
}
