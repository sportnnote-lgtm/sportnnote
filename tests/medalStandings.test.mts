/**
 * Medal / position-points standings for a multi-sport meet: each sport's final
 * table gives a finishing position, position → points (optionally weighted per
 * sport), summed across sports into one overall table. See data/medalStandings.ts.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { medalStandings } from '../src/data/medalStandings.ts';
import type { Match, SportId, TournamentScoring } from '../src/core/types.ts';

// A completed match in a sport. Same-named teams across sports = one contingent.
let n = 0;
function m(sport: SportId, home: string, away: string, hs: number, as: number): Match {
  return {
    id: `m${n++}`, sport, status: 'completed', startsAt: '',
    winner: hs > as ? 'home' : hs < as ? 'away' : 'draw', score: { home: hs, away: as },
    homeTeam: { id: `${sport}-${home}`, name: home }, awayTeam: { id: `${sport}-${away}`, name: away }, state: null,
  } as unknown as Match;
}

// Round-robin among 3 teams in one sport, given each pair's result.
function rr(sport: SportId, results: [string, string, number, number][]): Match[] {
  return results.map(([h, a, hs, as]) => m(sport, h, a, hs, as));
}

const PTS: TournamentScoring = { mode: 'position', positionPoints: [5, 3, 1] }; // 1st=5, 2nd=3, 3rd=1

describe('single sport', () => {
  test('position points map to the final table order', () => {
    // A beats B and C; B beats C → A 1st, B 2nd, C 3rd.
    const ms = rr('football', [['A', 'B', 2, 0], ['A', 'C', 2, 0], ['B', 'C', 1, 0]]);
    const table = medalStandings(ms, ['football'], PTS);
    assert.deepEqual(table.map((r) => [r.name, r.total]), [['A', 5], ['B', 3], ['C', 1]]);
    assert.equal(table[0].golds, 1);
    assert.equal(table[1].silvers, 1);
    assert.equal(table[2].bronzes, 1);
  });
});

describe('multi-sport totals merge by contingent name', () => {
  const football = rr('football', [['A', 'B', 2, 0], ['A', 'C', 2, 0], ['B', 'C', 1, 0]]); // A>B>C
  const cricket = rr('cricket', [['C', 'A', 50, 10], ['C', 'B', 50, 10], ['A', 'B', 30, 20]]); // C>A>B

  test('sums position points across both sports', () => {
    const table = medalStandings([...football, ...cricket], ['football', 'cricket'], PTS);
    // A: fb 1st (5) + ck 2nd (3) = 8; C: fb 3rd (1) + ck 1st (5) = 6; B: fb 2nd (3) + ck 3rd (1) = 4.
    assert.deepEqual(table.map((r) => [r.name, r.total]), [['A', 8], ['C', 6], ['B', 4]]);
    const a = table.find((r) => r.name === 'A')!;
    assert.equal(a.golds, 1); // one 1st place (football)
    assert.equal(a.silvers, 1); // one 2nd place (cricket)
    assert.equal(a.perSport.length, 2);
  });

  test('per-sport placement breakdown is on each row', () => {
    const table = medalStandings([...football, ...cricket], ['football', 'cricket'], PTS);
    const c = table.find((r) => r.name === 'C')!;
    const ck = c.perSport.find((p) => p.sport === 'cricket')!;
    assert.equal(ck.position, 1);
    assert.equal(ck.fieldSize, 3);
    assert.equal(ck.points, 5);
  });
});

describe('per-sport weighting', () => {
  test('a weighted sport multiplies its position points', () => {
    const football = rr('football', [['A', 'B', 2, 0], ['A', 'C', 2, 0], ['B', 'C', 1, 0]]); // A>B>C
    const cricket = rr('cricket', [['C', 'A', 9, 0], ['C', 'B', 9, 0], ['A', 'B', 9, 0]]);    // C>A>B
    const weighted: TournamentScoring = { mode: 'position', positionPoints: [5, 3, 1], sportWeights: { cricket: 2 } };
    const table = medalStandings([...football, ...cricket], ['football', 'cricket'], weighted);
    // A: fb 1st (5) + ck 2nd (3×2=6) = 11; C: fb 3rd (1) + ck 1st (5×2=10) = 11; tie → golds break it.
    // A has 1 gold (fb), C has 1 gold (ck) → equal; silvers: A 1 (ck 2nd), C 0 → A ahead.
    assert.equal(table[0].name, 'A');
    assert.equal(table.find((r) => r.name === 'A')!.total, 11);
    assert.equal(table.find((r) => r.name === 'C')!.total, 11);
  });
});

describe('defaults + edge cases', () => {
  test('no points table → N-down-to-1 fallback by field size', () => {
    const ms = rr('football', [['A', 'B', 2, 0], ['A', 'C', 2, 0], ['B', 'C', 1, 0]]); // A>B>C, field 3
    const table = medalStandings(ms, ['football'], { mode: 'position' });
    assert.deepEqual(table.map((r) => r.total), [3, 2, 1]); // 3 for 1st … 1 for 3rd
  });
  test('positions beyond the table score 0', () => {
    const ms = rr('football', [['A', 'B', 2, 0], ['A', 'C', 2, 0], ['B', 'C', 1, 0]]);
    const table = medalStandings(ms, ['football'], { mode: 'position', positionPoints: [10, 5] }); // only top 2 score
    assert.deepEqual(table.map((r) => r.total), [10, 5, 0]);
  });
  test('a walkover win still ranks (counts as a normal result)', () => {
    const ms = [{ ...m('football', 'A', 'B', 1, 0), walkover: true } as Match];
    const table = medalStandings(ms, ['football'], PTS);
    assert.equal(table[0].name, 'A'); // A took the walkover win → 1st
    assert.equal(table[0].total, 5);
  });
});
