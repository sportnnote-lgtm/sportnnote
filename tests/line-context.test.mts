/**
 * SD-25 (GEN-12) — line context and splits: each stat line's context derived
 * at read time from its match + tournament (format / ball / singles-doubles /
 * tournament / season / opponent / colour / time control / venue / home-away),
 * the splits each sport declares, chip options (≥ 2 values), filtering, cricket
 * career by format equal to hand-computed figures, and "no filter" identical
 * to today's output.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Match, SportId, StatLine, Team, Tournament } from '../src/core/types.ts';
import {
  lineContext, contextsFor, splitOptions, filterLines, cricketFormat, seasonOf, sideOf,
} from '../src/data/lineContext.ts';
import { careerFromSchema } from '../src/sports/statSchema.ts';
import { STAT_SCHEMAS, statSchema } from '../src/sports/statSchemas.ts';
import { cricketStats } from '../src/sports/cricket/stats.ts';
import { aggregate } from '../src/data/stats.ts';

const team = (id: string, name: string, sport: SportId, roster?: string[]): Team => ({ id, name, shortName: name.slice(0, 3), sport, roster });
let mseq = 0;
const M = (sport: SportId, o: Partial<Match> & { home?: Team; away?: Team } = {}): Match => {
  mseq += 1;
  const { home, away, ...rest } = o;
  return {
    id: `m${mseq}`, sport, status: 'completed', startsAt: '2026-05-01T10:00:00Z',
    homeTeam: home ?? team('h', 'Reds', sport), awayTeam: away ?? team('a', 'Blues', sport), state: {}, ...rest,
  } as Match;
};
let lseq = 0;
const L = (m: Match, stats: Record<string, number>, extra: Partial<StatLine> = {}): StatLine => {
  lseq += 1;
  return { id: `l${lseq}`, matchId: m.id, playerId: 'p1', sport: m.sport, stats, won: false, opponent: m.awayTeam.name, date: m.startsAt, ...extra };
};
const T = (id: string, name: string, formats?: Tournament['formats']) => ({ id, name, formats });

describe('cricket format (CK-03)', () => {
  test('presets name the format', () => {
    assert.equal(cricketFormat({ preset: 't20' }).label, 'T20');
    assert.equal(cricketFormat({ preset: 'odi' }).label, 'ODI');
    assert.equal(cricketFormat({ preset: 't10' }).label, 'T10');
    assert.equal(cricketFormat({ preset: 'hundred' }).label, 'Hundred');
    assert.equal(cricketFormat({ preset: 'box' }).label, 'Box');
    assert.equal(cricketFormat({ preset: 'sixes' }).label, 'Box');
    assert.equal(cricketFormat({ preset: 'test' }).label, 'Long');
  });
  test('custom formats classify by numbers', () => {
    assert.equal(cricketFormat({ preset: 'custom', overs: 15, playersPerSide: 11 }).key, 't20');
    assert.equal(cricketFormat({ overs: 20 }).key, 't20');
    assert.equal(cricketFormat({ overs: 40 }).key, 'odi');
    assert.equal(cricketFormat({ overs: 8 }).key, 't10');
    assert.equal(cricketFormat({ overs: 999 }).key, 'long');
    assert.equal(cricketFormat({ overs: 10, ballsPerOver: 10 }).key, 'hundred');
    assert.equal(cricketFormat({ overs: 20, playersPerSide: 8 }).key, 'box');
    // from the match state only (older match with no stored format)
    assert.equal(cricketFormat({}, { inn1Overs: 10, ballsPerOver: 6, wicketsLimit: 10 }).key, 't10');
    assert.equal(cricketFormat({}, { inn1Overs: 6, wicketsLimit: 5 }).key, 'box');
    assert.equal(cricketFormat({}, {}).key, 'other');
  });
  test('tournament format applies, match format overrides; ball type', () => {
    const t = T('t1', 'Cup', { cricket: { preset: 'odi', ballType: 'leather' } });
    const m1 = M('cricket', { tournamentId: 't1' });
    const c1 = lineContext(L(m1, { runs: 1 }), m1, t);
    assert.equal(c1.format?.key, 'odi');
    assert.equal(c1.ball?.label, 'Leather');
    const m2 = M('cricket', { tournamentId: 't1', format: { preset: 'box', ballType: 'tennis' } });
    const c2 = lineContext(L(m2, { runs: 1 }), m2, t);
    assert.equal(c2.format?.key, 'box');
    assert.equal(c2.ball?.label, 'Tennis ball');
  });
});

describe('context per sport family', () => {
  test('racket singles / doubles: engine flag, else players per side', () => {
    const s = M('badminton', { state: { doubles: false, gamesToWin: 2, pointsPerGame: 21 } });
    const d = M('badminton', { state: { doubles: true } });
    const tn = M('tennis', { format: { playersPerSide: 2, setsToWin: 3 } });
    const pd = M('padel');
    assert.equal(lineContext(L(s, {}), s, undefined).discipline?.label, 'Singles');
    assert.equal(lineContext(L(s, {}), s, undefined).format?.label, 'Best of 3 · 21');
    assert.equal(lineContext(L(d, {}), d, undefined).discipline?.label, 'Doubles');
    const ct = lineContext(L(tn, {}), tn, undefined);
    assert.equal(ct.discipline?.label, 'Doubles');
    assert.equal(ct.format?.label, 'Best of 5');
    assert.equal(lineContext(L(pd, {}), pd, undefined).discipline?.label, 'Doubles');
    const mixed = M('badminton', { format: { playersPerSide: 2, category: 'mixed' } });
    assert.equal(lineContext(L(mixed, {}), mixed, undefined).discipline?.label, 'Mixed');
    // a team sport has no discipline
    const fb = M('football', { format: { playersPerSide: 7 } });
    const cf = lineContext(L(fb, {}), fb, undefined);
    assert.equal(cf.discipline, undefined);
    assert.equal(cf.format?.label, '7-a-side');
  });
  test('tennis presets and best-of', () => {
    const f4 = M('tennis', { format: { preset: 'fast4', setsToWin: 2 } });
    assert.equal(lineContext(L(f4, {}), f4, undefined).format?.label, 'Fast4');
    const b3 = M('tennis', { format: { preset: 'bo3', setsToWin: 2 } });
    assert.equal(lineContext(L(b3, {}), b3, undefined).format?.label, 'Best of 3');
  });
  test('volleyball indoor / beach, basketball 3x3', () => {
    const b = M('volleyball', { format: { preset: 'beach' } });
    assert.equal(lineContext(L(b, {}), b, undefined).format?.label, 'Beach');
    const i = M('volleyball', { format: { playersPerSide: 6 } });
    assert.equal(lineContext(L(i, {}), i, undefined).format?.label, 'Indoor');
    const bk = M('basketball', { format: { playersPerSide: 3 } });
    assert.equal(lineContext(L(bk, {}), bk, undefined).format?.label, '3x3');
  });
  test('chess colour from the white side and time control', () => {
    const home = M('chess', { state: { white: 'away', timeControl: 'blitz' } });
    const c = lineContext(L(home, {}), home, undefined); // p1 on home (opponent = away name)
    assert.equal(c.side, 'home');
    assert.equal(c.colour?.label, 'Black');
    assert.equal(c.timeControl?.label, 'Blitz');
    const awayLine = L(home, {}, { opponent: 'Reds' });
    assert.equal(lineContext(awayLine, home, undefined).colour?.label, 'White');
    // default: home has White
    const d = M('chess', { state: {} , format: { timeControl: 'rapid' } });
    const cd = lineContext(L(d, {}), d, undefined);
    assert.equal(cd.colour?.label, 'White');
    assert.equal(cd.timeControl?.label, 'Rapid');
    // side unknown → no colour (never a guess)
    const u = lineContext(L(d, {}, { opponent: undefined }), d, undefined);
    assert.equal(u.colour, undefined);
  });
  test('tournament vs friendly, season, opponent, venue, home/away', () => {
    const t = T('t9', 'Inter-house 2026');
    const m = M('football', { tournamentId: 't9', venueName: 'Main ground', startsAt: '2026-03-10T09:00:00Z' });
    const c = lineContext(L(m, {}), m, t);
    assert.deepEqual(c.competition, { key: 'tournament', label: 'Tournament' });
    assert.deepEqual(c.tournament, { key: 't9', label: 'Inter-house 2026' });
    assert.equal(c.season?.label, '2026');
    assert.deepEqual(c.opponent, { key: 'a', label: 'Blues' });
    assert.equal(c.venue?.label, 'Main ground');
    assert.equal(c.homeAway?.label, 'Home');
    // school season from April: March 2026 belongs to 2025–26
    assert.equal(lineContext(L(m, {}), m, t, { seasonStartMonth: 4 }).season?.label, '2025–26');
    assert.equal(seasonOf('2026-04-01', 4)?.label, '2026–27');
    const f = M('football');
    const cf = lineContext(L(f, {}), f, undefined);
    assert.equal(cf.competition?.key, 'friendly');
    assert.equal(cf.tournament?.label, 'Friendlies');
  });
  test('side from roster when the opponent label cannot tell', () => {
    const m = M('carrom', { home: team('x', 'Same', 'carrom', ['p1']), away: team('y', 'Same', 'carrom', ['p2']) });
    assert.equal(sideOf(L(m, {}, { opponent: 'Same' }), m), 'home');
    // no match at all: season from the line date, nothing else invented
    const lone: StatLine = { id: 'z', matchId: 'gone', playerId: 'p1', sport: 'cricket', stats: {}, won: false, opponent: 'Old XI', date: '2024-02-02' };
    const c = lineContext(lone, undefined, undefined);
    assert.equal(c.format, undefined);
    assert.equal(c.tournament, undefined); // not guessed as a friendly
    assert.equal(c.season?.key, '2024');
    assert.equal(c.opponent?.label, 'Old XI');
  });
});

/* ------------------------- cricket career by format ------------------------- */

const t1 = T('t1', 'T20 League', { cricket: { preset: 't20', ballType: 'leather' } });
const t2 = T('t2', 'Summer Cup');
const cm = [
  M('cricket', { tournamentId: 't1', startsAt: '2026-04-01T10:00:00Z' }),
  M('cricket', { format: { preset: 'odi', ballType: 'leather' }, startsAt: '2026-05-01T10:00:00Z' }),
  M('cricket', { tournamentId: 't2', format: { overs: 15, playersPerSide: 11 }, startsAt: '2025-11-01T10:00:00Z', away: team('g', 'Greens', 'cricket') }),
  M('cricket', { state: { inn1Overs: 10, ballsPerOver: 6, wicketsLimit: 10 }, startsAt: '2025-06-01T10:00:00Z' }),
  M('cricket', { format: { preset: 'box', ballType: 'tennis' }, startsAt: '2026-06-01T10:00:00Z' }),
];
const cl = [
  L(cm[0], { runs: 40, innings: 1, notOut: 0, ballsFaced: 30, fours: 4, sixes: 1, ballsBowled: 24, runsConceded: 30, wickets: 2 }),
  L(cm[1], { runs: 80, innings: 1, notOut: 1, ballsFaced: 100, ballsBowled: 60, runsConceded: 45, wickets: 1 }),
  L(cm[2], { runs: 10, innings: 1, notOut: 0, ballsFaced: 8, ballsBowled: 18, runsConceded: 20, wickets: 3 }),
  L(cm[3], { runs: 25, innings: 1, notOut: 0, ballsFaced: 12 }),
  L(cm[4], { runs: 30, innings: 1, notOut: 0, ballsFaced: 10 }),
];
const matchById = new Map(cm.map((m) => [m.id, m]));
const tById = new Map([[t1.id, t1], [t2.id, t2]]);
const ctx = contextsFor(cl, matchById, tById);
const row = (c: Record<string, { key: string; value: string }[]>, sec: string, key: string) => c[sec].find((r) => r.key === key)?.value;

describe('cricket career by format', () => {
  test('formats derived per line', () => {
    assert.deepEqual(cl.map((l) => ctx.get(l.id)!.format!.label), ['T20', 'ODI', 'T20', 'T10', 'Box']);
  });
  test('T20 career equals hand-computed values', () => {
    const c = careerFromSchema(cricketStats, filterLines(cl, ctx, { format: 't20' }));
    assert.equal(row(c, 'batting', 'runs'), '50');
    assert.equal(row(c, 'batting', 'innings'), '2');
    assert.equal(row(c, 'batting', 'highest'), '40');
    assert.equal(row(c, 'batting', 'avg'), '25.00'); // 50 / 2 outs
    assert.equal(row(c, 'batting', 'sr'), '131.58'); // 50 / 38 × 100
    assert.equal(row(c, 'bowling', 'overs'), '7.0'); // 42 balls
    assert.equal(row(c, 'bowling', 'wickets'), '5');
    assert.equal(row(c, 'bowling', 'econ'), '7.14'); // 50 / 42 × 6
    assert.equal(row(c, 'bowling', 'bowlAvg'), '10.00');
    assert.equal(row(c, 'bowling', 'bowlSr'), '8.4');
    assert.equal(row(c, 'bowling', 'best'), '3/20');
  });
  test('ODI career equals hand-computed values', () => {
    const c = careerFromSchema(cricketStats, filterLines(cl, ctx, { format: 'odi' }));
    assert.equal(row(c, 'batting', 'runs'), '80');
    assert.equal(row(c, 'batting', 'highest'), '80*');
    assert.equal(row(c, 'batting', 'avg'), '–'); // never out
    assert.equal(row(c, 'batting', 'sr'), '80.00');
    assert.equal(row(c, 'bowling', 'overs'), '10.0');
    assert.equal(row(c, 'bowling', 'econ'), '4.50');
    assert.equal(row(c, 'bowling', 'best'), '1/45');
  });
  test('ball type, tournament, season and opponent split too', () => {
    assert.deepEqual(filterLines(cl, ctx, { ball: 'tennis' }).map((l) => l.stats.runs), [30]);
    assert.deepEqual(filterLines(cl, ctx, { tournament: 't1' }).map((l) => l.stats.runs), [40]);
    assert.deepEqual(filterLines(cl, ctx, { tournament: 'friendly' }).map((l) => l.stats.runs), [80, 25, 30]);
    assert.deepEqual(filterLines(cl, ctx, { season: '2025' }).map((l) => l.stats.runs), [10, 25]);
    assert.deepEqual(filterLines(cl, ctx, { opponent: 'g' }).map((l) => l.stats.runs), [10]);
    // splits combine
    assert.deepEqual(filterLines(cl, ctx, { format: 't20', season: '2026' }).map((l) => l.stats.runs), [40]);
    assert.deepEqual(filterLines(cl, ctx, { format: 'odi', ball: 'tennis' }), []);
  });
  test('chip options: declared splits with ≥ 2 values, cricket format order', () => {
    const opts = splitOptions(cl, ctx, cricketStats.splits!);
    assert.deepEqual(opts.map((o) => o.dim), ['format', 'ball', 'tournament', 'season', 'opponent']);
    const fmt = opts.find((o) => o.dim === 'format')!;
    assert.deepEqual(fmt.values.map((v) => `${v.label}:${v.count}`), ['T20:2', 'ODI:1', 'T10:1', 'Box:1']);
    assert.deepEqual(opts.find((o) => o.dim === 'season')!.values.map((v) => v.key), ['2026', '2025']);
    // the T10 line has no ball type (state-only match): Ball still has 2 values
    assert.deepEqual(opts.find((o) => o.dim === 'ball')!.values.map((v) => v.key).sort(), ['leather', 'tennis']);
    // one value only → no chip
    const one = cl.slice(0, 1);
    assert.deepEqual(splitOptions(one, ctx, cricketStats.splits!), []);
  });
});

describe('no filter = today', () => {
  test('filterLines with no selection returns the same lines', () => {
    assert.equal(filterLines(cl, ctx, {}), cl);
    assert.equal(filterLines(cl, ctx, { format: undefined }), cl);
  });
  test('career and record identical with an empty selection', () => {
    assert.deepEqual(careerFromSchema(cricketStats, filterLines(cl, ctx, {})), careerFromSchema(cricketStats, cl));
    assert.deepEqual(aggregate(filterLines(cl, ctx, {})), aggregate(cl));
  });
  test('filtered record re-aggregates (W-D-L follows the lines)', () => {
    const withRes = cl.map((l, i) => ({ ...l, result: (i % 2 ? 'L' : 'W') as 'W' | 'L' }));
    const s = aggregate(filterLines(withRes, ctx, { format: 't20' }));
    const b = s.bySport.find((x) => x.sport === 'cricket')!;
    assert.equal(b.matches, 2);
    assert.equal(b.wins, 2); // lines 0 and 2
    assert.equal(b.totals.runs, 50);
  });
});

describe('schema declarations', () => {
  test('every sport except golf declares splits; racket sports offer singles/doubles; chess colour + time control', () => {
    for (const [sp, s] of Object.entries(STAT_SCHEMAS)) {
      if (sp === 'golf' || sp === 'athletics' || sp === 'swimming' || sp === 'weightlifting' || sp === 'shooting') assert.equal(s.splits, undefined); // SD-90 / SD-94: a measured career, no match context
      else assert.ok(s.splits?.includes('tournament') && s.splits.includes('season') && s.splits.includes('opponent'), sp);
    }
    for (const sp of ['tennis', 'badminton', 'tabletennis', 'squash', 'pickleball', 'padel', 'carrom'] as SportId[]) {
      assert.ok(statSchema(sp)!.splits!.includes('discipline'), sp);
    }
    assert.deepEqual(statSchema('chess')!.splits!.slice(0, 2), ['colour', 'timeControl']);
    assert.deepEqual(statSchema('cricket')!.splits!.slice(0, 2), ['format', 'ball']);
  });
  test('badminton singles / doubles chip from engine state', () => {
    const ms = [M('badminton', { state: { doubles: false } }), M('badminton', { state: { doubles: true } }), M('badminton', { state: { doubles: true } })];
    const ls = ms.map((m) => L(m, { points: 10 }));
    const cx = contextsFor(ls, new Map(ms.map((m) => [m.id, m])), new Map());
    const opts = splitOptions(ls, cx, statSchema('badminton')!.splits!);
    const d = opts.find((o) => o.dim === 'discipline')!;
    assert.deepEqual(d.values.map((v) => `${v.label}:${v.count}`), ['Doubles:2', 'Singles:1']);
    assert.equal(aggregate(filterLines(ls, cx, { discipline: 'doubles' })).totals.points, 20);
  });
});
