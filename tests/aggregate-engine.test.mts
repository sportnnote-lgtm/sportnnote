/**
 * SD-16 (GEN-03) — the aggregate engine over the stat schema: every agg kind
 * (sum / max / min / best / rate / perGame / perSet / countIf), D8 coverage
 * (an untracked stat is "not tracked", never 0), qualifiers, the leaderboard
 * tie-break chain, and cricket's records leaders as the proof.
 * The SD-15 golden (tests/stat-schema.test.mts) stays green alongside.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Player, SportId, StatLine } from '../src/core/types.ts';
import {
  aggregateValue, aggregateStat, rankPlayers, qualifierText, qualifierOf, statDefIn, validateSchema,
  type SportStatSchema, type StatDef,
} from '../src/sports/statSchema.ts';
import { STAT_SCHEMAS } from '../src/sports/statSchemas.ts';
import { cricketStats, QUALIFIERS } from '../src/sports/cricket/stats.ts';
import { categoryLeaders, leadersByKey } from '../src/data/standings.ts';

let seq = 0;
const L = (playerId: string, stats: Record<string, number>, extra: Partial<StatLine> = {}): StatLine => {
  seq += 1;
  return { id: `l${seq}`, matchId: `m${seq}`, playerId, sport: 'cricket', stats, won: false, ...extra };
};

/** A small test schema exercising every kind. */
const T: SportStatSchema<'test'> = {
  sport: 'test',
  filters: { scored: (l) => (l.stats?.goals ?? 0) > 0 },
  stats: [
    { key: 'goals', label: 'Goals' },
    { key: 'shots', label: 'Shots' },
    { key: 'onTarget', label: 'On target', coverage: 'optional', mode: 'detail' },
    { key: 'time', label: 'Time', format: { unit: 'time', dp: 2 } },
    { key: 'setsWon', label: 'Sets won' },
    { key: 'setsLost', label: 'Sets lost' },
    { key: 'rebounds', label: 'Rebounds' },
    { key: 'scoredGoals', label: 'Goals when scoring', source: 'derived', agg: { kind: 'sum', key: 'goals', over: 'scored' } },
    { key: 'mostGoals', label: 'Most goals', source: 'derived', agg: { kind: 'max', key: 'goals' } },
    { key: 'bestTime', label: 'Best time', source: 'derived', format: { unit: 'time', dp: 2 }, agg: { kind: 'min', key: 'time' } },
    { key: 'conv', label: 'Conversion', source: 'derived', format: { unit: 'percent', dp: 0 },
      agg: { kind: 'rate', num: 'goals', den: 'shots', scale: 100, dp: 0, qualifier: { den: 5 } } },
    { key: 'accuracy', label: 'Accuracy', source: 'derived', format: { unit: 'percent', dp: 0 },
      agg: { kind: 'rate', num: 'onTarget', den: 'shots', scale: 100, dp: 0 } },
    { key: 'gpg', label: 'Goals per game', source: 'derived', format: { unit: 'decimal', dp: 2 }, agg: { kind: 'perGame', key: 'goals', dp: 2, qualifier: { games: 2 } } },
    { key: 'otpg', label: 'On target per game', source: 'derived', agg: { kind: 'perGame', key: 'onTarget', dp: 1 } },
    { key: 'gps', label: 'Goals per set', source: 'derived', agg: { kind: 'perSet', key: 'goals', dp: 2, qualifier: { den: 3 } } },
    { key: 'braces', label: 'Braces', source: 'derived', agg: { kind: 'countIf', key: 'goals', gte: 2 } },
    { key: 'dd', label: 'Double-doubles', source: 'derived', agg: { kind: 'countIf', keys: ['goals', 'rebounds'], atLeast: 2, gte: 10 } },
    { key: 'tbGoals', label: 'Goals (tie-broken)', source: 'derived', agg: { kind: 'sum', key: 'goals' }, tieBreak: [{ key: 'shots', better: 'lower' }] },
  ],
  leaders: ['goals'], headline: ['goals'], awards: [{ stat: 'goals', icon: '⚽', label: 'Top scorer' }],
};
const def = (k: string): StatDef => statDefIn(T, k)!;
const agg = (k: string, ls: StatLine[]) => aggregateValue(T, def(k), ls);

describe('SD-16 — every aggregate kind', () => {
  test('the test schema and every registered schema validate', () => {
    assert.deepEqual(validateSchema(T), []);
    for (const s of Object.values(STAT_SCHEMAS)) assert.deepEqual(validateSchema(s as SportStatSchema<string>), [], s.sport);
  });
  test('sum (with a line filter) — empty input is 0', () => {
    const ls = [L('a', { goals: 2 }), L('a', { goals: 0, shots: 3 }), L('a', { goals: 1 })];
    assert.equal(agg('goals', ls).text, '3');
    assert.equal(agg('scoredGoals', ls).games, 2);
    assert.equal(agg('goals', []).text, '0');
  });
  test('max / min keep the line they came from; lines without the key never count as 0', () => {
    const hi = L('a', { goals: 4 });
    const ls = [L('a', { goals: 1, time: 11.2 }), hi, L('a', { time: 10.85 }), L('a', { shots: 2 })];
    const m = agg('mostGoals', ls);
    assert.equal(m.value, 4); assert.equal(m.text, '4'); assert.equal(m.line, hi);
    const b = agg('bestTime', ls);
    assert.equal(b.text, '10.85'); assert.equal(b.line?.stats.time, 10.85);
    assert.equal(agg('mostGoals', []).text, '–');
    assert.equal(agg('bestTime', [L('a', { goals: 1 })]).value, undefined);
  });
  test('best figure: multi-key ordering (most wickets, then fewest runs)', () => {
    const best = statDefIn(cricketStats, 'best')!;
    const ls = [L('a', { wickets: 4, runsConceded: 3 }), L('a', { wickets: 5, runsConceded: 20 }), L('a', { wickets: 5, runsConceded: 12 })];
    const v = aggregateValue(cricketStats, best, ls);
    assert.equal(v.text, '5/12');
    assert.deepEqual(v.order, [5, -12]);
    assert.equal(aggregateValue(cricketStats, best, []).text, '–');
  });
  test('rate: scale / dp / percent, a 0 denominator is "–"', () => {
    assert.equal(agg('conv', [L('a', { goals: 2, shots: 6 }), L('a', { goals: 1, shots: 3 })]).text, '33%');
    const z = agg('conv', [L('a', { goals: 0 })]);
    assert.equal(z.text, '–'); assert.equal(z.value, undefined); assert.equal(z.tracked, true);
  });
  test('coverage: only lines that tracked the inputs count; nothing tracked → not tracked (undefined), never 0', () => {
    const ls = [
      L('a', { shots: 4, onTarget: 2 }, { tracked: ['shots', 'onTarget', 'goals'] }),
      L('a', { shots: 6 }, { tracked: ['shots', 'goals'] }), // detail mode off: its 6 shots stay out of accuracy
    ];
    assert.equal(agg('accuracy', ls).text, '50%');
    assert.equal(agg('accuracy', ls).games, 1);
    const none = [L('a', { shots: 6 }, { tracked: ['shots'] })];
    assert.equal(agg('accuracy', none).tracked, false);
    assert.equal(aggregateStat(T, def('accuracy'), none), undefined);
    assert.equal(aggregateStat(T, def('otpg'), none), undefined);
    // per game: only the matches that tracked it are the denominator
    assert.equal(agg('otpg', ls).text, '2.0');
  });
  test('perGame: Σ ÷ distinct matches (an SD-11 appearance line counts as a game)', () => {
    const ls = [L('a', { goals: 2 }), L('a', { apps: 1 }), L('a', { goals: 1 }, { matchId: 'shared' }), L('a', { shots: 1 }, { matchId: 'shared' })];
    const v = agg('gpg', ls);
    assert.equal(v.games, 3); assert.equal(v.text, '1.00');
    assert.equal(agg('gpg', []).text, '–');
  });
  test('perSet: Σ ÷ sets played; lines without set counts stay out', () => {
    const ls = [L('a', { goals: 6, setsWon: 2, setsLost: 1 }), L('a', { goals: 3, setsWon: 0, setsLost: 2 }), L('a', { goals: 9 })];
    const v = agg('gps', ls);
    assert.equal(v.den, 5); assert.equal(v.text, '1.80');
    assert.equal(agg('gps', [L('a', { goals: 9 })]).text, '–');
  });
  test('countIf: one key in range, or at least N of several keys', () => {
    const ls = [L('a', { goals: 2 }), L('a', { goals: 1 }), L('a', { goals: 3 })];
    assert.equal(agg('braces', ls).text, '2');
    assert.equal(agg('dd', [L('a', { goals: 12, rebounds: 10 }), L('a', { goals: 30, rebounds: 9 })]).text, '1');
    assert.equal(agg('braces', []).text, '0');
  });
});

describe('SD-16 — leaderboard ranking', () => {
  test('qualifiers: minimum denominator / games; an override (or null) replaces it', () => {
    const ls = [L('a', { goals: 3, shots: 4 }), L('b', { goals: 2, shots: 5 }), L('c', { goals: 1, shots: 10 })];
    assert.deepEqual(rankPlayers(T, def('conv'), ls).map((r) => [r.playerId, r.text]), [['b', '40%'], ['c', '10%']]);
    assert.deepEqual(rankPlayers(T, def('conv'), ls, { qualifier: null }).map((r) => r.playerId), ['a', 'b', 'c']);
    assert.deepEqual(rankPlayers(T, def('conv'), ls, { qualifier: { den: 10 } }).map((r) => r.playerId), ['c']);
    const g = [L('a', { goals: 5 }), L('b', { goals: 1 }), L('b', { goals: 1 })];
    assert.deepEqual(rankPlayers(T, def('gpg'), g).map((r) => r.playerId), ['b']);
    assert.equal(qualifierText(T, def('conv'), qualifierOf(def('conv'))), 'min 5 shots');
    assert.equal(qualifierText(T, def('gpg'), qualifierOf(def('gpg'))), 'min 2 games');
    assert.equal(qualifierText(T, def('gps'), qualifierOf(def('gps'))), 'min 3 sets');
    assert.equal(qualifierText(T, def('goals'), qualifierOf(def('goals'))), undefined);
  });
  test('totals drop 0; ties fall to the tie-break chain, then first appearance (stable)', () => {
    const ls = [L('x', { goals: 2, shots: 9 }), L('y', { goals: 2, shots: 3 }), L('z', { goals: 0 }), L('w', { goals: 2, shots: 3 })];
    assert.deepEqual(rankPlayers(T, def('goals'), ls).map((r) => r.playerId), ['x', 'y', 'w']);
    assert.deepEqual(rankPlayers(T, def('tbGoals'), ls).map((r) => r.playerId), ['y', 'w', 'x']);
    assert.deepEqual(rankPlayers(T, def('goals'), []), []);
  });
  test('direction: lows rank lowest first; lower-is-better rates too', () => {
    const ls = [L('a', { time: 11 }), L('b', { time: 10.5 }), L('c', { goals: 1 })];
    assert.deepEqual(rankPlayers(T, def('bestTime'), ls).map((r) => [r.playerId, r.text]), [['b', '10.50'], ['a', '11.00']]);
  });
  test('coverage note: tracked games ≤ total games', () => {
    const ls = [L('a', { goals: 1 }, { tracked: ['goals'] }), L('a', { goals: 0 }, { tracked: [] })];
    const [r] = rankPlayers(T, def('goals'), ls);
    assert.equal(r.trackedGames, 1); assert.equal(r.totalGames, 2);
  });
  test('limit and eligibility', () => {
    const ls = [L('a', { goals: 3 }), L('b', { goals: 2 }), L('c', { goals: 1 })];
    assert.deepEqual(rankPlayers(T, def('goals'), ls, { limit: 2 }).map((r) => r.playerId), ['a', 'b']);
    assert.deepEqual(rankPlayers(T, def('goals'), ls, { eligible: (id) => id !== 'a' }).map((r) => r.playerId), ['b', 'c']);
  });
});

describe('SD-16 — cricket records leaders (CK-01 proof)', () => {
  const players = ['Asha', 'Bala', 'Chitra', 'Dev', 'Esha'].map((n) => ({ id: n[0].toLowerCase(), fullName: n, houseName: 'Red' })) as unknown as Player[];
  const bat = (pid: string, runs: number, balls: number, notOut = 0, more: Record<string, number> = {}) =>
    L(pid, { runs, ballsFaced: balls, innings: 1, notOut, ...more });
  const bowl = (pid: string, wickets: number, runsConceded: number, ballsBowled: number) => L(pid, { wickets, runsConceded, ballsBowled });
  const lines: StatLine[] = [
    bat('a', 104, 70), bat('a', 12, 15), bat('a', 30, 20), // 146 off 105, 3 outs
    bat('b', 54, 30, 1), bat('b', 8, 4), // 62 off 34 — SR 182.35
    bat('c', 54, 40), bat('c', 51, 45), bat('c', 0, 3), // 105 off 88
    bat('d', 20, 10), // SR 200 but only 10 balls
    bowl('b', 5, 20, 24), bowl('b', 2, 30, 24), bowl('b', 0, 10, 12), // 60 balls, 60 runs → 6.00
    bowl('c', 5, 12, 24), bowl('c', 1, 15, 24), bowl('c', 1, 9, 12), // 60 balls, 36 runs → 3.60
    bowl('e', 4, 3, 18), // 3 overs only
    L('d', { runs: 77, wickets: 2 }), // a legacy (pre-#19) line: counts in totals, HS and 50s — never in rates or bowling figures
  ];
  const lead = (key: string) => leadersByKey(lines, players, 'cricket', key).map((l) => [l.name, l.display ?? String(l.value)]);

  test('highest score — with the not-out star and the match it came from', () => {
    assert.deepEqual(lead('highest'), [['Asha', '104'], ['Dev', '77'], ['Bala', '54*'], ['Chitra', '54']]);
    assert.equal(leadersByKey(lines, players, 'cricket', 'highest')[0].matchId, lines[0].matchId);
  });
  test('best bowling — most wickets, then fewest runs; 0-wicket figures never lead', () => {
    assert.deepEqual(lead('best'), [['Chitra', '5/12'], ['Bala', '5/20'], ['Esha', '4/3']]);
  });
  test('strike rate (min 30 balls), economy (min 10 overs), average (min 3 innings, needs outs)', () => {
    assert.deepEqual(lead('sr'), [['Bala', '182.35'], ['Asha', '139.05'], ['Chitra', '119.32']]);
    assert.deepEqual(lead('econ'), [['Chitra', '3.60'], ['Bala', '6.00']]);
    assert.deepEqual(lead('avg'), [['Asha', '48.67'], ['Chitra', '35.00']]);
  });
  test('50s / 100s counts; totals unchanged', () => {
    assert.deepEqual(lead('fifties'), [['Chitra', '2'], ['Dev', '1'], ['Bala', '1']]); // Dev / Bala level on 1: more runs first
    assert.deepEqual(lead('hundreds'), [['Asha', '1']]);
    assert.deepEqual(lead('runs').slice(0, 3), [['Asha', '146'], ['Chitra', '105'], ['Dev', '97']]);
  });
  test('the tournament Stats tab categories: titles, order and the minimum notes', () => {
    const cats = categoryLeaders(lines, players, 'cricket' as SportId);
    assert.deepEqual(cats.map((c) => [c.label, c.qualifier ?? '']), [
      ['Runs', ''], ['Wickets', ''], ['Highest score', ''], ['Best bowling', ''],
      ['Best batting average', 'min 3 innings'], ['Best strike rate', 'min 30 balls'], ['Best economy', 'min 10 overs'],
      ['Most 50s', ''], ['Most 100s', ''],
    ]);
    assert.deepEqual(QUALIFIERS, { avg: { games: 3, note: 'min 3 innings' }, sr: { den: 30, note: 'min 30 balls' }, econ: { den: 60, note: 'min 10 overs' } });
  });
});

describe('SD-16 — basketball per-game and volleyball per-set (data only)', () => {
  const bb = STAT_SCHEMAS.basketball;
  const B = (stats: Record<string, number>) => L('a', stats, { sport: 'basketball' });
  test('PPG / RPG / APG and double-doubles', () => {
    const ls = [B({ points: 20, rebounds: 11, assists: 3 }), B({ points: 9, rebounds: 4, assists: 10, steals: 1 }), B({ apps: 1 })];
    const v = (k: string) => aggregateStat(bb, statDefIn(bb, k)!, ls);
    assert.equal(v('ppg'), '9.7'); assert.equal(v('rpg'), '5.0'); assert.equal(v('apg'), '4.3');
    assert.equal(v('doubleDoubles'), '1');
  });
  test('volleyball points / aces / blocks per set — needs set counts (SD-19)', () => {
    const vb = STAT_SCHEMAS.volleyball;
    const V = (stats: Record<string, number>) => L('a', stats, { sport: 'volleyball' });
    const ls = [V({ points: 14, aces: 2, blocks: 3, setsWon: 3, setsLost: 1 }), V({ points: 9, aces: 1, setsWon: 1, setsLost: 3 })];
    const v = (k: string) => aggregateStat(vb, statDefIn(vb, k)!, ls);
    assert.equal(v('pointsPerSet'), '2.88'); assert.equal(v('acesPerSet'), '0.38'); assert.equal(v('blocksPerSet'), '0.38');
    assert.equal(aggregateStat(vb, statDefIn(vb, 'pointsPerSet')!, [V({ points: 14 })]), '–'); // legacy line: no set count
  });
});
