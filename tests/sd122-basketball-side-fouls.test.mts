/**
 * SD-122 (audit-2 P0 #3) — basketball foul-out / ejection by side and id, not
 * by name across both teams. New (`v: 2`) actions are side-aware; older logs
 * replay exactly as before (frozen legacy oracle), including logs where both
 * teams had a player with the same name.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  init, reducer, foulCount, isFouledOut, isEjected, isPlayerOut, disqualifyingFoul,
  type BasketballState,
} from '../src/sports/basketball/engine.ts';
import { legacyInit, legacyReducer } from './basketballLegacyReducer.mts';
import type { ScoreAction } from '../src/sports/types.ts';

type Side = 'home' | 'away';
const run = (s: BasketballState, ...as: ScoreAction[]) => as.reduce(reducer, s);
const RAHUL = 'Rahul Sharma';
// What the live UI sends since SD-122: the player's id in `pid`, plus `v: 2`.
const foul2 = (side: Side, pid: string, name = RAHUL, foulType = 'personal'): ScoreAction =>
  ({ type: 'FOUL', side, payload: { foulType, pid, v: 2 }, attribution: { playerId: pid, stat: 'fouls', playerName: name } });
const score2 = (side: Side, pid: string, points = 2, name = RAHUL): ScoreAction =>
  ({ type: 'SCORE', side, payload: { points, pid, v: 2 }, attribution: { playerId: pid, stat: 'points', by: points, playerName: name } });
const eject2 = (side: Side, pid: string, name = RAHUL): ScoreAction =>
  ({ type: 'EJECT', side, payload: { pid, v: 2 }, attribution: { playerId: pid, stat: 'ejections', playerName: name } });

describe('SD-122 — two "Rahul Sharma"s on opposite teams', () => {
  const FIBA = { foulsToFoulOut: 5, foulsForBonus: 4 };
  test('one fouls out; the other can still score, foul and is not disqualified', () => {
    let s = init(FIBA);
    for (let i = 0; i < 5; i++) s = reducer(s, foul2('home', 'h-rahul'));
    assert.equal(isFouledOut(s, RAHUL, { side: 'home', pid: 'h-rahul' }), true);
    assert.equal(isPlayerOut(s, RAHUL, { side: 'away', pid: 'a-rahul' }), false);
    assert.equal(foulCount(s, RAHUL, { side: 'away', pid: 'a-rahul' }), 0);
    s = run(s, score2('away', 'a-rahul', 3), foul2('away', 'a-rahul'));
    assert.equal(s.away, 3, 'the away Rahul\'s basket counts');
    assert.equal(foulCount(s, RAHUL, { side: 'away', pid: 'a-rahul' }), 1);
    // the home Rahul is out: his basket is refused
    const refused = reducer(s, score2('home', 'h-rahul'));
    assert.equal(refused, s);
    const s2 = run(init(FIBA), eject2('home', 'h-rahul'), score2('away', 'a-rahul'));
    assert.equal(isEjected(s2, RAHUL, { side: 'home' }), true);
    assert.equal(isEjected(s2, RAHUL, { side: 'away' }), false);
    assert.equal(s2.away, 2);
    // the away Rahul's ejection is still recordable
    const s3 = reducer(s2, eject2('away', 'a-rahul'));
    assert.equal(s3.events.filter((x) => x.type === 'eject').length, 2);
  });
  test('disqualifying-foul count is per side: a T for each Rahul is not "2T"', () => {
    const s = run(init(), foul2('home', 'h-rahul', RAHUL, 'technical'));
    assert.equal(disqualifyingFoul(s, RAHUL, 'technical', { side: 'away', pid: 'a-rahul' }), undefined);
    assert.equal(disqualifyingFoul(s, RAHUL, 'technical', { side: 'home', pid: 'h-rahul' }), '2T');
    assert.equal(disqualifyingFoul(s, RAHUL, 'unsportsmanlike', { side: 'home', pid: 'h-rahul' }), 'T+U');
  });
  test('id decides within one team (two Rahuls on the same side)', () => {
    let s = init({ foulsToFoulOut: 2 });
    s = run(s, foul2('home', 'r1'), foul2('home', 'r1'));
    assert.equal(isPlayerOut(s, RAHUL, { side: 'home', pid: 'r1' }), true);
    assert.equal(isPlayerOut(s, RAHUL, { side: 'home', pid: 'r2' }), false);
    assert.equal(run(s, score2('home', 'r2')).home, 2);
    assert.equal(s.events[0].pid, 'r1', 'a v:2 play keeps its player id');
  });
  test('a match begun on the old app: legacy fouls count by name for that side only', () => {
    const legacyFoul = (side: Side): ScoreAction =>
      ({ type: 'FOUL', side, payload: { foulType: 'personal' }, attribution: { playerId: 'x', stat: 'fouls', playerName: RAHUL } });
    let s = init({ foulsToFoulOut: 5 });
    for (let i = 0; i < 5; i++) s = reducer(s, legacyFoul('home'));
    assert.equal(s.events[0].pid, undefined, 'legacy plays keep their exact shape');
    // a new v:2 basket from the away Rahul is no longer refused
    assert.equal(reducer(s, score2('away', 'a-rahul')).away, 2);
    // the home Rahul (no id on his old fouls) is still out by name on his side
    assert.equal(reducer(s, score2('home', 'h-rahul')), s);
  });
  test('without `who` the helpers keep the legacy name match', () => {
    const s = run(init({ foulsToFoulOut: 1 }), foul2('home', 'h-rahul'));
    assert.equal(isFouledOut(s, RAHUL), true);
    assert.equal(foulCount(s, RAHUL), 1);
  });
});

describe('SD-122 — old logs replay identically (frozen legacy oracle), name collisions included', () => {
  // Old logs (no `v`), with the SAME names on both teams so cross-team
  // foul-outs and ejections happen — the old refusals must stay.
  function collidingLog(seed: number): ScoreAction[] {
    let x = seed;
    const rnd = (n: number) => { x = (x * 1103515245 + 12345) % 2147483648; return x % n; };
    const out: ScoreAction[] = [{ type: 'KICKOFF', payload: { at: 1 } }];
    const types = ['personal', 'shooting', 'technical', 'flagrant', 'offensive'];
    for (let i = 0; i < 200; i++) {
      const side: Side = rnd(2) ? 'home' : 'away';
      const who = `Player ${rnd(4)}`; // shared across both teams
      const stamp = { quarter: 1 + Math.floor(i / 50), minute: rnd(10) };
      const r = rnd(12);
      if (r < 4) out.push({ type: 'SCORE', side, payload: { points: 1 + rnd(3), ...stamp }, attribution: { playerId: who, stat: 'points', playerName: who } });
      else if (r < 8) out.push({ type: 'FOUL', side, payload: { foulType: types[rnd(5)], ...stamp }, attribution: { playerId: who, stat: 'fouls', playerName: who } });
      else if (r === 8) out.push({ type: 'EJECT', side, payload: stamp, attribution: { playerId: who, stat: 'ejections', playerName: who } });
      else if (r === 9) out.push({ type: 'FREE_THROW', side, payload: { made: rnd(2) === 1, ...stamp }, attribution: { playerId: who, stat: 'points', playerName: who } });
      else if (r === 10) out.push({ type: 'REBOUND', side, payload: stamp, attribution: { playerId: who, stat: 'rebounds', playerName: who } });
      else out.push({ type: 'STEAL', side, payload: stamp, attribution: { playerId: who, stat: 'steals', playerName: who } });
      if (i % 50 === 49) out.push({ type: 'NEXT_QUARTER' });
    }
    return out;
  }
  test('same state at every step, and collisions really happened', () => {
    let refusedCross = 0;
    for (const cfg of [undefined, { foulsToFoulOut: 5, foulsForBonus: 5 }, { foulsToFoulOut: 3 }]) {
      for (let seed = 1; seed <= 25; seed++) {
        let cur = init(cfg);
        let old = legacyInit(cfg);
        for (const a of collidingLog(seed)) {
          const before = old;
          cur = reducer(cur, a);
          old = legacyReducer(old, a);
          assert.deepEqual(cur, old, `seed ${seed}`);
          if (old === before && a.side && a.attribution?.playerName
            && !before.events.some((e) => e.side === a.side && e.playerName === a.attribution!.playerName && (e.type === 'foul' || e.type === 'eject'))) refusedCross++;
        }
      }
    }
    assert.ok(refusedCross > 0, 'logs include old cross-team refusals, replayed as they were');
  });
});

describe('SD-122 — two-legged tie: leg 2 goes to overtime on a level aggregate (FIBA two-game total)', () => {
  const leg2 = (h: number, a: number) => ({ aggregateLeg: 2, aggPriorHome: h, aggPriorAway: a });
  const toEnd = (cfg: Record<string, unknown>, home: number, away: number) => {
    let s = init(cfg);
    s = run(s, { type: 'NEXT_QUARTER' }, { type: 'NEXT_QUARTER' }, { type: 'NEXT_QUARTER' });
    if (home) s = reducer(s, { type: 'SCORE', side: 'home', payload: { points: home } });
    if (away) s = reducer(s, { type: 'SCORE', side: 'away', payload: { points: away } });
    return s;
  };
  test('game won but aggregate level → overtime', () => {
    const s = toEnd(leg2(70, 80), 80, 70); // leg 2 won by 10, aggregate 150–150
    assert.equal(reducer(s, { type: 'START_OVERTIME' }).quarter, 5);
  });
  test('game level but aggregate not → no overtime', () => {
    const s = toEnd(leg2(70, 80), 75, 75); // aggregate 145–155
    assert.equal(reducer(s, { type: 'START_OVERTIME' }), s);
  });
  test('the aggregate is on the state only for a leg 2; old configs unchanged', () => {
    assert.deepEqual(init(leg2(70, 80)).agg, { home: 70, away: 80 });
    assert.equal('agg' in init({ foulsToFoulOut: 5 }), false);
    assert.equal('agg' in init({ aggPriorHome: 70, aggPriorAway: 80 }), false, 'needs aggregateLeg: 2');
    assert.deepEqual(init({ foulsToFoulOut: 5 }), legacyInit({ foulsToFoulOut: 5 }));
    // a plain game keeps the per-game rule
    const s = toEnd({}, 80, 80);
    assert.equal(reducer(s, { type: 'START_OVERTIME' }).quarter, 5);
  });
});
