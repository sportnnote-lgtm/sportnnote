/**
 * Post-match corrections (parity #05) — the pure AMEND engine + the 24 h
 * correction-permission gate. Real football and cricket reducers are replayed.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  effectiveLog, replayLog, attributionTotals, statDeltas, completedAt, eventSeqs, undoAmendDeltas,
  type AmendOp,
} from '../src/sports/amend.ts';
import { canCorrectMatch, correctionHoursLeft, formatTimeLeft } from '../src/core/roles.ts';
import { init as fbInit, reducer as fbReducer, type FootballState } from '../src/sports/football/engine.ts';
import { init as crInit, reducer as crReducer, type CricketState } from '../src/sports/cricket/engine.ts';
import type { MatchEventRecord } from '../src/core/types.ts';
import type { ScoreAction } from '../src/sports/types.ts';

// football/index.tsx pulls in React Native, so mirror its result() here.
const football = {
  createInitialState: fbInit,
  reducer: fbReducer,
  result: (s: FootballState) => {
    if (!s.ended) return null;
    return { winner: s.home > s.away ? 'home' : s.away > s.home ? 'away' : 'draw', home: s.home, away: s.away };
  },
};
const cricket = { createInitialState: crInit, reducer: crReducer };

const rec = (seq: number, type: string, extra: Partial<MatchEventRecord> = {}): MatchEventRecord => ({ seq, type, ...extra });
const amend = (seq: number, ops: AmendOp[], deltas: { playerId: string; stat: string; by: number }[] = []): MatchEventRecord =>
  ({ seq, type: 'AMEND', payload: { ops, lines: ['edit'], byName: 'Priya', deltas } });
const goalRec = (seq: number, side: 'home' | 'away', player: string, minute: number, created_at?: string): MatchEventRecord =>
  ({ seq, type: 'GOAL', side, payload: { minute, goalType: 'open' }, attribution: { playerId: player, stat: 'goals', playerName: player }, created_at });

describe('effectiveLog', () => {
  const base = [rec(1, 'A', { created_at: 't1', clientId: 'c1' }), rec(2, 'B'), rec(3, 'C')];

  test('replace swaps type/side/payload/attribution but keeps seq, created_at, clientId', () => {
    const action: ScoreAction = { type: 'X', side: 'away', payload: { n: 1 }, attribution: { playerId: 'p', stat: 'goals' }, attribution2: { playerId: 'q', stat: 'assists' } };
    const eff = effectiveLog([...base, amend(4, [{ op: 'replace', seq: 1, action }])]);
    assert.equal(eff.length, 3);
    assert.deepEqual(eff[0], {
      seq: 1, type: 'X', side: 'away', created_at: 't1', clientId: 'c1',
      payload: { n: 1, _attr2: { playerId: 'q', stat: 'assists' } },
      attribution: { playerId: 'p', stat: 'goals' },
    });
  });

  test('void removes the target; AMEND rows are dropped', () => {
    const eff = effectiveLog([...base, amend(4, [{ op: 'void', seq: 2 }])]);
    assert.deepEqual(eff.map((e) => e.seq), [1, 3]);
    assert.ok(eff.every((e) => e.type !== 'AMEND'));
  });

  test('last write wins, in AMEND seq order (not array order)', () => {
    const eff = effectiveLog([
      amend(6, [{ op: 'replace', seq: 2, action: { type: 'LATE' } }]),
      ...base,
      amend(5, [{ op: 'replace', seq: 2, action: { type: 'EARLY' } }]),
    ]);
    assert.equal(eff.find((e) => e.seq === 2)?.type, 'LATE');
  });

  test('a void then a later replace of the same seq stays voided; missing seqs are ignored', () => {
    const eff = effectiveLog([...base,
      amend(4, [{ op: 'void', seq: 3 }, { op: 'void', seq: 99 }, { op: 'replace', seq: 42, action: { type: 'NOPE' } }]),
      amend(5, [{ op: 'replace', seq: 3, action: { type: 'BACK' } }]),
    ]);
    assert.deepEqual(eff.map((e) => [e.seq, e.type]), [[1, 'A'], [2, 'B']]);
  });
});

describe('stat deltas', () => {
  test('attributionTotals sums by (default 1), extra and _attr2', () => {
    const t = attributionTotals([
      { seq: 1, type: 'STAT', attribution: { playerId: 'a', stat: 'shots', extra: { shotsOnTarget: 1 } } },
      { seq: 2, type: 'GOAL', attribution: { playerId: 'a', stat: 'goals', by: 2 }, payload: { _attr2: { playerId: 'b', stat: 'assists' } } },
    ]);
    assert.deepEqual(t, { a: { shots: 1, shotsOnTarget: 1, goals: 2 }, b: { assists: 1 } });
  });

  test('statDeltas is after − before, non-zero only, sorted by player then stat', () => {
    const before: MatchEventRecord[] = [goalRec(1, 'home', 'zed', 5), goalRec(2, 'home', 'amy', 10), { seq: 3, type: 'YELLOW', attribution: { playerId: 'amy', stat: 'yellowCards' } }];
    const after: MatchEventRecord[] = [goalRec(1, 'home', 'bob', 5), goalRec(2, 'home', 'amy', 10), { seq: 3, type: 'YELLOW', attribution: { playerId: 'amy', stat: 'yellowCards' } }];
    assert.deepEqual(statDeltas(before, after), [
      { playerId: 'bob', stat: 'goals', by: 1 },
      { playerId: 'zed', stat: 'goals', by: -1 },
    ]);
    assert.deepEqual(statDeltas(before, before), []);
  });

  test('undoAmendDeltas exactly negates the stored deltas', () => {
    const deltas = [{ playerId: 'a', stat: 'goals', by: -1 }, { playerId: 'b', stat: 'goals', by: 2 }];
    assert.deepEqual(undoAmendDeltas(amend(9, [], deltas)), [{ playerId: 'a', stat: 'goals', by: 1 }, { playerId: 'b', stat: 'goals', by: -2 }]);
    assert.deepEqual(undoAmendDeltas({ payload: {} }), []);
  });
});

describe('completedAt', () => {
  const log = [rec(1, 'A', { created_at: '2026-10-09T10:00:00Z' }), rec(2, 'END', { created_at: '2026-10-09T11:00:00Z' }), { ...amend(3, []), created_at: '2026-10-09T15:00:00Z' }];
  test('last non-AMEND event time (an AMEND does not extend the window)', () => {
    assert.equal(completedAt(log), Date.parse('2026-10-09T11:00:00Z'));
  });
  test('a later manual result (#04) wins; an earlier one does not', () => {
    assert.equal(completedAt(log, { at: '2026-10-09T12:30:00Z' }), Date.parse('2026-10-09T12:30:00Z'));
    assert.equal(completedAt(log, { at: '2026-10-09T09:00:00Z' }), Date.parse('2026-10-09T11:00:00Z'));
  });
  test('no timestamps → null; result only → result.at', () => {
    assert.equal(completedAt([rec(1, 'A')]), null);
    assert.equal(completedAt([rec(1, 'A')], { at: '2026-10-09T12:00:00Z' }), Date.parse('2026-10-09T12:00:00Z'));
  });
});

describe('real football log', () => {
  // Home 2-1: Elanga 5', Gakpo 55' (away), Willock 57'; FT.
  const log: MatchEventRecord[] = [
    { seq: 1, type: 'KICKOFF', payload: { at: 1 } },
    goalRec(2, 'home', 'elanga', 5),
    { seq: 3, type: 'NEXT_HALF', payload: { at: 2 } },
    goalRec(4, 'away', 'gakpo', 55),
    goalRec(5, 'home', 'willock', 57),
    { seq: 6, type: 'END', payload: { at: 3 } },
  ];

  test('voiding a goal: home −1 and the winner flips from home to draw', () => {
    const before = replayLog(football, undefined, log);
    assert.deepEqual(football.result(before), { winner: 'home', home: 2, away: 1 });
    const fixed = [...log, amend(7, [{ op: 'void', seq: 5 }])];
    const after = replayLog(football, undefined, fixed);
    assert.deepEqual(football.result(after), { winner: 'draw', home: 1, away: 1 });
    assert.deepEqual(statDeltas(effectiveLog(log), effectiveLog(fixed)), [{ playerId: 'willock', stat: 'goals', by: -1 }]);
  });

  test('replacing a goal to the other side flips the winner to away', () => {
    const action: ScoreAction = { type: 'GOAL', side: 'away', payload: { minute: 57, goalType: 'open' }, attribution: { playerId: 'salah', stat: 'goals', playerName: 'salah' } };
    const after = replayLog(football, undefined, [...log, amend(7, [{ op: 'replace', seq: 5, action }])]);
    assert.deepEqual(football.result(after), { winner: 'away', home: 1, away: 2 });
  });

  test('removing the AMEND row restores the original state exactly', () => {
    const original = replayLog(football, undefined, log);
    const corrected = [...log, amend(7, [{ op: 'void', seq: 2 }])];
    assert.notDeepEqual(replayLog(football, undefined, corrected), original);
    assert.deepEqual(replayLog(football, undefined, corrected.filter((e) => e.type !== 'AMEND')), original);
  });

  test('eventSeqs maps football state event ids to record seqs', () => {
    const eff = effectiveLog(log);
    const state = replayLog(football, undefined, log);
    const map = eventSeqs(football, undefined, eff);
    assert.deepEqual(state.events.map((e) => [e.id, map[e.id]]), [[1, 2], [2, 4], [3, 5]]);
    // Ids are a running counter: voiding the first goal renumbers the rest, so
    // the map must be rebuilt from the current effective log.
    const voided = effectiveLog([...log, amend(7, [{ op: 'void', seq: 2 }])]);
    assert.deepEqual(eventSeqs(football, undefined, voided), { 1: 4, 2: 5 });
  });

  test('a sport without state.events → {}', () => {
    const noEvents = { createInitialState: () => ({ n: 0 }), reducer: (s: { n: number }) => ({ n: s.n + 1 }) };
    assert.deepEqual(eventSeqs(noEvents, undefined, [rec(1, 'A')]), {});
  });
});

describe('real cricket log', () => {
  const stamp = { strikerId: 's1', strikerName: 'A', bowlerId: 'b1', bowlerName: 'Bowler' };
  const log: MatchEventRecord[] = [
    { seq: 1, type: 'SET_STRIKER', payload: { id: 's1', name: 'A' } },
    { seq: 2, type: 'SET_NONSTRIKER', payload: { id: 's2', name: 'B' } },
    { seq: 3, type: 'SET_BOWLER', payload: { id: 'b1', name: 'Bowler' } },
    { seq: 4, type: 'RUNS', side: 'home', payload: { runs: 4, ...stamp } },
    { seq: 5, type: 'RUNS', side: 'home', payload: { runs: 2, ...stamp } },
  ];
  const cfg = { overs: 5, playersPerSide: 11 };

  test('replacing a ball changes the total; dropping the AMEND restores it', () => {
    const before = replayLog<CricketState>(cricket, cfg, log);
    assert.equal(before.scores.home.runs, 6);
    const fixed = [...log, amend(6, [{ op: 'replace', seq: 4, action: { type: 'RUNS', side: 'home', payload: { runs: 6, ...stamp } } }])];
    const after = replayLog<CricketState>(cricket, cfg, fixed);
    assert.equal(after.scores.home.runs, 8);
    assert.equal(after.batting.s1.sixes, 1);
    assert.equal(after.batting.s1.fours, 0);
    assert.deepEqual(replayLog<CricketState>(cricket, cfg, fixed.slice(0, -1)), before);
  });
});

describe('canCorrectMatch', () => {
  const H = 60 * 60 * 1000;
  const now = Date.parse('2026-10-09T12:00:00Z');
  const scorer = { complete: true, isScorer: true, isMatchHost: false, isTournamentHost: false, now };

  test('scorer: 23 h after → allowed, 25 h after → closed', () => {
    assert.equal(canCorrectMatch({ ...scorer, completedAt: now - 23 * H }), true);
    assert.equal(canCorrectMatch({ ...scorer, completedAt: now - 25 * H }), false);
  });
  test('match host follows the same window; a bystander never', () => {
    const host = { ...scorer, isScorer: false, isMatchHost: true };
    assert.equal(canCorrectMatch({ ...host, completedAt: now - 23 * H }), true);
    assert.equal(canCorrectMatch({ ...host, completedAt: now - 25 * H }), false);
    assert.equal(canCorrectMatch({ ...scorer, isScorer: false, completedAt: now - H }), false);
  });
  test('organiser always; no timestamp (demo) → scorer allowed', () => {
    assert.equal(canCorrectMatch({ ...scorer, isScorer: false, isTournamentHost: true, completedAt: now - 1000 * H }), true);
    assert.equal(canCorrectMatch({ ...scorer, completedAt: null }), true);
  });
  test('not complete → false, even for an organiser', () => {
    assert.equal(canCorrectMatch({ ...scorer, complete: false, isTournamentHost: true, completedAt: now }), false);
  });
  test('time left text', () => {
    const left = correctionHoursLeft(now - (6 * H + 20 * 60 * 1000), now);
    assert.equal(left, 17 * H + 40 * 60 * 1000);
    assert.equal(formatTimeLeft(left), '17 h 40 m');
    assert.equal(formatTimeLeft(40 * 60 * 1000), '40 m');
    assert.equal(correctionHoursLeft(now - 30 * H, now), 0);
    assert.equal(correctionHoursLeft(null, now), Infinity);
  });
});
