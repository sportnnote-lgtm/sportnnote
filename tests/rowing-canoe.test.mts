/**
 * SD-99 rowing (World Rowing) and SD-100 canoe sprint (ICF) on the results
 * engine: the boat-class / distance catalogue, plausible ranges, progression
 * presets (heats → repechage → Finals A / B; semis; ICF heats → semi → final),
 * routing by place with crews carried past the repechage, lane allocation by
 * ranking, dead heats on a line, Finals A / B places running on, crew stat
 * lines (every rower and the cox), the crew career, records per boat class and
 * distance, the house table and the stat schemas.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  disciplineOf, rankEntries, rankByHeat, crewEventOf, crewKey, seatNames, crewSplitDistances, markRange, rangeCheck, crewRoundPresets,
  repechagePlan, semisPlan, heatsToFinalsPlan, icfSemisPlan, customCrewPlan, describeCrewPlan, describePlan, routeCrews, advanceCrews, crewLaneOrder,
  crewLines, crewCareer, crewMarkKey, crewKeyDiscipline, crewMembersText, crewError, crewMeetSettings, eventAwards, updateRecords, categoryKey,
  categoryLabel, phaseNameOf, isRaceRows, groupMeet, meetFieldResults, eventLeaders, eventMeetSettings, splitDistances, CREW_EVENTS,
  type DisciplineDef, type EntryResult, type ResultEntry, type PhaseFormat, type PlannedPhase, type MeetPhase,
} from '../src/data/results/index.ts';
import { medalStandings } from '../src/data/medalStandings.ts';
import { STAT_SCHEMAS } from '../src/sports/statSchemas.ts';
import { validateSchema } from '../src/sports/statSchema.ts';
import { isEventSport, eventPrefix } from '../src/sports/eventSports.ts';
import { setupChecklist } from '../src/data/setupChecklist.ts';
import { EVENT_CONTROLS } from '../src/core/matchSafety.ts';

const D = (k: string): DisciplineDef => { const d = disciplineOf(k); assert.ok(d, k); return d!; };
const X1 = D('row.1x.2000'), E8 = D('row.8p.2000'), K1 = D('cs.k1.500');
const HOUSES = ['Red', 'Blue', 'Green', 'Gold'];
const boat = (i: number, mark?: number, heat = 1, extra: EntryResult = {}): ResultEntry =>
  ({ id: `e${i}`, athleteId: `p${i}`, name: `Sculler ${i}`, heat, team: { name: `${HOUSES[i % 4]} House` }, result: { ...(mark != null ? { mark } : {}), ...extra } });

/* ------------------------------ catalogue -------------------------------- */

describe('catalogue: World Rowing boat classes, ICF boats', () => {
  test('every boat class × distance exists, timed to 1/100 with the photo-finish tie rule', () => {
    for (const b of ['1x', '2x', '2m', '4x', '4m', '4p', '8p']) for (const m of [2000, 1500, 1000, 500]) {
      const d = D(`row.${b}.${m}`);
      assert.equal(d.sport, 'rowing'); assert.equal(d.unit, 'time'); assert.equal(d.dp, 2); assert.equal(d.tie, 'photo'); assert.equal(d.lanes, 6);
    }
    for (const b of ['k1', 'k2', 'k4', 'c1', 'c2', 'c4']) for (const m of [200, 500, 1000, 5000]) assert.equal(D(`cs.${b}.${m}`).lanes, 9);
    assert.equal(X1.teamSize, undefined); // a single is an athlete, not a crew row
    assert.equal(E8.teamSize, 9); // 8 rowers + cox
    assert.equal(D('row.4p.2000').teamSize, 5);
    assert.equal(D('cs.k4.500').teamSize, 4);
    assert.equal(E8.label, '8+ 2000 m');
    assert.equal(D('cs.k1.5000').label, 'K1 5 km');
    assert.equal(CREW_EVENTS.length, 7 * 4 + 6 * 4);
  });
  test('seats: bow … stroke + cox; canoe seat 1 at the front', () => {
    assert.deepEqual(seatNames(crewEventOf('row.4p.2000')!), ['Bow', '2', '3', 'Stroke', 'Cox']);
    assert.deepEqual(seatNames(crewEventOf('row.1x.2000')!), ['Sculler']);
    assert.deepEqual(seatNames(crewEventOf('cs.k2.500')!), ['Seat 1', 'Seat 2']);
    assert.equal(crewKey('canoe', 'c2', 1000), 'cs.c2.1000');
    assert.equal(crewEventOf('row.9x.2000'), null);
  });
  test('rowing and canoe are event sports with close-round / finish controls; codes keep stat keys identifiers', () => {
    assert.ok(isEventSport('rowing') && isEventSport('canoe'));
    assert.equal(eventPrefix('rowing'), 'row.'); assert.equal(eventPrefix('canoe'), 'cs.');
    assert.deepEqual(EVENT_CONTROLS.rowing, ['closePhase', 'finishEvent']);
    assert.equal(crewMarkKey('row.8p.2000'), 'm_row_8p_2000');
    assert.equal(crewKeyDiscipline('m_cs_k1_500'), 'cs.k1.500');
    const steps = setupChecklist({ sports: ['rowing'], formats: {}, participation: 'team' } as never, 4, 0, 1);
    assert.match(steps[0].hint, /Crews/);
  });
  test('splits: rowing every 500 m, canoe every 250 m (100 m over 200 m)', () => {
    assert.deepEqual(crewSplitDistances('row.8p.2000'), [500, 1000, 1500]);
    assert.deepEqual(splitDistances('row.1x.1000'), [500]);
    assert.deepEqual(splitDistances('cs.k1.500'), [250]);
    assert.deepEqual(splitDistances('cs.k1.200'), [100]);
  });
  test('categories: lightweight / para are kept apart; U23 / masters read Men / Women', () => {
    assert.notEqual(categoryKey({ age: 'Senior', gender: 'M', weightClass: 'Lightweight' }), categoryKey({ age: 'Senior', gender: 'M' }));
    assert.equal(categoryLabel({ age: 'U23', gender: 'F' }), 'U23 Women');
    assert.equal(categoryLabel({ age: 'Masters', gender: 'M', weightClass: 'PR1' }), 'Masters Men PR1');
  });
});

/* -------------------------------- safety ---------------------------------- */

describe('plausible range per boat class and distance (SD-112)', () => {
  test('a 1x 2000 m faster than the world best or slower than a novice asks first', () => {
    const r = markRange('row.1x.2000')!;
    assert.ok(r.min > 370 && r.min < 395 && r.max > 800);
    assert.equal(rangeCheck(X1, 7 * 60 + 30), null);
    assert.equal(rangeCheck(X1, 75)?.side, 'low'); // "1:15" typed for 7:15
    assert.ok(markRange('row.8p.2000')!.min < markRange('row.1x.2000')!.min); // the eight is fastest
    assert.ok(markRange('cs.k4.500')!.min < markRange('cs.k1.500')!.min);
    assert.ok(markRange('cs.c1.1000')!.min > markRange('cs.k1.1000')!.min); // a canoe is slower than a kayak
    assert.equal(rangeCheck(K1, 30)?.side, 'low');
  });
});

/* ------------------------------ progression -------------------------------- */

describe('progression presets', () => {
  test('rowing 9 crews on 6 lanes: 2 heats (1st → FA), 2 repechages (1–2 → FA, 3–4 → FB)', () => {
    const p = crewRoundPresets('rowing', 9, 6);
    assert.equal(p[0].key, 'rep');
    assert.equal(describeCrewPlan(p[0].plan), '2 heats (1st → Final A · 2nd on → Repechage) → 2 repechages (1–2 → Final A · 3–4 → Final B) → Finals A/B');
    assert.equal(describePlan(p[0].plan), describeCrewPlan(p[0].plan)); // the generic describer hands crews over
    assert.deepEqual(p[0].plan[2], { phase: 'final', heats: 2, races: ['A', 'B'] });
  });
  test('rowing 7–12 / 13–18 tables; straight final up to the lanes', () => {
    assert.deepEqual(crewRoundPresets('rowing', 6, 6).map((x) => x.key), ['final']);
    assert.match(describeCrewPlan(repechagePlan(7, 6)), /1 repechage \(1–4 → Final A · 5th → Final B\)/);
    assert.match(describeCrewPlan(repechagePlan(12, 6)), /2 repechages \(1–2 → Final A · 3–5 → Final B\)/);
    const s = semisPlan(18, 6);
    assert.equal(describeCrewPlan(s), '3 heats (1st → Semi-finals · 2nd on → Repechage) → 3 repechages (1–3 → Semi-finals · 4–5 → Final C) → 2 semi-finals (1–3 → Final A · 4–6 → Final B) → Finals A/B/C');
    assert.equal(crewRoundPresets('rowing', 15, 6)[0].key, 'semis');
    // 24 crews: the repechages no longer reach Final A — that alternative isn't offered
    assert.ok(!crewRoundPresets('rowing', 24, 6).some((x) => x.key === 'rep'));
  });
  test('canoe (ICF, 9 lanes): heats → semi → final with 1–3 straight to Final A; heats → Finals A/B', () => {
    assert.equal(describeCrewPlan(icfSemisPlan(12, 9, 3)), '2 heats (1–3 → Final A · 4–6 → Semi-finals) → 1 semi-final (1–3 → Final A · 4–6 → Final B) → Finals A/B');
    assert.equal(describeCrewPlan(heatsToFinalsPlan(12, 9)), '2 heats (1–4 → Final A · 5–6 → Final B) → Finals A/B');
    assert.deepEqual(crewRoundPresets('canoe', 9).map((x) => x.key), ['final']);
  });
  test('a custom rule: 3 heats, 2 straight to Final A, the rest to the repechage', () => {
    const p = customCrewPlan(15, 6, { heats: 3, direct: 2, repechage: true, finalB: true });
    assert.equal(p[0].heats, 3);
    assert.deepEqual(p[0].progression?.routes?.[0], { from: 1, to: 2, phase: 3, race: 1 });
    const q = customCrewPlan(10, 6, { heats: 2, direct: 2, repechage: false, finalB: false });
    assert.equal(describeCrewPlan(q), '2 heats (1–2 → Final A) → Final');
  });
  test('lane allocation by ranking: 3 4 2 5 1 6 (6 lanes), 5 6 4 7 3 8 2 9 1 (9 lanes)', () => {
    assert.deepEqual(crewLaneOrder(6), [3, 4, 2, 5, 1, 6]);
    assert.deepEqual(crewLaneOrder(8), [4, 5, 3, 6, 2, 7, 1, 8]);
    assert.deepEqual(crewLaneOrder(9), [5, 6, 4, 7, 3, 8, 2, 9, 1]);
  });
});

/* --------------------- a 9-crew 1x regatta, end to end ---------------------- */

const fmtOf = (plan: PlannedPhase[], phaseNo: number, extra: Partial<PhaseFormat> = {}): PhaseFormat => ({
  discipline: X1.key, phase: plan[phaseNo - 1].phase, phaseNo, heats: plan[phaseNo - 1].heats, progression: plan[phaseNo - 1].progression,
  plan, eventKey: 'rev1', races: plan[phaseNo - 1].races, ...extra,
});
/** Build the next round's entries from advanceCrews (as resultsStore does). */
function nextEntries(prev: ResultEntry[], seeded: ReturnType<typeof advanceCrews>['seeded'], times: Record<string, number>): ResultEntry[] {
  return seeded.map((s) => {
    const src = s.carried ? { id: s.carried.ref, athleteId: s.carried.playerId, name: s.carried.result.name ?? `Sculler ${s.carried.ref.slice(1)}` } : prev.find((e) => e.id === s.ref)!;
    const id = src.id;
    return { id, athleteId: src.athleteId, name: src.name, heat: s.heat, result: { lane: s.lane, order: s.order, ...(s.race ? { race: s.race } : {}), ...(times[id] != null ? { mark: times[id] } : {}) } };
  });
}

describe('1x 2000 m, 9 crews: heats → repechage → Finals A / B', () => {
  const plan = crewRoundPresets('rowing', 9, 6)[0].plan;
  // heat 1: e1 … e5, heat 2: e6 … e9 — fastest e1 / e6
  const heats = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => boat(i, 420 + i * 2 - (i > 5 ? 9 : 0), i <= 5 ? 1 : 2));
  const byHeat = rankByHeat(heats, X1);
  const h = advanceCrews(byHeat, fmtOf(plan, 1), plan[1], 6);
  test('heat winners wait for Final A; everyone else races the repechage, best in the centre lanes', () => {
    assert.deepEqual(h.carry.map((c) => [c.ref, c.phase, c.race, c.from]), [['e1', 3, 1, 'Heat 1 · 1st'], ['e6', 3, 1, 'Heat 2 · 1st']]);
    assert.equal(h.seeded.length, 7);
    assert.deepEqual(new Set(h.seeded.map((s) => s.heat)), new Set([1, 2]));
    // the two 2nd places are the best ranked: one per repechage, in lane 3
    const seconds = h.seeded.filter((s) => s.ref === 'e2' || s.ref === 'e7');
    assert.deepEqual(seconds.map((s) => s.lane), [3, 3]);
    assert.notEqual(seconds[0].heat, seconds[1].heat);
  });
  const repTimes: Record<string, number> = { e7: 425, e2: 426, e3: 428, e8: 429, e4: 431, e9: 433, e5: 435 };
  const rep = nextEntries(heats, h.seeded, repTimes);
  const repF = fmtOf(plan, 2, { carry: h.carry });
  const r = advanceCrews(rankByHeat(rep, X1), repF, plan[2], 6);
  const fin = nextEntries(rep, r.seeded, { e6: 410, e1: 411, e7: 415, e2: 416, e3: 418, e8: 419, e4: 405, e9: 425, e5: 430 });
  test('the repechages fill Final A (with the heat winners), the rest go to Final B', () => {
    assert.equal(r.carry.length, 0);
    const A = fin.filter((e) => e.result.race === 'A').map((e) => e.id).sort();
    const B = fin.filter((e) => e.result.race === 'B').map((e) => e.id).sort();
    assert.deepEqual(A, ['e1', 'e2', 'e3', 'e6', 'e7', 'e8']);
    assert.deepEqual(B, ['e4', 'e5', 'e9']);
    // Final A lanes: the heat winners (1st places) get the centre lanes 3 and 4
    assert.deepEqual(fin.filter((e) => ['e1', 'e6'].includes(e.id)).map((e) => e.result.lane).sort(), [3, 4]);
    assert.ok(isRaceRows(fin));
  });
  test('Finals A / B: places run on — Final B’s winner is 7th even with a faster time', () => {
    const rows = rankEntries(fin, X1);
    assert.deepEqual(rows.filter((x) => x.position != null).map((x) => `${x.position}:${x.id}`), ['1:e6', '2:e1', '3:e7', '4:e2', '5:e3', '6:e8', '7:e4', '8:e9', '9:e5']);
    const aw = eventAwards(rows, { positionPoints: [8, 7, 6, 5, 4, 3, 2, 1] });
    assert.deepEqual(aw.filter((a) => a.medal).map((a) => `${a.medal}:${a.entryId}`), ['gold:e6', 'silver:e1', 'bronze:e7']);
    assert.equal(aw.find((a) => a.entryId === 'e4')?.points, 2); // 7th
  });
  test('the phase names: "Finals A/B"', () => {
    assert.equal(phaseNameOf({ discipline: X1.key, phase: 'final', races: ['A', 'B'] }), 'Finals A/B');
    assert.equal(phaseNameOf({ discipline: X1.key, phase: 'repechage' }), 'Repechage');
  });
  test('records per boat class + distance come from the final; the house table counts Final A and B places', () => {
    const rows = rankEntries(fin, X1);
    const book = updateRecords(rows, X1, categoryKey({ age: 'Senior', gender: 'M' }), [], '2026-10-11', ['MR'], 'rev1');
    assert.equal(book[0].value, 405); // the fastest time stands as the record, even from Final B
    const phase: MeetPhase = { id: 'f1', format: fmtOf(plan, 3), status: 'completed', date: '2026-10-11', entries: fin.map((e) => ({ ...e, team: { name: `${HOUSES[Number(e.id.slice(1)) % 4]} House` } })) };
    const ev = groupMeet([phase]);
    const res = meetFieldResults(ev, { positionPoints: [8, 7, 6, 5, 4, 3, 2, 1] });
    const table = medalStandings([], [], { mode: 'position' }, undefined, res);
    assert.ok(table.length >= 3);
    assert.equal(eventLeaders(ev)[0].mark, 405);
  });
});

/* -------------------------- dead heats on a line --------------------------- */

describe('dead heat on a qualifying line', () => {
  const plan = repechagePlan(9, 6);
  test('equal times with the same photo reading: both take the better route and are listed', () => {
    const rows = [boat(1, 420, 1, { thousandths: 420.004 }), boat(2, 420, 1, { thousandths: 420.004 }), boat(3, 425)];
    const out = routeCrews(rankByHeat(rows, X1), plan[0].progression!);
    assert.deepEqual(out.dest.get('e1'), { phase: 3, race: 1 });
    assert.deepEqual(out.dest.get('e2'), { phase: 3, race: 1 });
    assert.deepEqual(out.tieAtLine.sort(), ['e1', 'e2']);
  });
  test('the photo-finish thousandths decide; a re-row / draw place separates a true dead heat', () => {
    const photo = routeCrews(rankByHeat([boat(1, 420, 1, { thousandths: 419.996 }), boat(2, 420, 1, { thousandths: 419.998 })], X1), plan[0].progression!);
    assert.deepEqual(photo.dest.get('e2'), { phase: 2 });
    assert.equal(photo.tieAtLine.length, 0);
    const rerow = routeCrews(rankByHeat([boat(1, 420, 1, { decider: 2 }), boat(2, 420, 1, { decider: 1 })], X1), plan[0].progression!);
    assert.deepEqual(rerow.dest.get('e2'), { phase: 3, race: 1 });
    assert.deepEqual(rerow.dest.get('e1'), { phase: 2 });
  });
  test('a dead heat in a final shares the place (=2)', () => {
    const rows = rankEntries([boat(1, 400), boat(2, 401), boat(3, 401)], X1);
    assert.deepEqual(rows.map((r) => r.label), ['1', '=2', '=2']);
  });
});

/* ----------------------------- canoe sprint ------------------------------- */

describe('K1 500 m, 12 boats: heats → Finals A / B', () => {
  const plan = heatsToFinalsPlan(12, 9);
  const heats = Array.from({ length: 12 }, (_, i) => boat(i + 1, 110 + i, i % 2 ? 2 : 1));
  const a = advanceCrews(rankByHeat(heats, K1), { phaseNo: 1, phase: 'heat', progression: plan[0].progression }, plan[1], 9);
  test('1–4 of each heat to Final A (centre lanes by place), 5–6 to Final B', () => {
    const A = a.seeded.filter((s) => s.race === 'A');
    assert.equal(A.length, 8);
    assert.equal(a.seeded.filter((s) => s.race === 'B').length, 4);
    assert.deepEqual(A.slice(0, 2).map((s) => s.lane), [5, 6]); // the heat winners
  });
  test('DNS / DNF / DQ boats go nowhere; status rows rank below', () => {
    const rows = [boat(1, 110), boat(2, undefined, 1, { status: 'DNF' }), boat(3, undefined, 1, { status: 'DQ', ruleRef: 'False start' })];
    const out = routeCrews(rankByHeat(rows, K1), plan[0].progression!);
    assert.ok(out.dest.has('e1') && !out.dest.has('e2') && !out.dest.has('e3'));
    assert.deepEqual(rankEntries(rows, K1).map((r) => r.label), ['1', 'DNF', 'DQ']);
  });
});

/* ------------------------- crews: lines and career ------------------------- */

describe('crew stat lines and the career', () => {
  const four = (id: string, mark: number, race?: string): ResultEntry => ({
    id, name: `${id} 4+`, heat: 1, team: { name: 'Red House' },
    result: { mark, ...(race ? { race } : {}), members: [...['a', 'b', 'c', 'd'].map((x) => ({ playerId: `${id}${x}`, name: `${id.toUpperCase()} ${x}` })), { playerId: `${id}x`, name: `${id} cox`, cox: true }] },
  });
  const F4 = D('row.4p.2000');
  const rows = rankEntries([four('r', 400, 'A'), four('s', 405, 'A'), four('t', 390, 'B')], F4);
  const aw = eventAwards(rows, { positionPoints: [8, 7, 6] });
  const lines = crewLines({ discipline: F4.key, phase: 'final' }, rows, aw);
  test('every rower and the cox is credited with the crew’s race, time, place and medal', () => {
    assert.equal(lines.length, 15);
    const cox = lines.find((l) => l.playerId === 'rx')!;
    assert.deepEqual(cox.stats, { races: 1, place: 1, finals: 1, finalsA: 1, golds: 1, mark: 400, m_row_4p_2000: 400, cox: 1 });
    assert.equal(lines.find((l) => l.playerId === 'rd')!.stats.seat, 4);
    const b = lines.find((l) => l.playerId === 'ta')!;
    assert.equal(b.stats.place, 3); // Final B's winner after a 2-boat Final A
    assert.equal(b.stats.finalsA, undefined);
    assert.equal(b.stats.posPoints, undefined); // crew boats score for the house only
  });
  test('the career: races, A finals, medals, best time per boat class and distance, seat raced', () => {
    const mine = [
      { eventId: 'h1', date: '2026-03-01', stats: { races: 1, place: 2, mark: 410, m_row_4p_2000: 410, seat: 4 } },
      ...lines.filter((l) => l.playerId === 'rd').map((l) => ({ eventId: 'f1', date: '2026-10-11', stats: l.stats })),
    ];
    const infos = new Map([['f1', { discipline: F4.key, phase: 'final' as const, title: '4+ 2000 m — Finals A/B', date: '2026-10-11' }]]);
    const c = crewCareer(mine, infos, '2026-01-01');
    assert.equal(c.races, 2); assert.equal(c.finalsA, 1); assert.equal(c.golds, 1);
    assert.equal(c.bests[0].pb.value, 400);
    assert.equal(c.bests[0].label, '4+ 2000 m — Coxed four');
    assert.equal(c.history[0].text, '1st 6:40.00 (stroke)');
    assert.deepEqual(c.history[0].flags, ['PB']);
  });
  test('crew line on a sheet; incomplete crews are caught', () => {
    assert.equal(crewMembersText(F4.key, four('r', 400).result.members), 'Bow R · 2 R · 3 R · Stroke R · Cox r');
    assert.match(crewError(F4.key, [{ name: 'a' }, { name: 'b' }, { name: 'c' }, { name: 'd' }])!, /needs a cox/);
    assert.match(crewError('cs.k2.500', [{ name: 'a' }])!, /2 paddlers/);
    assert.match(crewError('row.2x.2000', [{ playerId: 'p', name: 'a' }, { playerId: 'p', name: 'a' }])!, /two seats/);
  });
  test('meet settings and the stat schemas', () => {
    assert.equal(crewMeetSettings('canoe').lanes, 9);
    assert.equal(crewMeetSettings('rowing', { lanes: 8, handTimed: true }).handTimed, true);
    assert.deepEqual(eventMeetSettings('rowing', { pointsScheme: '5,3,1' }).positionPoints, [5, 3, 1]);
    for (const sp of ['rowing', 'canoe'] as const) {
      assert.deepEqual(validateSchema(STAT_SCHEMAS[sp]), [], sp);
      assert.equal(STAT_SCHEMAS[sp].careerView, 'measured');
    }
    assert.ok(STAT_SCHEMAS.rowing.stats.some((s) => s.key === 'm_row_8p_2000'));
    assert.ok(STAT_SCHEMAS.canoe.stats.some((s) => s.key === 'pb_cs_k1_200'));
    assert.ok(!STAT_SCHEMAS.canoe.stats.some((s) => s.key === 'cox'));
  });
});

