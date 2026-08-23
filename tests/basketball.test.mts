/**
 * Basketball scoring engine — the ground-ready capture set (go-live sport audit).
 * Free throws (made/miss/and-one), shooting-foul flow, foul types & team-foul
 * bonus, steals/blocks/turnovers, timeouts, on-court subs, and remove-reversal.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  init, reducer, teamFoulsThisQuarter, inBonus, timeoutsUsed, onCourtNames, isFouledOut,
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
