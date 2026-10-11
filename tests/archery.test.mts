/**
 * SD-95 — archery (World Archery) on the results engine: the rounds (outdoor
 * 72 arrows in ends of 6, indoor 60 in ends of 3, school presets), end entry
 * and its limits (arrow count, 60 / 30 max, the scorecard total check),
 * ranking-round ties (total → 10s incl. X → X → shoot-off / coin toss), the
 * seeded bracket (1 v 8, 4 v 5 …, byes), set-system and cumulative matches,
 * shoot-offs (higher arrow, then closest to the centre), bronze / gold and
 * shared places, corrections that make later scores stale, records from the
 * ranking round, stat lines, the career and the meet table.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  disciplineOf, rankEntries, groupMeet, meetFieldResults, deriveRecordBook, eventMeetSettings, eventAwards, updateRecords, rowsForRecords,
  ARCH_ROUNDS, archRoundOf, endsOf, endMax, parseArrow, parseEnd, endError, setEnd, archTotals, halfTotals, archRowText, sortEnd,
  seedPositions, bracketSize, matchOutcome, outcomeText, bracketState, staleMatchData, hasMatchData, roundLabel,
  setMatchEnd, setMatchSo, setCloser, clearMatches, setWalkover, bracketEntrant, archQualView, bracketSeeds, archLines, archeryCareer, archMarkKey,
  defaultRound, defaultBracket, phaseNameOf, bracketRowText, blankEntries, hasAnyResult, performanceOf,
  type Arrow, type EntryResult, type ResultEntry, type MeetPhase, type PhaseFormat, type ArchSide,
} from '../src/data/results/index.ts';
import { medalStandings } from '../src/data/medalStandings.ts';
import { STAT_SCHEMAS } from '../src/sports/statSchemas.ts';
import { validateSchema } from '../src/sports/statSchema.ts';
import { isEventSport, eventPrefix, eventWords } from '../src/sports/eventSports.ts';

const R70 = disciplineOf('arch.r70')!, C50 = disciplineOf('arch.c50')!;
const HOUSES = ['Red', 'Blue', 'Green', 'Gold'];
const archer = (i: number, result: EntryResult = {}): ResultEntry =>
  ({ id: `e${i}`, athleteId: `p${i}`, name: `Archer ${i}`, heat: 1, result: { order: i, ...result }, team: { name: `${HOUSES[i % 4]} House` } });
const labels = (rows: { label: string; id: string }[]) => rows.map((r) => `${r.label}:${r.id}`);
/** A ranking round from end strings ("X 10 9 9 8 7"). */
const rr = (ends: string[], perEnd = 6): EntryResult => ends.reduce<EntryResult>((r, t, i) => {
  const p = parseEnd(t, perEnd);
  if ('error' in p) throw new Error(p.error);
  return setEnd(r, i, p.arrows);
}, {});
/** n identical ends */
const same = (t: string, n: number) => Array.from({ length: n }, () => t);
const a3 = (t: string): Arrow[] => t.split(' ').map((x) => parseArrow(x)!);
/** a match side from end strings ("10 9 9") and shoot-off arrows */
const side = (ends: string[], so: Arrow[] = [], closer: boolean[] = []): ArchSide => ({ ends: ends.map(a3), ...(so.length ? { so } : {}), ...(closer.length ? { closer } : {}) });

describe('the WA rounds', () => {
  test('outdoor 72 arrows in ends of 6, indoor 60 in ends of 3; one discipline per bow and distance', () => {
    const r70 = archRoundOf('arch.r70')!;
    assert.equal(r70.arrows, 72); assert.equal(r70.perEnd, 6); assert.equal(endsOf(r70), 12); assert.equal(endMax(6), 60);
    const r18 = archRoundOf('arch.r18i')!;
    assert.equal(r18.arrows, 60); assert.equal(r18.perEnd, 3); assert.equal(endsOf(r18), 20); assert.equal(endMax(3), 30);
    assert.equal(archRoundOf('arch.c50')!.face, '80 cm 6-ring face');
    assert.ok(ARCH_ROUNDS.some((r) => r.level === 'school'));
    for (const r of ARCH_ROUNDS) {
      const d = disciplineOf(r.key)!;
      assert.equal(d.sport, 'archery'); assert.equal(d.tie, 'inner-count'); assert.equal(d.dp, 0); assert.equal(d.capture, 'target');
    }
    assert.equal(disciplineOf('arch.720'), undefined);
  });
  test('presets: the usual round per bow and age; the default bracket', () => {
    assert.equal(defaultRound('R', 'Senior', false).key, 'arch.r70');
    assert.equal(defaultRound('R', 'U18', false).key, 'arch.r60');
    assert.equal(defaultRound('R', 'School', false).key, 'arch.r30');
    assert.equal(defaultRound('C', 'Junior', false).key, 'arch.c50');
    assert.equal(defaultRound('B', 'School', false).key, 'arch.b30');
    assert.equal(defaultRound('C', 'Senior', true).key, 'arch.c18i');
    assert.deepEqual([3, 4, 7, 8, 12, 16, 40, 100].map(defaultBracket), [0, 4, 4, 8, 8, 16, 32, 32]);
  });
  test('phase names: Ranking round / Match play', () => {
    assert.equal(phaseNameOf({ discipline: 'arch.r70', phase: 'qualification', plan: [{ phase: 'qualification' }, { phase: 'final' }] }), 'Ranking round');
    assert.equal(phaseNameOf({ discipline: 'arch.r70', phase: 'final', plan: [{ phase: 'qualification' }, { phase: 'final' }] }), 'Match play');
    assert.equal(phaseNameOf({ discipline: 'arch.r70', phase: 'final', plan: [{ phase: 'final' }] }), 'Ranking round');
    assert.equal(phaseNameOf({ discipline: 'ath.100m', phase: 'heat' }), 'Heats');
  });
});

describe('ends: entry and limits', () => {
  test('arrows: X, 10 … 1, M (0 = M); anything else refused', () => {
    assert.equal(parseArrow('x'), 'X'); assert.equal(parseArrow('10'), 10); assert.equal(parseArrow('m'), 'M'); assert.equal(parseArrow('0'), 'M');
    assert.equal(parseArrow('11'), null); assert.equal(parseArrow('9.5'), null);
  });
  test('an end: sorted highest first; the arrow count must match; "= total" checks the scorecard', () => {
    const p = parseEnd('9 X M 10 8 9', 6);
    assert.ok(!('error' in p));
    assert.deepEqual((p as { arrows: Arrow[] }).arrows, ['X', 10, 9, 9, 8, 'M']);
    assert.deepEqual(sortEnd([7, 'X', 10]), ['X', 10, 7]);
    assert.match((parseEnd('X 10 9', 6) as { error: string }).error, /3 arrows — an end here is 6/);
    assert.match((parseEnd('X 10 9 9 8 7 7', 6) as { error: string }).error, /7 arrows/);
    assert.match((parseEnd('X 10 12 9 8 7', 6) as { error: string }).error, /Arrow 3: "12"/);
    assert.match((parseEnd('X 10 9 9 8 7 = 54', 6) as { error: string }).error, /add to 53, but the scorecard total says 54/);
    assert.ok(!('error' in parseEnd('X 10 9 9 8 7 = 53', 6)));
    assert.ok(!('error' in parseEnd('10,9,9', 3)));
    assert.equal(endError(['X', 'X', 'X'], 3), null);
    assert.match(endError(['X', 'X', 'X', 'X'], 3)!, /4 arrows/);
    // never more than 60 / 30: 6 arrows of at most 10
    assert.equal(archTotals([['X', 'X', 'X', 'X', 'X', 'X']]).mark, 60);
  });
  test('ranking totals: score, 10s (X included), X; halves; clearing the last end', () => {
    const r = rr(['X 10 9 9 8 7', 'X X 10 9 9 M']);
    assert.equal(r.mark, 101); assert.equal(r.tens, 5); assert.equal(r.xs, 3);
    const full = rr([...same('10 10 9 9 9 8', 6), ...same('9 9 9 8 8 8', 6)]);
    assert.deepEqual(halfTotals(full.ends, archRoundOf('arch.r70')!), [330, 306]);
    assert.match(archRowText(full, archRoundOf('arch.r70')!), /12\/12 ends · 636 · 10s 12 · X 0 · 330 \+ 306/);
    const cleared = setEnd(r, 1, null);
    assert.equal(cleared.mark, 53); assert.equal(cleared.ends!.length, 1);
    assert.equal(setEnd(cleared, 0, null).mark, undefined);
  });
});

describe('ranking round (WA ties)', () => {
  test('total, then 10s incl. X, then X; a medal tie nothing breaks needs a shoot-off', () => {
    const rows = rankEntries([
      archer(1, { mark: 640, tens: 20, xs: 8 }),
      archer(2, { mark: 640, tens: 22, xs: 5 }), // more 10s → ahead
      archer(3, { mark: 640, tens: 22, xs: 9 }), // same 10s, more X → ahead of 2
      archer(4, { mark: 641, tens: 10, xs: 2 }),
    ], R70);
    assert.deepEqual(labels(rows), ['1:e4', '2:e3', '3:e2', '4:e1']);
    const tie = rankEntries([archer(1, { mark: 600, tens: 10, xs: 2 }), archer(2, { mark: 600, tens: 10, xs: 2 }), archer(3, { mark: 650, tens: 1, xs: 0 })], R70);
    assert.deepEqual(labels(tie), ['1:e3', '=2:e1', '=2:e2']);
    assert.ok(tie[1].needsDecider && tie[1].flags.includes('SO'));
    const so = rankEntries([archer(1, { mark: 600, tens: 10, xs: 2, decider: 2 }), archer(2, { mark: 600, tens: 10, xs: 2, decider: 1 })], R70);
    assert.deepEqual(labels(so), ['1:e2', '2:e1']);
  });
  test('records / PBs only from a complete round; a bracket row is never a record', () => {
    const part = archer(1, rr(same('10 10 10 10 10 10', 6)));
    assert.equal(performanceOf(part, R70).bestLegal, null);
    const full = archer(2, rr(same('10 10 9 9 9 9', 12)));
    assert.equal(performanceOf(full, R70).bestLegal, 672);
    const b = archer(3, { ...bracketEntrant(full.result, 1) });
    assert.equal(performanceOf(b, R70).bestLegal, null);
    // the bracket reads as its ranking scores for the record book
    const view = archQualView([b]);
    assert.equal(view[0].result.mark, 672);
    const recs = updateRecords(rowsForRecords(rankEntries(view, R70), R70), R70, 'Senior-M', [], '2026-10-11');
    assert.deepEqual(recs.map((r) => [r.discipline, r.value, r.holder]), [['arch.r70', 672, 'Archer 3']]);
  });
  test('seeding the bracket: the best N; an equal rank across the cut needs a shoot-off; a toss order is kept', () => {
    const rows = rankEntries([
      archer(1, { mark: 650, tens: 20, xs: 5 }), archer(2, { mark: 640, tens: 20, xs: 5 }), archer(3, { mark: 630, tens: 20, xs: 5 }),
      archer(4, { mark: 630, tens: 20, xs: 5 }), archer(5, { mark: 600, tens: 1, xs: 0 }),
    ], R70);
    const cut = bracketSeeds(rows, 3);
    assert.deepEqual(cut.tieAtCut.sort(), ['e3', 'e4']);
    const four = bracketSeeds(rows, 4);
    assert.deepEqual(four, { ids: ['e1', 'e2', 'e3', 'e4'], tieAtCut: [] });
    const settled = rankEntries([
      archer(1, { mark: 650, tens: 20, xs: 5 }), archer(2, { mark: 640, tens: 20, xs: 5 }), archer(3, { mark: 630, tens: 20, xs: 5, decider: 2 }),
      archer(4, { mark: 630, tens: 20, xs: 5, decider: 1 }), archer(5, { mark: 600, tens: 1, xs: 0 }),
    ], R70);
    assert.deepEqual(bracketSeeds(settled, 3), { ids: ['e1', 'e2', 'e4'], tieAtCut: [] });
  });
});

describe('matches', () => {
  test('bracket positions and size (WA seeding: 1 v 8, 4 v 5, 2 v 7, 3 v 6)', () => {
    assert.deepEqual(seedPositions(8), [1, 8, 4, 5, 2, 7, 3, 6]);
    assert.deepEqual(seedPositions(4), [1, 4, 2, 3]);
    assert.equal(seedPositions(64)[1], 64);
    assert.deepEqual([2, 3, 5, 8, 9, 33].map(bracketSize), [2, 4, 8, 8, 16, 64]);
    assert.equal(roundLabel(1, 4), '1/8 elimination'); assert.equal(roundLabel(2, 3), 'Semi-final'); assert.equal(roundLabel(3, 3), 'Gold medal match'); assert.equal(roundLabel('B', 3), 'Bronze medal match');
  });
  test('set system: 2 points an end, 1 each for a tie, first to 6', () => {
    const o = matchOutcome(side(['10 10 9', '9 9 9', '10 9 9']), side(['9 9 9', '9 9 9', '9 9 8']), 'sets');
    assert.deepEqual([o.a, o.b, o.winner, o.done], [5, 1, undefined, false]);
    assert.equal(o.nextEnd, 4);
    const won = matchOutcome(side(['10 10 9', '9 9 9', '10 9 9', '10 10 10']), side(['9 9 9', '9 9 9', '9 9 8', '8 8 8']), 'sets');
    assert.deepEqual([won.a, won.b, won.winner, won.done], [7, 1, 'a', true]);
    assert.equal(outcomeText(won), '7–1');
    assert.equal(outcomeText(won, undefined, undefined, true), '1–7');
  });
  test('5–5 → one-arrow shoot-off: the higher arrow, then closest to the centre (the judge), else another arrow', () => {
    const ends = ['10 10 10', '9 9 9', '8 8 8', '7 7 7', '6 6 6'];
    const other = ['9 9 9', '10 10 10', '8 8 8', '8 8 8', '5 5 5']; // 2-0, 0-2, 1-1, 0-2, 2-0 → 5-5
    const lvl = matchOutcome(side(ends), side(other), 'sets');
    assert.deepEqual([lvl.a, lvl.b, lvl.shootOff, lvl.done], [5, 5, true, false]);
    assert.deepEqual(lvl.soNeed, { round: 1, kind: 'arrows' });
    const hi = matchOutcome(side(ends, [10]), side(other, [9]), 'sets');
    assert.deepEqual([hi.a, hi.b, hi.winner], [6, 5, 'a']);
    const eq = matchOutcome(side(ends, ['X']), side(other, [10]), 'sets');
    assert.deepEqual(eq.soNeed, { round: 1, kind: 'closer' }); // X and 10 both score 10: the judge says who is closer
    const closer = matchOutcome(side(ends, ['X']), side(other, [10], [true]), 'sets');
    assert.deepEqual([closer.winner, closer.b, closer.soWon], ['b', 6, { round: 1, closer: true }]);
    assert.equal(outcomeText(closer, side(ends, ['X']), side(other, [10], [true])), '5–6 (SO X–10*)');
    const again = matchOutcome(side(ends, [9, 8]), side(other, [9, 10]), 'sets');
    assert.equal(again.winner, 'b'); // equidistant → another arrow
  });
  test('compound: cumulative over 5 ends; level → shoot-off', () => {
    const a = side(same('10 10 10', 5)), b = side([...same('10 10 10', 4), '10 10 9']);
    const o = matchOutcome(a, b, 'cumulative');
    assert.deepEqual([o.a, o.b, o.winner], [150, 149, 'a']);
    const run = matchOutcome(side(same('10 10 10', 3)), side(same('9 9 9', 3)), 'cumulative');
    assert.equal(run.done, false); // no early finish in a cumulative match
    const lvl = matchOutcome(side(same('10 10 9', 5)), side(same('10 9 10', 5)), 'cumulative');
    assert.equal(lvl.shootOff, true);
    assert.equal(matchOutcome(side(same('10 10 9', 5), [10]), side(same('10 9 10', 5), [8]), 'cumulative').winner, 'a');
  });
  test('a walkover: the other archer goes through', () => {
    assert.deepEqual(matchOutcome(undefined, undefined, 'sets', true, false).winner, 'a');
    // a per-match walkover (absent for this match only): the archer keeps the earlier rounds and their place
    let rows = seeded(4);
    rows = play(rows, '1', 'e1', 'e4'); rows = play(rows, '1', 'e2', 'e3');
    rows = rows.map((e) => (e.id === 'e2' ? { ...e, result: setWalkover(e.result, '2', true) } : e));
    const st = bracketState(rows, 'sets');
    const gold = st.matches.find((m) => m.key === '2')!;
    assert.deepEqual([gold.winner, gold.loser, gold.out?.walkover], ['e1', 'e2', true]);
    assert.equal(st.places.get('e2')?.place, 2);
    assert.equal(outcomeText(gold.out!), 'w/o');
  });
});

/** Eight archers seeded 1–8 into match play (higher seed number = weaker). */
const seeded = (n: number) => Array.from({ length: n }, (_, i) => archer(i + 1, { ...bracketEntrant({ mark: 700 - i * 10, tens: 30 - i, xs: 10 - i }, i + 1) }));
const WIN = ['10 10 10', '10 10 10', '10 10 10'];
const LOSE = ['9 9 9', '9 9 9', '9 9 9'];
/** a match between rows a and b: a wins 6-0 (or by `aSide` / `bSide`) */
function play(rows: ResultEntry[], key: string, a: string, b: string, aSide: ArchSide = side(WIN), bSide: ArchSide = side(LOSE)): ResultEntry[] {
  return rows.map((e) => (e.id === a ? { ...e, result: { ...e.result, mp: { ...e.result.mp, [key]: aSide } } } : e.id === b ? { ...e, result: { ...e.result, mp: { ...e.result.mp, [key]: bSide } } } : e));
}

describe('the bracket', () => {
  test('8 archers: QF 1v8 4v5 2v7 3v6, semis, bronze, gold — places 1, 2, 3, 4, =5 ×4', () => {
    let rows = seeded(8);
    let st = bracketState(rows, 'sets');
    assert.equal(st.rounds, 3);
    const qf = st.matches.filter((m) => m.round === 1);
    assert.deepEqual(qf.map((m) => [m.a, m.b]), [['e1', 'e8'], ['e4', 'e5'], ['e2', 'e7'], ['e3', 'e6']]);
    assert.equal(st.current?.key, '1');
    // QF: the favourites win, except 5 beats 4 in a shoot-off
    rows = play(rows, '1', 'e1', 'e8');
    const tieEnds = ['10 10 10', '9 9 9', '8 8 8', '7 7 7', '6 6 6'], tieOther = ['9 9 9', '10 10 10', '8 8 8', '8 8 8', '5 5 5'];
    rows = play(rows, '1', 'e5', 'e4', side(tieEnds, [10]), side(tieOther, [10], [false]));
    st = bracketState(rows, 'sets');
    assert.deepEqual(st.matches.find((m) => m.key === '1' && m.slot === 1)!.out!.soNeed, { round: 1, kind: 'closer' });
    rows = rows.map((e) => (e.id === 'e5' ? { ...e, result: setCloser(e.result, '1', 0, true) } : e));
    rows = play(rows, '1', 'e2', 'e7');
    rows = play(rows, '1', 'e3', 'e6');
    st = bracketState(rows, 'sets');
    const sf = st.matches.filter((m) => m.round === 2);
    assert.deepEqual(sf.map((m) => [m.a, m.b]), [['e1', 'e5'], ['e2', 'e3']]);
    assert.equal(st.places.get('e8')!.place, 5); assert.ok(st.places.get('e8')!.tie);
    assert.equal(st.places.get('e4')!.place, 5);
    // semis: 1 beats 5, 3 beats 2 → bronze 5 v 2, gold 1 v 3
    rows = play(rows, '2', 'e1', 'e5');
    rows = play(rows, '2', 'e3', 'e2');
    st = bracketState(rows, 'sets');
    const bronze = st.matches.find((m) => m.key === 'B')!;
    assert.deepEqual([bronze.a, bronze.b, bronze.known], ['e5', 'e2', true]);
    assert.equal(st.current?.key, 'B'); // bronze before gold
    rows = play(rows, 'B', 'e2', 'e5');
    rows = play(rows, '3', 'e3', 'e1');
    st = bracketState(rows, 'sets');
    assert.ok(st.done);
    const ranked = rankEntries(rows, R70);
    assert.deepEqual(labels(ranked), ['1:e3', '2:e1', '3:e2', '4:e5', '=5:e4', '=5:e6', '=5:e7', '=5:e8']);
    assert.equal(ranked[0].bestText, 'W 6–0');
    // tied 5th places share the points of 5th–8th
    const aw = eventAwards(ranked, eventMeetSettings('archery', {}));
    assert.deepEqual(aw.map((a) => [a.entryId, a.medal ?? '', a.points]), [['e3', 'gold', 8], ['e1', 'silver', 7], ['e2', 'bronze', 6], ['e5', '', 5], ['e4', '', 2.5], ['e6', '', 2.5], ['e7', '', 2.5], ['e8', '', 2.5]]);
    // the sheet line
    assert.equal(bracketRowText(rows.find((e) => e.id === 'e5')!, st, rows), 'Seed 5 (660) · QF W 6–5 (SO 10*–10) · SF L 0–6 · Bronze L 0–6');
    // stat lines: matches won / lost and set points
    const lines = archLines({ discipline: 'arch.r70' }, ranked, 'bracket', aw);
    const l3 = lines.find((l) => l.playerId === 'p3')!;
    assert.deepEqual([l3.stats.mW, l3.stats.mL, l3.stats.sp, l3.stats.place, l3.stats.golds, l3.won], [3, 0, 18, 1, 1, true]);
    const l5 = lines.find((l) => l.playerId === 'p5')!;
    assert.deepEqual([l5.stats.mW, l5.stats.mL, l5.stats.sp, l5.stats.spA], [1, 2, 6, 17]);
  });
  test('6 archers in a bracket of 8: seeds 1 and 2 get byes', () => {
    const rows = seeded(6);
    const st = bracketState(rows, 'sets');
    const qf = st.matches.filter((m) => m.round === 1);
    assert.deepEqual(qf.map((m) => [m.a ?? '-', m.b ?? '-', m.bye]), [['e1', '-', true], ['e4', 'e5', false], ['e2', '-', true], ['e3', 'e6', false]]);
    const sf = st.matches.filter((m) => m.round === 2);
    assert.equal(sf[0].a, 'e1'); assert.equal(sf[0].known, false); // waiting for 4 v 5
  });
  test('a 4-archer bracket: semis, bronze and gold; compound cumulative', () => {
    let rows = seeded(4);
    const W = side(same('10 10 10', 5)), L = side(same('9 9 9', 5));
    rows = play(rows, '1', 'e1', 'e4', W, L); rows = play(rows, '1', 'e2', 'e3', W, L);
    rows = play(rows, 'B', 'e3', 'e4', W, L); rows = play(rows, '2', 'e2', 'e1', W, L);
    const st = bracketState(rows, 'cumulative');
    assert.ok(st.done);
    assert.deepEqual(labels(rankEntries(rows, C50)), ['1:e2', '2:e1', '3:e3', '4:e4']);
  });
  test('a corrected quarter-final makes the old winner\'s later scores stale (cleared after asking)', () => {
    let rows = seeded(8);
    rows = play(rows, '1', 'e1', 'e8'); rows = play(rows, '1', 'e4', 'e5'); rows = play(rows, '1', 'e2', 'e7'); rows = play(rows, '1', 'e3', 'e6');
    rows = play(rows, '2', 'e1', 'e4');
    assert.deepEqual(staleMatchData(rows, 'sets'), []);
    // QF 1 v 8 corrected: 8 actually won → 1's semi-final is gone, and 4's semi
    // ends were shot against 1, not 8
    const before = rows;
    rows = play(rows, '1', 'e8', 'e1');
    const stale = staleMatchData(rows, 'sets', before);
    assert.deepEqual(stale, [{ id: 'e1', keys: ['2'] }, { id: 'e4', keys: ['2'] }]);
    assert.deepEqual(staleMatchData(rows, 'sets'), [{ id: 'e1', keys: ['2'] }]); // without "before" only the archer who is out
    rows = rows.map((e) => (stale.some((s) => s.id === e.id) ? { ...e, result: clearMatches(e.result, ['2']) } : e));
    assert.deepEqual(staleMatchData(rows, 'sets', rows), []);
    // a quarter-final made undecided (5–5, shoot-off to come): the semi-final ends of both are stale — the opponent isn't known any more
    let r2 = seeded(8);
    r2 = play(r2, '1', 'e1', 'e8'); r2 = play(r2, '1', 'e4', 'e5'); r2 = play(r2, '1', 'e2', 'e7'); r2 = play(r2, '1', 'e3', 'e6'); r2 = play(r2, '2', 'e1', 'e4');
    const lvl = play(r2, '1', 'e4', 'e5', side(['10 10 10', '9 9 9', '8 8 8', '7 7 7', '6 6 6']), side(['9 9 9', '10 10 10', '8 8 8', '8 8 8', '5 5 5']));
    assert.deepEqual(staleMatchData(lvl, 'sets', r2), [{ id: 'e1', keys: ['2'] }, { id: 'e4', keys: ['2'] }]);
    const sf = bracketState(rows, 'sets').matches.find((m) => m.round === 2 && m.slot === 0)!;
    assert.deepEqual([sf.a, sf.b, sf.out?.ends.length], ['e8', 'e4', 0]);
  });
  test('match entry helpers: an end, a shoot-off arrow, the judge\'s call; clearing an end drops the shoot-off', () => {
    let r: EntryResult = { mp: {} };
    r = setMatchEnd(r, '1', 0, a3('9 10 X'));
    assert.deepEqual(r.mp!['1'].ends, [['X', 10, 9]]);
    r = setMatchSo(r, '1', 0, 10);
    r = setCloser(r, '1', 0, true);
    assert.deepEqual([r.mp!['1'].so, r.mp!['1'].closer], [[10], [true]]);
    assert.ok(hasMatchData(r));
    r = setMatchSo(r, '1', 0, 9); // a new arrow resets the call
    assert.deepEqual(r.mp!['1'].closer, []);
    r = setMatchEnd(r, '1', 0, null);
    assert.deepEqual([r.mp!['1'].ends, r.mp!['1'].so], [[], undefined]);
    assert.equal(hasMatchData(r), false);
    assert.equal(hasAnyResult([{ mp: { '1': { ends: [a3('9 9 9')] } } }]), true);
    assert.equal(hasAnyResult([{ mp: {} }]), false);
    assert.deepEqual(blankEntries([archer(1, { mp: {} })], R70), []);
  });
});

describe('lines, career and the meet', () => {
  const cat = { age: 'Senior', gender: 'M' as const };
  test('ranking-round lines: arrows, points, 10s, X, the round score when complete, seeded', () => {
    const rows = rankEntries([archer(1, rr(same('10 10 9 9 9 X', 12))), archer(2, rr(same('9 9 9 9 9 9', 6)))], R70);
    const lines = archLines({ discipline: 'arch.r70', category: cat }, rows, 'qual', [], new Set(['e1']));
    const l1 = lines.find((l) => l.playerId === 'p1')!;
    assert.deepEqual([l1.stats.comps, l1.stats.arrows, l1.stats.pts, l1.stats.tens, l1.stats.xs, l1.stats[archMarkKey('arch.r70')], l1.stats.rPlace, l1.stats.seeded], [1, 72, 684, 36, 12, 684, 1, 1]);
    const l2 = lines.find((l) => l.playerId === 'p2')!;
    assert.equal(l2.stats.m_ar_r70, undefined); // 36 arrows of 72: no round score
    assert.equal(l2.stats.arrows, 36);
  });
  test('career: average arrow, 10 + X rate, PB / SB per round, match W-L and set points', () => {
    const phases = new Map([
      ['q1', { discipline: 'arch.r70', title: 'Recurve 70 m — Ranking round', date: '2026-03-01' }],
      ['b1', { discipline: 'arch.r70', title: 'Recurve 70 m — Match play', date: '2026-03-01' }],
      ['q2', { discipline: 'arch.r70', title: 'Recurve 70 m — Ranking round', date: '2026-09-01' }],
    ]);
    const c = archeryCareer([
      { eventId: 'q1', date: '2026-03-01', stats: { comps: 1, arrows: 72, pts: 620, tens: 18, xs: 6, m_ar_r70: 620, rPlace: 4, seeded: 1 } },
      { eventId: 'b1', date: '2026-03-01T12', stats: { brackets: 1, mW: 2, mL: 1, sp: 16, spA: 12, place: 3, bronzes: 1, posPoints: 6 } },
      { eventId: 'q2', date: '2026-09-01', stats: { comps: 1, arrows: 72, pts: 640, tens: 24, xs: 9, m_ar_r70: 640, rPlace: 2 } },
    ], phases, '2026-01-01');
    assert.deepEqual([c.comps, c.brackets, c.mW, c.mL, c.sp, c.bronzes, c.points], [2, 1, 2, 1, 16, 1, 6]);
    assert.equal(c.avgArrow, 8.75); // 1260 / 144
    assert.equal(c.tenRate, 29.2); // 42 / 144
    assert.equal(c.bests.length, 1);
    assert.equal(c.bests[0].pb.value, 640); assert.equal(c.bests[0].pb.text, '640 (24 10s, 9 X)');
    assert.deepEqual(c.history[0].flags, ['PB']);
    assert.equal(c.history[1].text, '3rd in match play · won 2, lost 1 · 16 set points');
  });
  test('the meet: medals from match play; records (MR / SR) from the ranking round', () => {
    const plan = [{ phase: 'qualification' as const, heats: 1, progression: { fillTo: 4 } }, { phase: 'final' as const, heats: 1 }];
    const fmt = (phase: 'qualification' | 'final', phaseNo: number): PhaseFormat => ({ discipline: 'arch.r70', category: cat, phase, phaseNo, heats: 1, eventKey: 'ev1', plan });
    const rank = [1, 2, 3, 4, 5].map((i) => archer(i, rr(same(i === 1 ? '10 10 10 9 9 9' : '9 9 9 9 9 8', 12))));
    let bracket = seeded(4);
    const W = side(WIN), L = side(LOSE);
    bracket = play(bracket, '1', 'e1', 'e4', W, L); bracket = play(bracket, '1', 'e2', 'e3', W, L);
    bracket = play(bracket, 'B', 'e3', 'e4', W, L); bracket = play(bracket, '2', 'e1', 'e2', W, L);
    const phases: MeetPhase[] = [
      { id: 'q', format: fmt('qualification', 1), status: 'completed', date: '2026-10-11', entries: rank },
      { id: 'b', format: fmt('final', 2), status: 'completed', date: '2026-10-11', entries: bracket },
    ];
    const meet = groupMeet(phases);
    const res = meetFieldResults(meet, eventMeetSettings('archery', {}));
    assert.equal(res.length, 1);
    assert.deepEqual(res[0].awards.map((a) => [a.entryId, a.medal ?? '']), [['e1', 'gold'], ['e2', 'silver'], ['e3', 'bronze'], ['e4', '']]);
    assert.ok(medalStandings([], [], { mode: 'position' }, undefined, res).length > 0);
    const sr = deriveRecordBook(meet, 'SR');
    assert.deepEqual(sr.map((r) => [r.discipline, r.value, r.holder]), [['arch.r70', 684, 'Archer 1']]);
    assert.deepEqual(eventMeetSettings('archery', { pointsScheme: '5,3,1' }).positionPoints, [5, 3, 1]);
  });
  test('wiring: an event sport with its words, prefix and a valid schema', () => {
    assert.ok(isEventSport('archery'));
    assert.equal(eventPrefix('archery'), 'arch.');
    assert.equal(eventWords('archery').athletes, 'archers');
    assert.deepEqual(validateSchema(STAT_SCHEMAS.archery), []);
  });
});
