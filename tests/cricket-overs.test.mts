/**
 * Cricket overs & target (parity #18): change overs anytime (SET_OVERS), a
 * ball-accurate Standard Edition DLS revision on RAIN, a manual target
 * (SET_TARGET), and the par-based result with its "(DLS)" suffix — all gated
 * behind `v: 2` → `state.dlsV = 2` (REVIEW Decision 8). A RAIN without `v`
 * replays exactly today's maths.
 *
 * Cases A–I seed scores into `init()` state, then dispatch (each sends `v: 2`).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { init, reducer, resultLine, outcome, dlsResources, type CricketState } from '../src/sports/cricket/engine.ts';
import { effectiveRules } from '../src/sports/cricket/rules.ts';
import { resourcePct, revisedTarget } from '../src/sports/cricket/dls.ts';
import { editBall, replayCricket } from '../src/sports/cricket/editOvers.ts';
import type { MatchEventRecord } from '../src/core/types.ts';
import type { ScoreAction } from '../src/sports/types.ts';

const T20 = { overs: 20, dls: true };
const ODI = { overs: 50, dls: true };
const HUNDRED = { overs: 10, ballsPerOver: 10, dls: true };

const inn = (runs: number, wickets: number, balls: number) => ({ runs, wickets, balls, extras: 0 });
/** Overwrite the batting side's innings (a seeded score). */
const seed = (s: CricketState, runs: number, wickets: number, balls: number): CricketState =>
  ({ ...s, scores: { ...s.scores, [s.battingSide]: inn(runs, wickets, balls) }, ballsInOver: balls % s.ballsPerOver === 0 && balls > 0 ? s.ballsPerOver : balls % s.ballsPerOver });
const go = (s: CricketState, ...as: ScoreAction[]) => as.reduce(reducer, s);
const rain = (overs: number, v2 = true): ScoreAction => ({ type: 'RAIN', payload: v2 ? { overs, v: 2 } : { overs } });
const setOvers = (overs: number): ScoreAction => ({ type: 'SET_OVERS', payload: { overs, v: 2 } });
const setTarget = (runs: number, overs: number): ScoreAction => ({ type: 'SET_TARGET', payload: { runs, overs, v: 2 } });
const END_INN: ScoreAction = { type: 'END_INNINGS' };
const one: ScoreAction = { type: 'RUNS', payload: { runs: 1 } };
const four: ScoreAction = { type: 'RUNS', payload: { runs: 4, boundary: true } };
const out: ScoreAction = { type: 'WICKET', payload: { kind: 'bowled' } };

/** Team 1 made `runs` in its full allocation; the chase is about to start. */
const chaseOf = (cfg: Record<string, unknown>, runs: number, wickets = 6): CricketState => {
  const s = init(cfg);
  return reducer(seed(s, runs, wickets, s.oversLimit * s.ballsPerOver), END_INN);
};

describe('cases A–I (v: 2)', () => {
  test('A. T20, S=160, RAIN 10 before the chase → 91 (was 122)', () => {
    const s = go(chaseOf(T20, 160), rain(10));
    assert.equal(s.target, 91); // 160 × 32.1 / 56.6 = 90.74
    assert.equal(s.oversLimit, 10);
    assert.equal(s.dlsV, 2);
    assert.equal(s.revision, 'dls');
  });

  test('B. T20, S=150, chase at 10.0 ov for 2 wkts, RAIN 15 → R2 42.6 → 113', () => {
    const s = go(seed(chaseOf(T20, 150), 60, 2, 60), rain(15));
    assert.equal(dlsResources(s).r2, 42.6);
    assert.equal(s.target, 113); // 150 × 42.6 / 56.6 = 112.9
  });

  test('C. T20 1st inns at 10.0 for 2, RAIN 15 → R1 42.6; makes 120 in 15, R2 45.2 → 127 (G50)', () => {
    let s = go(seed(init(T20), 70, 2, 60), rain(15));
    assert.equal(dlsResources(s).r1, 42.6);
    assert.equal(s.target, undefined);
    // the 15th over's last ball completes the innings → settle starts the chase
    s = go(seed(s, 119, 5, 89), one);
    assert.equal(s.innings, 2);
    assert.equal(s.inn2Overs, 15);
    assert.equal(s.oversLimit, 15);
    assert.equal(s.target, 127); // 120 + ⌊(45.2 − 42.6) × 2.45⌋ + 1
  });

  test('D. ODI 1st inns at 30.0 for 2, RAIN 40 → R1 78.4; makes 250 → 277', () => {
    let s = go(seed(init(ODI), 150, 2, 180), rain(40));
    assert.equal(dlsResources(s).r1, 78.4);
    s = go(seed(s, 250, 7, 240), END_INN);
    assert.equal(s.target, 277); // 250 + ⌊(89.3 − 78.4) × 2.45⌋ + 1
  });

  describe('E. ODI, S=250, RAIN 25 before the chase → 167', () => {
    const base = () => go(chaseOf(ODI, 250), rain(25));
    test('target 167', () => assert.equal(base().target, 167));
    test('all out for 150 → "Won by 16 runs (DLS)"', () => {
      const s = go(seed(base(), 150, 9, 100), out);
      assert.ok(s.ended);
      assert.equal(resultLine(s), 'Won by 16 runs (DLS)');
      assert.equal(outcome(s).winner, 'home');
    });
    test('167/4 → "Won by 6 wkts (DLS)"', () => {
      const s = go(seed(base(), 163, 4, 100), four);
      assert.ok(s.ended);
      assert.equal(resultLine(s), 'Won by 6 wkts (DLS)');
      assert.equal(outcome(s).winner, 'away');
    });
    test('166 at the end of 25 overs → level with par → pendingTie', () => {
      const s = go(seed(base(), 165, 3, 149), one);
      assert.equal(s.scores.away.runs, 166);
      assert.equal(s.pendingTie, true);
      assert.ok(!s.ended);
      assert.equal(outcome(s).winner, null);
    });
  });

  test('F. ODI, S=250, chase at 20.0 for 5, RAIN 40 → R2 93.9 → 235', () => {
    const s = go(seed(chaseOf(ODI, 250), 90, 5, 120), rain(40));
    assert.equal(dlsResources(s).r2, 93.9);
    assert.equal(s.target, 235); // 250 × 0.939 = 234.75
  });

  test('G. dls off at 5.2 ov: SET_OVERS 15 and 25 accepted, 5 rejected; target = S+1', () => {
    const s0 = seed(init({ overs: 20 }), 30, 1, 32);
    const a = go(s0, setOvers(15));
    assert.equal(a.oversLimit, 15);
    assert.equal(a.inn1Overs, 15);
    assert.equal(a.events.at(-1)?.label, 'Overs changed to 15');
    assert.equal(a.events.at(-1)?.icon, '⏱');
    const b = go(a, setOvers(25));
    assert.equal(b.oversLimit, 25);
    assert.equal(go(b, setOvers(5)), b, '5 overs = 30 balls ≤ 32 bowled → rejected');
    assert.equal(go(b, rain(10)), b, 'RAIN needs DLS on');
    const c = go(seed(b, 140, 4, 150), END_INN);
    assert.equal(c.target, 141);
    assert.equal(c.inn2Overs, 25);
    assert.equal(c.oversLimit, 25);
  });

  test('H. SET_TARGET 120/15 → a later RAIN is ignored; the result says "(revised target)"', () => {
    let s = go(seed(chaseOf(T20, 150), 40, 1, 30), setTarget(120, 15));
    assert.equal(s.target, 120);
    assert.equal(s.oversLimit, 15);
    assert.equal(s.inn2Overs, 15);
    assert.equal(s.revision, 'manual');
    assert.equal(s.dlsLocked, true);
    assert.equal(go(s, rain(12)), s, 'v:2 RAIN locked out');
    assert.equal(go(s, rain(12, false)), s, 'a v-less RAIN on a v2 match is locked out too');
    s = go(seed(s, 99, 6, 89), one); // 100 at the end of 15 overs
    assert.ok(s.ended);
    assert.equal(resultLine(s), 'Won by 19 runs (revised target)');
  });

  test('I. The Hundred: RAIN uses balls / 6 (100 balls = 16⅔ DLS overs)', () => {
    // S=140; chase at 50 balls for 2, cut to 80 balls (8 ten-ball overs)
    const s = go(seed(chaseOf(HUNDRED, 140), 70, 2, 50), rain(8));
    const r1 = resourcePct(100 / 6, 0);
    const loss = resourcePct(50 / 6, 2) - resourcePct(30 / 6, 2);
    assert.ok(Math.abs(r1 - 49.1333) < 1e-3, `R1 ${r1}`);
    assert.ok(Math.abs(dlsResources(s).r1 - r1) < 1e-6);
    assert.ok(Math.abs(dlsResources(s).r2 - (r1 - loss)) < 1e-6);
    assert.equal(s.target, revisedTarget(140, r1, r1 - loss));
    // R1 = Z0(16⅔) = 49.13; loss = R(8⅓,2) 26.41 − R(5,2) 16.8 = 9.61 → R2 39.52;
    // 140 × 39.52 / 49.13 = 112.6 → 113. (Treating 10-ball overs as 6-ball would give R1 32.1.)
    assert.equal(s.target, 113);
  });
});

describe('rules of the overs / target actions', () => {
  test('RAIN only cuts (v2): equal or more overs, or ≤ balls bowled, is ignored', () => {
    const s = seed(chaseOf(T20, 150), 40, 1, 45); // 7.3
    assert.equal(go(s, rain(20)), s);
    assert.equal(go(s, rain(25)), s);
    assert.equal(go(s, rain(7)), s);
    assert.equal(go(s, rain(8)).oversLimit, 8, '48 balls > 45 bowled');
  });

  test('RAIN mid-over is ball-accurate (7.3 → u 12.5 → 2.5 at 10 overs)', () => {
    const s = go(seed(chaseOf(T20, 150), 40, 1, 45), rain(10));
    const loss = resourcePct(12.5, 1) - resourcePct(2.5, 1);
    assert.ok(Math.abs(s.r2Lost - loss) < 1e-6);
    assert.equal(s.target, revisedTarget(150, 56.6, 56.6 - loss));
  });

  test('RAIN repeated: losses add up', () => {
    const s = go(chaseOf(ODI, 250), rain(40), rain(30));
    assert.ok(Math.abs(s.r2Lost - (100 - 75.1)) < 1e-6);
    assert.equal(s.target, 188); // 250 × 0.751 = 187.75
  });

  test('a RAIN that leaves the chase already past the new target wins it', () => {
    const s = go(seed(chaseOf(T20, 150), 120, 1, 90), rain(16));
    assert.ok(s.target! <= 120, `target ${s.target}`);
    assert.ok(s.ended);
    assert.equal(outcome(s).winner, 'away');
    assert.match(resultLine(s), /wkts \(DLS\)$/);
  });

  test('SET_OVERS in the chase keeps the target; sets inn2Overs', () => {
    const s = go(seed(chaseOf(T20, 150), 60, 2, 60), setOvers(15));
    assert.equal(s.target, 151);
    assert.equal(s.inn2Overs, 15);
    assert.equal(s.events.at(-1)?.detail, 'Target stays 151');
  });

  test('SET_OVERS after a rain cut in the same innings books the change at the current ball', () => {
    // ODI chase: RAIN 50 → 20 at 0.0, then agreed back up to 30 at 5.0 for 1
    let s = go(chaseOf(ODI, 250), rain(20));
    s = go(seed(s, 30, 1, 30), setOvers(30));
    assert.equal(s.inn2Overs, 50, 'scheduled length kept');
    const expect = 100 - (100 - 56.6) + (resourcePct(25, 1) - resourcePct(15, 1));
    assert.ok(Math.abs(dlsResources(s).r2 - expect) < 1e-6);
    assert.equal(s.target, 142, 'SET_OVERS never moves the target');
    // a later rain cut down to 6 overs still leaves positive resources
    s = go(s, rain(6));
    assert.ok(dlsResources(s).r2 > 0);
    assert.ok(s.target! >= 1);
  });

  test('SET_OVERS: same value, 0, over 999, or during a Super Over / tie call are ignored', () => {
    const s = seed(init({ overs: 20 }), 10, 0, 12);
    assert.equal(go(s, setOvers(20)), s);
    assert.equal(go(s, setOvers(0)), s);
    assert.equal(go(s, setOvers(1000)), s);
    assert.equal(go(s, setOvers(999)).oversLimit, 999);
    const tie = { ...s, pendingTie: true };
    assert.equal(go(tie, setOvers(15)), tie);
  });

  test('SET_TARGET: innings 2 only, runs must exceed the score, overs must exceed balls bowled', () => {
    const first = seed(init(T20), 40, 1, 30);
    assert.equal(go(first, setTarget(120, 15)), first);
    const s = seed(chaseOf(T20, 150), 40, 1, 30);
    assert.equal(go(s, setTarget(40, 15)), s);
    assert.equal(go(s, setTarget(120, 5)), s);
    assert.equal(go(s, setTarget(41, 6)).target, 41);
  });

  test('local rules "last N overs standard" follows the changed overs', () => {
    // wides worth 2, standard in the last 2 overs; at 9.0 of 20 → local
    const s = seed(init({ overs: 20, wideRuns: 2, stdLastOvers: 2 }), 30, 1, 54);
    assert.equal(effectiveRules(s).wideRuns, 2);
    const cut = go(s, setOvers(11)); // 9 ≥ 11 − 2 → standard window
    assert.equal(effectiveRules(cut).wideRuns, 1);
    assert.equal(go(cut, { type: 'EXTRA', payload: { kind: 'Wide' } }).scores.home.runs, 31);
  });

  test('labels: revision drives the tag; manual target locks DLS', () => {
    const s = go(chaseOf(T20, 160), rain(10));
    assert.equal(s.events.at(-1)?.label, 'Rain — overs cut to 10 · target 91 (DLS)');
  });
});

describe('auto bowling quota recompute (#17 × #18)', () => {
  test('RAIN 20 → 10 and SET_OVERS 20 → 12 recompute the auto quota (2 and 3)', () => {
    const s = seed(init(T20), 10, 0, 12);
    assert.equal(s.bowlerQuota, 4);
    assert.equal(go(s, rain(10)).bowlerQuota, 2);
    assert.equal(go(s, setOvers(12)).bowlerQuota, 3);
    assert.equal(go(seed(chaseOf(T20, 150), 10, 0, 12), setTarget(120, 12)).bowlerQuota, 3);
  });

  test('a fixed bowlerMaxOvers is kept', () => {
    const s = seed(init({ ...T20, bowlerMaxOvers: 5 }), 10, 0, 12);
    assert.equal(go(s, setOvers(12)).bowlerQuota, 5);
    assert.equal(go(s, rain(10)).bowlerQuota, 5);
  });
});

describe('legacy replay (REVIEW Decision 8)', () => {
  test('case A without v → 122, today\'s legacy maths and result text', () => {
    let s = go(chaseOf(T20, 160), rain(10, false));
    assert.equal(s.target, 122);
    assert.equal(s.dlsV, undefined);
    s = go(seed(s, 100, 9, 59), out);
    assert.ok(s.ended);
    assert.equal(resultLine(s), 'Won by 60 runs'); // defend − chase, no suffix
    assert.equal(outcome(s).winner, 'home');
  });

  test('legacy RAIN in innings 1 → switch target uses (100 − r1Lost, 100)', () => {
    let s = go(seed(init(T20), 70, 2, 60), rain(15, false));
    const r1Lost = s.r1Lost;
    s = go(seed(s, 120, 5, 90), END_INN);
    assert.equal(s.target, revisedTarget(120, 100 - r1Lost, 100));
    assert.equal(s.dlsV, undefined);
  });

  test('a legacy level score (no v) is a tie on runs, not on par', () => {
    const s = go(seed(chaseOf(T20, 150), 149, 3, 119), one);
    assert.equal(s.pendingTie, true);
  });
});

describe('#06 editBall passes overs / target records through unchanged', () => {
  test('RAIN / SET_OVERS / SET_TARGET keep their payload (incl. v)', () => {
    const recs: MatchEventRecord[] = [
      { seq: 1, type: 'RAIN', payload: { overs: 10, v: 2 } },
      { seq: 2, type: 'SET_OVERS', payload: { overs: 12, v: 2 } },
      { seq: 3, type: 'SET_TARGET', payload: { runs: 120, overs: 15, v: 2 } },
      { seq: 4, type: 'RAIN', payload: { overs: 10 } },
    ];
    for (const rec of recs) {
      const a = editBall(rec, { runs: 4 });
      assert.deepEqual(a, { type: rec.type, payload: rec.payload });
    }
  });

  test('a recorded log with SET_OVERS + v2 RAIN replays to the same state', () => {
    const cfg = { overs: 20, dls: true, playersPerSide: 11 };
    let s = init(cfg);
    const log: MatchEventRecord[] = [];
    const push = (a: ScoreAction) => { log.push({ seq: log.length + 1, type: a.type, ...(a.payload ? { payload: a.payload } : {}) }); s = reducer(s, a); };
    push({ type: 'SET_STRIKER', payload: { id: 'a', name: 'A' } });
    push({ type: 'SET_NONSTRIKER', payload: { id: 'b', name: 'B' } });
    push({ type: 'SET_BOWLER', payload: { id: 'x', name: 'X', v: 2 } });
    for (let i = 0; i < 6; i++) push({ type: 'RUNS', payload: { runs: 2, strikerId: s.strikerId, strikerName: s.strikerName, bowlerId: s.bowlerId, bowlerName: s.bowlerName } });
    push(setOvers(15));
    push(rain(12));
    assert.deepEqual(replayCricket(log, cfg), s);
    assert.equal(s.oversLimit, 12);
    assert.equal(s.inn1Overs, 15);
    assert.ok(s.r1Lost > 0);
  });
});

describe('a match live across the update (legacy rain already booked)', () => {
  test('a later v:2 RAIN / SET_OVERS keeps the legacy maths instead of mixing units', () => {
    let s = init({ overs: 20, dls: true, playersPerSide: 11 });
    s = reducer(s, { type: 'RAIN', payload: { overs: 15 } });          // legacy cut in innings 1
    assert.equal(s.dlsV, undefined);
    const lost = s.r1Lost;
    const r = reducer(s, { type: 'RAIN', payload: { overs: 12, v: 2 } });
    assert.equal(r.dlsV, undefined, 'stays legacy');
    assert.equal(r.oversLimit, 12);
    assert.ok(r.r1Lost > lost);
    const o = reducer(s, { type: 'SET_OVERS', payload: { overs: 18, v: 2 } });
    assert.equal(o.dlsV, undefined);
    assert.equal(o.oversLimit, 18);
    assert.equal(o.r1Lost, lost, 'no resource booking in legacy units');
  });
});
