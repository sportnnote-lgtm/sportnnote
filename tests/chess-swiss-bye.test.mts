/**
 * SD-10 — chess Swiss bye point and unplayed games (FIDE C.04 / C.07; founder
 * decision D7). A pairing-allocated bye scores 1 by default (organiser: ½ or 0)
 * but isn't a played game; forfeits keep their points but stay out of the
 * played-game stats and Sonneborn-Berger. Round robin is unchanged.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  teamStandings, standingsConfigFromFormat, byePointsFor, isChessForfeit, defaultStandingsConfig,
  type TeamStanding,
} from '../src/data/standings.ts';
import { standingsPhases } from '../src/data/groups.ts';
import type { Match } from '../src/core/types.ts';

let seq = 0;
/** A chess game: 1 = home won, 0 = away won, 0.5 = draw. */
function chess(home: string, away: string, r: 1 | 0 | 0.5, extra: Partial<Match> & { method?: string } = {}): Match {
  const { method, ...rest } = extra;
  return {
    id: `g${++seq}`, sport: 'chess', status: 'completed', startsAt: '',
    winner: r === 1 ? 'home' : r === 0 ? 'away' : 'draw',
    score: { home: r, away: 1 - r },
    homeTeam: { id: home, name: home.toUpperCase() }, awayTeam: { id: away, name: away.toUpperCase() },
    state: method ? { white: 'home', timeControl: 'rapid', winner: r === 1 ? 'home' : 'away', method, ended: true, seq: 1 } : null,
    ...rest,
  } as unknown as Match;
}
const row = (t: TeamStanding[], id: string) => t.find((r) => r.teamId === id)!;

/** 5 players, 2 Swiss rounds. Round 1: c sits out; round 2: e sits out. The bye
 *  id rides on every fixture of the round (as GenerateFixturesScreen writes it). */
function swiss5(): Match[] {
  return [
    chess('a', 'd', 1, { stage: 'swiss1', byes: ['c'] }),
    chess('b', 'e', 0.5, { stage: 'swiss1', byes: ['c'] }),
    chess('a', 'b', 1, { stage: 'swiss2', byes: ['e'] }),
    chess('c', 'd', 0, { stage: 'swiss2', byes: ['e'] }),
  ];
}

describe('Swiss bye point', () => {
  test('defaults to 1 point for chess (D7), including events with no byePoints saved', () => {
    assert.equal(byePointsFor('chess'), 1);
    assert.equal(byePointsFor('chess', standingsConfigFromFormat('chess', {})), 1);
    const t = teamStandings(swiss5(), 'chess', standingsConfigFromFormat('chess', { timeControl: 'rapid' }));
    // c: bye (1) + lost to d → 1 point; e: drew b + bye → 1.5.
    assert.equal(row(t, 'c').points, 1);
    assert.equal(row(t, 'c').byes, 1);
    assert.equal(row(t, 'e').points, 1.5);
    assert.equal(row(t, 'e').byes, 1);
    // de-duplicated: the bye id is on two fixtures of the round, credited once
    assert.equal(row(t, 'a').points, 2);
    assert.equal(row(t, 'a').byes, undefined);
  });

  test('organiser can choose ½ or 0', () => {
    const half = teamStandings(swiss5(), 'chess', standingsConfigFromFormat('chess', { byePoints: 0.5 }));
    assert.equal(row(half, 'c').points, 0.5);
    assert.equal(row(half, 'e').points, 1);
    const zero = teamStandings(swiss5(), 'chess', standingsConfigFromFormat('chess', { byePoints: 0 }));
    assert.equal(row(zero, 'c').points, 0);
    assert.equal(row(zero, 'c').byes, 1, 'still recorded as a bye');
  });

  test('a bye is not a played game: out of P / W / D / L and for/against', () => {
    const t = teamStandings(swiss5(), 'chess');
    const c = row(t, 'c');
    assert.deepEqual([c.played, c.won, c.drawn, c.lost, c.for, c.against], [1, 0, 0, 1, 0, 1]);
    const e = row(t, 'e');
    assert.deepEqual([e.played, e.won, e.drawn, e.lost], [1, 0, 1, 0]);
  });

  test('the bye is flagged unplayed in the per-round record (C.07 tie-break data)', () => {
    const c = row(teamStandings(swiss5(), 'chess'), 'c');
    const bye = c.games!.find((g) => g.kind === 'bye')!;
    assert.deepEqual([bye.unplayed, bye.stage, bye.result, bye.points, bye.opponentId], [true, 'swiss1', 'win', 1, undefined]);
    assert.ok(c.games!.filter((g) => g.kind === 'played').every((g) => !g.unplayed));
    const half = row(teamStandings(swiss5(), 'chess', standingsConfigFromFormat('chess', { byePoints: 0.5 })), 'c');
    assert.equal(half.games!.find((g) => g.kind === 'bye')!.result, 'draw');
  });

  test('a bye-only entrant (round 1 drawn, nothing played yet) shows with its name', () => {
    const r1 = [
      chess('a', 'd', 1, { stage: 'swiss1', byes: ['c'], status: 'scheduled', winner: undefined }),
      chess('b', 'e', 1, { stage: 'swiss1', byes: ['c'], status: 'scheduled', winner: undefined }),
    ];
    const t = teamStandings(r1, 'chess', undefined, undefined, [{ id: 'c', name: 'Carlsen' }]);
    assert.deepEqual(t.map((r) => [r.name, r.points, r.played]), [['Carlsen', 1, 0]]);
    // the Swiss phase table passes the names through too
    const ph = standingsPhases(r1, 'chess', undefined, [{ id: 'c', name: 'Carlsen' }]);
    assert.equal(ph[0].key, 'swiss');
    assert.equal(ph[0].rows[0].name, 'Carlsen');
  });

  test('a cancelled round or a non-Swiss bye (knockout play-in) scores nothing', () => {
    const cancelled = [chess('a', 'b', 1, { stage: 'swiss1', byes: ['c'], status: 'cancelled' })];
    assert.equal(teamStandings(cancelled, 'chess').find((r) => r.teamId === 'c'), undefined);
    const playIn = [chess('a', 'b', 1, { stage: 'po1', byes: ['c'] })];
    assert.equal(teamStandings(playIn, 'chess').find((r) => r.teamId === 'c'), undefined);
  });

  test('the bye ranks the sitter correctly (it was a point short before)', () => {
    // After round 1 alone: a 1, c 1 (bye), b ½, e ½, d 0 — c must not be last.
    const r1 = swiss5().filter((m) => m.stage === 'swiss1');
    const t = teamStandings(r1, 'chess');
    assert.equal(row(t, 'c').points, 1);
    assert.equal(t[t.length - 1].teamId, 'd');
  });

  test('other sports: no bye point unless the organiser set one (unchanged)', () => {
    const fb = swiss5().map((m) => ({ ...m, sport: 'football' as const, state: null }));
    assert.equal(byePointsFor('football'), undefined);
    const t = teamStandings(fb, 'football');
    assert.equal(row(t, 'c').points, 0);
    assert.equal(row(t, 'c').byes, undefined);
    assert.equal(row(t, 'a').games, undefined);
  });
});

describe('forfeits (chess)', () => {
  test('a walkover or a "forfeit" result is a chess forfeit; other sports are not', () => {
    assert.ok(isChessForfeit(chess('a', 'b', 1, { walkover: true })));
    assert.ok(isChessForfeit(chess('a', 'b', 1, { method: 'forfeit' })));
    assert.ok(!isChessForfeit(chess('a', 'b', 1, { method: 'resignation' })));
    assert.ok(!isChessForfeit({ ...chess('a', 'b', 1, { walkover: true }), sport: 'football' } as Match));
  });

  test('a forfeit keeps its points but is out of played / W / L', () => {
    const t = teamStandings([chess('a', 'b', 1, { method: 'forfeit' }), chess('a', 'c', 0.5)], 'chess');
    const a = row(t, 'a');
    assert.deepEqual([a.points, a.played, a.won, a.drawn, a.forfeitWins], [1.5, 1, 0, 1, 1]);
    const b = row(t, 'b');
    assert.deepEqual([b.points, b.played, b.lost, b.forfeitLosses], [0, 0, 0, 1]);
    const g = a.games!.find((x) => x.opponentId === 'b')!;
    assert.deepEqual([g.kind, g.unplayed, g.result], ['forfeit', true, 'win']);
  });

  test('a forfeit is out of Sonneborn-Berger', () => {
    // a beats b over the board and c by forfeit; c beats b. Final: a 2, c 1, b 0.
    const games = [chess('a', 'b', 1), chess('a', 'c', 1, { walkover: true }), chess('c', 'b', 1)];
    const t = teamStandings(games, 'chess');
    // a's SB counts only the played win over b (0 points) — not c's 1.
    assert.equal(row(t, 'a').sb, 0);
    // Played as normal games it would have been 1.
    const played = teamStandings([chess('a', 'b', 1), chess('a', 'c', 1), chess('c', 'b', 1)], 'chess');
    assert.equal(row(played, 'a').sb, 1);
  });

  test('"number of wins" still counts a forfeit win (FIDE C.07 WIN)', () => {
    // a and b both 1½; a has an over-the-board win, b a forfeit win → wins level → h2h (draw) → name.
    const games = [chess('a', 'b', 0.5), chess('a', 'c', 1), chess('b', 'c', 1, { walkover: true })];
    const cfg = { ...defaultStandingsConfig('chess'), order: ['wins' as const] };
    const t = teamStandings(games, 'chess', cfg);
    assert.deepEqual(t.slice(0, 2).map((r) => r.teamId), ['a', 'b']);
    assert.equal(row(t, 'b').won, 0);
    assert.equal(row(t, 'b').forfeitWins, 1);
  });
});

describe('unchanged behaviour', () => {
  test('round robin without forfeits or byes: same table as before (Candidates-style)', () => {
    const t = teamStandings([
      chess('a', 'b', 0.5), chess('a', 'c', 1), chess('a', 'd', 0.5),
      chess('b', 'c', 0.5), chess('b', 'd', 1), chess('c', 'd', 1),
    ], 'chess');
    assert.deepEqual(t.map((r) => [r.teamId, r.points, r.played, r.won, r.drawn, r.lost, r.sb, r.byes, r.forfeitWins]), [
      ['a', 2, 3, 1, 2, 0, 2.75, undefined, undefined],
      ['b', 2, 3, 1, 2, 0, 2.25, undefined, undefined],
      ['c', 1.5, 3, 1, 1, 1, 1.5, undefined, undefined],
      ['d', 0.5, 3, 0, 1, 2, 1, undefined, undefined],
    ]);
  });

  test('non-Swiss standings of other sports: rows carry no new fields', () => {
    const fb: Match[] = [chess('a', 'b', 1, { walkover: true }), chess('b', 'c', 0)].map((m) => ({ ...m, sport: 'football' as const }));
    const t = teamStandings(fb, 'football');
    for (const r of t) {
      assert.equal(r.byes, undefined);
      assert.equal(r.forfeitWins, undefined);
      assert.equal(r.games, undefined);
    }
    // a football walkover is still a normal played win
    assert.deepEqual([row(t, 'a').played, row(t, 'a').won, row(t, 'a').points], [1, 1, 3]);
  });

  test('standingsConfigFromFormat only sets bye when byePoints is saved', () => {
    assert.equal(standingsConfigFromFormat('chess', {}).bye, undefined);
    assert.equal(standingsConfigFromFormat('chess', { byePoints: 0.5 }).bye, 0.5);
    assert.deepEqual(standingsConfigFromFormat('football', {}), defaultStandingsConfig('football'));
  });
});
