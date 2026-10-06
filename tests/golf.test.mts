/**
 * Golf engine — WHS handicaps, Stableford, card maths, ranking + countback,
 * cut, match play, stats. See docs/sports/GOLF_DESIGN.md §4.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  standardPar72, holesFor, parOf, courseHandicap, playingHandicap, strokesReceived,
  stablefordPoints, summarize, rankLeaderboard, makesCut, matchState, holeWinner,
  matchPlayStrokes, roundStats, scoringAverage, toParLabel,
  type GolfCard, type HoleWinner, type RankInput,
} from '../src/sports/golf/engine.ts';

const H18 = standardPar72();
const tee = { name: 'Blue', courseRating: 71.5, slope: 128 };
const cardOf = (deltas: (number | 'P' | null)[], holes = H18): GolfCard => ({
  strokes: holes.map((h, i) => {
    const d = deltas[i];
    return d == null ? null : d === 'P' ? 'P' : h.par + d;
  }),
});
const zeros = (n: number) => new Array(n).fill(0);

describe('course + holes', () => {
  test('standard par-72 template', () => {
    assert.equal(H18.length, 18);
    assert.equal(parOf(H18), 72);
    assert.deepEqual([...H18.map((h) => h.si)].sort((a, b) => a - b), Array.from({ length: 18 }, (_, i) => i + 1));
  });
  test('front / back nine', () => {
    assert.deepEqual(holesFor({ holes: H18 }, 'front9').map((h) => h.n), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.deepEqual(holesFor({ holes: H18 }, 'back9').map((h) => h.n), [10, 11, 12, 13, 14, 15, 16, 17, 18]);
  });
});

describe('WHS handicaps', () => {
  test('course handicap = index × slope/113 + (CR − par), rounded', () => {
    // 14.2 × 128/113 + (71.5 − 72) = 15.585 → 16
    assert.equal(courseHandicap(14.2, tee, H18), 16);
  });
  test('no rating/slope → the index itself', () => {
    assert.equal(courseHandicap(14.2, undefined, H18), 14);
    assert.equal(courseHandicap(14.6, { name: 'White' }, H18), 15);
  });
  test('9 holes use half the index (and half the 18-hole rating)', () => {
    const front = holesFor({ holes: H18 }, 'front9');
    assert.equal(courseHandicap(14.2, undefined, front), 7);
    // 7.1 × 128/113 + (35.75 − 36) = 7.79 → 8
    assert.equal(courseHandicap(14.2, tee, front), 8);
  });
  test('playing handicap applies the allowance', () => {
    assert.equal(playingHandicap(16, 95), 15);
    assert.equal(playingHandicap(16, 100), 16);
    assert.equal(playingHandicap(9, 85), 8);
  });
  test('strokes received: PH 20 = one everywhere + a second on SI 1–2', () => {
    const r = strokesReceived(20, H18);
    assert.equal(r.reduce((a, b) => a + b, 0), 20);
    H18.forEach((h, i) => assert.equal(r[i], h.si <= 2 ? 2 : 1));
  });
  test('PH 5 gets strokes on SI 1–5 only', () => {
    const r = strokesReceived(5, H18);
    H18.forEach((h, i) => assert.equal(r[i], h.si <= 5 ? 1 : 0));
  });
  test('plus handicap gives strokes back on the easiest holes', () => {
    const r = strokesReceived(-2, H18);
    H18.forEach((h, i) => assert.equal(r[i], h.si >= 17 ? -1 : 0));
  });
  test('9-hole SIs are ranked among the nine', () => {
    const front = holesFor({ holes: H18 }, 'front9'); // SIs 7,11,15,1,5,9,17,3,13
    const r = strokesReceived(3, front);
    // hardest three of the nine: SI 1, 3, 5
    front.forEach((h, i) => assert.equal(r[i], [1, 3, 5].includes(h.si) ? 1 : 0));
  });
});

describe('card maths', () => {
  test('Stableford points = 2 + par + received − strokes, min 0', () => {
    assert.equal(stablefordPoints(5, 4, 1), 2); // net par
    assert.equal(stablefordPoints(3, 4, 1), 4); // net eagle
    assert.equal(stablefordPoints(8, 4, 1), 0);
    assert.equal(stablefordPoints('P', 4, 1), 0);
  });
  test('summary: gross, to-par, net, Stableford, thru', () => {
    // birdie, par, bogey on the first three holes, rest unplayed
    const card = cardOf([-1, 0, 1]);
    const recv = strokesReceived(18, H18);
    const s = summarize(card, H18, recv);
    assert.equal(s.thru, 3);
    assert.equal(s.complete, false);
    assert.equal(s.toPar, 0);
    assert.equal(s.gross, 4 - 1 + 4 + 3 + 1);
    assert.equal(s.netToPar, -3);
    assert.equal(s.stableford, 4 + 3 + 2);
  });
  test('a pickup is a no-return in stroke play and takes the cap in adjusted gross', () => {
    const card = cardOf([0, 'P']);
    const s = summarize(card, H18, zeros(18), { maxScore: 'ndb' });
    assert.equal(s.noReturn, true);
    assert.equal(s.adjustedGross, 4 + (4 + 2)); // par + net double bogey cap
  });
  test('net double bogey caps a blow-up hole', () => {
    const card = cardOf([5]); // a 9 on a par 4
    assert.equal(summarize(card, H18, zeros(18), { maxScore: 'ndb' }).adjustedGross, 6);
    assert.equal(summarize(card, H18, zeros(18), { maxScore: 'none' }).adjustedGross, 9);
  });
  test('to-par labels', () => {
    assert.equal(toParLabel(0), 'E');
    assert.equal(toParLabel(-3), '−3');
    assert.equal(toParLabel(2), '+2');
  });
});

describe('leaderboard', () => {
  const round = (deltas: number[]) => ({ card: cardOf(deltas), holes: H18, received: zeros(18) });
  // A and B both −2; A is better over the last nine.
  const A: RankInput = { id: 'A', status: 'finished', rounds: [round([-1, -1, 0, 0, 0, 0, 0, 0, 1, -1, 0, 0, 0, 0, 0, 0, 0, 0])] };
  const B: RankInput = { id: 'B', status: 'finished', rounds: [round([-1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1])] };
  const C: RankInput = { id: 'C', status: 'finished', rounds: [round([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])] };
  const D: RankInput = { id: 'D', status: 'dq', rounds: [round(zeros(18))] };

  test('stroke play: lowest wins; countback breaks the tie on the last 9', () => {
    const rows = rankLeaderboard([C, B, D, A], { scoring: 'stroke', net: false, tieBreak: 'countback' });
    assert.deepEqual(rows.map((r) => [r.id, r.positionLabel]), [['A', '1'], ['B', '2'], ['C', '3'], ['D', 'DQ']]);
    assert.equal(rows[0].total, -2);
  });
  test('shared ties show T1', () => {
    const rows = rankLeaderboard([C, B, A], { scoring: 'stroke', net: false, tieBreak: 'shared' });
    assert.deepEqual(rows.map((r) => r.positionLabel), ['T1', 'T1', '3']);
  });
  test('Stableford: highest points win', () => {
    const rows = rankLeaderboard([C, A], { scoring: 'stableford', net: false, tieBreak: 'countback' });
    assert.equal(rows[0].id, 'A');
    assert.equal(rows[0].total, 38);
  });
  test('players mid-round compare on to-par through holes played', () => {
    const P: RankInput = { id: 'P', status: 'playing', rounds: [round([-1, -1, -1])] }; // −3 thru 3
    const rows = rankLeaderboard([A, P], { scoring: 'stroke', net: false, tieBreak: 'countback' });
    assert.equal(rows[0].id, 'P');
    assert.equal(rows[0].thru, 3);
  });
  test('a stroke-play pickup ranks as no-return below finishers', () => {
    const X: RankInput = { id: 'X', status: 'finished', rounds: [{ card: cardOf([...zeros(17), 'P']), holes: H18, received: zeros(18) }] };
    const rows = rankLeaderboard([X, C], { scoring: 'stroke', net: false, tieBreak: 'countback' });
    assert.deepEqual(rows.map((r) => r.id), ['C', 'X']);
    assert.equal(rows[1].position, null);
  });
  test('multi-round totals add up across rounds', () => {
    const M: RankInput = { id: 'M', status: 'finished', rounds: [round([-1]), round([-2])] };
    const rows = rankLeaderboard([M], { scoring: 'stroke', net: false, tieBreak: 'countback' });
    assert.equal(rows[0].total, -3);
    assert.equal(rows[0].today, -2);
  });
});

describe('cut', () => {
  const rows = [
    { id: 'a', total: -5 }, { id: 'b', total: -3 }, { id: 'c', total: -1 }, { id: 'd', total: -1 }, { id: 'e', total: 2 },
  ].map((r, i) => ({ ...r, position: i + 1, positionLabel: String(i + 1), status: 'finished' as const, today: 0, thru: 18, grossTotal: 0, noReturn: false }));
  test('top N and ties', () => {
    assert.deepEqual(makesCut(rows, { type: 'top', n: 3 }), ['a', 'b', 'c', 'd']);
  });
  test('within X of the lead', () => {
    assert.deepEqual(makesCut(rows, { type: 'within', strokes: 4 }), ['a', 'b', 'c', 'd']);
  });
});

describe('match play', () => {
  const W = (s: string): HoleWinner[] => [...s].map((c) => (c === 'h' ? 'home' : c === 'a' ? 'away' : 'halved'));
  test('3&2: three up with two to play is closed out', () => {
    const m = matchState(W('hhh-------------' + '--'), 18); // 3 up after 16 (13 halved)
    assert.equal(m.decided, true);
    assert.equal(m.result, '3&2');
    assert.equal(m.winner, 'home');
  });
  test('dormie', () => {
    const m = matchState(W('hh--------------'), 18); // 2 up, 2 to play
    assert.equal(m.dormie, true);
    assert.equal(m.status, 'Dormie 2');
  });
  test('holes after the close-out are ignored', () => {
    const m = matchState(W('hhhhhhhhhh' + 'aaaaaaaa'), 18); // 10 up after 10 → 10&8
    assert.equal(m.result, '10&8');
    assert.equal(m.played, 10);
  });
  test('all square after 18: halved, or extra holes in a knockout', () => {
    const level = W('ha' + '-'.repeat(16));
    assert.equal(matchState(level, 18).result, 'Halved');
    const ko = matchState([...level, 'halved', 'away'], 18, true);
    assert.equal(ko.decided, true);
    assert.equal(ko.winner, 'away');
    assert.equal(ko.result, 'Won at the 20th hole');
  });
  test('1 UP after 18', () => {
    assert.equal(matchState(W('h' + '-'.repeat(17)), 18).result, '1 UP');
  });
  test('net hole winner + match-play strokes to the higher handicap', () => {
    assert.equal(holeWinner(5, 4, 1, 0), 'halved');
    assert.equal(holeWinner(5, 5, 1, 0), 'home');
    const s = matchPlayStrokes(12, 8, H18);
    assert.equal(s.home.reduce((a, b) => a + b, 0), 4);
    assert.equal(s.away.reduce((a, b) => a + b, 0), 0);
  });
});

describe('stats', () => {
  test('per-round stat line and scoring average', () => {
    const card: GolfCard = {
      ...cardOf([-2, -1, 0, 1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      putts: H18.map(() => 2),
      gir: H18.map((_, i) => i % 2 === 0),
      fir: H18.map((h) => (h.par >= 4 ? true : null)),
    };
    const s = roundStats(card, H18, zeros(18));
    assert.equal(s.eagles, 1);
    assert.equal(s.birdies, 1);
    assert.equal(s.bogeys, 1);
    assert.equal(s.doubles, 1);
    assert.equal(s.pars, 14);
    assert.equal(s.putts, 36);
    assert.equal(s.girHit, 9);
    assert.equal(s.firHoles, 14);
    assert.equal(s.toPar, 0);
    assert.equal(scoringAverage({ completeRounds: 2, completeStrokes: 160 }), 80);
  });
});
