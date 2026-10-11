/**
 * SD-38 / SD-43 / SD-69 / SD-79 — cricket records leaders (4s / 6s / maidens /
 * dots / ducks), format / ball filter on leaders + awards, captain / keeper
 * flags (Captaincy, keeper dismissals, the keys-only backfill), and the career
 * rows BF / ducks / bowling innings / 4w / 5w. No reducer change: the flags are
 * read from the existing SET_CAPTAIN / SET_KEEPER state by statTotals.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { init, reducer, type CricketState } from '../src/sports/cricket/engine.ts';
import { statTotals } from '../src/sports/cricket/scorecard.ts';
import { cricketStats } from '../src/sports/cricket/stats.ts';
import { aggregateStat, coverageOf, statDefIn, validateSchema } from '../src/sports/statSchema.ts';
import { careerSections, captaincyRecord } from '../src/data/career.ts';
import { cricketCareer } from '../src/data/cricketCareer.ts';
import { leadersByKey } from '../src/data/standings.ts';
import { contextsFor, scopeBySplits } from '../src/data/lineContext.ts';
import { planStatSync, onlyKeys, changedKeys } from '../src/data/statSync.ts';
import type { Match, Player, StatLine } from '../src/core/types.ts';
import type { ScoreAction } from '../src/sports/types.ts';

function opened(): CricketState {
  let s = init({ overs: 5, playersPerSide: 11 });
  for (const a of [
    { type: 'SET_CAPTAIN', payload: { side: 'home', id: 's1', name: 'A' } },
    { type: 'SET_CAPTAIN', payload: { side: 'away', id: 'cA', name: 'Away capt' } },
    { type: 'SET_KEEPER', payload: { side: 'away', id: 'k1', name: 'Keeper' } },
    { type: 'SET_STRIKER', payload: { id: 's1', name: 'A' } },
    { type: 'SET_NONSTRIKER', payload: { id: 's2', name: 'B' } },
    { type: 'SET_BOWLER', payload: { id: 'b1', name: 'Bowler' } },
  ] as ScoreAction[]) s = reducer(s, a);
  return s;
}
const ball = (s: CricketState, type: string, payload: Record<string, unknown> = {}): CricketState =>
  reducer(s, { type, side: s.battingSide, payload: { strikerId: s.strikerId, strikerName: s.strikerName, bowlerId: s.bowlerId, bowlerName: s.bowlerName, ...payload } } as ScoreAction);

describe('SD-69 — captain / keeper flags in statTotals', () => {
  test('capt / wk / wkCatches from SET_CAPTAIN / SET_KEEPER; a fielder catch is not the keeper\'s', () => {
    let s = opened();
    s = ball(s, 'RUNS', { runs: 4, boundary: true });
    s = ball(s, 'WICKET', { kind: 'caught', fielderId: 'k1', fielderName: 'Keeper', newBatId: 'n1', newBatName: 'N1' }); // s1 c †Keeper
    s = ball(s, 'WICKET', { kind: 'caught', fielderId: 'f9', fielderName: 'Slip', newBatId: 'n2', newBatName: 'N2' });
    s = ball(s, 'EXTRA', { kind: 'Wide', wicket: 'stumped', newBatId: 'n3', newBatName: 'N3' });
    const t = statTotals(s);
    assert.equal(t.s1.stats.capt, 1);
    assert.equal(t.s1.side, 'home');
    assert.deepEqual(t.cA, { side: 'away', stats: { capt: 1, catches: 0, stumpings: 0, runouts: 0 } }); // did nothing else: still a line
    assert.equal(t.k1.stats.wk, 1);
    assert.equal(t.k1.stats.wkCatches, 1);
    assert.equal(t.k1.stats.catches, 1);
    assert.equal(t.k1.stats.stumpings, 1);
    assert.equal(t.f9.stats.catches, 1);
    assert.equal(t.f9.stats.wkCatches, undefined);
    assert.equal(t.s2.stats.capt, undefined);
  });

  test('a match with no captain / keeper set writes no flags (old matches unchanged)', () => {
    let s = init({ overs: 5, playersPerSide: 11 });
    for (const a of [
      { type: 'SET_STRIKER', payload: { id: 's1', name: 'A' } },
      { type: 'SET_NONSTRIKER', payload: { id: 's2', name: 'B' } },
      { type: 'SET_BOWLER', payload: { id: 'b1', name: 'Bowler' } },
    ] as ScoreAction[]) s = reducer(s, a);
    s = ball(s, 'RUNS', { runs: 1 });
    const keys = new Set(Object.values(statTotals(s)).flatMap((e) => Object.keys(e.stats)));
    for (const k of ['capt', 'wk', 'wkCatches']) assert.ok(!keys.has(k), k);
  });

  test('ducks: out for 0 is a duck (incl. a 0-ball run out); retired hurt on 0 is not', () => {
    let s = opened();
    s = ball(s, 'WICKET', { kind: 'bowled', newBatId: 'n1', newBatName: 'N1' }); // s1 b, 0 (1)
    s = ball(s, 'WICKET', { kind: 'retired', batterOut: 'striker', newBatId: 'n2', newBatName: 'N2' }); // n1 retired hurt 0
    const t = statTotals(s);
    const line = (id: string): StatLine => ({ id, matchId: 'm', playerId: id, sport: 'cricket', stats: t[id].stats, won: false });
    const v = (id: string) => aggregateStat(cricketStats, statDefIn(cricketStats, 'ducks')!, [line(id)]);
    assert.equal(v('s1'), '1');
    assert.equal(t.n1.stats.notOut, 1);
    assert.equal(v('n1'), '0');
  });
});

let seq = 0;
const L = (stats: Record<string, number>, extra: Partial<StatLine> = {}): StatLine =>
  ({ id: `l${++seq}`, matchId: `m${seq}`, playerId: 'p', sport: 'cricket', stats, won: false, ...extra });
const row = (secs: { id: string; rows: { key: string; value: string; coverage?: unknown }[] }[], sec: string, key: string) =>
  secs.find((s) => s.id === sec)?.rows.find((r) => r.key === key);

describe('SD-79 — BF, ducks, bowling innings, 4w / 5w in the career', () => {
  const full = [
    L({ runs: 0, ballsFaced: 3, innings: 1, notOut: 0, wickets: 4, ballsBowled: 24, runsConceded: 20 }),
    L({ runs: 0, ballsFaced: 0, innings: 1, notOut: 1, wickets: 5, ballsBowled: 24, runsConceded: 11 }), // not out 0: no duck
    L({ runs: 42, ballsFaced: 30, innings: 1, notOut: 0, wickets: 0, ballsBowled: 6, runsConceded: 9 }),
  ];
  test('from full scorecard lines', () => {
    const secs = careerSections(cricketStats, full);
    assert.equal(row(secs, 'batting', 'bf')?.value, '33');
    assert.equal(row(secs, 'batting', 'ducks')?.value, '1');
    assert.equal(row(secs, 'bowling', 'bowlInnings')?.value, '3');
    assert.equal(row(secs, 'bowling', 'fourW')?.value, '1');
    assert.equal(row(secs, 'bowling', 'fiveW')?.value, '1');
    assert.equal(row(secs, 'batting', 'bf')?.coverage, undefined);
  });
  test('pre-#19 lines only: the rows are not tracked (hidden, never 0)', () => {
    const old = [L({ runs: 12 }), L({ wickets: 2 })];
    const c = cricketCareer(old);
    for (const k of ['bf', 'ducks']) assert.equal(c.batting.find((r) => r.key === k), undefined, k);
    for (const k of ['bowlInnings', 'fourW', 'fiveW']) assert.equal(c.bowling.find((r) => r.key === k), undefined, k);
    assert.equal(c.batting.find((r) => r.key === 'runs')?.value, '12'); // the old rows are as before
  });
  test('mixed: a coverage note says over how many innings', () => {
    const secs = careerSections(cricketStats, [...full, L({ runs: 7 }), L({ wickets: 1 })]);
    assert.deepEqual(row(secs, 'batting', 'bf')?.coverage, { tracked: 3, total: 4 });
    assert.deepEqual(row(secs, 'batting', 'ducks')?.coverage, { tracked: 3, total: 4 });
    assert.deepEqual(row(secs, 'bowling', 'fourW')?.coverage, { tracked: 3, total: 4 });
    assert.equal(coverageOf(cricketStats, statDefIn(cricketStats, 'runs')!, full), undefined);
  });
  test('the schema validates (coverOf filters exist)', () => assert.deepEqual(validateSchema(cricketStats), []));
});

describe('SD-69 — Captaincy and keeper dismissals in the career', () => {
  test('captaincy record from capt lines: Mat, W-L(-T), win % over decided, NR apart', () => {
    const ls = [
      L({ runs: 10, capt: 1 }, { result: 'W' }), L({ capt: 1 }, { result: 'W' }), L({ capt: 1 }, { result: 'L' }),
      L({ capt: 1 }, { result: 'NR' }), L({ runs: 5 }, { result: 'L' }),
    ];
    const r = captaincyRecord(ls)!;
    assert.deepEqual([r.matches, r.wins, r.losses, r.ties, r.noResults, r.record, r.winPct], [4, 2, 1, 0, 1, '2-1', '67%']);
    assert.equal(captaincyRecord([...ls, L({ capt: 1 }, { result: 'T' })])!.record, '2-1-1');
    assert.equal(captaincyRecord([L({ runs: 3 })]), null);
    // legacy `won` flag only
    assert.equal(captaincyRecord([L({ capt: 1 }, { won: true })])!.wins, 1);
  });
  test('keeper rows only for a player who kept (re-synced lines)', () => {
    const kept = [L({ wk: 1, wkCatches: 2, catches: 2, stumpings: 1 }), L({ wk: 1, wkCatches: 1, catches: 1, stumpings: 0 }), L({ catches: 1, stumpings: 0 })];
    const secs = careerSections(cricketStats, kept);
    assert.equal(row(secs, 'fielding', 'wkCatches')?.value, '3');
    assert.equal(row(secs, 'fielding', 'wkDismissals')?.value, '4');
    assert.equal(row(secs, 'fielding', 'catches')?.value, '4');
    const fielder = careerSections(cricketStats, [L({ catches: 3, stumpings: 0, runouts: 1 })]);
    assert.equal(row(fielder, 'fielding', 'wkCatches'), undefined);
    assert.equal(row(fielder, 'fielding', 'wkDismissals'), undefined);
  });
});

describe('SD-38 — records leaders: 4s / 6s / maidens / dots / ducks / keeper dismissals', () => {
  const players = ['a', 'b', 'c'].map((id) => ({ id, fullName: id.toUpperCase() })) as Player[];
  const P = (playerId: string, stats: Record<string, number>) => L(stats, { playerId });
  const lines = [
    P('a', { runs: 40, fours: 5, sixes: 1, innings: 1, notOut: 0, ballsFaced: 30 }),
    P('b', { runs: 60, fours: 5, sixes: 3, innings: 1, notOut: 0, ballsFaced: 40, maidens: 2, dots: 12, ballsBowled: 24, wickets: 1 }),
    P('c', { runs: 0, innings: 1, notOut: 0, ballsFaced: 1, maidens: 2, dots: 12, ballsBowled: 18, wickets: 2, wk: 1, wkCatches: 2, stumpings: 1 }),
    P('a', { runs: 0, innings: 1, notOut: 0, ballsFaced: 2 }),
    P('b', { runs: 0, innings: 1, notOut: 1, ballsFaced: 0 }),
  ];
  const lead = (key: string) => leadersByKey(lines, players, 'cricket', key).map((l) => `${l.name} ${l.display ?? l.value}`);
  test('ranked with tie-breaks', () => {
    assert.deepEqual(lead('fours'), ['B 5', 'A 5']); // more runs first
    assert.deepEqual(lead('sixes'), ['B 3', 'A 1']);
    assert.deepEqual(lead('maidens'), ['C 2', 'B 2']); // more wickets
    assert.deepEqual(lead('dots'), ['C 12', 'B 12']); // fewer balls
    assert.deepEqual(lead('ducks'), ['C 1', 'A 1']); // fewer innings
    assert.deepEqual(lead('wkDismissals'), ['C 3']);
  });
});

describe('SD-43 — leaders / awards scoped by format and ball', () => {
  const M = (id: string, format: Record<string, unknown>): Match => ({
    id, sport: 'cricket', status: 'completed', homeTeam: { id: 'h', name: 'H' }, awayTeam: { id: 'w', name: 'W' }, format,
  } as unknown as Match);
  const matches = [M('t20a', { overs: 20, ballType: 'leather' }), M('t20b', { overs: 20, ballType: 'tennis' }), M('box', { overs: 6, playersPerSide: 6, ballType: 'tennis' })];
  const lines: StatLine[] = [
    { id: 'x1', matchId: 't20a', playerId: 'a', sport: 'cricket', stats: { runs: 50 }, won: false },
    { id: 'x2', matchId: 't20b', playerId: 'b', sport: 'cricket', stats: { runs: 30 }, won: false },
    { id: 'x3', matchId: 'box', playerId: 'b', sport: 'cricket', stats: { runs: 90 }, won: false },
    { id: 'x4', matchId: 'f1', playerId: 'z', sport: 'football', stats: { goals: 2 }, won: false },
  ];
  const ctx = contextsFor(lines, new Map(matches.map((m) => [m.id, m])), new Map());
  test('chips on offer: format + ball', () => {
    const sc = scopeBySplits(lines, ctx, 'cricket', cricketStats.leaderSplits!, {});
    assert.deepEqual(sc.options.map((o) => [o.dim, o.values.map((v) => v.key)]), [['format', ['t20', 'box']], ['ball', ['tennis', 'leather']]]);
    assert.equal(sc.lines, lines); // no selection → the same array
    assert.equal(sc.label, '');
  });
  test('a selection keeps that format\'s lines; other sports pass through', () => {
    const sc = scopeBySplits(lines, ctx, 'cricket', ['format', 'ball'], { format: 't20' });
    assert.deepEqual(sc.lines.map((l) => l.id), ['x1', 'x2', 'x4']);
    assert.equal(sc.label, 'T20');
    const both = scopeBySplits(lines, ctx, 'cricket', ['format', 'ball'], { format: 't20', ball: 'tennis' });
    assert.deepEqual(both.lines.map((l) => l.id), ['x2', 'x4']);
    assert.equal(both.label, 'T20 · Tennis ball');
    // a value no longer on offer is ignored
    assert.equal(scopeBySplits(lines, ctx, 'cricket', ['format'], { format: 'odi' }).lines, lines);
    // box runs leave the T20 runs leaderboard
    const top = leadersByKey(sc.lines, [], 'cricket', 'runs').map((l) => [l.playerId, l.value]);
    assert.deepEqual(top, [['a', 50], ['b', 30]]);
  });
});

describe('SD-69 — the keys-only backfill (resyncSportLines … { keys })', () => {
  test('writes only capt / wk / wkCatches; every other figure stays as stored', () => {
    const existing = [
      { id: 'L1', playerId: 'k1', stats: { runs: 7, catches: 1, stumpings: 1 } },
      { id: 'L2', playerId: 's1', stats: { runs: 4, catches: 0 } },
    ];
    const totals = {
      k1: { side: 'away' as const, stats: { runs: 9, catches: 1, stumpings: 1, wk: 1, wkCatches: 1 } },
      s1: { side: 'home' as const, stats: { runs: 4, capt: 1 } },
      cA: { side: 'away' as const, stats: { capt: 1, catches: 0 } },
    };
    const writes = planStatSync(existing, onlyKeys(totals, ['capt', 'wk', 'wkCatches']), (x) => x);
    assert.deepEqual(writes, [
      { kind: 'update', id: 'L1', playerId: 'k1', stats: { runs: 7, catches: 1, stumpings: 1, wk: 1, wkCatches: 1 } },
      { kind: 'update', id: 'L2', playerId: 's1', stats: { runs: 4, catches: 0, capt: 1 } },
      { kind: 'insert', playerId: 'cA', stats: { capt: 1 }, opponent: undefined },
    ]);
    assert.deepEqual(changedKeys(existing, writes), ['capt', 'wk', 'wkCatches']);
    // run twice → nothing more to write
    const after = existing.map((l) => ({ ...l, stats: (writes.find((w) => w.kind === 'update' && w.id === l.id)?.stats ?? l.stats) }));
    after.push({ id: 'L3', playerId: 'cA', stats: { capt: 1 } });
    assert.deepEqual(planStatSync(after, onlyKeys(totals, ['capt', 'wk', 'wkCatches']), (x) => x), []);
  });
});
