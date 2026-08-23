/**
 * Standings — the cross-sport "overall" house table.
 * A house fields a SEPARATE team row per sport (each row is single-sport), so
 * the overall table must merge those rows by NAME. Regression guard for the
 * go-live fix: keying the merge by teamId showed a multi-sport house as several
 * rows and never combined its points.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { overallStandings, teamStandings } from '../src/data/standings.ts';
import type { Match, SportId } from '../src/core/types.ts';

// A completed match: home hs–as away, in the given sport. Team ids are unique
// per sport (fb-red vs ck-red) to model separate per-sport team rows.
const m = (sport: SportId, homeId: string, homeName: string, awayId: string, awayName: string, hs: number, as: number): Match =>
  ({ id: `${sport}:${homeId}-${awayId}`, sport, status: 'completed', startsAt: '',
    score: { home: hs, away: as }, winner: hs > as ? 'home' : hs < as ? 'away' : 'draw',
    homeTeam: { id: homeId, name: homeName, shortName: homeName, sport },
    awayTeam: { id: awayId, name: awayName, shortName: awayName, sport }, state: null }) as unknown as Match;

describe('overallStandings — cross-sport house merge', () => {
  // Red House & Blue House each play in football and cricket, with a distinct
  // team row (id) per sport but the same house name.
  const matches: Match[] = [
    m('football', 'fb-red', 'Red House', 'fb-blue', 'Blue House', 2, 1),   // Red win  → Red +2
    m('cricket', 'ck-red', 'Red House', 'ck-blue', 'Blue House', 80, 120),  // Blue win → Blue +2
    m('cricket', 'ck-blue', 'Blue House', 'ck-red', 'Red House', 100, 100), // draw     → +1 each
  ];
  const table = overallStandings(matches, ['football', 'cricket']);

  test('one row per house, not per per-sport team row', () => {
    assert.equal(table.length, 2);
    assert.deepEqual([...table.map((t) => t.name)].sort(), ['Blue House', 'Red House']);
  });

  test('points and games sum across every sport', () => {
    const red = table.find((t) => t.name === 'Red House')!;
    const blue = table.find((t) => t.name === 'Blue House')!;
    assert.equal(red.points, 3);  // 2 (fb win) + 0 (ck loss) + 1 (ck draw)
    assert.equal(red.played, 3);
    assert.equal(blue.points, 3); // 0 (fb loss) + 2 (ck win) + 1 (ck draw)
    assert.equal(blue.played, 3);
  });

  test('name match is case/whitespace-insensitive', () => {
    const merged = overallStandings(
      [m('football', 'a', 'Red House', 'b', 'Blue House', 3, 0),
       m('cricket', 'c', ' red house ', 'd', 'Blue House', 50, 40)],
      ['football', 'cricket']
    );
    assert.equal(merged.find((t) => /red/i.test(t.name))!.played, 2);
  });

  test('per-sport teamStandings still separates the rows (unchanged)', () => {
    assert.equal(teamStandings(matches, 'football').length, 2);
    assert.equal(teamStandings(matches, 'cricket').length, 2);
  });
});
