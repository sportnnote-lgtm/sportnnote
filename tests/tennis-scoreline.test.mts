/**
 * SD-02 — tennis scoreline correctness: each set keeps its tiebreak score so a
 * result reads 7-6(4); the Grand Slam deciding set is played in games with a
 * 10-point tiebreak at 6-6 (`finalSetTBAt`), distinct from the champions'
 * (match) tiebreak that replaces the whole set (`finalSetTiebreak`, kept for
 * matches created with the old `gs5` preset).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as L from './racketLogs.mts';
import { init, reducer, summary, scoreLine, setTiebreaks, inTiebreak, serveInfo, type TennisState } from '../src/sports/tennis/engine.ts';
import { pointInputs } from '../src/sports/rallyEdit.ts';
import type { ScoreAction } from '../src/sports/types.ts';

const run = (s: TennisState, log: ScoreAction[]) => log.reduce(reducer, s);
/** The new Grand Slam preset's values (tennis/index.tsx `gs5`). */
const SLAM = { setsToWin: 3, gamesPerSet: 6, setWinByTwo: true, tiebreakAt: 6, setTiebreak: true, tiebreakPoints: 7, noAd: false, finalSetTiebreak: 0, finalSetTBAt: 6 };
/** What the OLD gs5 preset stored in a match's format. */
const OLD_GS5 = { setsToWin: 3, gamesPerSet: 6, setWinByTwo: true, tiebreakAt: 6, setTiebreak: true, tiebreakPoints: 7, noAd: false, finalSetTiebreak: 10 };

describe('tiebreak score kept per set', () => {
  test('7-6(4): the set keeps games 7-6 and the tiebreak points 7-4', () => {
    const s = run(init(), L.TENNIS_BO3);
    assert.deepEqual(s.sets, [[6, 4], [3, 6], [7, 6]]);
    assert.deepEqual(s.tb, [null, null, [7, 4]]);
    assert.equal(scoreLine(s), '6-4, 3-6, 7-6(4)');
  });

  test('a lost tiebreak reads from the winner’s line too: 6-7(5)', () => {
    const s = run(init(), [...L.tTiebreakSet(6, [...L.tbPts('home', 5), ...L.tbPts('away', 7)])]);
    assert.equal(scoreLine(s), '6-7(5)');
  });

  test('extended tiebreak 7-6(10) (12-10)', () => {
    const tb = [...Array.from({ length: 10 }, (_, i) => (i % 2 ? 'away' : 'home') as 'home' | 'away').flatMap((sd) => L.tbPts(sd, 1))];
    // 5-5 after 10 alternating points; then trade to 10-10 and home takes two.
    const more = [...Array.from({ length: 10 }, (_, i) => (i % 2 ? 'away' : 'home') as 'home' | 'away').flatMap((sd) => L.tbPts(sd, 1)), ...L.tbPts('home', 2)];
    const s = run(init(), L.tTiebreakSet(6, [...tb, ...more]));
    assert.deepEqual(s.tb, [[12, 10]]);
    assert.equal(scoreLine(s), '7-6(10)');
  });

  test('derived state: EDIT_LOG replay rebuilds the same tiebreak scores', () => {
    const s = run(init(), L.TENNIS_BO3);
    const replayed = reducer(s, { type: 'EDIT_LOG', payload: { points: pointInputs(s.events) } });
    assert.deepEqual(replayed.sets, s.sets);
    assert.deepEqual(replayed.tb, s.tb);
    assert.equal(summary(replayed).detailLine, '6-4, 3-6, 7-6(4)');
  });

  test('a snapshot saved before SD-02 (no `tb`) still reads 7-6(4) — counted from the log', () => {
    const s = run(init(), L.TENNIS_BO3);
    const old = { ...s } as TennisState;
    delete old.tb;
    delete old.finalSetTBAt;
    assert.deepEqual(setTiebreaks(old), [null, null, [7, 4]]);
    assert.equal(scoreLine(old), '6-4, 3-6, 7-6(4)');
  });

  test('the live summary carries completed sets with their tiebreaks', () => {
    const s = run(init(), [...L.tTiebreakSet(6, L.tbPts('home', 7)), ...L.tGame('away')]);
    const sm = summary(s);
    assert.equal(sm.homeScore, '0');
    assert.equal(sm.detailLine, 'Games 0-1 · 7-6(0)');
  });
});

describe('Grand Slam deciding set — 10-point tiebreak at 6-6', () => {
  const twoAll = () => run(init(SLAM), L.TENNIS_TWO_ALL);

  test('the deciding set is played in games (no tiebreak at 0-0)', () => {
    const s = twoAll();
    assert.deepEqual(s.setsWon, { home: 2, away: 2 });
    assert.equal(inTiebreak(s), false);
    const after = run(s, L.tGame('home'));
    assert.deepEqual(after.games, { home: 1, away: 0 });
  });

  test('sets 1-4 still use the normal 7-point tiebreak', () => {
    const s = run(init(SLAM), L.tTiebreakSet(6, L.tbPts('home', 7)));
    assert.deepEqual(s.sets, [[7, 6]]);
    assert.deepEqual(s.tb, [[7, 0]]);
  });

  test('6-6 → tiebreak to 10, win by 2: 9-9, 10-9 play on, 11-9 wins → 7-6(9)', () => {
    let s = run(twoAll(), L.tTiebreakSet(6, []));
    assert.deepEqual(s.games, { home: 6, away: 6 });
    assert.equal(inTiebreak(s), true);
    // 7-0 would have won a normal tiebreak — not this one.
    s = run(s, L.tbPts('home', 7));
    assert.equal(s.ended, false);
    s = run(s, L.tbPts('away', 9)); // 7-9
    s = run(s, L.tbPts('home', 2)); // 9-9
    assert.equal(s.ended, false);
    s = run(s, L.tbPts('home', 1)); // 10-9: not by two
    assert.equal(s.ended, false);
    s = run(s, L.tbPts('home', 1)); // 11-9
    assert.equal(s.ended, true);
    assert.deepEqual(s.sets[4], [7, 6]);
    assert.deepEqual(s.tb?.[4], [11, 9]);
    const sm = summary(s);
    assert.equal(sm.homeScore, '3');
    assert.equal(sm.awayScore, '2');
    assert.equal(sm.detailLine, '6-3, 4-6, 6-2, 3-6, 7-6(9)');
  });

  test('a 10-point decider tiebreak: 10-4 → 7-6(4)', () => {
    const s = run(twoAll(), L.tTiebreakSet(6, [...L.tbPts('away', 4), ...L.tbPts('home', 10)]));
    assert.ok(s.ended);
    assert.equal(scoreLine(s), '6-3, 4-6, 6-2, 3-6, 7-6(4)');
  });

  test('the decider tiebreak counts as one game for the serve rotation', () => {
    const s = run(twoAll(), L.tTiebreakSet(6, []));
    const first = serveInfo(s).side;
    const afterOne = run(s, L.tbPts('home', 1));
    assert.notEqual(serveInfo(afterOne).side, first); // serve passes after point 1
  });

  test('old gs5 matches keep their stored rule: a champions’ tiebreak → [10-8]', () => {
    const s = run(init(OLD_GS5), [...L.TENNIS_TWO_ALL, ...L.tbPts('home', 4), ...L.tbPts('away', 8), ...L.tbPts('home', 6)]);
    assert.ok(s.ended);
    assert.deepEqual(s.sets[4], [10, 8]); // unchanged legacy shape
    assert.equal(summary(s).detailLine, '6-3, 4-6, 6-2, 3-6, [10-8]');
  });

  test('a match-tiebreak-only format (match_tb) reads [10-7]', () => {
    const s = run(init({ setsToWin: 1, finalSetTiebreak: 10, noAd: true }), [...L.tbPts('home', 7), ...L.tbPts('away', 7), ...L.tbPts('home', 3)]);
    assert.ok(s.ended);
    assert.equal(scoreLine(s), '[10-7]');
    assert.deepEqual(summary(s), { homeScore: '1', awayScore: '0', statusLine: 'Match Over', detailLine: '[10-7]' });
  });
});
