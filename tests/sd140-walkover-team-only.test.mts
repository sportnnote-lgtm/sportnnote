/**
 * SD-140 (founder, 2026-10-11) — walkover scores:
 *  - friendlies use the federation default (a match-level override doesn't count);
 *  - a tournament's per-sport `walkoverScore` applies;
 *  - the walkover / forfeit score counts to the TEAM (team stats, team records,
 *    team head-to-head, series aggregates) and never to any player (stat lines,
 *    careers, player head-to-head);
 *  - team stats count walkovers won / given;
 *  - older walkovers without a `result.forfeit` block read as before.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import type { Match, StatLine } from '../src/core/types.ts';
import { walkoverFormatFor, walkoverRuleFor, forfeitFor, teamScoreOf, isWalkover } from '../src/data/walkover.ts';
import { computeTeamStats, h2hLastText } from '../src/data/teamStats.ts';
import { teamPerGame, teamRecords } from '../src/data/teamRecords.ts';
import { teamHeadToHead, playerHeadToHead, meetingText } from '../src/data/headToHead.ts';
import { resolveSeries, seriesLegFormat, aggregatePriorFor, deriveSeries } from '../src/data/series.ts';
import { teamStandings } from '../src/data/standings.ts';

const T = (id: string, name: string) => ({ id, name, shortName: name.slice(0, 3), sport: 'football' as const });
const A = T('A', 'Aravali');
const B = T('B', 'Nilgiri');
const C = T('C', 'Shivalik');
let n = 0;
const played = (home: typeof A, away: typeof A, h: number, a: number, day: number, o: Partial<Match> = {}): Match => ({
  id: `m${++n}`, sport: 'football', status: 'completed', startsAt: `2026-11-${String(day).padStart(2, '0')}T10:00:00Z`,
  homeTeam: home, awayTeam: away, score: { home: h, away: a }, winner: h > a ? 'home' : h < a ? 'away' : 'draw', tournamentId: 't1', ...o,
}) as Match;
/** A walkover the way repos.walkoverMatch writes it (no board score). */
const wo = (home: typeof A, away: typeof A, winner: 'home' | 'away', day: number, forfeit = true): Match => ({
  id: `m${++n}`, sport: 'football', status: 'completed', startsAt: `2026-11-${String(day).padStart(2, '0')}T10:00:00Z`,
  homeTeam: home, awayTeam: away, winner, walkover: true, tournamentId: 't1',
  result: { kind: 'conceded', winner, reason: 'Walkover', at: '2026-11-01T00:00:00Z',
    ...(forfeit ? { forfeit: forfeitFor({ sport: 'football', kind: 'walkover', winner })! } : {}) },
}) as Match;

describe('SD-140 · friendlies vs tournaments', () => {
  test('a friendly uses the federation default even if the match format carries a score', () => {
    const f = walkoverFormatFor(undefined, { walkoverScore: '1-0', halfMinutes: 30 }, false);
    assert.equal(f.walkoverScore, undefined);
    assert.equal(f.halfMinutes, 30);
    const r = walkoverRuleFor('football', f)!;
    assert.deepEqual([r.win, r.loss, r.custom], [3, 0, false]);
    assert.deepEqual(forfeitFor({ sport: 'basketball', kind: 'walkover', winner: 'away', format: walkoverFormatFor(undefined, {}, false) })!.score, { home: 0, away: 20 });
  });
  test('a tournament uses its own score, or none ("No score")', () => {
    assert.deepEqual(walkoverRuleFor('football', walkoverFormatFor({ walkoverScore: '2-0' }, {}, true))!.win, 2);
    assert.equal(walkoverRuleFor('football', walkoverFormatFor({ walkoverScore: 'off' }, {}, true)), null);
    assert.equal(walkoverRuleFor('kabaddi', walkoverFormatFor({}, {}, true)), null); // no federation default
    assert.equal(walkoverRuleFor('kabaddi', walkoverFormatFor({ walkoverScore: '5-0' }, {}, true))!.win, 5);
  });
});

describe('SD-140 · the score is the team’s', () => {
  test('teamScoreOf: forfeit score, else board; an old walkover has none', () => {
    const w = wo(A, B, 'home', 1);
    assert.equal(isWalkover(w), true);
    assert.deepEqual(teamScoreOf(w), { home: 3, away: 0 });
    assert.equal(teamScoreOf(wo(A, B, 'home', 1, false)), undefined);
    assert.deepEqual(teamScoreOf(played(A, B, 2, 1, 1)), { home: 2, away: 1 });
    // conceded during play with a smaller margin than 3-0: the forfeit score
    const c = played(A, B, 1, 0, 2, { result: { kind: 'conceded', winner: 'home', reason: 'Left the field', at: '', forfeit: { score: { home: 3, away: 0 }, rule: 'FIFA 3-0 (forfeit)' } } });
    assert.deepEqual(teamScoreOf(c), { home: 3, away: 0 });
    assert.equal(isWalkover(c), false);
  });

  test('team stats: scored / conceded include the walkover score; walkovers won / given', () => {
    const ms = [played(A, B, 2, 1, 1), wo(A, C, 'home', 2), wo(B, A, 'home', 3), wo(A, C, 'home', 4, false)];
    const s = computeTeamStats('A', ms);
    assert.deepEqual([s.played, s.won, s.lost], [4, 3, 1]);
    assert.equal(s.scored, 2 + 3 + 0 + 0);
    assert.equal(s.conceded, 1 + 0 + 3 + 0);
    assert.deepEqual([s.walkoversWon, s.walkoversGiven], [2, 1]);
    const vsC = s.headToHead.find((h) => h.opponentId === 'C')!;
    assert.deepEqual([vsC.for, vsC.against], [3, 0]);
    // the latest meeting with C is the old walkover (no forfeit score)
    assert.equal(h2hLastText({ last: { ...vsC.last!, line: 'w/o' } }), 'Last: W w/o');
    const vsB = s.headToHead.find((h) => h.opponentId === 'B')!;
    assert.equal(h2hLastText({ last: { ...vsB.last!, line: 'w/o' } }), 'Last: L 0–3 w/o');
    // the chips (tournament / season) feed it fewer matches → fewer walkovers
    assert.deepEqual([computeTeamStats('A', ms.slice(0, 2)).walkoversWon, computeTeamStats('A', ms.slice(0, 2)).walkoversGiven], [1, 0]);
  });

  test('team stats agree with the table on goal difference', () => {
    const ms = [played(A, B, 2, 1, 1), wo(A, C, 'home', 2), wo(B, A, 'home', 3)];
    const row = teamStandings(ms, 'football').find((r) => r.teamId === 'A')!;
    const s = computeTeamStats('A', ms);
    assert.equal(s.scored - s.conceded, row.for - row.against);
  });

  test('team records and per game count it; a walkover is no clean sheet', () => {
    const ms = [played(A, B, 1, 0, 1), wo(A, C, 'home', 2)];
    const pg = teamPerGame('football', 'A', ms)!;
    assert.equal(pg.games, 2);
    assert.equal(pg.diff, '+4');
    const recs = teamRecords('football', 'A', ms);
    const big = recs.find((r) => r.key === 'biggestWin')!;
    assert.equal(big.value, '3–0');
    assert.match(big.detail!, /w\/o/);
    assert.equal(recs.find((r) => r.key === 'cleanSheets')!.value, '1');
  });

  test('team head-to-head meetings show the walkover score', () => {
    const h = teamHeadToHead('A', 'B', [wo(A, B, 'home', 1), played(B, A, 1, 1, 2)]);
    assert.deepEqual(h.meetings.map(meetingText), ['D 1–1', 'W 3–0 w/o']);
    assert.equal(meetingText(teamHeadToHead('A', 'B', [wo(A, B, 'home', 1, false)]).meetings[0]), 'W w/o');
  });
});

describe('SD-140 · never a player’s', () => {
  test('player head-to-head keeps no score for a walkover', () => {
    const m = wo(A, B, 'home', 1);
    const lines = [
      { id: 'l1', matchId: m.id, playerId: 'p1', sport: 'football', stats: {}, won: true, result: 'W', opponent: B.name },
      { id: 'l2', matchId: m.id, playerId: 'p2', sport: 'football', stats: {}, won: false, result: 'L', opponent: A.name },
    ] as unknown as StatLine[];
    const h = playerHeadToHead('football', 'p1', 'p2', lines, new Map([[m.id, m]]));
    assert.equal(h.meetings.length, 1);
    assert.equal(h.meetings[0].for, undefined);
    assert.equal(meetingText(h.meetings[0]), 'W w/o');
  });

  test('team leaders read only player lines — the walkover adds no goals to anyone', () => {
    const m1 = played(A, B, 2, 0, 1);
    const m2 = wo(A, C, 'home', 2);
    const lines = [{ id: 'l1', matchId: m1.id, playerId: 'p1', sport: 'football', stats: { goals: 2 }, won: true }] as unknown as StatLine[];
    const awards = { football: [{ icon: '⚽', label: 'Top scorer', stat: 'goals' }] };
    const s = computeTeamStats('A', [m1, m2], lines, { [m1.id]: ['p1'], [m2.id]: ['p1'] }, awards as never);
    assert.equal(s.scored, 5); // the team: 2 + 3
    assert.equal(s.leaders.find((l) => l.stat === 'goals')!.total, 2); // the player: 2 only
    assert.deepEqual(s.appearances, [{ playerId: 'p1', matches: 1 }]); // no appearance from the walkover
  });

  test('no player-stat module reads the forfeit score', () => {
    const root = new URL('../src/', import.meta.url);
    const files = ['data/career.ts', 'data/appearances.ts', 'data/leaderMinimums.ts', 'data/lineContext.ts', 'sports/statSchema.ts', 'sports/statSchemas.ts', 'sports/matchRecordHooks.ts'];
    for (const d of readdirSync(new URL('sports/', root))) {
      if (existsSync(new URL(`sports/${d}/stats.ts`, root))) files.push(`sports/${d}/stats.ts`);
    }
    for (const f of files) {
      const p = new URL(f, root);
      if (!existsSync(p)) continue;
      const src = readFileSync(p, 'utf8');
      assert.doesNotMatch(src, /\.forfeit\b|teamScoreOf/, `${f} must not read result.forfeit`);
    }
  });
});

describe('SD-140 · series aggregates read result.forfeit', () => {
  const leg = (id: string, legNo: number, homeA: boolean, o: Partial<Match>): Match => ({
    id, sport: 'football', status: 'completed', startsAt: `2026-12-0${legNo}T10:00:00Z`,
    homeTeam: homeA ? A : B, awayTeam: homeA ? B : A,
    format: seriesLegFormat({ id: 's1', format: 'aggregate', legs: 2, leg: legNo, teamAId: A.id }), ...o,
  }) as Match;
  test('a walkover leg counts its forfeit score in the aggregate', () => {
    // leg 1: B didn't turn up → A 3-0 (FIFA); leg 2: B wins 2-1 → A 4-2 on aggregate
    const l1 = leg('L1', 1, true, { winner: 'home', walkover: true, result: { kind: 'conceded', winner: 'home', reason: 'Walkover', at: '', forfeit: { score: { home: 3, away: 0 }, rule: 'FIFA 3-0 (walkover)' } } });
    const l2 = leg('L2', 2, false, { winner: 'home', score: { home: 2, away: 1 } });
    const s = deriveSeries([l1, l2])[0];
    const r = resolveSeries(s);
    assert.deepEqual([r.aggA, r.aggB], [4, 2]);
    assert.equal(r.winnerId, 'A');
    assert.deepEqual(aggregatePriorFor(l2, [l1, l2]), { home: 0, away: 3 });
  });
  test('an older walkover leg (no forfeit block) reads as before', () => {
    const l1 = leg('L1', 1, true, { winner: 'home', walkover: true });
    const l2 = leg('L2', 2, false, { winner: 'home', score: { home: 2, away: 1 } });
    const r = resolveSeries(deriveSeries([l1, l2])[0]);
    assert.deepEqual([r.aggA, r.aggB], [1, 2]);
    assert.equal(aggregatePriorFor(l2, [l1, l2]), null);
  });
});
