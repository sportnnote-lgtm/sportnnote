/**
 * SD-76 / SD-84 / SD-87 / SD-88 — golf team stroke play (best N of M), the
 * unofficial WHS handicap maths, match play with strokes and the scorecard.
 *   - Team: best N per round (discards), best ball per hole, net basis, short
 *     teams, countback on the non-counting score then last 9/6/3/1, shared T.
 *   - WHS: net double bogey AGS (Rule 3.1, par + 5 without an index), Score
 *     Differential (Rule 5.1), table 5.2a index estimate from the last 20.
 *   - Match play: Appendix C 100% difference by stroke index, back-nine
 *     numbering, extra holes; the reducer is unchanged for older logs.
 *   - Scorecard: Out / In / Tot columns, shapes, net / points / putts rows.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { standardPar72, holesFor, matchState, type GolfCard, type HoleWinner } from '../src/sports/golf/engine.ts';
import { adjustedGrossScore, scoreDifferential, roundDifferential, indexEstimate, countingRule, showHcp } from '../src/sports/golf/handicap.ts';
import { buildTeamLeaderboard, golfTeamFormatOf, teamRuleLabel } from '../src/data/golfTeams.ts';
import { setupMatchStrokes, matchHole, holeNumber, scoreStatKey, strokesLine } from '../src/sports/golf/matchStrokes.ts';
import { initGolfMatch, golfMatchReducer, golfMatchStateOf, type GolfMatchState } from '../src/sports/golf/match.ts';
import { cardColumns, cardRows, scoreShape, sumOver, cardShareText } from '../src/sports/golf/scorecard.ts';
import type { FieldEntry, FieldEvent, GolfCourse } from '../src/core/types.ts';

const H = standardPar72();
const card = (deltas: (number | null | 'P')[]): GolfCard => ({ strokes: H.map((h, i) => (deltas[i] == null ? null : deltas[i] === 'P' ? 'P' : h.par + (deltas[i] as number))) });
/** `over` bogeys on the first holes (or the last ones with `late`), pars elsewhere */
const even = (over = 0, late = false): GolfCard => card(H.map((_, i) => ((late ? i >= 18 - over : i < over) ? 1 : 0)));
const blue = { name: 'Blue', courseRating: 72.4, slope: 131 };
const course: GolfCourse = { id: 'c1', name: 'Club', holes: H, tees: [{ name: 'White' }, blue] };
const ev = (n: number, format: Record<string, unknown> = {}): FieldEvent => ({
  id: `r${n}`, sport: 'golf', title: `Round ${n}`, roundNo: n, startsAt: `2026-10-0${n}T08:00:00Z`, status: 'live',
  format: { competition: 'stroke', holes: '18', courseId: 'c1', team: { count: 2, basis: 'gross', mode: 'round' }, ...format },
});
const en = (pid: string, team: string | undefined, n: number, c: GolfCard, hi?: number, status: FieldEntry['status'] = 'playing'): FieldEntry =>
  ({ id: `${pid}-${n}`, eventId: `r${n}`, playerId: pid, teamId: team, groupNo: 1, result: c, status, handicapIndex: hi });
const board = (rows: { teamId: string; positionLabel: string; total: number }[]) => rows.map((r) => `${r.teamId}:${r.positionLabel}:${r.total}`);

/* ------------------------------- SD-76 -------------------------------- */

describe('SD-76 — team stroke play, best N of M', () => {
  test('format: read from format.team; absent / bad → individual only', () => {
    assert.equal(golfTeamFormatOf({ format: {} }), null);
    assert.equal(golfTeamFormatOf({ format: { team: { count: 0 } } }), null);
    assert.deepEqual(golfTeamFormatOf({ format: { team: { count: 3, basis: 'net', mode: 'hole' } } }), { count: 3, basis: 'net', mode: 'hole' });
    assert.equal(teamRuleLabel({ count: 3, basis: 'gross', mode: 'round' }, 4), 'Best 3 of 4 scores each round · gross');
  });

  test('best 2 of 3 per round: the worst score is discarded; untagged players ignored', () => {
    const { rows } = buildTeamLeaderboard([ev(1)], [
      en('a1', 'A', 1, even(2)), en('a2', 'A', 1, even(4)), en('a3', 'A', 1, even(6)),
      en('b1', 'B', 1, even(1)), en('b2', 'B', 1, even(5)), en('b3', 'B', 1, even(3)),
      en('solo', undefined, 1, even(0)),
    ], [course]);
    assert.deepEqual(board(rows), ['B:1:4', 'A:2:6']);
    const a = rows.find((r) => r.teamId === 'A')!;
    assert.deepEqual(a.rounds[0]!.counted, ['a1', 'a2']);
    assert.deepEqual(a.rounds[0]!.discarded, ['a3']);
    assert.equal(a.memberScores.get('a3'), 6);
  });

  test('countback: the non-counting score first, then the counting cards’ last 9', () => {
    // A and C both count 6; C's discard (+5) beats A's (+6)
    let { rows } = buildTeamLeaderboard([ev(1)], [
      en('a1', 'A', 1, even(2)), en('a2', 'A', 1, even(4)), en('a3', 'A', 1, even(6)),
      en('c1', 'C', 1, even(3)), en('c2', 'C', 1, even(3)), en('c3', 'C', 1, even(5)),
    ], [course]);
    assert.deepEqual(board(rows), ['C:1:6', 'A:2:6']);
    // same discards → the counting cards' last 9: A's bogeys came early
    ({ rows } = buildTeamLeaderboard([ev(1)], [
      en('a1', 'A', 1, even(3)), en('a2', 'A', 1, even(3)), en('a3', 'A', 1, even(5)),
      en('c1', 'C', 1, even(3, true)), en('c2', 'C', 1, even(3, true)), en('c3', 'C', 1, even(5)),
    ], [course]));
    assert.deepEqual(board(rows), ['A:1:6', 'C:2:6']);
    // identical → shared
    ({ rows } = buildTeamLeaderboard([ev(1)], [
      en('a1', 'A', 1, even(3)), en('a2', 'A', 1, even(3)), en('a3', 'A', 1, even(5)),
      en('c1', 'C', 1, even(3)), en('c2', 'C', 1, even(3)), en('c3', 'C', 1, even(5)),
    ], [course]));
    assert.deepEqual(board(rows), ['A:T1:6', 'C:T1:6']);
  });

  test('countback waits for complete cards: an equal total mid-round is shared', () => {
    const part = card(H.map((_, i) => (i < 9 ? (i < 3 ? 1 : 0) : null)));
    const { rows } = buildTeamLeaderboard([ev(1)], [
      en('a1', 'A', 1, part), en('a2', 'A', 1, part), en('a3', 'A', 1, even(9)),
      en('c1', 'C', 1, part), en('c2', 'C', 1, part), en('c3', 'C', 1, even(5)),
    ], [course]);
    assert.deepEqual(board(rows), ['A:T1:6', 'C:T1:6']);
    assert.equal(rows[0].rounds[0]!.thru, 9);
  });

  test('a team without N scores (WD, pick-up NR) is listed below, unranked', () => {
    const { rows } = buildTeamLeaderboard([ev(1)], [
      en('a1', 'A', 1, even(2)), en('a2', 'A', 1, card(H.map((_, i) => (i === 3 ? 'P' : 0)))), en('a3', 'A', 1, even(0), undefined, 'wd'),
      en('b1', 'B', 1, even(9)), en('b2', 'B', 1, even(9)),
    ], [course]);
    assert.deepEqual(board(rows), ['B:1:18', 'A:–:0']);
    assert.equal(rows[1].short, true);
  });

  test('multi-round: round totals add up; Stableford is high-wins', () => {
    const { rows } = buildTeamLeaderboard([ev(1), ev(2)], [
      en('a1', 'A', 1, even(1)), en('a2', 'A', 1, even(1)), en('a1', 'A', 2, even(1)), en('a2', 'A', 2, even(1)),
      en('b1', 'B', 1, even(0)), en('b2', 'B', 1, even(0)), en('b1', 'B', 2, even(3)), en('b2', 'B', 2, even(3)),
    ].map((e) => ({ ...e, id: `${e.playerId}-${e.eventId}` })), [course]);
    assert.deepEqual(board(rows), ['A:1:4', 'B:2:6']);
    const sf = buildTeamLeaderboard([ev(1, { competition: 'stableford' })], [
      en('a1', 'A', 1, even(1)), en('a2', 'A', 1, even(2)), en('b1', 'B', 1, even(0)), en('b2', 'B', 1, even(4)),
    ], [course]);
    // 36 − 1 + 36 − 2 = 69 v 36 + 32 = 68
    assert.deepEqual(board(sf.rows), ['A:1:69', 'B:2:68']);
  });

  test('best ball per hole and the net basis', () => {
    const front = card(H.map((_, i) => (i < 9 ? 1 : 0)));
    const back = card(H.map((_, i) => (i >= 9 ? 1 : 0)));
    const { rows } = buildTeamLeaderboard([ev(1, { team: { count: 1, basis: 'gross', mode: 'hole' } })], [
      en('a1', 'A', 1, front), en('a2', 'A', 1, back), en('b1', 'B', 1, even(2)), en('b2', 'B', 1, even(2)),
    ], [course]);
    assert.deepEqual(board(rows), ['A:1:0', 'B:2:2']);
    // net: an 18-handicap bogey golfer (95% → 17 strokes) is net +1 v scratch pars
    const net = buildTeamLeaderboard([ev(1, { team: { count: 1, basis: 'net', mode: 'round' } })], [
      en('a1', 'A', 1, even(18), 18), en('b1', 'B', 1, even(0), 0),
    ], [course]);
    assert.deepEqual(board(net.rows), ['B:1:0', 'A:2:1']); // 18 over − 17 strokes = net +1
  });

  test('no team rule → no team board', () => {
    assert.deepEqual(buildTeamLeaderboard([ev(1, { team: undefined })], [en('a1', 'A', 1, even(0))], [course]).rows, []);
  });
});

/* ------------------------------- SD-84 -------------------------------- */

describe('SD-84 — WHS: AGS, Score Differential, index estimate (unofficial)', () => {
  test('Rule 3.1 net double bogey uses the COURSE handicap; pick-up takes the cap', () => {
    // Index 10.0 on Blue (72.4 / 131): CH = 10 × 131/113 + 0.4 = 11.99 → 12 → a shot on SI 1–12
    const c = card(H.map((h, i) => (h.n === 4 ? 4 : 1))); // hole 4: par 5, SI 1 → 9
    assert.equal(adjustedGrossScore(c, H, blue, 10), 92); // gross 93: the 9 is capped at 5 + 2 + 1 = 8
    const pick = card(H.map((h) => (h.n === 16 ? 'P' : 1))); // hole 16: par 3, SI 18 → no shot → cap 5
    assert.equal(adjustedGrossScore(pick, H, blue, 10), 90 - 4 + 5);
    // no index: par + 5 (Rule 3.1b)
    assert.equal(adjustedGrossScore(card(H.map((h) => (h.n === 4 ? 7 : 0))), H, blue, undefined), 72 + 5);
    // incomplete → none
    assert.equal(adjustedGrossScore(card(H.map((_, i) => (i < 17 ? 0 : null))), H, blue, 10), null);
  });

  test('Rule 5.1 differential = 113 / Slope × (AGS − CR − PCC), one decimal', () => {
    assert.equal(scoreDifferential(92, 72.4, 131), 16.9);
    assert.equal(scoreDifferential(85, 71, 113), 14);
    assert.equal(scoreDifferential(70, 72.4, 131), -2.1);
    assert.equal(scoreDifferential(85, 71, 113, 1), 13);
    const d = roundDifferential(card(H.map((h) => (h.n === 4 ? 4 : 1))), H, blue, 10)!;
    assert.deepEqual(d, { adjGross: 92, differential: 16.9, courseRating: 72.4, slope: 131 });
    // no rating / slope, or a 9-hole round → no differential
    assert.equal(roundDifferential(even(0), H, { name: 'White' }, 10), null);
    assert.equal(roundDifferential({ strokes: H.slice(0, 9).map((h) => h.par) }, holesFor(course, 'front9'), blue, 10), null);
  });

  test('table 5.2a: 3 → lowest 1 − 2.0 … 20 → best 8; only the last 20 count', () => {
    assert.equal(countingRule(2), null);
    assert.deepEqual(countingRule(6), { use: 2, adjust: -1 });
    assert.deepEqual(countingRule(20), { use: 8, adjust: 0 });
    assert.equal(indexEstimate([10, 12]), null);
    assert.equal(indexEstimate([10, 12, 14])!.value, 8);
    assert.equal(indexEstimate([10, 12, 14, 9, 11, 13])!.value, 8.5); // (9 + 10) / 2 − 1
    const twenty = Array.from({ length: 20 }, (_, i) => 20 - i);
    const e = indexEstimate(twenty)!;
    assert.equal(e.value, 4.5);
    assert.equal(e.used, 8);
    assert.deepEqual(e.counting, [12, 13, 14, 15, 16, 17, 18, 19]);
    // two very old low ones fall out of the last 20
    const e2 = indexEstimate([0, 0, ...twenty])!;
    assert.equal(e2.value, 4.5);
    assert.equal(e2.of, 20);
    assert.equal(showHcp(-1.2), '+1.2');
    assert.equal(showHcp(12), '12.0');
  });
});

/* ------------------------------- SD-87 -------------------------------- */

describe('SD-87 — match play with strokes', () => {
  test('Appendix C: 100% of the difference, by stroke index', () => {
    const ms = setupMatchStrokes({ holes: H, homeIndex: 18, awayIndex: 10 });
    assert.equal(ms.homePH - ms.awayPH, 8);
    assert.equal(ms.home.reduce((t, x) => t + x, 0), 8);
    assert.ok(ms.away.every((x) => x === 0));
    H.forEach((h, i) => assert.equal(ms.home[i], h.si <= 8 ? 1 : 0, `hole ${h.n}`));
    assert.equal(strokesLine(ms, 'Asha', 'Ravi'), 'Asha gets 8 shots (playing handicaps 18 v 10, 100%)');
    // on the Blue tee the course handicaps differ by more than the indexes
    const blueMs = setupMatchStrokes({ holes: H, tee: blue, homeIndex: 18, awayIndex: 10 });
    assert.equal(blueMs.homeCH, 21);
    assert.equal(blueMs.awayCH, 12);
    // back nine: the nine ranked among themselves (SI 2, 4, 6, 8 → holes 13, 17, 14, 10)
    const back = setupMatchStrokes({ holes: holesFor(course, 'back9'), homeIndex: 4, awayIndex: 12 });
    assert.equal(back.awayPH - back.homePH, 4);
    assert.deepEqual(back.holes.filter((_, i) => back.away[i] > 0).map((h) => h.n), [10, 13, 14, 17]);
    // extra holes replay the stroke index of the first hole of the match
    assert.equal(matchHole(ms, 18).hole.n, 1);
    assert.equal(matchHole(ms, 18).home, ms.home[0]);
    assert.equal(scoreStatKey(3, 4), 'birdies');
    assert.equal(scoreStatKey(7, 4), 'doubles');
  });

  test('back-nine numbering 10–18, extra holes 19+', () => {
    const s = initGolfMatch({ holes: 'back9', extraHoles: true });
    assert.equal(s.firstHole, 10);
    assert.equal(holeNumber(s.firstHole, 0), 10);
    assert.equal(holeNumber(s.firstHole, 8), 18);
    assert.equal(holeNumber(undefined, 18), 19);
    const halves: HoleWinner[] = [...Array(9).fill('halved'), 'home'];
    assert.equal(matchState(halves, 9, true, 10).result, 'Won at the 19th hole');
    assert.equal(matchState(halves, 9, true).result, 'Won at the 10th hole'); // unchanged default
    assert.equal('firstHole' in initGolfMatch({ holes: '18' }), false);
    assert.equal('firstHole' in initGolfMatch({ holes: 'front9' }), false);
  });

  test('reducer: old logs replay identically; strokes and scores are additive keys', () => {
    const run = (acts: { type: string; side?: 'home' | 'away'; payload?: Record<string, unknown> }[], cfg = {}) => acts.reduce(golfMatchReducer, initGolfMatch(cfg));
    const old = run([{ type: 'HOLE', payload: { winner: 'home' } }, { type: 'HOLE', payload: { winner: 'halved' } }]);
    assert.deepEqual(old, { regulation: 18, extraHoles: false, holes: ['home', 'halved'], ended: false, seq: 2 });
    const ms = setupMatchStrokes({ holes: H, homeIndex: 18, awayIndex: 10 });
    const s = run([
      { type: 'HOLE', payload: { winner: 'home' } },
      { type: 'SET_STROKES', payload: { strokes: ms } },
      { type: 'HOLE', payload: { winner: 'halved', home: 5, away: 4 } },
      { type: 'HOLE', payload: { winner: 'away' } },
    ]);
    assert.deepEqual(s.scores, [null, { home: 5, away: 4 }, null]);
    assert.equal(s.strokes?.homePH, ms.homePH);
    assert.equal(golfMatchStateOf(s).status, 'AS');
    const cleared = golfMatchReducer(s, { type: 'SET_STROKES' }) as GolfMatchState;
    assert.equal('strokes' in cleared, false);
    // a bad payload is ignored; a finished match ignores everything
    assert.equal(golfMatchReducer(s, { type: 'SET_STROKES', payload: { strokes: { holes: 'x' } } }), s);
    assert.equal(golfMatchReducer({ ...s, ended: true }, { type: 'HOLE', payload: { winner: 'home' } }).holes.length, 3);
  });
});

/* ------------------------------- SD-88 -------------------------------- */

describe('SD-88 — scorecard layout', () => {
  test('18 holes: 1–9, Out, 10–18, In, Tot; 9 holes: holes + Tot', () => {
    const cols = cardColumns(H);
    assert.equal(cols.length, 21);
    assert.deepEqual(cols.filter((c) => c.kind !== 'hole').map((c) => c.label), ['Out', 'In', 'Tot']);
    assert.equal(cols[9].label, 'Out');
    assert.equal(cols[10].label, '10');
    const nine = cardColumns(holesFor(course, 'back9'));
    assert.deepEqual(nine.map((c) => c.label), ['10', '11', '12', '13', '14', '15', '16', '17', '18', 'Tot']);
  });

  test('shapes, rows and subtotals', () => {
    assert.equal(scoreShape(3, 5), 'eagle');
    assert.equal(scoreShape(3, 4), 'birdie');
    assert.equal(scoreShape(4, 4), 'par');
    assert.equal(scoreShape(5, 4), 'bogey');
    assert.equal(scoreShape(7, 4), 'double');
    assert.equal(scoreShape('P', 4), null);
    const c = card(H.map((_, i) => (i === 0 ? -1 : i === 10 ? 'P' : i < 12 ? 1 : null)));
    c.putts = H.map((_, i) => (i < 3 ? 2 : null));
    const recv = H.map((h) => (h.si <= 4 ? 1 : 0));
    const r = cardRows(H, c, recv);
    const cols = cardColumns(H);
    const nums = r.strokes.map((s) => (typeof s === 'number' ? s : null));
    assert.equal(sumOver(nums, cols[9].idx), 36 - 1 + 8); // front: birdie + 8 bogeys
    assert.equal(sumOver(r.par, cols[9].idx), 36);
    assert.equal(r.net[3], H[3].par + 1 - 1); // hole 4 (SI 1): a shot
    assert.equal(r.net[10], null);
    assert.equal(r.points[10], 0);
    assert.equal(r.pickedUp, true);
    assert.deepEqual(r.putts?.slice(0, 4), [2, 2, 2, null]);
    assert.equal(cardRows(H, even(0), recv).putts, null, 'putts row only when tracked');
    assert.equal(sumOver(nums, cols[20].idx), 43 + 5 + 4); // + bogeys on 10 and 12 (11 picked up)
    const txt = cardShareText('Asha', 'Club', H, even(2), H.map(() => 0));
    assert.match(txt, /^⛳ Asha · Club · 74 \(\+2\) · Out 38 · In 36/);
  });
});

describe('SD-84 — profile history', () => {
  test('date order, last 20, counting set, index snapshots', async () => {
    const { handicapHistory } = await import('../src/sports/golf/handicap.ts');
    const lines = [
      { stats: { differential: 14, adjGross: 88, hcpIndex: 15 }, date: '2026-03-01', opponent: 'A' },
      { stats: { differential: 10, adjGross: 84, hcpIndex: 14.2 }, date: '2026-01-01', opponent: 'B' },
      { stats: { rounds: 1 }, date: '2026-02-01' },
      { stats: { differential: 12, adjGross: 86 }, date: '2026-02-15', opponent: 'C' },
    ];
    const h = handicapHistory(lines);
    assert.deepEqual(h.recent.map((d) => d.differential), [10, 12, 14]);
    assert.equal(h.estimate?.value, 8);
    assert.deepEqual([...h.counting], [0]);
    assert.deepEqual(h.snapshots.map((s) => s.index), [14.2, 15]);
    assert.equal(handicapHistory([]).estimate, null);
  });
});
