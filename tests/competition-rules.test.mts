/**
 * SD-141 — competition rules for event sports: the catalogue (standard
 * defaults, explanations, sources), the phase snapshot (only non-default
 * values; no rules = the behaviour before SD-141), the lock once results
 * exist, and that every option changes what the engine does.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  COMPETITION_RULES, rulesFor, ruleOf, sportRule, phaseRules, ruleShown, changedRules, ruleValueLabel, rulesLocked, parseClassList, zeroLanes, falseStartStep,
  disciplineOf, phaseDiscipline, rankEntries, hasAnyResult, laneNumbers, swimLaneOrder, swimSeed, lateLanePreference, placeLateEntry, handNote,
  liftingOrder, declareError, autoNext, recordLift, weightClasses, sinclairCoefficient, liftLines,
  teamScores, cellOf, combinedStandings, combinedPoints, combinedHeader, falseStartAction,
  qualKeys, shootEventOf, matchOutcome, archMatch, bracketFormat,
  roadTimes, pointsTotal, pointsLine, stageTimes, stageFinishers, rankStage, gcAfter, advanceCrews, rankByHeat, heatsToFinalsPlan, sprintPoints,
  type CompRules, type DisciplineDef, type EntryResult, type ResultEntry, type PhaseFormat, type ArchSide, type Arrow,
} from '../src/data/results/index.ts';
import { EVENT_SPORTS } from '../src/sports/eventSports.ts';

const D = (k: string): DisciplineDef => { const d = disciplineOf(k); assert.ok(d, k); return d!; };
const R = (rules: CompRules) => ({ rules });
const row = (i: number, result: EntryResult = {}, heat = 1, team?: string): ResultEntry =>
  ({ id: `e${i}`, athleteId: `p${i}`, name: `Athlete ${i}`, heat, result, ...(team ? { team: { name: team } } : {}) });
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

/* ------------------------------- the catalogue ------------------------------- */

describe('catalogue', () => {
  test('every event sport has rules; keys are unique; each default is one of its choices; each has help and a source', () => {
    for (const s of EVENT_SPORTS) assert.ok(rulesFor(s).length >= 2, s);
    const keys = COMPETITION_RULES.map((r) => `${r.key}`);
    assert.equal(new Set(keys).size, keys.length);
    for (const r of COMPETITION_RULES) {
      assert.ok(r.help.length > 20 && r.source.length > 3, r.key);
      if (r.kind === 'choice') assert.ok(r.choices!.some((c) => c.value === r.default), `${r.key} default in choices`);
    }
  });
  test('the brief\'s rules are all there', () => {
    const need: [string, string[]][] = [
      ['weightlifting', ['wlOrder', 'wlStep', 'wlRepeat', 'wlClasses', 'sinclair', 'sinclairPeriod', 'liftMedals']],
      ['athletics', ['falseStart', 'ceFalseStart', 'windLimit', 'handTimed', 'ageOn', 'handConvert', 'lateLanes', 'caps', 'xcScorers', 'xcSize', 'xcBasis', 'xcTieBreak', 'roadCertified', 'ceTie', 'ceDns']],
      ['swimming', ['swimFalseStart', 'splits', 'laneNumbering']],
      ['archery', ['archTie', 'archShootOff', 'archBracket']],
      ['shooting', ['shootTie', 'shootFinal', 'shootOff']],
      ['cycling', ['cycGap', 'cycGcTie', 'cycSprintPts']],
      ['rowing', ['crewProgression', 'crewLanes']],
      ['canoe', ['crewProgression', 'crewLanes']],
    ];
    for (const [s, ks] of need) for (const k of ks) assert.ok(rulesFor(s).some((r) => r.key === k), `${s}.${k}`);
  });
  test('existing keys are reused, not duplicated', () => {
    for (const k of ['liftMedals', 'sinclair', 'handTimed', 'splits', 'ageOn']) assert.equal(COMPETITION_RULES.find((r) => r.key === k)?.existing, true, k);
  });
  test('ruleOf / sportRule fall back to the standard; phaseRules keeps only phase rules that differ', () => {
    assert.equal(ruleOf(undefined, 'wlStep'), 1);
    assert.equal(ruleOf({ wlStep: 2 }, 'wlStep'), 2);
    assert.equal(sportRule({}, 'falseStart'), 'zero');
    assert.equal(sportRule({ falseStart: 'one' }, 'falseStart'), 'one');
    assert.deepEqual(phaseRules('athletics', { falseStart: 'zero', windLimit: 'none', xcBasis: 'overall', pointsScheme: '5,3,1' }), { windLimit: 'none' });
    assert.deepEqual(phaseRules('weightlifting', undefined), {});
  });
  test('showIf, the changed list and value labels', () => {
    const custom = COMPETITION_RULES.find((r) => r.key === 'wlClassesM')!;
    assert.equal(ruleShown(custom, {}), false);
    assert.equal(ruleShown(custom, { wlClasses: 'custom' }), true);
    assert.deepEqual(changedRules('athletics', { falseStart: 'one', windLimit: '2.0' }).map((r) => r.key), ['falseStart']);
    assert.match(ruleValueLabel(COMPETITION_RULES.find((r) => r.key === 'falseStart')!, 'one'), /One per race/);
  });
  test('parseClassList', () => {
    assert.deepEqual(parseClassList('49, 55,61 67'), [49, 55, 61, 67]);
    assert.equal(parseClassList('55, 49'), null);
    assert.equal(parseClassList(''), null);
    assert.equal(parseClassList('49, x'), null);
  });
});

/* --------------------------------- the lock --------------------------------- */

describe('lock once results exist', () => {
  const has = (rs: unknown[]) => hasAnyResult(rs as EntryResult[]);
  test('a start list is not a result; a mark, a live or a locked round is', () => {
    assert.equal(rulesLocked([], has), false);
    assert.equal(rulesLocked([{ status: 'scheduled', results: [{ lane: 3, bib: '101' }, { order: 2 }] }], has), false);
    assert.equal(rulesLocked([{ status: 'scheduled', results: [{ lane: 3, mark: 12.3 }] }], has), true);
    assert.equal(rulesLocked([{ status: 'live', results: [] }], has), true);
    assert.equal(rulesLocked([{ status: 'completed', results: [] }], has), true);
  });
  test('the store re-checks the lock before saving; the screen is read-only when locked and confirms the save', () => {
    const store = src('src/data/competitionRulesStore.ts');
    assert.match(store, /rulesLocked\(ps[\s\S]*throw new Error\('Results already exist/);
    assert.match(store, /patchPhaseFormat\(p\.id, \{ rules \}\)/);
    const screen = src('src/screens/CompetitionRulesScreen.tsx');
    assert.match(screen, /const editable = canManage && !!lock && !locked/);
    assert.match(screen, /disabled=\{!editable\}/);
    assert.match(screen, /askConfirm\(\{ title: 'Apply to the events already set up\?'/);
    assert.match(screen, /askConfirm\(\{ title: 'Back to the standard rules\?'/);
    assert.match(screen, /SportSettings/); // team sports: bans and walkover scores
  });
  test('shown on every event setup screen and the hub', () => {
    for (const f of ['AthleticsEventSetupScreen', 'WeightliftingEventSetup', 'ShootingEventSetup', 'ArcheryEventSetup', 'CrewEventSetup', 'CyclingEventSetup', 'RoadEventSetup', 'CombinedEventSetup']) {
      assert.match(src(`src/screens/${f}.tsx`), /<CompetitionRulesCard tournament=\{tournament\}/, f);
    }
    assert.match(src('src/components/athletics/AthleticsHub.tsx'), /<CompetitionRulesCard/);
  });
  test('a new phase takes the tournament\'s rules (later rounds copy the phase format)', () => {
    const store = src('src/data/resultsStore.ts');
    assert.match(store, /if \(res && !res\.rules && input\.tournamentId\)/);
  });
});

/* ------------------------------ legacy behaviour ------------------------------ */

describe('no rules = the behaviour before SD-141', () => {
  test('phaseDiscipline adds nothing without rules', () => {
    const M100 = D('ath.100m');
    assert.deepEqual(phaseDiscipline(M100, {}), M100);
    assert.deepEqual(phaseDiscipline(M100, { rules: {} }), M100);
    assert.deepEqual(phaseDiscipline(M100, { rules: { windLimit: 'none' } }).rules, { windLimit: 'none' });
  });
});

/* ------------------------------- weightlifting ------------------------------- */

describe('weightlifting', () => {
  const lifter = (i: number, result: EntryResult = {}): ResultEntry => ({ id: `e${i}`, athleteId: `p${i}`, name: `Lifter ${i}`, heat: 1, result: { order: i, ...result } });
  // both want 83 kg on their 2nd snatch: lifter 2 (lot 2) jumped 3 kg, lifter 1 (lot 1) 1 kg
  const rows = [
    lifter(1, { lifts: { snatch: [{ kg: 82, good: true, seq: 2 }, { kg: 83 }] } }),
    lifter(2, { lifts: { snatch: [{ kg: 80, good: true, seq: 1 }, { kg: 83 }] } }),
  ];
  test('calling order: IWF (bigger progression first) vs simple (lot number)', () => {
    assert.equal(liftingOrder(rows, 'snatch')[0].entryId, 'e2');
    assert.equal(liftingOrder(rows, 'snatch', { wlOrder: 'simple' })[0].entryId, 'e1');
  });
  test('increase after a good lift', () => {
    const done = [{ kg: 80, good: true, seq: 1 }];
    assert.equal(declareError(done, 1, 81), null);
    assert.match(declareError(done, 1, 81, { wlStep: 2 })!, /at least 82 kg/);
    assert.equal(declareError(done, 1, 82, { wlStep: 2 }), null);
    assert.equal(autoNext(80, true, { wlStep: 2 }), 82);
    assert.equal(recordLift([{ kg: 80 }], { good: true }, 1, { wlStep: 5 })[1].kg, 85);
  });
  test('after a no lift: repeat (IWF) or must go up', () => {
    const miss = [{ kg: 80, good: false, seq: 1 }];
    assert.equal(declareError(miss, 1, 80), null);
    assert.match(declareError(miss, 1, 80, { wlRepeat: 'up' })!, /at least 81 kg/);
    assert.equal(autoNext(80, false), 80);
    assert.equal(autoNext(80, false, { wlRepeat: 'up' }), 81);
  });
  test('categories: by age (default), forced list, our own list', () => {
    assert.deepEqual(weightClasses('Senior', 'M'), ['60 kg', '65 kg', '71 kg', '79 kg', '88 kg', '94 kg', '110 kg', '+110 kg']);
    assert.equal(weightClasses('Senior', 'M', { wlClasses: 'school' })[0], '40 kg');
    assert.equal(weightClasses('School', 'F', { wlClasses: 'iwf2025' })[0], '48 kg');
    assert.equal(weightClasses('Senior', 'F', { wlClasses: 'youth' })[0], '44 kg');
    assert.deepEqual(weightClasses('U14', 'M', { wlClasses: 'custom', wlClassesM: '50, 60, 70' }), ['50 kg', '60 kg', '70 kg', '+70 kg']);
    // a bad custom list falls back to the age table
    assert.equal(weightClasses('Senior', 'M', { wlClasses: 'custom', wlClassesM: '70, 60' })[0], '60 kg');
  });
  test('Sinclair coefficients by Olympiad; stat lines use the meet\'s set', () => {
    assert.notEqual(sinclairCoefficient(80, 'M'), sinclairCoefficient(80, 'M', '2017'));
    const done = lifter(3, { bodyweight: 80, lifts: { snatch: [{ kg: 120, good: true, seq: 1 }], cj: [{ kg: 150, good: true, seq: 2 }] } });
    const a = liftLines({ category: { gender: 'M' } }, [done])[0].stats.sinclair;
    const b = liftLines({ category: { gender: 'M' }, rules: { sinclairPeriod: '2017' } }, [done])[0].stats.sinclair;
    assert.ok(a && b && a !== b);
  });
});

/* --------------------------------- athletics --------------------------------- */

describe('athletics', () => {
  test('false starts: zero tolerance (default), one per race, combined events, swimming recall', () => {
    assert.equal(falseStartStep(undefined, 1, [], 'track'), 'dq');
    assert.equal(falseStartStep({ falseStart: 'one' }, 1, [], 'track'), 'warn');
    assert.equal(falseStartStep({ falseStart: 'one' }, 1, [1], 'track'), 'dq');
    assert.equal(falseStartStep({ falseStart: 'one' }, 2, [1], 'track'), 'warn');
    assert.equal(falseStartStep(undefined, 1, [], 'combined'), 'warn');
    assert.equal(falseStartStep({ ceFalseStart: 'zero' }, 1, [], 'combined'), 'dq');
    assert.equal(falseStartAction({ fsWarned: [] }, 1), 'warn');
    assert.equal(falseStartAction({ fsWarned: [] }, 1, { ceFalseStart: 'zero' }), 'dq');
    assert.equal(falseStartStep(undefined, 1, [], 'swim'), 'dq');
    assert.equal(falseStartStep({ swimFalseStart: 'recall' }, 1, [], 'swim'), 'warn');
    assert.equal(falseStartStep({ swimFalseStart: 'recall' }, 1, [1], 'swim'), 'dq');
  });
  test('wind limit: +2.0 m/s (w, not record-legal) or no wind rule', () => {
    const M100 = D('ath.100m');
    const rows = [row(1, { mark: 10.5, wind: 3.0 })];
    const std = rankEntries(rows, M100)[0];
    assert.equal(std.legal, false);
    assert.ok(std.flags.includes('w'));
    const none = rankEntries(rows, phaseDiscipline(M100, R({ windLimit: 'none' })))[0];
    assert.equal(none.legal, true);
    assert.equal(none.bestLegal, 10.5);
    assert.ok(!none.flags.includes('w'));
    const LJ = D('ath.lj');
    const jump = [row(1, { attempts: [{ mark: 6.5, wind: 2.6 }] })];
    assert.equal(rankEntries(jump, LJ)[0].bestLegal, null);
    assert.equal(rankEntries(jump, phaseDiscipline(LJ, R({ windLimit: 'none' })))[0].bestLegal, 6.5);
  });
  test('hand-time conversion shown or not', () => {
    const M100 = D('ath.100m');
    assert.match(handNote(M100, 10.8), /≈/);
    assert.doesNotMatch(handNote(phaseDiscipline(M100, R({ handConvert: 'none' })), 10.8), /≈/);
  });
  test('late entry lane: outside lanes first (default) or the lowest free lane', () => {
    const M100 = D('ath.100m');
    const rows = [1, 2, 3, 4, 5, 6].map((l) => ({ heat: 1, lane: l }));
    assert.equal(placeLateEntry(rows, M100).lane, 8);
    assert.equal(placeLateEntry(rows, phaseDiscipline(M100, R({ lateLanes: 'inside' }))).lane, 7);
    assert.deepEqual(lateLanePreference(8, 'ath.100m', { lateLanes: 'inside' }), [1, 2, 3, 4, 5, 6, 7, 8]);
  });
  test('cross-country: equal team totals — last scorer (default) or the next runner', () => {
    const XC = D('ath.xc.3000');
    // A 1, 4, 5 · B 2, 3, 6 — 2 score: A 1+4 = 5, B 2+3 = 5; last scorers A 4th, B 3rd; next runners A 5th, B 6th
    const order: [string, number][] = [['A', 1], ['B', 2], ['B', 3], ['A', 4], ['A', 5], ['B', 6]];
    const rows = order.map(([t, fin], i) => row(i + 1, { fin }, 1, t));
    const ranked = rankEntries(rows, XC);
    const last = teamScores(ranked, { scorers: 2, size: 3, basis: 'teams' });
    assert.deepEqual(last.map((t) => [t.name, t.total, t.label]), [['B', 5, '1'], ['A', 5, '2']]);
    const next = teamScores(ranked, { scorers: 2, size: 3, basis: 'teams', tieBreak: 'next' });
    assert.deepEqual(next.map((t) => [t.name, t.label]), [['A', '1'], ['B', '2']]);
    // a team without a next runner loses the tie
    const short = teamScores(rankEntries(rows.filter((r) => r.id !== 'e5'), XC), { scorers: 2, size: 3, basis: 'teams', tieBreak: 'next' });
    assert.equal(short[0].name, 'B');
  });
  test('road / XC setup reads the meet\'s defaults (scorers, size, counting, tie-break, certified)', () => {
    const s = src('src/screens/RoadEventSetup.tsx');
    for (const k of ['xcScorers', 'xcSize', 'xcBasis', 'xcTieBreak', 'roadCertified']) assert.match(s, new RegExp(`sportRule\\(rf, '${k}'\\)`), k);
  });
});

/* ------------------------------ combined events ------------------------------ */

describe('combined events', () => {
  const fmt = (index: number, rules?: CompRules): PhaseFormat => ({
    discipline: index ? 'ath.lj' : 'ath.100m', phase: 'final', phaseNo: index + 1, heats: 1, eventKey: 'ce',
    combined: { key: 'ath.ce_x_100m_lj', table: 'M', events: ['ath.100m', 'ath.lj'], index }, ...(rules ? { rules } : {}),
  });
  test('missing an event: out (TR 39.10) or 0 points and carry on', () => {
    assert.equal(cellOf(row(1, { status: 'DNS' }), fmt(0)).state, 'out');
    assert.equal(cellOf(row(1, { status: 'DNS' }), fmt(0, { ceDns: 'zero' })).state, 'zero');
    assert.equal(cellOf(row(1, { status: 'WD' }), fmt(0, { ceDns: 'zero' })).state, 'out');
    assert.match(combinedHeader(fmt(0, { ceDns: 'zero' }), D('ath.100m')), /DNS \/ DNF \/ NM \/ DQ score 0/);
  });
  test('equal totals: TR 39.12 (default) or shared', () => {
    // find two athletes on the same total with different event scores
    const p100 = (t: number) => combinedPoints('ath.100m', 'M', t);
    const plj = (m: number) => combinedPoints('ath.lj', 'M', m);
    let pair: { a: [number, number]; b: [number, number] } | null = null;
    outer: for (let ta = 1100; ta <= 1200; ta += 1) for (let tb = ta + 5; tb <= 1250; tb += 1) for (let ja = 600; ja <= 700; ja++) for (let jb = ja + 1; jb <= 720; jb++) {
      if (p100(ta / 100) + plj(ja / 100) === p100(tb / 100) + plj(jb / 100)) { pair = { a: [ta / 100, ja / 100], b: [tb / 100, jb / 100] }; break outer; }
    }
    assert.ok(pair, 'a level pair exists');
    const phases = (rules?: CompRules) => [0, 1].map((i) => ({
      format: fmt(i, rules), status: 'completed',
      entries: [
        row(1, i ? { attempts: [{ mark: pair!.a[1], wind: 0 }] } : { mark: pair!.a[0], wind: 0 }),
        row(2, i ? { attempts: [{ mark: pair!.b[1], wind: 0 }] } : { mark: pair!.b[0], wind: 0 }),
      ],
    }));
    const tr39 = combinedStandings(phases(), { final: true });
    assert.equal(tr39[0].total, tr39[1].total);
    assert.deepEqual(tr39.map((r) => r.label), ['1', '2']);
    const share = combinedStandings(phases({ ceTie: 'share' }), { final: true });
    assert.deepEqual(share.map((r) => r.label), ['=1', '=1']);
  });
});

/* --------------------------------- swimming --------------------------------- */

describe('swimming lanes in a 10-lane pool', () => {
  test('0–9 (SW 3.1.2, default) or 1–10', () => {
    assert.deepEqual(laneNumbers(10), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.deepEqual(laneNumbers(10, { laneNumbering: 'one' }), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.deepEqual(laneNumbers(8, { laneNumbering: 'one' }), [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.equal(zeroLanes(10, undefined), true);
    assert.equal(zeroLanes(10, { laneNumbering: 'one' }), false);
    assert.deepEqual(swimLaneOrder(10), [4, 5, 3, 6, 2, 7, 1, 8, 0, 9]);
    assert.deepEqual(swimLaneOrder(10, false), [5, 6, 4, 7, 3, 8, 2, 9, 1, 10]);
    const ids = Array.from({ length: 10 }, (_, i) => `s${i}`);
    const seeded = swimSeed(ids, 'final', 1, 10, 'swim.50free', false);
    assert.equal(seeded.find((s) => s.id === 's0')!.lane, 5);
    assert.ok(seeded.every((s) => s.lane! >= 1 && s.lane! <= 10));
    assert.deepEqual(lateLanePreference(10, 'swim.50free', { laneNumbering: 'one' }).slice(0, 2), [10, 1]);
  });
});

/* ---------------------------------- archery ---------------------------------- */

describe('archery', () => {
  test('ranking ties: 10s then X (World Archery) or X then 10s', () => {
    const R70 = D('arch.r70');
    const rows = [row(1, { mark: 650, tens: 20, xs: 8 }), row(2, { mark: 650, tens: 18, xs: 10 })];
    assert.equal(rankEntries(rows, R70)[0].id, 'e1');
    assert.equal(rankEntries(rows, phaseDiscipline(R70, R({ archTie: 'xs' })))[0].id, 'e2');
  });
  test('level shoot-off arrows: closest to the centre (default) or shoot again', () => {
    const end = (v: number): Arrow[] => [v, v, v] as Arrow[];
    const side = (ends: number[], so: Arrow[] = []): ArchSide => ({ ends: ends.map(end), ...(so.length ? { so } : {}) });
    const A = side([10, 9, 8, 7, 6], ['X']), B = side([9, 10, 8, 8, 5], [10]);
    assert.deepEqual(matchOutcome(A, B, 'sets').soNeed, { round: 1, kind: 'closer' });
    assert.deepEqual(matchOutcome(A, B, 'sets', true, true, true).soNeed, { round: 2, kind: 'arrows' });
    const m = archMatch(bracketFormat(D('arch.r70')), { archShootOff: 'repeat' })!;
    assert.deepEqual(m(A, B, true, true).soNeed, { round: 2, kind: 'arrows' });
    assert.equal(archMatch('sets', undefined), undefined);
  });
});

/* ---------------------------------- shooting ---------------------------------- */

describe('shooting', () => {
  const AP = D('shoot.10map');
  // same total and inner tens; the last series differs
  const rows = [row(1, { series: [94, 95, 95, 95, 95, 96], xs: 15 }), row(2, { series: [96, 95, 95, 95, 95, 94], xs: 15 })];
  test('ties: ISSF countback (default) or inner tens only', () => {
    const issf = rankEntries(rows, AP);
    assert.deepEqual(issf.map((r) => [r.id, r.label]), [['e1', '1'], ['e2', '2']]);
    const inner = rankEntries(rows, phaseDiscipline(AP, R({ shootTie: 'inner' })));
    assert.deepEqual(inner.map((r) => r.label), ['=1', '=1']);
    assert.ok(inner[0].needsDecider, 'a medal place with no final: a shoot-off');
    assert.equal(qualKeys(rows[0].result, shootEventOf('shoot.10map')!, true).length, 2);
  });
  test('equal medal places with no final: shoot-off (default) or shared', () => {
    const shared = rankEntries(rows, phaseDiscipline(AP, R({ shootTie: 'inner', shootOff: 'share' })));
    assert.deepEqual(shared.map((r) => r.label), ['=1', '=1']);
    assert.ok(!shared[0].needsDecider);
  });
  test('setup reads the meet\'s final size; archery the bracket size; regatta the progression', () => {
    assert.match(src('src/screens/ShootingEventSetup.tsx'), /sportRule\([^)]*'shootFinal'\)/);
    assert.match(src('src/screens/ArcheryEventSetup.tsx'), /sportRule\([^)]*'archBracket'\)/);
    assert.match(src('src/screens/CrewEventSetup.tsx'), /sportRule\([^)]*'crewProgression'\)/);
  });
});

/* ---------------------------------- cycling ---------------------------------- */

describe('cycling', () => {
  test('time groups: 1 s (UCI) or the meet\'s gap', () => {
    const rows = [row(1, { fin: 1, mark: 100 }), row(2, { fin: 2, mark: 102 })];
    assert.equal(roadTimes(rows).get('e2')!.time, 102);
    assert.equal(roadTimes(rows, { cycGap: 3 }).get('e2')!.time, 100);
    assert.equal(roadTimes(rows, { cycGap: 3 }).get('e2')!.st, true);
    assert.equal(rankEntries(rows, phaseDiscipline(D('cyc.rr'), R({ cycGap: 3 })))[1].bestText, 's.t.');
  });
  test('points per sprint and the final sprint', () => {
    const r: EntryResult = { spr: { 1: 1 }, fin: 1 };
    assert.equal(pointsTotal(r).total, 15);
    assert.equal(pointsTotal(r, { cycSprintPts: '3,2,1', cycFinishDouble: false }).total, 6);
    assert.match(pointsLine(r, { cycSprintPts: '3,2,1' }), /S1 3 · Finish 6 = 9/);
    assert.equal(sprintPoints(1, 3, 3, [3, 2, 1], false), 3);
    const PTS = D('cyc.points');
    const two = [row(1, { spr: { 1: 1 }, fin: 4 }), row(2, { spr: { 1: 4 }, fin: 1 })];
    // UCI: e1 5 + 2 = 7, e2 1 + 10 = 11 → e2 · 3-2-1 single finish: e1 3 + 0 = 3, e2 0 + 3 = 3 → final sprint order e2
    assert.equal(rankEntries(two, PTS)[0].id, 'e2');
    assert.deepEqual(rankEntries(two, phaseDiscipline(PTS, R({ cycSprintPts: '3,2,1', cycFinishDouble: false }))).map((x) => x.best), [3, 3]);
  });
  test('equal GC times: ITT hundredths first (UCI) or stage places', () => {
    const STG = D('cyc.stage');
    const s1 = [row(1, { fin: 1, mark: 3600, bonus: 10 }), row(2, { fin: 2, bonus: 6 }), row(3, { fin: 3, mark: 3610 })];
    const gc = (id: string) => stageFinishers(s1).find((x) => x.id === id)!.gc;
    const s2 = [row(1, { mark: 600.30, gc: gc('e1') }), row(2, { mark: 596.65, gc: gc('e2') }), row(3, { mark: 590.10, gc: gc('e3') })];
    const t = stageTimes(s2);
    assert.equal(gcAfter(s2[0], t.get('e1'))!.time, gcAfter(s2[1], t.get('e2'))!.time);
    assert.equal(rankEntries(s2, STG)[0].id, 'e1');
    assert.equal(rankEntries(s2, phaseDiscipline(STG, R({ cycGcTie: 'places' })))[0].id, 'e2');
    assert.equal(stageFinishers(s2, { cycGcTie: 'places' })[0].id, 'e2');
    assert.equal(rankStage(s2, { cycGap: 0 }).length, 3);
  });
});

/* ------------------------------- rowing / canoe ------------------------------- */

describe('rowing / canoe lanes after the first round', () => {
  test('best in the centre (default) or lane 1 upwards', () => {
    const K1 = D('cs.k1.500');
    const plan = heatsToFinalsPlan(12, 9);
    const heats = Array.from({ length: 12 }, (_, i) => ({ id: `e${i + 1}`, athleteId: `p${i + 1}`, name: `Boat ${i + 1}`, heat: i % 2 ? 2 : 1, result: { mark: 110 + i } }));
    const base = { phaseNo: 1, phase: 'heat' as const, progression: plan[0].progression };
    const centre = advanceCrews(rankByHeat(heats, K1), base, plan[1], 9).seeded.filter((s) => s.race === 'A');
    assert.deepEqual(centre.slice(0, 2).map((s) => s.lane), [5, 6]);
    const seq = advanceCrews(rankByHeat(heats, K1), { ...base, rules: { crewLanes: 'sequential' } }, plan[1], 9).seeded.filter((s) => s.race === 'A');
    assert.deepEqual(seq.slice(0, 2).map((s) => s.lane), [1, 2]);
  });
});
