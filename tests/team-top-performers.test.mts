/**
 * SD-105 — team page "Top performers". SD-27 retired the per-match "Top
 * scorer" award for the racket sports, which emptied their team pages; they
 * now show the schema's record leaders (Most wins, Best win %). Every other
 * sport keeps exactly the leaders it showed (golden, vs the pre-SD-27 awards).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeTeamStats } from '../src/data/teamStats.ts';
import { SPORT_AWARDS } from '../src/data/ratings.ts';

const T = (id: string, name: string) => ({ id, name, shortName: name.slice(0, 3), colorHex: '#fff' }) as never;
const A = T('a', 'Amber House'), B = T('b', 'Blue House'), C = T('c', 'Cyan House');

/** A completed team match; `home` wins when `hw`. */
const mk = (sport: string, id: string, home: never, away: never, hw: boolean, at: string) => ({
  id, sport, status: 'completed', startsAt: at, homeTeam: home, awayTeam: away,
  score: { home: hw ? 2 : 1, away: hw ? 1 : 2 }, winner: hw ? 'home' : 'away',
}) as never;

/** Team A's four ties: won 1, 2, 4; lost 3. */
const ties = (sport: string) => [
  mk(sport, `${sport}1`, A, B, true, '2026-10-01'), mk(sport, `${sport}2`, C, A, false, '2026-10-02'),
  mk(sport, `${sport}3`, A, B, false, '2026-10-03'), mk(sport, `${sport}4`, A, C, true, '2026-10-04'),
];

let n = 0;
const line = (sport: string, matchId: string, playerId: string, won: boolean, opponent: string, stats: Record<string, number> = {}) => ({
  id: `l${++n}`, matchId, playerId, sport, won, opponent, stats: { points: 21, ...stats },
});

/** p1 wins 3 of 4 (75%), p2 wins 3 of 3 (100%), p3 wins 2 of 2 (no qualifying win %),
 *  x (a Blue House player) wins on the other side of match 3. */
function racketLines(sport: string) {
  const ls = [
    line(sport, `${sport}1`, 'p1', true, 'Blue House'), line(sport, `${sport}2`, 'p1', true, 'Cyan House'),
    line(sport, `${sport}3`, 'p1', false, 'Blue House'), line(sport, `${sport}4`, 'p1', true, 'Cyan House'),
    line(sport, `${sport}1`, 'p2', true, 'Blue House'), line(sport, `${sport}2`, 'p2', true, 'Cyan House'),
    line(sport, `${sport}4`, 'p2', true, 'Cyan House'),
    line(sport, `${sport}1`, 'p3', true, 'Blue House'), line(sport, `${sport}4`, 'p3', true, 'Cyan House'),
    line(sport, `${sport}3`, 'x', true, 'Amber House', { points: 99 }),
    line(sport, `${sport}1`, 'x', false, 'Amber House'),
  ];
  const playedFor = {
    [`${sport}1`]: ['p1', 'p2', 'p3'], [`${sport}2`]: ['p1', 'p2'], [`${sport}3`]: ['p1'], [`${sport}4`]: ['p1', 'p2', 'p3'],
  };
  return { ls, playedFor };
}

const RACKETS = ['badminton', 'tabletennis', 'squash', 'padel', 'pickleball', 'tennis'];

for (const sport of RACKETS) {
  test(`${sport}: team page shows Most wins and Best win % (team members only)`, () => {
    const { ls, playedFor } = racketLines(sport);
    const s = computeTeamStats('a', ties(sport), ls as never, playedFor, SPORT_AWARDS);
    const wins = s.leaders.find((l) => l.stat === 'matchesWon');
    const pct = s.leaders.find((l) => l.stat === 'winPct');
    assert.ok(wins && pct, 'both record leaders');
    assert.equal(s.leaders[0].stat, 'matchesWon');
    assert.equal(s.leaders[1].stat, 'winPct');
    // p1 and p2 both have 3 wins; the tie goes to the better win % (p2)
    assert.equal(wins.label, 'Most wins'); assert.equal(wins.playerId, 'p2'); assert.equal(wins.total, 3);
    assert.equal(wins.display, '3 wins');
    assert.equal(pct.label, 'Best win %'); assert.equal(pct.playerId, 'p2'); assert.equal(pct.display, '100%');
    // the opponent's player never appears, nor does rally-point "Top scorer"
    assert.ok(!s.leaders.some((l) => l.playerId === 'x'));
    assert.ok(!s.leaders.some((l) => l.stat === 'points'));
  });
}

test('racket: win % needs 3 decided matches — a 2-from-2 player does not lead it', () => {
  const sport = 'badminton';
  const { ls } = racketLines(sport);
  // only p3 (2 of 2) and p1 limited to 2 matches → nobody qualifies
  const few = ls.filter((l) => l.playerId === 'p3');
  const s = computeTeamStats('a', ties(sport), few as never, { badminton1: ['p3'], badminton4: ['p3'] }, SPORT_AWARDS);
  assert.equal(s.leaders.find((l) => l.stat === 'matchesWon')?.display, '2 wins');
  assert.equal(s.leaders.find((l) => l.stat === 'winPct'), undefined);
});

test('racket: one win reads "1 win"', () => {
  const sport = 'squash';
  const ls = [line(sport, 'squash1', 'p1', true, 'Blue House')];
  const s = computeTeamStats('a', ties(sport), ls as never, { squash1: ['p1'] }, SPORT_AWARDS);
  assert.equal(s.leaders[0].display, '1 win');
});

test('tennis keeps its Aces leader after the record leaders', () => {
  const sport = 'tennis';
  const { ls, playedFor } = racketLines(sport);
  ls[0].stats.aces = 4;
  const s = computeTeamStats('a', ties(sport), ls as never, playedFor, SPORT_AWARDS);
  assert.deepEqual(s.leaders.map((l) => l.stat), ['matchesWon', 'winPct', 'aces']);
  assert.equal(s.leaders[2].playerId, 'p1');
});

/* ------------- golden: every other sport is unchanged vs pre-SD-27 ------------- */

/** The match awards as they stood before SD-27 (526d50e^), non-racket sports. */
const PRE_SD27: Record<string, { icon: string; label: string; stat: string }[]> = {
  football: [{ stat: 'goals', icon: '⚽', label: 'Top scorer' }, { stat: 'assists', icon: '🅰️', label: 'Playmaker' }, { stat: 'cleanSheets', icon: '🧤', label: 'Clean sheet' }],
  basketball: [{ stat: 'points', icon: '🏀', label: 'Top scorer' }, { stat: 'rebounds', icon: '💪', label: 'Rebounds' }, { stat: 'assists', icon: '🎯', label: 'Playmaker' }],
  kabaddi: [{ stat: 'raidPoints', icon: '🤼', label: 'Top raider' }, { stat: 'tacklePoints', icon: '🛡️', label: 'Top defender' }],
  volleyball: [{ stat: 'points', icon: '🏐', label: 'Top scorer' }, { stat: 'aces', icon: '💥', label: 'Aces' }],
  carrom: [{ stat: 'points', icon: '🎱', label: 'Top scorer' }, { stat: 'queens', icon: '👑', label: 'Queens' }],
  golf: [{ stat: 'birdies', icon: '🐦', label: 'Most birdies' }],
  cricket: [],
  chess: [],
};

const STATS: Record<string, Record<string, number>> = {
  football: { goals: 2, assists: 1, cleanSheets: 1 },
  basketball: { points: 14, rebounds: 6, assists: 3 },
  kabaddi: { raidPoints: 7, tacklePoints: 2 },
  volleyball: { points: 9, aces: 2, blocks: 3 },
  carrom: { points: 18, queens: 1, boards: 3 },
  golf: { birdies: 2 },
  cricket: { runs: 40, wickets: 2 },
  chess: { wins: 1, games: 1 },
};

for (const sport of Object.keys(PRE_SD27)) {
  test(`${sport}: top performers unchanged (golden vs pre-SD-27)`, () => {
    const ms = ties(sport);
    const more = Object.fromEntries(Object.entries(STATS[sport]).map(([k, v]) => [k, v + 1]));
    const ls = [
      line(sport, `${sport}1`, 'p1', true, 'Blue House', STATS[sport]),
      line(sport, `${sport}2`, 'p2', true, 'Cyan House', more),
      line(sport, `${sport}3`, 'p1', false, 'Blue House', STATS[sport]),
      line(sport, `${sport}3`, 'x', true, 'Amber House', more),
    ];
    const playedFor = { [`${sport}1`]: ['p1', 'p2'], [`${sport}2`]: ['p2'], [`${sport}3`]: ['p1'], [`${sport}4`]: ['p1'] };
    const now = computeTeamStats('a', ms, ls as never, playedFor, SPORT_AWARDS);
    const before = computeTeamStats('a', ms, ls as never, playedFor, PRE_SD27 as never);
    // no record leaders outside the racket sports
    assert.ok(!now.leaders.some((l) => l.stat === 'matchesWon' || l.stat === 'winPct'));
    assert.ok(now.leaders.every((l) => l.display === undefined));
    if (sport === 'volleyball') {
      // SD-27 deliberately added the per-match Blocks award; the rest is as before
      assert.deepEqual(now.leaders.filter((l) => l.stat !== 'blocks'), before.leaders);
      assert.deepEqual(now.leaders.map((l) => l.stat), ['points', 'aces', 'blocks']);
    } else {
      assert.deepEqual(now.leaders, before.leaders);
    }
    assert.deepEqual(now.appearances, before.appearances);
  });
}
