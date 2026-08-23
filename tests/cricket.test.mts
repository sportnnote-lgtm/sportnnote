/**
 * Cricket extras — wide+runs and byes-off-a-no-ball (sport coverage audit).
 * A wide/no-ball is never a legal ball (the over doesn't advance); the fixes let
 * a scorer capture the runs that are actually run off them, charged correctly.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { init, reducer } from '../src/sports/cricket/engine.ts';
import type { CricketState } from '../src/sports/cricket/engine.ts';
import type { ScoreAction } from '../src/sports/types.ts';

// A fresh innings with a striker, non-striker and bowler set.
function opened(): CricketState {
  let s = init({ overs: 5, playersPerSide: 11 });
  s = reducer(s, { type: 'SET_STRIKER', payload: { id: 's1', name: 'A' } });
  s = reducer(s, { type: 'SET_NONSTRIKER', payload: { id: 's2', name: 'B' } });
  s = reducer(s, { type: 'SET_BOWLER', payload: { id: 'b1', name: 'Bowler' } });
  return s;
}
// Mimic the ball() wrapper: stamp the current striker/bowler onto the delivery.
const ext = (s: CricketState, payload: Record<string, unknown>): CricketState =>
  reducer(s, { type: 'EXTRA', payload: { ...payload, strikerId: s.strikerId, strikerName: s.strikerName, bowlerId: s.bowlerId, bowlerName: s.bowlerName } } as ScoreAction);
const home = (s: CricketState) => s.scores.home;

describe('cricket — wides', () => {
  test('a plain wide is +1 extra and not a legal ball', () => {
    const s = ext(opened(), { kind: 'Wide' });
    assert.equal(home(s).runs, 1);
    assert.equal(home(s).extras, 1);
    assert.equal(home(s).balls, 0); // over does not advance
    assert.equal(s.bowling.b1.runs, 1);
    assert.equal(s.bowling.b1.extras, 1);
  });

  test('wide + runs adds all of them as extras charged to the bowler', () => {
    const s = ext(opened(), { kind: 'Wide', runs: 2 }); // e.g. 2 byes run on the wide
    assert.equal(home(s).runs, 3);
    assert.equal(home(s).extras, 3);
    assert.equal(home(s).balls, 0);
    assert.equal(s.bowling.b1.runs, 3);
  });

  test('an odd number of runs on a wide rotates strike', () => {
    const s = ext(opened(), { kind: 'Wide', runs: 1 });
    assert.equal(s.strikerId, 's2'); // crossed once
  });
});

describe('cricket — no-balls', () => {
  test('a plain no-ball is +1, a free hit, and a ball faced', () => {
    const s = ext(opened(), { kind: 'No ball' });
    assert.equal(home(s).runs, 1);
    assert.equal(home(s).extras, 1);
    assert.equal(s.freeHit, true);
    assert.equal(s.batting.s1.balls, 1);
    assert.equal(home(s).balls, 0); // still not a legal ball
  });

  test('no-ball + off-bat runs credit the striker, charge the bowler', () => {
    const s = ext(opened(), { kind: 'No ball', runs: 4 });
    assert.equal(home(s).runs, 5); // 1 penalty + 4 off the bat
    assert.equal(s.batting.s1.runs, 4);
    assert.equal(s.batting.s1.fours, 1);
    assert.equal(home(s).extras, 1); // only the penalty is an extra
    assert.equal(s.bowling.b1.runs, 5);
  });

  test('byes off a no-ball are team extras, not charged to the bowler or batter', () => {
    const s = ext(opened(), { kind: 'No ball', byes: 2 });
    assert.equal(home(s).runs, 3); // 1 penalty + 2 byes
    assert.equal(home(s).extras, 3); // penalty + byes
    assert.equal(s.batting.s1.runs, 0); // batter didn't hit it
    assert.equal(s.batting.s1.balls, 1); // but faced the ball
    assert.equal(s.bowling.b1.runs, 1); // bowler charged only the penalty
    assert.equal(s.freeHit, true);
  });
});

describe('cricket — penalty runs & run-outs off an extra', () => {
  test('a 5-run penalty is added as extras, not a ball', () => {
    const s = reducer(opened(), { type: 'PENALTY', payload: { runs: 5 } });
    assert.equal(home(s).runs, 5);
    assert.equal(home(s).extras, 5);
    assert.equal(home(s).balls, 0);
  });

  test('run-out off a wide: +1 + completed runs as extras, a wicket, no over progress', () => {
    const s = ext(opened(), { kind: 'Wide', runout: true, runs: 1, batterOut: 'striker', fielderName: 'F', newBatId: 's3', newBatName: 'C' });
    assert.equal(home(s).runs, 2); // 1 wide + 1 completed
    assert.equal(home(s).extras, 2);
    assert.equal(home(s).wickets, 1);
    assert.equal(home(s).balls, 0); // NOT a legal ball
    assert.equal(s.batting.s1.out, true);
    assert.equal(s.bowling.b1.wickets, 0); // run-out — no bowler credit
  });

  test('run-out off a no-ball: +1, a free hit, the non-striker run out, no over progress', () => {
    const s = ext(opened(), { kind: 'No ball', runout: true, runs: 0, batterOut: 'nonstriker', fielderName: 'F', newBatId: 's3', newBatName: 'C' });
    assert.equal(home(s).runs, 1);
    assert.equal(home(s).wickets, 1);
    assert.equal(home(s).balls, 0);
    assert.equal(s.freeHit, true);
    assert.equal(s.batting.s1.balls, 1); // striker still faced the no-ball
    assert.equal(s.batting.s2.out, true); // non-striker run out
  });
});
