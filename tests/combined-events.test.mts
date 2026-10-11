/**
 * SD-93 athletics combined events: the World Athletics Scoring Tables for
 * Combined Events (coefficients checked against published world-record
 * series and single-mark values), hand-time conversion, the event lists,
 * standings with the TR 39.12 tie-break, abandon on DNS (TR 39.10) vs 0 points
 * for DNF / NM / DQ, the false-start rule, seeding by total, the record wind
 * rule, stat lines (individual PBs credited), the career, the medal table,
 * the record book and the schema.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  combinedPoints, COEFFS, COMBINED_PRESETS, presetOf, combinedKey, combinedEventOf, isCombinedKey, disciplineOf, phaseDiscipline,
  cellOf, combinedStandings, combinedAwards, combinedRanked, combinedSeed, combinedBar, nextCombinedFormat, continuing, falseStartAction,
  combinedEventLines, combinedLines, combinedWindLegal, combinedHeader, combinedText, combinedDone, combinedPhaseName, phaseNameOf,
  rankEntries, markKey, markKeyDiscipline, athleticsCareer, meetFieldResults, eventLeaders, deriveRecordBook, groupMeet, eventStatus,
  updateRecords, withRecordFlags, markRange, trialsFor,
  type PhaseFormat, type ResultEntry, type EntryResult, type CombinedPhaseInput, type MeetPhase, type CombinedTable,
} from '../src/data/results/index.ts';
import { STAT_SCHEMAS } from '../src/sports/statSchemas.ts';
import { validateSchema } from '../src/sports/statSchema.ts';

const P = (d: string, table: CombinedTable, mark: number, hand = false) => combinedPoints(`ath.${d}`, table, mark, { hand });

/* ------------------------------ the scoring tables ------------------------------ */

describe('scoring tables', () => {
  test('single-mark values (decathlon / heptathlon tables)', () => {
    assert.equal(P('100m', 'M', 10.0), 1096);
    assert.equal(P('lj', 'M', 8.0), 1061);
    assert.equal(P('hj', 'M', 2.0), 803);
    // the brief's expected 1115 / 1087 are not what the formula gives: the
    // published heptathlon values are 100 mH 13.00 = 1124 and 800 m 2:00.00 = 1116
    assert.equal(P('100mh', 'F', 13.0), 1124);
    assert.equal(P('800m', 'F', 120.0), 1116);
    // the round-number anchors of the tables
    assert.equal(P('800m', 'F', 127.63), 1000);
    assert.equal(P('1500m', 'M', 233.79), 1000);
    assert.equal(P('100mh', 'F', 13.85), 1000);
    assert.equal(P('400m', 'M', 46.17), 1000);
  });
  test('men’s decathlon world record — Mayer 9126 (Talence 2018)', () => {
    const s = [P('100m', 'M', 10.55), P('lj', 'M', 7.8), P('sp', 'M', 16.0), P('hj', 'M', 2.05), P('400m', 'M', 48.42),
      P('110mh', 'M', 13.75), P('dt', 'M', 50.54), P('pv', 'M', 5.45), P('jt', 'M', 71.9), P('1500m', 'M', 276.11)];
    assert.deepEqual(s, [963, 1010, 851, 850, 889, 1007, 882, 1051, 918, 705]);
    assert.equal(s.reduce((a, b) => a + b), 9126);
  });
  test('Eaton 9045 (Beijing 2015)', () => {
    const s = [P('100m', 'M', 10.23), P('lj', 'M', 7.88), P('sp', 'M', 14.52), P('hj', 'M', 2.01), P('400m', 'M', 45.0),
      P('110mh', 'M', 13.69), P('dt', 'M', 43.34), P('pv', 'M', 5.2), P('jt', 'M', 63.63), P('1500m', 'M', 257.52)];
    assert.equal(s.reduce((a, b) => a + b), 9045);
  });
  test('heptathlon world record — Joyner-Kersee 7291 (Seoul 1988)', () => {
    const s = [P('100mh', 'F', 12.69), P('hj', 'F', 1.86), P('sp', 'F', 15.8), P('200m', 'F', 22.56), P('lj', 'F', 7.27), P('jt', 'F', 45.66), P('800m', 'F', 128.51)];
    assert.deepEqual(s, [1172, 1054, 915, 1123, 1264, 776, 987]);
    assert.equal(s.reduce((a, b) => a + b), 7291);
  });
  test('indoor: heptathlon Eaton 6645, pentathlon Thiam 5055', () => {
    const hep = [P('60m', 'M', 6.79), P('lj', 'M', 8.16), P('sp', 'M', 14.56), P('hj', 'M', 2.03), P('60mh', 'M', 7.68), P('pv', 'M', 5.2), P('1000m', 'M', 152.77)];
    assert.equal(hep.reduce((a, b) => a + b), 6645);
    const pen = [P('60mh', 'F', 8.23), P('hj', 'F', 1.92), P('sp', 'F', 15.54), P('lj', 'F', 6.59), P('800m', 'F', 133.6)];
    assert.equal(pen.reduce((a, b) => a + b), 5055);
  });
  test('women’s decathlon world record — Skujytė 8358 (Columbia 2005)', () => {
    const s = [P('100m', 'F', 12.49), P('lj', 'F', 6.12), P('sp', 'F', 16.42), P('hj', 'F', 1.78), P('400m', 'F', 57.19),
      P('100mh', 'F', 14.22), P('dt', 'F', 46.19), P('pv', 'F', 3.1), P('jt', 'F', 48.78), P('1500m', 'F', 315.86)];
    assert.equal(s.reduce((a, b) => a + b), 8358);
  });
  test('off the table and unknown events score 0; hand times are converted first', () => {
    assert.equal(P('100m', 'M', 18.5), 0);
    assert.equal(P('lj', 'M', 2.1), 0);
    assert.equal(P('200m', 'M', 22.0), 0); // the men's tables have no 200 m
    assert.equal(P('100m', 'M', 11.0, true), P('100m', 'M', 11.24));
    assert.equal(P('400m', 'M', 50.0, true), P('400m', 'M', 50.14));
    assert.equal(P('1500m', 'M', 280.0, true), P('1500m', 'M', 280.0));
    assert.ok(Object.keys(COEFFS.M).length >= 13 && Object.keys(COEFFS.F).length >= 13);
  });
});

/* ------------------------------ lists and keys ------------------------------ */

describe('event lists and the combined discipline', () => {
  test('presets follow TR 39 (decathlon, heptathlon, women’s decathlon, indoor)', () => {
    assert.deepEqual(presetOf('dec')!.events.M, ['ath.100m', 'ath.lj', 'ath.sp', 'ath.hj', 'ath.400m', 'ath.110mh', 'ath.dt', 'ath.pv', 'ath.jt', 'ath.1500m']);
    assert.deepEqual(presetOf('hep')!.events.F, ['ath.100mh', 'ath.hj', 'ath.sp', 'ath.200m', 'ath.lj', 'ath.jt', 'ath.800m']);
    assert.equal(presetOf('dec')!.day2!.M, 5);
    assert.equal(presetOf('hep')!.day2!.F, 4);
    assert.equal(presetOf('ipen')!.events.F!.length, 5);
    for (const p of COMBINED_PRESETS) for (const t of ['M', 'F'] as const) for (const d of p.events[t] ?? []) assert.ok(COEFFS[t][d], `${p.kind} ${t} ${d} is scorable`);
  });
  test('keys: a preset list → its key; a house list → its own key; parsed back to a points discipline', () => {
    assert.equal(combinedKey('dec', 'M', presetOf('dec')!.events.M!), 'ath.ce_dec');
    const house = ['ath.100m', 'ath.lj', 'ath.sp', 'ath.hj'];
    assert.equal(combinedKey('tet', 'M', house), 'ath.ce_x_100m_lj_sp_hj');
    const d = disciplineOf('ath.ce_x_100m_lj_sp_hj')!;
    assert.equal(d.label, 'Combined event (100 m, LJ, SP, HJ)');
    assert.equal(d.unit, 'points'); assert.equal(d.better, 'higher'); assert.equal(d.tie, 'combined');
    assert.equal(disciplineOf('ath.ce_dec')!.label, 'Decathlon');
    assert.equal(disciplineOf('ath.ce_pen')!.label, 'Pentathlon');
    assert.equal(combinedEventOf('ath.ce_x_100m_zz'), null);
    assert.ok(isCombinedKey('ath.ce_hep') && !isCombinedKey('ath.100m'));
    assert.equal(markKey('ath.ce_dec'), 'm_ce_dec');
    assert.equal(markKeyDiscipline('m_ce_dec').discipline, 'ath.ce_dec');
    for (const k of ['ath.60m', 'ath.60mh', 'ath.1000m']) { assert.ok(disciplineOf(k), k); assert.ok(markRange(k), k); }
  });
  test('three trials only in a combined event (no extra three for the top 8)', () => {
    const lj = disciplineOf('ath.lj')!;
    assert.equal(trialsFor(lj, 'final'), 6);
    const f = fmt('ath.lj', 1);
    assert.equal(trialsFor(phaseDiscipline(lj, f), 'final'), 3);
  });
  test('uniform bar raises: HJ +3 cm, PV +10 cm', () => {
    const hj = combinedBar('ath.hj', { age: 'Open', gender: 'M' })!;
    assert.equal(hj[0], 1.65);
    assert.ok(hj.slice(1).every((h, i) => Math.round((h - hj[i]) * 100) === 3));
    const pv = combinedBar('ath.pv', { age: 'U18', gender: 'F' })!;
    assert.ok(pv.slice(1).every((h, i) => Math.round((h - pv[i]) * 100) === 10));
    assert.equal(combinedBar('ath.lj', {}), undefined);
  });
});

/* ------------------------- a school pentathlon (5 girls) ------------------------- */

const PEN = presetOf('pen')!.events.F!; // 100 mH, HJ, SP, LJ, 800 m
const KEY = combinedKey('pen', 'F', PEN);
function fmt(discipline: string, phaseNo: number, extra: Partial<PhaseFormat> = {}): PhaseFormat {
  const events = discipline === 'ath.lj' && phaseNo === 1 ? ['ath.lj', 'ath.sp'] : PEN;
  return {
    discipline, phase: 'final', phaseNo, heats: 1, eventKey: 'pen1', eventTitle: 'Pentathlon U16 Girls', category: { age: 'U16', gender: 'F' },
    combined: { key: KEY, table: 'F', events, index: events.indexOf(discipline) }, ...extra,
  };
}
const GIRLS = [['g1', 'Asha'], ['g2', 'Bina'], ['g3', 'Chitra'], ['g4', 'Divya'], ['g5', 'Esha']] as const;
const HOUSES = ['Red', 'Blue', 'Green', 'Red', 'Blue'];
const row = (i: number, ph: number, result: EntryResult): ResultEntry => ({ id: `e${ph}-${i}`, athleteId: GIRLS[i][0], name: GIRLS[i][1], heat: 1, team: { id: `t${HOUSES[i]}`, name: `${HOUSES[i]} House` }, result });
const HJ_BAR = [1.2, 1.23, 1.26, 1.29, 1.32, 1.35];

function pentathlon(upTo = 5): CombinedPhaseInput[] {
  const phases: CombinedPhaseInput[] = [];
  // 1. 100 m hurdles (Esha DNF — 0 points, carries on)
  phases.push({ format: fmt('ath.100mh', 1), status: 'completed', entries: [
    row(0, 1, { mark: 15.8, wind: 1.2 }), row(1, 1, { mark: 16.4, wind: 1.2 }), row(2, 1, { mark: 17.1, wind: 1.2 }), row(3, 1, { mark: 16.0, wind: 1.2 }), row(4, 1, { status: 'DNF', wind: 1.2 }),
  ] });
  // 2. high jump (Chitra: no height — NM, 0 points)
  if (upTo >= 2) phases.push({ format: fmt('ath.hj', 2, { bar: HJ_BAR }), status: 'completed', entries: [
    row(0, 2, { heights: [{ height: 1.2, tries: 'O' }, { height: 1.23, tries: 'O' }, { height: 1.26, tries: 'XO' }, { height: 1.29, tries: 'XXX' }] }),
    row(1, 2, { heights: [{ height: 1.2, tries: 'O' }, { height: 1.23, tries: 'XXX' }] }),
    row(2, 2, { heights: [{ height: 1.2, tries: 'XXX' }] }),
    row(3, 2, { heights: [{ height: 1.2, tries: 'O' }, { height: 1.23, tries: 'O' }, { height: 1.26, tries: 'O' }, { height: 1.29, tries: 'XXX' }] }),
    row(4, 2, { heights: [{ height: 1.2, tries: 'XO' }, { height: 1.23, tries: 'XXX' }] }),
  ] });
  // 3. shot (3 kg) — Bina does not start: she has abandoned (TR 39.10)
  if (upTo >= 3) phases.push({ format: fmt('ath.sp', 3), status: 'completed', entries: [
    row(0, 3, { attempts: [{ mark: 8.1 }, { foul: true }, { mark: 8.4 }] }), row(1, 3, { status: 'DNS' }),
    row(2, 3, { attempts: [{ mark: 9.6 }, { mark: 9.9 }, { mark: 9.5 }] }), row(3, 3, { attempts: [{ mark: 7.8 }, { mark: 7.95 }, { foul: true }] }),
    row(4, 3, { attempts: [{ mark: 10.2 }, { foul: true }, { foul: true }] }),
  ] });
  if (upTo >= 4) phases.push({ format: fmt('ath.lj', 4), status: 'completed', entries: [
    row(0, 4, { attempts: [{ mark: 4.6, wind: 1.0 }, { mark: 4.71, wind: 0.4 }, { foul: true }] }),
    row(2, 4, { attempts: [{ mark: 4.4, wind: 2.5 }, { foul: true }, { mark: 4.3, wind: 0.1 }] }),
    row(3, 4, { attempts: [{ mark: 4.9, wind: 1.1 }, { mark: 4.8 }, { mark: 4.85 }] }),
    row(4, 4, { attempts: [{ foul: true }, { foul: true }, { foul: true }] }),
  ] });
  if (upTo >= 5) phases.push({ format: fmt('ath.800m', 5), status: 'completed', entries: [
    row(0, 5, { mark: 165.2 }), row(2, 5, { mark: 158.0 }), row(3, 5, { mark: 171.4 }), row(4, 5, { mark: 149.9 }),
  ] });
  return phases;
}

describe('a school pentathlon', () => {
  test('cells: DNF / NM / foul-out score 0 and carry on; DNS abandons', () => {
    const ph = pentathlon();
    assert.equal(cellOf(ph[0].entries[0], ph[0].format).points, P('100mh', 'F', 15.8));
    assert.equal(cellOf(ph[0].entries[4], ph[0].format).state, 'zero');
    assert.equal(cellOf(ph[1].entries[2], ph[1].format).state, 'zero'); // no height
    assert.equal(cellOf(ph[1].entries[2], ph[1].format).text, 'NM');
    assert.equal(cellOf(ph[1].entries[0], ph[1].format).points, P('hj', 'F', 1.26));
    assert.equal(cellOf(ph[2].entries[1], ph[2].format).state, 'out');
    assert.equal(cellOf(ph[3].entries[3], ph[3].format).state, 'zero'); // three fouls — NM
    assert.deepEqual(continuing(ph[2].entries, ph[2].format).map((e) => e.athleteId), ['g1', 'g3', 'g4', 'g5']);
  });
  test('standings after every event and the final classification', () => {
    const after2 = combinedStandings(pentathlon(2));
    // Asha 15.80 + 1.26 (739 + 369) leads Divya 16.00 + 1.26 (714 + 369) — Divya cleared 1.26 first time, but points decide
    assert.equal(after2[0].name, 'Asha');
    assert.equal(after2[0].total, 1108);
    assert.equal(after2[1].total, 1083);
    assert.equal(after2.length, 5);
    const fin = combinedStandings(pentathlon(), { final: true });
    const by = new Map(fin.map((r) => [r.name, r]));
    const tot = (n: string) => by.get(n)!.total;
    assert.equal(tot('Asha'), P('100mh', 'F', 15.8) + P('hj', 'F', 1.26) + P('sp', 'F', 8.4) + P('lj', 'F', 4.71) + P('800m', 'F', 165.2));
    assert.equal(tot('Chitra'), P('100mh', 'F', 17.1) + 0 + P('sp', 'F', 9.9) + P('lj', 'F', 4.4) + P('800m', 'F', 158.0));
    assert.equal(tot('Esha'), 0 + P('hj', 'F', 1.2) + P('sp', 'F', 10.2) + 0 + P('800m', 'F', 149.9));
    // ranked by total; Bina (DNS in the shot) is DNF at the bottom with no place
    const ranked = fin.filter((r) => r.position != null);
    assert.deepEqual(ranked.map((r) => r.total), [...ranked.map((r) => r.total)].sort((a, b) => b - a));
    assert.equal(fin[fin.length - 1].name, 'Bina');
    assert.equal(fin[fin.length - 1].label, 'DNF');
    assert.equal(by.get('Bina')!.position, null);
    assert.ok(ranked.every((r) => r.complete));
    // awards: four classified athletes, none for Bina
    const aw = combinedAwards(fin, { positionPoints: [5, 3, 1] });
    assert.equal(aw.length, 4);
    assert.equal(aw[0].medal, 'gold');
    assert.equal(aw[0].points, 5);
    assert.ok(combinedDone(pentathlon()));
    assert.ok(!combinedDone(pentathlon(4)));
  });
  test('the LJ wind of 2.5 doesn’t matter for points; the total’s record rule is on winds', () => {
    const fin = combinedStandings(pentathlon(), { final: true });
    // Chitra's best jump (4.40) was +2.5 — under +4.0, so the total stays legal
    assert.ok(fin.find((r) => r.name === 'Chitra')!.legal);
  });
  test('stat lines: event lines credit PBs (no place, no medal); the total line has the medals and m_ce_<kind>', () => {
    const ph = pentathlon();
    const lj = ph[3];
    const lines = combinedEventLines(lj.format, rankEntries(lj.entries, phaseDiscipline(disciplineOf('ath.lj')!, lj.format)));
    const asha = lines.find((l) => l.playerId === 'g1')!;
    assert.equal(asha.stats.m_lj, 4.71);
    assert.equal(asha.stats.field, 1);
    assert.equal(asha.stats.ceEvent, 1);
    assert.equal(asha.stats.cePts, P('lj', 'F', 4.71));
    assert.equal(asha.stats.place, undefined);
    assert.equal(asha.stats.golds, undefined);
    assert.equal(asha.won, false);
    const fin = combinedStandings(ph, { final: true });
    const tl = combinedLines(ph[4].format, fin, combinedAwards(fin));
    const winner = tl.find((l) => l.stats.golds === 1)!;
    assert.equal(winner.stats.combined, 1);
    assert.equal(winner.stats.place, 1);
    assert.equal(winner.stats.m_ce_pen, winner.stats.mark);
    assert.equal(tl.find((l) => l.playerId === 'g2')!.stats.dnf, 1);
    assert.equal(tl.find((l) => l.playerId === 'g2')!.stats.m_ce_pen, undefined);
  });
  test('career: the best total per combined event (per category) and the event points in the history', () => {
    const ph = pentathlon();
    const fin = combinedStandings(ph, { final: true });
    const lj = combinedEventLines(ph[3].format, rankEntries(ph[3].entries, phaseDiscipline(disciplineOf('ath.lj')!, ph[3].format)));
    const tl = combinedLines(ph[4].format, fin, combinedAwards(fin));
    const g = 'g1';
    const lines = [
      { eventId: 'p4', date: '2026-10-11T10:00:00Z', stats: lj.find((l) => l.playerId === g)!.stats },
      { eventId: 'p5', date: '2026-10-11T15:00:00Z', stats: tl.find((l) => l.playerId === g)!.stats },
    ];
    const infos = new Map([
      ['p4', { discipline: 'ath.lj', phase: 'final' as const, title: 'Pentathlon U16 Girls — 4. Long jump', date: '2026-10-11', category: { age: 'U16', gender: 'F' as const }, eventTitle: 'Pentathlon U16 Girls', combinedKey: KEY }],
      ['p5', { discipline: 'ath.800m', phase: 'final' as const, title: 'Pentathlon U16 Girls — 5. 800 m', date: '2026-10-11', category: { age: 'U16', gender: 'F' as const }, eventTitle: 'Pentathlon U16 Girls', combinedKey: KEY }],
    ]);
    const c = athleticsCareer(lines, infos, '2026-01-01');
    assert.equal(c.combined, 1);
    const pen = c.bests.find((b) => b.pb.discipline === KEY)!;
    assert.equal(pen.label, 'Pentathlon (U16 Girls)');
    assert.equal(pen.pb.text, `${fin.find((r) => r.athleteId === g)!.total} pts`);
    assert.ok(c.bests.some((b) => b.pb.discipline === 'ath.lj'));
    assert.equal(c.history[0].title, 'Pentathlon U16 Girls');
    assert.match(c.history[1].text, /^4\.71 \(\+0\.4\) · \d+ pts$/);
  });
  test('meet views: one event, medals into the house table, leader on points, the record book on the total', () => {
    const ph: MeetPhase[] = pentathlon().map((p, i) => ({ id: `p${i + 1}`, format: p.format, status: 'completed', date: '2026-10-11T10:00:00Z', entries: p.entries }));
    const ev = groupMeet(ph);
    assert.equal(ev.length, 1);
    assert.equal(ev[0].discipline, KEY);
    assert.ok(eventStatus(ev[0]).done);
    const res = meetFieldResults(ev, { positionPoints: [8, 7, 6, 5] });
    assert.equal(res.length, 1);
    assert.equal(res[0].awards.length, 4);
    const lead = eventLeaders(ev)[0];
    assert.match(lead.text, /pts$/);
    const book = deriveRecordBook(ev, 'SR');
    assert.equal(book.length, 1);
    assert.equal(book[0].discipline, KEY);
    assert.equal(book[0].holder, lead.name);
    // in progress: no medals yet, the status names the event being contested
    const live: MeetPhase[] = ph.slice(0, 3).map((p, i) => (i === 2 ? { ...p, status: 'live' } : p));
    const ev2 = groupMeet(live);
    assert.equal(meetFieldResults(ev2).length, 0);
    assert.equal(eventStatus(ev2[0]).label, '3. Shot put · live');
    assert.equal(combinedPhaseName(live[2].format), '3. Shot put');
    assert.equal(phaseNameOf(live[2].format), '3. Shot put');
  });
  test('records and PB flags on the total', () => {
    const fin = combinedStandings(pentathlon(), { final: true });
    const def = disciplineOf(KEY)!;
    const ranked = combinedRanked(fin, KEY);
    const book = updateRecords(ranked, def, 'U16-F', [], '2026-10-11', ['MR'], 'pen1');
    assert.equal(book.length, 1);
    assert.equal(book[0].value, fin[0].total);
    const flagged = withRecordFlags(ranked, def, { history: [{ athleteId: fin[0].athleteId, discipline: KEY, value: fin[0].total - 10, date: '2025-05-01' }], records: book, category: 'U16-F', seasonFrom: '2026-01-01', eventKey: 'pen1' });
    assert.ok(flagged[0].flags.includes('PB'));
    assert.ok(flagged[0].flags.includes('MR'));
    assert.equal(ranked.find((r) => r.entry.athleteId === 'g2')!.bestLegal, null);
  });
});

/* ---------------------------------- ties ---------------------------------- */

describe('ties (TR 39.12)', () => {
  // two-event custom list LJ + SP, women's tables, chosen marks
  const two = (marks: [number, number][]): CombinedPhaseInput[] => {
    const f1 = fmt('ath.lj', 1), f2: PhaseFormat = { ...fmt('ath.lj', 1), discipline: 'ath.sp', phaseNo: 2, combined: { ...fmt('ath.lj', 1).combined!, index: 1 } };
    return [
      { format: f1, status: 'completed', entries: marks.map(([lj], i) => ({ id: `a${i}`, athleteId: `x${i}`, name: `X${i}`, heat: 1, result: { attempts: [{ mark: lj }] } })) },
      { format: f2, status: 'completed', entries: marks.map(([, sp], i) => ({ id: `b${i}`, athleteId: `x${i}`, name: `X${i}`, heat: 1, result: { attempts: [{ mark: sp }] } })) },
    ];
  };
  test('level on points → the higher score in a single event wins when events are 1–1', () => {
    // find two pairs of marks with the same total but different splits
    const lj = (m: number) => P('lj', 'F', m), sp = (m: number) => P('sp', 'F', m);
    let found: [number, number, number, number] | null = null;
    outer: for (let a = 500; a <= 560; a++) for (let b = 900; b <= 1000; b++) for (let c = a + 1; c <= 560; c++) {
      const need = lj(a / 100) + sp(b / 100) - lj(c / 100);
      for (let d = 800; d < b; d++) if (sp(d / 100) === need) { found = [a, b, c, d]; break outer; }
    }
    assert.ok(found, 'a tie exists');
    const [a, b, c, d] = found!;
    const rows = combinedStandings(two([[a / 100, b / 100], [c / 100, d / 100]]), { final: true });
    assert.equal(rows[0].total, rows[1].total);
    assert.equal(rows[0].tie, false);
    // each won one event → decided by the best single event
    const best = (i: number) => Math.max(lj((i === 0 ? a : c) / 100), sp((i === 0 ? b : d) / 100));
    assert.equal(rows[0].athleteId, best(0) > best(1) ? 'x0' : 'x1');
    assert.equal(rows[0].tieBreak, 'best');
  });
  test('identical scores share the place', () => {
    const rows = combinedStandings(two([[5.2, 9.5], [5.2, 9.5]]), { final: true });
    assert.equal(rows[0].label, '=1');
    assert.equal(rows[1].label, '=1');
  });
});

/* ----------------------------- flow helpers ----------------------------- */

describe('seeding, false starts, the next event, records wind rule', () => {
  test('heats by total: the leaders in the last heat, best total in the centre lane', () => {
    const d = disciplineOf('ath.100m')!;
    const rows = Array.from({ length: 12 }, (_, i) => ({ id: `r${i}`, total: 1000 + i * 10 }));
    const s = combinedSeed(rows, d);
    assert.equal(Math.max(...s.map((x) => x.heat)), 2);
    const last = s.filter((x) => x.heat === 2).map((x) => x.id);
    assert.ok(last.includes('r11') && last.includes('r6'));
    assert.equal(s.find((x) => x.id === 'r11')!.lane, 4);
    // no lanes (1500 m): one heat up to 16, the leader last
    const m = combinedSeed(rows, disciplineOf('ath.1500m')!);
    assert.equal(Math.max(...m.map((x) => x.heat)), 1);
    assert.equal(m.find((x) => x.id === 'r11')!.order, 12);
    // field: one group, the leader last
    const f = combinedSeed(rows.slice(0, 5), disciplineOf('ath.sp')!);
    assert.equal(f.find((x) => x.id === 'r4')!.order, 5);
  });
  test('one false start per race: warn, then disqualify', () => {
    assert.equal(falseStartAction({}, 1), 'warn');
    assert.equal(falseStartAction({ fsWarned: [1] }, 1), 'dq');
    assert.equal(falseStartAction({ fsWarned: [1] }, 2), 'warn');
    // an FS (DQ) scores 0 and the athlete carries on
    const f = fmt('ath.100mh', 1);
    const c = cellOf({ id: 'z', athleteId: 'z', name: 'Z', heat: 1, result: { status: 'FS', ruleRef: 'TR 39.8.3' } }, f);
    assert.equal(c.state, 'zero');
  });
  test('the next event’s format: discipline, bar, implement, no warnings carried', () => {
    const f = fmt('ath.100mh', 1, { combined: { key: KEY, table: 'F', events: PEN, index: 0, fsWarned: [1], implements: { 'ath.sp': '3 kg' } } });
    const n = nextCombinedFormat(f, 1)!;
    assert.equal(n.discipline, 'ath.hj');
    assert.equal(n.phaseNo, 2);
    assert.equal(n.combined!.index, 1);
    assert.equal(n.combined!.fsWarned, undefined);
    assert.ok(n.bar!.length > 10);
    const n2 = nextCombinedFormat(n, 1)!;
    assert.equal(n2.implement, '3 kg');
    assert.equal(nextCombinedFormat({ ...f, combined: { ...f.combined!, index: 4 } }, 1), null);
    assert.match(combinedHeader(n, disciplineOf('ath.hj')!), /bar up 3 cm/);
  });
  test('record wind rule: every event ≤ +4.0, or the average ≤ +2.0; no reading at a gauged meet fails', () => {
    const c = (wind?: number, extra = {}) => ({ index: 0, discipline: 'ath.100m', entryId: 'x', points: 1, state: 'ok' as const, status: 'ok' as const, text: '', ...(wind != null ? { wind } : {}), ...extra });
    assert.ok(combinedWindLegal([c(3.9), c(3.5)]));
    assert.ok(combinedWindLegal([c(4.6), c(-1.0)])); // average 1.8
    assert.ok(!combinedWindLegal([c(4.6), c(1.0)])); // average 2.8
    assert.ok(!combinedWindLegal([c(undefined, { windMissing: true })]));
    assert.ok(!combinedWindLegal([c(1.0, { handIllegal: true })]));
  });
  test('share text', () => {
    const fin = combinedStandings(pentathlon(), { final: true });
    const t = combinedText('Pentathlon U16 Girls', fin, PEN, true);
    assert.match(t, /RESULTS · Pentathlon U16 Girls/);
    assert.match(t, /Bina \(Blue House\) DNF \(no SP\)/);
  });
});

describe('schema', () => {
  test('the athletics schema stays valid and declares the combined keys', () => {
    assert.deepEqual(validateSchema(STAT_SCHEMAS.athletics), []);
    const keys = new Set(STAT_SCHEMAS.athletics.stats.map((s) => s.key));
    for (const k of ['combined', 'ceEvent', 'cePts', 'm_ce_dec', 'm_ce_hep', 'm_ce_pen', 'pb_ce_dec', 'm_60m', 'm_1000m', 'm_60mh']) assert.ok(keys.has(k), k);
  });
});
