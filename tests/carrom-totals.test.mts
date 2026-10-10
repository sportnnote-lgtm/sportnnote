/**
 * SD-37 (CR-02) + SD-86 (CR-05) — carrom's absolute statTotals
 * (src/sports/carrom/totals.ts) and the career remainder (carrom/stats.ts).
 *
 * Actions are built as the controls dispatch them (index.tsx `record`): the
 * board's capped credit (`creditPoints`) to every player of the winning side —
 * attribution + the doubles partner's attribution2 — with boards / queens as
 * extras, and an optional `slam`. Covers: clean singles / doubles logs = live
 * credits on every undo prefix, capped points = the games' scores, games W-L,
 * boards played, slams, 25-0 games, AMEND corrections, older logs (finisher-
 * only, uncapped) healed by the sync, the unresolved-name safeguard, legacy
 * replay identity, and the career rows.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertContract, assertSameAsClean, amendRecord, toRecords, replay, liveSums, normalize, type TotalsSport } from './statTotalsHarness.mts';
import * as L from './racketLogs.mts';
import type { ScoreAction, StatTotalsContext } from '../src/sports/types.ts';
import * as carrom from '../src/sports/carrom/engine.ts';
import { carromStatTotals, carromSideRecord, creditedPlayers, CARROM_BOX_KEYS, CARROM_DERIVED_KEYS } from '../src/sports/carrom/totals.ts';
import { planStatSync } from '../src/data/statSync.ts';
import { careerSections } from '../src/data/career.ts';
import { statSchema, STAT_SCHEMAS } from '../src/sports/statSchemas.ts';
import { validateSchema } from '../src/sports/statSchema.ts';
import type { StatLine } from '../src/core/types.ts';

type Side = 'home' | 'away';
type Board = [Side, number, boolean, carrom.Slam?];
const SINGLES = { home: ['h1'], away: ['a1'] };
const DOUBLES = { home: ['h1', 'h2'], away: ['a1', 'a2'] };
const NAME = (id: string) => id.toUpperCase();
const sp = (players = SINGLES, config: Record<string, unknown> = {}, ctx: StatTotalsContext | undefined = L.ctxOf(players)): TotalsSport<carrom.CarromState> => ({
  name: 'carrom', init: carrom.init, reducer: carrom.reducer, statTotals: carromStatTotals, partial: true,
  derived: CARROM_DERIVED_KEYS, ctx, config,
});

/** The actions the controls dispatch for a list of boards. */
function play(list: Board[], players = SINGLES, config: Record<string, unknown> = {}): ScoreAction[] {
  let s = carrom.init({ playersPerSide: players.home.length, ...config });
  const out: ScoreAction[] = [];
  for (const [side, coins, queen, slam] of list) {
    const credit = carrom.creditPoints(coins, queen, s.current[side], s);
    const attr = (id: string) => ({ playerId: id, playerName: NAME(id), stat: 'points', by: credit, extra: { boards: 1, ...(queen ? { queens: 1 } : {}) } });
    const who = creditedPlayers(players[side].map((id) => ({ id })), s.perSide ?? 1);
    const a: ScoreAction = {
      type: 'BOARD', side, payload: { coins, queen, ...(slam ? { slam } : {}) },
      attribution: who[0] ? attr(who[0].id) : undefined,
      ...(who[1] ? { attribution2: attr(who[1].id) } : {}),
    };
    out.push(a);
    s = carrom.reducer(s, a);
  }
  return out;
}

// ICF bo3 25-18, 12-25, 25-20 (racketLogs), with a white and a black slam
const BO3: Board[] = L.CARROM_BOARDS.map(([w, c, q], i) => [w, c, q, i === 2 ? 'white' : i === 7 ? 'black' : undefined]);
// single game won 25-0: 12, 24, then the queen no longer counts → 25
const SWEEP: Board[] = [['home', 9, true, 'white'], ['home', 9, true], ['home', 1, true]];

describe('SD-37 · clean logs and undo', () => {
  for (const [label, players] of [['singles', SINGLES], ['doubles', DOUBLES]] as const) {
    test(`${label} bo3: owned keys = live credits on every prefix; capped points = game scores`, () => {
      const recs = toRecords(play(BO3, players, {}), 1);
      const t = assertContract(sp(players, { playersPerSide: players.home.length }), recs, { every: 1 });
      const s = replay(sp(players), recs);
      assert.deepEqual(s.games, [[25, 18], [12, 25], [25, 20]]);
      for (const id of [...players.home, ...players.away]) {
        const side: Side = id.startsWith('h') ? 'home' : 'away';
        const st = t[id].stats;
        // the game-winning boards are capped: 62 = 25 + 12 + 25, 63 = 18 + 25 + 20
        assert.equal(st.points, side === 'home' ? 62 : 63, id);
        assert.deepEqual([st.gamesWon, st.gamesLost], side === 'home' ? [2, 1] : [1, 2]);
        assert.equal(st.boardsPlayed, 16);
        assert.equal(st.boards, 8);
        assert.equal(st.queens, side === 'home' ? 2 : 1);
        assert.deepEqual([st.whiteSlams, st.blackSlams], side === 'home' ? [1, 0] : [0, 1]);
        assert.equal(st.zeroGames, 0);
        assert.equal(t[id].side, side);
      }
      // both doubles partners carry the same line, and know each other
      if (players === DOUBLES) {
        assert.deepEqual(t.h1.stats, t.h2.stats);
        assert.equal(t.h1.partnerId, 'h2');
        assert.equal(t.a2.partnerId, 'a1');
        // and live play credited both of them
        assert.equal(liveSums(recs).h2.points, 62);
      }
    });
  }

  test('a 25-0 game, and the loser (never credited) gets a full zero line', () => {
    const recs = toRecords(play(SWEEP, SINGLES, { gamesToWin: 1 }));
    const t = assertContract(sp(SINGLES, { gamesToWin: 1 }), recs);
    assert.deepEqual(replay(sp(SINGLES, { gamesToWin: 1 }), recs).games, [[25, 0]]);
    assert.deepEqual(normalize(t), {
      a1: { side: 'away', stats: { boardsPlayed: 3, gamesLost: 1 } },
      h1: { side: 'home', stats: { points: 25, boards: 3, queens: 3, gamesWon: 1, boardsPlayed: 3, whiteSlams: 1, zeroGames: 1 } },
    });
    for (const k of [...CARROM_BOX_KEYS, ...CARROM_DERIVED_KEYS]) assert.equal(t.a1.stats[k], k === 'gamesLost' || k === 'boardsPlayed' ? t.a1.stats[k] : 0, k);
  });

  test('the capped credit: only what takes the side to 25; a board-limit game is never capped', () => {
    const s = { ...carrom.init(), current: { home: 16, away: 22 } };
    assert.equal(carrom.creditPoints(9, true, 16, s), 9); // 16 + 12 = 28 → 25
    assert.equal(carrom.creditPoints(3, false, 22, s), 3); // exactly 25
    assert.equal(carrom.creditPoints(2, true, 22, s), 2); // Queen dead at 22, 24 → no cap
    // 8 boards, nobody to 25: 19-15 (replay-wave1), every board credited in full
    const limit: Board[] = [['home', 5, false], ['away', 4, false], ['home', 3, true], ['away', 6, false], ['home', 2, false], ['away', 5, false], ['home', 6, false], ['away', 0, false]];
    const st = replay(sp(), toRecords(play(limit, SINGLES, { gamesToWin: 1 })));
    assert.deepEqual(st.games, [[19, 15]]);
    assert.deepEqual(carrom.creditedPoints(st), st.boards.map((b) => b.points));
  });

  test('a mid-game state (no game finished) still balances', () => {
    const recs = toRecords(play(BO3.slice(0, 3)));
    const t = assertContract(sp(), recs);
    assert.deepEqual([t.h1.stats.gamesWon, t.h1.stats.gamesLost, t.h1.stats.boardsPlayed], [0, 0, 3]);
  });
});

describe('SD-37 · corrections (AMEND)', () => {
  test('void a board and replace a board (coins + queen + slam) = the same match scored cleanly', () => {
    const acts = play(BO3);
    const recs = toRecords(acts);
    // void away's 2-coin board in game 3; replace home's 9-coin board in game 2 with 5 coins
    const voidSeq = 15; // ['away', 2, false]
    const g2 = 7; // ['home', 9, false] (game 2, home never reaches 25 there)
    const cleanBoards: Board[] = BO3.filter((_, i) => i + 1 !== voidSeq).map((b, i) => (i + 1 === g2 ? ['home', 5, false, 'black'] : b));
    const replacement = play(BO3.slice(0, g2 - 1).concat([['home', 5, false, 'black']]))[g2 - 1];
    const corrected = [...recs, amendRecord(recs, [{ seq: voidSeq, op: 'void' }, { seq: g2, op: 'replace', action: replacement }])];
    assertSameAsClean(sp(), corrected, toRecords(play(cleanBoards)));
    const t = carromStatTotals(replay(sp(), corrected), L.ctxOf(SINGLES));
    assert.equal(t.h1.stats.blackSlams, 1);
    assert.equal(t.a1.stats.boardsPlayed, 15);
  });

  test('a correction that moves a later cap: the totals are the clean match; the sync sets them absolutely', () => {
    // game 1: home 12, 21 … then 4 → 25. Shave the first board to 5 coins + queen (8):
    // the closing board is no longer capped (17 + 4 = 21 → game goes on).
    const acts = play(BO3);
    const recs = toRecords(acts);
    const replacement = play([['home', 5, true]])[0];
    const corrected = [...recs, amendRecord(recs, [{ seq: 1, op: 'replace', action: replacement }])];
    const fixed = carromStatTotals(replay(sp(), corrected), L.ctxOf(SINGLES));
    const s = replay(sp(), corrected);
    const sideGames = (i: 0 | 1) => s.games.reduce((a, g) => a + g[i], 0) + s.current[i === 0 ? 'home' : 'away'];
    assert.equal(fixed.h1.stats.points, sideGames(0));
    // the completion / correction sync writes those values over the live lines
    const live = liveSums(corrected);
    const writes = planStatSync([{ id: 'l1', playerId: 'h1', stats: live.h1 }, { id: 'l2', playerId: 'a1', stats: live.a1 }], fixed, (x) => x);
    const h1 = writes.find((w) => w.playerId === 'h1')!;
    assert.equal(h1.stats.points, fixed.h1.stats.points);
  });
});

describe('SD-37 · older logs, the safeguard, replay identity', () => {
  /** Before SD-37: only the "finisher" was credited, with the UNCAPPED value. */
  function legacy(list: Board[], finisher: Record<Side, string>): ScoreAction[] {
    let s = carrom.init();
    return list.map(([side, coins, queen]) => {
      const by = carrom.boardPoints(coins, queen, s.current[side], s);
      const a: ScoreAction = { type: 'BOARD', side, payload: { coins, queen }, attribution: { playerId: finisher[side], playerName: NAME(finisher[side]), stat: 'points', by, extra: { boards: 1, ...(queen ? { queens: 1 } : {}) } } };
      s = carrom.reducer(s, a);
      return a;
    });
  }
  const BOARDS: Board[] = L.CARROM_BOARDS.map(([w, c, q]) => [w, c, q]);

  test('a legacy log replays to the same scoring state (fingerprint unchanged)', () => {
    const s = replay(sp(), toRecords(legacy(BOARDS, { home: 'h1', away: 'a1' })));
    assert.equal(L.fingerprint(s as never, L.CARROM_KEYS), '1ed3c3de2692');
    assert.ok(s.boards.every((b) => !('slam' in b)));
  });

  test('doubles finisher-only lines heal: the partner gets the side record, capped points', () => {
    const recs = toRecords(legacy(BOARDS, { home: 'h1', away: 'a2' }));
    const t = carromStatTotals(replay(sp(), recs), L.ctxOf(DOUBLES));
    const live = liveSums(recs);
    assert.equal(live.h1.points, 67); // uncapped (game 3's last board was worth 9, added 4)
    assert.equal(live.h2, undefined);
    assert.deepEqual(t.h1.stats, t.h2.stats);
    assert.equal(t.h2.stats.points, 62);
    const writes = planStatSync([{ id: 'l1', playerId: 'h1', stats: live.h1 }, { id: 'l2', playerId: 'h2', stats: {} }], t, (x) => x);
    assert.equal(writes.find((w) => w.playerId === 'h1')!.stats.points, 62);
    assert.equal(writes.find((w) => w.playerId === 'h2')!.stats.boards, 8);
  });

  test('no ctx: the credited players alone (the loser who never won a board has no line to write)', () => {
    const recs = toRecords(play(SWEEP, SINGLES, { gamesToWin: 1 }));
    const t = carromStatTotals(replay(sp(), recs));
    assert.deepEqual(Object.keys(t), ['h1']);
  });

  test('an unresolved credited name leaves the box keys out entirely (derived keys stay)', () => {
    const named = (name: string): ScoreAction => ({ type: 'BOARD', side: 'home', payload: { coins: 5, queen: false }, attribution: { playerId: '', playerName: name, stat: 'points', by: 5, extra: { boards: 1 } } });
    const ok = carrom.reducer(carrom.init(), named('H1'));
    const t1 = carromStatTotals(ok, L.ctxOf(SINGLES));
    assert.equal(t1.h1.stats.points, 5); // resolves through ctx
    const bad = carrom.reducer(carrom.init(), named('Stranger'));
    const t2 = carromStatTotals(bad, L.ctxOf(SINGLES));
    for (const id of ['h1', 'a1']) {
      for (const k of CARROM_BOX_KEYS) assert.equal(t2[id].stats[k], undefined, `${id}.${k}`);
      assert.equal(t2[id].stats.boardsPlayed, 1);
    }
    // ambiguous (two ctx players with that name) is unresolved too
    const twins = { players: { home: [{ id: 'h1', name: 'Asha' }, { id: 'h9', name: 'Asha' }], away: [] } };
    const t3 = carromStatTotals(carrom.reducer(carrom.init(), named('Asha')), twins);
    assert.equal(t3.h1.stats.points, undefined);
  });

  test('roster bigger than the side: the picked players (default the first perSide)', () => {
    const r = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }];
    assert.deepEqual(creditedPlayers(r, 2).map((p) => p.id), ['p1', 'p2']);
    assert.deepEqual(creditedPlayers(r, 2, ['p3', 'p1']).map((p) => p.id), ['p1', 'p3']);
    assert.deepEqual(creditedPlayers(r, 1, ['p2']).map((p) => p.id), ['p2']);
    assert.deepEqual(creditedPlayers(r.slice(0, 2), 2).map((p) => p.id), ['p1', 'p2']);
  });

  test('the plugin is wired to these totals', () => {
    const src = readFileSync(new URL('../src/sports/carrom/index.tsx', import.meta.url), 'utf8');
    assert.match(src, /statTotals: carromStatTotals,/);
    assert.match(src, /statTotalsNeedsPlayers: true/);
    assert.match(src, /statTotalsPartial: true/);
    assert.match(src, /attribution2: players\[1\]/);
  });

  test('carromSideRecord on an empty / old snapshot', () => {
    assert.deepEqual(carromStatTotals(null as never), {});
    const r = carromSideRecord(carrom.init(), 'home');
    assert.equal(r.boardsPlayed, 0);
  });
});

describe('SD-86 · the carrom career', () => {
  const line = (id: string, stats: Record<string, number>, result: 'W' | 'L' = 'W'): StatLine =>
    ({ id: `l${id}`, matchId: id, playerId: 'p1', sport: 'carrom', stats, won: result === 'W', result, opponent: 'Blues', date: '2026-05-01' } as StatLine);
  const rows = (lines: StatLine[]) =>
    Object.fromEntries(careerSections(statSchema('carrom')!, lines).map((s) => [s.id, Object.fromEntries(s.rows.map((r) => [r.label, r.value]))]));

  test('games W-L, board %, points per board, slams, 25-0 games', () => {
    const c = rows([
      line('m1', { points: 62, boards: 8, queens: 2, gamesWon: 2, gamesLost: 1, boardsPlayed: 16, whiteSlams: 1, blackSlams: 0, zeroGames: 0 }),
      line('m2', { points: 25, boards: 3, queens: 3, gamesWon: 1, gamesLost: 0, boardsPlayed: 3, whiteSlams: 1, blackSlams: 1, zeroGames: 1 }),
      // an older line (before SD-37): no record keys — stays out of board %
      line('m3', { points: 13, boards: 2, queens: 0 }, 'L'),
    ]);
    assert.deepEqual(c.match, { 'Games W-L': '3-1', 'Boards won %': '58%', '25-0 games': '1' });
    assert.equal(c.scoring['Points per board won'], '7.9'); // 87 / 11 (the older line stays out)
    assert.equal(c.scoring['Boards won'], '13');
    assert.equal(c.scoring['White slams'], '2');
    assert.equal(c.scoring['Black slams'], '1');
    assert.equal(c.scoring['Best match'], '62');
  });

  test('the schema is valid', () => {
    assert.deepEqual(validateSchema(STAT_SCHEMAS.carrom), []);
  });
});
