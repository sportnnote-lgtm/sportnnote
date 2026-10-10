/**
 * SD-94 — swimming on the results engine (World Aquatics Swimming Rules 2023–
 * 2025): the catalogue (SW 12), the school programme by category and pool,
 * round presets (timed final, heats → final, semis), seeding (SW 3.1.1 heats,
 * SW 3.1.2 lanes, SW 3.2.1 semis), timed-final ranking across heats, ties
 * stand (SW 11.2) with a swim-off for the qualifying line (SW 3.2.3), manual
 * timing (SW 11.3), splits, DQ codes (SW 4–10, relay take-off SW 10.13), mixed
 * relays (SW 10.11), records and PBs per pool length, stat lines, careers and
 * the house table.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  disciplineOf, rankEntries, rankByHeat, qualify, withRecordFlags, updateRecords, categoryKey, categoryLabel, eventAwards,
  swimEventOf, swimEventsFor, swimRoundPresets, roundPresets, describePlan, heatSizes, heatAssignment, swimLaneOrder, swimSeed, timedFinalHeats,
  officialManualTime, splitDistances, splitsError, splitsText, leadOffSplit, dqCodesFor, dqReason, legLabels, mixedRelayError,
  swimMeetSettings, phaseDiscipline, laneNumbers, courseShort, formatMark, markKey, markKeyDiscipline, phaseLines, athleticsCareer,
  groupMeet, meetFieldResults, eventLeaders, deriveRecordBook, startListText, resultsText, SWIM_DQ,
  type DisciplineDef, type ResultEntry, type EntryResult, type MeetPhase, type PhaseFormat, type PhaseInfo, type Category, type RecordMark,
} from '../src/data/results/index.ts';
import { medalStandings } from '../src/data/medalStandings.ts';
import { STAT_SCHEMAS, statSchema } from '../src/sports/statSchemas.ts';
import { validateSchema } from '../src/sports/statSchema.ts';
import { isEventSport } from '../src/sports/eventSports.ts';
import { setupChecklist } from '../src/data/setupChecklist.ts';

const D = (k: string): DisciplineDef => { const d = disciplineOf(k); assert.ok(d, k); return d!; };
const F50 = D('swim.50free'), MED4 = D('swim.4x50medley');
const U12G: Category = { age: 'U12', gender: 'F', course: 'LCM' };
const HOUSES = ['Red', 'Blue', 'Green', 'Gold'];
const swimmer = (i: number, result: EntryResult = {}, heat = 1): ResultEntry =>
  ({ id: `e${i}`, athleteId: `p${i}`, name: `Swimmer ${i}`, heat, result, team: { name: `${HOUSES[i % 4]} House` } });
const labels = (rows: { label: string; id: string }[]) => rows.map((r) => `${r.label}:${r.id}`);

/* ------------------------------ catalogue -------------------------------- */

describe('catalogue: the World Aquatics events (SW 12.1 / 12.2)', () => {
  test('every recognised individual and relay event exists, timed to 1/100, ties stand', () => {
    for (const k of ['50free', '100free', '200free', '400free', '800free', '1500free', '50back', '100back', '200back', '50breast', '100breast', '200breast',
      '50fly', '100fly', '200fly', '100im', '200im', '400im', '4x50free', '4x100free', '4x200free', '4x50medley', '4x100medley']) {
      const d = D(`swim.${k}`);
      assert.equal(d.sport, 'swimming');
      assert.equal(d.unit, 'time');
      assert.equal(d.dp, 2);
      assert.equal(d.tie, 'stands');
      assert.equal(d.lanes, 8);
    }
    assert.equal(D('swim.4x100medley').teamSize, 4);
    assert.equal(D('swim.200im').label, '200 m individual medley');
  });
  test('event parsing: distance, stroke, legs', () => {
    assert.deepEqual(swimEventOf('swim.4x100medley'), { distance: 400, stroke: 'medley', relay: true, legs: 4, legDistance: 100 });
    assert.deepEqual(swimEventOf('swim.1500free'), { distance: 1500, stroke: 'free', relay: false, legs: 1, legDistance: 1500 });
    assert.equal(swimEventOf('ath.100m'), null);
  });
  test('swimming is an event sport (setup checklist: houses, then events)', () => {
    assert.ok(isEventSport('swimming') && isEventSport('athletics') && !isEventSport('football'));
    const steps = setupChecklist({ sports: ['swimming'], formats: {}, participation: 'team' } as never, 4, 0, 1);
    assert.deepEqual(steps.map((s) => [s.key, s.done]), [['teams', true], ['events', true]]);
    assert.match(steps[1].hint, /swimmers/);
  });
});

/* ------------------------------ programme -------------------------------- */

describe('programme by category and pool', () => {
  test('U12 girls, 50 m pool: 50 m of every stroke, 100s, 200 free, 200 IM, the 4 × 50 relays', () => {
    const keys = swimEventsFor({ age: 'U12', gender: 'F' }, 'LCM').map((e) => e.discipline.slice(5));
    assert.deepEqual(keys, ['50free', '100free', '200free', '50back', '100back', '50breast', '100breast', '50fly', '100fly', '200im', '4x50free', '4x50medley']);
  });
  test('100 m IM only in a 25 m pool (SW 12.2); distance events from U16', () => {
    assert.ok(swimEventsFor({ age: 'U10', gender: 'M' }, 'SCM').some((e) => e.discipline === 'swim.100im'));
    assert.ok(!swimEventsFor({ age: 'Open', gender: 'M' }, 'LCM').some((e) => e.discipline === 'swim.100im'));
    assert.ok(!swimEventsFor({ age: 'U14', gender: 'M' }).some((e) => e.discipline === 'swim.1500free'));
    assert.ok(swimEventsFor({ age: 'U16', gender: 'M' }).some((e) => e.discipline === 'swim.1500free'));
  });
  test('mixed is relays only (SW 10.1), 2 men + 2 women (SW 10.11)', () => {
    assert.ok(swimEventsFor({ age: 'U14', gender: 'X' }).every((e) => e.group === 'relay'));
    assert.equal(mixedRelayError(['M', 'F', 'Male', 'girl']), null);
    assert.equal(mixedRelayError(['M', 'F', undefined, '']), null); // unknown never held against it
    assert.match(mixedRelayError(['M', 'M', 'boy', 'F'])!, /2 men and 2 women/);
  });
  test('meet settings: 50 m pool, 8 lanes, splits on by default; a 10-lane pool numbers 0–9', () => {
    assert.deepEqual(swimMeetSettings({}), { positionPoints: [8, 7, 6, 5, 4, 3, 2, 1], relayFactor: 1, manual: false, reaction: false, course: 'LCM', lanes: 8, splits: true });
    const s = swimMeetSettings({ course: 'SCM', lanes: 10, handTimed: true, splits: false });
    assert.deepEqual([s.course, s.lanes, s.manual, s.splits], ['SCM', 10, true, false]);
    assert.deepEqual(laneNumbers(10), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.deepEqual(laneNumbers(6), [1, 2, 3, 4, 5, 6]);
    assert.equal(phaseDiscipline(F50, { lanes: 10 }).lanes, 10);
    assert.equal(phaseDiscipline(F50, {}).lanes, 8);
  });
});

/* -------------------------------- rounds --------------------------------- */

describe('round presets', () => {
  test('a field that fits the pool: straight final only', () => {
    assert.deepEqual(swimRoundPresets(F50, 8).map((p) => p.key), ['final']);
  });
  test('14 swimmers, 8 lanes: timed final in 2 heats first, or heats → final (fastest 8 on time)', () => {
    const p = roundPresets(F50, 14);
    assert.deepEqual(p.map((x) => x.key), ['timed', 'heats']);
    assert.deepEqual(p[0].plan, [{ phase: 'final', heats: 2 }]);
    assert.deepEqual(p[1].plan, [{ phase: 'heat', heats: 2, progression: { byMark: 8 } }, { phase: 'final', heats: 1 }]);
    assert.equal(describePlan(p[0].plan), 'Timed final in 2 heats (places on time across heats)');
    assert.equal(describePlan(p[1].plan), '2 heats (8 fastest) → Final');
  });
  test('over two pools: semi-finals (16 → 8)', () => {
    const semis = swimRoundPresets(F50, 30).find((x) => x.key === 'semis')!;
    assert.deepEqual(semis.plan.map((x) => [x.phase, x.heats, x.progression?.byMark]), [['heat', 4, 16], ['semi', 2, 8], ['final', 1, undefined]]);
    assert.deepEqual(swimRoundPresets(F50, 30, 10).find((x) => x.key === 'semis')!.plan.map((x) => x.progression?.byMark), [20, 10, undefined]);
  });
  test('athletics gets the timed final too (lane races over the lane count)', () => {
    assert.ok(roundPresets(D('ath.100m'), 14).some((p) => p.key === 'timed'));
    assert.ok(!roundPresets(D('ath.100m'), 8).some((p) => p.key === 'timed'));
  });
});

/* ------------------------------- seeding --------------------------------- */

describe('seeding (SW 3.1.1, 3.1.2, 3.2.1)', () => {
  test('heat sizes: last heats full, at least three in the first (SW 3.1.1.6)', () => {
    assert.deepEqual(heatSizes(14, 8), [6, 8]);
    assert.deepEqual(heatSizes(9, 8), [3, 6]);
    assert.deepEqual(heatSizes(17, 8), [3, 6, 8]);
    assert.deepEqual(heatSizes(8, 8), [8]);
  });
  test('two heats alternate from the last heat (SW 3.1.1.2)', () => {
    assert.deepEqual(heatAssignment(16, 8), [[1, 3, 5, 7, 9, 11, 13, 15], [0, 2, 4, 6, 8, 10, 12, 14]]);
  });
  test('three heats: fastest in heat 3, next heat 2, next heat 1 … (SW 3.1.1.3)', () => {
    const a = heatAssignment(24, 8);
    assert.deepEqual(a.map((h) => h.slice(0, 3)), [[2, 5, 8], [1, 4, 7], [0, 3, 6]]);
  });
  test('four heats: the last three circle-seeded, heat 1 the slowest (SW 3.1.1.4)', () => {
    const a = heatAssignment(30, 8);
    assert.deepEqual(a.map((h) => h.length), [6, 8, 8, 8]);
    assert.deepEqual(a[0], [24, 25, 26, 27, 28, 29]);
    assert.deepEqual(a[3].slice(0, 3), [0, 3, 6]);
  });
  test('400 m and longer: only the last two heats are circle-seeded (SW 3.1.1.5)', () => {
    const a = heatAssignment(24, 8, { distance: 400 });
    assert.deepEqual(a[2].slice(0, 3), [0, 2, 4]);
    assert.deepEqual(a[1].slice(0, 3), [1, 3, 5]);
    assert.deepEqual(a[0], [16, 17, 18, 19, 20, 21, 22, 23]);
  });
  test('lanes: fastest in the centre, next on the left, then right / left (SW 3.1.2)', () => {
    assert.deepEqual(swimLaneOrder(8), [4, 5, 3, 6, 2, 7, 1, 8]);
    assert.deepEqual(swimLaneOrder(10), [4, 5, 3, 6, 2, 7, 1, 8, 0, 9]);
    assert.deepEqual(swimLaneOrder(6), [3, 4, 2, 5, 1, 6]);
    assert.deepEqual(swimLaneOrder(5), [3, 4, 2, 5, 1]);
  });
  test('timed final of 14: the 8 fastest in heat 2 (lane 4 the fastest), the other 6 in heat 1', () => {
    const ids = Array.from({ length: 14 }, (_, i) => `s${i}`);
    const seeded = swimSeed(ids, 'final', 2, 8, 'swim.50free');
    const h2 = seeded.filter((s) => s.heat === 2);
    assert.deepEqual(h2.map((s) => s.id), ['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7']);
    assert.deepEqual(h2.map((s) => s.lane), [4, 5, 3, 6, 2, 7, 1, 8]);
    assert.deepEqual(seeded.filter((s) => s.heat === 1).map((s) => `${s.id}:L${s.lane}`), ['s8:L4', 's9:L5', 's10:L3', 's11:L6', 's12:L2', 's13:L7']);
    assert.deepEqual(timedFinalHeats(14, 8), [[8, 9, 10, 11, 12, 13], [0, 1, 2, 3, 4, 5, 6, 7]]);
  });
  test('semi-finals alternate, the fastest in the last semi (SW 3.2.1); a final by lanes (SW 3.2.2)', () => {
    const ids = Array.from({ length: 16 }, (_, i) => `q${i}`);
    const s = swimSeed(ids, 'semi', 2, 8, 'swim.50free');
    assert.deepEqual(s.filter((x) => x.heat === 2).map((x) => x.id).slice(0, 3), ['q0', 'q2', 'q4']);
    assert.equal(s.find((x) => x.id === 'q0')!.lane, 4);
    assert.equal(s.find((x) => x.id === 'q1')!.heat, 1);
    const fin = swimSeed(ids.slice(0, 8), 'final', 1, 10, 'swim.50free');
    assert.deepEqual(fin.map((x) => x.lane), [4, 5, 3, 6, 2, 7, 1, 8]);
    // nine through on a tie at 8th (no swim-off yet): still one final, the 9th in the next lane
    const nine = swimSeed(ids.slice(0, 9), 'final', 1, 8, 'swim.50free');
    assert.deepEqual([new Set(nine.map((x) => x.heat)).size, nine[8].lane], [1, 9]);
  });
});

/* --------------------------- ranking & ties ------------------------------ */

describe('timed final ranking, ties stand, swim-off for the line', () => {
  // 14 U12 girls over two heats: heat 2 the faster seeds, but a heat-1 swimmer wins bronze.
  const times = [33.10, 33.45, 34.02, 34.02, 35.10, 35.88, 36.40, 37.00, 33.90, 36.10, 38.20, 39.00, 40.15, 41.30];
  const field = times.map((t, i) => swimmer(i, { mark: t, lane: (i % 8) + 1 }, i < 8 ? 2 : 1));
  test('places come from times across both heats; equal hundredths share (=3), no 4th', () => {
    const rows = rankEntries(field, F50);
    assert.deepEqual(labels(rows).slice(0, 6), ['1:e0', '2:e1', '3:e8', '=4:e2', '=4:e3', '6:e4']);
    const aw = eventAwards(rows);
    assert.deepEqual(aw.slice(0, 3).map((a) => [a.name, a.medal]), [['Swimmer 0', 'gold'], ['Swimmer 1', 'silver'], ['Swimmer 8', 'bronze']]);
    assert.deepEqual(aw.filter((a) => a.position === 4).map((a) => a.points), [4.5, 4.5]);
  });
  test('a DQ has no time or place (SW 11.4) and is listed after the ranked swimmers', () => {
    const rows = rankEntries([...field.slice(0, 3), swimmer(20, { status: 'DQ', ruleRef: 'SW 7.6', reason: 'One-hand touch' })], F50);
    assert.deepEqual(labels(rows), ['1:e0', '2:e1', '3:e2', 'DQ:e20']);
    assert.equal(rows[3].bestText, '');
  });
  test('heats → final: equal 8th — all through until a swim-off decides; the heat sheet still shows the tie', () => {
    const heats = [...Array.from({ length: 7 }, (_, i) => swimmer(i, { mark: 30 + i / 10 }, (i % 2) + 1)), swimmer(7, { mark: 31.0 }, 1), swimmer(8, { mark: 31.0 }, 2), swimmer(9, { mark: 32.5 }, 2)];
    let q = qualify(rankByHeat(heats, F50), F50, { byMark: 8 });
    assert.equal(q.marks.size, 9);
    assert.deepEqual(q.tieAtLine.sort(), ['e7', 'e8']);
    const after = heats.map((e) => (e.id === 'e7' ? { ...e, result: { ...e.result, decider: 2 } } : e.id === 'e8' ? { ...e, result: { ...e.result, decider: 1 } } : e));
    q = qualify(rankByHeat(after, F50), F50, { byMark: 8 });
    assert.equal(q.marks.size, 8);
    assert.ok(q.marks.has('e8') && !q.marks.has('e7'));
    // the swim-off doesn't change the result of the heats: still level
    const overall = rankEntries(after, F50);
    assert.deepEqual(overall.filter((r) => r.id === 'e7' || r.id === 'e8').map((r) => r.label), ['=8', '=8']);
  });
});

/* ------------------------------- timing ---------------------------------- */

describe('manual timing (SW 11.3), splits, DQ codes', () => {
  test('three watches: two agree → that; all differ → the middle; two watches → the average, thousandth dropped', () => {
    assert.equal(officialManualTime([32.45, 32.51, 32.45]), 32.45);
    assert.equal(officialManualTime([32.45, 32.51, 32.48]), 32.48);
    assert.equal(officialManualTime([32.45, 32.50]), 32.47); // 32.475 → 32.47
    assert.equal(officialManualTime([32.45, undefined]), 32.45);
    assert.equal(officialManualTime([]), null);
  });
  test('splits every 50 m before the finish; relays split at every 50 (the 50 m legs included)', () => {
    assert.deepEqual(splitDistances('swim.50free'), []);
    assert.deepEqual(splitDistances('swim.200free'), [50, 100, 150]);
    assert.deepEqual(splitDistances('swim.4x50medley'), [50, 100, 150]);
    assert.equal(splitsError([31.2, 65.3, 99.0], 132.1), null);
    assert.match(splitsError([31.2, 30.0])!, /Split 2/);
    assert.match(splitsError([31.2, 65.3, 99.0], 98.0)!, /final time/);
    assert.equal(splitsText([31.2, 65.3], (v) => formatMark(v, F50), 'swim.200free'), '50 m 31.20 · 100 m 1:05.30 (34.10)');
    assert.equal(leadOffSplit('swim.4x50medley', [36.5, 78.0, 112.0]), 36.5);
    assert.equal(leadOffSplit('swim.200free', [31.2]), undefined);
  });
  test('DQ codes follow the stroke: breaststroke touch only in breaststroke / medley; take-off only in relays', () => {
    const br = dqCodesFor('swim.100breast').map((c) => c.ref);
    assert.ok(br.includes('SW 7.6') && br.includes('SW 4.4') && !br.includes('SW 8.4') && !br.includes('SW 10.13'));
    const med = dqCodesFor('swim.4x50medley').map((c) => c.ref);
    for (const r of ['SW 6.5', 'SW 7.6', 'SW 8.4', 'SW 5.2', 'SW 9.3', 'SW 10.13', 'SW 10.15']) assert.ok(med.includes(r), r);
    assert.ok(!med.includes('SW 9.1'));
    assert.ok(dqCodesFor('swim.200im').some((c) => c.ref === 'SW 9.1'));
    const early = SWIM_DQ.find((c) => c.ref === 'SW 10.13')!;
    assert.equal(dqReason(early, 3, 'swim.4x50free'), 'Early take-off — leg 3');
    assert.equal(dqReason(early, 3, 'swim.4x50medley'), 'Early take-off — Butterfly leg');
    assert.deepEqual(legLabels('swim.4x100medley'), ['Backstroke', 'Breaststroke', 'Butterfly', 'Freestyle']); // SW 9.3
  });
});

/* ------------------------- meet, records, careers ------------------------ */

const CAT_LC: Category = { age: 'U12', gender: 'F', course: 'LCM' };
const CAT_SC: Category = { age: 'U12', gender: 'F', course: 'SCM' };
const fmt = (discipline: string, category: Category, eventKey: string, extra: Partial<PhaseFormat> = {}): PhaseFormat =>
  ({ discipline, category, phase: 'final', phaseNo: 1, heats: 1, eventKey, eventTitle: `${D(discipline).label} ${categoryLabel(category)}`, ...extra });
const relay = (house: number, mark: number | undefined, extra: EntryResult = {}): ResultEntry => ({
  id: `r${house}`, name: `${HOUSES[house]} House`, heat: 1, team: { name: `${HOUSES[house]} House` },
  result: { mark, name: `${HOUSES[house]} House`, members: [0, 1, 2, 3].map((k) => ({ playerId: `m${house}${k}`, name: `M${house}${k}` })), ...extra },
});

describe('records per pool length, house table, careers', () => {
  test('the category key keeps the pool: long and short course records never mix', () => {
    assert.equal(categoryKey(CAT_LC), 'U12-F-LCM');
    assert.equal(categoryKey(CAT_SC), 'U12-F-SCM');
    assert.equal(categoryLabel(CAT_LC), 'U12 Girls');
    const rows = rankEntries([swimmer(1, { mark: 33.0 }), swimmer(2, { mark: 34.0 })], F50);
    const book: RecordMark[] = [{ scope: 'MR', discipline: 'swim.50free', category: 'U12-F-SCM', value: 32.5, holder: 'Short Course' }];
    const flagged = withRecordFlags(rows, F50, { history: [], records: book, category: categoryKey(CAT_LC), seasonFrom: '2026-01-01' });
    assert.ok(!flagged[0].flags.includes('MR')); // the SC record isn't this LC event's
    const next = updateRecords(rows, F50, categoryKey(CAT_LC), book, '2026-10-11', ['MR']);
    assert.deepEqual(next.map((r) => [r.category, r.value]).sort(), [['U12-F-LCM', 33], ['U12-F-SCM', 32.5]]);
  });
  const phases: MeetPhase[] = [
    { id: 'f50', format: fmt('swim.50free', CAT_LC, 'ev50', { heats: 2 }), status: 'completed', date: '2026-10-11T09:00:00Z',
      entries: [swimmer(0, { mark: 33.1 }, 2), swimmer(1, { mark: 33.45 }, 2), swimmer(8, { mark: 33.9 }, 1), swimmer(3, { mark: 34.0 }, 2)] },
    { id: 'rmed', format: fmt('swim.4x50medley', { age: 'U14', gender: 'M', course: 'LCM' }, 'evmed'), status: 'completed', date: '2026-10-11T11:00:00Z',
      entries: [relay(0, 2 * 60 + 31.4), relay(1, 2 * 60 + 29.8), relay(2, 2 * 60 + 35.0), relay(3, 2 * 60 + 28.9, { status: 'DQ', ruleRef: 'SW 10.13', reason: 'Early take-off — Butterfly leg' })] },
  ];
  const events = groupMeet(phases);
  test('house table: individual finals + relays (DQ scores nothing), relays ×2', () => {
    const fr = meetFieldResults(events, { positionPoints: [8, 7, 6, 5, 4, 3, 2, 1], relayFactor: 2 });
    assert.equal(fr[0].sport, 'swimming');
    const relayAw = fr[1].awards;
    assert.deepEqual(relayAw.map((a) => [a.name, a.position, a.points]), [['Blue House', 1, 16], ['Red House', 2, 14], ['Green House', 3, 12]]);
    const table = medalStandings([], [], { mode: 'position' }, undefined, fr);
    const row = (n: string) => table.find((t) => t.name === n)!;
    // 50 free: Red 8 (S0) · Blue 7 (S1) · Red 6 (S8) · Gold 5 (S3)
    assert.equal(row('Red House').total, 8 + 6 + 14);
    assert.equal(row('Blue House').total, 7 + 16);
    assert.equal(row('Gold House').total, 5);
    assert.equal(table[0].name, 'Red House');
  });
  test('leaders and the derived school record book are per course', () => {
    assert.deepEqual(eventLeaders(events).map((l) => [l.title, l.name, l.text]), [['50 m freestyle U12 Girls', 'Swimmer 0', '33.10'], ['4 × 50 m medley relay U14 Boys', 'Blue House', '2:29.80']]);
    const sr = deriveRecordBook(events, 'SR');
    assert.deepEqual(sr.map((r) => [r.discipline, r.category, r.value]), [['swim.50free', 'U12-F-LCM', 33.1], ['swim.4x50medley', 'U14-M-LCM', 149.8]]);
  });
  test('stat lines: the legal time under a per-course key; relay members get a relay line', () => {
    assert.equal(markKey('swim.50free', 'LCM'), 'm_sw_50free_lc');
    assert.equal(markKey('swim.50free', 'SCM'), 'm_sw_50free_sc');
    assert.equal(markKey('ath.100m'), 'm_100m');
    assert.deepEqual(markKeyDiscipline('m_sw_100breast_sc'), { discipline: 'swim.100breast', course: 'SCM' });
    const rows = rankEntries(phases[0].entries, F50);
    const lines = phaseLines(phases[0].format, rows, eventAwards(rows));
    assert.deepEqual(lines[0].stats, { place: 1, finals: 1, golds: 1, races: 1, posPoints: 8, mark: 33.1, m_sw_50free_lc: 33.1 });
    const rl = phaseLines(phases[1].format, rankEntries(phases[1].entries, MED4));
    assert.equal(rl.filter((l) => l.stats.relays === 1).length, 16); // 4 teams × 4 legs (the DQ team too: dq = 1)
    assert.equal(rl.find((l) => l.playerId === 'm30')!.stats.dq, 1);
  });
  test('career: PBs per event per pool length (LC and SC apart), history newest first', () => {
    const info = (id: string, course: 'LCM' | 'SCM', date: string): [string, PhaseInfo] =>
      [id, { discipline: 'swim.50free', category: { ...U12G, course }, phase: 'final', title: `50 m freestyle — ${courseShort(course)}`, date }];
    const lines = [
      { eventId: 'a', date: '2026-03-01', stats: { races: 1, place: 2, mark: 34.2, m_sw_50free_lc: 34.2 } },
      { eventId: 'b', date: '2026-06-01', stats: { races: 1, place: 1, golds: 1, mark: 33.0, m_sw_50free_sc: 33.0 } },
      { eventId: 'c', date: '2026-10-11', stats: { races: 1, place: 1, golds: 1, mark: 33.6, m_sw_50free_lc: 33.6 } },
    ];
    const c = athleticsCareer(lines, new Map([info('a', 'LCM', '2026-03-01'), info('b', 'SCM', '2026-06-01'), info('c', 'LCM', '2026-10-11')]), '2026-01-01');
    assert.deepEqual(c.bests.map((b) => [b.label, b.pb.text]), [['50 m freestyle (LC)', '33.60'], ['50 m freestyle (SC)', '33.00']]);
    assert.equal(c.history[0].eventId, 'c');
    assert.ok(c.history[0].flags.includes('PB')); // 33.60 beat the earlier LC 34.20 (the SC 33.00 doesn't count)
    // without phase infos the key alone still separates the courses
    assert.equal(athleticsCareer(lines, new Map(), '2026-01-01').bests.length, 2);
  });
  test('share text: start list by heat, results overall with the swimmer emoji', () => {
    const sl = startListText('50 m freestyle U12 Girls — Final', [{ heat: 1, lane: 4, name: 'A' }, { heat: 2, lane: 4, name: 'B' }], undefined, '🏊');
    assert.match(sl, /^🏊 START LIST/);
    assert.match(sl, /Heat 2\nL4 B/);
    const rt = resultsText('50 m freestyle U12 Girls — Final', [{ heat: 0, name: 'B', mark: '33.10', place: '1' }, { heat: 0, name: 'A', mark: '33.90', place: '2' }], true, undefined, '🏊');
    assert.equal(rt, '🏊 RESULTS · 50 m freestyle U12 Girls — Final\n1. B 33.10\n2. A 33.90');
  });
});

describe('stat schema', () => {
  test('valid, measured career, per-course PB leaders', () => {
    const s = statSchema('swimming')!;
    assert.deepEqual(validateSchema(STAT_SCHEMAS.swimming), []);
    assert.equal(s.careerView, 'measured');
    assert.ok(s.stats.some((x) => x.key === 'pb_sw_50free_lc') && s.stats.some((x) => x.key === 'pb_sw_50free_sc'));
  });
});
