/**
 * SD-57 — basketball timeouts per half (FIBA 2 / 3, at most 2 in the last 2
 * minutes, 1 per OT; NBA 7 / 4 in Q4 / 2 in the last 3 min / 2 per OT; 3×3 and
 * legacy = a per-game count) and draws only where the format allows them.
 * SD-50 — game-flow stats from the event log (biggest lead, lead changes,
 * times tied, largest run, bench points) for basketball, football, hockey,
 * handball and kabaddi.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { init, reducer, timeoutStatus, type BasketballState } from '../src/sports/basketball/engine.ts';
import { legacyInit, legacyReducer } from './basketballLegacyReducer.mts';
import { computeGameFlow, gameFlowFor } from '../src/sports/gameFlow.ts';
import type { ScoreAction } from '../src/sports/types.ts';

type Side = 'home' | 'away';
const run = (s: BasketballState, ...as: ScoreAction[]) => as.reduce(reducer, s);
const to = (side: Side, quarter: number, minute = 1): ScoreAction => ({ type: 'TIMEOUT', side, payload: { quarter, minute } });
const FIBA = { regPeriods: 4, periodMinutes: 10, timeoutRule: 'fiba' };
const NBA = { regPeriods: 4, periodMinutes: 12, timeoutRule: 'nba' };

describe('SD-57 — FIBA timeouts', () => {
  test('2 in the first half, unused ones do not carry into the second half', () => {
    let s = init(FIBA);
    assert.equal(timeoutStatus(s, 'home', { quarter: 1, minute: 0 }).left, 2);
    s = run(s, to('home', 1));
    assert.deepEqual(timeoutStatus(s, 'home', { quarter: 2, minute: 3 }), { left: 1, allowance: 2, used: 1, window: '1st half', late: false });
    // second half: a fresh 3 (the unused first-half one is gone)
    assert.equal(timeoutStatus(s, 'home', { quarter: 3, minute: 0 }).left, 3);
    assert.equal(timeoutStatus(s, 'away', { quarter: 2, minute: 0 }).left, 2, 'per team');
  });
  test('3 in the second half, at most 2 once Q4 shows 2:00 or less', () => {
    let s = init(FIBA);
    assert.equal(timeoutStatus(s, 'home', { quarter: 4, minute: 7 }).left, 3);
    const late = timeoutStatus(s, 'home', { quarter: 4, minute: 8 });
    assert.equal(late.left, 2);
    assert.equal(late.late, true);
    s = run(s, to('home', 4, 8), to('home', 4, 9));
    assert.equal(timeoutStatus(s, 'home', { quarter: 4, minute: 9 }).left, 0, 'two used in the last 2 minutes');
    // one used in Q3 + one late → still one late allowed
    const t = run(init(FIBA), to('away', 3), to('away', 4, 8));
    assert.equal(timeoutStatus(t, 'away', { quarter: 4, minute: 9 }).left, 1);
    const u = run(t, to('away', 4, 9));
    assert.equal(timeoutStatus(u, 'away', { quarter: 4, minute: 9 }).left, 0, '3 used in the half');
  });
  test('1 per overtime, nothing carried over', () => {
    let s = init(FIBA);
    assert.deepEqual(timeoutStatus(s, 'home', { quarter: 5, minute: 0 }), { left: 1, allowance: 1, used: 0, window: 'OT', late: false });
    s = run(s, to('home', 5));
    assert.equal(timeoutStatus(s, 'home', { quarter: 5, minute: 2 }).left, 0);
    assert.equal(timeoutStatus(s, 'home', { quarter: 6, minute: 0 }).left, 1);
    assert.equal(timeoutStatus(s, 'home', { quarter: 6, minute: 0 }).window, 'OT2');
  });
  test('the reducer still logs a timeout over the allowance (the UI asks first)', () => {
    const s = run(init(FIBA), to('home', 1), to('home', 1), to('home', 1));
    assert.equal(s.events.filter((e) => e.type === 'timeout').length, 3);
    assert.equal(timeoutStatus(s, 'home', { quarter: 1, minute: 5 }).left, 0);
  });
});

describe('SD-57 — NBA / per-game / legacy', () => {
  test('NBA: 7 per game, at most 4 in Q4, 2 in its last 3 minutes, 2 per OT', () => {
    let s = init(NBA);
    assert.equal(timeoutStatus(s, 'home', { quarter: 1, minute: 0 }).left, 7);
    assert.equal(timeoutStatus(s, 'home', { quarter: 4, minute: 0 }).left, 4);
    assert.equal(timeoutStatus(s, 'home', { quarter: 4, minute: 9 }).left, 2);
    s = run(s, to('home', 1), to('home', 2), to('home', 3), to('home', 3), to('home', 3));
    assert.equal(timeoutStatus(s, 'home', { quarter: 4, minute: 0 }).left, 2, '7 - 5 used');
    assert.equal(timeoutStatus(s, 'home', { quarter: 5, minute: 0 }).left, 2);
  });
  test('3×3 / per-game count: 1 per team, whole game', () => {
    const s = run(init({ regPeriods: 1, timeouts: 1, timeoutRule: 'game' }), to('home', 1));
    assert.equal(timeoutStatus(s, 'home').left, 0);
    assert.equal(timeoutStatus(s, 'away').left, 1);
    assert.equal(s.toRule, undefined);
  });
  test('legacy configs (no timeoutRule) keep the whole-game count; 0 = untracked', () => {
    const s = run(init({ timeouts: 5 }), to('home', 1), to('home', 3));
    assert.equal(timeoutStatus(s, 'home').left, 3);
    assert.equal(timeoutStatus(init({}), 'home').left, null);
  });
  test('legacy replay identity: old configs get no new state keys', () => {
    const acts: ScoreAction[] = [{ type: 'KICKOFF', payload: { at: 1 } }, to('home', 1), { type: 'SCORE', side: 'away', payload: { points: 2, quarter: 1, minute: 2 } }, { type: 'END' }];
    for (const cfg of [{}, { timeouts: 5 }, { regPeriods: 4, foulsForBonus: 5 }]) {
      assert.deepEqual(acts.reduce(reducer, init(cfg)), acts.reduce(legacyReducer, legacyInit(cfg)));
    }
  });
});

describe('SD-57 — draws only where the format allows', () => {
  test('allowDraw is stamped only when the format carries it', () => {
    assert.equal(init({}).allowDraw, undefined);
    assert.equal(init({ allowDraw: false }).allowDraw, false);
    assert.equal(init({ allowDraw: true }).allowDraw, true);
  });
  test('UI: a level end offers overtime; "End as a draw" only when allowed; presets carry the timeout rule', () => {
    const src = readFileSync(new URL('../src/sports/basketball/index.tsx', import.meta.url), 'utf8');
    assert.match(src, /state\.allowDraw \? \(\s*<Button label="End as a draw"/);
    assert.match(src, /noLabel: 'No, go back'/);
    assert.match(src, /key: 'allowDraw'[^\n]*default: false/);
    const preset = (v: string) => src.split('\n').find((l) => l.includes(`value: '${v}'`) && l.includes('set:')) ?? '';
    assert.match(preset('fiba'), /timeoutRule: 'fiba'/);
    assert.match(preset('school'), /timeoutRule: 'fiba'/);
    assert.match(preset('nba'), /timeoutRule: 'nba'/);
    assert.match(preset('3x3'), /timeouts: 1, timeoutRule: 'game'/);
  });
});

describe('SD-50 — game flow core', () => {
  const p = (side: Side, points: number, at?: string) => ({ side, points, at });
  test('biggest lead, lead changes, times tied, largest run', () => {
    // H2 (2-0) A3 (2-3) H2 (4-3) A1 (4-4) A2 (4-6) A3 (4-9) H2 (6-9)
    const f = computeGameFlow([p('home', 2, 'Q1'), p('away', 3, 'Q1'), p('home', 2, 'Q1'), p('away', 1, 'Q2'), p('away', 2, 'Q2'), p('away', 3, 'Q2'), p('home', 2, 'Q3')]);
    assert.equal(f.scores, 7);
    assert.equal(f.leadChanges, 3, 'H→A, A→H, H→A (through the tie)');
    assert.equal(f.timesTied, 1);
    assert.deepEqual(f.biggestLead.home, { value: 2, at: 'Q1', home: 2, away: 0 });
    assert.deepEqual(f.biggestLead.away, { value: 5, at: 'Q2', home: 4, away: 9 });
    assert.equal(f.largestRun.away?.value, 6, '1 + 2 + 3 unanswered');
    assert.equal(f.largestRun.away?.at, 'Q2');
    assert.equal(f.largestRun.home?.value, 2);
  });
  test('zero-point plays (a missed free throw) neither score nor break a run', () => {
    const f = computeGameFlow([p('home', 2), p('away', 0), p('home', 1)]);
    assert.equal(f.largestRun.home?.value, 3);
    assert.equal(f.largestRun.away, null);
    assert.equal(f.scores, 2);
  });
  test('bench points: points by players who did not start', () => {
    const f = computeGameFlow(
      [{ side: 'home', points: 2, playerName: 'A' }, { side: 'home', points: 3, playerName: 'F' }, { side: 'home', points: 1, playerId: 'g' }, { side: 'home', points: 2 }, { side: 'away', points: 2, playerName: 'Z' }],
      'points', { home: { names: ['A', 'B', 'C', 'D', 'E'] } },
    );
    assert.deepEqual(f.bench, { home: 4 }, 'F 3 + g 1; unattributed and the away side (no starters) are left out');
  });
});

describe('SD-50 — sport adapters', () => {
  test('basketball: from the log, starters from the five on court', () => {
    const score = (side: Side, points: number, name: string, quarter = 1, minute = 1): ScoreAction =>
      ({ type: 'SCORE', side, payload: { points, quarter, minute }, attribution: { playerId: name, stat: 'points', playerName: name } });
    const s = run(init({}),
      { type: 'SET_LINEUP', payload: { home: ['A', 'B', 'C', 'D', 'E'], away: ['V', 'W', 'X', 'Y', 'Z'] } },
      score('home', 3, 'A'), score('away', 2, 'V', 1, 2),
      { type: 'FREE_THROW', side: 'away', payload: { made: true, quarter: 1, minute: 3 }, attribution: { playerId: 'Q', stat: 'ftm', playerName: 'Q' } },
      { type: 'FREE_THROW', side: 'away', payload: { made: false, quarter: 1, minute: 3 } },
      score('home', 2, 'F', 2, 1), score('home', 2, 'F', 2, 4),
    );
    const f = gameFlowFor('basketball', s)!;
    assert.equal(f.unit, 'points');
    assert.equal(f.timesTied, 1, '3-3 after the made free throw');
    assert.equal(f.leadChanges, 0);
    assert.equal(f.biggestLead.home?.value, 4);
    assert.equal(f.biggestLead.home?.at, "Q2 4'");
    assert.equal(f.largestRun.home?.value, 4);
    assert.deepEqual(f.bench, { home: 4, away: 1 });
  });
  test('basketball: lineup starters when no five was set; none scored = null', () => {
    const s = run(init({}), { type: 'SCORE', side: 'home', payload: { points: 2 }, attribution: { playerId: 'p9', stat: 'points', playerName: 'Nine' } });
    assert.deepEqual(gameFlowFor('basketball', s, { home: { ids: ['p1'], names: ['One'] } })!.bench, { home: 2 });
    assert.equal(gameFlowFor('basketball', s)!.bench, undefined);
    assert.equal(gameFlowFor('basketball', init({})), null);
  });
  test('football: goals + own goals in half / minute order; fewer than 2 goals = null', () => {
    const st = { events: [
      { id: 3, type: 'goal', side: 'away', minute: 70, half: 2 },
      { id: 1, type: 'goal', side: 'home', minute: 10, half: 1 },
      { id: 2, type: 'owngoal', side: 'home', minute: 44, half: 1 },
      { id: 4, type: 'yellow', side: 'away', minute: 80, half: 2 },
      { id: 5, type: 'goal', side: 'away', minute: 85, half: 2 },
    ] };
    const f = gameFlowFor('football', st)!;
    assert.equal(f.unit, 'goals');
    assert.equal(f.biggestLead.home?.value, 2);
    assert.equal(f.biggestLead.home?.at, "44'");
    assert.equal(f.timesTied, 1);
    assert.equal(f.largestRun.away?.value, 2);
    assert.equal(gameFlowFor('football', { events: [{ id: 1, type: 'goal', side: 'home', minute: 3 }] }), null);
  });
  test('hockey / handball: goals by period and clock second', () => {
    const st = { events: [
      { id: 'b', type: 'goal', side: 'away', sec: 900, period: 2 },
      { id: 'a', type: 'goal', side: 'home', sec: 120, period: 1 },
      { id: 'c', type: 'shot', side: 'home', sec: 1000, period: 2 },
      { id: 'd', type: 'goal', side: 'home', sec: 1500, period: 3 },
    ] };
    for (const sport of ['hockey', 'handball']) {
      const f = gameFlowFor(sport, st)!;
      assert.equal(f.leadChanges, 0);
      assert.equal(f.timesTied, 1);
      assert.equal(f.biggestLead.home?.at, "2'");
    }
  });
  test('kabaddi: point lines (raid / tackle / all out / technical / line-out), shootout out', () => {
    const st = { events: [
      { id: 1, stamp: "2'", kind: 'raid', side: 'home', points: 2 },
      { id: 2, stamp: "3'", kind: 'tackle', side: 'away', points: 1 },
      { id: 3, stamp: "4'", kind: 'sub', side: 'away', points: 0 },
      { id: 4, stamp: "5'", kind: 'allout', side: 'away', points: 2 },
      { id: 5, stamp: 'SO', kind: 'raid', side: 'home', points: 5 },
    ] };
    const f = gameFlowFor('kabaddi', st)!;
    assert.equal(f.unit, 'points');
    assert.equal(f.leadChanges, 1);
    assert.equal(f.largestRun.away?.value, 3);
    assert.equal(f.scores, 3);
  });
  test('other sports: no game flow', () => {
    assert.equal(gameFlowFor('tennis', { events: [] }), null);
    assert.equal(gameFlowFor('cricket', null), null);
  });
});
