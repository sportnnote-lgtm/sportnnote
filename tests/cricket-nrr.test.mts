/**
 * SD-13 — cricket Net Run Rate completeness (ICC playing conditions):
 *  (a) a chase to a revised target (DLS or set by hand): the side batting first
 *      is credited with target − 1 off the overs the chasing side was allotted;
 *  (b) a side all out — or with no batter left to come in (retired hurt, not
 *      resumed) — is charged its full quota;
 *  (c) the side batting first keeps its own quota when a later change only hit
 *      the chase.
 * (a) and (c) are gated on `dlsV` (REVIEW Decision 8): legacy matches compute
 * exactly as before; (b) is the one bug fix that also reaches legacy matches.
 */
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { init, reducer, nrrOvers, nrrRuns, noBatterLeft, type CricketState } from '../src/sports/cricket/engine.ts';
import { teamStandings, setStandingsRateProvider, setStandingsScoreProvider } from '../src/data/standings.ts';
import type { Match } from '../src/core/types.ts';
import type { ScoreAction } from '../src/sports/types.ts';

const inn = (runs: number, wickets: number, balls: number) => ({ runs, wickets, balls, extras: 0 });
const seed = (s: CricketState, runs: number, wickets: number, balls: number): CricketState =>
  ({ ...s, scores: { ...s.scores, [s.battingSide]: inn(runs, wickets, balls) }, ballsInOver: balls % s.ballsPerOver === 0 && balls > 0 ? s.ballsPerOver : balls % s.ballsPerOver });
const go = (s: CricketState, ...as: ScoreAction[]) => as.reduce(reducer, s);
const END_INN: ScoreAction = { type: 'END_INNINGS' };
const END: ScoreAction = { type: 'END' };
const rain = (overs: number, v2 = true): ScoreAction => ({ type: 'RAIN', payload: v2 ? { overs, v: 2 } : { overs } });
const setOvers = (overs: number): ScoreAction => ({ type: 'SET_OVERS', payload: { overs, v: 2 } });
const setTarget = (runs: number, overs: number): ScoreAction => ({ type: 'SET_TARGET', payload: { runs, overs, v: 2 } });
const T20 = { overs: 20, dls: true };
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

/** Home (Team 1) bats first: `runs`/`wkts` in `balls`, then the chase starts. */
const firstInnings = (cfg: Record<string, unknown>, runs: number, wkts: number, balls: number): CricketState =>
  reducer(seed(init(cfg), runs, wkts, balls), END_INN);

describe('(b) all out / no batter left → full quota', () => {
  test('legacy all out: both sides as before (quota for the all-out side, actual overs otherwise)', () => {
    let s = firstInnings(T20, 150, 10, 100);
    s = go(seed(s, 151, 3, 110), END);
    assert.equal(s.dlsV, undefined);
    const o = nrrOvers(s);
    assert.equal(o.home, 20);
    near(o.away, 110 / 6);
    assert.equal(nrrRuns(s), null);
  });

  test('9 down + a retired-hurt batter who never resumed = no batter left → full quota (legacy too — the fix)', () => {
    let s = init(T20);
    s = seed(s, 98, 9, 90);
    s = { ...s, batting: { r1: { name: 'Hurt', side: 'home', runs: 12, balls: 10, fours: 1, sixes: 0, out: false, retired: true, dismissal: 'retired hurt' } } };
    assert.equal(noBatterLeft(s, 'home'), true);
    s = go(s, END_INN);
    s = go(seed(s, 99, 2, 80), END);
    const o = nrrOvers(s);
    assert.equal(o.home, 20); // was 15 (90 balls) before SD-13
    near(o.away, 80 / 6);
  });

  test('a retired batter who resumed is no longer counted', () => {
    let s = seed(init(T20), 98, 9, 90);
    s = { ...s, batting: { r1: { name: 'Back', side: 'home', runs: 12, balls: 10, fours: 1, sixes: 0, out: false, retired: false } } };
    assert.equal(noBatterLeft(s, 'home'), false);
    s = go(s, END_INN);
    s = go(seed(s, 99, 2, 80), END);
    assert.equal(nrrOvers(s).home, 15);
  });

  test('8 down + 1 retired hurt with 11 a side still has a batter to come in', () => {
    let s = seed(init(T20), 98, 8, 90);
    s = { ...s, batting: { r1: { name: 'Hurt', side: 'home', runs: 12, balls: 10, fours: 1, sixes: 0, out: false, retired: true } } };
    assert.equal(noBatterLeft(s, 'home'), false);
  });

  test('a retired-hurt batter of the OTHER side does not count', () => {
    let s = seed(init(T20), 98, 9, 90);
    s = { ...s, batting: { r1: { name: 'Hurt', side: 'away', runs: 12, balls: 10, fours: 1, sixes: 0, out: false, retired: true } } };
    assert.equal(noBatterLeft(s, 'home'), false);
  });
});

describe('(c) Team 1 keeps its original quota (v2)', () => {
  test('all out in 15 of 20, chase changed to 15 by agreement → Team 1 charged 20', () => {
    let s = firstInnings(T20, 100, 10, 90);
    s = go(s, setOvers(15));
    assert.equal(s.dlsV, 2);
    assert.equal(s.oversLimit, 15);
    assert.equal(s.revision, undefined); // no revised target — the target stands
    s = go(seed(s, 101, 4, 70), END);
    const o = nrrOvers(s);
    assert.equal(o.home, 20);
    near(o.away, 70 / 6);
    assert.equal(nrrRuns(s), null);
  });

  test('legacy state with the same shape (no dlsV) keeps the old charge (the final length)', () => {
    let s = firstInnings(T20, 100, 10, 90);
    s = { ...s, oversLimit: 15 }; // an old match whose length moved before the chase
    s = go(seed(s, 101, 4, 70), END);
    assert.equal(nrrOvers(s).home, 15);
  });

  test('Team 2 all out is charged the chase allotment', () => {
    let s = firstInnings(T20, 160, 6, 120);
    s = go(s, setOvers(15));
    s = go(seed(s, 90, 10, 80), END);
    assert.equal(nrrOvers(s).away, 15);
    assert.equal(nrrOvers(s).home, 20);
  });
});

describe('(a) revised target: Team 1 = target − 1 off Team 2’s allotted overs (v2)', () => {
  test('DLS before the chase: 160 in 20, RAIN 10 → target 91; Team 1 credited 90 off 10', () => {
    let s = firstInnings(T20, 160, 6, 120);
    s = go(s, rain(10));
    assert.equal(s.target, 91);
    s = go(seed(s, 92, 3, 50), END);
    assert.deepEqual(nrrRuns(s), { home: 90, away: 92 });
    const o = nrrOvers(s);
    assert.equal(o.home, 10);
    near(o.away, 50 / 6);
  });

  test('Team 1 all out still takes target − 1 off the chase allotment (not its own quota)', () => {
    let s = firstInnings(T20, 140, 10, 100);
    s = go(s, rain(12));
    s = go(seed(s, 60, 10, 70), END); // chase bowled out
    const runs = nrrRuns(s)!;
    assert.equal(runs.home, s.target! - 1);
    assert.equal(runs.away, 60);
    assert.deepEqual(nrrOvers(s), { home: 12, away: 12 });
  });

  test('a target set by hand counts as revised too', () => {
    let s = firstInnings(T20, 150, 5, 120);
    s = go(seed(s, 20, 1, 30), setTarget(110, 14));
    assert.equal(s.revision, 'manual');
    s = go(seed(s, 111, 4, 76), END);
    assert.deepEqual(nrrRuns(s), { home: 109, away: 111 });
    assert.equal(nrrOvers(s).home, 14);
  });

  test('away bats first: the credit lands on the away side', () => {
    let s = init(T20);
    s = { ...s, battingSide: 'away' };
    s = reducer(seed(s, 160, 6, 120), END_INN);
    s = go(s, rain(10));
    s = go(seed(s, 70, 5, 60), END);
    assert.deepEqual(nrrRuns(s), { home: 70, away: s.target! - 1 });
    assert.equal(nrrOvers(s).away, 10);
  });

  test('legacy DLS (RAIN without v) keeps the old maths: no credit, actual overs', () => {
    let s = firstInnings(T20, 160, 6, 120);
    s = go(s, rain(10, false));
    assert.equal(s.dlsV, undefined);
    assert.equal(s.revision, 'dls');
    s = go(seed(s, 70, 5, 60), END);
    assert.equal(nrrRuns(s), null);
    assert.deepEqual(nrrOvers(s), { home: 20, away: 10 });
  });
});

describe('the table reads the credited runs (standings hook)', () => {
  afterEach(() => { setStandingsRateProvider(null); setStandingsScoreProvider(null); });
  const match = (id: string, s: CricketState): Match => ({
    id, sport: 'cricket', status: 'completed', startsAt: '', state: s,
    score: { home: s.scores.home.runs, away: s.scores.away.runs }, winner: s.scores.away.runs > (s.target ?? 0) - 1 ? 'away' : 'home',
    homeTeam: { id: 'h', name: 'Home', shortName: 'H', sport: 'cricket' }, awayTeam: { id: 'a', name: 'Away', shortName: 'A', sport: 'cricket' },
  }) as unknown as Match;

  test('DLS chase: for/against and NRR use 90 off 10 for the side batting first', () => {
    setStandingsRateProvider((_sp, st) => nrrOvers(st as CricketState));
    setStandingsScoreProvider((_sp, st) => nrrRuns(st as CricketState));
    let s = firstInnings(T20, 160, 6, 120);
    s = go(s, rain(10));
    s = go(seed(s, 92, 3, 60), END);
    const rows = teamStandings([match('m1', s)], 'cricket');
    const home = rows.find((r) => r.teamId === 'h')!;
    const away = rows.find((r) => r.teamId === 'a')!;
    assert.deepEqual([home.for, home.against, away.for, away.against], [90, 92, 92, 90]);
    near(home.nrr!, 90 / 10 - 92 / 10);
    near(away.nrr!, 92 / 10 - 90 / 10);
  });

  test('legacy match: the table is unchanged (score + old overs)', () => {
    setStandingsRateProvider((_sp, st) => nrrOvers(st as CricketState));
    setStandingsScoreProvider((_sp, st) => nrrRuns(st as CricketState));
    let s = firstInnings(T20, 160, 6, 120);
    s = go(seed(s, 140, 4, 120), END);
    const home = teamStandings([match('m2', s)], 'cricket').find((r) => r.teamId === 'h')!;
    assert.deepEqual([home.for, home.against], [160, 140]);
    near(home.nrr!, 160 / 20 - 140 / 20);
  });

  test('a hand-ended match keeps its own score (the hook is not used)', () => {
    setStandingsScoreProvider(() => ({ home: 1, away: 1 }));
    const m = { ...match('m3', firstInnings(T20, 160, 6, 120)), result: { kind: 'awarded', winner: 'home', reason: 'x', at: '', score: { home: 50, away: 40 } } } as unknown as Match;
    const home = teamStandings([m], 'cricket').find((r) => r.teamId === 'h')!;
    assert.deepEqual([home.for, home.against], [50, 40]);
  });
});
