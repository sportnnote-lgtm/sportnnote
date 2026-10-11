/**
 * SD-122 (audit-2 P0 #7) — golf course editor: hole / tee validation, open
 * rounds recompute after an edit, finished rounds keep the course they were
 * played on (format.courseSnap) until recomputed, per-player tees and the WHS
 * mixed-tee adjustment.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateHoles, validateTees, courseAsPlayed, snapOf, hasCourseSnap, teeFor, mixedTeeExtra, renameTeesInFormat, canEditCourse,
} from '../src/data/golfCourses.ts';
import { buildLeaderboard, roundContext } from '../src/data/golfLeaderboard.ts';
import { standardPar72, courseHandicap, type GolfCard, type Hole } from '../src/sports/golf/engine.ts';
import { roundDifferential } from '../src/sports/golf/handicap.ts';
import type { FieldEntry, FieldEvent, GolfCourse } from '../src/core/types.ts';

const H = standardPar72();
const course = (holes: Hole[] = H, tees: GolfCourse['tees'] = [{ name: 'White', courseRating: 72, slope: 113 }]): GolfCourse =>
  ({ id: 'c1', name: 'Lakeview', holes, tees });
const ev = (status: FieldEvent['status'], extra: Record<string, unknown> = {}): FieldEvent => ({
  id: `e-${status}`, sport: 'golf', title: 'Medal', roundNo: 1, startsAt: '2026-10-11T08:00:00Z', status,
  format: { competition: 'stroke', holes: '18', courseId: 'c1', tee: 'White', ...extra },
});
const parCard = (holes: Hole[]): GolfCard => ({ strokes: holes.map((h) => h.par) });
const entry = (eventId: string, playerId: string, card: GolfCard, handicapIndex?: number): FieldEntry =>
  ({ id: `${eventId}-${playerId}`, eventId, playerId, groupNo: 1, result: card, status: 'finished', handicapIndex });

describe('SD-122 — hole validation (stroke index 1–18 / 1–9, each once)', () => {
  test('the standard layout passes; a duplicate SI is named', () => {
    assert.doesNotThrow(() => validateHoles(H));
    const dup = H.map((h) => (h.n === 2 ? { ...h, si: 7 } : h)); // hole 1 is SI 7
    assert.throws(() => validateHoles(dup), /Stroke index 7 is used twice/);
  });
  test('out of range: 19 on 18 holes, 10 on 9 holes, 0 / blank', () => {
    assert.throws(() => validateHoles(H.map((h) => (h.n === 1 ? { ...h, si: 19 } : h))), /1–18/);
    const nine = H.slice(0, 9).map((h, i) => ({ ...h, si: i + 1 }));
    assert.doesNotThrow(() => validateHoles(nine));
    assert.throws(() => validateHoles(nine.map((h) => (h.n === 9 ? { ...h, si: 10 } : h))), /1–9/);
    assert.throws(() => validateHoles(nine.map((h) => (h.n === 9 ? { ...h, si: 0 } : h))), /1–9/);
  });
  test('par 3–6 and 9 or 18 holes', () => {
    assert.throws(() => validateHoles(H.map((h) => (h.n === 1 ? { ...h, par: 7 } : h))), /par between 3 and 6/);
    assert.throws(() => validateHoles(H.slice(0, 12)), /9 or 18 holes/);
  });
});

describe('SD-122 — tee validation', () => {
  test('several tees with rating, slope, par and gender', () => {
    assert.doesNotThrow(() => validateTees([
      { name: 'Blue', colour: 'Blue', courseRating: 73.1, slope: 131 },
      { name: 'White', courseRating: 71.4, slope: 125 },
      { name: 'Red', courseRating: 72.8, slope: 127, par: 74, gender: 'F' },
    ], 18));
  });
  test('rejects: no tee, blank / duplicate names, rating without slope, slope out of range, par out of range', () => {
    assert.throws(() => validateTees([], 18), /at least one tee/);
    assert.throws(() => validateTees([{ name: ' ' }], 18), /needs a name/);
    assert.throws(() => validateTees([{ name: 'Red' }, { name: 'red ' }], 18), /Two tees/);
    assert.throws(() => validateTees([{ name: 'Red', courseRating: 70 }], 18), /both/);
    assert.throws(() => validateTees([{ name: 'Red', courseRating: 70, slope: 160 }], 18), /55 to 155/);
    assert.throws(() => validateTees([{ name: 'Red', par: 50 }], 18), /54–80/);
    assert.doesNotThrow(() => validateTees([{ name: 'Red', par: 36 }], 9));
  });
});

describe('SD-122 — an edit recomputes open rounds; finished rounds stay as recorded', () => {
  // Hole 1 was entered as a par 4 but is really a par 5 (and the SIs of 1 and 4 swapped).
  const wrong = H;
  const fixed = H.map((h) => (h.n === 1 ? { ...h, par: 5, si: 1 } : h.n === 4 ? { ...h, si: 7 } : h));
  const card = parCard(wrong); // the player scored 4 on hole 1

  test('open round: to-par follows the edited course at once', () => {
    const live = ev('live');
    const en = [entry(live.id, 'p1', card)];
    assert.equal(buildLeaderboard([live], en, [course(wrong)])[0].total, 0);
    assert.equal(buildLeaderboard([live], en, [course(fixed)])[0].total, -1, 'a 4 on a par 5 is now a birdie');
  });
  test('finished round with its copy of the course: unchanged by the edit', () => {
    const done = ev('completed', { courseSnap: snapOf(course(wrong)) });
    assert.equal(hasCourseSnap(done), true);
    const en = [entry(done.id, 'p1', card)];
    assert.equal(buildLeaderboard([done], en, [course(fixed)])[0].total, 0);
    assert.deepEqual(courseAsPlayed(done, course(fixed)).holes, wrong);
  });
  test('"Recompute finished rounds" = replace the copy: the round now uses the edit', () => {
    const redone = ev('completed', { courseSnap: snapOf(course(fixed)) });
    assert.equal(buildLeaderboard([redone], [entry(redone.id, 'p1', card)], [course(wrong)])[0].total, -1);
  });
  test('net Stableford and strokes received move with the stroke index (open round)', () => {
    const live = ev('live', { competition: 'stableford' });
    // index 2: before CH 2 (par 72) → PH 2; after CH 1 (par is now 73, CR 72) → PH 1, on SI 1
    const en = entry(live.id, 'p1', card, 2);
    const before = roundContext(live, course(wrong), en);
    const after = roundContext(live, course(fixed), en);
    assert.equal(before.playingHandicap, 2);
    assert.equal(after.playingHandicap, 1, 'the extra par lowers CR − Par');
    assert.equal(before.received[3], 1, 'SI 1 was hole 4');
    assert.equal(after.received[0], 1, 'SI 1 is now hole 1');
    assert.equal(after.received[3], 0);
  });
  test('the differential follows the tee rating / slope of the edited course', () => {
    const live = ev('live');
    const c1 = course(H, [{ name: 'White', courseRating: 72, slope: 113 }]);
    const c2 = course(H, [{ name: 'White', courseRating: 70.5, slope: 125 }]);
    const en = entry(live.id, 'p1', parCard(H), 10);
    const d1 = roundDifferential(parCard(H), H, roundContext(live, c1, en).tee, 10)!;
    const d2 = roundDifferential(parCard(H), H, roundContext(live, c2, en).tee, 10)!;
    assert.equal(d1.differential, 0);
    assert.equal(d2.differential, Math.round(((72 - 70.5) * 113 / 125) * 10) / 10);
  });
  test('a round without a copy (finished before SD-122, server trigger not run) reads the course', () => {
    const old = ev('completed');
    assert.equal(hasCourseSnap(old), false);
    assert.equal(courseAsPlayed(old, course(fixed)).holes, fixed);
  });
});

describe('SD-122 — tees: per player, renames, mixed-tee adjustment', () => {
  const tees: GolfCourse['tees'] = [
    { name: 'White', courseRating: 71, slope: 125 },
    { name: 'Red', courseRating: 73, slope: 130, par: 74, gender: 'F' },
  ];
  const c = course(H, tees);
  test('a player plays their own tee; others the round\'s tee', () => {
    const e = ev('live', { entryTees: { p1: 'White', p2: 'Red' } });
    assert.equal(teeFor(e, c, 'p2')?.name, 'Red');
    assert.equal(teeFor(e, c, 'p1')?.name, 'White');
    assert.equal(teeFor(e, c, 'p9')?.name, 'White');
    assert.equal(teeFor(e, c, undefined)?.name, 'White');
  });
  test('course handicap uses the tee\'s own par; WHS 6.2b adds the par difference on the higher-par tee', () => {
    const e = ev('live', { entryTees: { p1: 'White', p2: 'Red' }, allowance: 100 });
    const red = roundContext(e, c, { handicapIndex: 20, playerId: 'p2' });
    const white = roundContext(e, c, { handicapIndex: 20, playerId: 'p1' });
    // CH = 20 × 130/113 + (73 − 74) = 22.0… → 22; CH white = 20 × 125/113 + (71 − 72) = 21.1 → 21
    assert.equal(red.courseHandicap, 22);
    assert.equal(courseHandicap(20, tees[1], H), 22);
    assert.equal(white.courseHandicap, 21);
    assert.equal(mixedTeeExtra(e, c, tees[1], H), 2);
    assert.equal(red.playingHandicap, 24, 'PH 22 + 2 (par 74 vs 72)');
    assert.equal(white.playingHandicap, 21);
  });
  test('one tee for everyone: no adjustment, and old rounds are unchanged', () => {
    const e = ev('live', { tee: 'Red', allowance: 100 });
    assert.equal(mixedTeeExtra(e, c, tees[1], H), 0);
    assert.equal(roundContext(e, c, { handicapIndex: 20, playerId: 'p2' }).playingHandicap, 22);
  });
  test('renaming a tee carries into an open round\'s format', () => {
    const f = { tee: 'Default', entryTees: { p1: 'Default', p2: 'Red' }, courseId: 'c1' };
    assert.deepEqual(renameTeesInFormat(f, { Default: 'White' }), { tee: 'White', entryTees: { p1: 'White', p2: 'Red' }, courseId: 'c1' });
    assert.equal(renameTeesInFormat(f, { Blue: 'Black' }), null);
    assert.equal(renameTeesInFormat(f, {}), null);
  });
  test('who may edit: the course\'s creator (anyone in demo)', () => {
    assert.equal(canEditCourse({ createdBy: 'u1' }, 'u1', false), true);
    assert.equal(canEditCourse({ createdBy: 'u1' }, 'u2', false), false);
    assert.equal(canEditCourse({}, undefined, false), false);
    assert.equal(canEditCourse({}, undefined, true), true);
  });
});
