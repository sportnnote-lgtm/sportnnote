/**
 * Tournament awards + Player of the Match precedence (parity #21).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  TOURNAMENT_AWARD_SLOTS, STAT_WEIGHTS, rankAwardCandidates, defaultAwards, resolvePotm, awardFormula, matchRatings,
} from '../src/data/ratings.ts';
import { cloneDraft } from '../src/data/matchHousekeeping.ts';
import type { Player, StatLine, SportId } from '../src/core/types.ts';

const P = (id: string, fullName: string, houseName?: string): Player => ({ id, fullName, sports: [], houseName });
let n = 0;
const L = (playerId: string, sport: SportId, stats: Record<string, number>, matchId = 'm1'): StatLine =>
  ({ id: `sl-${n++}`, matchId, playerId, sport, stats, won: false });

describe('award slots', () => {
  test('every sport starts with Player of the Tournament', () => {
    for (const slots of Object.values(TOURNAMENT_AWARD_SLOTS)) assert.equal(slots[0].slot, 'mvp');
    assert.equal(TOURNAMENT_AWARD_SLOTS.cricket[0].label, 'Player of the Tournament');
  });
  test('cricket: best batter (runs) + best bowler (wickets); chess: most wins', () => {
    assert.deepEqual(TOURNAMENT_AWARD_SLOTS.cricket.map((s) => [s.slot, s.label]), [['mvp', 'Player of the Tournament'], ['runs', 'Best batter'], ['wickets', 'Best bowler']]);
    assert.deepEqual(TOURNAMENT_AWARD_SLOTS.chess.map((s) => s.slot), ['mvp', 'wins']);
  });
  test('football and kabaddi come from the per-match role awards', () => {
    const fb = TOURNAMENT_AWARD_SLOTS.football.map((s) => s.label);
    assert.ok(fb.includes('Top scorer') && fb.includes('Playmaker'));
    assert.equal(TOURNAMENT_AWARD_SLOTS.football.find((s) => s.label === 'Top scorer')?.stat, 'goals');
    assert.deepEqual(TOURNAMENT_AWARD_SLOTS.kabaddi.map((s) => s.label), ['Player of the Tournament', 'Top raider', 'Top defender']);
  });
  test('cricket catches weigh 8 (the per-match fielding weight)', () => {
    assert.equal(STAT_WEIGHTS.cricket.catches, 8);
  });
});

describe('rankAwardCandidates — cricket', () => {
  const players = [P('a', 'Arjun', 'Red'), P('b', 'Bilal', 'Blue'), P('c', 'Chetan', 'Red'), P('d', 'Dev', 'Blue')];
  const lines = [
    L('a', 'cricket', { runs: 60, ballsFaced: 40, innings: 1, notOut: 0 }, 'm1'),
    L('a', 'cricket', { runs: 40, ballsFaced: 30, innings: 1, notOut: 1 }, 'm2'),
    L('b', 'cricket', { runs: 10, wickets: 4, ballsBowled: 24, runsConceded: 20 }, 'm1'),
    L('b', 'cricket', { wickets: 2, ballsBowled: 24, runsConceded: 30 }, 'm2'),
    L('c', 'cricket', { runs: 70, catches: 5 }, 'm1'), // 70 + 40 = 110 MVP pts
    L('d', 'cricket', { runs: 100 }, 'm1'),
  ];
  test('runs: highest first; detail shows inns / avg / SR', () => {
    const r = rankAwardCandidates(lines, players, 'cricket', 'runs');
    assert.deepEqual(r.map((x) => [x.playerId, x.value]), [['a', 100], ['d', 100], ['c', 70], ['b', 10]]);
    assert.equal(r[0].teamName, 'Red');
    assert.equal(r[0].games, 2);
    assert.match(r[0].detail, /^100 runs · 2 inns · avg 100\.00 · SR 142\.86$/);
  });
  test('wickets: detail shows matches / econ / avg', () => {
    const r = rankAwardCandidates(lines, players, 'cricket', 'wickets');
    assert.deepEqual(r.map((x) => [x.playerId, x.value]), [['b', 6]]);
    assert.equal(r[0].detail, '6 wkts · 2 m · econ 6.25 · avg 8.33');
  });
  test('mvp: weighted sum incl. catches (×8)', () => {
    const r = rankAwardCandidates(lines, players, 'cricket', 'mvp');
    // b: 10 + 6×18 = 118; c: 70 + 5×8 = 110; a: 100; d: 100 (name tiebreak a < d)
    assert.deepEqual(r.map((x) => [x.playerId, x.value]), [['b', 118], ['c', 110], ['a', 100], ['d', 100]]);
    assert.match(r[1].detail, /^1 m · 70 runs · 5 catches$/);
  });
  test('defaultAwards picks the #1 of each slot', () => {
    const d = defaultAwards(lines, players, 'cricket');
    assert.deepEqual(d.map((x) => [x.slot, x.playerId, x.label]), [['mvp', 'b', 'Player of the Tournament'], ['runs', 'a', 'Best batter'], ['wickets', 'b', 'Best bowler']]);
    assert.equal(d[0].id, 'cricket:mvp');
  });
  test('limit', () => {
    assert.equal(rankAwardCandidates(lines, players, 'cricket', 'runs', 2).length, 2);
  });
});

describe('rankAwardCandidates — football + scoping', () => {
  const players = [P('x', 'Xavi'), P('y', 'Yash'), P('z', 'Zane')];
  const lines = [
    L('x', 'football', { goals: 2, assists: 1 }, 't1'),
    L('y', 'football', { goals: 2 }, 't1'),
    L('y', 'football', { goals: 5 }, 'other'), // another tournament
    L('z', 'football', { goals: 1 }, 't2'),
    L('z', 'cricket', { runs: 99 }, 't2'), // another sport
  ];
  test('goals: only this tournament\'s lines count; ties by name', () => {
    const r = rankAwardCandidates(lines, players, 'football', 'goals', 10, { matchIds: ['t1', 't2'] });
    assert.deepEqual(r.map((x) => [x.name, x.value]), [['Xavi', 2], ['Yash', 2], ['Zane', 1]]);
    assert.equal(r[0].detail, '2 goals · 1 m');
  });
  test('without scoping the other tournament would change the order', () => {
    assert.equal(rankAwardCandidates(lines, players, 'football', 'goals')[0].name, 'Yash');
  });
  test('mvp uses the football weights (goal 10, assist 6)', () => {
    const r = rankAwardCandidates(lines, players, 'football', 'mvp', 10, { matchIds: ['t1', 't2'] });
    assert.deepEqual(r.map((x) => [x.name, x.value]), [['Xavi', 26], ['Yash', 20], ['Zane', 10]]);
  });
  test('a sport with no lines suggests nothing', () => {
    assert.deepEqual(defaultAwards(lines, players, 'kabaddi'), []);
  });
  test('the formula text names the weights', () => {
    assert.match(awardFormula('cricket', 'mvp'), /wkts ×18/);
    assert.match(awardFormula('football', 'goals'), /Total goals/);
  });
});

describe('resolvePotm — REVIEW Decision 10', () => {
  const mvp = { id: 'p1', name: 'Auto Pick' };
  test('stored override beats legacy and MVP', () => {
    const r = resolvePotm({ id: 'p9', name: 'Official Pick', changed: true }, 'Legacy Name', mvp);
    assert.deepEqual(r, { id: 'p9', name: 'Official Pick', source: 'stored', changed: true });
  });
  test('legacy cricket s.potm beats the computed MVP', () => {
    assert.deepEqual(resolvePotm(undefined, { id: 'p5', name: 'Legacy Name' }, mvp), { id: 'p5', name: 'Legacy Name', source: 'legacy', changed: false });
    assert.equal(resolvePotm(null, 'Legacy Name', mvp)?.id, undefined);
  });
  test('falls back to the MVP, then nothing', () => {
    assert.equal(resolvePotm(undefined, undefined, mvp)?.source, 'mvp');
    assert.equal(resolvePotm(undefined, '', undefined), undefined);
  });
  test('a #05 correction that changes the top-rated player never replaces the stored POTM', () => {
    const roster = [P('h1', 'Hari'), P('h2', 'Ravi')];
    const before = [L('h1', 'football', { goals: 2 }), L('h2', 'football', { goals: 1 })];
    const stored = { id: 'h2', name: 'Ravi', changed: true };
    assert.equal(matchRatings(before, 'football', roster, []).mvp?.id, 'h1');
    // Correction: Hari's goals were Ravi's after all → the computed MVP flips.
    const after = [L('h1', 'football', { goals: 0 }), L('h2', 'football', { goals: 3 })];
    const mvpAfter = matchRatings(after, 'football', roster, []).mvp;
    assert.equal(mvpAfter?.id, 'h2');
    // And the other way: officials chose Hari, a correction makes Ravi top — Hari stays.
    assert.equal(resolvePotm({ id: 'h1', name: 'Hari', changed: true }, undefined, mvpAfter)?.name, 'Hari');
    assert.equal(resolvePotm(stored, undefined, matchRatings(before, 'football', roster, []).mvp)?.name, 'Ravi');
  });
});

describe('clone skips the POTM (#13)', () => {
  test('cloneDraft carries no potm', () => {
    const m = { sport: 'football', homeTeam: { id: 'h' }, awayTeam: { id: 'a' }, potm: { playerId: 'x', name: 'X', by: 'y', at: '' } } as never;
    assert.equal('potm' in cloneDraft(m), false);
  });
});
