/**
 * SD-17 — the standings rule kit: margin-aware match points (FIVB 3-3-2-1,
 * PKL 5-3-1 with the ≤ 7 losing bonus, FIBA 2-1 + forfeit 0, FIH 3-1-0 with
 * the shoot-out variant, IHF 2-1-0), the tie-breaker library (h2hDiff, h2hFor,
 * setRatio, pointRatio, gamesDiff, pointsDiff, setsPct, gamesPct, played,
 * fairPlay, wins, explicit lots, custom hooks for chess), BWF 2-vs-3-way
 * branching, the FIBA mini-league with restart, UEFA head-to-head then
 * overall, and D1: new tournaments store their body's preset while existing
 * tables read exactly as before.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  teamStandings, standingsConfigFromFormat, defaultStandingsConfig, setStandingsUnitsProvider, setStandingsPointsProvider,
  NEW_TOURNAMENT_POINTS, newTournamentFormats, standingsPresets, activePreset, pointsSystemLabel, matchPoints, seedKey,
  registerTieBreaker, parseSetPoints, availableTieBreakers, tieBreakerLabel,
  type StandingsConfig, type StandingsUnits,
} from '../src/data/standings.ts';
import { fairPlayScore } from '../src/sports/football/engine.ts';
import { standingsUnits as tennisUnits } from '../src/sports/tennis/engine.ts';
import { standingsUnits as padelUnits } from '../src/sports/padel/engine.ts';
import { standingsUnits as volleyballUnits } from '../src/sports/volleyball/engine.ts';
import type { Match, SportId } from '../src/core/types.ts';
import type { FootballEvent } from '../src/sports/football/events.ts';

let n = 0;
/** A completed match; `u` = the units the fake provider hands the kit. */
function mt(sport: string, h: string, a: string, hs: number, as: number,
  o: { winner?: 'home' | 'away' | 'draw'; u?: StandingsUnits; walkover?: boolean; names?: Record<string, string> } = {}): Match {
  const winner = o.winner ?? (hs > as ? 'home' : as > hs ? 'away' : 'draw');
  return {
    id: `m${++n}`, sport, status: 'completed', startsAt: '', score: { home: hs, away: as }, winner,
    ...(o.walkover ? { walkover: true } : {}),
    homeTeam: { id: h, name: o.names?.[h] ?? h }, awayTeam: { id: a, name: o.names?.[a] ?? a },
    state: o.u ? { u: o.u } : null,
  } as unknown as Match;
}
const ids = (rows: { teamId: string }[]) => rows.map((r) => r.teamId).join('');
const pts = (rows: { teamId: string; points: number }[]) => Object.fromEntries(rows.map((r) => [r.teamId, r.points]));
const cfgOf = (sport: string, fmt?: Record<string, unknown>) => standingsConfigFromFormat(sport as SportId, fmt);
const table = (ms: Match[], sport: string, cfg: StandingsConfig) => teamStandings(ms, sport as SportId, cfg);
const presetFmt = (sport: string, id?: string) => {
  const p = standingsPresets(sport).find((x) => (id ? x.id === id : true))!;
  return p.set as Record<string, unknown>;
};

before(() => {
  setStandingsUnitsProvider((_sp, st) => ((st as { u?: StandingsUnits } | null)?.u ?? null));
  setStandingsPointsProvider(null);
});
after(() => setStandingsUnitsProvider(null));

describe('margin-aware match points (presets)', () => {
  test('FIVB: 3-0 and 3-1 → 3-0, 3-2 → 2-1; best of 3: 2-0 → 3-0, 2-1 → 2-1', () => {
    const c = cfgOf('volleyball', presetFmt('volleyball', 'fivb'));
    assert.deepEqual(matchPoints(mt('volleyball', 'A', 'B', 3, 0), c), { home: 3, away: 0 });
    assert.deepEqual(matchPoints(mt('volleyball', 'A', 'B', 1, 3), c), { home: 0, away: 3 });
    assert.deepEqual(matchPoints(mt('volleyball', 'A', 'B', 2, 3), c), { home: 1, away: 2 });
    assert.deepEqual(matchPoints(mt('volleyball', 'A', 'B', 2, 0), c), { home: 3, away: 0 });
    assert.deepEqual(matchPoints(mt('volleyball', 'A', 'B', 2, 1), c), { home: 2, away: 1 });
  });
  test('PKL: 5 a win, 3 a tie, +1 for a loss by 7 or fewer (not by 8)', () => {
    const c = cfgOf('kabaddi', presetFmt('kabaddi', 'pkl'));
    assert.deepEqual(matchPoints(mt('kabaddi', 'A', 'B', 40, 33), c), { home: 5, away: 1 });
    assert.deepEqual(matchPoints(mt('kabaddi', 'A', 'B', 40, 32), c), { home: 5, away: 0 });
    assert.deepEqual(matchPoints(mt('kabaddi', 'A', 'B', 30, 30), c), { home: 3, away: 3 });
    assert.deepEqual(matchPoints(mt('kabaddi', 'A', 'B', 0, 0, { winner: 'home', walkover: true }), c), { home: 5, away: 0 }, 'no bonus for a walkover');
  });
  test('FIBA: 2 a win, 1 a played loss, 0 a forfeit', () => {
    const c = cfgOf('basketball', presetFmt('basketball', 'fiba'));
    assert.deepEqual(matchPoints(mt('basketball', 'A', 'B', 70, 60), c), { home: 2, away: 1 });
    assert.deepEqual(matchPoints(mt('basketball', 'A', 'B', 20, 0, { walkover: true }), c), { home: 2, away: 0 });
  });
  test('FIH 3-1-0, and the shoot-out variant: level + shoot-out → 2 / 1', () => {
    const plain = cfgOf('hockey', presetFmt('hockey', 'fih'));
    const so = cfgOf('hockey', presetFmt('hockey', 'fih-so'));
    assert.deepEqual(matchPoints(mt('hockey', 'A', 'B', 3, 1), plain), { home: 3, away: 0 });
    assert.deepEqual(matchPoints(mt('hockey', 'A', 'B', 2, 2), plain), { home: 1, away: 1 });
    assert.deepEqual(matchPoints(mt('hockey', 'A', 'B', 2, 2, { winner: 'away' }), so), { home: 1, away: 2 });
    assert.deepEqual(matchPoints(mt('hockey', 'A', 'B', 3, 2), so), { home: 3, away: 0 }, 'a regulation win is still 3');
  });
  test('IHF 2-1-0', () => {
    const c = cfgOf('handball', presetFmt('handball', 'ihf'));
    assert.deepEqual(matchPoints(mt('handball', 'A', 'B', 30, 28), c), { home: 2, away: 0 });
    assert.deepEqual(matchPoints(mt('handball', 'A', 'B', 25, 25), c), { home: 1, away: 1 });
  });
  test('setPoints parsing ignores junk', () => {
    assert.deepEqual(parseSetPoints('3-0:3/0, 3-2:2/1,bad,4:1'), { '3-0': [3, 0], '3-2': [2, 1] });
    assert.equal(parseSetPoints(''), undefined);
  });
  test('the table adds the margin points (PKL season)', () => {
    const c = cfgOf('kabaddi', NEW_TOURNAMENT_POINTS.kabaddi);
    const rows = table([mt('kabaddi', 'A', 'B', 35, 30), mt('kabaddi', 'B', 'C', 40, 20), mt('kabaddi', 'C', 'A', 28, 28)], 'kabaddi', c);
    assert.deepEqual(pts(rows), { A: 8, B: 6, C: 3 });
    assert.deepEqual(rows.find((r) => r.teamId === 'B')!.games, undefined, 'no per-round records outside chess');
  });
});

describe('tie-breakers, one at a time', () => {
  // Teams level on points → the single criterion under test decides; 'lots'
  // as the safety net.
  const only = (sport: string, tb: string, extra: Record<string, unknown> = {}) => cfgOf(sport, { tieBreak: `${tb},lots`, ...extra });

  test('h2hDiff / h2hFor: the mini-league among the tied only', () => {
    // A, B, C cyclic (each 1-1 among them): h2h diff A +3, B −4, C +1; overall diff (vs D) says B.
    const ms = [mt('basketball', 'A', 'B', 70, 60), mt('basketball', 'B', 'C', 66, 60), mt('basketball', 'C', 'A', 80, 73),
      mt('basketball', 'A', 'D', 50, 49), mt('basketball', 'B', 'D', 90, 40), mt('basketball', 'C', 'D', 51, 50)];
    assert.equal(ids(table(ms, 'basketball', only('basketball', 'h2hDiff'))).slice(0, 3), 'ACB');
    assert.equal(ids(table(ms, 'basketball', only('basketball', 'diff'))).slice(0, 3), 'BAC');
    // h2h scored: A 70+73 = 143, B 60+66 = 126, C 60+80 = 140
    assert.equal(ids(table(ms, 'basketball', only('basketball', 'h2hFor'))).slice(0, 3), 'ACB');
  });
  test('setRatio / setsPct (sets from the volleyball score)', () => {
    // A and B: one win, one loss each. A sets 3-1, 2-3 → 5/4; B 3-0, 0-3 → 3/3.
    const ms = [mt('volleyball', 'A', 'X', 3, 1), mt('volleyball', 'A', 'Y', 2, 3), mt('volleyball', 'B', 'X', 3, 0), mt('volleyball', 'B', 'Y', 0, 3)];
    const top = (tb: string) => ids(table(ms, 'volleyball', only('volleyball', tb))).replace(/[XY]/g, '');
    assert.equal(top('setRatio'), 'AB');
    assert.equal(top('setsPct'), 'AB');
  });
  test('pointRatio / pointsDiff (rally points from the units provider)', () => {
    const p = (h: number, a: number) => ({ points: { home: h, away: a } });
    const ms = [mt('volleyball', 'A', 'X', 3, 0, { u: p(75, 60) }), mt('volleyball', 'A', 'Y', 0, 3, { u: p(50, 75) }),
      mt('volleyball', 'B', 'X', 3, 0, { u: p(75, 40) }), mt('volleyball', 'B', 'Y', 0, 3, { u: p(70, 75) })];
    const top = (tb: string) => ids(table(ms, 'volleyball', only('volleyball', tb))).replace(/[XY]/g, '');
    assert.equal(top('pointRatio'), 'BA'); // B 145/115 > A 125/135
    assert.equal(top('pointsDiff'), 'BA');
    const b = table(ms, 'volleyball', only('volleyball', 'pointsDiff')).find((r) => r.teamId === 'B')!;
    assert.deepEqual([b.rallyFor, b.rallyAgainst], [145, 115]);
  });
  test('gamesDiff / gamesPct (tennis games from the units provider; sets from the score)', () => {
    const g = (h: number, a: number) => ({ games: { home: h, away: a } });
    const ms = [mt('tennis', 'A', 'X', 2, 0, { u: g(12, 2) }), mt('tennis', 'A', 'Y', 0, 2, { u: g(5, 12) }),
      mt('tennis', 'B', 'X', 2, 1, { u: g(15, 14) }), mt('tennis', 'B', 'Y', 0, 2, { u: g(10, 12) })];
    const top = (tb: string) => ids(table(ms, 'tennis', only('tennis', tb))).replace(/[XY]/g, '');
    assert.equal(top('gamesDiff'), 'AB'); // A +3, B −1
    assert.equal(top('gamesPct'), 'AB');
    assert.equal(top('setsPct'), 'AB'); // A 2/4, B 2/5
  });
  test('played: a side with more matches played ranks higher (ATP)', () => {
    const c = cfgOf('tennis', { tieBreak: 'played,lots', winPoints: 1, lossPoints: 0 });
    const ms = [mt('tennis', 'A', 'X', 2, 0), mt('tennis', 'A', 'Y', 0, 2), mt('tennis', 'B', 'X', 2, 0)];
    assert.equal(ids(table(ms, 'tennis', c)).slice(0, 2), 'AB');
  });
  test('wins (cricket ICC order: wins before NRR)', () => {
    // A: 1 win + 2 NR (2 + 1 + 1 = 4); B: 2 wins (4). ICC → B.
    const nr = (h: string, a: string) => ({ ...mt('cricket', h, a, 0, 0), winner: undefined, result: { kind: 'no_result' } }) as unknown as Match;
    const ms = [mt('cricket', 'A', 'X', 150, 140), nr('A', 'Y'), nr('A', 'Z'), mt('cricket', 'B', 'Y', 120, 100), mt('cricket', 'B', 'Z', 120, 119)];
    const icc = cfgOf('cricket', NEW_TOURNAMENT_POINTS.cricket);
    assert.equal(ids(table(ms, 'cricket', icc))[0], 'B');
  });
  test('fairPlay: FIFA deductions per player, worst card only', () => {
    const ev = (side: 'home' | 'away', type: 'yellow' | 'red', who: string, secondYellow?: boolean): FootballEvent =>
      ({ id: ++n, minute: 10, side, type, playerName: who, ...(secondYellow ? { secondYellow } : {}) }) as FootballEvent;
    assert.deepEqual(fairPlayScore([ev('home', 'yellow', 'a')]), { home: -1, away: 0 });
    assert.deepEqual(fairPlayScore([ev('home', 'yellow', 'a'), ev('home', 'red', 'a', true)]), { home: -3, away: 0 });
    assert.deepEqual(fairPlayScore([ev('home', 'yellow', 'a'), ev('home', 'yellow', 'a')]), { home: -3, away: 0 });
    assert.deepEqual(fairPlayScore([ev('away', 'red', 'b')]), { home: 0, away: -4 });
    assert.deepEqual(fairPlayScore([ev('away', 'yellow', 'b'), ev('away', 'red', 'b')]), { home: 0, away: -5 });
    assert.deepEqual(fairPlayScore([ev('home', 'yellow', 'a'), ev('home', 'yellow', 'c')]), { home: -2, away: 0 });
    // In the table: A and B identical results, A picked up a red → B above A.
    const fp = (h: number, a: number) => ({ fairPlay: { home: h, away: a } });
    const ms = [mt('football', 'A', 'B', 1, 1, { u: fp(-4, -1) })];
    const rows = table(ms, 'football', cfgOf('football', NEW_TOURNAMENT_POINTS.football));
    assert.equal(ids(rows), 'BA');
    assert.deepEqual(rows.map((r) => r.fairPlay), [-1, -4]);
  });
  test('explicit lots: flagged, not a silent name order; legacy chains unflagged', () => {
    const ms = [mt('football', 'Z', 'A', 1, 1)];
    const rows = table(ms, 'football', cfgOf('football', NEW_TOURNAMENT_POINTS.football));
    assert.deepEqual(rows.map((r) => [r.teamId, r.lots]), [['A', true], ['Z', true]]);
    const legacy = table(ms, 'football', defaultStandingsConfig('football'));
    assert.deepEqual(legacy.map((r) => [r.teamId, r.lots]), [['A', undefined], ['Z', undefined]]);
  });
  test('seedKey: overall analogs across groups; head-to-head and lots skipped', () => {
    const row = table([mt('volleyball', 'A', 'B', 3, 1, { u: { points: { home: 90, away: 80 } } })], 'volleyball',
      cfgOf('volleyball', { tieBreak: 'setRatio,pointsDiff,fairPlay' }))[0];
    assert.equal(seedKey(row, 'setRatio'), 3);
    assert.equal(seedKey(row, 'pointsDiff'), 10);
    assert.equal(seedKey(row, 'h2hDiff'), null);
    assert.equal(seedKey(row, 'lots'), null);
  });
  test('custom tie-breakers (the hook chess Buchholz / SD-26 plugs into)', () => {
    registerTieBreaker('testBuchholz', { label: 'Buchholz', value: (t) => (t.teamId === 'B' ? 9 : 1), seed: (t) => (t.teamId === 'B' ? 9 : 1) });
    try {
      const c = cfgOf('chess', { tieBreak: 'testBuchholz,lots' });
      assert.deepEqual(c.order, ['testBuchholz', 'lots']);
      const rows = table([mt('chess', 'A', 'B', 0.5, 0.5)], 'chess', c);
      assert.equal(ids(rows), 'BA');
      assert.equal(tieBreakerLabel('testBuchholz'), 'Buchholz');
      assert.ok(availableTieBreakers('chess').includes('testBuchholz'));
      assert.throws(() => registerTieBreaker('h2h', { label: 'x', value: () => 0 }));
    } finally {
      registerTieBreaker('testBuchholz', null);
    }
    assert.deepEqual(cfgOf('chess', { tieBreak: 'testBuchholz' }).order, defaultStandingsConfig('chess').order, 'unregistered → ignored');
  });
});

describe('BWF: 2 tied → head-to-head; 3+ tied → games difference, points difference', () => {
  const bwf = () => cfgOf('badminton', NEW_TOURNAMENT_POINTS.badminton);
  test('two level: head-to-head, even against a better games difference', () => {
    const ms = [mt('badminton', 'A', 'B', 2, 1), mt('badminton', 'B', 'C', 2, 0), mt('badminton', 'B', 'D', 2, 0),
      mt('badminton', 'C', 'A', 2, 0), mt('badminton', 'A', 'D', 2, 1), mt('badminton', 'D', 'C', 2, 1)];
    const rows = table(ms, 'badminton', bwf());
    assert.equal(ids(rows).slice(0, 2), 'AB'); // B is +3 games, A 0 — but A beat B
    assert.equal(ids(table(ms, 'badminton', defaultStandingsConfig('badminton'))).slice(0, 2), 'AB', 'legacy h2h agrees here');
  });
  test('three level: games difference, NOT the head-to-head mini-league', () => {
    // A beat B and C; B beat C — but C has the best games difference.
    const ms = [mt('badminton', 'A', 'B', 2, 1), mt('badminton', 'A', 'C', 2, 1), mt('badminton', 'B', 'C', 2, 1),
      mt('badminton', 'D', 'A', 2, 0), mt('badminton', 'E', 'A', 2, 0), mt('badminton', 'B', 'D', 2, 0), mt('badminton', 'E', 'B', 2, 0),
      mt('badminton', 'C', 'D', 2, 0), mt('badminton', 'C', 'E', 2, 0), mt('badminton', 'E', 'D', 2, 0)];
    const tied = (rows: { teamId: string }[]) => ids(rows).replace(/[DE]/g, '');
    assert.equal(tied(table(ms, 'badminton', bwf())), 'CBA');
    assert.equal(tied(table(ms, 'badminton', defaultStandingsConfig('badminton'))), 'ABC', 'legacy: head-to-head first');
  });
  test('three level, two still level after games & points → head-to-head between those two', () => {
    const p = (h: number, a: number) => ({ points: { home: h, away: a } });
    const names = { B: 'Zed', C: 'Cat' };
    const ms = [mt('badminton', 'A', 'B', 2, 0, { u: p(42, 30), names }), mt('badminton', 'B', 'C', 2, 1, { u: p(60, 55), names }),
      mt('badminton', 'C', 'A', 2, 1, { u: p(60, 58), names }), mt('badminton', 'A', 'D', 2, 0, { u: p(42, 20), names }),
      mt('badminton', 'B', 'D', 2, 0, { u: p(42, 25), names }), mt('badminton', 'C', 'D', 2, 1, { u: p(63, 50), names })];
    const rows = table(ms, 'badminton', bwf());
    assert.equal(ids(rows), 'ABCD', 'B beat C, so B is above C');
    assert.ok(rows.every((r) => !r.lots));
    // Without the 2-team branch they would be drawn by lot (shown by name: Cat first).
    const flat = table(ms, 'badminton', cfgOf('badminton', { tieBreak: 'diff,pointsDiff,lots' }));
    assert.equal(ids(flat), 'ACBD');
    assert.deepEqual(flat.filter((r) => r.lots).map((r) => r.teamId), ['C', 'B']);
  });
});

describe('FIBA mini-league with restart', () => {
  // A beat B 70-60, B beat C 66-60, C beat A 80-78; all beat D 60-50. Level on
  // FIBA points and h2h points; h2h difference A +8, B −4, C −4 → A first; B and
  // C restart → B beat C. The legacy chain (h2h, overall diff, overall for)
  // reads A, then C over B on overall points scored (200 vs 186).
  const ms = [mt('basketball', 'A', 'B', 70, 60), mt('basketball', 'B', 'C', 66, 60), mt('basketball', 'C', 'A', 80, 78),
    mt('basketball', 'A', 'D', 60, 50), mt('basketball', 'B', 'D', 60, 50), mt('basketball', 'C', 'D', 60, 50)];
  test('FIBA preset: A, B, C', () => {
    const rows = table(ms, 'basketball', cfgOf('basketball', NEW_TOURNAMENT_POINTS.basketball));
    assert.equal(ids(rows), 'ABCD');
    assert.deepEqual(pts(rows), { A: 5, B: 5, C: 5, D: 3 });
  });
  test('legacy chain: A, C, B', () => {
    assert.equal(ids(table(ms, 'basketball', defaultStandingsConfig('basketball'))), 'ACBD');
  });
});

describe('UEFA / FIFA 2026: head-to-head first, then overall', () => {
  test('head-to-head beats a better goal difference; the "goal difference first" preset reverses it', () => {
    // A and B on 4 points: B won their match 1-0, A has the better goal difference (+5 vs 0).
    const ms2 = [mt('football', 'B', 'A', 1, 0), mt('football', 'A', 'X', 6, 0), mt('football', 'X', 'B', 1, 0),
      mt('football', 'A', 'Y', 0, 0), mt('football', 'B', 'Y', 0, 0)];
    assert.equal(ids(table(ms2, 'football', cfgOf('football', NEW_TOURNAMENT_POINTS.football))).slice(0, 2), 'BA');
    assert.equal(ids(table(ms2, 'football', cfgOf('football', presetFmt('football', 'fifa22')))).slice(0, 2), 'AB');
  });
  test('after the h2h criteria, overall criteria do NOT restart head-to-head', () => {
    // A, B, C cyclic 1-0 (h2h all level). vs D: A 5-0, B 2-0, C 3-1 → A on GD;
    // B and C level on GD (+2) → goals scored: C 4, B 3 → C (UEFA), though B beat C.
    const ms = [mt('football', 'A', 'B', 1, 0), mt('football', 'B', 'C', 1, 0), mt('football', 'C', 'A', 1, 0),
      mt('football', 'A', 'D', 5, 0), mt('football', 'B', 'D', 2, 0), mt('football', 'C', 'D', 3, 1)];
    assert.equal(ids(table(ms, 'football', cfgOf('football', NEW_TOURNAMENT_POINTS.football))), 'ACBD');
    assert.equal(ids(table(ms, 'football', cfgOf('football', { ...NEW_TOURNAMENT_POINTS.football, tieRestart: true }))), 'ABCD');
  });
});

describe('FIVB table: wins first, then points, set ratio, point ratio', () => {
  test('more wins ranks above equal points', () => {
    // A beats B 3-2 and C 3-2 (2 wins, 4 pts); B beats C 3-0 (1 win, 3+1 = 4 pts).
    const ms = [mt('volleyball', 'A', 'B', 3, 2), mt('volleyball', 'A', 'C', 3, 2), mt('volleyball', 'B', 'C', 3, 0)];
    const rows = table(ms, 'volleyball', cfgOf('volleyball', NEW_TOURNAMENT_POINTS.volleyball));
    assert.deepEqual(pts(rows), { A: 4, B: 4, C: 1 }); // C: 1 for the 2-3 loss
    assert.equal(ids(rows), 'ABC');
    assert.equal(ids(table(ms, 'volleyball', cfgOf('volleyball', { ...NEW_TOURNAMENT_POINTS.volleyball, rankBy: 'points' }))), 'BAC',
      'by points alone B (sets 5:3) would edge A (6:4) on set ratio');
  });
  test('old volleyball tournament: 2-1-0 by result, unchanged', () => {
    const ms = [mt('volleyball', 'A', 'B', 3, 2), mt('volleyball', 'A', 'C', 3, 2), mt('volleyball', 'B', 'C', 3, 0)];
    assert.deepEqual(pts(table(ms, 'volleyball', cfgOf('volleyball', undefined))), { A: 4, B: 2, C: 0 });
  });
});

describe('D1: new tournaments store the body preset; old ones read as before', () => {
  test('every sport with a body preset stores it; chess / golf store nothing', () => {
    const f = newTournamentFormats(['volleyball', 'kabaddi', 'chess', 'golf'] as SportId[], {});
    assert.equal(f.volleyball?.setPoints, '3-0:3/0,3-1:3/0,3-2:2/1,2-0:3/0,2-1:2/1');
    assert.equal(f.volleyball?.rankBy, 'wins');
    assert.deepEqual([f.kabaddi?.winPoints, f.kabaddi?.drawPoints, f.kabaddi?.lossBonusMargin, f.kabaddi?.lossBonusPoints], [5, 3, 7, 1]);
    assert.equal(f.chess, undefined);
    assert.equal(f.golf, undefined);
    assert.ok(!Object.values(f.volleyball ?? {}).includes(''), 'no empty keys stored');
  });
  test('the organiser\'s keys win over the preset', () => {
    assert.equal(newTournamentFormats(['kabaddi'], { kabaddi: { winPoints: 2 } }).kabaddi?.winPoints, 2);
  });
  test('a stored format with no rule keys reads exactly the legacy default', () => {
    for (const sp of ['football', 'basketball', 'volleyball', 'kabaddi', 'badminton', 'tennis', 'tabletennis', 'cricket', 'chess', 'carrom'] as SportId[]) {
      assert.deepEqual(standingsConfigFromFormat(sp, { preset: 'x' }), defaultStandingsConfig(sp), sp);
      assert.deepEqual(standingsConfigFromFormat(sp, undefined), defaultStandingsConfig(sp), sp);
    }
  });
  test('the active preset is recognised; Simple 2-1-0 clears every margin rule', () => {
    assert.equal(activePreset('volleyball', NEW_TOURNAMENT_POINTS.volleyball)?.id, 'fivb');
    assert.equal(pointsSystemLabel('kabaddi', NEW_TOURNAMENT_POINTS.kabaddi), 'PKL 5-3-1');
    assert.equal(pointsSystemLabel('kabaddi', undefined), 'Simple 2-1-0', 'a legacy table is the simple system');
    const simple = { ...NEW_TOURNAMENT_POINTS.volleyball, ...presetFmt('volleyball', 'simple') };
    const c = cfgOf('volleyball', simple);
    assert.deepEqual([c.win, c.draw, c.loss, c.setPoints, c.rankBy, c.lossBonus, c.pairOrder, c.restart], [2, 1, 0, undefined, undefined, undefined, undefined, undefined]);
    assert.equal(pointsSystemLabel('volleyball', { winPoints: 3, lossPoints: 1 }), '3/1/1');
  });
  test('presets per sport include the body system and Simple; chess has none', () => {
    assert.deepEqual(standingsPresets('football').map((p) => p.id), ['fifa', 'fifa22', 'simple']);
    assert.equal(standingsPresets('football').at(-1)!.label, 'Simple 3-1-0');
    assert.deepEqual(standingsPresets('chess'), []);
  });
});

describe('plugin units', () => {
  test('tennis: games over the sets; a match tiebreak counts as one game', () => {
    const s = { sets: [[6, 4], [4, 6], [10, 8]], tb: [null, null, [10, 8]], games: { home: 0, away: 0 }, finalSetTiebreak: 10, setsToWin: 2, events: [] };
    assert.deepEqual(tennisUnits(s as never), { games: { home: 11, away: 10 } });
  });
  test('padel: the match tiebreak (stored 0-0 games) counts as one game to its winner', () => {
    const s = { sets: [[6, 3], [3, 6], [0, 0]], tb: [null, null, [7, 10]], games: { home: 0, away: 0 }, matchTbDecider: true, setsToWin: 2, events: [] };
    assert.deepEqual(padelUnits(s as never), { games: { home: 9, away: 10 } });
  });
  test('volleyball: rally points over every set', () => {
    const s = { sets: [[25, 20], [23, 25], [15, 10]], current: { home: 0, away: 0 } };
    assert.deepEqual(volleyballUnits(s as never), { points: { home: 63, away: 55 } });
  });
});
