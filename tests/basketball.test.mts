/**
 * Basketball scoring engine — the ground-ready capture set (go-live sport audit).
 * Free throws (made/miss/and-one), shooting-foul flow, foul types & team-foul
 * bonus, steals/blocks/turnovers, timeouts, on-court subs, and remove-reversal.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  init, reducer, teamFoulsThisQuarter, inBonus, timeoutsUsed, onCourtNames, isFouledOut, foulCount,
  type BasketballState,
} from '../src/sports/basketball/engine.ts';
import type { ScoreAction } from '../src/sports/types.ts';

const run = (s: BasketballState, ...as: ScoreAction[]) => as.reduce(reducer, s);
const scoreAct = (side: 'home' | 'away', points: number, who?: string): ScoreAction =>
  ({ type: 'SCORE', side, payload: { points }, attribution: who ? { playerId: who, stat: 'points', by: points, playerName: who } : undefined });
const ft = (side: 'home' | 'away', made: boolean, who?: string): ScoreAction =>
  ({ type: 'FREE_THROW', side, payload: { made }, attribution: who ? { playerId: who, stat: made ? 'points' : 'freeThrowsAtt', by: 1, playerName: who } : undefined });
const foul = (side: 'home' | 'away', who: string, foulType = 'personal'): ScoreAction =>
  ({ type: 'FOUL', side, payload: { foulType }, attribution: { playerId: who, stat: 'fouls', playerName: who } });

describe('basketball — scoring & free throws', () => {
  test('field goals add 1/2/3', () => {
    const s = run(init(), scoreAct('home', 2), scoreAct('away', 3), scoreAct('home', 1));
    assert.equal(s.home, 3);
    assert.equal(s.away, 3);
  });

  test('made free throw scores 1, missed scores 0 but is logged', () => {
    const s = run(init(), ft('home', true, 'A'), ft('home', false, 'A'));
    assert.equal(s.home, 1);
    const fts = s.events.filter((e) => e.type === 'freethrow');
    assert.equal(fts.length, 2);
    assert.deepEqual(fts.map((e) => e.made), [true, false]);
  });

  test('and-one: basket + one made free throw = 3', () => {
    const s = run(init(), scoreAct('home', 2, 'A'), ft('home', true, 'A'));
    assert.equal(s.home, 3);
  });

  test('shooting foul awards free throws to the other team', () => {
    // home fouls (shooting) → away shoots two, makes both
    const s = run(init(), foul('home', 'X', 'shooting'), ft('away', true, 'Y'), ft('away', true, 'Y'));
    assert.equal(s.away, 2);
    assert.equal(s.home, 0);
    assert.equal(s.events.find((e) => e.type === 'foul')?.foulType, 'shooting');
  });
});

describe('basketball — fouls & bonus', () => {
  test('technical fouls do not count toward the team-foul bonus', () => {
    const s = run(init(), foul('home', 'A'), foul('home', 'B'), foul('home', 'C', 'technical'));
    assert.equal(teamFoulsThisQuarter(s, 'home'), 2); // technical excluded
  });

  test('team reaches the bonus once the opponent hits the foul limit', () => {
    const base = init({ foulsForBonus: 2 });
    const s = run(base, foul('home', 'A'), foul('home', 'B'));
    assert.equal(inBonus(s, 'away'), true); // away shoots because home fouled twice
    assert.equal(inBonus(s, 'home'), false);
  });

  test('a fouled-out player cannot score further', () => {
    const s0 = run(init({ foulsToFoulOut: 2 }), foul('home', 'A'), foul('home', 'A'));
    assert.equal(isFouledOut(s0, 'A'), true);
    const s1 = run(s0, scoreAct('home', 2, 'A'));
    assert.equal(s1.home, 0); // blocked
  });
});

describe('basketball — stats, timeouts, subs', () => {
  test('steal / block / turnover are logged', () => {
    const s = run(init(),
      { type: 'STEAL', side: 'home', attribution: { playerId: 'A', stat: 'steals', playerName: 'A' } },
      { type: 'BLOCK', side: 'home', attribution: { playerId: 'B', stat: 'blocks', playerName: 'B' } },
      { type: 'TURNOVER', side: 'away', attribution: { playerId: 'C', stat: 'turnovers', playerName: 'C' } });
    assert.equal(s.events.filter((e) => ['steal', 'block', 'turnover'].includes(e.type)).length, 3);
  });

  test('timeouts are counted per side', () => {
    const s = run(init(), { type: 'TIMEOUT', side: 'home' }, { type: 'TIMEOUT', side: 'home' }, { type: 'TIMEOUT', side: 'away' });
    assert.equal(timeoutsUsed(s, 'home'), 2);
    assert.equal(timeoutsUsed(s, 'away'), 1);
  });

  test('on-court list follows the starting five and substitutions', () => {
    const s = run(init(),
      { type: 'SET_LINEUP', payload: { home: ['A', 'B', 'C', 'D', 'E'] } },
      { type: 'SUB', side: 'home', payload: { offName: 'A', onName: 'F' } });
    assert.deepEqual(onCourtNames(s, 'home'), ['F', 'B', 'C', 'D', 'E']);
  });
});

describe('basketball — corrections & game end', () => {
  test('removing a made free throw takes the point back off the board', () => {
    const s0 = run(init(), ft('home', true, 'A'));
    assert.equal(s0.home, 1);
    const id = s0.events.find((e) => e.type === 'freethrow')!.id;
    const s1 = reducer(s0, { type: 'REMOVE_EVENT', side: 'home', payload: { id } });
    assert.equal(s1.home, 0);
  });

  test('removing a missed free throw does not change the score', () => {
    const s0 = run(init(), scoreAct('home', 2), ft('home', false, 'A'));
    const id = s0.events.find((e) => e.type === 'freethrow')!.id;
    const s1 = reducer(s0, { type: 'REMOVE_EVENT', side: 'home', payload: { id } });
    assert.equal(s1.home, 2);
  });

  test('a first-to-N game ends on the clinching basket', () => {
    let s = init({ targetPoints: 11, winBy: 2, regPeriods: 1 });
    for (let i = 0; i < 5; i++) s = reducer(s, scoreAct('home', 2)); // 10
    assert.equal(s.ended, false);
    s = reducer(s, scoreAct('home', 2)); // 12, lead ≥ 2
    assert.equal(s.ended, true);
    assert.equal(s.home, 12);
  });
});

import { pointsOf } from '../src/sports/basketball/events.ts';

describe('basketball — a real-game-style sequence replayed play-by-play', () => {
  // Q1 (home tips off):
  //   H1 hits a 3 → 3-0 · A1 hits a 2 → 3-2 · shooting foul on H3, A1 makes both
  //   free throws → 3-4 · H2 defensive rebound · H1 assist · A2 steal · home timeout
  //   · H1 hits a 2 → 5-4 · end of Q1
  const sc = (side: 'home' | 'away', pts: number, who: string): ScoreAction =>
    ({ type: 'SCORE', side, payload: { points: pts }, attribution: { playerId: who, stat: 'points', by: pts, playerName: who } });
  const ft = (side: 'home' | 'away', who: string): ScoreAction =>
    ({ type: 'FREE_THROW', side, payload: { made: true }, attribution: { playerId: who, stat: 'points', by: 1, playerName: who } });
  const stat = (type: string, side: 'home' | 'away', s: string, who: string): ScoreAction =>
    ({ type, side, attribution: { playerId: who, stat: s, playerName: who } });

  const g = run(init(),
    { type: 'KICKOFF', payload: { at: 1 } },
    sc('home', 3, 'H1'),
    sc('away', 2, 'A1'),
    { type: 'FOUL', side: 'home', payload: { foulType: 'shooting' }, attribution: { playerId: 'H3', stat: 'fouls', playerName: 'H3' } },
    ft('away', 'A1'), ft('away', 'A1'),
    stat('REBOUND', 'home', 'rebounds', 'H2'),
    stat('ASSIST', 'home', 'assists', 'H1'),
    stat('STEAL', 'away', 'steals', 'A2'),
    { type: 'TIMEOUT', side: 'home' },
    sc('home', 2, 'H1'),
    { type: 'NEXT_QUARTER' },
  );

  const pts = (who: string) => g.events.filter((e) => e.playerName === who).reduce((n, e) => n + pointsOf(e), 0);

  test('the line score is right and the game advanced to Q2', () => {
    assert.deepEqual([g.home, g.away], [5, 4]);
    assert.equal(g.quarter, 2);
  });

  test('box-score points per player include field goals AND free throws', () => {
    assert.equal(pts('H1'), 5); // a 3 and a 2
    assert.equal(pts('A1'), 4); // a 2 + two made free throws
  });

  test('non-scoring stats and the timeout are recorded', () => {
    assert.equal(g.events.filter((e) => e.type === 'rebound').length, 1);
    assert.equal(g.events.filter((e) => e.type === 'assist').length, 1);
    assert.equal(g.events.filter((e) => e.type === 'steal').length, 1);
    assert.equal(foulCount(g, 'H3'), 1);
    assert.equal(timeoutsUsed(g, 'home'), 1);
  });
})

import { isEjected, isPlayerOut } from '../src/sports/basketball/engine.ts';

describe('basketball — player ejection (Tier-1 gap fix)', () => {
  test('an ejected player is out for the game and cannot score, even under the foul limit', () => {
    let s = run(init(), foul('home', 'E'), { type: 'EJECT', side: 'home', attribution: { playerId: 'E', stat: 'ejections', playerName: 'E' } });
    assert.equal(isEjected(s, 'E'), true);
    assert.equal(isPlayerOut(s, 'E'), true); // out, though only 1 personal foul
    s = run(s, scoreAct('home', 2, 'E'));
    assert.equal(s.home, 0); // blocked — ejected
  });

  test('removing the eject event reinstates the player', () => {
    let s = run(init(), { type: 'EJECT', side: 'away', attribution: { playerId: 'F', stat: 'ejections', playerName: 'F' } });
    const id = s.events.find((e) => e.type === 'eject')!.id;
    s = reducer(s, { type: 'REMOVE_EVENT', side: 'away', payload: { id } });
    assert.equal(isEjected(s, 'F'), false);
  });
})
