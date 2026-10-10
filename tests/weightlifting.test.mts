/**
 * SD-97 — weightlifting on the results engine (IWF TCRR): bodyweight categories
 * (from 1 June 2025), weigh-in, declarations (+1 kg after a good lift, the same
 * after a no lift, never lighter, whole kg), the automatic next declaration,
 * referees' lights, the calling order (weight → attempt → progression →
 * earlier previous attempt → lot), the total with "lifted first" ties and
 * bomb-outs, separate snatch / C&J rankings and medals (a meet setting), the
 * medal table, records per lift, stat lines, careers, Sinclair, safety.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  disciplineOf, rankEntries, categoryKey, categoryLabel, updateRecords, withRecordFlags, groupMeet, meetFieldResults, deriveRecordBook, eventLeaders,
  weightClasses, classLimit, classBounds, classForBodyweight, weighInIssue, declareError, declare, recordLift, autoNext, majority, nextSeq,
  activeLift, liftingOrder, nextLift, callText, makeCount, liftSeries, bombedOutOf, sinclairCoefficient, sinclairTotal, SINCLAIR,
  wlMeetSettings, eventMeetSettings, liftAwards, liftLines, liftingCareer, recordDefsFor, recordLines, rankLift, LIFT_DISCIPLINE, IWF_TEAM_POINTS,
  rangeCheck, markRange, unconfirmedOutOfRange, finishDetail, newRecords, blankEntries, summarizeLifts, effectiveStatus,
  type EntryResult, type LiftAttempt, type ResultEntry, type MeetPhase, type PhaseFormat, type Category, type RecordMark,
} from '../src/data/results/index.ts';
import { medalStandings } from '../src/data/medalStandings.ts';
import { STAT_SCHEMAS } from '../src/sports/statSchemas.ts';
import { validateSchema } from '../src/sports/statSchema.ts';
import { isEventSport, eventPrefix, eventWords } from '../src/sports/eventSports.ts';
import { setupChecklist } from '../src/data/setupChecklist.ts';

const WL = disciplineOf('wl.total')!, SN = disciplineOf('wl.snatch')!, CJ = disciplineOf('wl.cj')!;
const M79: Category = { age: 'Senior', gender: 'M', weightClass: '79 kg' };
const HOUSES = ['Red', 'Blue', 'Green', 'Gold'];
const G = (kg: number, seq: number): LiftAttempt => ({ kg, good: true, seq });
const X = (kg: number, seq: number): LiftAttempt => ({ kg, good: false, seq });
const lifter = (i: number, result: EntryResult = {}): ResultEntry =>
  ({ id: `e${i}`, athleteId: `p${i}`, name: `Lifter ${i}`, heat: 1, result: { order: i, ...result }, team: { name: `${HOUSES[i % 4]} House` } });
const labels = (rows: { label: string; id: string }[]) => rows.map((r) => `${r.label}:${r.id}`);

/* ------------------------------ categories -------------------------------- */

describe('bodyweight categories (IWF from 1 June 2025)', () => {
  test('senior / junior and youth: 8 a gender, men 94 kg after the May 2025 revision', () => {
    assert.deepEqual(weightClasses('Senior', 'M'), ['60 kg', '65 kg', '71 kg', '79 kg', '88 kg', '94 kg', '110 kg', '+110 kg']);
    assert.deepEqual(weightClasses('Junior', 'F'), ['48 kg', '53 kg', '58 kg', '63 kg', '69 kg', '77 kg', '86 kg', '+86 kg']);
    assert.deepEqual(weightClasses('Youth', 'M'), ['56 kg', '60 kg', '65 kg', '71 kg', '79 kg', '88 kg', '94 kg', '+94 kg']);
    assert.deepEqual(weightClasses('Youth', 'F'), ['44 kg', '48 kg', '53 kg', '58 kg', '63 kg', '69 kg', '77 kg', '+77 kg']);
    assert.equal(weightClasses('School', 'M').length, 9);
  });
  test('limits and bounds: over the next lighter limit, at most its own', () => {
    const cls = weightClasses('Senior', 'M');
    assert.deepEqual(classLimit('79 kg'), { upTo: 79 });
    assert.deepEqual(classLimit('+110 kg'), { over: 110 });
    assert.deepEqual(classBounds(cls, '79 kg'), { above: 71, upTo: 79 });
    assert.deepEqual(classBounds(cls, '60 kg'), { above: 0, upTo: 60 });
    assert.deepEqual(classBounds(cls, '+110 kg'), { above: 110, upTo: null });
    assert.equal(classForBodyweight(cls, 79), '79 kg');
    assert.equal(classForBodyweight(cls, 79.01), '88 kg');
    assert.equal(classForBodyweight(cls, 130), '+110 kg');
  });
  test('weigh-in: inside is fine; over the limit or in a lighter category is flagged (confirm, not refuse)', () => {
    const cls = weightClasses('Senior', 'M');
    assert.equal(weighInIssue(cls, '79 kg', 78.4), null);
    assert.equal(weighInIssue(cls, '79 kg', 79), null);
    assert.match(weighInIssue(cls, '79 kg', 79.2)!, /over the 79 kg limit.*88 kg/);
    assert.match(weighInIssue(cls, '79 kg', 70.5)!, /lighter category \(71 kg\)/);
    assert.equal(weighInIssue(cls, '+110 kg', 150), null);
  });
  test('category label: senior / junior read Men / Women, youth Boys / Girls; the key carries the class', () => {
    assert.equal(categoryLabel(M79), 'Senior Men 79 kg');
    assert.equal(categoryLabel({ age: 'Youth', gender: 'F', weightClass: '53 kg' }), 'Youth Girls 53 kg');
    assert.equal(categoryLabel({ age: 'U14', gender: 'M' }), 'U14 Boys'); // athletics unchanged
    assert.equal(categoryKey(M79), 'Senior-M-79 kg');
  });
});

/* ------------------------------ declarations ------------------------------ */

describe('declarations and decisions', () => {
  test('whole kg; never lighter; +1 kg after a good lift; the same weight after a no lift', () => {
    assert.equal(declareError([], 0, 80), null);
    assert.match(declareError([], 0, 80.5)!, /whole kilograms/);
    assert.match(declareError([], 0, 0)!, /Type the weight/);
    assert.match(declareError([G(80, 1)], 1, 80)!, /at least 81 kg/);
    assert.equal(declareError([G(80, 1)], 1, 81), null);
    assert.equal(declareError([X(80, 1)], 1, 80), null); // repeat after a no lift
    assert.match(declareError([X(80, 1)], 1, 79)!, /can't be lighter than 80/);
    assert.equal(declareError([{ kg: 80, pass: true, good: false, seq: 1 }], 1, 80), null);
    assert.match(declareError([G(80, 1), G(81, 2), G(82, 3)], 3, 90)!, /three attempts/);
  });
  test('declare replaces the pending weight or adds the next one', () => {
    assert.deepEqual(declare([], 80), [{ kg: 80 }]);
    assert.deepEqual(declare([G(80, 1), { kg: 81, auto: true }], 84), [G(80, 1), { kg: 84 }]);
    assert.deepEqual(declare([G(80, 1)], 84, true), [G(80, 1), { kg: 84, rangeOk: true }]);
  });
  test('a decision stamps the attempt and declares the next automatically (+1 / same), not after the 3rd', () => {
    assert.deepEqual(recordLift([{ kg: 80 }], { good: true }, 5), [{ kg: 80, seq: 5, good: true }, { kg: 81, auto: true }]);
    assert.deepEqual(recordLift([{ kg: 80 }], { good: false }, 6), [{ kg: 80, seq: 6, good: false }, { kg: 80, auto: true }]);
    assert.deepEqual(recordLift([G(80, 1), G(81, 2), { kg: 83 }], { good: true }, 9).length, 3);
    assert.equal(autoNext(100, true), 101);
    // three lights: the majority decides, the lights are kept
    const l = recordLift([{ kg: 90 }], { lights: [true, false, true] }, 3);
    assert.equal(l[0].good, true);
    assert.deepEqual(l[0].lights, [true, false, true]);
    assert.equal(recordLift([{ kg: 90 }], { lights: [false, false, true] }, 3)[0].good, false);
    assert.equal(majority([true, true, true]), true);
    // declined: a no lift that isn't an attempt
    const p = recordLift([{ kg: 90 }], { pass: true }, 4);
    assert.deepEqual(p[0], { kg: 90, seq: 4, pass: true, good: false });
    assert.deepEqual(makeCount({ snatch: p }), { made: 0, attempted: 0 });
  });
  test('nextSeq counts every attempt in the session', () => {
    assert.equal(nextSeq([{ result: { lifts: { snatch: [G(80, 1), X(83, 4)] } } }, { result: { lifts: { cj: [G(100, 7)] } } }, { result: null }]), 8);
    assert.equal(nextSeq([]), 1);
  });
});

/* ------------------------------ calling order ----------------------------- */

describe('calling order (lightest bar first)', () => {
  test('weight, then attempt number, then progression, then earlier previous attempt, then lot', () => {
    const a = lifter(1, { lifts: { snatch: [{ kg: 85 }] } });
    const b = lifter(2, { lifts: { snatch: [G(80, 1), { kg: 85 }] } }); // 2nd attempt, +5
    const c = lifter(3, { lifts: { snatch: [G(83, 2), { kg: 85 }] } }); // 2nd attempt, +2
    const d = lifter(4, { lifts: { snatch: [{ kg: 82 }] } });
    const e = lifter(5, { lifts: { snatch: [{ kg: 85 }] } }); // same as a: lot 1 before lot 5
    const f = lifter(6, { lifts: { snatch: [X(83, 3), { kg: 85 }] } }); // 2nd attempt, +2, previous at #3 (after c's #2)
    const order = liftingOrder([a, b, c, d, e, f], 'snatch');
    assert.deepEqual(order.map((x) => x.entryId), ['e4', 'e1', 'e5', 'e2', 'e3', 'e6']);
    assert.equal(callText(order[0]), 'Lifter 4 · 82 kg · 1st attempt');
    assert.equal(callText(order[3], true), 'Lifter 2 · 85 kg · 2nd attempt (snatch)');
  });
  test('undeclared lifters come last; out / DNS lifters are skipped; snatch then C&J', () => {
    const a = lifter(1, { lifts: { snatch: [G(80, 1), G(82, 3), G(84, 5)], cj: [{ kg: 100 }] } });
    const b = lifter(2, { lifts: { snatch: [G(78, 2), X(81, 4)] } });
    const c = lifter(3, { status: 'DNS' });
    assert.equal(activeLift([a, b, c]), 'snatch');
    const o = liftingOrder([a, b, c], 'snatch');
    assert.deepEqual(o.map((x) => [x.entryId, x.kg, x.attempt]), [['e2', undefined, 3]]);
    b.result.lifts!.snatch!.push(X(81, 6));
    assert.equal(activeLift([a, b, c]), 'cj');
    assert.deepEqual(nextLift([a, b, c]), { entryId: 'e1', name: 'Lifter 1', team: 'Blue House', lift: 'cj', attempt: 1, kg: 100, lot: 1 });
    assert.deepEqual(liftingOrder([a, b, c], 'cj').map((x) => x.entryId), ['e1', 'e2']); // b undeclared → last
    a.result.lifts!.cj = [G(100, 7), G(105, 8), X(110, 9)];
    b.result.lifts!.cj = [G(95, 10), X(100, 11), { kg: 100, pass: true, good: false, seq: 12 }];
    assert.equal(activeLift([a, b, c]), null);
    assert.equal(nextLift([a, b, c]), null);
  });
});

/* -------------------------------- ranking --------------------------------- */

describe('ranking: total, lifted first, bomb out, single lifts', () => {
  // A and B both total 190: B reached it at attempt #9, A only at #14.
  const A = lifter(1, { bodyweight: 78.4, lifts: { snatch: [G(85, 1), X(88, 4), X(88, 6)], cj: [G(100, 10), G(105, 14)] } });
  const B = lifter(2, { bodyweight: 77.9, lifts: { snatch: [G(83, 2), G(86, 5), X(89, 7)], cj: [G(104, 9), X(108, 12), X(108, 15)] } });
  // C: no good snatch → no total, but a C&J of 110 (the best)
  const C = lifter(3, { bodyweight: 78.8, lifts: { snatch: [X(80, 3), X(80, 8), X(80, 11)], cj: [G(110, 13)] } });
  const D = lifter(4, { bodyweight: 76.0, lifts: { snatch: [G(70, 16)], cj: [G(90, 17)] } });
  const all = [A, B, C, D];
  test('equal totals → whoever lifted the total first (bodyweight no longer counts)', () => {
    const rows = rankEntries(all, WL);
    assert.deepEqual(labels(rows), ['1:e2', '2:e1', '3:e4', 'NM:e3']);
    assert.equal(rows[0].bestText, '190');
    assert.equal(summarizeLifts(B.result.lifts).totalSeq, 9);
    assert.equal(bombedOutOf(C.result), 'snatch');
    assert.equal(effectiveStatus(C.result, WL), 'NM');
  });
  test('the bombed-out lifter still ranks in the clean & jerk', () => {
    assert.equal(effectiveStatus(C.result, CJ), 'ok');
    assert.equal(effectiveStatus(C.result, SN), 'NM');
    assert.deepEqual(labels(rankEntries(all, CJ)), ['1:e3', '2:e1', '3:e2', '4:e4']);
    assert.deepEqual(labels(rankLift(all, 'snatch')), ['1:e2', '2:e1', '3:e4', 'NM:e3']);
  });
  test('equal single lifts → who lifted it first; same seq impossible, lot breaks a manual tie', () => {
    const p = lifter(5, { lifts: { snatch: [G(90, 20)] } });
    const q = lifter(6, { lifts: { snatch: [G(90, 18)] } });
    assert.deepEqual(labels(rankEntries([p, q], SN)), ['1:e6', '2:e5']);
    const r = lifter(7, { lifts: { snatch: [{ kg: 90, good: true }] } });
    const s = lifter(3, { lifts: { snatch: [{ kg: 90, good: true }] } });
    assert.deepEqual(labels(rankEntries([r, s], SN)), ['1:e3', '2:e7']);
  });
  test('series text and make count', () => {
    assert.equal(liftSeries(A.result.lifts!.snatch), '85 (88) (88)');
    assert.deepEqual(makeCount(A.result.lifts), { made: 3, attempted: 5 });
  });
  test('separate medals for snatch and C&J only when the meet awards them', () => {
    const plain = liftAwards(all, {});
    assert.deepEqual(plain.total.map((a) => [a.entryId, a.medal]), [['e2', 'gold'], ['e1', 'silver'], ['e4', 'bronze']]);
    assert.equal(plain.snatch.length, 0);
    const three = liftAwards(all, { liftMedals: true });
    assert.equal(three.cj[0].entryId, 'e3');
    assert.equal(three.snatch[0].entryId, 'e2');
  });
});

/* ------------------------- meet, medals, records -------------------------- */

describe('the meet: medal table, records, leaders', () => {
  const A = lifter(1, { lifts: { snatch: [G(85, 1)], cj: [G(105, 4)] } });
  const B = lifter(2, { lifts: { snatch: [G(86, 2)], cj: [G(104, 5)] } });
  const C = lifter(3, { lifts: { snatch: [G(70, 3)], cj: [G(110, 6)] } });
  const fmt: PhaseFormat = { discipline: 'wl.total', category: M79, phase: 'final', phaseNo: 1, heats: 1, eventKey: 'ev79', eventTitle: 'Senior Men 79 kg' };
  const phase: MeetPhase = { id: 'ph1', format: fmt, status: 'completed', date: '2026-10-11T09:00:00Z', entries: [A, B, C] };
  const events = groupMeet([phase]);
  test('the total feeds the house table; snatch and C&J too with liftMedals', () => {
    const total = meetFieldResults(events, { positionPoints: [8, 7, 6] });
    assert.equal(total.length, 1);
    assert.equal(total[0].sport, 'weightlifting');
    const all = meetFieldResults(events, { positionPoints: [8, 7, 6], liftMedals: true });
    assert.deepEqual(all.map((r) => r.event), ['Senior Men 79 kg', 'Senior Men 79 kg — Snatch', 'Senior Men 79 kg — Clean & jerk']);
    const table = medalStandings([], [], { mode: 'position' }, undefined, all);
    // A (Blue): total 1st (190) 8, snatch 2nd 7, C&J 2nd 7 = 22; B (Green): total 2nd 7 + snatch 1st 8 + C&J 3rd 6 = 21
    const blue = table.find((r) => r.name === 'Blue House')!, green = table.find((r) => r.name === 'Green House')!;
    assert.equal(blue.total, 22);
    assert.equal(green.total, 21);
    assert.equal(table.find((r) => r.name === 'Gold House')!.golds, 1); // C&J gold
  });
  test('records per lift and total: derived book and the update after a session', () => {
    const book = deriveRecordBook(events, 'SR');
    assert.deepEqual(book.map((r) => [r.discipline, r.value, r.holder]).sort(), [['wl.cj', 110, 'Lifter 3'], ['wl.snatch', 86, 'Lifter 2'], ['wl.total', 190, 'Lifter 1']]);
    let next: RecordMark[] = [{ scope: 'MR', discipline: 'wl.snatch', category: 'Senior-M-79 kg', value: 90, holder: 'Old' }];
    for (const d of recordDefsFor(WL)) next = updateRecords(rankEntries([A, B, C], d), d, categoryKey(M79), next, '2026-10-11', ['MR'], 'ev79');
    assert.deepEqual(next.map((r) => [r.discipline, r.value]).sort(), [['wl.cj', 110], ['wl.snatch', 90], ['wl.total', 190]]);
    const fresh = newRecords([], next);
    assert.match(recordLines(fresh), /meet record — clean & jerk: 110 kg by Lifter 3/);
    assert.match(finishDetail({ blank: [], def: WL, records: fresh, unconfirmed: 0 }), /New meet record \(total\): 190 kg by Lifter 1/);
    assert.deepEqual(recordDefsFor(disciplineOf('ath.100m')!).map((d) => d.key), ['ath.100m']);
  });
  test('PB flags per lift from the lifter history', () => {
    const rows = withRecordFlags(rankEntries([A], SN), SN, { history: [{ athleteId: 'p1', discipline: 'wl.snatch', value: 82, date: '2025-05-01' }], records: [], category: categoryKey(M79), seasonFrom: '2026-01-01' });
    assert.ok(rows[0].flags.includes('PB'));
  });
  test('best total per category', () => {
    const l = eventLeaders(events);
    assert.equal(l[0].text, '190');
    assert.equal(l[0].name, 'Lifter 1');
  });
});

/* ------------------------- stat lines, career, Sinclair ------------------- */

describe('stat lines, careers and Sinclair', () => {
  test('Sinclair: 1 at or over b; the 2021–2024 men\'s coefficient at 79 kg ≈ 1.2869', () => {
    assert.equal(SINCLAIR.period, '2021–2024');
    assert.equal(sinclairCoefficient(200, 'M'), 1);
    assert.ok(Math.abs(sinclairCoefficient(79, 'M') - 1.28688) < 1e-4);
    assert.equal(sinclairTotal(190, 79, 'M'), 244.51);
    assert.equal(sinclairTotal(190, undefined, 'M'), null);
    assert.equal(sinclairTotal(190, 79, 'X'), null);
  });
  test('lines: best lifts, make rate inputs, no total, medals, bodyweight, Sinclair', () => {
    const A = lifter(1, { bodyweight: 79, lifts: { snatch: [G(85, 1), X(88, 4), G(88, 6)], cj: [G(100, 10), X(105, 12), { kg: 105, pass: true, good: false, seq: 13 }] } });
    const C = lifter(3, { bodyweight: 78, lifts: { snatch: [X(80, 3), X(80, 8), X(80, 11)], cj: [G(110, 14)] } });
    const S = lifter(4, { status: 'DNS' });
    const lines = liftLines({ category: M79 }, [A, C, S], { positionPoints: [8, 7, 6], liftMedals: true });
    assert.equal(lines.length, 2);
    const a = lines.find((l) => l.playerId === 'p1')!.stats, c = lines.find((l) => l.playerId === 'p3')!.stats;
    assert.deepEqual([a.m_wl_snatch, a.m_wl_cj, a.m_wl_total, a.made, a.attempted, a.place, a.golds, a.bw], [88, 100, 188, 3, 5, 1, 1, 79]);
    assert.equal(a.sinclair, sinclairTotal(188, 79, 'M'));
    // A: total gold 8 + snatch gold 8 + C&J silver 7 = 23
    assert.equal(a.posPoints, 23);
    assert.equal(a.liftGolds, 1); assert.equal(a.liftSilvers, 1);
    assert.deepEqual([c.bombOut, c.m_wl_total, c.m_wl_cj, c.m_wl_snatch, c.liftGolds], [1, undefined, 110, undefined, 1]);
  });
  test('an out-of-range good lift nobody confirmed is left out of the lines and records', () => {
    const odd = lifter(1, { lifts: { snatch: [G(850, 1)], cj: [G(100, 2)] } });
    assert.equal(unconfirmedOutOfRange(odd.result, WL), true);
    assert.equal(liftLines({}, [odd])[0].stats.m_wl_snatch, undefined);
    const ok = lifter(1, { lifts: { snatch: [{ ...G(250, 1), rangeOk: true }], cj: [G(100, 2)] } });
    assert.equal(unconfirmedOutOfRange(ok.result, WL), false);
  });
  test('career: PB / SB per lift, make rate, no-total sessions, history newest first', () => {
    const lines = [
      { eventId: 'x1', date: '2025-06-01', stats: { comps: 1, place: 2, silvers: 1, m_wl_snatch: 80, m_wl_cj: 100, m_wl_total: 180, made: 4, attempted: 6, bw: 78 } },
      { eventId: 'x2', date: '2026-03-01', stats: { comps: 1, place: 1, golds: 1, m_wl_snatch: 84, m_wl_cj: 99, m_wl_total: 183, made: 5, attempted: 6, posPoints: 8, sinclair: 236.1 } },
      { eventId: 'x3', date: '2026-09-01', stats: { comps: 1, bombOut: 1, m_wl_cj: 104, made: 1, attempted: 6 } },
    ];
    const infos = new Map([['x2', { title: 'Senior Men 79 kg — Final', eventTitle: 'Senior Men 79 kg', date: '2026-03-01T10:00:00Z', category: M79 }]]);
    const c = liftingCareer(lines, infos, '2026-01-01');
    assert.deepEqual([c.comps, c.golds, c.silvers, c.made, c.attempted, c.makeRate, c.bombOuts, c.points], [3, 1, 1, 10, 18, 55.6, 1, 8]);
    assert.deepEqual(c.bests.map((b) => [b.key, b.pb.value, b.sb?.value]), [['snatch', 84, 84], ['cj', 104, 104], ['total', 183, 183], ['sinclair', 236.1, 236.1]]);
    assert.equal(c.history[0].eventId, 'x3');
    assert.ok(c.history[0].flags.includes('no total'));
    assert.ok(c.history[0].flags.includes('PB C&J'));
    assert.equal(c.history[1].title, 'Senior Men 79 kg');
    assert.match(c.history[2].text, /2nd · 80 \/ 100 = 180 · bw 78/);
  });
});

/* -------------------------------- safety ---------------------------------- */

describe('safety and settings', () => {
  test('plausible range in kg — a light / heavy weight asks, the message speaks kg', () => {
    assert.deepEqual(markRange('wl.total'), { min: 10, max: 500 });
    assert.equal(rangeCheck(SN, 120), null);
    assert.match(rangeCheck(SN, 850)!.message, /850 kg looks too heavy for the snatch — the usual range is 5 kg – 230 kg/);
    assert.match(rangeCheck(CJ, 2)!.message, /too light/);
  });
  test('blank lifters: no attempt at all', () => {
    assert.deepEqual(blankEntries([lifter(1, { lifts: { snatch: [{ kg: 80 }] } }), lifter(2, {})], WL).map((e) => e.id), ['e2']);
  });
  test('meet settings: total-only medals by default; IWF team points available', () => {
    assert.deepEqual(wlMeetSettings(undefined).liftMedals, false);
    const s = wlMeetSettings({ liftMedals: true, sinclair: true, pointsScheme: IWF_TEAM_POINTS });
    assert.equal(s.positionPoints.length, 25);
    assert.deepEqual(s.positionPoints.slice(0, 4), [28, 25, 23, 22]);
    assert.equal(eventMeetSettings('weightlifting', { liftMedals: true }).liftMedals, true);
    assert.equal(eventMeetSettings('athletics', {}).liftMedals, undefined);
  });
  test('weightlifting is an event sport with its own words and prefix; one schema; the meet checklist', () => {
    assert.ok(isEventSport('weightlifting'));
    assert.equal(eventPrefix('weightlifting'), 'wl.');
    assert.equal(eventWords('weightlifting').athletes, 'lifters');
    assert.deepEqual(validateSchema(STAT_SCHEMAS.weightlifting), []);
    assert.equal(STAT_SCHEMAS.weightlifting.careerView, 'measured');
    const steps = setupChecklist({ sports: ['weightlifting'], formats: {}, participation: 'team' } as never, 0, 0, 0);
    assert.deepEqual(steps.map((s) => s.key), ['teams', 'events']);
    assert.match(steps[1].hint, /bodyweight category/);
    assert.equal(LIFT_DISCIPLINE.total, 'wl.total');
  });
});
