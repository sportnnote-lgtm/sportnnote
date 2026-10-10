/**
 * SD-12 — standings and team-record bugs (cross-sport audit X1, X2, X4; cricket
 * CK-02 labels):
 *  X1  the overall house table scores each sport with the organiser's points
 *      config (win/draw/loss/NR points + adjustments), so it equals the sum of
 *      the per-sport tables;
 *  X2  cross-group seeding (best thirds, seeding within a rank) uses each
 *      sport's own tie-break chain, not "score for";
 *  X4  a no result counts in the team page's Played (as in the table);
 *  CK-02 cricket labels: a tie is "T", an NR column, NRR instead of a run
 *      difference.
 */
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  overallStandings, teamStandings, standingsConfigFromFormat, defaultStandingsConfig, tableLabels, seedKey,
  setStandingsPointsProvider, type TeamStanding,
} from '../src/data/standings.ts';
import { advancement, qualifiersFromSelection, type GroupTable } from '../src/data/groups.ts';
import { computeTeamStats, resultFor } from '../src/data/teamStats.ts';
import type { Match, SportId } from '../src/core/types.ts';

const m = (sport: SportId, homeId: string, homeName: string, awayId: string, awayName: string, hs: number, as: number, extra: Partial<Match> = {}): Match =>
  ({ id: `${sport}:${homeId}-${awayId}:${hs}-${as}`, sport, status: 'completed', startsAt: '2026-10-01',
    score: { home: hs, away: as }, winner: hs > as ? 'home' : hs < as ? 'away' : 'draw',
    homeTeam: { id: homeId, name: homeName, shortName: homeName, sport },
    awayTeam: { id: awayId, name: awayName, shortName: awayName, sport }, state: null, ...extra }) as unknown as Match;

describe('X1 — overall house table uses the organiser points config', () => {
  const matches: Match[] = [
    m('football', 'fb-red', 'Red House', 'fb-blue', 'Blue House', 2, 1), // Red win
    m('football', 'fb-blue', 'Blue House', 'fb-green', 'Green House', 1, 1), // draw
    m('cricket', 'ck-blue', 'Blue House', 'ck-red', 'Red House', 120, 80), // Blue win
    m('cricket', 'ck-green', 'Green House', 'ck-red', 'Red House', 0, 0, { winner: undefined, result: { kind: 'no_result', reason: 'rain', at: '' } }),
  ];

  test('no formats → the sport defaults (unchanged behaviour)', () => {
    const t = overallStandings(matches, ['football', 'cricket']);
    const pts = Object.fromEntries(t.map((o) => [o.name, o.points]));
    // football 3-1-0, cricket 2-1-0 with NR 1
    assert.deepEqual(pts, { 'Red House': 3 + 0 + 1, 'Blue House': 0 + 1 + 2, 'Green House': 1 + 1 });
  });

  test('custom win/draw/NR points and an adjustment flow into the overall total', () => {
    const formats = {
      football: { winPoints: 5, drawPoints: 2, lossPoints: 1 },
      cricket: { winPoints: 4, nrPoints: 2, pointsAdj: JSON.stringify([{ id: 'x', teamId: 'ck-blue', points: -3, reason: 'late', at: '' }]) },
    };
    const t = overallStandings(matches, ['football', 'cricket'], formats);
    const pts = Object.fromEntries(t.map((o) => [o.name, o.points]));
    assert.deepEqual(pts, { 'Red House': 5 + 0 + 2, 'Blue House': 1 + 2 + 4 - 3, 'Green House': 2 + 2 });
    // …and it is exactly the sum of the per-sport tables
    for (const o of t) {
      const sum = (['football', 'cricket'] as SportId[]).reduce((n, sp) => n
        + (teamStandings(matches, sp, standingsConfigFromFormat(sp, formats[sp as 'football'])).find((r) => r.name === o.name)?.points ?? 0), 0);
      assert.equal(o.points, sum);
    }
    assert.equal(t[0].name, 'Red House');
  });

  test('NR matches count in the overall Played', () => {
    const t = overallStandings(matches, ['football', 'cricket']);
    assert.equal(t.find((o) => o.name === 'Green House')!.played, 2);
  });
});

// A pre-ranked row: only what cross-group seeding reads.
const row = (teamId: string, p: Partial<TeamStanding>): TeamStanding =>
  ({ teamId, name: teamId, played: 3, won: 0, lost: 0, drawn: 0, nr: 0, for: 0, against: 0, diff: 0, points: 0, forUnits: 0, againstUnits: 0, adjust: 0, ...p });
const group = (name: string, ...rows: TeamStanding[]): GroupTable => ({ name, rows });

describe('X2 — cross-group seeding uses the sport’s tie-breakers', () => {
  test('table tennis: best third by overall games ratio, not games won', () => {
    const cfg = defaultStandingsConfig('tabletennis');
    // Equal points. X won more games (9) but at a worse ratio (9/9 = 1) than Y (6/2 = 3).
    const tables = [
      group('A', row('A1', { points: 6 }), row('A2', { points: 5 }), row('X', { points: 4, for: 9, against: 9 })),
      group('B', row('B1', { points: 6 }), row('B2', { points: 5 }), row('Y', { points: 4, for: 6, against: 2 })),
    ];
    const q = advancement(tables, 2, 1, cfg);
    assert.equal(q.at(-1)!.teamId, 'Y'); // was X ("score for")
  });

  test('table tennis: games ratio level → overall rally-point ratio', () => {
    const cfg = defaultStandingsConfig('tabletennis');
    const tables = [
      group('A', row('A1', { points: 6 }), row('X', { points: 4, for: 6, against: 3, rallyFor: 100, rallyAgainst: 100 })),
      group('B', row('B1', { points: 6 }), row('Y', { points: 4, for: 4, against: 2, rallyFor: 90, rallyAgainst: 60 })),
    ];
    assert.equal(advancement(tables, 1, 1, cfg).at(-1)!.teamId, 'Y');
  });

  test('chess: Sonneborn-Berger then wins (not game points "for")', () => {
    const cfg = defaultStandingsConfig('chess');
    const tables = [
      group('A', row('A1', { points: 3 }), row('X', { points: 2, sb: 2, won: 2, for: 9 })),
      group('B', row('B1', { points: 3 }), row('Y', { points: 2, sb: 3.5, won: 1, for: 1 })),
      group('C', row('C1', { points: 3 }), row('Z', { points: 2, sb: 3.5, won: 2, for: 0 })),
    ];
    const q = advancement(tables, 1, 2, cfg);
    assert.deepEqual(q.filter((x) => x.via === 'best').map((x) => x.teamId), ['Z', 'Y']);
  });

  test('football: goal difference then goals for (unchanged)', () => {
    const cfg = defaultStandingsConfig('football');
    const tables = [
      group('A', row('A1', { points: 9 }), row('X', { points: 4, diff: 3, for: 5 })),
      group('B', row('B1', { points: 9 }), row('Y', { points: 4, diff: 2, for: 9 })),
      group('C', row('C1', { points: 9 }), row('Z', { points: 4, diff: 3, for: 6 })),
    ];
    const q = advancement(tables, 1, 2, cfg);
    assert.deepEqual(q.filter((x) => x.via === 'best').map((x) => x.teamId), ['Z', 'X']);
  });

  test('an organiser chain (e.g. "for" first) is honoured; seeding within a rank uses it too', () => {
    const cfg = standingsConfigFromFormat('football', { tieBreak: 'for,diff' });
    const tables = [group('A', row('X', { points: 6, diff: 5, for: 5 })), group('B', row('Y', { points: 6, diff: 1, for: 8 }))];
    assert.deepEqual(qualifiersFromSelection(tables, ['X', 'Y'], cfg).map((q) => q.teamId), ['Y', 'X']);
  });

  test('seedKey: h2h is skipped (teams from different groups never met)', () => {
    assert.equal(seedKey(row('X', {}), 'h2h'), null);
    assert.equal(seedKey(row('X', { for: 4, against: 0 }), 'h2hRatio'), Number.POSITIVE_INFINITY);
  });

  describe('rally points ride on the TT table rows', () => {
    afterEach(() => setStandingsPointsProvider(null));
    test('teamStandings fills rallyFor / rallyAgainst when the order uses the points ratio', () => {
      setStandingsPointsProvider((_sp, st) => (st as { pts: { home: number; away: number } }).pts);
      const ms = [
        m('tabletennis', 'p', 'P', 'q', 'Q', 3, 1, { state: { pts: { home: 44, away: 30 } } as never }),
        m('tabletennis', 'q', 'Q', 'r', 'R', 3, 2, { state: { pts: { home: 50, away: 48 } } as never }),
      ];
      const t = teamStandings(ms, 'tabletennis');
      const q = t.find((x) => x.teamId === 'q')!;
      assert.deepEqual([q.rallyFor, q.rallyAgainst], [30 + 50, 44 + 48]);
      // football's order doesn't use it → no rally fields
      assert.equal(teamStandings([m('football', 'a', 'A', 'b', 'B', 1, 0)], 'football')[0].rallyFor, undefined);
    });
  });
});

describe('X4 — a no result counts in the team page’s Played', () => {
  const nr = m('cricket', 'a', 'A', 'b', 'B', 40, 0, { winner: undefined, result: { kind: 'abandoned', reason: 'rain', at: '' }, startsAt: '2026-10-03' });
  const ms = [m('cricket', 'a', 'A', 'b', 'B', 150, 120), m('cricket', 'b', 'B', 'a', 'A', 130, 130, { startsAt: '2026-10-02' }), nr];

  test('resultFor: NR and a cricket tie "T"', () => {
    assert.equal(resultFor(nr, 'a'), 'NR');
    assert.equal(resultFor(ms[1], 'a'), 'T');
    assert.equal(resultFor(m('football', 'a', 'A', 'b', 'B', 1, 1), 'a'), 'D');
    assert.equal(resultFor(nr, 'zzz'), null);
  });

  test('team stats: P 3 = 1W 1T 0L 1NR, the NR scores nothing; same Played as the table', () => {
    const s = computeTeamStats('a', ms);
    assert.deepEqual([s.played, s.won, s.drawn, s.lost, s.nr], [3, 1, 1, 0, 1]);
    assert.deepEqual(s.form.map((f) => f.result), ['NR', 'T', 'W']);
    assert.equal(s.scored, 150 + 130);
    assert.deepEqual([s.headToHead[0].played, s.headToHead[0].nr], [3, 1]);
    const table = teamStandings(ms, 'cricket').find((r) => r.teamId === 'a')!;
    assert.equal(s.played, table.played);
  });
});

describe('CK-02 — cricket table labels', () => {
  test('cricket: T, always NR, NRR instead of run difference', () => {
    assert.deepEqual(tableLabels('cricket'), { draw: 'T', alwaysNr: true, showDiff: false });
  });
  test('other sports keep D, NR only when needed, and the difference', () => {
    for (const sp of ['football', 'basketball', undefined] as const) assert.deepEqual(tableLabels(sp), { draw: 'D', alwaysNr: false, showDiff: true });
  });
  test('kabaddi calls a level result a Tie (SD-18, PKL "T")', () => {
    assert.deepEqual(tableLabels('kabaddi'), { draw: 'T', alwaysNr: false, showDiff: true });
  });
});
