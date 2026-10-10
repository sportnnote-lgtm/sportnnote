/**
 * SD-115 — racket point-entry safety (engine side):
 *  1. "Who serves first?" has no default (`serverPicked`), and can be FIXED
 *     mid-match with a `v:2` payload — serve re-derives, the score never moves;
 *     without `v:2` (every older log) the pick stays locked once play starts.
 *     Pickleball "who starts on the right" likewise (SET_START_RIGHT v:2).
 *  2. MATCH / SET / GAME / BREAK POINT chip derived by playing the next point.
 *  3. Undo names the event it removes.
 *  4. Tennis Fast4: tiebreak to 5 with sudden death at 4-4 (`tbSuddenDeathAt`),
 *     only for formats that carry the key — old Fast4 logs replay unchanged.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as L from './racketLogs.mts';
import * as tennis from '../src/sports/tennis/engine.ts';
import * as padel from '../src/sports/padel/engine.ts';
import * as badminton from '../src/sports/badminton/engine.ts';
import { makeRallyEngine, serverId, type RallyState } from '../src/sports/rallyEngine.ts';
import { serveStats } from '../src/sports/serveStats.ts';
import { pointPressure, pressureText } from '../src/sports/pointStatus.ts';
import { undoLabel } from '../src/sports/undoLabel.ts';
import type { ScoreAction } from '../src/sports/types.ts';

type Side = 'home' | 'away';
const P = (side: Side): ScoreAction => ({ type: 'POINT', side });
const FS = (side: Side, v2 = false): ScoreAction => ({ type: 'SET_FIRST_SERVER', payload: v2 ? { side, v: 2 } : { side } });
const run = <S,>(r: (s: S, a: ScoreAction) => S, s: S, as: ScoreAction[]) => as.reduce(r, s);
const TT = makeRallyEngine({ icon: '🏓', sideOutValue: '__none__', sideOutLabel: 'Service', defaults: { playersPerSide: 1, target: 11, winBy: 2, gamesToWin: 3 } });
const SQUASH = makeRallyEngine({ icon: '⚫', sideOutValue: 'english', sideOutLabel: 'Hand-out', defaults: { playersPerSide: 1, target: 11, winBy: 2, gamesToWin: 3 } });
const PICKLE = makeRallyEngine({ icon: '🥒', sideOutValue: 'sideout', sideOutLabel: 'Side-out', defaults: { playersPerSide: 2, target: 11, winBy: 2, gamesToWin: 2 } });
const FAST4_OLD = { setsToWin: 2, gamesPerSet: 4, setWinByTwo: false, tiebreakAt: 3, setTiebreak: true, tiebreakPoints: 5, noAd: true, finalSetTiebreak: 0, finalSetTBAt: 0 };
const FAST4 = { ...FAST4_OLD, tbSuddenDeathAt: 4 };

describe('SD-115 · who serves first — no default, fixable mid-match', () => {
  test('fresh matches start unpicked; the pick sets serverPicked', () => {
    for (const s0 of [tennis.init(), padel.init(), badminton.init(), TT.init(), SQUASH.init(), PICKLE.init()] as Array<{ serverPicked?: boolean }>) {
      assert.equal(s0.serverPicked, undefined);
    }
    assert.equal(tennis.reducer(tennis.init(), FS('away')).serverPicked, true);
    assert.equal(badminton.reducer(badminton.init(), FS('away')).serverPicked, true);
    assert.equal(TT.reducer(TT.init(), FS('away')).serverPicked, true);
  });

  test('tennis: old payload stays locked after play; v:2 fixes it — score same, serve + serve stats re-derive', () => {
    const s = run(tennis.reducer, tennis.reducer(tennis.init(), FS('home')), L.TENNIS_BO3.slice(0, 30));
    assert.equal(tennis.reducer(s, FS('away')).firstServer, 'home');
    const f = tennis.reducer(s, FS('away', true));
    assert.equal(f.firstServer, 'away');
    assert.equal(L.fingerprint(f as never, L.TENNIS_KEYS), L.fingerprint(s as never, L.TENNIS_KEYS));
    assert.notEqual(tennis.serveInfo(f).side, tennis.serveInfo(s).side);
    const a = serveStats('tennis', s)!, b = serveStats('tennis', f)!;
    assert.equal(a.match.home.svcGames, b.match.away.svcGames);
    assert.equal(a.match.away.svcGames, b.match.home.svcGames);
  });

  test('padel + badminton: v:2 fix keeps the score', () => {
    const p = run(padel.reducer, padel.init(), L.PADEL_TWO_SETS.slice(0, 20));
    const pf = padel.reducer(p, FS('away', true));
    assert.equal(pf.firstServer, 'away');
    assert.deepEqual([pf.games, pf.pts, pf.sets], [p.games, p.pts, p.sets]);
    const b = run(badminton.reducer, badminton.init(), L.BADMINTON_LOG.slice(0, 30));
    assert.equal(badminton.reducer(b, FS('away')).firstServer, 'home');
    const bf = badminton.reducer(b, FS('away', true));
    assert.equal(bf.firstServer, 'away');
    assert.deepEqual([bf.current, bf.games], [b.current, b.games]);
    assert.notEqual(serveStats('badminton', bf)!.match.home.srvPlayed, serveStats('badminton', b)!.match.home.srvPlayed);
  });

  test('rally engine: v:2 fixes the opener under rally scoring only', () => {
    const t = run(TT.reducer, TT.init(), L.TT_LOG.slice(0, 25));
    assert.equal(TT.reducer(t, FS('away')).opening, t.opening ?? 'home');
    const tf = TT.reducer(t, FS('away', true));
    assert.equal(tf.opening, 'away');
    assert.deepEqual([tf.current, tf.games, tf.gamesWon], [t.current, t.games, t.gamesWon]);
    // English (side-out) squash: the server decides who can score → refused
    const e = run(SQUASH.reducer, SQUASH.init({ scoring: 'english', pointsPerGame: 9, winBy: 1 }), [P('home'), P('away'), P('away')]);
    assert.equal(SQUASH.reducer(e, FS('away', true)), e);
  });

  test('pickleball: SET_START_RIGHT fixable mid-game with v:2; score unchanged', () => {
    const ids = { home: ['h1', 'h2'], away: ['a1', 'a2'] };
    const base = PICKLE.init({ scoring: 'sideout' });
    const s = run(PICKLE.reducer, base, [P('home'), P('home'), P('away')]);
    const old = PICKLE.reducer(s, { type: 'SET_START_RIGHT', payload: { side: 'home', playerId: 'h2' } });
    assert.equal(old, s);
    const f = PICKLE.reducer(s, { type: 'SET_START_RIGHT', payload: { side: 'home', playerId: 'h2', v: 2 } });
    assert.equal(f.startRight?.home, 'h2');
    assert.deepEqual([f.current, f.serving, f.serverNo], [s.current, s.serving, s.serverNo]);
    const w = run(PICKLE.reducer, f, [P('home')]);
    const w0 = run(PICKLE.reducer, s, [P('home')]);
    assert.deepEqual(w.current, w0.current);
    assert.ok(serverId(f, ids) !== undefined);
  });
});

describe('SD-115 · status chip (MATCH / SET / BREAK / GAME POINT)', () => {
  test('tennis: break point for the receiver, set point, match point', () => {
    // home serves game 1; 0-40 → away (receiver) has break point
    let s = run(tennis.reducer, tennis.init(), [P('away'), P('away'), P('away')]);
    assert.deepEqual(pointPressure(tennis.reducer, s, { unit: 'set', server: tennis.serveInfo(s).side }), [{ side: 'away', kind: 'BREAK POINT' }]);
    // 40-0 to the server: a plain game point isn't shown
    s = run(tennis.reducer, tennis.init(), [P('home'), P('home'), P('home')]);
    assert.deepEqual(pointPressure(tennis.reducer, s, { unit: 'set', server: 'home' }), []);
    // 5-0 games, 40-0 → set point
    s = run(tennis.reducer, tennis.init(), [...L.tSet(5, 0), P('home'), P('home'), P('home')]);
    assert.deepEqual(pointPressure(tennis.reducer, s, { unit: 'set', server: tennis.serveInfo(s).side }).map((p) => p.kind), ['SET POINT']);
    // a set up, same again → match point
    s = run(tennis.reducer, tennis.init(), [...L.tSet(6, 0), ...L.tSet(5, 0), P('home'), P('home'), P('home')]);
    const mp = pointPressure(tennis.reducer, s, { unit: 'set', server: tennis.serveInfo(s).side });
    assert.deepEqual(mp, [{ side: 'home', kind: 'MATCH POINT' }]);
    assert.deepEqual(pressureText(mp, { home: 'Nadal', away: 'Federer' }), [{ side: 'home', text: 'MATCH POINT · Nadal' }]);
  });

  test('badminton / squash: game point, match point; side-out receiver has none', () => {
    let b = run(badminton.reducer, badminton.init(), L.rGame(20, 19).slice(0, 39));
    assert.deepEqual(pointPressure(badminton.reducer, b, { unit: 'game' }).map((p) => p.kind), ['GAME POINT']);
    b = run(badminton.reducer, badminton.init(), [...L.rGame(21, 10), ...L.rGame(20, 0).slice(0, 20)]);
    assert.deepEqual(pointPressure(badminton.reducer, b, { unit: 'game' }), [{ side: 'home', kind: 'MATCH POINT' }]);
    // English squash to 9, home serving at 8-0: home has game point; away (receiver) can't score
    const e = run(SQUASH.reducer, SQUASH.init({ scoring: 'english', pointsPerGame: 9, winBy: 1 }), Array(8).fill(P('home')));
    assert.deepEqual(pointPressure(SQUASH.reducer, e as RallyState, { unit: 'game' }), [{ side: 'home', kind: 'GAME POINT' }]);
    assert.deepEqual(pointPressure(SQUASH.reducer, { ...e, ended: true } as RallyState, { unit: 'game' }), []);
  });
});

describe('SD-115 · Undo names the event', () => {
  const names = { home: 'Federer', away: 'Nadal' };
  const step = <S,>(r: (s: S, a: ScoreAction) => S, prev: S, a: ScoreAction) => ({ type: a.type, prev, next: r(prev, a) });
  test('tennis point with the score, game-ending point, ace, double fault', () => {
    const s = run(tennis.reducer, tennis.init(), [P('home')]);
    const sc = (x: unknown) => `${tennis.disp(x as tennis.TennisState, 'home')}-${tennis.disp(x as tennis.TennisState, 'away')}`;
    assert.equal(undoLabel(step(tennis.reducer, s, P('home')), names, sc), 'point to Federer (30-0)');
    const s3 = run(tennis.reducer, tennis.init(), [P('away'), P('away'), P('away')]);
    assert.equal(undoLabel(step(tennis.reducer, s3, P('away')), names, sc), 'point to Nadal · game');
    assert.equal(undoLabel(step(tennis.reducer, s, { type: 'ACE', side: 'home', attribution: { playerId: 'f', stat: 'aces', playerName: 'R. Federer' } }), names), 'ace · R. Federer');
    assert.equal(undoLabel(step(tennis.reducer, s, { type: 'POINT', side: 'away', payload: { df: true } }), names), 'double fault → point to Nadal');
  });
  test('settings and side-out rallies', () => {
    assert.equal(undoLabel({ type: 'SET_FIRST_SERVER', prev: {}, next: {} }, names), 'first-server pick');
    assert.equal(undoLabel({ type: 'POINT_DETAIL', prev: {}, next: {} }, names), 'point detail');
    const e = SQUASH.init({ scoring: 'english', pointsPerGame: 9, winBy: 1 });
    assert.equal(undoLabel(step(SQUASH.reducer, e, P('away')), names), 'rally to Nadal · hand-out');
    assert.equal(undoLabel(null, names), null);
  });
  test('never prints "undefined" (SD-114 report: a football goal event without a label)', () => {
    const mk = (ev: Record<string, unknown>) => ({ type: 'GOAL', prev: { events: [] }, next: { events: [{ id: 1, stamp: "12'", icon: '⚽', ...ev }] } });
    assert.equal(undoLabel(mk({ side: 'home', playerName: 'Ravi Kulkarni' }), names, () => '2-1'), null);
    assert.equal(undoLabel(mk({ label: 'Goal', side: 'home', playerName: 'Ravi Kulkarni' }), names, () => '2-1'), 'Goal · Ravi Kulkarni (2-1)');
    assert.equal(undoLabel(mk({ label: 'Goal', side: 'away' }), names, () => 'undefined-undefined'), 'Goal · Nadal');
    assert.equal(undoLabel(mk({ label: 'Goal', side: 'home', kind: 'point', playerName: undefined }), names), 'point to Federer');
  });
});

describe('SD-115 · Fast4 sudden-death tiebreak', () => {
  const toTB = [...L.tGame('home'), ...L.tGame('away'), ...L.tGame('home'), ...L.tGame('away'), ...L.tGame('home'), ...L.tGame('away')];
  const tb44 = [P('home'), P('away'), P('home'), P('away'), P('home'), P('away'), P('home'), P('away')];
  test('tbSuddenDeathAt 4: at 4-4 the next point wins the set 4-3 (5-4 in the breaker)', () => {
    const s = run(tennis.reducer, tennis.init(FAST4), [...toTB, ...tb44]);
    assert.ok(tennis.inTiebreak(s));
    assert.deepEqual(s.pts, { home: 4, away: 4 });
    assert.deepEqual(pointPressure(tennis.reducer, s, { unit: 'set', server: tennis.serveInfo(s).side }).map((p) => p.kind), ['SET POINT', 'SET POINT']);
    const w = tennis.reducer(s, P('away'));
    assert.deepEqual(w.sets, [[3, 4]]);
    assert.deepEqual(w.tb, [[4, 5]]);
  });
  test('old Fast4 formats (no key) still need two clear points — replay unchanged', () => {
    const s = run(tennis.reducer, tennis.init(FAST4_OLD), [...toTB, ...tb44, P('away')]);
    assert.deepEqual(s.sets, []);
    assert.deepEqual(s.pts, { home: 4, away: 5 });
    assert.equal(tennis.init(FAST4_OLD).tbSuddenDeathAt, undefined);
    assert.equal(tennis.init({ ...FAST4_OLD, tbSuddenDeathAt: 0 }).tbSuddenDeathAt, undefined);
    // the pinned logs replay to the same fingerprint with or without the key at 0
    const a = run(tennis.reducer, tennis.init(), L.TENNIS_BO3);
    const b = run(tennis.reducer, tennis.init({ tbSuddenDeathAt: 0 }), L.TENNIS_BO3);
    assert.equal(L.fingerprint(a as never, L.TENNIS_KEYS), L.fingerprint(b as never, L.TENNIS_KEYS));
  });
  test('sudden death never applies to a match tiebreak', () => {
    const cfg = { ...FAST4, finalSetTiebreak: 10 };
    const s = run(tennis.reducer, tennis.init(cfg), [...L.tSet(4, 0), ...L.tSet(0, 4)]);
    const mtb = run(tennis.reducer, s, [...Array(9).fill(P('home')).flatMap((x, i) => [x, P('away')]), P('home')]);
    assert.equal(mtb.ended, false); // 10-9 in a match tiebreak: still win by 2
  });
});
