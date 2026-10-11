/**
 * SD-122 — golf course editing, pure (no storage / network) so tests run it.
 *
 * - validateHoles / validateTees: what a saved course must satisfy.
 * - courseAsPlayed: a FINISHED round keeps the course it was played on
 *   (`format.courseSnap`, written when the round is finished, or by the
 *   server when the course is edited later). Open rounds read the current
 *   course, so an edit recomputes their to-par / net / Stableford at once.
 * - Per-entry tees (`format.entryTees`: playerId → tee name) and the WHS
 *   mixed-tee adjustment (Rule 6.2b: on tees with different par, the player on
 *   the higher-par tee receives the difference in par as extra strokes).
 */
import type { FieldEvent, GolfCourse } from '../core/types.ts';
import { parOf, type Hole, type Tee } from '../sports/golf/engine.ts';

/** Pars 3–6 and each stroke index used exactly once (1..9 or 1..18). */
export function validateHoles(holes: Hole[]): void {
  if (holes.length !== 9 && holes.length !== 18) throw new Error('A course has 9 or 18 holes.');
  if (holes.some((h) => !Number.isInteger(h.par) || h.par < 3 || h.par > 6)) throw new Error('Each hole needs a par between 3 and 6.');
  const sis = holes.map((h) => h.si);
  const n = holes.length;
  const bad = sis.find((si) => !Number.isInteger(si) || si < 1 || si > n);
  if (bad != null) throw new Error(`Stroke indexes must be 1–${n}${bad ? ` (${bad} is out of range)` : ''}.`);
  const dup = sis.find((si, i) => sis.indexOf(si) !== i);
  if (dup != null) throw new Error(`Stroke index ${dup} is used twice — each of 1–${n} once.`);
}

/** A tee row: a name (unique), and optional rating / slope (WHS ranges),
 *  par and gender. Rating and slope go together. */
export function validateTees(tees: Tee[], holeCount: number): void {
  if (!tees.length) throw new Error('A course needs at least one tee.');
  const names = tees.map((t) => t.name.trim().toLowerCase());
  if (names.some((n) => !n)) throw new Error('Every tee needs a name (e.g. White, Red).');
  const dup = tees.find((t, i) => names.indexOf(t.name.trim().toLowerCase()) !== i);
  if (dup) throw new Error(`Two tees are called “${dup.name.trim()}” — give each a different name.`);
  for (const t of tees) {
    const nm = t.name.trim();
    if ((t.courseRating == null) !== (t.slope == null)) throw new Error(`${nm}: enter both the course rating and the slope, or neither.`);
    if (t.courseRating != null && (t.courseRating < 40 || t.courseRating > 90)) throw new Error(`${nm}: a course rating is usually 55–80 (18 holes).`);
    if (t.slope != null && (!Number.isInteger(t.slope) || t.slope < 55 || t.slope > 155)) throw new Error(`${nm}: slope is a whole number from 55 to 155.`);
    if (t.par != null) {
      const [lo, hi] = holeCount === 9 ? [27, 40] : [54, 80];
      if (!Number.isInteger(t.par) || t.par < lo || t.par > hi) throw new Error(`${nm}: par for ${holeCount} holes is ${lo}–${hi}.`);
    }
  }
}

/** The course data a round is scored on, as stored on a finished round. */
export interface CourseSnap { holes: Hole[]; tees: Tee[] }
export const snapOf = (c: Pick<GolfCourse, 'holes' | 'tees'>): CourseSnap => ({ holes: c.holes, tees: c.tees });

const snapIn = (ev: Pick<FieldEvent, 'format'>): CourseSnap | null => {
  const s = (ev.format as Record<string, unknown> | undefined)?.courseSnap as Partial<CourseSnap> | undefined;
  return s && Array.isArray(s.holes) && (s.holes.length === 9 || s.holes.length === 18) ? { holes: s.holes, tees: Array.isArray(s.tees) ? s.tees : [] } : null;
};
/** Does this round carry its own copy of the course? */
export const hasCourseSnap = (ev: Pick<FieldEvent, 'format'>) => snapIn(ev) != null;

/** The course as this round is scored: a finished round's own copy when it
 *  has one, else the course as it is now. */
export function courseAsPlayed(ev: Pick<FieldEvent, 'format'>, course: GolfCourse): GolfCourse {
  const s = snapIn(ev);
  return s ? { ...course, holes: s.holes, tees: s.tees.length ? s.tees : course.tees } : course;
}

/** playerId → tee name for players not on the round's tee. */
export const entryTeesOf = (ev: Pick<FieldEvent, 'format'>): Record<string, string> => {
  const m = (ev.format as Record<string, unknown> | undefined)?.entryTees;
  if (!m || typeof m !== 'object') return {};
  return Object.fromEntries(Object.entries(m as Record<string, unknown>).filter(([, v]) => typeof v === 'string' && v)) as Record<string, string>;
};

/** The tee a player plays: their own (format.entryTees), else the round's
 *  tee, else the course's first tee. */
export function teeFor(ev: Pick<FieldEvent, 'format'>, course: Pick<GolfCourse, 'tees'>, playerId?: string): Tee | undefined {
  const own = playerId ? entryTeesOf(ev)[playerId] : undefined;
  const roundTee = (ev.format as Record<string, unknown> | undefined)?.tee;
  return (own ? course.tees.find((t) => t.name === own) : undefined)
    ?? course.tees.find((t) => t.name === roundTee)
    ?? course.tees[0];
}

/** WHS Rule 6.2b mixed tees: extra strokes for a player on a tee whose par
 *  is higher than the lowest par among the tees in use (18-hole rounds; tees
 *  without their own par use the holes' par). 0 when everyone shares a par. */
export function mixedTeeExtra(ev: Pick<FieldEvent, 'format'>, course: Pick<GolfCourse, 'tees'>, tee: Tee | undefined, holes: Hole[]): number {
  if (holes.length !== 18 || !tee) return 0;
  const used = new Set<string>(Object.values(entryTeesOf(ev)));
  if (!used.size) return 0; // one tee for everyone
  const roundTee = teeFor(ev, course);
  if (roundTee) used.add(roundTee.name);
  const parFor = (t?: Tee) => t?.par ?? parOf(holes);
  const pars = [...used].map((n) => parFor(course.tees.find((t) => t.name === n)));
  return Math.max(0, parFor(tee) - Math.min(...pars));
}

/** A round format after tees were renamed (old name → new name), or null
 *  when nothing in it changes. */
export function renameTeesInFormat(format: Record<string, unknown>, renames: Record<string, string>): Record<string, unknown> | null {
  if (!Object.keys(renames).length) return null;
  let changed = false;
  const out: Record<string, unknown> = { ...format };
  if (typeof format.tee === 'string' && renames[format.tee]) { out.tee = renames[format.tee]; changed = true; }
  const et = format.entryTees as Record<string, string> | undefined;
  if (et && typeof et === 'object') {
    const next = Object.fromEntries(Object.entries(et).map(([pid, n]) => [pid, renames[n] ?? n]));
    if (Object.entries(next).some(([pid, n]) => et[pid] !== n)) { out.entryTees = next; changed = true; }
  }
  return changed ? out : null;
}

/** Who may edit a course (mirrors RLS golf_courses_update: the creator; the
 *  server also lets support staff). A course with no creator on file (demo
 *  seed) is editable in demo only — the caller passes `demo`. */
export const canEditCourse = (course: Pick<GolfCourse, 'createdBy'>, profileId: string | undefined, demo: boolean): boolean =>
  demo ? true : !!profileId && course.createdBy === profileId;
