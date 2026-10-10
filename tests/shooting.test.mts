/**
 * SD-96 — shooting (ISSF) on the results engine: the programme (10 m air
 * rifle / pistol, 50 m 3P, 25 m, mixed team, trap / skeet), shot and series
 * validation, entry by series or shot, qualification ties (total → inner tens →
 * 10-shot series back → shot by shot; decimal without inner tens; 3P by
 * position), the elimination final (from 8th after shot 12, every 2nd shot,
 * gold on shot 24; 3P two out after 40) with shoot-offs, finalists' rows,
 * records on the qualification score, stat lines, career, meet points.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  disciplineOf, rankEntries, categoryKey, categoryLabel, updateRecords, groupMeet, meetFieldResults, deriveRecordBook, eventMeetSettings,
  SHOOT_EVENTS, shootEventOf, maxShot, finalSchedule, seriesCount, positionOf, parseShot, shotError, finalShotError, seriesError, seriesLow,
  seriesFromShots, setSeries, withTotals, totalText, scoreText, finalState, setFinalShot, addShootOff, finalistResult, qualView,
  shootLines, shootingCareer, shootMarkKey, shootMeetSettings, defaultShots, defaultFinalists, finalStatusText, qualify, rankByHeat,
  blankEntries, hasAnyResult, finishDetail, newRecords, eventAwards, withQualification,
  type EntryResult, type ResultEntry, type MeetPhase, type PhaseFormat, type Category,
} from '../src/data/results/index.ts';
import { medalStandings } from '../src/data/medalStandings.ts';
import { STAT_SCHEMAS } from '../src/sports/statSchemas.ts';
import { validateSchema } from '../src/sports/statSchema.ts';
import { isEventSport, eventPrefix, eventWords } from '../src/sports/eventSports.ts';
import { setupChecklist } from '../src/data/setupChecklist.ts';

const AR = disciplineOf('shoot.10mar')!, AP = disciplineOf('shoot.10map')!, R3P = disciplineOf('shoot.50m3p')!, TRAP = disciplineOf('shoot.trap')!;
const evAR = shootEventOf('shoot.10mar')!, evAP = shootEventOf('shoot.10map')!, ev3P = shootEventOf('shoot.50m3p')!;
const HOUSES = ['Red', 'Blue', 'Green', 'Gold'];
const shooter = (i: number, result: EntryResult = {}): ResultEntry =>
  ({ id: `e${i}`, athleteId: `p${i}`, name: `Shooter ${i}`, heat: 1, result: { order: i, ...result }, team: { name: `${HOUSES[i % 4]} House` } });
const labels = (rows: { label: string; id: string }[]) => rows.map((r) => `${r.label}:${r.id}`);
/** A result from series totals (+ X per series). */
const ser = (series: number[], xs: number[] = [], scoring: 'decimal' | 'integer' | 'hits' = 'decimal'): EntryResult =>
  series.reduce<EntryResult>((r, v, i) => setSeries(r, i, scoring, { total: v, xs: xs[i] }), {});

describe('the ISSF programme', () => {
  test('events, scoring and match lengths', () => {
    assert.deepEqual(SHOOT_EVENTS.map((e) => e.key), ['shoot.10mar', 'shoot.10map', 'shoot.50m3p', 'shoot.25mp', 'shoot.25mrf', 'shoot.10marx', 'shoot.10mapx', 'shoot.trap', 'shoot.skeet']);
    assert.equal(AR.dp, 1); assert.equal(AP.dp, 0); assert.equal(AR.tie, 'issf'); assert.equal(AR.capture, 'target');
    assert.equal(disciplineOf('shoot.10marx')!.teamSize, 2);
    assert.equal(maxShot('decimal'), 10.9); assert.equal(maxShot('integer'), 10); assert.equal(maxShot('hits'), 1);
    assert.equal(seriesCount(evAR, 60), 6); assert.equal(seriesCount(evAR, 40), 4); assert.equal(seriesCount(shootEventOf('shoot.25mp')!, 60), 12); assert.equal(seriesCount(shootEventOf('shoot.trap')!, 125), 5);
    assert.deepEqual([0, 1, 2, 3, 4, 5].map((i) => positionOf(ev3P, 60, i)), ['K', 'K', 'P', 'P', 'S', 'S']);
    assert.deepEqual([0, 1, 2].map((i) => positionOf(ev3P, 30, i)), ['K', 'P', 'S']);
    assert.equal(defaultShots(evAR, 'Senior'), 60); assert.equal(defaultShots(evAR, 'School'), 40); assert.equal(defaultShots(ev3P, 'Youth'), 30);
    assert.equal(defaultFinalists(evAR, 12), 8); assert.equal(defaultFinalists(evAR, 8), 6); assert.equal(defaultFinalists(evAR, 4), 0);
    assert.equal(defaultFinalists(shootEventOf('shoot.25mp')!, 20), 0); // 25 m hit-scored finals not built
  });
  test('a shorter match is its own category (records / PBs), shown in the label', () => {
    const c: Category = { age: 'Junior', gender: 'M', shots: 40 };
    assert.equal(categoryKey(c), 'Junior-M-40sh');
    assert.equal(categoryLabel(c), 'Junior Men · 40 shots'); // SD-96: senior / junior read Men / Women
    assert.equal(categoryKey({ age: 'Junior', gender: 'M' }), 'Junior-M');
  });
  test('final schedule: 8 → out after 12, 14 … 22; gold on 24; a final of 6 starts eliminating at 16; 3P two out after 40', () => {
    assert.deepEqual(finalSchedule(evAR.final!, 8), [12, 14, 16, 18, 20, 22]);
    assert.deepEqual(finalSchedule(evAR.final!, 6), [16, 18, 20, 22]);
    assert.deepEqual(finalSchedule(ev3P.final!, 8), [40, 40, 41, 42, 43, 44]);
    assert.deepEqual(finalSchedule(ev3P.final!, 7), [40, 41, 42, 43, 44]);
  });
});

describe('shots and series: validation and entry', () => {
  test('shot values', () => {
    assert.deepEqual(parseShot('10.4', 'decimal'), { value: 10.4 });
    assert.deepEqual(parseShot('x', 'integer'), { value: 'X' });
    assert.ok('error' in parseShot('11', 'integer'));
    assert.ok('error' in parseShot('10.95', 'decimal'));
    assert.equal(shotError(0, 'decimal'), null); // a miss
    assert.match(shotError(0.5, 'decimal')!, /0 \(a miss\) or 1.0 to 10.9/);
    assert.match(shotError(11.0, 'decimal')!, /10.9/);
    assert.equal(finalShotError(10.9), null);
    assert.match(shotError(2, 'hits')!, /hit/);
  });
  test('series: hard limits refuse, a low series asks', () => {
    assert.equal(seriesError(104.6, undefined, 10, 'decimal'), null);
    assert.match(seriesError(109.1, undefined, 10, 'decimal')!, /more than 109.0/);
    assert.match(seriesError(101, 3, 10, 'integer')!, /more than 100/);
    assert.match(seriesError(95, 11, 10, 'integer')!, /Inner tens: 0 to 10/);
    assert.match(seriesError(25, 3, 10, 'integer')!, /at least 30/);
    assert.match(seriesError(98.55, undefined, 10, 'decimal')!, /one decimal/);
    assert.match(seriesError(26, undefined, 25, 'hits')!, /more than 25/);
    assert.equal(seriesLow(80, 10, 'integer'), null);
    assert.match(seriesLow(45, 10, 'integer')!, /looks low/);
  });
  test('series totals, inner tens and shots → the match total (decimal sums exact)', () => {
    const r = ser([104.6, 103.9, 105.2], [], 'decimal');
    assert.equal(r.mark, 313.7);
    assert.deepEqual(r.series, [104.6, 103.9, 105.2]);
    const p = ser([96, 95], [4, 3], 'integer');
    assert.equal(p.mark, 191); assert.equal(p.xs, 7);
    assert.equal(totalText(p.mark, p.xs, 'integer'), '191-7x');
    assert.equal(scoreText(313.7, 'decimal'), '313.7');
    const shots: (number | 'X')[] = ['X', 10, 9, 9, 'X', 8, 10, 9, 10, 'X'];
    assert.deepEqual(seriesFromShots(shots), { total: 95, xs: 3 });
    const s = setSeries({}, 0, 'integer', { total: 0, shots });
    assert.equal(s.mark, 95); assert.equal(s.xs, 3); assert.deepEqual(s.shots?.[0], shots);
    const d = setSeries({}, 0, 'decimal', { total: 0, shots: [10.4, 10.2, 9.9, 10.6, 10.1, 10.3, 10.0, 10.5, 9.8, 10.7] });
    assert.equal(d.mark, 102.5);
    // corrected by series total: the shots are dropped
    const corr = setSeries(s, 0, 'integer', { total: 94, xs: 2 });
    assert.equal(corr.mark, 94); assert.equal(corr.shots, undefined);
    assert.equal(withTotals({ series: [] }, 'decimal').mark, undefined);
  });
});

describe('qualification ranking (ISSF ties)', () => {
  test('decimal (air rifle): total, then the last series back — no inner-ten count', () => {
    const rows = rankEntries([
      shooter(1, ser([104.0, 105.0, 104.5])), // 313.5, last 104.5
      shooter(2, ser([105.0, 103.0, 105.5])), // 313.5, last 105.5 → ahead
      shooter(3, ser([106.0, 104.0, 104.0])), // 314.0
    ], AR);
    assert.deepEqual(labels(rows), ['1:e3', '2:e2', '3:e1']);
    assert.equal(rows[0].bestText, '314.0');
  });
  test('integer (air pistol): total, inner tens, then the last series back, then shot by shot', () => {
    const rows = rankEntries([
      shooter(1, ser([96, 95, 97], [3, 2, 4], 'integer')), // 288-9x
      shooter(2, ser([97, 96, 95], [4, 4, 2], 'integer')), // 288-10x → ahead on X
      shooter(3, ser([95, 96, 97], [3, 3, 3], 'integer')), // 288-9x, last 97 = e1's last; then 96 > 95 → ahead of e1
    ], AP);
    assert.deepEqual(labels(rows), ['1:e2', '2:e3', '3:e1']);
  });
  test('a complete stalemate shares the place; a medal tie asks for a shoot-off (house rule, no final)', () => {
    const rows = rankEntries([shooter(1, ser([96, 95], [3, 2], 'integer')), shooter(2, ser([96, 95], [2, 3], 'integer')), shooter(3, ser([90, 90], [0, 0], 'integer'))], AP);
    assert.deepEqual(rows.map((r) => [r.label, r.flags]), [['=1', ['SO']], ['=1', ['SO']], ['3', []]]);
    const so = rankEntries([shooter(1, { ...ser([96, 95], [3, 2], 'integer'), decider: 2 }), shooter(2, { ...ser([96, 95], [2, 3], 'integer'), decider: 1 })], AP);
    assert.deepEqual(labels(so), ['1:e2', '2:e1']);
  });
  test('shot by shot breaks what the series cannot (an inner ten beats a ten)', () => {
    const a = setSeries({}, 0, 'integer', { total: 0, shots: [10, 10, 9, 9, 9, 9, 9, 9, 9, 'X'] });
    const b = setSeries({}, 0, 'integer', { total: 0, shots: ['X', 10, 9, 9, 9, 9, 9, 9, 9, 10] });
    assert.equal(a.mark, b.mark); assert.equal(a.xs, b.xs);
    assert.deepEqual(labels(rankEntries([shooter(1, b), shooter(2, a)], AP)), ['1:e2', '2:e1']);
  });
  test('3 positions: total, X, then standing, kneeling, prone', () => {
    const k = (kn: number[], pr: number[], stn: number[]) => ser([...kn, ...pr, ...stn], [5, 5, 5, 5, 5, 5], 'integer');
    const rows = rankEntries([shooter(1, k([98, 98], [99, 99], [95, 95])), shooter(2, k([97, 97], [99, 99], [96, 96]))], R3P);
    assert.deepEqual(labels(rows), ['1:e2', '2:e1']); // standing 192 > 190
  });
  test('shotgun: hits, then the last round back', () => {
    const rows = rankEntries([shooter(1, ser([24, 23, 22], [], 'hits')), shooter(2, ser([22, 23, 24], [], 'hits'))], TRAP);
    assert.deepEqual(labels(rows), ['1:e2', '2:e1']);
  });
  test('qualification to the final: best 8 by the tie rules (no shoot-off for the last place)', () => {
    const field = Array.from({ length: 10 }, (_, i) => shooter(i + 1, ser([100 + i * 0.5, 100.0])));
    field[1] = shooter(2, ser([100.0, 101.0])); // 201.0 like e3 (101.0 + 100.0) — the better last series takes 8th
    const q = qualify(rankByHeat(field, AR), AR, { fillTo: 8 });
    assert.equal(q.marks.size, 8);
    assert.ok(q.marks.has('e2') && !q.marks.has('e3') && !q.marks.has('e1'));
    assert.deepEqual(q.tieAtLine, []);
    // a complete stalemate at the line: both go through (the final takes 9)
    field[1] = shooter(2, ser([101.0, 100.0]));
    const q2 = qualify(rankByHeat(field, AR), AR, { fillTo: 8 });
    assert.equal(q2.marks.size, 9);
    assert.deepEqual(q2.tieAtLine.sort(), ['e2', 'e3']);
  });
});

/* ---------------------------------- final ---------------------------------- */

/** 8 finalists with given per-shot values (each a list of 24). */
const finalist = (i: number, shots: number[], so?: Record<string, number[]>): ResultEntry =>
  shooter(i, { fshots: shots, ...(so ? { so } : {}), qual: { mark: 630 - i } });
const flat = (v: number, n: number) => Array.from({ length: n }, () => v);

describe('elimination final (10 m): 8th out after shot 12, then every 2nd shot, gold on 24', () => {
  test('before any shot: no places; status text', () => {
    const rows = rankEntries(Array.from({ length: 8 }, (_, i) => finalist(i + 1, [])), AR);
    assert.ok(rows.every((r) => r.position == null && r.bestLegal == null));
    const st = finalState(Array.from({ length: 8 }, (_, i) => finalist(i + 1, [])), evAR);
    assert.equal(finalStatusText(st, (id) => id), 'Shot 1 of 24 · next elimination after shot 12');
  });
  test('a full final: eliminations in order, places from 8th up, medals', () => {
    // shooter k fires 10.0 + k/10 every shot: e8 best, e1 worst
    const fin = Array.from({ length: 8 }, (_, i) => finalist(i + 1, flat(10 + (i + 1) / 10, 24)));
    const st = finalState(fin, evAR);
    assert.ok(st.done);
    assert.deepEqual(st.out.map((o) => [o.id, o.after, o.place]), [['e1', 12, 8], ['e2', 14, 7], ['e3', 16, 6], ['e4', 18, 5], ['e5', 20, 4], ['e6', 22, 3]]);
    const rows = rankEntries(fin, AR);
    assert.deepEqual(labels(rows), ['1:e8', '2:e7', '3:e6', '4:e5', '5:e4', '6:e3', '7:e2', '8:e1']);
    assert.equal(rows[0].bestText, '259.2'); // 24 × 10.8
    assert.equal(rows[7].bestText, '121.2'); // 12 × 10.1 — the total when eliminated
    assert.ok(rows.every((r) => r.bestLegal == null)); // a final score is never a record / PB
    const aw = eventAwards(rows, {});
    assert.deepEqual(aw.slice(0, 3).map((a) => [a.entryId, a.medal]), [['e8', 'gold'], ['e7', 'silver'], ['e6', 'bronze']]);
  });
  test('in progress: live order by total, the eliminated keep their place', () => {
    const fin = Array.from({ length: 8 }, (_, i) => finalist(i + 1, flat(10 + (i + 1) / 10, 13)));
    const st = finalState(fin, evAR);
    assert.equal(st.out.length, 1);
    assert.equal(st.nextShot, 14);
    assert.equal(st.nextElim, 14);
    const rows = rankEntries(fin, AR);
    assert.equal(rows[0].id, 'e8'); assert.equal(rows[0].label, '1');
    assert.equal(rows[7].id, 'e1'); assert.equal(rows[7].label, '8');
  });
  test('a tie for the elimination: a shoot-off of single shots (not added) decides who goes', () => {
    const fin = Array.from({ length: 8 }, (_, i) => finalist(i + 1, flat(10 + (i + 1) / 10, 12)));
    fin[1] = finalist(2, flat(10.1, 12)); // e1 and e2 level on 121.2 after 12
    const st = finalState(fin, evAR);
    assert.deepEqual(st.shootOff, { after: 12, ids: ['e1', 'e2'], round: 1 });
    assert.match(finalStatusText(st, (id) => id), /Shoot-off at the elimination after shot 12: e1 and e2 — round 1/);
    assert.ok(rankEntries(fin, AR).filter((r) => r.flags.includes('SO')).length === 2);
    // round 1 level again, round 2 decides: e1 10.2 vs e2 9.8 → e2 out (8th)
    let a = addShootOff(fin[0].result, 12, 1, 10.4), b = addShootOff(fin[1].result, 12, 1, 10.4);
    const lvl = [{ ...fin[0], result: a }, { ...fin[1], result: b }, ...fin.slice(2)];
    assert.equal(finalState(lvl, evAR).shootOff?.round, 2);
    a = addShootOff(a, 12, 2, 10.2); b = addShootOff(b, 12, 2, 9.8);
    const done = [{ ...fin[0], result: a }, { ...fin[1], result: b }, ...fin.slice(2)];
    const st2 = finalState(done, evAR);
    assert.equal(st2.shootOff, undefined);
    assert.deepEqual(st2.out[0], { id: 'e2', after: 12, place: 8 });
    // the shoot-off shots don't count: e1 carries on from 121.2
    assert.equal(st2.totals.get('e1'), 1212);
  });
  test('a tie for gold after shot 24 is shot off', () => {
    const fin = Array.from({ length: 8 }, (_, i) => finalist(i + 1, flat(10 + (i + 1) / 10, 24)));
    fin[6] = finalist(7, flat(10.8, 24)); fin[7] = finalist(8, flat(10.8, 24));
    // e7 and e8 level all the way: the elimination of 3rd after 22 takes e6 (lowest), then gold is tied
    const st = finalState(fin, evAR);
    assert.deepEqual(st.shootOff, { after: 24, ids: ['e7', 'e8'], round: 1 });
    assert.ok(!st.done);
    const so = [...fin.slice(0, 6), { ...fin[6], result: addShootOff(fin[6].result, 24, 1, 10.5) }, { ...fin[7], result: addShootOff(fin[7].result, 24, 1, 10.1) }];
    const rows = rankEntries(so, AR);
    assert.deepEqual(labels(rows).slice(0, 3), ['1:e7', '2:e8', '3:e6']);
  });
  test('3P: two out after shot 40, then one after each shot to 44, gold on 45', () => {
    const fin = Array.from({ length: 8 }, (_, i) => finalist(i + 1, flat(10 + (i + 1) / 10, 45)));
    const st = finalState(fin, ev3P);
    assert.deepEqual(st.out.map((o) => [o.id, o.after, o.place]), [['e1', 40, 8], ['e2', 40, 7], ['e3', 41, 6], ['e4', 42, 5], ['e5', 43, 4], ['e6', 44, 3]]);
    assert.ok(st.done);
  });
  test('a final of 6 (school): eliminations from shot 16', () => {
    const fin = Array.from({ length: 6 }, (_, i) => finalist(i + 1, flat(10 + (i + 1) / 10, 24)));
    const st = finalState(fin, evAR);
    assert.deepEqual(st.out.map((o) => [o.after, o.place]), [[16, 6], [18, 5], [20, 4], [22, 3]]);
  });
  test('final shots: add / correct / clear; finalists start from zero; qualification score kept', () => {
    let r: EntryResult = finalistResult(ser([104.0, 105.0], [], 'decimal'));
    assert.deepEqual(r.fshots, []); assert.equal(r.qual?.mark, 209);
    r = setFinalShot(r, 0, 10.5); r = setFinalShot(r, 1, 10.1);
    assert.deepEqual(r.fshots, [10.5, 10.1]);
    assert.deepEqual(setFinalShot(r, 5, 10).fshots, [10.5, 10.1]); // no gaps
    assert.deepEqual(setFinalShot(r, 0, 9.9).fshots, [9.9, 10.1]);
    assert.deepEqual(setFinalShot(r, 1, null).fshots, [10.5]);
    assert.ok(blankEntries([shooter(1, { fshots: [] })], AR).length === 1);
    assert.ok(!hasAnyResult([{ fshots: [] }]) && hasAnyResult([{ fshots: [10.1] }]));
  });
});

/* --------------------------- records, lines, career --------------------------- */

describe('records, stat lines, career, meet', () => {
  const cat: Category = { age: 'Junior', gender: 'M' };
  const qualRows = [shooter(1, ser([104.0, 105.0, 104.5, 103.0, 105.5, 104.6])), shooter(2, ser([103.0, 104.0, 104.0, 104.0, 104.0, 104.0])), shooter(3, ser([100.0, 100.0, 100.0]))];
  test('records are qualification scores; a final reads as its qualification scores', () => {
    const rows = rankEntries(qualRows, AR);
    const book = updateRecords(rows, AR, categoryKey(cat), [], '2026-10-11', ['MR'], 'ev1');
    assert.equal(book[0].value, 626.6); assert.equal(book[0].holder, 'Shooter 1');
    const fin = [finalist(1, flat(10.5, 24)), finalist(2, flat(10.6, 24))].map((e, i) => ({ ...e, result: { ...e.result, qual: { mark: [626.6, 623.0][i] } } }));
    const qv = rankEntries(qualView(fin), AR);
    assert.equal(qv[0].bestLegal, 626.6);
    // the final's own rows never set one
    assert.deepEqual(updateRecords(rankEntries(fin, AR), AR, categoryKey(cat), [], '2026-10-11'), []);
    const detail = finishDetail({ blank: [], def: AR, records: newRecords([], book), unconfirmed: 0 });
    assert.match(detail, /New meet record: 626.6 by Shooter 1\./);
  });
  test('stat lines: match score only when complete; points and shots for the average; inner tens; finals', () => {
    const f: Pick<PhaseFormat, 'discipline' | 'category'> = { discipline: 'shoot.10map', category: { age: 'Senior', gender: 'F', shots: 40 } };
    const r = rankEntries([shooter(1, ser([96, 95, 97, 94], [3, 2, 4, 1], 'integer')), shooter(2, ser([90, 91], [0, 1], 'integer'))], AP);
    const lines = shootLines(f, withQualification(r, { marks: new Map([['e1', 'q' as const]]), tieAtLine: [] }), 'qual');
    assert.deepEqual(lines[0].stats, { comps: 1, qPlace: 1, pts: 382, shots: 40, xs: 10, xShots: 40, m_sh_10map_40: 382, qualified: 1 });
    assert.equal(lines[1].stats.m_sh_10map_40, undefined); // 20 of 40 shots — not a match score
    assert.equal(shootMarkKey('shoot.10map', 60), 'm_sh_10map');
    const fin = rankEntries(Array.from({ length: 8 }, (_, i) => finalist(i + 1, flat(10 + (i + 1) / 10, 24))), AR);
    const fl = shootLines({ discipline: 'shoot.10mar' }, fin, 'final', eventAwards(fin, {}));
    assert.deepEqual(fl.find((l) => l.playerId === 'p8')!.stats, { finals: 1, place: 1, fpts: 259.2, golds: 1, posPoints: 8 });
  });
  test('career: PB per event and match length, average per 10 shots, inner-ten rate, finals reached', () => {
    const phases = new Map([
      ['q1', { discipline: 'shoot.10map', title: '10 m Air Pistol — Qualification', date: '2026-03-01', category: { age: 'Senior', gender: 'F' } as Category }],
      ['f1', { discipline: 'shoot.10map', title: '10 m Air Pistol — Final', date: '2026-03-01', category: { age: 'Senior', gender: 'F' } as Category }],
      ['q2', { discipline: 'shoot.10map', title: '10 m Air Pistol — Qualification', date: '2026-09-01', category: { age: 'Senior', gender: 'F' } as Category }],
    ]);
    const c = shootingCareer([
      { eventId: 'q1', date: '2026-03-01', stats: { comps: 1, qPlace: 3, pts: 570, shots: 60, xs: 15, xShots: 60, m_sh_10map: 570, qualified: 1 } },
      { eventId: 'f1', date: '2026-03-01T12', stats: { finals: 1, place: 2, fpts: 236.4, silvers: 1, posPoints: 7 } },
      { eventId: 'q2', date: '2026-09-01', stats: { comps: 1, qPlace: 12, pts: 576, shots: 60, xs: 21, xShots: 60, m_sh_10map: 576 } },
    ], phases, '2026-01-01');
    assert.equal(c.comps, 2); assert.equal(c.finals, 1); assert.equal(c.silvers, 1); assert.equal(c.points, 7);
    assert.equal(c.innerRate, 30);
    assert.equal(c.bests.length, 1);
    assert.equal(c.bests[0].pb.value, 576); assert.equal(c.bests[0].pb.text, '576-21x');
    assert.equal(c.bests[0].avg10, 95.5); // 1146 / 120 shots × 10
    assert.deepEqual(c.history[0].flags, ['PB']);
    assert.equal(c.history[1].text, '2nd in the final · 236.4');
  });
  test('the meet: medals and house points from the final; school records from qualifications', () => {
    const fmt = (phase: 'qualification' | 'final', phaseNo: number): PhaseFormat => ({ discipline: 'shoot.10mar', category: cat, phase, phaseNo, heats: 1, eventKey: 'ev1', shootFinal: true, plan: [{ phase: 'qualification', heats: 1, progression: { fillTo: 8 } }, { phase: 'final', heats: 1 }] });
    const finRows = Array.from({ length: 8 }, (_, i) => finalist(i + 1, flat(10 + (i + 1) / 10, 24)));
    const phases: MeetPhase[] = [
      { id: 'q', format: fmt('qualification', 1), status: 'completed', date: '2026-10-11', entries: qualRows },
      { id: 'f', format: fmt('final', 2), status: 'completed', date: '2026-10-11', entries: finRows },
    ];
    const meet = groupMeet(phases);
    const res = meetFieldResults(meet, shootMeetSettings({}));
    assert.equal(res.length, 1);
    assert.equal(res[0].awards[0].entryId, 'e8');
    const table = medalStandings([], [], { mode: 'position' }, undefined, res);
    assert.ok(table.length > 0);
    const sr = deriveRecordBook(meet, 'SR');
    assert.deepEqual(sr.map((r) => [r.discipline, r.value]), [['shoot.10mar', 626.6]]);
    assert.deepEqual(eventMeetSettings('shooting', { pointsScheme: '5,3,1' }).positionPoints, [5, 3, 1]);
  });
  test('wiring: an event sport with its words, prefix, schema and setup checklist', () => {
    assert.ok(isEventSport('shooting'));
    assert.equal(eventPrefix('shooting'), 'shoot.');
    assert.equal(eventWords('shooting').athletes, 'shooters');
    assert.deepEqual(validateSchema(STAT_SCHEMAS.shooting), []);
    assert.match(setupChecklist({ sports: ['shooting'], formats: {}, participation: 'team' } as any, 0, 0)[1].hint, /10 m Air Rifle/);
  });
});
