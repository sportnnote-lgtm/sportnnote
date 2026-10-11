/**
 * SD-98 cycling (UCI) on the results engine: the road / track catalogue,
 * road-race same-time groups (1 s rule), finish-order ranking with DNF / OTL /
 * DQ / DNS, the individual time trial (start intervals, thousandths), the
 * pursuit (qualifying → finals for gold / bronze, a catch), sprint match play
 * (flying 200 m seeds → best-of-three bracket, walkovers, corrections), keirin
 * heats, scratch (laps first), points race (5-3-2-1, double finish, ±20 a lap,
 * final-sprint tie-break), elimination, a stage race's GC (bonuses, ITT
 * fractions, sum of places), classifications, ranges, records, stat lines,
 * the career, the medal table and the sport wiring.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  disciplineOf, rankEntries, rankByHeat, CYC_EVENTS, cycEventOf, cycKind, roadTimes, pointsTotal, sprintPoints, sprintMatch, sprintBracket,
  setSprintHeat, sprintEntrant, bracketSeeds, staleMatchData, clearMatches, setWalkover, stageTimes, gcAfter, rankStage, stageClassifications, stageFinishers,
  cycPlan, describeCycPlan, sprintFields, defaultSprintField, ittStart, startText, placeOnLine, nextFin, nextOutPlace, setSprintPlace, sprintCount,
  pointsLine, cycLines, cyclingCareer, cycMarkKey, cycKeyDiscipline, cycStatuses, cycRowText, markRange, rangeCheck, eventAwards, updateRecords,
  categoryKey, phaseNameOf, groupMeet, meetFieldResults, eventLeaders, eventMeetSettings, blankEntries, hasAnyResult, advanceCrews, archQualView,
  withRecordFlags, roadTimeMissing, gapText, secsText, STATUS_ORDER, parseMark, formatMark,
  type DisciplineDef, type EntryResult, type ResultEntry, type MeetPhase, type PhaseFormat,
} from '../src/data/results/index.ts';
import { medalStandings } from '../src/data/medalStandings.ts';
import { STAT_SCHEMAS } from '../src/sports/statSchemas.ts';
import { validateSchema } from '../src/sports/statSchema.ts';
import { isEventSport, eventPrefix, eventWords } from '../src/sports/eventSports.ts';
import { setupChecklist } from '../src/data/setupChecklist.ts';
import { EVENT_CONTROLS } from '../src/core/matchSafety.ts';

const D = (k: string): DisciplineDef => { const d = disciplineOf(k); assert.ok(d, k); return d!; };
const RR = D('cyc.rr'), ITT = D('cyc.itt.10'), IP = D('cyc.ip.3000'), SPR = D('cyc.sprint'), PTS = D('cyc.points'), SCR = D('cyc.scratch');
const KEI = D('cyc.keirin'), ELIM = D('cyc.elim'), STG = D('cyc.stage');
const HOUSES = ['Red', 'Blue', 'Green', 'Gold'];
const rider = (i: number, result: EntryResult = {}, heat = 1): ResultEntry =>
  ({ id: `e${i}`, athleteId: `p${i}`, name: `Rider ${i}`, heat, team: { name: `${HOUSES[i % 4]} House` }, result: { order: i, ...result } });
const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

/* -------------------------------- catalogue -------------------------------- */

describe('catalogue', () => {
  test('road ITT per distance to 1/100, track timed events to 1/1000, order events ranked by the line', () => {
    for (const km of [5, 10, 15, 20, 25, 30, 40]) {
      const d = D(`cyc.itt.${km}`);
      assert.equal(d.sport, 'cycling'); assert.equal(d.unit, 'time'); assert.equal(d.dp, 2); assert.equal(d.capture, 'single'); assert.equal(d.tie, 'photo');
    }
    for (const k of ['cyc.ip.2000', 'cyc.ip.3000', 'cyc.ip.4000', 'cyc.tt.500', 'cyc.tt.1000', 'cyc.sprint']) assert.equal(D(k).dp, 3, k);
    for (const k of ['cyc.rr', 'cyc.stage', 'cyc.keirin', 'cyc.scratch', 'cyc.points', 'cyc.elim']) { assert.equal(D(k).capture, 'order', k); assert.equal(D(k).tie, 'cycling'); }
    assert.equal(PTS.better, 'higher');
    assert.equal(CYC_EVENTS.length, 7 + 2 + 3 + 2 + 5);
    assert.equal(cycEventOf('cyc.tt.1000')?.short, 'Kilo (1000 m)');
    assert.equal(cycKind('cyc.ip.4000'), 'ip');
    assert.equal(STATUS_ORDER.OTL > STATUS_ORDER.DNF && STATUS_ORDER.OTL < STATUS_ORDER.DQ, true);
  });
  test('statuses: road adds OTL (outside the time limit); track does not', () => {
    assert.deepEqual(cycStatuses(RR), ['DNS', 'DNF', 'OTL', 'DQ']);
    assert.deepEqual(cycStatuses(ITT), ['DNS', 'DNF', 'OTL', 'DQ']);
    assert.deepEqual(cycStatuses(PTS), ['DNS', 'DNF', 'DQ']);
  });
  test('ranges: ITT 60–200 s per km, flying 200 m 9–20 s, kilo, 500 m, pursuit; order events none', () => {
    assert.deepEqual(markRange('cyc.itt.10'), { min: 600, max: 2000 });
    assert.deepEqual(markRange('cyc.sprint'), { min: 9, max: 20 });
    assert.deepEqual(markRange('cyc.tt.1000'), { min: 55, max: 120 });
    assert.deepEqual(markRange('cyc.tt.500'), { min: 32, max: 75 });
    assert.deepEqual(markRange('cyc.ip.4000'), { min: 238, max: 480 });
    assert.equal(markRange('cyc.rr'), null);
    assert.match(rangeCheck(D('cyc.sprint'), 8.2)!.message, /too fast/);
    assert.equal(rangeCheck(ITT, 14 * 60), null);
  });
  test('track times parse to the thousandth; road race times in whole seconds', () => {
    assert.deepEqual(parseMark('9.088', SPR), { mark: 9.088 });
    assert.equal(formatMark(225.432, IP), '3:45.432');
    assert.deepEqual(parseMark('2:41:07', RR), { mark: 9667 });
  });
});

/* ------------------------------- road race --------------------------------- */

describe('road race — order on the line, same-time groups (UCI 1 s rule)', () => {
  const rows = [
    rider(1, { fin: 1, mark: 9667 }), // winner 2:41:07
    rider(2, { fin: 2 }), // s.t.
    rider(3, { fin: 3, mark: 9667.6 }), // typed but < 1 s after → s.t.
    rider(4, { fin: 4, mark: 9679 }), // a gap → +0:12
    rider(5, { fin: 5 }), // s.t. with rider 4 → +0:12
    rider(6, { fin: 6, mark: 9680 }), // 1 s after rider 4's group → new group +0:13
    rider(7, { status: 'OTL' }), rider(8, { status: 'DNF' }), rider(9, { status: 'DNS' }), rider(10, { status: 'DQ', ruleRef: '12.1' }), rider(11),
  ];
  test('credited times', () => {
    const t = roadTimes(rows);
    assert.deepEqual([1, 2, 3, 4, 5, 6].map((i) => t.get(`e${i}`)!.time), [9667, 9667, 9667, 9679, 9679, 9680]);
    assert.deepEqual([1, 2, 3, 4, 5, 6].map((i) => t.get(`e${i}`)!.st), [false, true, true, false, true, false]);
    assert.equal(t.get('e6')!.gap, 13);
    assert.equal(roadTimeMissing(rows), false);
    assert.equal(roadTimeMissing([rider(1, { fin: 1 }), rider(2, { fin: 2, mark: 100 })]), true);
  });
  test('ranking: by the line; gaps; then unplaced, DNF, OTL, DQ, DNS', () => {
    const r = rankEntries(rows, RR);
    assert.deepEqual(r.map((x) => x.label), ['1', '2', '3', '4', '5', '6', '', 'DNF', 'OTL', 'DQ', 'DNS']);
    assert.deepEqual(r.slice(0, 6).map((x) => x.bestText), ['2:41:07', 's.t.', 's.t.', '+0:12', '+0:12', '+0:13']);
    assert.equal(r[0].bestLegal, null); // a road race is no record
    assert.equal(gapText(65), '+1:05');
    assert.equal(secsText(42), '0:42');
  });
  test('placing on the line: insert / take off renumbers the rest', () => {
    const line = [rider(1, { fin: 1 }), rider(2, { fin: 2 }), rider(3, { fin: 3 }), rider(4)];
    assert.equal(nextFin(line), 4);
    const off = placeOnLine(line, 'e2', null);
    assert.deepEqual(off.map((c) => [c.id, c.result.fin]), [['e2', undefined], ['e3', 2]]);
    const up = placeOnLine(line, 'e3', 2);
    assert.deepEqual(up.map((c) => [c.id, c.result.fin]).sort(), [['e2', 3], ['e3', 2]]);
  });
  test('blank riders and "anything entered" understand the finish order', () => {
    assert.deepEqual(ids(blankEntries(rows, RR)), ['e11']);
    assert.equal(hasAnyResult([{ fin: 1 }]), true);
    assert.equal(hasAnyResult([{ spr: { 1: 2 } }]), true);
    assert.deepEqual(blankEntries([rider(1)], PTS), []); // a points-race rider can score 0
  });
});

/* ---------------------------- individual time trial ---------------------------- */

describe('individual time trial', () => {
  test('start intervals and ranking on time; thousandths split a tie, else it stands', () => {
    assert.equal(ittStart(1, 60), 0);
    assert.equal(ittStart(4, 60), 180);
    assert.equal(startText(150), '+2:30');
    const rows = [rider(1, { mark: 812.34 }), rider(2, { mark: 798.11, thousandths: 798.106 }), rider(3, { mark: 798.11, thousandths: 798.109 }), rider(4, { mark: 830.5 }), rider(5, { mark: 830.5 })];
    const r = rankEntries(rows, ITT);
    assert.deepEqual(r.map((x) => [x.id, x.label]), [['e2', '1'], ['e3', '2'], ['e1', '3'], ['e4', '=4'], ['e5', '=4']]);
    assert.equal(r[0].bestText, '13:18.11');
    assert.equal(r[0].bestLegal, 798.11);
  });
  test('records and PB flags per distance', () => {
    const r = rankEntries([rider(1, { mark: 790 }), rider(2, { mark: 801 })], ITT);
    const book = updateRecords(r, ITT, categoryKey({ age: 'U16', gender: 'M' }), [], '2026-10-11', ['MR'], 'ev1');
    assert.equal(book.length, 1); assert.equal(book[0].value, 790); assert.equal(book[0].discipline, 'cyc.itt.10');
    const flagged = withRecordFlags(r, ITT, { history: [{ athleteId: 'p2', discipline: 'cyc.itt.10', value: 805, date: '2026-03-01' }], records: [], category: 'x', seasonFrom: '2026-01-01' });
    assert.deepEqual(flagged[1].flags, ['PB']);
  });
});

/* ------------------------------ individual pursuit ------------------------------ */

describe('individual pursuit — qualifying → finals for gold / bronze', () => {
  test('plans: 4+ riders → qualifying, Finals A (gold) / B (bronze); fewer → one race', () => {
    const p = cycPlan('ip', 6);
    assert.equal(p.length, 2);
    assert.deepEqual(p[0].progression?.routes, [{ from: 1, to: 2, phase: 2, race: 1 }, { from: 3, to: 4, phase: 2, race: 2 }]);
    assert.deepEqual(p[1].races, ['A', 'B']);
    assert.equal(cycPlan('ip', 3).length, 1);
    assert.match(describeCycPlan('ip', p), /two fastest ride for gold/);
  });
  test('the qualifiers are routed 1–2 → gold final, 3–4 → bronze final; 5th on is out', () => {
    const q = [rider(1, { mark: 210.5 }), rider(2, { mark: 205.1 }), rider(3, { mark: 212 }), rider(4, { mark: 208.9 }), rider(5, { mark: 220 })];
    const f: Pick<PhaseFormat, 'phaseNo' | 'progression' | 'carry' | 'phase'> = { phaseNo: 1, phase: 'qualification', progression: cycPlan('ip', 5)[0].progression };
    const { seeded } = advanceCrews(rankByHeat(q, IP), f, { heats: 2, races: ['A', 'B'] }, 2);
    assert.deepEqual(seeded.map((s) => [s.ref, s.race]), [['e2', 'A'], ['e4', 'A'], ['e1', 'B'], ['e3', 'B']]);
  });
  test('the finals: places run on (bronze final winner 3rd); a caught rider loses whatever the clock', () => {
    const fin = [
      rider(2, { race: 'A', mark: 204.2 }), rider(4, { race: 'A', caught: true }),
      rider(1, { race: 'B', mark: 215 }), rider(3, { race: 'B', mark: 209.4, caught: true }),
    ];
    const r = rankEntries(fin, IP);
    assert.deepEqual(r.map((x) => [x.id, x.position]), [['e2', 1], ['e4', 2], ['e1', 3], ['e3', 4]]);
    assert.equal(r[1].bestText, 'caught');
    assert.equal(r[3].bestText, 'caught (3:29.400)');
    assert.equal(r[3].bestLegal, null); // a caught rider's time is no record
    assert.deepEqual(eventAwards(r).map((a) => a.medal), ['gold', 'silver', 'bronze', undefined]);
  });
  test('phase names', () => {
    const plan = cycPlan('ip', 6);
    assert.equal(phaseNameOf({ discipline: 'cyc.ip.3000', phase: 'qualification', plan }), 'Qualifying');
    assert.equal(phaseNameOf({ discipline: 'cyc.ip.3000', phase: 'final', plan, races: ['A', 'B'] }), 'Finals (gold / bronze)');
  });
});

/* -------------------------------- sprint -------------------------------- */

describe('sprint — flying 200 m → best-of-three match play', () => {
  test('fields and plans', () => {
    assert.deepEqual(sprintFields(6), [2, 4, 6]);
    assert.equal(defaultSprintField(10), 8);
    assert.equal(defaultSprintField(3), 2);
    const p = cycPlan('sprint', 10, { field: 8 });
    assert.deepEqual(p, [{ phase: 'qualification', heats: 1, progression: { fillTo: 8 } }, { phase: 'final', heats: 1 }]);
    assert.equal(phaseNameOf({ discipline: 'cyc.sprint', phase: 'qualification', plan: p }), 'Qualifying (flying 200 m)');
    assert.equal(phaseNameOf({ discipline: 'cyc.sprint', phase: 'final', plan: p }), 'Match play');
  });
  test('a match: first to two heats; one-heat matches; walkovers', () => {
    const m3 = sprintMatch(3);
    assert.deepEqual([m3({ heats: [1, 0] }, { heats: [0, 1] }, true, true).nextEnd, m3({ heats: [1, 0] }, { heats: [0, 1] }, true, true).done], [3, false]);
    const w = m3({ heats: [1, 0, 1] }, { heats: [0, 1, 0] }, true, true);
    assert.equal(w.winner, 'a'); assert.equal(`${w.a}–${w.b}`, '2–1');
    assert.equal(m3({ heats: [0, 0] }, { heats: [1, 1] }, true, true).winner, 'b');
    assert.equal(sprintMatch(1)({ heats: [1] }, { heats: [0] }, true, true).winner, 'a');
    assert.equal(m3({ wo: true }, {}, true, true).winner, 'b');
  });
  // 4 qualifiers: times → seeds 1–4; semis 1 v 4, 2 v 3; bronze = SF losers
  const quals = [rider(1, { mark: 10.512 }), rider(2, { mark: 10.401 }), rider(3, { mark: 10.733 }), rider(4, { mark: 10.65 }), rider(5, { mark: 11.2 })];
  const seeds = bracketSeeds(rankEntries(quals, SPR), 4);
  test('seeding from the 200 m times (the slowest misses the cut)', () => {
    assert.deepEqual(seeds.ids, ['e2', 'e1', 'e4', 'e3']);
    assert.deepEqual(sprintEntrant({ mark: 10.401 }, 1, 3), { seed: 1, order: 1, mp: {}, qual: { mark: 10.401 }, bo: 3 });
  });
  const bracket = (): ResultEntry[] => seeds.ids.map((id, i) => ({ ...quals.find((q) => q.id === id)!, result: sprintEntrant(quals.find((q) => q.id === id)!.result, i + 1) }));
  const play = (rows: ResultEntry[], key: string, a: string, b: string, winners: ('a' | 'b')[]) => {
    let ra = rows.find((e) => e.id === a)!.result, rb = rows.find((e) => e.id === b)!.result;
    winners.forEach((w, k) => { [ra, rb] = setSprintHeat(ra, rb, key, k, w); });
    return rows.map((e) => (e.id === a ? { ...e, result: ra } : e.id === b ? { ...e, result: rb } : e));
  };
  test('the bracket to the end: gold / silver from the final, bronze / 4th from the bronze match', () => {
    let rows = bracket();
    rows = play(rows, '1', 'e2', 'e3', ['a', 'a']); // seed 1 beats seed 4 2–0
    rows = play(rows, '1', 'e1', 'e4', ['b', 'a', 'b']); // seed 3 beats seed 2 2–1
    let st = sprintBracket(rows)!;
    assert.equal(st.size, 4);
    assert.deepEqual(st.matches.filter((m) => m.key === '1').map((m) => m.winner), ['e2', 'e4']);
    rows = play(rows, '2', 'e2', 'e4', ['b', 'b']); // final
    rows = play(rows, 'B', 'e3', 'e1', ['b', 'b']); // bronze
    st = sprintBracket(rows)!;
    assert.equal(st.done, true);
    const r = rankEntries(rows, SPR);
    assert.deepEqual(r.map((x) => [x.id, x.position]), [['e4', 1], ['e2', 2], ['e1', 3], ['e3', 4]]);
    assert.equal(r[0].bestText, 'W 2–0');
    // records read the 200 m times
    const rec = rankEntries(archQualView(rows), SPR);
    assert.equal(rec[0].bestLegal, 10.401);
    // lines: matches won / lost
    const lines = cycLines({ discipline: 'cyc.sprint', phase: 'final' }, r, eventAwards(r));
    const e4 = lines.find((l) => l.playerId === 'p4')!;
    assert.deepEqual([e4.stats.sprintW, e4.stats.sprintL, e4.stats.golds, e4.stats.raceWins], [2, 0, 1, 1]);
  });
  test('a correction that changes a semi-final winner clears the final heats that no longer fit', () => {
    let rows = bracket();
    rows = play(rows, '1', 'e2', 'e3', ['a', 'a']);
    rows = play(rows, '1', 'e1', 'e4', ['b', 'b']);
    rows = play(rows, '2', 'e2', 'e4', ['a']);
    const after = play(rows, '1', 'e2', 'e3', ['b', 'b']); // seed 4 now wins the semi
    const stale = staleMatchData(after, 'sets', rows, sprintMatch(3));
    assert.deepEqual(stale.map((s) => [s.id, s.keys]), [['e2', ['2']], ['e4', ['2']]]);
    assert.deepEqual(clearMatches(after.find((e) => e.id === 'e2')!.result, ['2']).mp?.['2'], undefined);
    const wo = setWalkover(bracket()[0].result, '1', true);
    assert.equal(wo.mp?.['1']?.wo, true);
  });
});

/* -------------------------------- keirin / scratch / elimination -------------------------------- */

describe('keirin, scratch, elimination', () => {
  test('keirin: heats of 6 → a final of 6 (first of each heat); small fields race a final', () => {
    assert.deepEqual(cycPlan('keirin', 7), [{ phase: 'final', heats: 1 }]);
    assert.deepEqual(cycPlan('keirin', 12), [{ phase: 'heat', heats: 2, progression: { byPlace: 3 } }, { phase: 'final', heats: 1 }]);
    const r = rankEntries([rider(1, { fin: 2 }), rider(2, { fin: 1 }), rider(3, { status: 'DQ' }), rider(4, { fin: 3 })], KEI);
    assert.deepEqual(r.map((x) => [x.id, x.label]), [['e2', '1'], ['e1', '2'], ['e4', '3'], ['e3', 'DQ']]);
  });
  test('scratch: a rider who gained a lap ranks ahead of the bunch sprint', () => {
    const r = rankEntries([rider(1, { fin: 1 }), rider(2, { fin: 2 }), rider(3, { fin: 4, laps: 1 }), rider(4, { fin: 3, laps: -1 })], SCR);
    assert.deepEqual(ids(r), ['e3', 'e1', 'e2', 'e4']);
    assert.equal(r[0].bestText, '+1 lap');
    assert.equal(cycRowText(r[0], SCR), 'gained 1 lap');
  });
  test('elimination: places fill from the back as riders go out', () => {
    let rows = [1, 2, 3, 4, 5].map((i) => rider(i));
    assert.equal(nextOutPlace(rows), 5);
    rows = rows.map((e) => (e.id === 'e3' ? { ...e, result: { ...e.result, fin: 5 } } : e));
    assert.equal(nextOutPlace(rows), 4);
    rows = rows.map((e) => (e.id === 'e1' ? { ...e, result: { ...e.result, fin: 4 } } : e));
    const r = rankEntries(rows, ELIM);
    assert.deepEqual(r.slice(0, 2).map((x) => [x.id, x.position]), [['e1', 4], ['e3', 5]]);
    assert.equal(r[2].position, null); // still in
  });
});

/* -------------------------------- points race -------------------------------- */

describe('points race — 5-3-2-1, double at the finish, ±20 a lap', () => {
  test('sprint points and counts', () => {
    assert.deepEqual([1, 2, 3, 4, 5].map((p) => sprintPoints(p, 1, 4)), [5, 3, 2, 1, 0]);
    assert.deepEqual([1, 2, 3, 4].map((p) => sprintPoints(p, 4, 4)), [10, 6, 4, 2]);
    assert.equal(sprintCount(40, 10), 4);
    assert.equal(sprintCount(20, 5), 4);
  });
  test('totals and the final-sprint tie-break', () => {
    const rows = [
      rider(1, { spr: { 1: 1, 2: 1 }, fin: 3 }), // 5+5 + 4 = 14
      rider(2, { spr: { 1: 2 }, laps: 1, fin: 5 }), // 3 + 20 = 23
      rider(3, { spr: { 2: 2, 3: 1 }, fin: 2 }), // 3+5 + 6 = 14 → ahead of rider 1 on the final sprint
      rider(4, { fin: 1, laps: -1 }), // 10 − 20 = −10
      rider(5), // 0
      rider(6, { status: 'DNF', spr: { 1: 3 } }),
    ];
    assert.deepEqual(pointsTotal(rows[1].result), { total: 23, sprints: 3, finish: 0, laps: 20 });
    const r = rankEntries(rows, PTS);
    assert.deepEqual(r.map((x) => [x.id, x.label, x.best]), [['e2', '1', 23], ['e3', '2', 14], ['e1', '3', 14], ['e5', '4', 0], ['e4', '5', -10], ['e6', 'DNF', 2]]);
    assert.equal(pointsLine(rows[1].result), 'S1 3 · +1 lap (+20) = 23');
    assert.equal(pointsLine(rows[0].result), 'S1 5 · S2 5 · Finish 4 = 14');
    // nothing entered yet: nobody is placed
    assert.equal(rankEntries([rider(1), rider(2)], PTS)[0].position, null);
    const lines = cycLines({ discipline: 'cyc.points', phase: 'final' }, r, eventAwards(r));
    assert.deepEqual([lines[0].stats.prPts, lines[0].stats.lapsGained, lines[0].stats.golds], [23, 1, 1]);
  });
  test('a sprint place moves from the rider who had it', () => {
    const rows = [rider(1, { spr: { 2: 1 } }), rider(2)];
    const ch = setSprintPlace(rows, 'e2', 2, 1);
    assert.deepEqual(ch.map((c) => [c.id, c.result.spr]), [['e1', {}], ['e2', { 2: 1 }]]);
  });
});

/* -------------------------------- stage race -------------------------------- */

describe('stage race — GC by cumulative time (UCI 2.6.015 ties)', () => {
  test('plan: stages, the last one the final', () => {
    const p = cycPlan('stage', 30, { stages: ['road', 'itt', 'road'] });
    assert.deepEqual(p.map((x) => [x.phase, !!x.progression?.stage]), [['stage', true], ['stage', true], ['final', false]]);
    assert.equal(phaseNameOf({ discipline: 'cyc.stage', phase: 'stage', phaseNo: 2, plan: p }), 'Stage 2');
    assert.match(describeCycPlan('stage', p, ['road', 'itt', 'road']), /Stage 2 \(time trial\)/);
  });
  // stage 1 (road): A wins, B s.t., C +10 s, D OTL; bonuses A 10 s, B 6 s
  const s1 = [
    rider(1, { fin: 1, mark: 3600, bonus: 10, pts: 25 }), rider(2, { fin: 2, bonus: 6, pts: 20, kom: 5 }), rider(3, { fin: 3, mark: 3610, pts: 16 }), rider(4, { status: 'OTL' }),
  ];
  test('stage 1: stage result, GC with bonuses, OTL out', () => {
    const st = rankStage(s1);
    assert.deepEqual(st.map((x) => [x.id, x.label, x.bestText]), [['e1', '1', '1:00:00'], ['e2', '2', 's.t.'], ['e3', '3', '+0:10'], ['e4', 'OTL', '']]);
    const gc = rankEntries(s1, STG);
    assert.deepEqual(gc.map((x) => [x.id, x.label, x.bestText]), [['e1', '1', '59:50'], ['e2', '2', '+0:04'], ['e3', '3', '+0:20'], ['e4', 'OTL', '']]);
    const on = stageFinishers(s1);
    assert.deepEqual(on.map((x) => x.id), ['e1', 'e2', 'e3']);
    assert.deepEqual(on[0].gc, { time: 3590, frac: 0, places: 1, pts: 25, kom: 0, stages: 1, wins: 1 });
  });
  test('stage 2 (time trial): whole seconds count, the hundredths break a GC tie, then the sum of places', () => {
    const carried = stageFinishers(s1);
    const gcOf = (id: string) => carried.find((x) => x.id === id)!.gc;
    // B rides 0.70 s… faster than A but the whole seconds tie the GC: A 3590+600=4190.xx, B 3594+596=4190.xx
    const s2 = [rider(1, { mark: 600.30, gc: gcOf('e1') }), rider(2, { mark: 596.65, gc: gcOf('e2') }), rider(3, { mark: 590.10, gc: gcOf('e3') })];
    const t = stageTimes(s2);
    assert.deepEqual([t.get('e1')!.secs, t.get('e1')!.frac, t.get('e1')!.place], [600, 0.3, 3]);
    const g1 = gcAfter(s2[0], t.get('e1'))!, g2 = gcAfter(s2[1], t.get('e2'))!;
    assert.deepEqual([g1.time, g2.time], [4190, 4190]);
    const gc = rankEntries(s2, STG);
    // equal GC time: A's dropped hundredths 0.30 < B's 0.65 → A leads
    assert.deepEqual(gc.map((x) => [x.id, x.label]), [['e1', '1'], ['e2', '2'], ['e3', '3']]);
    assert.equal(gc[1].bestText, 's.t.');
    const st = rankStage(s2);
    assert.deepEqual(st.map((x) => [x.id, x.bestText]), [['e3', '9:50.10'], ['e2', '+6.55'], ['e1', '+10.20']]);
    const cls = stageClassifications(s2);
    assert.deepEqual(cls.points.map((c) => [c.id, c.value]), [['e1', 25], ['e2', 20], ['e3', 16]]);
    assert.deepEqual(cls.kom.map((c) => [c.id, c.value]), [['e2', 5]]);
  });
  test('lines: stages, stage wins; the last stage (final) gives the GC place, medals and the overall win', () => {
    const r1 = rankEntries(s1, STG);
    const l1 = cycLines({ discipline: 'cyc.stage', phase: 'stage' }, r1);
    assert.deepEqual(l1.find((l) => l.playerId === 'p1')!.stats, { races: 1, stages: 1, stageWins: 1, stagePlace: 1 });
    assert.equal(l1.find((l) => l.playerId === 'p4')!.stats.otl, 1);
    const lf = cycLines({ discipline: 'cyc.stage', phase: 'final' }, r1, eventAwards(r1));
    assert.deepEqual([lf[0].stats.place, lf[0].stats.golds, lf[0].stats.raceWins, lf[0].won], [1, 1, 1, true]);
    assert.match(cycRowText(r1[1], STG), /Stage 2nd · bonus −6″ · 20 pts · 5 KOM/);
  });
});

/* --------------------------- meet: medals, leaders, career --------------------------- */

describe('meet, career and wiring', () => {
  const phase = (id: string, discipline: string, entries: ResultEntry[], extra: Partial<PhaseFormat> = {}): MeetPhase => ({
    id, status: 'completed', date: '2026-10-11', entries,
    format: { discipline, phase: 'final', phaseNo: 1, heats: 1, eventKey: id, eventTitle: disciplineOf(discipline)!.label, category: { age: 'U16', gender: 'M' }, ...extra },
  });
  const meet = groupMeet([
    phase('itt', 'cyc.itt.10', [rider(1, { mark: 790 }), rider(2, { mark: 801 }), rider(3, { mark: 815 })]),
    phase('rr', 'cyc.rr', [rider(2, { fin: 1, mark: 5400 }), rider(1, { fin: 2 }), rider(3, { fin: 3 })]),
  ]);
  test('house / medal table from finished finals; leaders', () => {
    const pts = eventMeetSettings('cycling', {});
    assert.deepEqual(pts.positionPoints, [8, 7, 6, 5, 4, 3, 2, 1]);
    const fr = meetFieldResults(meet, pts);
    assert.equal(fr.length, 2);
    assert.deepEqual(fr[1].awards.map((a) => [a.name, a.medal]), [['Rider 2', 'gold'], ['Rider 1', 'silver'], ['Rider 3', 'bronze']]);
    const table = medalStandings([], [], { mode: 'position' }, undefined, fr);
    assert.ok(table.length > 0);
    const lead = eventLeaders(meet);
    assert.equal(lead.find((l) => l.discipline === 'cyc.itt.10')!.text, '13:10.00');
  });
  test('ITT / pursuit / 200 m times go under m_cyc_* and build the career PBs', () => {
    assert.equal(cycMarkKey('cyc.itt.10'), 'm_cyc_itt_10');
    assert.equal(cycKeyDiscipline('m_cyc_ip_3000'), 'cyc.ip.3000');
    assert.equal(cycKeyDiscipline('m_cyc_sprint'), 'cyc.sprint');
    assert.equal(cycKeyDiscipline('m_cyc_rr'), null);
    const r = rankEntries([rider(1, { mark: 790 })], ITT);
    const line = cycLines({ discipline: 'cyc.itt.10', phase: 'final' }, r, eventAwards(r))[0];
    assert.deepEqual(line.stats, { races: 1, place: 1, finals: 1, golds: 1, posPoints: 8, mark: 790, m_cyc_itt_10: 790, raceWins: 1 });
    const c = cyclingCareer([
      { eventId: 'a', date: '2026-03-01', stats: { races: 1, place: 2, mark: 805, m_cyc_itt_10: 805 } },
      { eventId: 'b', date: '2026-10-11', stats: { races: 1, place: 1, mark: 790, m_cyc_itt_10: 790, golds: 1, raceWins: 1, posPoints: 8 } },
      { eventId: 'c', date: '2026-10-12', stats: { races: 1, prPts: 23, place: 1, raceWins: 1 } },
      { eventId: 'd', date: '2025-05-01', stats: { races: 1, stages: 1, stageWins: 1, stagePlace: 1 } },
    ], new Map(), '2026-01-01');
    assert.deepEqual([c.races, c.wins, c.golds, c.prPts, c.stages, c.stageWins, c.points], [4, 2, 1, 23, 1, 1, 8]);
    assert.equal(c.bests.length, 1);
    assert.equal(c.bests[0].pb.text, '13:10.00');
    assert.equal(c.bests[0].label, 'Individual time trial 10 km');
    assert.deepEqual(c.history[1].flags, ['PB']);
  });
  test('the sport is wired: event sport, schema, controls, checklist', () => {
    assert.equal(isEventSport('cycling'), true);
    assert.equal(eventPrefix('cycling'), 'cyc.');
    assert.equal(eventWords('cycling').athletes, 'riders');
    assert.deepEqual(validateSchema(STAT_SCHEMAS.cycling), []);
    assert.equal(STAT_SCHEMAS.cycling.careerView, 'measured');
    assert.deepEqual(EVENT_CONTROLS.cycling, ['closePhase', 'finishEvent']);
    const items = setupChecklist({ sports: ['cycling'], formats: {} }, 0, 0, 0);
    assert.deepEqual(items.map((i) => i.hint), ['Riders score for them.', 'Each race (time trial, road race, pursuit, sprint, points race …) with its riders and rounds.']);
  });
});
