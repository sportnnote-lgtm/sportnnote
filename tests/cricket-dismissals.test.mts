/**
 * Parity #16 — cricket dismissals: retired out, Mankad, hit the ball twice,
 * obstructing the field, stumped / hit wicket off a wide, and run-outs with a
 * 2nd fielder, byes / leg byes (`runsAs`) and the end the wicket was broken at
 * (`end`). New kinds and new optional keys only (REVIEW Decision 8), so legacy
 * logs replay exactly as before (tests/cricket*.test.mts, replay-wave1).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  init, reducer, composeDismissal, creaseAfterWicket, wicketAttribution, ballRuns, symbolTone, involvedPlayerIds,
} from '../src/sports/cricket/engine.ts';
import type { CricketState } from '../src/sports/cricket/engine.ts';
import { editBall, ballSymbol, editableOvers, isEditableBall } from '../src/sports/cricket/editOvers.ts';
import type { ScoreAction } from '../src/sports/types.ts';
import type { MatchEventRecord } from '../src/core/types.ts';

// Same helpers as tests/cricket-runs.test.mts: s1 on strike, s2 non-striker, b1 bowling.
function opened(config: Record<string, unknown> = {}): CricketState {
  let s = init({ overs: 5, playersPerSide: 11, ...config });
  s = reducer(s, { type: 'SET_KEEPER', payload: { side: 'away', id: 'k1', name: 'Keeper' } });
  s = reducer(s, { type: 'SET_STRIKER', payload: { id: 's1', name: 'A' } });
  s = reducer(s, { type: 'SET_NONSTRIKER', payload: { id: 's2', name: 'B' } });
  s = reducer(s, { type: 'SET_BOWLER', payload: { id: 'b1', name: 'Bowler' } });
  return s;
}
const ball = (s: CricketState, type: string, payload: Record<string, unknown> = {}): CricketState =>
  reducer(s, { type, side: s.battingSide, payload: { strikerId: s.strikerId, strikerName: s.strikerName, bowlerId: s.bowlerId, bowlerName: s.bowlerName, ...payload } } as ScoreAction);
const wicket = (s: CricketState, payload: Record<string, unknown>) => ball(s, 'WICKET', { newBatId: 'n1', newBatName: 'New', ...payload });
const extra = (s: CricketState, payload: Record<string, unknown>) => ball(s, 'EXTRA', { newBatId: 'n1', newBatName: 'New', ...payload });
const home = (s: CricketState) => s.scores.home;
const lastEvent = (s: CricketState) => s.events[s.events.length - 1];
const lastDismissal = (s: CricketState) => s.dismissals[s.dismissals.length - 1];

describe('#16 — retired out', () => {
  test('a wicket, no ball, not the bowler\'s; text "retired out"; can\'t return', () => {
    const s0 = ball(opened(), 'RUNS', { runs: 1 });
    const s = wicket(s0, { kind: 'retiredout', batterOut: 'nonstriker' });
    assert.equal(home(s).wickets, 1);
    assert.equal(home(s).balls, home(s0).balls);
    assert.equal(s.ballsInOver, s0.ballsInOver);
    assert.equal(s.bowling.b1.wickets, 0);
    assert.equal(s.batting.s1.dismissal, 'retired out'); // s1 was at the non-striker's end after the single
    assert.equal(s.batting.s1.out, true);
    assert.notEqual(s.batting.s1.retired, true);
    assert.equal(s.nonStrikerId, 'n1');
    assert.equal(lastEvent(s).label, 'RETIRED OUT');
    // can't come back: re-sending them to the crease keeps the card out
    const back = reducer(s, { type: 'SET_NONSTRIKER', payload: { id: 's1', name: 'A' } });
    assert.equal(back.batting.s1.out, true);
  });

  test('retired hurt is still not a wicket and can resume', () => {
    const s = wicket(opened(), { kind: 'retired', batterOut: 'striker' });
    assert.equal(home(s).wickets, 0);
    assert.equal(s.batting.s1.retired, true);
    assert.equal(s.batting.s1.out, false);
    assert.equal(s.dismissals.length, 0);
    const back = reducer(s, { type: 'SET_NONSTRIKER', payload: { id: 's1', name: 'A' } });
    assert.equal(back.batting.s1.retired, false);
  });
});

describe('#16 — Mankad', () => {
  test('non-striker out even if the payload names the striker; no ball; W chip; free hit kept', () => {
    // A no-ball first → the next ball is a free hit.
    const s0 = ball(opened(), 'EXTRA', { kind: 'No ball', runs: 0 });
    assert.equal(s0.freeHit, true);
    const s = wicket(s0, { kind: 'mankad', batterOut: 'striker' });
    assert.equal(s.batting.s2.out, true);
    assert.equal(s.batting.s1.out, false);
    assert.equal(s.batting.s2.dismissal, 'run out (Bowler)');
    assert.equal(home(s).wickets, 1);
    assert.equal(home(s).balls, home(s0).balls);
    assert.equal(s.ballsInOver, s0.ballsInOver);
    assert.equal(s.thisOver[s.thisOver.length - 1], 'W');
    assert.equal(s.freeHit, true);
    assert.equal(s.bowling.b1.wickets, 0);
    assert.equal(s.bowling.b1.balls, 0);
    assert.equal(s.strikerId, 's1');
    assert.equal(s.nonStrikerId, 'n1');
    assert.deepEqual(lastDismissal(s), { kind: 'mankad', outId: 's2', bowlerId: 'b1', fielderId: 'b1', fielderName: 'Bowler' });
  });

  test('composeDismissal shows a Mankad as a run-out by the bowler', () => {
    assert.equal(composeDismissal('mankad', 'Ishaan'), 'run out (Ishaan)');
  });

  test('credit: the bowler\'s run-out, never a wicket', () => {
    const c = wicketAttribution({ kind: 'mankad', bowler: { id: 'b1', name: 'Bowler' } });
    assert.deepEqual(c, { attribution: { playerId: 'b1', stat: 'runouts', playerName: 'Bowler' } });
  });
});

describe('#16 — hit the ball twice', () => {
  test('a legal ball, the striker out (whatever batterOut says), not the bowler\'s wicket', () => {
    const s = wicket(opened(), { kind: 'hittwice', batterOut: 'nonstriker' });
    assert.equal(home(s).balls, 1);
    assert.equal(s.ballsInOver, 1);
    assert.equal(s.batting.s1.out, true);
    assert.equal(s.batting.s1.dismissal, 'hit the ball twice');
    assert.equal(s.batting.s2.out, false);
    assert.equal(s.bowling.b1.wickets, 0);
    assert.equal(s.bowling.b1.balls, 1);
  });

  test('via EXTRA No ball: +1, no legal ball, free hit next', () => {
    const s = extra(opened(), { kind: 'No ball', wicket: 'hittwice', runs: 3 });
    assert.equal(home(s).runs, 1); // runs forced to 0 — only the penalty
    assert.equal(home(s).balls, 0);
    assert.equal(home(s).wickets, 1);
    assert.equal(s.freeHit, true);
    assert.equal(s.batting.s1.out, true);
    assert.equal(s.bowling.b1.wickets, 0);
    assert.deepEqual(s.thisOver, ['nb+W']);
  });

  test('not allowed on a wide (rejected, state unchanged)', () => {
    const s0 = opened();
    assert.equal(extra(s0, { kind: 'Wide', wicket: 'hittwice' }), s0);
    assert.equal(extra(s0, { kind: 'No ball', wicket: 'stumped' }), s0);
    assert.equal(extra(s0, { kind: 'Wide', wicket: 'caught' }), s0);
  });
});

describe('#16 — obstructing the field', () => {
  test('non-striker out with {runs: 2} → batter +2; not the bowler\'s wicket', () => {
    const s = wicket(opened(), { kind: 'obstruct', batterOut: 'nonstriker', runs: 2 });
    assert.equal(s.batting.s1.runs, 2);
    assert.equal(s.batting.s2.out, true);
    assert.equal(s.batting.s2.dismissal, 'obstructing the field');
    assert.equal(home(s).runs, 2);
    assert.equal(s.bowling.b1.wickets, 0);
    assert.equal(s.bowling.b1.runs, 2);
    assert.deepEqual(s.thisOver, ['2+W']);
  });

  test('via EXTRA Wide → 1 + runs as extras, 0 balls', () => {
    const s = extra(opened(), { kind: 'Wide', wicket: 'obstruct', runs: 2, batterOut: 'striker' });
    assert.equal(home(s).runs, 3);
    assert.equal(home(s).extras, 3);
    assert.equal(home(s).balls, 0);
    assert.equal(s.batting.s1.runs, 0);
    assert.equal(s.batting.s1.out, true);
    assert.deepEqual(s.thisOver, ['2wd+W']);
    assert.equal(ballRuns('2wd+W'), 3);
  });
});

describe('#16 — stumped / hit wicket off a wide', () => {
  test('stumped: +1, 0 balls, bowler +1 wicket, fielder = keeper', () => {
    const s = extra(opened(), { kind: 'Wide', wicket: 'stumped', runs: 2, batterOut: 'nonstriker' });
    assert.equal(home(s).runs, 1);
    assert.equal(home(s).balls, 0);
    assert.equal(home(s).wickets, 1);
    assert.equal(s.bowling.b1.wickets, 1);
    assert.equal(s.bowling.b1.runs, 1);
    assert.equal(s.bowling.b1.balls, 0);
    assert.equal(s.batting.s1.out, true); // always the striker
    assert.equal(s.batting.s1.dismissal, 'st Keeper b Bowler');
    assert.deepEqual(lastDismissal(s), { kind: 'stumped', outId: 's1', bowlerId: 'b1', fielderId: 'k1', fielderName: 'Keeper' });
    assert.deepEqual(s.thisOver, ['wd+W']);
    assert.equal(lastEvent(s).label, 'Wide — STUMPED');
    const c = wicketAttribution({ kind: 'stumped', bowler: { id: 'b1', name: 'Bowler' }, keeper: { id: 'k1', name: 'Keeper' }, wide: true });
    assert.deepEqual(c.attribution, { playerId: 'b1', stat: 'wickets', by: 1, playerName: 'Bowler' });
    assert.deepEqual(c.attribution2, { playerId: 'k1', stat: 'stumpings', playerName: 'Keeper' });
  });

  test('hit wicket: +1, 0 balls, bowler +1 wicket', () => {
    const s = extra(opened(), { kind: 'Wide', wicket: 'hitwicket' });
    assert.equal(home(s).runs, 1);
    assert.equal(home(s).balls, 0);
    assert.equal(s.bowling.b1.wickets, 1);
    assert.equal(s.batting.s1.dismissal, 'hit wkt b Bowler');
  });

  test('the wide value in force (local rules) is used, not a literal +1', () => {
    const s = extra(opened({ wideRuns: 2 }), { kind: 'Wide', wicket: 'stumped' });
    assert.equal(home(s).runs, 2);
    assert.equal(s.bowling.b1.runs, 2);
    assert.equal(ballRuns('wd+W', { wideRuns: 2, noBallRuns: 1 }), 2);
  });

  test('a legal wide (local rules) counts the ball', () => {
    const s = extra(opened({ wideLegal: true }), { kind: 'Wide', wicket: 'stumped' });
    assert.equal(home(s).balls, 1);
    assert.equal(s.ballsInOver, 1);
    assert.equal(s.bowling.b1.balls, 1);
  });
});

describe('#16 — run-outs: runsAs, 2nd fielder', () => {
  test('{runs: 1, runsAs: "bye"}: extras +1, striker 0 runs +1 ball, bowler 0 runs', () => {
    const s = wicket(opened(), { kind: 'runout', runs: 1, runsAs: 'bye', batterOut: 'striker', fielderId: 'f1', fielderName: 'F1' });
    assert.equal(home(s).runs, 1);
    assert.equal(home(s).extras, 1);
    assert.equal(home(s).balls, 1);
    assert.equal(s.batting.s1.runs, 0);
    assert.equal(s.batting.s1.balls, 1);
    assert.equal(s.bowling.b1.runs, 0);
    assert.equal(s.bowling.b1.balls, 1);
    assert.deepEqual(s.thisOver, ['1b+W']);
    assert.match(lastEvent(s).detail ?? '', /\(1 bye\)$/);
  });

  test('leg byes chip 2lb+W; chips classify as wickets and decode their runs', () => {
    const s = wicket(opened(), { kind: 'runout', runs: 2, runsAs: 'legbye' });
    assert.deepEqual(s.thisOver, ['2lb+W']);
    for (const [sym, runs] of [['2b+W', 2], ['2lb+W', 2], ['1+W', 1], ['W', 0], ['nb+W', 1], ['2nb+W', 3], ['wd+W', 1], ['1wd+W', 2]] as const) {
      assert.equal(symbolTone(sym), 'wicket', sym);
      assert.equal(ballRuns(sym), runs, sym);
    }
  });

  test('a no-ball run-out with runsAs "legbye": batter 0 runs, extras = penalty + leg byes', () => {
    const s = extra(opened(), { kind: 'No ball', wicket: 'runout', runs: 2, runsAs: 'legbye', batterOut: 'nonstriker' });
    assert.equal(s.batting.s1.runs, 0);
    assert.equal(s.batting.s1.balls, 1);
    assert.equal(home(s).runs, 3);
    assert.equal(home(s).extras, 3);
    assert.equal(s.bowling.b1.runs, 1); // the penalty only
    assert.equal(s.batting.s2.out, true);
  });

  test('a no-ball run-out off the bat still credits the batter (legacy maths)', () => {
    const s = extra(opened(), { kind: 'No ball', wicket: 'runout', runs: 2 });
    assert.equal(s.batting.s1.runs, 2);
    assert.equal(home(s).extras, 1);
  });

  test('legacy `runout: true` still maps to a run-out — same maths as `wicket: "runout"`', () => {
    for (const kind of ['Wide', 'No ball']) {
      const a = extra(opened(), { kind, runout: true, runs: 1, batterOut: 'nonstriker', fielderId: 'f1', fielderName: 'F1' });
      const b = extra(opened(), { kind, wicket: 'runout', runs: 1, batterOut: 'nonstriker', fielderId: 'f1', fielderName: 'F1' });
      assert.deepEqual(a.scores, b.scores);
      assert.deepEqual(a.batting, b.batting);
      assert.deepEqual(a.thisOver, b.thisOver);
      assert.equal(a.strikerId, b.strikerId);
      assert.deepEqual(a.dismissals[0], { kind: 'runout', outId: 's2', fielderId: 'f1', fielderName: 'F1' }); // legacy record shape
    }
  });

  test('composeDismissal with a 2nd fielder → run out (A/B); recorded, no stat', () => {
    assert.equal(composeDismissal('runout', 'b', 'A', 'k', 'B'), 'run out (A/B)');
    assert.equal(composeDismissal('runout', 'b', 'A'), 'run out (A)');
    const s = wicket(opened(), { kind: 'runout', fielderId: 'f1', fielderName: 'A', fielder2Id: 'k1', fielder2Name: 'Keeper' });
    assert.equal(s.batting.s1.dismissal, 'run out (A/Keeper)');
    assert.equal(lastDismissal(s).fielder2Id, 'k1');
    assert.ok(involvedPlayerIds(s).includes('k1'));
    const c = wicketAttribution({ kind: 'runout', fielder: { id: 'f1', name: 'A' }, striker: { id: 's1', name: 'A' } });
    assert.deepEqual(c.attribution, { playerId: 'f1', stat: 'runouts', playerName: 'A' });
    assert.equal(c.attribution2, undefined); // no runs → no striker credit; fielder 2 never credited
  });

  test('striker credit (attribution2) only for runs off the bat — this spec owns it', () => {
    const base = { kind: 'runout' as const, fielder: { id: 'f1', name: 'F' }, striker: { id: 's1', name: 'A' } };
    assert.deepEqual(wicketAttribution({ ...base, runs: 2 }).attribution2, { playerId: 's1', stat: 'runs', by: 2, playerName: 'A' });
    assert.equal(wicketAttribution({ ...base, runs: 2, runsAs: 'bye' }).attribution2, undefined);
    assert.equal(wicketAttribution({ ...base, runs: 2, wide: true }).attribution2, undefined);
    assert.deepEqual(wicketAttribution({ ...base, kind: 'obstruct', runs: 1 }), { attribution2: { playerId: 's1', stat: 'runs', by: 1, playerName: 'A' } });
    assert.deepEqual(wicketAttribution({ kind: 'hittwice', bowler: { id: 'b1' } }), {});
    assert.deepEqual(wicketAttribution({ kind: 'retiredout', bowler: { id: 'b1' } }), {});
  });
});

describe('#16 — `end`: who faces next', () => {
  test('striker out at the bowler\'s end mid-over → the survivor faces', () => {
    const s = wicket(opened(), { kind: 'runout', batterOut: 'striker', end: 'bowler', runs: 0 });
    assert.equal(s.strikerId, 's2');
    assert.equal(s.nonStrikerId, 'n1');
  });

  test('striker out at the striker\'s end → the new batter faces (even after 1 run)', () => {
    const s = wicket(opened(), { kind: 'runout', batterOut: 'striker', end: 'striker', runs: 1 });
    assert.equal(s.strikerId, 'n1');
    assert.equal(s.nonStrikerId, 's2');
  });

  test('non-striker out at the striker\'s end → the new batter faces', () => {
    const s = wicket(opened(), { kind: 'runout', batterOut: 'nonstriker', end: 'striker', runs: 1 });
    assert.equal(s.strikerId, 'n1');
    assert.equal(s.nonStrikerId, 's1');
  });

  test('last ball of the over → swapped', () => {
    let s = opened();
    for (let i = 0; i < 5; i++) s = ball(s, 'RUNS', { runs: 0 });
    s = wicket(s, { kind: 'runout', batterOut: 'striker', end: 'striker', runs: 0 });
    // new batter took the striker's end, then the over ended → the survivor faces
    assert.equal(s.strikerId, 's2');
    assert.equal(s.nonStrikerId, 'n1');
    assert.equal(s.bowlerId, undefined);
  });

  test('on a wide: no over end, `end` decides', () => {
    const s = extra(opened(), { kind: 'Wide', wicket: 'runout', batterOut: 'striker', end: 'bowler', runs: 1 });
    assert.equal(s.strikerId, 's2');
    assert.equal(s.nonStrikerId, 'n1');
  });

  test('without `end`: legacy behaviour (vacated end, then odd-run parity)', () => {
    const s = wicket(opened(), { kind: 'runout', batterOut: 'striker', runs: 1 });
    // n1 takes the striker's end, then the odd run swaps
    assert.equal(s.strikerId, 's2');
    assert.equal(s.nonStrikerId, 'n1');
    const z = wicket(opened(), { kind: 'runout', batterOut: 'nonstriker', runs: 0 });
    assert.equal(z.strikerId, 's1');
    assert.equal(z.nonStrikerId, 'n1');
  });

  test('`end` is ignored for a kind where the batters can\'t have crossed', () => {
    const s = wicket(opened(), { kind: 'bowled', end: 'bowler' });
    assert.equal(s.strikerId, 'n1');
  });

  test('creaseAfterWicket (shared with the UI preview)', () => {
    const c = { strikerId: 's1', strikerName: 'A', nonStrikerId: 's2', nonStrikerName: 'B' };
    const nb = { id: 'n1', name: 'New' };
    assert.deepEqual(creaseAfterWicket(c, 'striker', 'bowler', nb, false), { strikerId: 's2', strikerName: 'B', nonStrikerId: 'n1', nonStrikerName: 'New' });
    assert.deepEqual(creaseAfterWicket(c, 'striker', 'striker', nb, false), { strikerId: 'n1', strikerName: 'New', nonStrikerId: 's2', nonStrikerName: 'B' });
    assert.deepEqual(creaseAfterWicket(c, 'nonstriker', 'bowler', nb, true), { strikerId: 'n1', strikerName: 'New', nonStrikerId: 's1', nonStrikerName: 'A' });
  });
});

describe('#16 — over editor (#06) agreement', () => {
  const rec = (seq: number, type: string, payload: Record<string, unknown>): MatchEventRecord =>
    ({ seq, type, side: 'home', payload: { strikerId: 's1', strikerName: 'A', bowlerId: 'b1', bowlerName: 'Bowler', ...payload } });

  test('editBall on a run-out keeps runsAs, end and fielder2Id (spread payload)', () => {
    const r = rec(9, 'WICKET', { kind: 'runout', runs: 1, runsAs: 'bye', end: 'bowler', fielderId: 'f1', fielderName: 'F1', fielder2Id: 'k1', fielder2Name: 'Keeper', batterOut: 'striker' });
    const a = editBall(r, { fielderId: 'f2', fielderName: 'F2' }) as ScoreAction;
    assert.equal(a.payload!.runsAs, 'bye');
    assert.equal(a.payload!.end, 'bowler');
    assert.equal(a.payload!.fielder2Id, 'k1');
    assert.equal(a.payload!.fielder2Name, 'Keeper');
    assert.equal(a.payload!.fielderId, 'f2');
    assert.equal(a.attribution2, undefined); // byes → no striker credit
  });

  test('editBall on an EXTRA {wicket} keeps `wicket` (and the credits)', () => {
    const st = rec(10, 'EXTRA', { kind: 'Wide', wicket: 'stumped', runs: 0 });
    const a = editBall(st, { extraRuns: 0 }, { keeper: { id: 'k1', name: 'Keeper' } }) as ScoreAction;
    assert.equal(a.payload!.wicket, 'stumped');
    assert.deepEqual(a.attribution, { playerId: 'b1', stat: 'wickets', by: 1, playerName: 'Bowler' });
    assert.deepEqual(a.attribution2, { playerId: 'k1', stat: 'stumpings', playerName: 'Keeper' });
    // a stumping can't move to a no-ball
    assert.ok('error' in editBall(st, { extraKind: 'noball' }));
    const ro = rec(11, 'EXTRA', { kind: 'No ball', wicket: 'runout', runs: 1, runsAs: 'legbye', end: 'striker' });
    const b = editBall(ro, { extraRuns: 2 }) as ScoreAction;
    assert.equal(b.payload!.wicket, 'runout');
    assert.equal(b.payload!.runsAs, 'legbye');
    assert.equal(b.payload!.end, 'striker');
  });

  test('editBall accepts hit twice / obstructing; refuses Mankad / retired out', () => {
    const ob = rec(12, 'WICKET', { kind: 'obstruct', runs: 2, batterOut: 'nonstriker' });
    const a = editBall(ob, { runs: 1 }) as ScoreAction;
    assert.equal(a.payload!.kind, 'obstruct');
    assert.equal(a.payload!.runs, 1);
    assert.equal(a.payload!.batterOut, 'nonstriker');
    assert.equal(isEditableBall(rec(13, 'WICKET', { kind: 'mankad' })), false);
    assert.equal(isEditableBall(rec(14, 'WICKET', { kind: 'retiredout' })), false);
  });

  test('ballSymbol mirrors the engine\'s chips; the editor skips a Mankad / retired out', () => {
    const CFG = { overs: 5, playersPerSide: 11 };
    const setup: MatchEventRecord[] = [
      { seq: 1, type: 'SET_KEEPER', payload: { side: 'away', id: 'k1', name: 'Keeper' } },
      { seq: 2, type: 'SET_STRIKER', payload: { id: 's1', name: 'A' } },
      { seq: 3, type: 'SET_NONSTRIKER', payload: { id: 's2', name: 'B' } },
      { seq: 4, type: 'SET_BOWLER', payload: { id: 'b1', name: 'Bowler' } },
    ];
    const balls: MatchEventRecord[] = [
      rec(5, 'WICKET', { kind: 'runout', runs: 2, runsAs: 'bye', batterOut: 'nonstriker', end: 'bowler', newBatId: 'n1', newBatName: 'N1' }),
      rec(6, 'EXTRA', { kind: 'Wide', wicket: 'stumped', newBatId: 'n2', newBatName: 'N2' }),
      { seq: 7, type: 'WICKET', side: 'home', payload: { kind: 'mankad', bowlerId: 'b1', bowlerName: 'Bowler', newBatId: 'n3', newBatName: 'N3' } },
      { seq: 8, type: 'WICKET', side: 'home', payload: { kind: 'retiredout', batterOut: 'striker', newBatId: 'n4', newBatName: 'N4' } },
      rec(9, 'EXTRA', { kind: 'No ball', wicket: 'obstruct', runs: 1, runsAs: 'legbye', newBatId: 'n5', newBatName: 'N5' }),
    ];
    // replay through the reducer (strikerId on later balls must match the crease)
    let s = setup.reduce((x, e) => reducer(x, { type: e.type, payload: e.payload }), init(CFG));
    const strip: string[] = [];
    for (const b of balls) {
      const p = { ...b.payload } as Record<string, unknown>;
      if (b.type !== 'WICKET' || (p.kind !== 'mankad' && p.kind !== 'retiredout')) { p.strikerId = s.strikerId; p.strikerName = s.strikerName; }
      b.payload = p;
      s = reducer(s, { type: b.type, side: 'home', payload: p });
      if (isEditableBall(b)) strip.push(ballSymbol(b));
    }
    assert.deepEqual(s.thisOver, ['2b+W', 'wd+W', 'W', '1nb+W']);
    assert.deepEqual(strip, ['2b+W', 'wd+W', '1nb+W']);
    const ed = editableOvers([...setup, ...balls], CFG);
    assert.deepEqual(ed[0].overs[0].balls.map((x) => x.sym), ['2b+W', 'wd+W', '1nb+W']);
    assert.equal(home(s).wickets, 5);
  });
});
