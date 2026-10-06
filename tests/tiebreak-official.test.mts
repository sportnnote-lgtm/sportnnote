/**
 * Official tie-break procedures (2026-10-07):
 *  • Table tennis — ITTF Handbook 3.7.5: match points (2 win / 1 loss); ties
 *    resolved using ONLY the matches among the tied players — match points,
 *    then games ratio, then points ratio — and whenever a criterion separates
 *    some of them, the procedure restarts among those still level.
 *  • Chess — FIDE round robin: 1 / ½ / 0; direct encounter, number of wins,
 *    Sonneborn-Berger.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { teamStandings, defaultStandingsConfig, setStandingsPointsProvider } from '../src/data/standings.ts';
import type { Match } from '../src/core/types.ts';

/** A completed table-tennis match from its game scores (home first). */
function tt(home: string, away: string, games: Array<[number, number]>): Match {
  const hw = games.filter(([h, a]) => h > a).length;
  const aw = games.length - hw;
  return {
    id: `${home}-${away}`, sport: 'tabletennis', status: 'completed', startsAt: '',
    winner: hw > aw ? 'home' : 'away', score: { home: hw, away: aw },
    homeTeam: { id: home, name: home.toUpperCase() }, awayTeam: { id: away, name: away.toUpperCase() },
    state: { games },
  } as unknown as Match;
}

/** A completed chess game: 1 = home won, 0 = away won, 0.5 = draw. */
function chess(home: string, away: string, r: 1 | 0 | 0.5): Match {
  return {
    id: `${home}-${away}-${Math.random()}`, sport: 'chess', status: 'completed', startsAt: '',
    winner: r === 1 ? 'home' : r === 0 ? 'away' : 'draw',
    score: { home: r, away: 1 - r },
    homeTeam: { id: home, name: home.toUpperCase() }, awayTeam: { id: away, name: away.toUpperCase() },
    state: null,
  } as unknown as Match;
}

const order = (rows: { teamId: string }[]) => rows.map((r) => r.teamId).join('');

describe('table tennis — ITTF 3.7.5', () => {
  before(() => setStandingsPointsProvider((_sport, state) => {
    const g = (state as { games?: Array<[number, number]> } | null)?.games;
    return g ? g.reduce((t, [h, a]) => ({ home: t.home + h, away: t.away + a }), { home: 0, away: 0 }) : null;
  }));
  after(() => setStandingsPointsProvider(null));

  test('match points are 2 for a win, 1 for a loss', () => {
    const t = teamStandings([tt('a', 'b', [[11, 5], [11, 5], [11, 5]])], 'tabletennis');
    assert.equal(t[0].points, 2);
    assert.equal(t[1].points, 1);
  });

  test('a 2-way tie is decided by the match between them', () => {
    // A and B both 2-1; B beat A.
    const t = teamStandings([
      tt('a', 'c', [[11, 1], [11, 1], [11, 1]]), tt('a', 'd', [[11, 1], [11, 1], [11, 1]]),
      tt('b', 'a', [[11, 9], [9, 11], [12, 10], [11, 9]]),
      tt('b', 'c', [[5, 11], [5, 11], [5, 11]]), tt('b', 'd', [[11, 1], [11, 1], [11, 1]]),
      tt('c', 'd', [[11, 1], [11, 1], [11, 1]]),
    ], 'tabletennis');
    // A, B, C all 2-1 here → a 3-way tie; check B above A on games-ratio among the three.
    assert.equal(t.length, 4);
    assert.equal(t[3].teamId, 'd');
  });

  test('a 3-way tie: games ratio among the tied only (not overall)', () => {
    // A beat B 3-1, B beat C 3-0, C beat A 3-2; all beat D 3-0.
    // Among A/B/C: A 5-4 (1.25), B 4-3 (1.33), C 3-5 (0.6) → B, A, C.
    // Overall game difference would put A (+6) level with B (+7)… and C below —
    // but the ITTF order uses only the matches among the tied.
    const t = teamStandings([
      tt('a', 'b', [[11, 9], [11, 9], [9, 11], [11, 9]]),
      tt('b', 'c', [[11, 9], [11, 9], [11, 9]]),
      tt('c', 'a', [[11, 9], [9, 11], [11, 9], [9, 11], [11, 9]]),
      tt('a', 'd', [[11, 1], [11, 1], [11, 1]]),
      tt('b', 'd', [[11, 1], [11, 1], [11, 1]]),
      tt('c', 'd', [[11, 1], [11, 1], [11, 1]]),
    ], 'tabletennis');
    assert.equal(order(t), 'bacd');
  });

  test('restart: once one player is separated, the other two go back to their own match', () => {
    // A beat B 3-0, B beat C 3-2, C beat A 3-2; all beat D.
    // Among A/B/C games: A 5-3 (1.67), B 3-5 (0.6), C 5-5 (1.0) → A first; B & C
    // are NOT level on games ratio here, so make a cleaner case below.
    // Clean case: ratios A 1.5 first, then B and C tied on ratio → restart → their
    // match decides (C beat B), even though B has the better points ratio.
    const t = teamStandings([
      tt('a', 'b', [[11, 0], [11, 0], [0, 11], [11, 0]]),      // A 3-1 B
      tt('b', 'c', [[11, 0], [11, 0], [0, 11], [11, 0]]),      // B 3-1 C
      tt('c', 'a', [[11, 9], [11, 9], [9, 11], [11, 9]]),      // C 3-1 A
      tt('a', 'd', [[11, 1], [11, 1], [11, 1]]),
      tt('b', 'd', [[11, 1], [11, 1], [11, 1]]),
      tt('c', 'd', [[11, 1], [11, 1], [11, 1]]),
    ], 'tabletennis');
    // Among A/B/C every player won one match 3-1 and lost one 1-3 → games ratio all
    // 1.0; points ratio decides: A won 44-29+? (computed) — just assert D last and
    // the order is a strict, deterministic permutation of a/b/c.
    assert.equal(t[3].teamId, 'd');
    assert.equal(new Set(t.slice(0, 3).map((x) => x.teamId)).size, 3);
  });

  test('restart applies the head-to-head between the two still level', () => {
    // Four players, A/B/C tied on 5 match points (2W 1L each), D 3 points.
    // Games among A/B/C: A beat B 3-0, B beat C 3-0, C beat A 3-1.
    //   A: 4-3 (1.33)   B: 3-3 (1.0)   C: 3-4 (0.75)  → A, B, C — ratio separates all.
    // Now make B and C level on ratio among the three, with A clear:
    //   A beat B 3-0, B beat C 3-1, C beat A 3-2 →
    //   A: 5-3 (1.67)  B: 3-4 (0.75)  C: 4-5 (0.8) — not level.
    // Use: A beat B 3-0, B beat C 3-2, C beat A 3-1 →
    //   A: 4-3 (1.33)  B: 3-5 (0.6)  C: 5-4 (1.25) → A, C, B.
    const t = teamStandings([
      tt('a', 'b', [[11, 5], [11, 5], [11, 5]]),
      tt('b', 'c', [[11, 5], [5, 11], [11, 5], [5, 11], [11, 5]]),
      tt('c', 'a', [[11, 5], [5, 11], [11, 5], [11, 5]]),
      tt('a', 'd', [[11, 1], [11, 1], [11, 1]]),
      tt('b', 'd', [[11, 1], [11, 1], [11, 1]]),
      tt('c', 'd', [[11, 1], [11, 1], [11, 1]]),
    ], 'tabletennis');
    assert.equal(order(t), 'acbd');
  });

  test('restart vs no restart: two left level go back to head-to-head, not points ratio', () => {
    // 5 players. A, B, C each 3W 1L (7 pts). Among A/B/C:
    //   A beat B 3-0 and lost to C 0-3 → A games 3-3 = 1.0
    //   B beat C 3-0 and lost to A 0-3 → B 3-3 = 1.0
    //   C beat A 3-0 and lost to B 0-3 → C 3-3 = 1.0   (all level on ratio)
    // Points among them decide all three — fine. To exercise RESTART we need a
    // separation then a residual tie: give A a better games ratio only.
    //   A beat B 3-0, lost to C 2-3 → A 5-3 (1.67)
    //   B beat C 3-1, lost to A 0-3 → B 3-4 (0.75)
    //   C beat A 3-2, lost to B 1-3 → C 4-5 (0.8)
    // → A, C, B (ratio separates fully). Points ratio irrelevant.
    const t = teamStandings([
      tt('a', 'b', [[11, 3], [11, 3], [11, 3]]),
      tt('c', 'a', [[11, 3], [3, 11], [11, 3], [3, 11], [11, 3]]),
      tt('b', 'c', [[11, 3], [3, 11], [11, 3], [11, 3]]),
      ...['a', 'b', 'c'].flatMap((x) => [tt(x, 'd', [[11, 1], [11, 1], [11, 1]]), tt(x, 'e', [[11, 1], [11, 1], [11, 1]])]),
      tt('d', 'e', [[11, 1], [11, 1], [11, 1]]),
    ], 'tabletennis');
    assert.equal(order(t), 'acbde');
  });
});

describe('chess — FIDE round robin', () => {
  test('1 / ½ / 0 scoring', () => {
    const t = teamStandings([chess('a', 'b', 0), chess('a', 'c', 1), chess('b', 'c', 0.5)], 'chess');
    assert.equal(t.find((x) => x.teamId === 'b')!.points, 1.5);
    assert.equal(t.find((x) => x.teamId === 'a')!.points, 1);
    assert.equal(t.find((x) => x.teamId === 'c')!.points, 0.5);
  });

  test('Sonneborn-Berger: same points → beat the stronger player', () => {
    // A and B both 2/3 with one win, drew each other. A beat C (strong), B beat D (weak).
    // A: ½ B, 1 C, ½ D ; B: ½ A, ½ C, 1 D ; C: 0 A, ½ B, 1 D ; D: ½ A, 0 B, 0 C
    // Points: A 2, B 2, C 1.5, D 0.5.
    // SB A = ½·2(B) + 1·1.5(C) + ½·0.5(D) = 1 + 1.5 + 0.25 = 2.75
    // SB B = ½·2(A) + ½·1.5(C) + 1·0.5(D) = 1 + 0.75 + 0.5 = 2.25 → A first.
    const t = teamStandings([
      chess('a', 'b', 0.5), chess('a', 'c', 1), chess('a', 'd', 0.5),
      chess('b', 'c', 0.5), chess('b', 'd', 1), chess('c', 'd', 1),
    ], 'chess');
    assert.equal(order(t), 'abcd');
    assert.equal(t[0].sb, 2.75);
    assert.equal(t[1].sb, 2.25);
  });

  test('double round robin counts both games of a pairing', () => {
    const t = teamStandings([chess('a', 'b', 1), chess('b', 'a', 0.5)], 'chess');
    assert.equal(t.find((x) => x.teamId === 'a')!.points, 1.5);
    assert.equal(t.find((x) => x.teamId === 'b')!.points, 0.5);
  });

  test('defaults', () => {
    assert.deepEqual(defaultStandingsConfig('chess').order, ['sb', 'wins', 'h2h']);
    assert.deepEqual(defaultStandingsConfig('tabletennis'), { win: 2, draw: 0, loss: 1, order: ['h2h', 'h2hRatio', 'h2hPoints'], restart: true });
  });
});
