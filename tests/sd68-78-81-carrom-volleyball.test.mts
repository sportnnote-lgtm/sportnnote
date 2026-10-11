/**
 * SD-68 (CR-03 / CR-07) carrom ICF score sheet + penalty board, SD-78 (CR-04)
 * break and slams (delivered by SD-117c — pinned here), SD-81 (VB-07 / VB-08)
 * volleyball "Detailed stats": attack attempts → efficiency, reception, box
 * columns, keyed coverage, Best attacker.
 * Every reducer change is a new action / optional key — old logs keep their
 * exact state (REVIEW Decision 8).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as carrom from '../src/sports/carrom/engine.ts';
import { carromStatTotals, carromSideRecord } from '../src/sports/carrom/totals.ts';
import { carromBox, volleyballBox } from '../src/sports/boxSources.ts';
import * as vb from '../src/sports/volleyball/engine.ts';
import * as vd from '../src/sports/volleyball/detail.ts';
import { volleyballStatTotals } from '../src/sports/volleyball/totals.ts';
import { volleyballStats } from '../src/sports/volleyball/stats.ts';
import { aggregateValue, rankPlayers, statDefIn, validateSchema } from '../src/sports/statSchema.ts';
import { buildBoxTable } from '../src/sports/boxScore.ts';
import { pointInputs, correctionActions } from '../src/sports/rallyEdit.ts';
import type { ScoreAction } from '../src/sports/types.ts';
import type { StatLine } from '../src/core/types.ts';

type Side = 'home' | 'away';
const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');

/* ------------------------------------------------------------ carrom -- */

const B = (side: Side, coins: number, queen = false, extra: Record<string, unknown> = {}) => ({ type: 'BOARD', side, payload: { coins, queen, ...extra } });
const PEN = (side: Side) => ({ type: 'BOARD', side, payload: { coins: 0, queen: false, penalty: true } });
const cplay = (acts: Array<{ type: string; side?: Side; payload?: Record<string, unknown> }>, cfg?: Record<string, unknown>) =>
  acts.reduce((s, a) => carrom.reducer(s, a), carrom.init(cfg));

describe('SD-68 (CR-07) · carrom penalty board', () => {
  test('3 to the side picked; a board played (limit + break) but not won, no Queen, no slam', () => {
    let s = cplay([{ type: 'FIRST_BREAK', payload: { side: 'home' } }, B('home', 4), PEN('away')]);
    assert.deepEqual(s.current, { home: 4, away: 3 });
    assert.equal(s.boardsInGame, 2);
    assert.deepEqual(s.boards[1], { winner: 'away', coins: 0, queen: false, points: 3, game: 1, penalty: true });
    assert.equal(carrom.nextBreaker(s), 'home'); // the break moves on past a penalty board
    // coins / Queen / slam on a penalty board are ignored
    s = carrom.reducer(s, { type: 'BOARD', side: 'away', payload: { coins: 9, queen: true, slam: 'white', penalty: true } });
    assert.deepEqual([s.current.away, s.boards[2].queen, s.boards[2].slam, s.boards[2].coins], [6, false, undefined, 0]);
    const rec = carromSideRecord(s, 'away');
    assert.deepEqual([rec.points, rec.boards, rec.queens, rec.whiteSlams, rec.boardsPlayed], [6, 0, 0, 0, 3]);
  });
  test('a penalty board can win the game (capped at 25); boardCloses knows it', () => {
    const s = cplay([B('home', 9, true), B('home', 9), PEN('home')]);
    assert.equal(s.games.length, 0);
    assert.deepEqual(carrom.boardCloses(s, 'home', 0, false, true), { kind: 'game', game: 1, winner: 'home' });
    const t = carrom.reducer(s, PEN('home'));
    assert.deepEqual(t.games, [[25, 0]]); // 12 + 9 + 3 = 24, + 3 → written 25
    assert.deepEqual(carrom.creditedPoints(t), [12, 9, 3, 1]);
  });
  test('the board editor keeps a penalty board; live credits skip it as a board won', () => {
    const by = [{ side: 'away' as const, id: 'a1', name: 'A1' }];
    const s = carrom.reducer(carrom.init(), { type: 'BOARD', side: 'away', payload: { coins: 0, queen: false, penalty: true }, attribution: { playerId: 'a1', playerName: 'A1' } } as never);
    assert.deepEqual(carrom.boardInputs(s), [{ side: 'away', coins: 0, queen: false, penalty: true, by }]);
    const same = carrom.reducer(s, { type: 'EDIT_LOG', payload: { boards: carrom.boardInputs(s) } });
    assert.deepEqual(same.boards, s.boards);
    assert.deepEqual(carrom.liveCredits(s).get('a1'), { name: 'A1', points: 3, boards: 0, queens: 0 });
    const t = carromStatTotals(s, { players: { home: [{ id: 'h1', name: 'H1' }], away: [{ id: 'a1', name: 'A1' }] } } as never);
    assert.deepEqual([t.a1.stats.points, t.a1.stats.boards], [3, 0]);
    // box: penalty points count, the board doesn't
    const team = carromBox(s).data('all').away.teamStats!;
    assert.deepEqual([team.points, team.boards], [3, 0]);
  });
  test('old logs: no penalty key anywhere (state unchanged)', () => {
    const s = cplay([B('home', 5), B('away', 3, true)]);
    assert.ok(s.boards.every((b) => !('penalty' in b)));
  });
});

describe('SD-68 (CR-03) · ICF score sheet', () => {
  test('per game: # · breaker · winner · coins · Queen · pts · running total', () => {
    const s = cplay([
      { type: 'FIRST_BREAK', payload: { side: 'away' } },
      B('home', 9, true, { queenBy: 'winner', slam: 'black' }), B('away', 3, false, { queenBy: 'loser' }), PEN('home'), B('home', 2),
    ]);
    const [g] = carrom.scoreSheet(s);
    assert.equal(g.game, 1);
    assert.equal(g.done, false);
    assert.deepEqual(g.rows.map((r) => [r.n, r.breaker, r.winner, r.coins, r.queen ?? null, r.pts, `${r.total.home}-${r.total.away}`, !!r.penalty]), [
      [1, 'away', 'home', 9, 'winner', 12, '12-0', false],
      [2, 'home', 'away', 3, 'loser', 3, '12-3', false],
      [3, 'away', 'home', 0, null, 3, '15-3', true],
      [4, 'home', 'home', 2, null, 2, '17-3', false],
    ]);
    assert.equal(g.rows[0].slam, 'black');
    assert.equal(g.rows[0].queenCounted, true);
    assert.deepEqual(g.score, [17, 3]);
  });
  test('final row = the game score (capped); games after it start at 0; no toss → breaker null', () => {
    const s = cplay([B('home', 9, true), B('home', 9, true), B('home', 4, true), B('away', 2)]);
    const sheet = carrom.scoreSheet(s);
    assert.equal(sheet.length, 2);
    assert.deepEqual(sheet[0].score, [25, 0]);
    assert.equal(sheet[0].rows[2].total.home, 25);
    assert.equal(sheet[0].rows[2].queenCounted, false); // at 24 the Queen no longer counts
    assert.equal(sheet[0].winner, 'home');
    assert.deepEqual(sheet[1].rows[0].total, { home: 0, away: 2 });
    assert.equal(sheet[1].rows[0].breaker, null);
  });
  test('tie-break boards after the board limit are flagged', () => {
    const s = cplay([B('home', 1), B('away', 1)], { maxBoards: 2 });
    const t = carrom.reducer(s, B('home', 2));
    assert.equal(carrom.scoreSheet(t)[0].rows[2].tieBreak, true);
  });
  test('the live view shows the score sheet; penalty + score-sheet wiring in the controls', () => {
    const c = src('sports/carrom/index.tsx');
    assert.ok(/<ScoreSheet /.test(c));
    assert.ok(/Penalty board/.test(c));
    assert.ok(/penalty: true/.test(c));
  });
});

describe('SD-78 (CR-04) · break + slams — delivered by SD-117c', () => {
  test('toss, alternate per board and per game; slam chip follows the breaker', () => {
    const s = cplay([{ type: 'FIRST_BREAK', payload: { side: 'home' } }, B('home', 9, false, { slam: 'white' })]);
    assert.equal(carrom.nextBreaker(s), 'away');
    assert.equal(carrom.slamFor('home', 'home'), 'white');
    assert.equal(carromSideRecord(s, 'home').whiteSlams, 1);
    assert.equal(carromSideRecord(s, 'home').boardBreaksWon, 1);
  });
});

/* -------------------------------------------------------- volleyball -- */

const H = [{ id: 'h1', fullName: 'Asha' }, { id: 'h2', fullName: 'Chitra' }];
const A = [{ id: 'a1', fullName: 'Bela' }, { id: 'a2', fullName: 'Dia' }];
const vplay = (acts: ScoreAction[], cfg?: Record<string, unknown>) => acts.reduce(vb.reducer, vb.init(cfg));
const ON: ScoreAction = { type: 'SET_DETAIL', payload: { detail: true } };
const OFF: ScoreAction = { type: 'SET_DETAIL', payload: { detail: false } };
const kill = (side: Side, p: { id: string; fullName: string }) => vb.outcomeAction('attack', side, p);
const out = (pointTo: Side, attacker: { id: string; fullName: string }) => vb.outcomeAction('opperror', pointTo, undefined, { err: 'attackout', by: attacker });
const block = (side: Side, p: { id: string; fullName: string }) => vb.outcomeAction('block', side, p);
const det = (kind: vd.VbDetailKind, side: Side, p: { id: string; fullName: string }, q?: vd.ReceptionGrade): ScoreAction =>
  ({ type: 'VB_DETAIL', side, payload: { kind, player: { playerId: p.id, playerName: p.fullName }, ...(q ? { q } : {}) } });
const ctx = { players: { home: H.map((p) => ({ id: p.id, name: p.fullName })), away: A.map((p) => ({ id: p.id, name: p.fullName })) } } as never;

describe('SD-81 · detail switch', () => {
  test('off by default; old states carry neither key', () => {
    const s = vplay([kill('home', H[0]), block('away', A[0])]);
    assert.equal('detail' in s, false);
    assert.equal('vd' in s, false);
    assert.equal(vd.detailOn(s), false);
    assert.equal(vd.detailTracked(s), false);
  });
  test('SET_DETAIL anchors to set + rallies played; applies from the next point', () => {
    let s = vplay([kill('home', H[0]), ON]);
    assert.deepEqual(s.detail, [{ set: 1, at: 1, on: true }]);
    assert.equal(vd.coveredAt(s, 1, 0), false);
    assert.equal(vd.coveredAt(s, 1, 1), true);
    s = vb.reducer(s, ON); // no-op when already on
    assert.equal(s.detail!.length, 1);
    assert.deepEqual(vb.init({ detail: true }).detail, [{ set: 1, at: 0, on: true }]);
  });
  test('VB_DETAIL ignores bad input; a second "blocked" for the same block replaces it', () => {
    let s = vplay([ON, block('home', H[1])]);
    s = vb.reducer(s, det('blocked', 'away', A[0]));
    s = vb.reducer(s, det('blocked', 'away', A[1]));
    assert.deepEqual(s.vd, [{ kind: 'blocked', side: 'away', set: 1, at: 1, playerName: 'Dia', playerId: 'a2' }]);
    assert.equal(vb.reducer(s, { type: 'VB_DETAIL', side: 'home', payload: { kind: 'reception', q: 'great', player: { playerName: 'Asha' } } }), s);
    assert.equal(vb.reducer(s, { type: 'VB_DETAIL', side: 'home', payload: { kind: 'inplay' } }), s);
  });
});

/** A detailed match: Asha 3 kills, 1 out, 1 blocked, 2 in play = 7 attempts. */
function detailedMatch() {
  return vplay([
    kill('home', H[0]), // before the switch — not an attempt we saw
    ON,
    kill('home', H[0]), kill('home', H[0]), kill('home', H[0]),
    det('inplay', 'home', H[0]), det('inplay', 'home', H[0]),
    out('away', H[0]), // Asha hit out → point to away
    block('away', A[0]), det('blocked', 'home', H[0]),
    det('inplay', 'away', A[1]), kill('away', A[1]),
    det('reception', 'home', H[1], 'perfect'), det('reception', 'home', H[1], 'good'), det('reception', 'home', H[1], 'poor'),
  ]);
}

describe('SD-81 · attack tally + efficiency', () => {
  test('kills / errors / blocked / in play per attacker (only rallies with detail on)', () => {
    const s = detailedMatch();
    const t = vd.detailTally(s);
    const asha = t.get('home|Asha')!;
    assert.deepEqual([asha.attackAttempts, asha.attackKills, asha.attackErrors, asha.attacksBlocked], [7, 3, 1, 1]);
    assert.equal(vd.attackEfficiency(asha), (3 - 1 - 1) / 7);
    const dia = t.get('away|Dia')!;
    assert.deepEqual([dia.attackAttempts, dia.attackKills], [2, 1]);
    const chitra = t.get('home|Chitra')!;
    assert.deepEqual([chitra.receptions, chitra.receptionsPerfect, chitra.receptionsPositive], [3, 1, 2]);
  });
  test('switching off stops counting', () => {
    const s = vplay([ON, kill('home', H[0]), OFF, kill('home', H[0])]);
    assert.equal(vd.detailTally(s).get('home|Asha')!.attackKills, 1);
    assert.equal(vd.detailOn(s), false);
    assert.equal(vd.detailTracked(s), true);
  });
  test('a timeline correction (EDIT_LOG) keeps the switch and the entries', () => {
    const s = detailedMatch();
    const pts = pointInputs(s.events);
    const next = correctionActions(pts, pts, () => undefined).reduce(vb.reducer, s);
    assert.deepEqual(next.detail, s.detail);
    assert.deepEqual(next.vd, s.vd);
  });
});

describe('SD-81 · statTotals (keyed coverage)', () => {
  test('a detailed match writes the attack keys on every line; receptions when graded', () => {
    const t = volleyballStatTotals(detailedMatch(), ctx);
    assert.deepEqual(['attackAttempts', 'attackKills', 'attackErrors', 'attacksBlocked'].map((k) => t.h1.stats[k]), [7, 3, 1, 1]);
    assert.deepEqual(['attackAttempts', 'attackKills'].map((k) => t.a2.stats[k]), [2, 1]);
    assert.equal(t.a1.stats.attackAttempts, 0);
    assert.deepEqual([t.h2.stats.receptions, t.h2.stats.receptionsPerfect, t.h2.stats.receptionsPositive], [3, 1, 2]);
    assert.equal(t.h1.stats.receptions, 0);
  });
  test('an old / undetailed match carries none of the keys ("not tracked")', () => {
    const t = volleyballStatTotals(vplay([vb.outcomeAction('attack', 'home', H[0]), out('away', H[0])]), ctx);
    for (const line of Object.values(t)) for (const k of [...vd.VB_ATTACK_KEYS, ...vd.VB_RECEPTION_KEYS]) assert.equal(k in line.stats, false, k);
  });
});

const line = (playerId: string, stats: Record<string, number>, matchId: string): StatLine =>
  ({ id: `${playerId}-${matchId}`, playerId, sport: 'volleyball', matchId, stats } as unknown as StatLine);

describe('SD-81 · schema: efficiency, Best attacker, career', () => {
  const sch = volleyballStats as never;
  test('schema valid; Best attacker ranks by attack efficiency', () => {
    assert.doesNotThrow(() => validateSchema(volleyballStats as never));
    const a = volleyballStats.awards.find((x) => x.tournamentLabel === 'Best attacker')!;
    assert.equal(a.rankBy, 'attackEff');
    assert.ok(volleyballStats.leaders.includes('attackEff'));
  });
  test('efficiency over detailed lines only; older lines are not tracked', () => {
    const det1 = line('p', { attackAttempts: 20, attackKills: 10, attackErrors: 2, attacksBlocked: 3, attackPoints: 10 }, 'm1');
    const old = line('p', { attackPoints: 12, points: 14 }, 'm2');
    const eff = aggregateValue(sch, statDefIn(sch, 'attackEff')!, [det1, old]);
    assert.deepEqual([eff.text, eff.value], ['25.0%', 25]);
    assert.equal(aggregateValue(sch, statDefIn(sch, 'attackSuccess')!, [det1, old]).text, '50.0%');
    assert.equal(aggregateValue(sch, statDefIn(sch, 'attackEff')!, [old]).tracked, false);
  });
  test('ranking: min 10 attempts; higher efficiency first', () => {
    const lines = [
      line('x', { attackAttempts: 12, attackKills: 6, attackErrors: 1, attacksBlocked: 1 }, 'm1'), // 33.3
      line('y', { attackAttempts: 30, attackKills: 15, attackErrors: 2, attacksBlocked: 1 }, 'm1'), // 40.0
      line('z', { attackAttempts: 4, attackKills: 4, attackErrors: 0, attacksBlocked: 0 }, 'm1'), // 100, too few
    ];
    const r = rankPlayers(sch, statDefIn(sch, 'attackEff')!, lines);
    assert.deepEqual(r.map((x) => x.playerId).slice(0, 2), ['y', 'x']);
    assert.ok(!r.some((x) => x.playerId === 'z'));
  });
});

describe('SD-81 · box score columns', () => {
  test('detailed match: ATT / EFF per player and team; SE / ERR from named faults', () => {
    const s = vb.reducer(detailedMatch(), vb.outcomeAction('serveerror', 'home', undefined, { by: A[0] }));
    const data = volleyballBox(s, { homeRoster: H as never, awayRoster: A as never }).data('all');
    const table = buildBoxTable(volleyballStats as never, data);
    const cols = table.columns.map((c) => c.abbr);
    assert.deepEqual(cols, ['PTS', 'ATK', 'ACE', 'BLK', 'ATT', 'EFF', 'SE', 'ERR']);
    const asha = table.home.rows.find((r) => r.name === 'Asha')!;
    assert.equal(asha.cells[cols.indexOf('ATT')], '7');
    assert.equal(asha.cells[cols.indexOf('EFF')], '14.3%');
    assert.equal(asha.cells[cols.indexOf('ERR')], '1');
    const chitra = table.home.rows.find((r) => r.name === 'Chitra');
    assert.ok(chitra, 'a player with receptions only still gets a row');
    const bela = table.away.rows.find((r) => r.name === 'Bela')!;
    assert.equal(bela.cells[cols.indexOf('SE')], '1');
  });
  test('an old match hides the new columns (listed as not tracked)', () => {
    const s = vplay([kill('home', H[0]), block('away', A[0])]);
    const table = buildBoxTable(volleyballStats as never, volleyballBox(s).data('all'));
    assert.deepEqual(table.columns.map((c) => c.abbr), ['PTS', 'ATK', 'ACE', 'BLK']);
    assert.ok(table.hidden.includes('Attack attempts'));
  });
  test('the controls offer the switch; wired only for volleyball', () => {
    const c = src('sports/volleyball/index.tsx');
    assert.ok(/serve: true, detail: true/.test(c));
    assert.ok(/<VolleyballDetailRow /.test(c));
    const r = src('sports/volleyball/DetailRow.tsx');
    assert.ok(/Who was blocked\?/.test(r) && /Attack in play/.test(r) && /Reception/.test(r));
  });
});
