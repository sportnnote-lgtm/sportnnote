/**
 * Parity #15 — cricket run entry: 5 / 7 / custom runs, overthrows, all-run 4s,
 * and extras values (Wd+3, Nb+5, Bye 5). New optional payload keys only
 * (`boundary`, `overthrows`), so legacy logs replay exactly as before.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { init, reducer, clampRuns, ballRuns, symbolTone, runSymbol } from '../src/sports/cricket/engine.ts';
import type { CricketState } from '../src/sports/cricket/engine.ts';
import { editBall, ballSymbol, overSymbolTone, ballRuns as editBallRuns } from '../src/sports/cricket/editOvers.ts';
import type { ScoreAction } from '../src/sports/types.ts';
import type { MatchEventRecord } from '../src/core/types.ts';

// Same helpers as tests/cricket.test.mts.
function opened(): CricketState {
  let s = init({ overs: 5, playersPerSide: 11 });
  s = reducer(s, { type: 'SET_STRIKER', payload: { id: 's1', name: 'A' } });
  s = reducer(s, { type: 'SET_NONSTRIKER', payload: { id: 's2', name: 'B' } });
  s = reducer(s, { type: 'SET_BOWLER', payload: { id: 'b1', name: 'Bowler' } });
  return s;
}
const ball = (s: CricketState, type: string, payload: Record<string, unknown> = {}): CricketState =>
  reducer(s, { type, side: s.battingSide, payload: { ...payload, strikerId: s.strikerId, strikerName: s.strikerName, bowlerId: s.bowlerId, bowlerName: s.bowlerName } } as ScoreAction);
const home = (s: CricketState) => s.scores.home;
const lastEvent = (s: CricketState) => s.events[s.events.length - 1];

describe('#15 — runs off the bat', () => {
  for (const r of [5, 7]) {
    test(`RUNS ${r}: team, batter and bowler +${r}; one legal ball; no fours; strike swaps`, () => {
      const s = ball(opened(), 'RUNS', { runs: r, boundary: false });
      assert.equal(home(s).runs, r);
      assert.equal(home(s).balls, 1);
      assert.equal(s.batting.s1.runs, r);
      assert.equal(s.batting.s1.balls, 1);
      assert.equal(s.batting.s1.fours, 0);
      assert.equal(s.batting.s1.sixes, 0);
      assert.equal(s.bowling.b1.runs, r);
      assert.equal(s.bowling.b1.balls, 1);
      assert.equal(s.strikerId, 's2');
      assert.deepEqual(s.thisOver, [String(r)]);
    });
  }

  test('an all-run 4 is not a four: chip 4r, no swap, plain tone', () => {
    const s = ball(opened(), 'RUNS', { runs: 4, boundary: false });
    assert.equal(s.batting.s1.runs, 4);
    assert.equal(s.batting.s1.fours, 0);
    assert.deepEqual(s.thisOver, ['4r']);
    assert.equal(s.strikerId, 's1');
    assert.notEqual(lastEvent(s).tone, 'boundary');
    assert.match(lastEvent(s).label, /all run/);
    assert.equal(symbolTone('4r'), 'plain');
  });

  test('a legacy {runs: 4} (no flag) still counts a four — replays unchanged', () => {
    const s = ball(opened(), 'RUNS', { runs: 4 });
    assert.equal(s.batting.s1.fours, 1);
    assert.deepEqual(s.thisOver, ['4']);
    assert.equal(lastEvent(s).label, 'FOUR');
    assert.equal(lastEvent(s).tone, 'boundary');
    const six = ball(opened(), 'RUNS', { runs: 6 });
    assert.equal(six.batting.s1.sixes, 1);
    assert.equal(lastEvent(six).label, 'SIX');
    // the new tap sends boundary: true — same result as the legacy event
    const tapped = ball(opened(), 'RUNS', { runs: 4, boundary: true });
    assert.deepEqual(tapped.batting, s.batting);
    assert.deepEqual(tapped.thisOver, s.thisOver);
    assert.deepEqual(tapped.events, s.events);
  });

  test('1 + 4 overthrows: batter 5, no four, swap, chip 5ot, label mentions overthrows', () => {
    const s = ball(opened(), 'RUNS', { runs: 5, boundary: false, overthrows: 4 });
    assert.equal(home(s).runs, 5);
    assert.equal(s.batting.s1.runs, 5);
    assert.equal(s.batting.s1.fours, 0);
    assert.equal(s.bowling.b1.runs, 5);
    assert.equal(s.strikerId, 's2');
    assert.deepEqual(s.thisOver, ['5ot']);
    assert.match(lastEvent(s).label, /overthrow/);
    assert.equal(lastEvent(s).label, '5 runs (incl. 4 overthrows)');
    assert.notEqual(lastEvent(s).tone, 'boundary');
  });

  test('0 ran + 4 boundary overthrows is never a batter four (even without the flag)', () => {
    const s = ball(opened(), 'RUNS', { runs: 4, overthrows: 4 });
    assert.equal(s.batting.s1.fours, 0);
    assert.deepEqual(s.thisOver, ['4ot']);
  });

  test('runs are clamped to 0–99', () => {
    const s = ball(opened(), 'RUNS', { runs: 250, boundary: false });
    assert.equal(home(s).runs, 99);
    const neg = ball(opened(), 'RUNS', { runs: -2 });
    assert.equal(home(neg).runs, 0);
    assert.equal(home(neg).balls, 1);
  });
});

describe('#15 — extras values', () => {
  test('Wide +3: team, extras and bowler +4; 0 balls; strike swaps', () => {
    const s = ball(opened(), 'EXTRA', { kind: 'Wide', runs: 3 });
    assert.equal(home(s).runs, 4);
    assert.equal(home(s).extras, 4);
    assert.equal(home(s).balls, 0);
    assert.equal(s.bowling.b1.runs, 4);
    assert.equal(s.bowling.b1.balls, 0);
    assert.equal(s.strikerId, 's2');
    assert.deepEqual(s.thisOver, ['4wd']);
  });

  test('Wide +7 → +8', () => {
    const s = ball(opened(), 'EXTRA', { kind: 'Wide', runs: 7 });
    assert.equal(home(s).runs, 8);
    assert.equal(home(s).extras, 8);
    assert.equal(s.bowling.b1.runs, 8);
    assert.equal(home(s).balls, 0);
  });

  test('No ball {runs: 5}: team +6, batter 5 (1 ball), extras +1, bowler +6, free hit, no four', () => {
    const s = ball(opened(), 'EXTRA', { kind: 'No ball', runs: 5 });
    assert.equal(home(s).runs, 6);
    assert.equal(home(s).extras, 1);
    assert.equal(home(s).balls, 0);
    assert.equal(s.batting.s1.runs, 5);
    assert.equal(s.batting.s1.balls, 1);
    assert.equal(s.batting.s1.fours, 0);
    assert.equal(s.bowling.b1.runs, 6);
    assert.equal(s.freeHit, true);
  });

  test('No ball boundary flag: {6, boundary} → a six; {4, boundary: false} → no four; legacy 4 → a four', () => {
    const six = ball(opened(), 'EXTRA', { kind: 'No ball', runs: 6, boundary: true });
    assert.equal(six.batting.s1.sixes, 1);
    const allRun = ball(opened(), 'EXTRA', { kind: 'No ball', runs: 4, boundary: false });
    assert.equal(allRun.batting.s1.fours, 0);
    assert.equal(allRun.batting.s1.runs, 4);
    const legacy = ball(opened(), 'EXTRA', { kind: 'No ball', runs: 4 });
    assert.equal(legacy.batting.s1.fours, 1);
  });

  test('Byes 5: extras +5, bowler 0, striker +1 ball, strike swaps', () => {
    const s = ball(opened(), 'BYES', { runs: 5 });
    assert.equal(home(s).runs, 5);
    assert.equal(home(s).extras, 5);
    assert.equal(home(s).balls, 1);
    assert.equal(s.bowling.b1.runs, 0);
    assert.equal(s.bowling.b1.balls, 1);
    assert.equal(s.batting.s1.balls, 1);
    assert.equal(s.batting.s1.runs, 0);
    assert.equal(s.strikerId, 's2');
    assert.deepEqual(s.thisOver, ['b5']);
  });

  test('Wide +3 under local rules (Wide = 2) totals 5', () => {
    let s = opened();
    s = reducer(s, { type: 'SET_RULES', payload: { wideRuns: 2 } });
    s = ball(s, 'EXTRA', { kind: 'Wide', runs: 3 });
    assert.equal(home(s).runs, 5);
    assert.deepEqual(s.thisOver, ['5wd']);
  });
});

describe('#15 — symbol helpers', () => {
  test('clampRuns', () => {
    assert.equal(clampRuns(-3), 0);
    assert.equal(clampRuns(150), 99);
    assert.equal(clampRuns('7'), 7);
    assert.equal(clampRuns(undefined), 0);
    assert.equal(clampRuns(2.9), 2);
  });
  test('ballRuns / symbolTone / runSymbol', () => {
    assert.equal(ballRuns('5ot'), 5);
    assert.equal(ballRuns('4r'), 4);
    assert.equal(ballRuns('4'), 4);
    assert.equal(ballRuns('4wd'), 4);
    assert.equal(ballRuns('wd'), 1);
    assert.equal(ballRuns('wd', { wideRuns: 2, noBallRuns: 1 }), 2);
    assert.equal(ballRuns('5nb'), 6);
    assert.equal(symbolTone('4r'), 'plain');
    assert.equal(symbolTone('5ot'), 'plain');
    assert.equal(symbolTone('4'), 'boundary');
    assert.equal(symbolTone('6'), 'boundary');
    assert.equal(symbolTone('4wd'), 'extra');
    assert.equal(runSymbol(4, true), '4');
    assert.equal(runSymbol(5, false, 4), '5ot');
    assert.equal(runSymbol(6, false), '6r');
    assert.equal(runSymbol(7, false), '7');
  });
  test('the over editor shares the engine helpers', () => {
    assert.equal(overSymbolTone, symbolTone);
    assert.equal(editBallRuns, ballRuns);
    assert.equal(ballSymbol({ type: 'RUNS', payload: { runs: 5, boundary: false, overthrows: 4 } }), '5ot');
    assert.equal(ballSymbol({ type: 'RUNS', payload: { runs: 4, boundary: false } }), '4r');
    assert.equal(ballSymbol({ type: 'RUNS', payload: { runs: 4 } }), '4');
    // matches what the engine wrote to the live strip
    const s = ball(opened(), 'RUNS', { runs: 5, boundary: false, overthrows: 4 });
    assert.equal(s.thisOver[0], ballSymbol({ type: 'RUNS', payload: { runs: 5, boundary: false, overthrows: 4 } }));
  });
});

describe('#15 — editing a ball keeps the new keys', () => {
  test('editBall changing runs keeps boundary and overthrows (spread payload)', () => {
    const rec: MatchEventRecord = { seq: 7, type: 'RUNS', side: 'home', payload: { runs: 5, boundary: false, overthrows: 4, strikerId: 's1', strikerName: 'A', bowlerId: 'b1', bowlerName: 'Bowler' } } as MatchEventRecord;
    const out = editBall(rec, { runs: 6 }) as ScoreAction;
    assert.ok(!('error' in out));
    assert.equal(out.payload!.runs, 6);
    assert.equal(out.payload!.boundary, false);
    assert.equal(out.payload!.overthrows, 4);
    assert.equal(out.attribution?.by, 6);
  });
  test('a recorded 9 off the bat can still be edited (e.g. striker change)', () => {
    const rec: MatchEventRecord = { seq: 3, type: 'RUNS', payload: { runs: 9, boundary: false, strikerId: 's1', bowlerId: 'b1' } } as MatchEventRecord;
    const out = editBall(rec, { strikerId: 's2', strikerName: 'B' }) as ScoreAction;
    assert.ok(!('error' in out));
    assert.equal(out.payload!.runs, 9);
  });
});

describe('#15 — undo (replay without the last ball) reverses each entry', () => {
  test('1+4 ot, all-run 4, Wd+3, Nb+5 — each one undoes cleanly', () => {
    const steps: [string, Record<string, unknown>][] = [
      ['RUNS', { runs: 5, boundary: false, overthrows: 4 }],
      ['RUNS', { runs: 4, boundary: false }],
      ['EXTRA', { kind: 'Wide', runs: 3 }],
      ['EXTRA', { kind: 'No ball', runs: 5, boundary: false }],
    ];
    const states = [opened()];
    for (const [t, p] of steps) states.push(ball(states[states.length - 1], t, p));
    const final = states[states.length - 1];
    assert.equal(home(final).runs, 5 + 4 + 4 + 6);
    assert.equal(final.batting.s2.fours + (final.batting.s1?.fours ?? 0), 0);
    // replaying a prefix of the log reproduces each earlier state exactly
    for (let k = 0; k < steps.length; k++) {
      let s = opened();
      for (const [t, p] of steps.slice(0, k)) s = ball(s, t, p);
      assert.deepEqual(s, states[k]);
    }
  });
});
