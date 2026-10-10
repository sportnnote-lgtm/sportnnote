/**
 * SD-113 — cricket scoring safety (engine half):
 *  • A3/R1: a v:2 wicket confirmed with `noBatterLeft` closes the innings short
 *    of `wicketsLimit` (short squad, subs, retired hurt who can't resume) and
 *    counts as all out for NRR. Without `v: 2` the flag is ignored (Decision 8).
 *  • R2: a five-run penalty riding on one delivery (`payload.pen`, v:2) — the
 *    ball, then the penalty, as ONE logged action (one Undo).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { init, reducer, nrrOvers, noBatterLeft, type CricketState } from '../src/sports/cricket/engine.ts';
import { replayCricket } from '../src/sports/cricket/editOvers.ts';
import type { MatchEventRecord } from '../src/core/types.ts';
import type { ScoreAction } from '../src/sports/types.ts';

const CFG = { overs: 5, playersPerSide: 11 };

class Rec {
  log: MatchEventRecord[] = [];
  s: CricketState;
  constructor(cfg: Record<string, unknown> = CFG) { this.s = init(cfg); }
  push(a: ScoreAction): this {
    const rec: MatchEventRecord = { seq: this.log.length + 1, type: a.type };
    if (a.side) rec.side = a.side;
    if (a.payload) rec.payload = a.payload;
    this.log.push(rec);
    this.s = reducer(this.s, a);
    return this;
  }
  ball(type: string, payload: Record<string, unknown> = {}): this {
    const s = this.s;
    return this.push({ type, side: s.battingSide, payload: { strikerId: s.strikerId, strikerName: s.strikerName, bowlerId: s.bowlerId, bowlerName: s.bowlerName, ...payload } });
  }
  bowler(id: string) { return this.push({ type: 'SET_BOWLER', payload: { id, name: id } }); }
  open(a = 'A', b = 'B') {
    return this.push({ type: 'SET_STRIKER', payload: { id: a, name: a } }).push({ type: 'SET_NONSTRIKER', payload: { id: b, name: b } });
  }
  keep() { if (!this.s.bowlerId) this.bowler(this.s.lastOverBowlerId === 'X' ? 'Y' : 'X'); return this; }
}

const pen5 = (against: 'batting' | 'fielding' = 'fielding', reason = 'Ball hit helmet') =>
  ({ v: 2, pen: { runs: 5, against, reason, teamName: 'T' } });

describe('SD-113 A3/R1 — no batter left closes the innings', () => {
  test('legacy: the flag without v:2 is ignored (innings stays open, replay identical)', () => {
    const r = new Rec().open().bowler('X').ball('RUNS', { runs: 4 });
    r.ball('WICKET', { kind: 'bowled', noBatterLeft: true });
    assert.equal(r.s.innings, 1);
    assert.equal(r.s.closedNoBatter, undefined);
    assert.equal(noBatterLeft(r.s, 'home'), false);
    assert.deepEqual(replayCricket(r.log, CFG).scores, r.s.scores);
  });

  test('v:2 wicket with noBatterLeft at 4/1 → innings 1 closes, chase target 5, counts as all out for NRR', () => {
    const r = new Rec().open().bowler('X').ball('RUNS', { runs: 4 });
    r.ball('WICKET', { kind: 'bowled', v: 2, noBatterLeft: true });
    assert.equal(r.s.innings, 2);
    assert.equal(r.s.battingSide, 'away');
    assert.equal(r.s.target, 5);
    assert.equal(r.s.scores.home.wickets, 1);
    assert.deepEqual(r.s.closedNoBatter, { home: true });
    assert.equal(noBatterLeft(r.s, 'home'), true);
    // all out → charged the full 5 overs, not the 2 balls faced
    assert.equal(nrrOvers(r.s).home, 5);
    assert.ok(r.s.events.some((e) => e.label === 'INNINGS CLOSED'));
    // replay of the stored log gives the same state
    const re = replayCricket(r.log, CFG);
    assert.equal(re.innings, 2);
    assert.equal(re.target, 5);
  });

  test('in the chase, a closing wicket short of the target ends the match (a loss)', () => {
    const r = new Rec().open().bowler('X').ball('RUNS', { runs: 6 });
    r.push({ type: 'END_INNINGS' });
    r.open('P', 'Q').bowler('M').ball('RUNS', { runs: 2 });
    r.ball('WICKET', { kind: 'caught', fielderId: 'A', fielderName: 'A', v: 2, noBatterLeft: true });
    assert.equal(r.s.ended, true);
    assert.equal(r.s.closedNoBatter?.away, true);
  });

  test('retired hurt with no one to come in also closes the innings (not a wicket)', () => {
    const r = new Rec().open().bowler('X').ball('RUNS', { runs: 1 });
    r.ball('WICKET', { kind: 'retired', batterOut: 'striker', v: 2, noBatterLeft: true });
    assert.equal(r.s.innings, 2);
    assert.equal(r.s.scores.home.wickets, 0);
  });

  test('a wicket off a wide may carry it; a plain wide may not', () => {
    const a = new Rec().open().bowler('X');
    a.ball('EXTRA', { kind: 'Wide', runs: 0, v: 2, noBatterLeft: true });
    assert.equal(a.s.innings, 1);
    const b = new Rec().open().bowler('X');
    b.ball('EXTRA', { kind: 'Wide', wicket: 'stumped', v: 2, noBatterLeft: true });
    assert.equal(b.s.innings, 2);
    assert.equal(b.s.target, 2); // the wide's 1 run + 1
  });
});

describe('SD-113 R2 — a penalty on one delivery', () => {
  test('a 1 with +5 (fielding side penalised) → 6 runs, 5 extras, 1 ball, one logged action', () => {
    const r = new Rec().open().bowler('X').ball('RUNS', { runs: 1, ...pen5('fielding') });
    assert.equal(r.log.length, 4);
    assert.equal(r.s.scores.home.runs, 6);
    assert.equal(r.s.scores.home.extras, 5);
    assert.equal(r.s.scores.home.balls, 1);
    assert.equal(r.s.batting.A.runs, 1);
    assert.equal(r.s.bowling.X.runs, 1); // the bowler isn't charged the penalty
    assert.ok(r.s.events.at(-1)!.label.startsWith('5 penalty runs to T'));
    // two ball-log records: the ball and the penalty
    const recs = r.s.log!;
    assert.equal(recs.at(-2)!.bat, 1);
    assert.equal(recs.at(-1)!.pen, 5);
    // undo = replay without the last event → no penalty, no ball
    const undone = replayCricket(r.log.slice(0, -1), CFG);
    assert.equal(undone.scores.home.runs, 0);
  });

  test('without v:2 the pen key is ignored (legacy replay)', () => {
    const r = new Rec().open().bowler('X').ball('RUNS', { runs: 1, pen: { runs: 5, against: 'fielding' } });
    assert.equal(r.s.scores.home.runs, 1);
  });

  test('against the batting side → runs to the fielding side; in the chase the target rises', () => {
    const r = new Rec().open().bowler('X').ball('RUNS', { runs: 6 });
    r.push({ type: 'END_INNINGS' });
    r.open('P', 'Q').bowler('M');
    assert.equal(r.s.target, 7);
    r.ball('RUNS', { runs: 2, ...pen5('batting', 'Damaging pitch') });
    assert.equal(r.s.scores.away.runs, 2);
    assert.equal(r.s.scores.home.runs, 11);
    assert.equal(r.s.target, 12);
  });

  test('on the last ball of innings 1 the penalty still reaches the right team', () => {
    const r = new Rec({ overs: 1, playersPerSide: 11 }).open().bowler('X');
    for (let i = 0; i < 5; i++) r.ball('RUNS', { runs: 0 });
    // fielding side penalised on ball 6 → the 5 go to home (who just batted)
    r.ball('RUNS', { runs: 1, ...pen5('fielding') });
    assert.equal(r.s.innings, 2);
    assert.equal(r.s.scores.home.runs, 6);
    assert.equal(r.s.scores.away.runs, 0);
    assert.equal(r.s.target, 7); // target raised by the penalty
  });

  test('on the winning ball the penalty is booked and the result re-settled', () => {
    const r = new Rec().open().bowler('X').ball('RUNS', { runs: 3 });
    r.push({ type: 'END_INNINGS' });
    r.open('P', 'Q').bowler('M');
    r.ball('RUNS', { runs: 4, ...pen5('fielding') });
    assert.equal(r.s.ended, true);
    assert.equal(r.s.scores.away.runs, 9);
  });

  test('a retired-hurt "wicket" carries no penalty (no delivery)', () => {
    const r = new Rec().open().bowler('X').ball('WICKET', { kind: 'retired', batterOut: 'striker', ...pen5() });
    assert.equal(r.s.scores.home.runs, 0);
  });
});
