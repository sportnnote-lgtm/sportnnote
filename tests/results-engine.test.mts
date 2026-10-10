/**
 * SD-28 — the results engine for timed / measured events (src/data/results).
 * Proves the model on: athletics 100 m heats → final with wind, long jump
 * (3 + 3 for the top 8, countback), high jump (O / X / –, jump-off), 4 × 100 m
 * relay, swimming 50 m (ties stand), weightlifting (lifted first), archery /
 * shooting (10s / X, shoot-off); statuses; Q / q; PB / SB / records; wind
 * legality; medals and position points into the medal table.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  disciplineOf, formatMark, parseMark, rankEntries, rankByHeat, qualify, withQualification, nextRound,
  fieldFinalists, attemptOrder, firstRoundsDone, summarizeHeights, addTry, summarizeLifts, liftProgressionError,
  withRecordFlags, updateRecords, personalBests, eventAwards, planRounds, laneOrder, seedHeats, fieldStatusFor,
  toResultEntry, phaseOf, sharedPositions, topNAndTies, categoryKey,
  type DisciplineDef, type ResultEntry, type EntryResult, type RankedEntry, type RecordMark, type MarkHistory,
} from '../src/data/results/index.ts';
import { medalStandings } from '../src/data/medalStandings.ts';
import type { FieldEntry } from '../src/core/types.ts';

const D = (k: string): DisciplineDef => { const d = disciplineOf(k); assert.ok(d, k); return d!; };
const M100 = D('ath.100m'), LJ = D('ath.lj'), HJ = D('ath.hj'), R4 = D('ath.4x100'), S50 = D('swim.50free');
const WL = D('wl.total'), ARCH = D('arch.720'), SHOOT = D('shoot.10mar');

let seq = 0;
const en = (name: string, result: EntryResult, heat = 1, team?: string): ResultEntry =>
  ({ id: `${name}`, athleteId: `p-${name}`, name, heat, result, team: team ? { name: team } : undefined, ...(seq++ ? {} : {}) });
const labels = (rows: RankedEntry[]) => rows.map((r) => `${r.label}:${r.id}`);

/* --------------------------------- marks --------------------------------- */

describe('marks: parse and format by unit', () => {
  test('times: seconds, m:ss.cc, h:mm:ss.cc, "1.52.34"', () => {
    assert.deepEqual(parseMark('10.85', M100), { mark: 10.85 });
    assert.deepEqual(parseMark('1:52.34', M100), { mark: 112.34 });
    assert.deepEqual(parseMark('1.52.34', M100), { mark: 112.34 });
    assert.equal(parseMark('1:02:03.45', M100)?.mark, 3723.45);
    assert.equal(formatMark(112.34, M100), '1:52.34');
    assert.equal(formatMark(3723.45, M100), '1:02:03.45');
    assert.equal(formatMark(9.5, M100), '9.50');
    assert.equal(parseMark('1:75.00', M100), null);
    assert.equal(parseMark('abc', M100), null);
    assert.equal(parseMark('0', M100), null);
  });
  test('a photo-finish thousandth rounds UP to the hundredth and is kept for ties', () => {
    assert.deepEqual(parseMark('10.851', M100), { mark: 10.86, thousandths: 10.851 });
    assert.deepEqual(parseMark('10.850', M100), { mark: 10.85, thousandths: 10.85 });
  });
  test('distances are measured down to the centimetre; comma decimals accepted', () => {
    assert.deepEqual(parseMark('6.457', LJ), { mark: 6.45 });
    assert.deepEqual(parseMark('6,45', LJ), { mark: 6.45 });
    assert.equal(formatMark(6.4, LJ), '6.40');
  });
});

/* ------------------------------ 100 m heats ------------------------------ */

describe('athletics 100 m: heats → final, wind, statuses, Q / q', () => {
  // 12 entrants → 2 heats of 6, final of 8: first 3 of each heat Q + 2 fastest q.
  test('planRounds gives heats (3 Q + 2 q) → final', () => {
    assert.deepEqual(planRounds(M100, 12), [{ phase: 'heat', heats: 2, progression: { byPlace: 3, byMark: 2 } }, { phase: 'final', heats: 1 }]);
    assert.deepEqual(planRounds(M100, 8), [{ phase: 'final', heats: 1 }]);
    assert.equal(planRounds(M100, 40).length, 3); // 5 heats → semis → final
    assert.deepEqual(planRounds(LJ, 30), [{ phase: 'final', heats: 1 }]);
  });

  const h1 = [
    en('A', { mark: 11.02, wind: 1.2, lane: 4 }, 1), en('B', { mark: 11.20, wind: 1.2, lane: 5 }, 1),
    en('C', { mark: 11.35, wind: 1.2, lane: 3 }, 1), en('D', { mark: 11.36, wind: 1.2, lane: 6 }, 1),
    en('E', { status: 'FS', ruleRef: 'TR 16.8', lane: 7 }, 1), en('F', { status: 'DNS', lane: 2 }, 1),
  ];
  const h2 = [
    en('G', { mark: 10.95, wind: 2.6, lane: 4 }, 2), en('H', { mark: 11.10, wind: 2.6, lane: 5 }, 2),
    en('I', { mark: 11.40, wind: 2.6, lane: 3 }, 2), en('J', { mark: 11.36, thousandths: 11.357, wind: 2.6, lane: 6 }, 2),
    en('K', { status: 'DNF', lane: 7 }, 2), en('L', { status: 'DQ', ruleRef: 'TR 17.3', lane: 2 }, 2),
  ];
  const byHeat = rankByHeat([...h1, ...h2], M100);

  test('each heat ranks by time; statuses below in the order NM, DNF, FS, DQ, WD, DNS', () => {
    assert.deepEqual(labels(byHeat.get(1)!), ['1:A', '2:B', '3:C', '4:D', 'FS:E', 'DNS:F']);
    assert.deepEqual(labels(byHeat.get(2)!), ['1:G', '2:H', '3:J', '4:I', 'DNF:K', 'DQ:L']);
    assert.equal(byHeat.get(1)!.find((r) => r.id === 'E')!.entry.result.ruleRef, 'TR 16.8');
    // a heat's wind doesn't flag the athletes without a mark
    const k = rankEntries([en('K', { status: 'DNF', wind: 2.6 })], M100)[0];
    assert.deepEqual(k.flags, []);
  });

  test('wind: +2.6 is aided (w) — still ranks, but not record-legal; +1.2 legal', () => {
    const g = byHeat.get(2)![0];
    assert.equal(g.bestText, '10.95');
    assert.ok(g.flags.includes('w'));
    assert.equal(g.legal, false);
    assert.equal(g.bestLegal, null);
    const a = byHeat.get(1)![0];
    assert.equal(a.legal, true);
    assert.equal(a.bestLegal, 11.02);
  });

  test('a hand time is flagged h and is not record-legal', () => {
    const [r] = rankEntries([en('Z', { mark: 11.1, wind: 0.5, hand: true })], M100);
    assert.deepEqual(r.flags, ['h']);
    assert.equal(r.legal, false);
  });

  test('a race with no wind reading is not record-legal (wind events)', () => {
    const [r] = rankEntries([en('Z', { mark: 11.1 })], M100);
    assert.equal(r.legal, false);
    const [r400] = rankEntries([en('Z', { mark: 51.1 })], D('ath.400m'));
    assert.equal(r400.legal, true);
  });

  test('Q by place, q by time across heats; thousandths separate the q line', () => {
    const q = qualify(byHeat, M100, { byPlace: 3, byMark: 2 });
    const Q = [...q.marks].filter(([, v]) => v === 'Q').map(([k]) => k).sort();
    const qq = [...q.marks].filter(([, v]) => v === 'q').map(([k]) => k).sort();
    assert.deepEqual(Q, ['A', 'B', 'C', 'G', 'H', 'J']);
    // D (11.36) and I (11.40) are the fastest losers.
    assert.deepEqual(qq, ['D', 'I']);
    assert.deepEqual(q.tieAtLine, []);
    const flagged = withQualification(byHeat.get(1)!, q);
    assert.deepEqual(flagged.map((r) => r.flags[0] ?? ''), ['Q', 'Q', 'Q', 'q', '', '']);
  });

  test('a tie for the last q spot takes both through and is reported', () => {
    const rows = rankByHeat([
      en('a', { mark: 11.0 }, 1), en('b', { mark: 11.5 }, 1),
      en('c', { mark: 11.1 }, 2), en('d', { mark: 11.5 }, 2), en('e', { mark: 11.9 }, 2),
    ], S50);
    const q = qualify(rows, S50, { byPlace: 1, byMark: 1 });
    assert.deepEqual([...q.marks.keys()].sort(), ['a', 'b', 'c', 'd']);
    assert.deepEqual(q.tieAtLine.sort(), ['b', 'd']);
  });

  test('photo finish: equal hundredths split by thousandths only when both have them', () => {
    const rows = rankEntries([en('x', { mark: 11.36, thousandths: 11.357 }), en('y', { mark: 11.36, thousandths: 11.352 }), en('z', { mark: 11.36 })], M100);
    // z has no reading → the thousandths can't separate this group: all tie.
    assert.deepEqual(rows.map((r) => r.label), ['=1', '=1', '=1']);
    // with readings for all three, they separate
    const all = rankEntries([en('x', { mark: 11.36, thousandths: 11.357 }), en('y', { mark: 11.36, thousandths: 11.352 }), en('z', { mark: 11.36, thousandths: 11.36 })], M100);
    assert.deepEqual(labels(all), ['1:y', '2:x', '3:z']);
  });

  test('the final start list: Q by heat place then time, q after; lanes 3–6 for the top 4', () => {
    const q = qualify(byHeat, M100, { byPlace: 3, byMark: 2 });
    const seeded = nextRound(byHeat, M100, q, 1);
    assert.equal(seeded.length, 8);
    // heat winners first (G 10.95 before A 11.02), then the 2nds, …
    assert.deepEqual(seeded.map((s) => s.id), ['G', 'A', 'H', 'B', 'C', 'J', 'D', 'I']);
    assert.deepEqual(seeded.map((s) => s.lane), [4, 5, 3, 6, 7, 8, 2, 1]);
    assert.ok(seeded.every((s) => s.heat === 1));
  });

  test('the final ranks, with medals and 8-7-6… points', () => {
    const fin = rankEntries([
      en('G', { mark: 10.90, wind: 0.4, lane: 4 }, 1, 'Red'), en('A', { mark: 10.98, wind: 0.4, lane: 5 }, 1, 'Blue'),
      en('H', { mark: 10.98, wind: 0.4, lane: 3 }, 1, 'Red'), en('B', { mark: 11.15, wind: 0.4, lane: 6 }, 1, 'Green'),
    ], M100);
    assert.deepEqual(labels(fin), ['1:G', '=2:H', '=2:A', '4:B']); // equal: listed by lane
    const aw = eventAwards(fin);
    assert.deepEqual(aw.map((a) => [a.entryId, a.medal, a.points]), [['G', 'gold', 8], ['H', 'silver', 6.5], ['A', 'silver', 6.5], ['B', undefined, 5]]);
    const full = eventAwards(fin, { positionPoints: [5, 3, 1], ties: 'full' });
    assert.deepEqual(full.map((a) => a.points), [5, 3, 3, 0]);
  });
});

/* ------------------------------- long jump ------------------------------- */

const jumps = (...marks: (number | 'X' | '-')[]): EntryResult['attempts'] =>
  marks.map((m) => (m === 'X' ? { foul: true } : m === '-' ? { pass: true } : { mark: m, wind: 1.0 }));

describe('long jump: 3 + 3 for the top 8, countback, wind per attempt', () => {
  const field = [
    en('a', { order: 1, attempts: jumps(6.10, 6.20, 'X') }), en('b', { order: 2, attempts: jumps(6.20, 6.05, 6.00) }),
    en('c', { order: 3, attempts: jumps(5.90, 'X', 5.80) }), en('d', { order: 4, attempts: jumps(5.70, 5.60, '-') }),
    en('e', { order: 5, attempts: jumps(5.50, 'X', 'X') }), en('f', { order: 6, attempts: jumps(5.40, 5.30, 5.20) }),
    en('g', { order: 7, attempts: jumps(5.30, 5.40, 5.10) }), en('h', { order: 8, attempts: jumps(5.30, 5.25, 'X') }),
    en('i', { order: 9, attempts: jumps(5.30, 5.25, 'X') }), en('j', { order: 10, attempts: jumps('X', 'X', 'X') }),
  ];

  test('countback on the next-best mark: a (6.20, 6.10) beats b (6.20, 6.05)', () => {
    const rows = rankEntries(field, LJ);
    assert.deepEqual(rows.slice(0, 2).map((r) => r.id), ['a', 'b']);
    assert.equal(rows[0].position, 1);
    assert.equal(rows[1].position, 2);
  });

  test('f (5.40, 5.30, 5.20) beats g (5.40, 5.30, 5.10) on the third mark; h = i tie stands', () => {
    const rows = rankEntries(field, LJ);
    const pos = Object.fromEntries(rows.map((r) => [r.id, r.label]));
    assert.equal(pos.f, '6');
    assert.equal(pos.g, '7');
    assert.equal(pos.h, '=8');
    assert.equal(pos.i, '=8');
    assert.equal(pos.j, 'NM');
  });

  test('top 8 after three rounds — plus the tie for 8th — get three more', () => {
    assert.ok(firstRoundsDone(field, LJ));
    const fin = fieldFinalists(field, LJ);
    assert.deepEqual([...fin].sort(), ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']);
    assert.ok(!fin.has('j'));
    // ≤ 8 athletes: everyone who started continues.
    assert.equal(fieldFinalists(field.slice(0, 5), LJ).size, 5);
  });

  test('rounds 4–6 run in reverse order of the standings after 3 (leader last)', () => {
    assert.deepEqual(attemptOrder(field, LJ, 1).map((e) => e.id), ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']);
    const r4 = attemptOrder(field, LJ, 4).map((e) => e.id);
    assert.equal(r4[r4.length - 1], 'a');
    assert.equal(r4[0], 'i'); // =8th, later in the start order, jumps first
    assert.ok(!r4.includes('j'));
  });

  test('ranking after 3 only counts the first three attempts', () => {
    const late = [en('p', { attempts: jumps(5.0, 5.0, 5.0, 7.0) }), en('q', { attempts: jumps(6.0, 'X', 'X') })];
    assert.deepEqual(rankEntries(late, LJ, { upToAttempt: 3 }).map((r) => r.id), ['q', 'p']);
    assert.deepEqual(rankEntries(late, LJ).map((r) => r.id), ['p', 'q']);
  });

  test('a wind-aided best still ranks; its best LEGAL mark is what PB / records use', () => {
    const [r] = rankEntries([en('w', { attempts: [{ mark: 6.50, wind: 2.4 }, { mark: 6.30, wind: 1.9 }] })], LJ);
    assert.equal(r.best, 6.5);
    assert.equal(r.wind, 2.4);
    assert.ok(r.flags.includes('w'));
    assert.equal(r.bestLegal, 6.3);
    // exactly +2.0 is legal
    const [ok] = rankEntries([en('w', { attempts: [{ mark: 6.5, wind: 2.0 }] })], LJ);
    assert.equal(ok.bestLegal, 6.5);
    // throws have no gauge: every mark is legal
    const [sp] = rankEntries([en('s', { attempts: [{ mark: 12.34 }] })], D('ath.sp'));
    assert.equal(sp.bestLegal, 12.34);
  });

  test('three fouls = NM; still competing = no label yet', () => {
    const rows = rankEntries([en('x', { attempts: jumps('X', 'X', 'X') }), en('y', { attempts: jumps('X') })], LJ);
    assert.deepEqual(labels(rows), [':y', 'NM:x']);
  });
});

/* ------------------------------- high jump ------------------------------- */

describe('high jump: O / X / –, failures countback, jump-off', () => {
  const H = (...p: [number, string][]) => ({ heights: p.map(([height, tries]) => ({ height, tries })) });
  test('summary: best clearance, failures at it, total failures, elimination', () => {
    assert.deepEqual(summarizeHeights(H([1.50, 'O'], [1.55, 'XO'], [1.60, 'XXX']).heights), { best: 1.55, failsAtBest: 1, totalFails: 1, eliminated: true });
    // failures carry across a pass: X- then XX = three in a row
    assert.equal(summarizeHeights(H([1.50, 'O'], [1.55, 'X-'], [1.60, 'XX']).heights).eliminated, true);
    assert.equal(addTry('XX', 'O'), 'XXO');
    assert.equal(addTry('XXO', 'X'), 'XXO');
    assert.equal(addTry('X', '-'), 'X-');
  });

  test('TR 26.8: fewer failures at the tie height, then fewer in total; jump-off flag for 1st', () => {
    const rows = rankEntries([
      en('a', H([1.50, 'O'], [1.55, 'XO'], [1.60, 'XXX'])),
      en('b', H([1.50, 'XO'], [1.55, 'O'], [1.60, 'XXX'])),
      en('c', H([1.50, 'O'], [1.55, 'O'], [1.60, 'XXX'])),
      en('d', H([1.50, 'XXX'])),
      en('e', H([1.50, 'XO'], [1.55, 'XXO'], [1.60, 'XXX'])),
    ], HJ);
    // c: 0 at 1.55; a and b: 1 failure total each (a at 1.55 → worse at the tie height)
    assert.deepEqual(labels(rows), ['1:c', '2:b', '3:a', '4:e', 'NM:d']);
    const tie = rankEntries([en('x', H([1.50, 'O'], [1.55, 'XO'])), en('y', H([1.50, 'O'], [1.55, 'XO']))], HJ);
    assert.deepEqual(tie.map((r) => [r.label, r.needsDecider, r.flags.includes('JO')]), [['=1', true, true], ['=1', true, true]]);
    const decided = rankEntries([en('x', { ...H([1.50, 'O'], [1.55, 'XO']), decider: 2 }), en('y', { ...H([1.50, 'O'], [1.55, 'XO']), decider: 1 })], HJ);
    assert.deepEqual(labels(decided), ['1:y', '2:x']);
    // a tie below 1st place stands (no jump-off)
    const third = rankEntries([en('w', H([1.60, 'O'])), en('x', H([1.50, 'O'], [1.55, 'XO'])), en('y', H([1.50, 'O'], [1.55, 'XO']))], HJ);
    assert.deepEqual(third.map((r) => [r.label, !!r.needsDecider]), [['1', false], ['=2', false], ['=2', false]]);
    assert.equal(formatMark(1.6, HJ), '1.60');
  });
});

/* ------------------------------ 4 × 100 relay ---------------------------- */

describe('4 × 100 m relay: team entries with members, team medals', () => {
  const relay = (team: string, result: EntryResult): ResultEntry => ({
    id: `r-${team}`, name: `${team} A`, team: { name: team, id: `t-${team}` }, heat: 1,
    result: { ...result, members: ['1', '2', '3', '4'].map((n) => ({ name: `${team} ${n}` })) },
  });
  test('ranks teams; a changeover DQ with its rule; medals go to the team', () => {
    const rows = rankEntries([
      relay('Red', { mark: 47.80, lane: 4 }), relay('Blue', { mark: 48.12, lane: 5 }),
      relay('Green', { status: 'DQ', ruleRef: 'TR 24.7', lane: 3 }), relay('Yellow', { mark: 49.00, lane: 6 }),
    ], R4);
    assert.deepEqual(labels(rows), ['1:r-Red', '2:r-Blue', '3:r-Yellow', 'DQ:r-Green']);
    assert.equal(rows[0].entry.result.members?.length, R4.teamSize);
    assert.equal(rows[0].entry.athleteId, undefined);
    const aw = eventAwards(rows, { positionPoints: [5, 3, 1] });
    assert.deepEqual(aw.map((a) => [a.team?.name, a.medal, a.points]), [['Red', 'gold', 5], ['Blue', 'silver', 3], ['Yellow', 'bronze', 1]]);
  });

  test('a stored team-only row (no player) maps to a relay entry', () => {
    const fe: FieldEntry = { id: 'fe1', eventId: 'ev', playerId: '', teamId: 't-red', groupNo: 2, status: 'finished', result: { mark: 47.8, team: { id: 't-red', name: 'Red House' }, name: 'Red House A' } };
    const e = toResultEntry(fe, () => 'x');
    assert.equal(e.name, 'Red House A');
    assert.equal(e.athleteId, undefined);
    assert.equal(e.heat, 2);
    assert.equal(e.team?.name, 'Red House');
  });
});

/* ------------------------------- swimming -------------------------------- */

describe('swimming 50 m: hundredths, ties stand', () => {
  test('equal hundredths share the place even with thousandths entered', () => {
    const rows = rankEntries([
      en('a', { mark: 27.10, lane: 4 }), en('b', { mark: 27.45, thousandths: 27.441, lane: 5 }),
      en('c', { mark: 27.45, thousandths: 27.449, lane: 3 }), en('d', { mark: 28.00, lane: 6 }), en('e', { status: 'DQ', ruleRef: 'SW 7.6', lane: 2 }),
    ], S50);
    assert.deepEqual(labels(rows), ['1:a', '=2:c', '=2:b', '4:d', 'DQ:e']);
    const aw = eventAwards(rows);
    assert.deepEqual(aw.map((a) => a.medal), ['gold', 'silver', 'silver', undefined]);
  });
});

/* ----------------------------- weightlifting ----------------------------- */

describe('weightlifting: total, lifted first, bomb-out', () => {
  const L = (kg: number, good: boolean, s: number) => ({ kg, good, seq: s });
  test('total = best snatch + best C&J; equal totals → whoever reached it first', () => {
    const a = en('a', { lifts: { snatch: [L(80, true, 1), L(85, false, 4)], cj: [L(100, true, 10), L(105, true, 14)] } });
    const b = en('b', { lifts: { snatch: [L(82, true, 2), L(85, true, 5)], cj: [L(100, true, 9), L(105, false, 13), L(105, false, 16)] } });
    const c = en('c', { lifts: { snatch: [L(70, false, 3), L(70, false, 6), L(70, false, 7)], cj: [L(110, true, 11)] } });
    assert.deepEqual(summarizeLifts(a.result.lifts), { snatch: 80, cj: 105, total: 185, totalSeq: 14, bombedOut: false });
    assert.equal(summarizeLifts(b.result.lifts).totalSeq, 9);
    const rows = rankEntries([a, b, c], WL);
    // both 185: b's total stood after lift #9, a's only after #14 → b first.
    assert.deepEqual(labels(rows), ['1:b', '2:a', 'NM:c']);
    assert.equal(rows[0].bestText, '185');
  });
  test('the next attempt can not be lighter', () => {
    assert.equal(liftProgressionError([{ kg: 80 }, { kg: 85 }]), null);
    assert.match(liftProgressionError([{ kg: 85 }, { kg: 80 }])!, /lighter/);
  });
});

/* --------------------------- archery / shooting -------------------------- */

describe('archery / shooting: 10s then X (inner tens), shoot-off', () => {
  test('archery: score, then 10s, then Xs; an unresolved medal tie needs a shoot-off', () => {
    const rows = rankEntries([
      en('a', { mark: 650, tens: 20, xs: 8 }), en('b', { mark: 650, tens: 22, xs: 5 }),
      en('c', { mark: 650, tens: 20, xs: 9 }), en('d', { mark: 640, tens: 30, xs: 10 }), en('e', { mark: 640, tens: 30, xs: 10 }),
    ], ARCH);
    assert.deepEqual(labels(rows), ['1:b', '2:c', '3:a', '=4:d', '=4:e']);
    assert.ok(rows.every((r) => !r.needsDecider)); // =4th stands
    const medalTie = rankEntries([en('x', { mark: 600, tens: 10, xs: 2 }), en('y', { mark: 600, tens: 10, xs: 2 })], ARCH);
    assert.deepEqual(medalTie.map((r) => [r.label, r.flags]), [['=1', ['SO']], ['=1', ['SO']]]);
    const so = rankEntries([en('x', { mark: 600, tens: 10, xs: 2, decider: 2 }), en('y', { mark: 600, tens: 10, xs: 2, decider: 1 })], ARCH);
    assert.deepEqual(labels(so), ['1:y', '2:x']);
  });
  test('shooting: decimal totals at 0.1; SD-96 (ISSF): equal decimal totals → the last series back, not inner tens', () => {
    const rows = rankEntries([en('a', { mark: 628.4, series: [314.2, 314.2] }), en('b', { mark: 628.4, series: [314.0, 314.4] }), en('c', { mark: 629.0, tens: 30 })], SHOOT);
    assert.deepEqual(labels(rows), ['1:c', '2:b', '3:a']);
    assert.equal(rows[0].bestText, '629.0');
  });
});

/* -------------------------- records / PB / SB ---------------------------- */

describe('PB / SB / meet & school records', () => {
  const hist: MarkHistory[] = [
    { athleteId: 'p-a', discipline: 'ath.100m', value: 11.30, date: '2025-11-01' },
    { athleteId: 'p-a', discipline: 'ath.100m', value: 11.10, date: '2026-04-01' },
    { athleteId: 'p-b', discipline: 'ath.100m', value: 11.00, date: '2025-05-01' },
    { athleteId: 'p-b', discipline: 'ath.100m', value: 11.40, date: '2026-07-01' },
    { athleteId: 'p-c', discipline: 'ath.100m', value: 11.20, date: '2026-06-01' },
    { athleteId: 'p-d', discipline: 'ath.100m', value: 11.00, date: '2025-05-01' },
  ];
  const cat = categoryKey({ age: 'U17', gender: 'M' });
  const records: RecordMark[] = [
    { scope: 'MR', discipline: 'ath.100m', category: cat, value: 11.05, holder: 'Old' },
    { scope: 'SR', discipline: 'ath.100m', category: cat, value: 10.95, holder: 'Older' },
  ];
  const ctx = { history: hist, records, category: cat, seasonFrom: '2026-01-01' };
  const final = rankEntries([
    en('a', { mark: 11.05, wind: 1.0 }), // PB (11.10 → 11.05), =MR
    en('b', { mark: 11.20, wind: 1.0 }), // SB (season 11.40), not PB (11.00)
    en('c', { mark: 11.20, wind: 1.0 }), // =PB
    en('d', { mark: 11.30, wind: 1.0 }), // first mark of the season → SB
    en('e', { mark: 11.50, wind: 1.0 }), // no history → nothing
  ], M100);

  test('flags: PB, =PB, SB, =MR', () => {
    const f = Object.fromEntries(withRecordFlags(final, M100, ctx).map((r) => [r.id, r.flags]));
    assert.deepEqual(f.a, ['=MR', 'PB']);
    assert.deepEqual(f.b, ['SB']);
    assert.deepEqual(f.c, ['=PB']);
    assert.deepEqual(f.d, ['SB']);
    assert.deepEqual(f.e, []);
    assert.deepEqual(personalBests(hist, 'p-a', M100, '2026-01-01'), { pb: 11.10, sb: 11.10 });
  });

  test('a new meet record (only the event best), and a school record', () => {
    const rows = rankEntries([en('a', { mark: 10.90, wind: 0.5 }), en('b', { mark: 11.00, wind: 0.5 })], M100);
    const f = Object.fromEntries(withRecordFlags(rows, M100, ctx).map((r) => [r.id, r.flags]));
    assert.ok(f.a.includes('MR') && f.a.includes('SR'));
    assert.ok(!f.b.includes('MR'));
    const book = updateRecords(rows, M100, cat, records, '2026-10-10', ['MR', 'SR']);
    assert.deepEqual(book.map((r) => [r.scope, r.value, r.holder]).sort(), [['MR', 10.9, 'a'], ['SR', 10.9, 'a']]);
  });

  test('wind-aided marks never set a PB or record', () => {
    const rows = rankEntries([en('a', { mark: 10.80, wind: 2.1 })], M100);
    const [r] = withRecordFlags(rows, M100, ctx);
    assert.deepEqual(r.flags, ['w']);
    assert.deepEqual(updateRecords(rows, M100, cat, records, '2026-10-10'), records);
  });

  test('the event that set a record shows MR on its own sheet, others equalling it show =MR', () => {
    const rows = rankEntries([en('a', { mark: 10.90, wind: 0.5 })], M100);
    const book = updateRecords(rows, M100, cat, records, '2026-10-10', ['MR'], 'ev1');
    assert.equal(book.find((r) => r.scope === 'MR')!.eventKey, 'ev1');
    assert.deepEqual(withRecordFlags(rows, M100, { ...ctx, records: book, eventKey: 'ev1' })[0].flags.filter((f) => f.endsWith('MR')), ['MR']);
    assert.deepEqual(withRecordFlags(rows, M100, { ...ctx, records: book, eventKey: 'ev2' })[0].flags.filter((f) => f.endsWith('MR')), ['=MR']);
  });

  test('a meet with no record yet starts its book; equalling does not replace', () => {
    const rows = rankEntries([en('a', { mark: 11.05, wind: 0.5 })], M100);
    assert.deepEqual(updateRecords(rows, M100, 'U14-F', [], '2026-10-10').map((r) => [r.scope, r.value]), [['MR', 11.05]]);
    assert.deepEqual(updateRecords(rows, M100, cat, records, '2026-10-10'), records);
  });

  test('long jump records use the best LEGAL jump', () => {
    const rows = rankEntries([en('a', { attempts: [{ mark: 6.9, wind: 3.0 }, { mark: 6.5, wind: 1.0 }] })], LJ);
    const book = updateRecords(rows, LJ, cat, [{ scope: 'MR', discipline: 'ath.lj', category: cat, value: 6.6, holder: 'x' }], '2026-10-10');
    assert.equal(book[0].value, 6.6); // 6.90w doesn't count, 6.50 doesn't beat 6.60
  });
});

/* -------------------------- medal table integration ---------------------- */

describe('medals and position points feed the multi-sport medal table', () => {
  test('field results add medals + weighted points per contingent', () => {
    const fin = rankEntries([
      en('a', { mark: 11.0, wind: 1 }, 1, 'Red House'), en('b', { mark: 11.1, wind: 1 }, 1, 'Blue House'),
      en('c', { mark: 11.2, wind: 1 }, 1, 'Red House'), en('d', { mark: 11.3, wind: 1 }, 1, 'Green House'),
    ], M100);
    const lj = rankEntries([
      en('e', { attempts: jumps(6.0) }, 1, 'Blue House'), en('f', { attempts: jumps(5.5) }, 1, 'Green House'),
    ], LJ);
    const table = medalStandings([], [], { mode: 'position', positionPoints: [5, 3, 1], sportWeights: { athletics: 2 } as never }, undefined, [
      { sport: 'athletics', event: '100 m U17 Boys', awards: eventAwards(fin, { positionPoints: [5, 3, 1] }) },
      { sport: 'athletics', event: 'Long jump U17 Boys', awards: eventAwards(lj, { positionPoints: [5, 3, 1] }) },
    ]);
    const row = Object.fromEntries(table.map((r) => [r.name, [r.total, r.golds, r.silvers, r.bronzes]]));
    assert.deepEqual(row['Red House'], [12, 1, 0, 1]); // (5 + 1) × 2
    assert.deepEqual(row['Blue House'], [16, 1, 1, 0]); // (3 + 5) × 2
    assert.deepEqual(row['Green House'], [6, 0, 1, 0]); // (0 + 3) × 2
    assert.equal(table[0].name, 'Blue House');
    assert.equal(table.find((r) => r.name === 'Red House')!.perEvent!.length, 2);
  });
  test('without fieldResults the medal table is unchanged', () => {
    assert.deepEqual(medalStandings([], [], { mode: 'position' }), []);
  });
});

/* --------------------------- seeding / storage --------------------------- */

describe('seeding, lanes, storage mapping', () => {
  test('lane order: WA groups for 8 lanes, middle-out otherwise; a draw shuffles within groups', () => {
    assert.deepEqual(laneOrder(8), [4, 5, 3, 6, 7, 8, 2, 1]);
    assert.deepEqual(laneOrder(6), [3, 4, 2, 5, 1, 6]);
    let s = 1; const rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const drawn = laneOrder(8, rng);
    assert.deepEqual(drawn.slice(0, 4).sort(), [3, 4, 5, 6]);
    assert.deepEqual(drawn.slice(4, 6).sort(), [7, 8]);
    assert.deepEqual(drawn.slice(6).sort(), [1, 2]);
  });
  test('serpentine heats: 1-2-2-1 …', () => {
    const s = seedHeats(['a', 'b', 'c', 'd', 'e', 'f'], 2, M100);
    assert.deepEqual(s.filter((x) => x.heat === 1).map((x) => x.id), ['a', 'd', 'e']);
    assert.deepEqual(s.filter((x) => x.heat === 2).map((x) => x.id), ['b', 'c', 'f']);
    assert.ok(seedHeats(['a', 'b'], 1, LJ).every((x) => x.lane === undefined));
  });
  test('field_entries.status mapping keeps 0028\'s check values', () => {
    assert.equal(fieldStatusFor('ok', true), 'finished');
    assert.equal(fieldStatusFor(undefined, false), 'playing');
    assert.equal(fieldStatusFor('NM', false), 'dnf');
    assert.equal(fieldStatusFor('FS', false), 'dq');
    assert.equal(fieldStatusFor('DNS', false), 'wd');
  });
  test('phaseOf reads format.results; golf rounds are not results phases', () => {
    assert.equal(phaseOf({ roundNo: 1, format: { courseId: 'c1' } }), null);
    const p = phaseOf({ roundNo: 2, format: { results: { discipline: 'ath.100m', phase: 'final', heats: 1, eventKey: 'k' } } });
    assert.equal(p?.phaseNo, 2);
  });
});

/* ------------------------------ shared with golf ------------------------- */

describe('shared primitives (golf uses them)', () => {
  test('sharedPositions: 1, =2, =2, 4', () => {
    assert.deepEqual(sharedPositions([1, 2, 2, 3], (a, b) => a === b), [
      { position: 1, tie: false }, { position: 2, tie: true }, { position: 2, tie: true }, { position: 4, tie: false },
    ]);
  });
  test('topNAndTies: the N-th place and everyone level with it', () => {
    assert.deepEqual(topNAndTies([1, 2, 3, 3, 4], 3, (a, b) => a === b), [1, 2, 3, 3]);
    assert.deepEqual(topNAndTies([1, 2], 3, (a, b) => a === b), [1, 2]);
    assert.deepEqual(topNAndTies([1, 2], 0, (a, b) => a === b), []);
  });
});
