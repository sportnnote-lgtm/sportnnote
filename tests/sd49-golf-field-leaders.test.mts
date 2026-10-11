/**
 * SD-49 (GEN-18 / GF-08) — golf's field results in the tournament.
 *   - The tournament loader keeps field-event lines (no match) of its own
 *     events and drops other tournaments' rounds.
 *   - Golf leaders: low round (18 and 9 holes apart, "68 (−4)"), scoring
 *     average with a 2-round minimum, birdies, eagles, fewest putts per round
 *     (only putt-tracked holes; older lines are "not tracked", never 0),
 *     GIR % with a minimum; stroke play drops "Holes won".
 *   - Award slots: Low round and Best scoring average fed by field lines; the
 *     awards tab's `eventIds` lets them through a match-id restriction.
 *   - Medal table: final positions → medals / position points per team (entry
 *     team, else house), only when every round is finished; ties share; MC /
 *     WD score nothing; a pending playoff holds the table.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { standardPar72, roundStats, type GolfCard } from '../src/sports/golf/engine.ts';
import { categoryLeaders, STAT_CATEGORIES } from '../src/data/standings.ts';
import { rankAwardCandidates, defaultAwards, TOURNAMENT_AWARD_SLOTS, awardFormula, SPORT_AWARDS } from '../src/data/ratings.ts';
import { medalStandings } from '../src/data/medalStandings.ts';
import {
  scopeTournamentLines, golfLeaderCategories, golfFieldResults, golfPositionPoints, isGolfMatchPlay,
} from '../src/data/golfLeaders.ts';
import type { FieldEntry, FieldEvent, GolfCourse, Player, StatLine } from '../src/core/types.ts';

const H = standardPar72();
const H9 = H.slice(0, 9);
const zeros = H.map(() => 0);
const course: GolfCourse = { id: 'c1', name: 'Hillside Club', holes: H, tees: [{ name: 'White' }] };
/** a card `over` strokes over par on the first holes (negative = under) */
const card = (over: number, holes = H, putts?: number): GolfCard => ({
  strokes: holes.map((h, i) => h.par + (over > 0 && i < over ? 1 : over < 0 && i < -over ? -1 : 0)),
  ...(putts != null ? { putts: holes.map(() => putts) } : {}),
});
const P = (id: string, fullName: string, houseName?: string): Player => ({ id, fullName, ...(houseName ? { houseName } : {}) } as Player);
const players = [P('a', 'Asha Verma', 'Red House'), P('b', 'Bilal Khan', 'Blue House'), P('c', 'Chitra Rao', 'Red House'), P('d', 'Dev Malhotra')];
let n = 0;
const line = (pid: string, eventId: string, stats: Record<string, number>): StatLine =>
  ({ id: `sl${++n}`, matchId: '', eventId, playerId: pid, sport: 'golf', stats, won: false });
const round = (pid: string, eventId: string, c: GolfCard, holes = H) => line(pid, eventId, roundStats(c, holes, holes.map(() => 0)));

describe('SD-49 — the tournament loader keeps its own field-event lines', () => {
  test('match lines by match, field lines by event; other tournaments and casual rounds stay out', () => {
    const ls: StatLine[] = [
      { id: 'm1', matchId: 'match-1', playerId: 'a', sport: 'football', stats: { goals: 1 }, won: true },
      { id: 'm2', matchId: 'match-x', playerId: 'a', sport: 'football', stats: { goals: 2 }, won: true },
      line('a', 'r1', { rounds: 1, birdies: 2 }),
      line('a', 'other-tour-r1', { rounds: 1, birdies: 9 }),
    ];
    const got = scopeTournamentLines(ls, new Set(['match-1']), new Set(['r1']));
    assert.deepEqual(got.map((l) => l.id), ['m1', ls[2].id]);
    // before SD-49 the field line was always dropped (matchId '')
    assert.deepEqual(scopeTournamentLines(ls, new Set(['match-1']), new Set()).map((l) => l.id), ['m1']);
  });
});

describe('SD-49 — golf leader categories from field lines', () => {
  const lines = [
    round('a', 'r1', card(-4, H, 2)), // 68, 36 putts
    round('a', 'r2', card(1, H, 2)), // 73
    round('b', 'r1', card(-4, H)), // 68, no putts entered
    round('b', 'r2', card(3, H)), // 75
    round('c', 'r1', card(-6, H, 1)), // 66 but one round only
    round('d', 'r9', card(-1, H9), H9), // a 9-hole 35
  ];
  const cats = categoryLeaders(lines, players, 'golf');
  const byKey = new Map(cats.map((c) => [c.key, c] as const));

  test('low round: lowest complete 18, shown with its score to par; 9-hole rounds apart', () => {
    const low = byKey.get('lowRound')!;
    assert.deepEqual(low.leaders.map((l) => [l.name, l.value, l.display]),
      [['Chitra Rao', 66, '66 (−6)'], ['Asha Verma', 68, '68 (−4)'], ['Bilal Khan', 68, '68 (−4)']]);
    assert.deepEqual(byKey.get('lowRound9')!.leaders.map((l) => [l.name, l.display]), [['Dev Malhotra', '35 (−1)']]);
  });

  test('scoring average: 18-hole equivalent, lowest first, needs 2 rounds', () => {
    const avg = byKey.get('scoringAvg')!;
    assert.equal(avg.qualifier, 'min 2 rounds');
    assert.deepEqual(avg.leaders.map((l) => [l.name, l.display]), [['Asha Verma', '70.5'], ['Bilal Khan', '71.5']]);
  });

  test('putts per round counts only putt-tracked holes (an untracked round is no 0); GIR % has a minimum', () => {
    const putts = byKey.get('puttsPerRound')!;
    assert.equal(putts.label, 'Fewest putts per round');
    assert.equal(putts.qualifier, 'min 18 holes putted');
    assert.deepEqual(putts.leaders.map((l) => [l.name, l.display]), [['Chitra Rao', '18.0'], ['Asha Verma', '36.0']]);
    // a line from before puttHoles existed (putts but no puttHoles) is not tracked
    const legacy = [line('b', 'old', { rounds: 1, holes: 18, strokes: 72, putts: 30 })];
    assert.equal(categoryLeaders(legacy, players, 'golf').some((c) => c.key === 'puttsPerRound'), false);
    // GIR: putts entered → GIR derived only on stats-row cards; set it explicitly here
    const gir = [line('a', 'g1', { rounds: 1, girHit: 12, girHoles: 18 }), line('b', 'g1', { rounds: 1, girHit: 9, girHoles: 9 })];
    const g = categoryLeaders(gir, players, 'golf').find((c) => c.key === 'girPct')!;
    assert.equal(g.qualifier, 'min 18 greens tracked');
    assert.deepEqual(g.leaders.map((l) => [l.name, l.display]), [['Asha Verma', '67%']], 'Bilal tracked only 9 greens');
  });

  test('birdies and eagles rank as totals; stroke play drops holes won and leads with low round', () => {
    const withMatch = [...lines, { id: 'mp', matchId: 'mp1', playerId: 'b', sport: 'golf', stats: { holesWon: 5 }, won: true } as StatLine];
    const all = categoryLeaders(withMatch, players, 'golf');
    assert.ok(all.some((c) => c.key === 'holesWon'));
    const stroke = golfLeaderCategories(all, { competition: 'stroke' });
    assert.deepEqual(stroke.map((c) => c.key), ['lowRound', 'lowRound9', 'scoringAvg', 'birdies', 'puttsPerRound']);
    assert.deepEqual(golfLeaderCategories(all, { competition: 'match' }).map((c) => c.key), all.map((c) => c.key));
    assert.deepEqual(golfLeaderCategories(all, undefined).some((c) => c.key === 'holesWon'), false, 'no format = stroke play');
    assert.equal(isGolfMatchPlay({ competition: 'match' }), true);
    assert.deepEqual(byKey.get('birdies')!.leaders.map((l) => [l.name, l.value]),
      [['Chitra Rao', 6], ['Asha Verma', 4], ['Bilal Khan', 4], ['Dev Malhotra', 1]]);
    const eagles = categoryLeaders([round('a', 'r1', { strokes: H.map((h, i) => (i === 0 ? h.par - 2 : h.par)) })], players, 'golf');
    assert.deepEqual(eagles.find((c) => c.key === 'eagles')!.leaders.map((l) => [l.name, l.value]), [['Asha Verma', 1]]);
  });

  test('the headline leader stays birdies (match play with strokes has them too)', () => {
    assert.equal(STAT_CATEGORIES.golf[0].key, 'birdies');
  });
});

describe('SD-49 — golf award slots fed by field lines', () => {
  const lines = [
    round('a', 'r1', card(-4)), round('a', 'r2', card(1)),
    round('b', 'r1', card(-2)), round('b', 'r2', card(0)),
    round('c', 'r1', card(-6)),
  ];
  test('slots: Player of the Tournament, Most birdies, Low round, Best scoring average (tournament only)', () => {
    assert.deepEqual(TOURNAMENT_AWARD_SLOTS.golf.map((s) => s.slot), ['mvp', 'birdies', 'lowRound', 'scoringAvg']);
    assert.deepEqual(SPORT_AWARDS.golf.map((a) => a.stat), ['birdies'], 'no per-match "average" award');
  });
  test('Low round and Best scoring average rank the field lines; details say rounds', () => {
    const low = rankAwardCandidates(lines, players, 'golf', 'lowRound');
    assert.deepEqual(low.map((c) => [c.name, c.value, c.display]), [['Chitra Rao', 66, '66 (−6)'], ['Asha Verma', 68, '68 (−4)'], ['Bilal Khan', 70, '70 (−2)']]);
    assert.match(low[0].detail, /1 round$/);
    const avg = rankAwardCandidates(lines, players, 'golf', 'scoringAvg');
    assert.deepEqual(avg.map((c) => [c.name, c.display]), [['Bilal Khan', '71.0'], ['Asha Verma', '70.5']].sort((x, y) => Number(x[1]) - Number(y[1])));
    assert.equal(avg.some((c) => c.name === 'Chitra Rao'), false, 'one round is below the minimum');
    assert.match(awardFormula('golf', 'scoringAvg'), /at least 2 rounds/);
    assert.match(awardFormula('golf', 'lowRound'), /complete 18-hole round/);
  });
  test('the awards tab restricts by match ids — field lines pass with their event ids', () => {
    const opts = { matchIds: ['some-match'] };
    assert.deepEqual(defaultAwards(lines, players, 'golf', opts), [], 'before: field lines filtered out');
    const got = defaultAwards(lines, players, 'golf', { ...opts, eventIds: ['r1', 'r2'] });
    // Player of the Tournament: summed weights (6 birdies × 3 beats 5 × 3)
    assert.deepEqual(got.map((a) => [a.slot, a.playerName]),
      [['mvp', 'Chitra Rao'], ['birdies', 'Chitra Rao'], ['lowRound', 'Chitra Rao'], ['scoringAvg', 'Asha Verma']]);
    assert.deepEqual(defaultAwards(lines, players, 'golf', { ...opts, eventIds: ['r2'] }).find((a) => a.slot === 'lowRound')?.playerName, 'Bilal Khan');
  });
});

describe('SD-49 — final golf positions feed the medal table', () => {
  const ev = (k: number, status: FieldEvent['status'] = 'completed', format: Record<string, unknown> = {}): FieldEvent => ({
    id: `r${k}`, tournamentId: 't1', sport: 'golf', title: `Round ${k}`, roundNo: k, startsAt: `2026-10-0${k}T08:00:00Z`, status,
    format: { competition: 'stroke', holes: '18', courseId: 'c1', ...format },
  });
  const en = (pid: string, k: number, c: GolfCard, extra: Partial<FieldEntry> = {}): FieldEntry =>
    ({ id: `${pid}-${k}`, eventId: `r${k}`, playerId: pid, groupNo: 1, result: c, status: 'finished', ...extra });
  const byId = new Map(players.map((p) => [p.id, p] as const));
  const teams = new Map([['t-green', { id: 't-green', name: 'Green House', colorHex: '#0a0' }]]);
  const opts = {
    teamOf: (e: FieldEntry) => {
      const t = e.teamId ? teams.get(e.teamId) : undefined;
      if (t) return t;
      const p = byId.get(e.playerId);
      return p?.houseName ? { name: p.houseName } : undefined;
    },
    nameOf: (pid: string) => byId.get(pid)?.fullName ?? 'Player',
  };
  const entries = [
    en('a', 1, card(-2)), en('b', 1, card(0)), en('c', 1, card(2)), en('d', 1, card(4), { teamId: 't-green' }),
  ];

  test('medals + points to the entry team, else the house; nothing while a round is live', () => {
    assert.deepEqual(golfFieldResults([ev(1, 'live')], entries, [course], opts), []);
    const res = golfFieldResults([ev(1)], entries, [course], opts);
    assert.equal(res.length, 1);
    assert.equal(res[0].event, 'Golf — stroke play');
    assert.deepEqual(res[0].awards.map((a) => [a.name, a.team?.name, a.position, a.medal, a.points]), [
      ['Asha Verma', 'Red House', 1, 'gold', 8], ['Bilal Khan', 'Blue House', 2, 'silver', 7],
      ['Chitra Rao', 'Red House', 3, 'bronze', 6], ['Dev Malhotra', 'Green House', 4, undefined, 5],
    ]);
    const table = medalStandings([], ['golf'], { mode: 'position' }, undefined, res);
    assert.deepEqual(table.map((r) => [r.name, r.total, r.golds, r.silvers, r.bronzes]),
      [['Red House', 14, 1, 0, 1], ['Blue House', 7, 0, 1, 0], ['Green House', 5, 0, 0, 0]]);
  });

  test('ties share the points; the organiser’s points table; MC and WD score nothing', () => {
    const tied = [en('a', 1, card(0)), en('b', 1, card(0)), en('c', 1, card(3)), en('d', 1, card(5)),
      en('a', 2, card(0)), en('b', 2, card(0))]; // c and d missed the cut
    const res = golfFieldResults([ev(1), ev(2, 'completed', { tieBreak: 'shared' })], tied, [course], { ...opts, positionPoints: [10, 6, 3] });
    assert.deepEqual(res[0].awards.map((a) => [a.name, a.position, a.medal, a.points]), [['Asha Verma', 1, 'gold', 8], ['Bilal Khan', 1, 'gold', 8]]);
    const wd = [en('a', 1, card(0)), en('b', 1, card(1), { status: 'wd' })];
    assert.deepEqual(golfFieldResults([ev(1)], wd, [course], opts)[0].awards.map((a) => a.name), ['Asha Verma']);
  });

  test('a playoff still to be played holds the table; nobody on a team = no event', () => {
    const tie = [en('a', 1, card(0)), en('b', 1, card(0))];
    assert.deepEqual(golfFieldResults([ev(1, 'completed', { tieBreak: 'playoff' })], tie, [course], opts), []);
    const decided = golfFieldResults([ev(1, 'completed', { tieBreak: 'playoff', playoffWinner: 'b' })], tie, [course], opts);
    assert.deepEqual(decided[0].awards.map((a) => [a.name, a.position]), [['Bilal Khan', 1], ['Asha Verma', 2]]);
    assert.deepEqual(golfFieldResults([ev(1)], [en('d', 1, card(0))], [course], opts), []);
  });

  test('points table: the golf format’s own, else the meet’s, else 8-7-6-5-4-3-2-1', () => {
    assert.deepEqual(golfPositionPoints({ positionPoints: [5, 3, 1] }), [5, 3, 1]);
    assert.deepEqual(golfPositionPoints({}, { mode: 'position', positionPoints: [10, 8, 6] }), [10, 8, 6]);
    assert.deepEqual(golfPositionPoints({}, { mode: 'match', positionPoints: [10, 8, 6] }), [8, 7, 6, 5, 4, 3, 2, 1]);
    assert.deepEqual(golfPositionPoints({ positionPoints: ['x'] }), [8, 7, 6, 5, 4, 3, 2, 1]);
  });

  test('old fixtures: a meet without golf results is unchanged', () => {
    assert.deepEqual(medalStandings([], ['golf'], { mode: 'position' }, undefined, []), []);
    void zeros;
  });
});
