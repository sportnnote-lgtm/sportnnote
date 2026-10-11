/**
 * SD-133 — Wave D cricket: exact rain cut in innings 1, live DLS par, wagon
 * wheel + shot type (CK-11), retire at N runs, ICC Super Over eligibility, The
 * Hundred (25-ball powerplay, 5-ball sets, 20 balls a bowler, Super Five), the
 * named Undo, and the stat sync a hand-ended match now gets. Old logs replay
 * unchanged: cricket-legacy-replay.test.mts.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  init, reducer, outcome, nrrOvers, nrrRuns, rainStopPar, inPowerplay, canBowl, noBatterLeft, powerplaySpan,
  HUNDRED_PP_BALLS, type CricketState,
} from '../src/sports/cricket/engine.ts';
import { resourcePct, revisedTarget } from '../src/sports/cricket/dls.ts';
import { statTotals } from '../src/sports/cricket/scorecard.ts';
import { rulesFromConfig, patchRules, describeRulesChange, rulesChip, isStandard, STANDARD_RULES, CRICKET_LIVE_SETTINGS } from '../src/sports/cricket/rules.ts';
import { mirrorZone, zoneName, zoneRuns, careerZones, sideSplit, coverage, shotsOf } from '../src/sports/cricket/wagon.ts';
import { cricketUndoLabel } from '../src/sports/cricket/undo.ts';
import { planStatSync } from '../src/data/statSync.ts';
import type { ScoreAction } from '../src/sports/types.ts';

const inn = (runs: number, wickets: number, balls: number) => ({ runs, wickets, balls, extras: 0 });
const seed = (s: CricketState, runs: number, wickets: number, balls: number): CricketState =>
  ({ ...s, scores: { ...s.scores, [s.battingSide]: inn(runs, wickets, balls) }, ballsInOver: balls % s.ballsPerOver === 0 && balls > 0 ? s.ballsPerOver : balls % s.ballsPerOver });
const run = (s: CricketState, acts: ScoreAction[]) => acts.reduce(reducer, s);

/** A ball-by-ball builder: names the crease, then scores with the current striker / bowler. */
function live(cfg: Record<string, unknown> = {}) {
  let s = run(init({ overs: 20, ...cfg }), [
    { type: 'SET_CAPTAIN', payload: { side: 'home', id: 'h1', name: 'H1' } },
    { type: 'SET_CAPTAIN', payload: { side: 'away', id: 'a1', name: 'A1' } },
    { type: 'SET_KEEPER', payload: { side: 'home', id: 'h2', name: 'H2' } },
    { type: 'SET_KEEPER', payload: { side: 'away', id: 'a2', name: 'A2' } },
  ]);
  const L = () => (s.superOver && !s.superOver.state.ended ? s.superOver.state : s);
  const api = {
    get s() { return s; },
    do(a: ScoreAction) { const prev = s; s = reducer(s, a); return { type: a.type, prev, next: s }; },
    crease(st: string, ns: string, bw: string, v2 = false) {
      api.do({ type: 'SET_STRIKER', payload: { id: st, name: st.toUpperCase(), ...(v2 ? { v: 2 } : {}) } });
      api.do({ type: 'SET_NONSTRIKER', payload: { id: ns, name: ns.toUpperCase(), ...(v2 ? { v: 2 } : {}) } });
      api.bowler(bw, v2);
    },
    bowler(bw: string, v2 = false, extra: Record<string, unknown> = {}) {
      return api.do({ type: 'SET_BOWLER', payload: { id: bw, name: bw.toUpperCase(), ...(v2 ? { v: 2 } : {}), ...extra } });
    },
    ball(type: string, payload: Record<string, unknown> = {}) {
      const l = L();
      return api.do({ type, side: l.battingSide, payload: { strikerId: l.strikerId, strikerName: l.strikerName, bowlerId: l.bowlerId, bowlerName: l.bowlerName, ...payload } });
    },
    runs(...rs: number[]) { let last; for (const r of rs) last = api.ball('RUNS', { runs: r, ...(r === 4 || r === 6 ? { boundary: true } : {}) }); return last!; },
  };
  return api;
}

describe('(2) innings 1 ended by rain at the ball play stopped', () => {
  const at = (balls: number, wkts: number, runs = 100, cfg: Record<string, unknown> = { overs: 20, dls: true }) => seed(init(cfg), runs, wkts, balls);
  const END = (chaseOvers?: number): ScoreAction => ({ type: 'RAIN_END_INNINGS', payload: { v: 2, ...(chaseOvers ? { chaseOvers } : {}) } });

  test('books everything left — the unfinished over too, ball-accurate — and starts the chase on a DLS target', () => {
    const s0 = at(75, 3); // 12.3 overs, 100/3
    const s = reducer(s0, END(12));
    const lost = resourcePct((20 * 6 - 75) / 6, 3); // 7.5 overs left, 3 down
    assert.equal(s.innings, 2);
    assert.equal(s.battingSide, 'away');
    assert.equal(s.r1Lost, Math.round(lost * 1e6) / 1e6);
    assert.deepEqual(s.inn1Rain, { balls: 75, wickets: 3 });
    assert.equal(s.oversLimit, 12);
    assert.equal(s.inn2Overs, 12);
    const r1 = resourcePct(20, 0) - lost;
    assert.equal(s.target, revisedTarget(100, Math.round(r1 * 1e6) / 1e6, resourcePct(12, 0)));
    assert.equal(s.revision, 'dls');
    assert.equal(s.dlsV, 2);
    assert.match(s.events.at(-1)!.label, /^Rain — innings ended at 12\.3 ov · target \d+ in 12 ov \(DLS\)$/);
  });

  test('a part-over matters: stopping at 12.3 books less than stopping at 12.0', () => {
    const a = reducer(at(72, 3), END(12));
    const b = reducer(at(75, 3), END(12));
    assert.ok(a.r1Lost > b.r1Lost);
    assert.ok(a.target! >= b.target! - 1);
  });

  test('chase overs default to the current length; G50 when the chase has more resources than team 1 had', () => {
    const s = reducer(at(30, 1, 50), END());
    assert.equal(s.oversLimit, 20);
    const r1 = resourcePct(20, 0) - resourcePct(15, 1);
    assert.equal(s.target, revisedTarget(50, Math.round(r1 * 1e6) / 1e6, resourcePct(20, 0)));
    assert.ok(s.target! > 51, 'team 2 has more resources → target above runs + 1');
  });

  test('refused: no v:2, DLS off, no ball yet, innings 2, a target typed by hand', () => {
    const s = at(75, 3);
    assert.equal(reducer(s, { type: 'RAIN_END_INNINGS', payload: { chaseOvers: 12 } }), s);
    const off = seed(init({ overs: 20, dls: false }), 100, 3, 75);
    assert.equal(reducer(off, END(12)), off);
    const zero = init({ overs: 20, dls: true });
    assert.equal(reducer(zero, END(12)), zero);
    const chasing = reducer(at(120, 3), { type: 'END_INNINGS' });
    assert.equal(reducer(chasing, END(12)), chasing);
  });

  test('the chase then finishes on the DLS target; NRR credits team 1 with target − 1 off the chase overs (ICC)', () => {
    let s = reducer(at(75, 3), END(12));
    s = seed(s, s.target!, 2, 60);
    s = reducer(s, { type: 'END' });
    assert.equal(outcome(s).winner, 'away');
    assert.match(outcome(s).text, /\(DLS\)$/);
    assert.deepEqual(nrrOvers(s), { home: 12, away: 10 });
    assert.deepEqual(nrrRuns(s), { home: s.target! - 1, away: s.target! });
  });
});

describe('(3) live DLS par in the chase', () => {
  test('par at the current ball from the same table as the rain maths; 0 before a ball, rising as balls go by', () => {
    const s = reducer(seed(init({ overs: 20, dls: true }), 160, 4, 120), { type: 'END_INNINGS' });
    assert.equal(rainStopPar(s), 0);
    const ten = seed(s, 70, 0, 60);
    const r = resourcePct(20, 0);
    assert.equal(rainStopPar(ten), Math.floor((160 * (r - resourcePct(10, 0))) / r));
    assert.equal(rainStopPar(ten), 69);
    // wickets raise par (fewer resources left)
    assert.ok(rainStopPar(seed(s, 70, 4, 60))! > 69);
  });
  test('no par in innings 1, after a typed target, or once ended', () => {
    assert.equal(rainStopPar(init({ overs: 20, dls: true })), null);
    let s = reducer(seed(init({ overs: 20, dls: true }), 160, 4, 120), { type: 'END_INNINGS' });
    s = reducer(s, { type: 'SET_TARGET', payload: { runs: 150, overs: 18, v: 2 } });
    assert.equal(rainStopPar(s), null);
  });
});

describe('(4) wagon wheel + shot type (CK-11)', () => {
  const tag = (m: ReturnType<typeof live>, extra: Record<string, unknown>) =>
    m.do({ type: 'SHOT', payload: { v: 2, inn: 1, side: 'home', at: '0.1', batterId: 'h3', bowlerId: 'a5', runs: 4, ...extra } });

  test('a tap stores zone + deep for that ball; a shot chip merges into it; a re-tap moves it', () => {
    const m = live({ wagonWheel: true });
    m.crease('h3', 'h4', 'a5');
    m.runs(4);
    tag(m, { zone: 2, deep: true });
    tag(m, { shot: 'Drive' });
    assert.deepEqual(m.s.shots, [{ inn: 1, side: 'home', at: '0.1', batterId: 'h3', runs: 4, bowlerId: 'a5', zone: 2, deep: true, shot: 'Drive' }]);
    tag(m, { zone: 3 });
    assert.equal(m.s.shots!.length, 1);
    assert.equal(m.s.shots![0].zone, 3);
    assert.equal(m.s.shots![0].deep, undefined);
    assert.equal(m.s.shots![0].shot, 'Drive');
  });

  test('score-neutral; refused without v:2 or without a zone / known shot; allowed after the match ended', () => {
    const m = live();
    m.crease('h3', 'h4', 'a5');
    m.runs(4);
    const before = m.s;
    assert.equal(m.do({ type: 'SHOT', payload: { inn: 1, side: 'home', at: '0.1', batterId: 'h3', zone: 2 } }).next, before);
    assert.equal(tag(m, { zone: 9 }).next, before);
    assert.equal(tag(m, { shot: 'Helicopter' }).next, before);
    tag(m, { zone: 2 });
    assert.deepEqual(m.s.scores, before.scores);
    assert.deepEqual(m.s.events, before.events);
    m.do({ type: 'END' });
    tag(m, { shot: 'Pull' });
    assert.equal(m.s.shots![0].shot, 'Pull');
  });

  test('stat totals: per-zone runs (wz1…wz8) + tagged shots for every batter, only when the match tagged any', () => {
    const m = live();
    m.crease('h3', 'h4', 'a5');
    m.runs(4, 1, 2);
    assert.equal(statTotals(m.s).h3.stats.wz1, undefined, 'no shots → no keys');
    tag(m, { zone: 2, deep: true });
    m.do({ type: 'SHOT', payload: { v: 2, inn: 1, side: 'home', at: '0.3', batterId: 'h3', runs: 2, zone: 7 } });
    const t = statTotals(m.s);
    assert.equal(t.h3.stats.wz2, 4);
    assert.equal(t.h3.stats.wz7, 2);
    assert.equal(t.h3.stats.wwShots, 2);
    assert.equal(t.h4.stats.wz1, 0);
    assert.equal(t.h4.stats.wwShots, 0);
  });

  test('a shot tagged in a live Super Over goes to that innings (careers ignore it)', () => {
    const m = live({ overs: 1 });
    m.crease('h3', 'h4', 'a5');
    m.runs(1, 1, 1, 1, 1, 1);
    m.crease('a3', 'a4', 'h5');
    m.runs(1, 1, 1, 1, 1, 1);
    assert.equal(m.s.pendingTie, true);
    m.do({ type: 'START_SUPER_OVER', payload: { v: 2 } });
    m.crease('a3', 'a4', 'h6');
    m.runs(6);
    m.do({ type: 'SHOT', payload: { v: 2, inn: 1, side: 'away', at: '0.1', batterId: 'a3', runs: 6, zone: 8, deep: true } });
    assert.equal(m.s.shots, undefined);
    assert.equal(m.s.superOver!.state.shots!.length, 1);
  });

  test('wagon helpers: left-hander mirror, zone names, per-zone runs, career sums, side split, coverage', () => {
    assert.equal(mirrorZone(1), 8);
    assert.equal(mirrorZone(4), 5);
    assert.equal(zoneName(2), 'Cover');
    assert.equal(zoneName(2, true), 'Mid-wicket');
    const shots = [{ inn: 1, side: 'home', at: '0.1', batterId: 'x', runs: 4, zone: 2 }, { inn: 1, side: 'home', at: '0.2', batterId: 'x', runs: 1, zone: 6 }, { inn: 1, side: 'home', at: '0.3', batterId: 'y', runs: 2, zone: 2 }] as const;
    assert.deepEqual(zoneRuns(shotsOf([...shots], 'x')), [0, 4, 0, 0, 0, 1, 0, 0]);
    assert.deepEqual(careerZones([{ stats: { wz2: 4, wwShots: 1 } }, { stats: { wz2: 2, wz6: 3, wwShots: 2 } }]), { runs: [0, 6, 0, 0, 0, 3, 0, 0], shots: 3 });
    assert.deepEqual(sideSplit([0, 6, 0, 0, 0, 3, 0, 0]), { off: 67, leg: 33 });
    assert.equal(coverage(3, 5), '3 of 5 scoring shots tagged');
  });
});

describe('(5) retire at N runs (local rule)', () => {
  test('rules: only present when set; chip + timeline text; isStandard; live-settings read', () => {
    assert.equal('retireAt' in rulesFromConfig({}), false);
    assert.deepEqual(rulesFromConfig({}), STANDARD_RULES);
    const r = rulesFromConfig({ retireAt: 25 });
    assert.equal(r.retireAt, 25);
    assert.equal(r.retireBack, true);
    assert.equal(isStandard(r), false);
    assert.equal(rulesChip(r), 'retire at 25');
    assert.equal(describeRulesChange(STANDARD_RULES, r), 'Batters retire at 25');
    assert.equal(describeRulesChange(r, patchRules(r, { retireBack: false })), 'Retired batters can’t return');
    assert.equal(describeRulesChange(STANDARD_RULES, patchRules(STANDARD_RULES, { wagonWheel: true })), 'Wagon wheel on');
    assert.equal(isStandard(patchRules(STANDARD_RULES, { wagonWheel: true })), true, 'the wagon wheel is not a playing rule');
    assert.deepEqual(CRICKET_LIVE_SETTINGS.read(init({ retireAt: 30 })), { ...CRICKET_LIVE_SETTINGS.defaults, retireAt: 30 });
  });

  test('retired not out at the limit: not a wicket; may come back and resumes on the same score', () => {
    const m = live({ retireAt: 6, playersPerSide: 3 });
    m.crease('h3', 'h4', 'a5');
    m.runs(6);
    m.ball('WICKET', { kind: 'retired', batterOut: 'striker', v: 2, limit: true, newBatId: 'h5', newBatName: 'H5' });
    const c = m.s.batting.h3;
    assert.equal(c.retired, true);
    assert.equal(c.retLimit, true);
    assert.equal(c.dismissal, 'retired not out');
    assert.equal(m.s.scores.home.wickets, 0);
    assert.equal(m.s.events.at(-1)!.label, 'RETIRED');
    assert.equal(m.s.strikerId, 'h5');
    // a retired-at-limit batter doesn't use up the order (they may return)
    assert.equal(noBatterLeft(m.s, 'home'), false);
    m.ball('WICKET', { kind: 'bowled', newBatId: 'h3', newBatName: 'H3' });
    const back = m.s.batting.h3;
    assert.equal(back.retired, false);
    assert.equal(back.retLimit, undefined);
    assert.equal(back.dismissal, undefined);
    assert.equal(back.runs, 6);
  });

  test('without v:2 / limit it is plain retired hurt (legacy)', () => {
    const m = live();
    m.crease('h3', 'h4', 'a5');
    m.ball('WICKET', { kind: 'retired', batterOut: 'striker', limit: true, newBatId: 'h5', newBatName: 'H5' });
    assert.equal(m.s.batting.h3.dismissal, 'retired hurt');
    assert.equal(m.s.batting.h3.retLimit, undefined);
  });
});

describe('(6) Super Over eligibility (ICC)', () => {
  const tiedSo1 = () => {
    const m = live({ overs: 1 });
    m.crease('h3', 'h4', 'a5');
    m.runs(1, 1, 1, 1, 1, 1);
    m.crease('a3', 'a4', 'h5');
    m.runs(1, 1, 1, 1, 1, 1);
    m.do({ type: 'START_SUPER_OVER', payload: { v: 2 } });
    m.crease('a3', 'a4', 'h6', true);
    m.ball('WICKET', { kind: 'bowled', newBatId: 'a6', newBatName: 'A6' });
    m.runs(4, 1, 1, 0, 0); // away 6/1
    m.crease('h3', 'h4', 'a7', true);
    m.runs(1, 1, 1, 1, 1, 1); // home 6 → tied again
    assert.equal(m.s.pendingTie, true);
    return m;
  };

  test('round 1 carries no bans (v:2 start)', () => {
    const m = live({ overs: 1 });
    m.crease('h3', 'h4', 'a5');
    m.runs(0, 0, 0, 0, 0, 0);
    m.crease('a3', 'a4', 'h5');
    m.runs(0, 0, 0, 0, 0, 0);
    m.do({ type: 'START_SUPER_OVER', payload: { v: 2 } });
    assert.equal(m.s.superOver!.state.soBarBat, undefined);
  });

  test('round 2: a batter out in Super Over 1 can’t bat; Super Over 1’s bowlers can’t bowl', () => {
    const m = tiedSo1();
    m.do({ type: 'START_SUPER_OVER', payload: { v: 2 } });
    const inner = m.s.superOver!.state;
    assert.deepEqual(inner.soBarBat, ['a3']);
    assert.deepEqual(inner.soBarBowl!.sort(), ['a7', 'h6']);
    assert.deepEqual(canBowl(inner, 'a7'), { ok: false, reason: 'super-over' });
    assert.equal(canBowl(inner, 'a8').ok, true);
    // home bat first in round 2 (alternates): a7 refused, a8 fine
    m.bowler('a7', true);
    assert.equal(m.s.superOver!.state.bowlerId, undefined, 'a7 refused');
    m.bowler('a8', true);
    assert.equal(m.s.superOver!.state.bowlerId, 'a8');
    // away bat second: a3 refused as striker (v:2)
    const st = m.s.superOver!.state;
    const fake = { ...m.s, superOver: { ...m.s.superOver!, state: { ...st, battingSide: 'away' as const, strikerId: undefined } } };
    assert.equal(reducer(fake, { type: 'SET_STRIKER', payload: { id: 'a3', name: 'A3', v: 2 } }).superOver!.state.strikerId, undefined);
    assert.equal(reducer(fake, { type: 'SET_STRIKER', payload: { id: 'a3', name: 'A3' } }).superOver!.state.strikerId, 'a3', 'legacy payload: accepted');
    assert.equal(reducer(fake, { type: 'SET_STRIKER', payload: { id: 'a6', name: 'A6', v: 2 } }).superOver!.state.strikerId, 'a6');
  });

  test('a legacy start (no v) bans nobody — old logs replay as before', () => {
    const m = tiedSo1();
    m.do({ type: 'START_SUPER_OVER' });
    assert.equal(m.s.superOver!.state.soBarBat, undefined);
    assert.equal(canBowl(m.s.superOver!.state, 'a7').ok, true);
  });
});

describe('(7) The Hundred', () => {
  const H = { overs: 10, ballsPerOver: 10, powerplayOvers: 0, dls: true, hundred: true };
  test('only a format with hundred: true gets the rules (older Hundred matches unchanged)', () => {
    assert.equal(init(H).hundred, true);
    assert.equal('hundred' in init({ overs: 10, ballsPerOver: 10, powerplayOvers: 3 }), false);
    assert.equal('hundred' in init({ overs: 10, ballsPerOver: 10, hundred: false }), false);
  });
  test('powerplay = the first 25 balls', () => {
    const s = init(H);
    assert.equal(inPowerplay(seed(s, 0, 0, 24)), true);
    assert.equal(inPowerplay(seed(s, 0, 0, HUNDRED_PP_BALLS)), false);
    assert.equal(powerplaySpan(s), 'balls 1–25');
    assert.equal(powerplaySpan(init({ powerplayOvers: 6 })), 'overs 1–6');
  });
  test('5-ball sets: a free change after 5 (no reason); 20 balls a bowler', () => {
    const m = live(H);
    m.crease('h3', 'h4', 'a5', true);
    m.runs(0, 0, 0, 0, 0);
    m.bowler('a6', true); // free change after a set of 5
    assert.equal(m.s.bowlerId, 'a6');
    assert.equal(m.s.events.filter((e) => e.label === 'BOWLER REPLACED').length, 0);
    m.runs(0, 0, 0, 0, 0); // end of the 10-ball "over"; ends change
    // a5 bowled 5 balls in over 1 (sits out over 2); a bowler on 20 balls is done
    const s = { ...m.s, bowling: { ...m.s.bowling, a7: { ...m.s.bowling.a5, name: 'A7', balls: 20, overs: [0, 2] } } };
    assert.deepEqual(canBowl(s, 'a7'), { ok: false, reason: 'quota' });
    const s15 = { ...s, bowling: { ...s.bowling, a7: { ...s.bowling.a7, balls: 15, overs: [0, 2, 4] } } };
    assert.equal(canBowl(s15, 'a7').ok, true, 'quota is balls, not part-overs');
  });
  test('a tie goes to a Super Five (5 balls, 2 wickets)', () => {
    const m = live({ ...H, overs: 1, ballsPerOver: 10 });
    m.crease('h3', 'h4', 'a5');
    m.runs(1, 1, 1, 1, 1, 1, 1, 1, 1, 1);
    m.crease('a3', 'a4', 'h5');
    m.runs(1, 1, 1, 1, 1, 1, 1, 1, 1, 1);
    m.do({ type: 'START_SUPER_OVER', payload: { v: 2 } });
    const inner = m.s.superOver!.state;
    assert.equal(inner.ballsPerOver, 5);
    assert.equal(inner.oversLimit, 1);
    assert.equal(inner.wicketsLimit, 2);
  });
});

describe('(8) named Undo for cricket', () => {
  test('a four, a wicket, an extra, a quiet pick, a Super Over ball', () => {
    const m = live();
    m.crease('h3', 'h4', 'a5');
    assert.equal(cricketUndoLabel(m.bowler('a6')), 'bowler pick');
    assert.equal(cricketUndoLabel(m.runs(4)), 'FOUR — H3 (0.1)');
    assert.equal(cricketUndoLabel(m.runs(1)), '1 run — H3 (0.2)');
    assert.equal(cricketUndoLabel(m.ball('EXTRA', { kind: 'Wide', runs: 1 })), 'Wide + 1 (0.3)');
    assert.equal(cricketUndoLabel(m.ball('WICKET', { kind: 'caught', fielderId: 'a2', fielderName: 'A2', newBatId: 'h5', newBatName: 'H5' })), 'CAUGHT — H3 (0.3)');
    assert.equal(cricketUndoLabel(m.do({ type: 'SHOT', payload: { v: 2, inn: 1, side: 'home', at: '0.1', batterId: 'h3', runs: 4, zone: 1 } })), 'wagon-wheel tag');
    assert.equal(cricketUndoLabel(null), null);
  });
  test('inside a live Super Over', () => {
    const m = live({ overs: 1 });
    m.crease('h3', 'h4', 'a5');
    m.runs(0, 0, 0, 0, 0, 0);
    m.crease('a3', 'a4', 'h5');
    m.runs(0, 0, 0, 0, 0, 0);
    assert.equal(cricketUndoLabel(m.do({ type: 'START_SUPER_OVER', payload: { v: 2 } })), 'Super Over start');
    m.crease('a3', 'a4', 'h6');
    assert.equal(cricketUndoLabel(m.runs(6)), 'SIX — A3 (0.1)');
  });
});

describe('(1) a match ended by hand gets the absolute stat sync', () => {
  test('lines with only live increments gain innings / balls faced / balls bowled / runs conceded', () => {
    const m = live();
    m.crease('h3', 'h4', 'a5');
    m.runs(4, 1, 0, 2, 0, 1);
    // what the live increments left (runs only — no innings / BF / bowling figures)
    const existing = [
      { id: 'L1', playerId: 'h3', stats: { runs: 5 } },
      { id: 'L2', playerId: 'h4', stats: { runs: 3 } },
      { id: 'L3', playerId: 'a5', stats: {} },
    ];
    const writes = planStatSync(existing, statTotals(m.s), (id) => id, { home: 'Home', away: 'Away' });
    const byP = Object.fromEntries(writes.map((w) => [w.playerId, w.stats]));
    assert.equal(byP.h3.innings, 1);
    assert.equal(byP.h3.ballsFaced, 2);
    assert.equal(byP.h4.ballsFaced, 4);
    assert.equal(byP.h3.notOut, 1);
    assert.equal(byP.a5.ballsBowled, 6);
    assert.equal(byP.a5.runsConceded, 8);
    assert.equal(byP.a5.maidens, 0);
    // run twice → nothing more to write (absolute)
    const after = existing.map((l) => ({ ...l, stats: byP[l.playerId] ?? l.stats }));
    assert.equal(planStatSync(after, statTotals(m.s), (id) => id).filter((w) => w.kind === 'update').length, 0);
  });
});
