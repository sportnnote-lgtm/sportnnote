/**
 * SD-08 — football minute notation, timeline order, ordinal minutes and
 * blocked shots.
 *
 * Standard: FIFA match reports print added time as 45+2' / 90+3' and number
 * minutes ordinally (a goal at 10:30 is in the 11th minute → 11'); Opta: shots =
 * on target + off target + blocked, and a blocked shot is never on target.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  init, reducer, currentMinute, clockLabel, minuteText, eventHalf, byMatchTimeDesc, footballStats,
  type FootballState,
} from '../src/sports/football/engine.ts';
import { footballTickerDetail, footballTickerFlash } from '../src/sports/football/ticker.ts';
import type { ScoreAction } from '../src/sports/types.ts';

const F = { halfMinutes: 45, etMinutes: 15 };
const run = (s: FootballState, ...as: ScoreAction[]) => as.reduce(reducer, s);
const goal = (side: 'home' | 'away', minute: number, half: 1 | 2 | 3 | 4, name: string): ScoreAction =>
  ({ type: 'GOAL', side, payload: { minute, half, goalType: 'open' }, attribution: { playerId: name, stat: 'goals', playerName: name } });

describe('SD-08 · FIFA minute notation', () => {
  test('added time reads 45+2\' and 90+3\', regulation minutes read plainly', () => {
    assert.equal(minuteText(47, 1, F), "45+2'");
    assert.equal(minuteText(93, 2, F), "90+3'");
    assert.equal(minuteText(45, 1, F), "45'");
    assert.equal(minuteText(46, 2, F), "46'");
    assert.equal(minuteText(90, 2, F), "90'");
    assert.equal(minuteText(106, 4, F), "106'"); // ET 2nd period
    assert.equal(minuteText(107, 3, F), "105+2'");
    assert.equal(minuteText(121, 4, F), "120+1'");
  });
  test('small-sided halves: a 7-a-side 25-minute half', () => {
    assert.equal(minuteText(27, 1, { halfMinutes: 25, etMinutes: 5 }), "25+2'");
    assert.equal(minuteText(52, 2, { halfMinutes: 25, etMinutes: 5 }), "50+2'");
  });
  test('no stored half (old events): derived from the minute', () => {
    assert.equal(minuteText(30, undefined, F), "30'");
    assert.equal(minuteText(60, undefined, F), "60'");
    assert.equal(eventHalf({ minute: 60 }, F), 2);
    assert.equal(eventHalf({ minute: 45 }, F), 1);
  });
  test('an old event whose stored half is far off its minute is placed by the minute', () => {
    // Old backfills were stamped with the then-current half: 67 in "half 1" is not 45+22'.
    assert.equal(minuteText(67, 1, F), "67'");
    assert.equal(eventHalf({ minute: 67, half: 1 }, F), 2);
  });
});

describe('SD-08 · timeline order (half, then minute, then log order)', () => {
  test('a first-half 45+2\' goal sits below a second-half 46\' card', () => {
    let s = init({});
    s = run(s,
      { type: 'KICKOFF', payload: { at: 1 } },
      goal('home', 47, 1, 'A'), // 45+2'
      { type: 'NEXT_HALF', payload: { at: 2 } },
      { type: 'YELLOW', side: 'away', payload: { minute: 46, half: 2 }, attribution: { playerId: 'B', stat: 'yellowCards', playerName: 'B' } },
    );
    const rows = s.events.map((e) => ({ half: eventHalf(e, F), minute: e.minute, order: e.id, text: minuteText(e.minute, e.half, F) }));
    const sorted = [...rows].sort(byMatchTimeDesc);
    assert.deepEqual(sorted.map((r) => r.text), ["46'", "45+2'"]); // newest first
    // The old minute-only sort put 47 above 46 — the bug.
    const old = [...rows].sort((a, b) => b.minute - a.minute || b.order - a.order);
    assert.deepEqual(old.map((r) => r.text), ["45+2'", "46'"]);
  });
  test('the same minute keeps log order', () => {
    const rows = [{ half: 2, minute: 60, order: 3 }, { half: 2, minute: 60, order: 5 }, { half: 1, minute: 40, order: 9 }];
    assert.deepEqual([...rows].sort(byMatchTimeDesc).map((r) => r.order), [5, 3, 9]);
  });
});

describe('SD-08 · ticker and flash use the notation', () => {
  test('scorer cells and the GOAL! flash read 45+2\'', () => {
    let s = run(init({}), { type: 'KICKOFF', payload: { at: 1 } }, goal('home', 12, 1, 'Anil Rao'));
    const before = s;
    s = reducer(s, goal('home', 47, 1, 'Anil Rao'));
    assert.deepEqual(footballTickerDetail(s, { home: 'H', away: 'A' }).left, ["⚽ Anil R. 12', 45+2'"]);
    assert.equal(footballTickerFlash(before, s)?.text, "GOAL! Anil R. 45+2'");
    s = run(s, { type: 'NEXT_HALF', payload: { at: 2 } }, goal('away', 93, 2, 'Dev Kumar'));
    assert.deepEqual(footballTickerDetail(s, { home: 'H', away: 'A' }).right, ["⚽ Dev K. 90+3'"]);
  });
});

describe('SD-08 · ordinal minutes for new matches', () => {
  const at = (msAgo: number) => Date.now() - msAgo;
  test('a new match (kickoff with `ord`) stamps the minute being played: 10:30 → 11\'', () => {
    const s = reducer(init({}), { type: 'KICKOFF', payload: { at: at(10.5 * 60000), ord: true } });
    assert.equal(s.minuteOrdinal, true);
    assert.equal(currentMinute(s), 11);
    assert.equal(clockLabel(s), "11'");
  });
  test('the opening half-minute is 1\', not 0\'', () => {
    const s = reducer(init({}), { type: 'KICKOFF', payload: { at: at(20000), ord: true } });
    assert.equal(currentMinute(s), 1);
  });
  test('first-half added time: 46:30 with +3 signalled → 47 = 45+2\'', () => {
    let s = reducer(init({}), { type: 'KICKOFF', payload: { at: at(46.5 * 60000), ord: true } });
    s = reducer(s, { type: 'SET_STOPPAGE', payload: { minutes: 3 } });
    assert.equal(currentMinute(s), 47);
    assert.equal(clockLabel(s), "45+2'");
    assert.equal(minuteText(currentMinute(s), s.half, s), "45+2'");
  });
  test('a half-time substitution is 46\'', () => {
    let s = reducer(init({}), { type: 'KICKOFF', payload: { at: at(60000), ord: true } });
    s = reducer(s, { type: 'NEXT_HALF', payload: { at: Date.now() } });
    assert.equal(currentMinute(s), 46);
  });
  test('older matches keep completed minutes (no flag): 10:30 → 10\'', () => {
    const s = reducer(init({}), { type: 'KICKOFF', payload: { at: at(10.5 * 60000) } });
    assert.equal(s.minuteOrdinal, undefined);
    assert.equal(currentMinute(s), 10);
  });
  test('a match already under way never switches convention mid-match', () => {
    let s = reducer(init({}), { type: 'KICKOFF', payload: { at: at(60000) } }); // old version kicked off
    s = reducer(s, goal('home', 10, 1, 'A'));
    s = reducer(s, { type: 'NEXT_HALF', payload: { at: Date.now() } });
    s = reducer(s, { type: 'KICKOFF', payload: { at: Date.now(), ord: true } }); // new version restarts
    assert.equal(s.minuteOrdinal, undefined);
  });
});

describe('SD-08 · a blocked shot is not on target', () => {
  const shot = (payload: Record<string, unknown>): ScoreAction =>
    ({ type: 'STAT', side: 'home', payload: { kind: 'shot', minute: 20, half: 1, ...payload }, attribution: { playerId: 'p1', stat: 'shots', playerName: 'Striker' } });
  test('shots = on + off + blocked; the block credits the defender', () => {
    const s = run(init({}),
      shot({ onTarget: true }),
      shot({ onTarget: false }),
      shot({ onTarget: false, blocked: true }),
      { type: 'STAT', side: 'away', payload: { kind: 'block', minute: 20, half: 1 }, attribution: { playerId: 'd1', stat: 'blocks', playerName: 'Defender' } },
    );
    const { totals, players } = footballStats(s, 0);
    assert.equal(totals.home.shots, 3);
    assert.equal(totals.home.shotsOnTarget, 1);
    assert.equal(totals.home.blockedShots, 1);
    assert.equal(players.find((p) => p.id === 'p1')?.shotsOnTarget, 1);
    assert.equal(s.stats[2].blocked, true);
    assert.equal(s.stats[3].kind, 'block');
  });
  test('old logs: a block recorded as on target (no flag) stays as stored', () => {
    const s = run(init({}), shot({ onTarget: true }));
    assert.equal(s.stats[0].blocked, undefined);
    assert.equal(footballStats(s, 0).totals.home.shotsOnTarget, 1);
  });
});
