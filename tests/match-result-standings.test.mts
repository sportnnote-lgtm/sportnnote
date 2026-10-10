/**
 * Standings for matches ended by hand (parity #04): no result / abandoned count
 * as played with `noResult` points and nothing towards for/against or NRR; a
 * cricket result with "Count in NRR" off takes its points only; head-to-head
 * shares `noResult` instead of reading a winner-less match as an away win; team
 * stats leave NR out.
 */
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  teamStandings, defaultStandingsConfig, standingsConfigFromFormat, noResultPoints, setStandingsRateProvider,
  type StandingsConfig,
} from '../src/data/standings.ts';
import { computeTeamStats, resultFor } from '../src/data/teamStats.ts';
import type { Match, MatchResult, SportId } from '../src/core/types.ts';

const at = '2026-10-09T10:00:00Z';
let n = 0;
const team = (id: string, sport: SportId) => ({ id, name: id.toUpperCase(), shortName: id, sport });
// A completed match home hs–as away; `result` makes it a manual end.
const m = (sport: SportId, home: string, away: string, hs: number, as: number, result?: MatchResult, state: unknown = null): Match =>
  ({ id: `m${++n}`, sport, status: 'completed', startsAt: `2026-10-0${(n % 9) + 1}T00:00:00Z`,
    score: { home: hs, away: as },
    winner: result
      ? result.kind === 'no_result' || result.kind === 'abandoned' ? undefined
        : result.kind === 'draw' || result.kind === 'tie' ? 'draw' : result.winner
      : hs > as ? 'home' : hs < as ? 'away' : 'draw',
    homeTeam: team(home, sport), awayTeam: team(away, sport), state, result }) as unknown as Match;
const nr = (kind: 'no_result' | 'abandoned' = 'no_result'): MatchResult => ({ kind, reason: 'Rain', at });
const row = (t: ReturnType<typeof teamStandings>, id: string) => t.find((r) => r.teamId === id)!;

afterEach(() => setStandingsRateProvider(null));

describe('no result / abandoned in the table', () => {
  test('each team played+1, nr+1, +noResult; for/against unchanged', () => {
    const matches = [m('cricket', 'a', 'b', 140, 120), m('cricket', 'a', 'b', 55, 0, nr()), m('cricket', 'b', 'a', 30, 12, nr('abandoned'))];
    const t = teamStandings(matches, 'cricket');
    const a = row(t, 'a');
    const b = row(t, 'b');
    assert.deepEqual([a.played, a.won, a.nr, a.points, a.for, a.against], [3, 1, 2, 2 + 2, 140, 120]);
    assert.deepEqual([b.played, b.lost, b.nr, b.points, b.for, b.against], [3, 1, 2, 0 + 2, 120, 140]);
  });
  test('NR adds no rate units', () => {
    setStandingsRateProvider(() => ({ home: 20, away: 20 }));
    const t = teamStandings([m('cricket', 'a', 'b', 55, 0, nr())], 'cricket');
    assert.equal(row(t, 'a').forUnits, 0);
    assert.equal(row(t, 'a').nrr, undefined);
  });
  test('the organiser’s noResult is used', () => {
    const cfg = standingsConfigFromFormat('football', { nrPoints: 2 });
    const t = teamStandings([m('football', 'a', 'b', 0, 0, nr())], 'football', cfg);
    assert.equal(row(t, 'a').points, 2);
    assert.equal(row(t, 'b').points, 2);
  });
  test('football defaults to 0 for a no result', () => {
    const t = teamStandings([m('football', 'a', 'b', 1, 0, nr('abandoned'))], 'football');
    assert.deepEqual([row(t, 'a').played, row(t, 'a').nr, row(t, 'a').points], [1, 1, 0]);
  });
  test('matches without a result have nr 0', () => {
    const t = teamStandings([m('football', 'a', 'b', 1, 0)], 'football');
    assert.equal(row(t, 'a').nr, 0);
  });
});

describe('config', () => {
  test('cricket default noResult 1, football 0', () => {
    assert.equal(noResultPoints('cricket', defaultStandingsConfig('cricket')), 1);
    assert.equal(noResultPoints('football', defaultStandingsConfig('football')), 0);
    assert.equal(noResultPoints('chess'), 0);
  });
  test('nrPoints parsed from the format', () => {
    assert.equal(standingsConfigFromFormat('cricket', { nrPoints: 0 }).noResult, 0);
    assert.equal(noResultPoints('cricket', standingsConfigFromFormat('cricket', { nrPoints: 3 })), 3);
    assert.equal(noResultPoints('cricket', standingsConfigFromFormat('cricket', { winPoints: 2 })), 1);
  });
});

describe('cricket manual results and NRR', () => {
  test('countNrr:false takes the points but no runs or rate', () => {
    setStandingsRateProvider(() => ({ home: 20, away: 20 }));
    const won: MatchResult = { kind: 'awarded', winner: 'home', reason: 'Injury', at, countNrr: false };
    const t = teamStandings([m('cricket', 'a', 'b', 90, 40, won)], 'cricket');
    const a = row(t, 'a');
    assert.deepEqual([a.won, a.points, a.for, a.against, a.forUnits, a.againstUnits], [1, 2, 0, 0, 0, 0]);
    assert.equal(a.nrr, undefined);
  });
  test('countNrr on asks the provider for the manual rate', () => {
    const calls: boolean[] = [];
    setStandingsRateProvider((_s, _st, manual) => { calls.push(!!manual); return manual ? { home: 20, away: 20 } : { home: 10, away: 10 }; });
    const tie: MatchResult = { kind: 'tie', reason: 'Bad light', at, countNrr: true };
    const t = teamStandings([m('cricket', 'a', 'b', 100, 100, tie, {}), m('cricket', 'a', 'b', 100, 80, undefined, {})], 'cricket');
    assert.deepEqual(calls, [true, false]);
    const a = row(t, 'a');
    assert.deepEqual([a.drawn, a.won, a.points, a.for, a.forUnits], [1, 1, 3, 200, 30]);
  });
});

describe('head-to-head with a no result', () => {
  test('two teams level after an NR take noResult each from it', () => {
    const matches = [
      m('cricket', 'a', 'c', 100, 90), m('cricket', 'b', 'c', 200, 90), m('cricket', 'a', 'b', 0, 0, nr()),
    ];
    const t = teamStandings(matches, 'cricket', { win: 2, draw: 1, loss: 0, order: ['h2h', 'for'] });
    assert.equal(row(t, 'a').points, 3);
    assert.equal(row(t, 'b').points, 3);
    assert.deepEqual(t.map((r) => r.teamId), ['b', 'a', 'c']); // h2h 1–1 → more runs
  });
  test('h2h NR is not an away win (b, the away side, used to rank first)', () => {
    const matches = [
      m('cricket', 'a', 'c', 200, 90), m('cricket', 'b', 'c', 100, 90), m('cricket', 'a', 'b', 0, 0, nr()),
    ];
    const t = teamStandings(matches, 'cricket', { win: 2, draw: 1, loss: 0, order: ['h2h', 'for'] });
    assert.deepEqual(t.map((r) => r.teamId), ['a', 'b', 'c']);
  });
  test('Sonneborn-Berger skips NR', () => {
    const t = teamStandings([m('chess', 'a', 'b', 0, 0, nr())], 'chess');
    assert.equal(row(t, 'a').sb, 0);
    assert.equal(row(t, 'b').sb, 0);
  });
});

describe('team stats', () => {
  // SD-12 (cross-sport X4): a no result counts as played — like the table —
  // but adds no W/D/L and no runs.
  test('NR / abandoned count as played (NR), with no score', () => {
    const matches = [m('cricket', 'a', 'b', 120, 100), m('cricket', 'a', 'b', 50, 10, nr()), m('cricket', 'b', 'a', 5, 5, nr('abandoned'))];
    assert.equal(resultFor(matches[1], 'a'), 'NR');
    // even when an old snapshot left a winner on the row
    assert.equal(resultFor({ ...matches[1], winner: 'draw' } as Match, 'a'), 'NR');
    const s = computeTeamStats('a', matches);
    assert.deepEqual([s.played, s.won, s.nr, s.scored, s.conceded, s.form.length], [3, 1, 2, 120, 100, 3]);
  });
});
