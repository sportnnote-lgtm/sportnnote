/**
 * SD-36 (chess career: wins by method, unbeaten run), SD-67 (more results:
 * double forfeit, dead position, adjudication, arbiter; exact time control),
 * SD-77 (wall chart / crosstable) and SD-85 (ratings: seeding, ARO, TPR —
 * FIDE B.02 table 8.1(a), C.07 art. 10).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { init, reducer, points, resultString, scoreFor, resultSentence, exactTimeControl, DECISIVE, DRAWN } from '../src/sports/chess/engine.ts';
import { winMethodKey } from '../src/sports/chess/stats.ts';
import { statSchema } from '../src/sports/statSchemas.ts';
import { careerSections, bestUnbeatenRun, bestWinRun } from '../src/data/career.ts';
import { teamStandings, standingsConfigFromFormat, isChessDoubleForfeit, isChessForfeit, FIDE_SWISS_ORDER, type TeamStanding } from '../src/data/standings.ts';
import { sideResults } from '../src/data/appearances.ts';
import { resultFor } from '../src/data/teamStats.ts';
import { dpFor, performance, ratingSeedOrder, ratingListFor, parseRating, validFideId, cleanRatings, chessRatingsOf, ratingsText } from '../src/data/chessRatings.ts';
import { buildCrosstable, playerLine, entrantPlayers } from '../src/data/chessCrosstable.ts';
import type { Match, StatLine } from '../src/core/types.ts';

const res = (s: ReturnType<typeof init>, winner: string, method?: string) =>
  reducer(s, { type: 'RESULT', payload: { winner, method } });

describe('SD-67 engine', () => {
  test('old fixtures init exactly as before (no tcExact key)', () => {
    assert.deepEqual(init({ timeControl: 'rapid' }), { white: 'home', timeControl: 'rapid', ended: false, seq: 0 });
    assert.deepEqual(init({ timeControl: 'rapid', tcBase: 0, tcInc: 10 }), { white: 'home', timeControl: 'rapid', ended: false, seq: 0 });
  });
  test('exact time control 90+30', () => {
    assert.equal(init({ timeControl: 'classical', tcBase: 90, tcInc: 30 }).tcExact, '90+30');
    assert.equal(exactTimeControl(5, 0), '5+0');
    assert.equal(exactTimeControl(undefined, 3), '');
  });
  test('dead position is a draw; adjudication and arbiter can be either', () => {
    assert.ok(DRAWN.includes('dead-position') && !DECISIVE.includes('dead-position'));
    for (const m of ['adjudication', 'arbiter'] as const) { assert.ok(DRAWN.includes(m)); assert.ok(DECISIVE.includes(m)); }
    assert.equal(res(init(), 'draw', 'dead-position').ended, true);
    assert.equal(res(init(), 'home', 'dead-position').ended, false);
    assert.equal(res(init(), 'away', 'arbiter').winner, 'away');
    assert.equal(res(init(), 'draw', 'adjudication').winner, 'draw');
  });
  test('double forfeit: 0-0, only as a no-winner result', () => {
    const s = res(init(), 'draw', 'double-forfeit');
    assert.equal(s.ended, true);
    assert.deepEqual(points(s), { home: 0, away: 0 });
    assert.equal(resultString(s), '0-0');
    assert.equal(res(init(), 'home', 'double-forfeit').ended, false);
    assert.equal(scoreFor('home', 'draw', 'double-forfeit'), '0-0');
    assert.match(resultSentence('home', 'draw', 'A', 'B', 'double-forfeit'), /^0-0: double forfeit/);
    assert.equal(resultSentence('home', 'away', 'A', 'B', 'arbiter'), "0-1: B beat A (arbiter's decision)");
  });
  test('an ordinary draw still scores ½-½', () => {
    const s = res(init(), 'draw', 'agreement');
    assert.deepEqual(points(s), { home: 0.5, away: 0.5 });
    assert.equal(resultString(s), '½-½');
  });
});

let seq = 0;
function game(home: string, away: string, r: 1 | 0 | 0.5 | 'dff', o: { stage?: string; byes?: string[]; white?: 'home' | 'away'; method?: string; status?: string } = {}): Match {
  const dff = r === 'dff';
  const winner = dff ? 'draw' : r === 1 ? 'home' : r === 0 ? 'away' : 'draw';
  const method = dff ? 'double-forfeit' : o.method;
  return {
    id: `x${++seq}`, sport: 'chess', status: (o.status ?? 'completed') as Match['status'], startsAt: '',
    winner: o.status && o.status !== 'completed' ? undefined : winner,
    stage: o.stage, byes: o.byes,
    homeTeam: { id: home, name: home.toUpperCase() }, awayTeam: { id: away, name: away.toUpperCase() },
    state: o.status && o.status !== 'completed' ? null : { white: o.white ?? 'home', timeControl: 'rapid', winner, ...(method ? { method } : {}), ended: true, seq: 1 },
  } as unknown as Match;
}
const row = (t: TeamStanding[], id: string) => t.find((r) => r.teamId === id)!;

describe('SD-67 double forfeit in the table', () => {
  test('0 points each, two forfeit losses, not played, not a draw', () => {
    const m = game('a', 'b', 'dff', { stage: 'swiss1' });
    assert.ok(isChessDoubleForfeit(m));
    assert.ok(isChessForfeit(m));
    const cfg = standingsConfigFromFormat('chess', { tieBreak: FIDE_SWISS_ORDER.join(',') });
    const t = teamStandings([m, game('c', 'd', 1, { stage: 'swiss1' })], 'chess', cfg);
    for (const id of ['a', 'b']) {
      const r = row(t, id);
      assert.equal(r.points, 0); assert.equal(r.played, 0); assert.equal(r.drawn, 0); assert.equal(r.forfeitLosses, 1);
      assert.deepEqual(r.games?.map((g) => [g.kind, g.result, g.points]), [['forfeit', 'loss', 0]]);
    }
    assert.ok(row(t, 'a').fide);
  });
  test('line results and the team record read it as a loss for both', () => {
    const m = game('a', 'b', 'dff');
    assert.deepEqual(sideResults({ sport: 'chess', status: 'completed', winner: 'draw', state: m.state }), { home: 'L', away: 'L' });
    assert.deepEqual(sideResults({ sport: 'chess', status: 'completed', winner: 'draw', state: { method: 'agreement' } }), { home: 'D', away: 'D' });
    assert.equal(resultFor(m, 'a'), 'L');
    assert.equal(resultFor(game('a', 'b', 0.5), 'a'), 'D');
  });
});

describe('SD-36 career', () => {
  const line = (id: string, date: string, result: StatLine['result'], stats: Record<string, number>): StatLine =>
    ({ id, playerId: 'p', matchId: `m${id}`, sport: 'chess', date, won: result === 'W', result, stats } as unknown as StatLine);
  test('win method keys', () => {
    assert.equal(winMethodKey('checkmate'), 'winsMate');
    assert.equal(winMethodKey('resignation'), 'winsResign');
    assert.equal(winMethodKey('time'), 'winsTime');
    assert.equal(winMethodKey('arbiter'), 'winsOther');
    assert.equal(winMethodKey('forfeit'), undefined);
    assert.equal(winMethodKey(undefined), undefined);
  });
  test('wins by method section: hidden on old lines, coverage over all wins', () => {
    const schema = statSchema('chess')!;
    const old = [line('1', '2026-01-01', 'W', { games: 1, wins: 1 }), line('2', '2026-01-02', 'L', { games: 1, losses: 1 })];
    assert.equal(careerSections(schema, old).find((s) => s.id === 'how'), undefined);
    const lines = [...old,
      line('3', '2026-01-03', 'W', { games: 1, wins: 1, winsMate: 1 }),
      line('4', '2026-01-04', 'W', { games: 1, wins: 1, winsResign: 1 }),
      line('5', '2026-01-05', 'W', { games: 1, wins: 1, winsResign: 1 })];
    const how = careerSections(schema, lines).find((s) => s.id === 'how')!;
    const get = (k: string) => how.rows.find((r) => r.key === k)!;
    assert.equal(get('winsMate').value, '1');
    assert.equal(get('winsResign').value, '2');
    assert.equal(get('winsTime').value, '0');
    assert.deepEqual(get('winsResign').coverage, { tracked: 3, total: 4 });
  });
  test('unbeaten run counts draws, a loss breaks it, NR skipped', () => {
    const ls = [
      line('1', '2026-01-01', 'W', {}), line('2', '2026-01-02', 'D', {}), line('3', '2026-01-03', 'NR', {}),
      line('4', '2026-01-04', 'W', {}), line('5', '2026-01-05', 'L', {}), line('6', '2026-01-06', 'D', {}),
    ];
    assert.equal(bestUnbeatenRun(ls), 3);
    assert.equal(bestWinRun(ls), 1);
    assert.equal(bestUnbeatenRun([]), 0);
  });
});

describe('SD-85 ratings', () => {
  test('dp table (FIDE B.02 8.1a)', () => {
    assert.equal(dpFor(0.5), 0);
    assert.equal(dpFor(1), 800);
    assert.equal(dpFor(0), -800);
    assert.equal(dpFor(0.75), 193);
    assert.equal(dpFor(0.25), -193);
    assert.equal(dpFor(0.99), 677);
    assert.equal(dpFor(2 / 3), 125); // p rounds to .67
    assert.equal(dpFor(0.6), 72);
    assert.equal(dpFor(0.9), 366);
  });
  test('ARO rounds half up; unplayed and unrated are out; TPR = ARO + dp', () => {
    const p = performance([
      { oppRating: 1600, score: 1 }, { oppRating: 1701, score: 0.5 }, { oppRating: undefined, score: 1 },
      { oppRating: 2000, score: 1, unplayed: true },
    ]);
    assert.equal(p.games, 2);
    assert.equal(p.aro, 1651); // 1650.5 → 1651
    assert.equal(p.tpr, 1651 + 193);
    assert.equal(performance([{ score: 1 }]).tpr, undefined);
  });
  test('rating seed order: rating, unrated last, then name', () => {
    const r: Record<string, number | undefined> = { a: 1500, b: undefined, c: 1800, d: 1500, e: undefined };
    const n: Record<string, string> = { a: 'Zed', b: 'Bea', c: 'Cy', d: 'Abe', e: 'Ann' };
    assert.deepEqual(ratingSeedOrder(['a', 'b', 'c', 'd', 'e'], (id) => r[id], (id) => n[id]), ['c', 'd', 'a', 'e', 'b']);
  });
  test('lists, parsing, cleaning', () => {
    assert.equal(ratingListFor('classical'), 'standard');
    assert.equal(ratingListFor('untimed'), 'standard');
    assert.equal(ratingListFor('rapid'), 'rapid');
    assert.equal(ratingListFor('bullet'), 'blitz');
    assert.equal(parseRating('1650'), 1650);
    assert.equal(parseRating('99'), undefined);
    assert.equal(parseRating('4000'), undefined);
    assert.ok(validFideId('46616543'));
    assert.ok(!validFideId('12a'));
    assert.deepEqual(cleanRatings({ fideId: '5000', standard: '1700', rapid: '', blitz: 'x' }), { fideId: '5000', standard: 1700 });
    assert.equal(cleanRatings({ rapid: '' }), undefined);
    const p = { sportDetails: { chess: { ratings: { standard: 1850, rapid: 1790, fideId: '46616543' } } } };
    assert.equal(ratingsText(chessRatingsOf(p as never)), 'Standard 1850 · Rapid 1790 · FIDE ID 46616543');
  });
});

describe('SD-77 crosstable', () => {
  // 6 players, 3 rounds; round 3 has a double forfeit (e v f) and one game to play.
  const ms = [
    game('a', 'd', 1, { stage: 'swiss1', white: 'home' }),
    game('b', 'e', 0.5, { stage: 'swiss1', white: 'away' }),
    game('c', 'f', 0, { stage: 'swiss1', white: 'home', method: 'forfeit' }),
    game('a', 'b', 0.5, { stage: 'swiss2', white: 'away' }),
    game('f', 'c', 1, { stage: 'swiss2', white: 'home' }),
    game('d', 'e', 0, { stage: 'swiss2', white: 'home' }),
    game('e', 'f', 'dff', { stage: 'swiss3' }),
    game('a', 'c', 1, { stage: 'swiss3', white: 'home' }),
    game('b', 'd', 1, { stage: 'swiss3', status: 'scheduled' }),
  ];
  const cfg = standingsConfigFromFormat('chess', { tieBreak: FIDE_SWISS_ORDER.join(',') });
  const rows = teamStandings(ms, 'chess', cfg, 'swiss');
  const ratings: Record<string, number> = { a: 2000, b: 1900, c: 1800, d: 1700, e: 1600 };
  const x = buildCrosstable({ rows, cfg, ratingOf: (id) => ratings[id], pending: new Set(['b|3', 'd|3']) });
  const r = (id: string) => x.rows.find((y) => y.teamId === id)!;
  const rk = (id: string) => r(id).rank;
  test('Swiss rows × rounds with opponent rank, colour, result', () => {
    assert.equal(x.swiss, true);
    assert.equal(x.cols, 3);
    assert.equal(x.rated, true);
    assert.deepEqual(r('a').cells.map((c) => c.text), [`${rk('d')}w1`, `${rk('b')}b½`, `${rk('c')}w1`]);
    assert.equal(r('c').cells[0].text, `${rk('f')}−`); // lost by forfeit
    assert.equal(r('f').cells[0].text, `${rk('c')}+`);
    assert.equal(r('e').cells[2].text, `${rk('f')}−`); // double forfeit: both −
    assert.equal(r('f').cells[2].text, `${rk('e')}−`);
    assert.equal(r('b').cells[2].text, '…');
    assert.equal(r('a').pointsText, '2½');
  });
  test('tie-break columns follow the chain', () => {
    assert.deepEqual(x.tbHeads.map((h) => h.label), ['BH-C1', 'BH', 'SB', 'PS', 'BWG']);
    assert.equal(r('a').tbs.length, 5);
  });
  test('ARO / TPR: played rated games only (forfeits, double forfeit and unrated f out)', () => {
    // a: d 1700 (1), b 1900 (½), c 1800 (1) → ARO 1800, p = 2.5/3 = .83 → +273
    assert.deepEqual([r('a').perf.aro, r('a').perf.tpr], [1800, 2073]);
    // c: R1 forfeit (out), R2 v f unrated (out), R3 lost to a 2000 → 2000 − 800
    assert.deepEqual([r('c').perf.aro, r('c').perf.tpr, r('c').perf.games], [2000, 1200, 1]);
    // e: R1 v b ½, R2 v d 1, R3 double forfeit (out) → ARO 1800, p .75 → +193
    assert.deepEqual([r('e').perf.aro, r('e').perf.tpr], [1800, 1993]);
    assert.match(playerLine(x, 'a'), /^R1 \d+w1 · R2 \d+b½ · R3 \d+w1 — 2½ pts · ARO 1800 · TPR 2073$/);
  });
  test('round robin grid', () => {
    const rr = [game('a', 'b', 1), game('b', 'c', 0.5), game('c', 'a', 0)];
    const rcfg = standingsConfigFromFormat('chess', {});
    const t = buildCrosstable({ rows: teamStandings(rr, 'chess', rcfg), cfg: rcfg });
    assert.equal(t.swiss, false);
    assert.equal(t.cols, 3);
    const a = t.rows.find((y) => y.teamId === 'a')!;
    assert.deepEqual(a.cells.map((c) => c.kind === 'self' ? '■' : c.text), ['■', '1', '1']);
    assert.equal(t.rated, false);
  });
  test('entrant → player from a one-player roster or the lines', () => {
    const lines = [{ id: 'l1', playerId: 'pc', matchId: ms[2].id, opponent: 'F', sport: 'chess' }] as unknown as StatLine[];
    const who = entrantPlayers([{ id: 'a', roster: ['pa'] }, { id: 'b', roster: ['x', 'y'] }], ms, lines);
    assert.equal(who.get('a'), 'pa');
    assert.equal(who.get('b'), undefined);
    assert.equal(who.get('c'), 'pc');
  });
});
