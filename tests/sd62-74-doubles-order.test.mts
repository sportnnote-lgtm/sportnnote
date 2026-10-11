/**
 * SD-62 table tennis doubles service / receive order (ITTF 2.13), SD-74
 * badminton doubles server + receiver (BWF Law 11), SD-64 padel Star Point,
 * SD-75 padel Hold / Break labels, SD-65 pickleball game-2 first server,
 * SD-34 pre-SD-104 tennis double faults re-labelled, SD-52 pickleball kitchen.
 * Everything new is derived or rides on new optional keys — old logs replay
 * with the same fingerprints.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as L from './racketLogs.mts';
import type { ScoreAction } from '../src/sports/types.ts';
import * as tennis from '../src/sports/tennis/engine.ts';
import * as padel from '../src/sports/padel/engine.ts';
import * as badminton from '../src/sports/badminton/engine.ts';
import { makeRallyEngine, rallyServingSide, type RallyState } from '../src/sports/rallyEngine.ts';
import { ttDoublesTurn, badmintonDoublesTurn, ttGameStartOrder } from '../src/sports/doublesOrder.ts';
import { ttServer } from '../src/sports/tabletennis/serve.ts';
import { serveStats, serveRows } from '../src/sports/serveStats.ts';
import { setSportGameLabels } from '../src/sports/gameLabels.ts';
import { pointInputs } from '../src/sports/rallyEdit.ts';
import { DETAIL_HOWS, detailKeys } from '../src/sports/pointDetail.ts';

type Side = 'home' | 'away';
const P = (side: Side): ScoreAction => ({ type: 'POINT', side });
const FS = (side: Side, extra: Record<string, unknown> = {}): ScoreAction => ({ type: 'SET_FIRST_SERVER', payload: { side, ...extra } });
const SO = (payload: Record<string, unknown>): ScoreAction => ({ type: 'SET_SERVE_ORDER', payload });
const run = <S,>(r: (s: S, a: ScoreAction) => S, s: S, as: ScoreAction[]) => as.reduce(r, s);
const R = { home: ['h1', 'h2'], away: ['a1', 'a2'] };
const TT = makeRallyEngine({ id: 'tabletennis', icon: '🏓', sideOutValue: '__none__', sideOutLabel: 'Service', defaults: { playersPerSide: 1, target: 11, winBy: 2, gamesToWin: 3 } });
const PICKLE = makeRallyEngine({ id: 'pickleball', icon: '🥒', sideOutValue: 'sideout', sideOutLabel: 'Side-out', defaults: { playersPerSide: 2, target: 11, winBy: 2, gamesToWin: 2 } });
const ttD = () => TT.reducer(TT.init({ playersPerSide: 2 }), FS('home'));
const turn = (s: RallyState) => { const t = ttDoublesTurn(s, R)!; return `${t.server}>${t.receiver}`; };
const pts = (sides: string) => [...sides].map((c) => P(c === 'h' ? 'home' : 'away'));

describe('SD-62 · table tennis doubles order (ITTF 2.13)', () => {
  test('game 1: A→X, X→B, B→Y, Y→A — two serves each', () => {
    let s = ttD();
    const seen: string[] = [];
    for (let i = 0; i < 10; i++) { seen.push(turn(s)); s = TT.reducer(s, P(i % 3 ? 'home' : 'away')); }
    assert.deepEqual(seen, ['h1>a1', 'h1>a1', 'a1>h2', 'a1>h2', 'h2>a2', 'h2>a2', 'a2>h1', 'a2>h1', 'h1>a1', 'h1>a1']);
  });
  test('picks: the serving pair picks its server, the receiving pair its receiver (game 1)', () => {
    const s = run(TT.reducer, ttD(), [SO({ server: 'h2' }), SO({ receiver: 'a2' })]);
    assert.equal(turn(s), 'h2>a2');
    assert.equal(turn(run(TT.reducer, s, pts('hh'))), 'a2>h1');
    // a player of the wrong pair is ignored (roster order stays)
    assert.equal(turn(TT.reducer(ttD(), SO({ server: 'a1' }))), 'h1>a1');
  });
  test('game 2: the first receiver is whoever served to the first server last game', () => {
    const g1 = run(TT.reducer, ttD(), pts('hhhhhhhhhhh')); // 11-0
    assert.equal(g1.games.length, 1);
    // default: game 1's first receiver (a1) serves, to the one who served to him (h1)
    assert.equal(turn(g1), 'a1>h1');
    assert.deepEqual(ttGameStartOrder(g1, R), { server: 'a1', receiver: 'h1' });
    // the pair picks a2 instead → h2 served to a2 in game 1 → a2 serves to h2
    const g1b = TT.reducer(g1, SO({ server: 'a2' }));
    assert.equal(turn(g1b), 'a2>h2');
    assert.equal(turn(run(TT.reducer, g1b, pts('aa'))), 'h2>a1');
  });
  test('deuce: service alternates every point and the order keeps turning', () => {
    let s = run(TT.reducer, ttD(), pts('hahahahahahahahahaha')); // 10-10
    assert.deepEqual(s.current, { home: 10, away: 10 });
    const a = turn(s); s = TT.reducer(s, P('home'));
    const b = turn(s);
    assert.notEqual(a, b);
    assert.equal(a.split('>')[1], b.split('>')[0]); // the receiver serves next
  });
  test('deciding game: the receivers switch order when a pair first reaches 5', () => {
    const toDecider = [...pts('hhhhhhhhhhh'), ...pts('aaaaaaaaaaa'), ...pts('hhhhhhhhhhh'), ...pts('aaaaaaaaaaa')];
    let s = run(TT.reducer, ttD(), toDecider);
    assert.deepEqual(s.gamesWon, { home: 2, away: 2 });
    s = run(TT.reducer, s, pts('hhhh'));
    const before = ttDoublesTurn(s, R)!; // 4-0: turn 2
    s = TT.reducer(s, P('home')); // 5-0, mid-turn
    const after = ttDoublesTurn(s, R)!;
    assert.equal(after.switched, true);
    assert.equal(after.server, before.server);
    assert.notEqual(after.receiver, before.receiver);
    assert.equal(before.switched, undefined);
    s = TT.reducer(s, P('away')); // 5-1 → next turn: the (switched) receiver serves
    const next = ttDoublesTurn(s, R)!;
    assert.equal(next.server, after.receiver);
  });
  test('the named server always sits on the side ttServer gives, through a whole match', () => {
    let s = ttD();
    for (const a of L.TT_LOG) {
      if (s.ended) break;
      const t = ttDoublesTurn(s, R)!;
      assert.equal(t.serverSide, ttServer(s.current.home, s.current.away, s.games.length, 'home', s.target));
      s = TT.reducer(s, a);
    }
  });
  test('mid-game the order is fixed only with v:2 — score unchanged', () => {
    const s = run(TT.reducer, ttD(), pts('hah'));
    assert.equal(TT.reducer(s, SO({ server: 'h2' })), s);
    const f = TT.reducer(s, SO({ server: 'h2', v: 2 }));
    assert.deepEqual([f.current, f.games], [s.current, s.games]);
    assert.notEqual(turn(f), turn(s));
  });
  test('serve stats name the TT doubles server only once the order was picked', () => {
    const plain = run(TT.reducer, ttD(), L.TT_LOG);
    assert.equal(serveStats('tabletennis', plain, R)!.serverKnown, false);
    const picked = run(TT.reducer, TT.reducer(ttD(), SO({ server: 'h1' })), L.TT_LOG);
    const st = serveStats('tabletennis', picked, R)!;
    assert.equal(st.serverKnown, true);
    assert.deepEqual(new Set(Object.keys(st.match.players)), new Set(['h1', 'h2', 'a1', 'a2']));
  });
  test('squash / pickleball ignore the TT payload; TT singles unchanged', () => {
    const SQ = makeRallyEngine({ id: 'squash', icon: '⚫', sideOutValue: 'english', sideOutLabel: 'Hand-out', defaults: { playersPerSide: 2, target: 11, winBy: 2, gamesToWin: 3 } });
    const s = SQ.init();
    assert.equal(SQ.reducer(s, SO({ server: 'h1' })), s);
    const single = TT.reducer(TT.init(), FS('home'));
    assert.equal(TT.reducer(single, SO({ server: 'h1' })), single);
    assert.equal(ttDoublesTurn(single, R), null);
  });
  test('old TT logs keep their fingerprints', () => {
    const a = run(TT.reducer, TT.init(), L.TT_LOG);
    const b = run(TT.reducer, TT.init({ playersPerSide: 2 }), L.TT_LOG);
    assert.equal(L.fingerprint(a as never, L.RALLY_KEYS), L.fingerprint(b as never, L.RALLY_KEYS));
  });
});

describe('SD-74 · badminton doubles (BWF Law 11)', () => {
  const bd = () => badminton.reducer(badminton.init({ playersPerSide: 2 }), FS('home'));
  const at = (s: badminton.BadmintonState) => { const t = badmintonDoublesTurn(s, R)!; return `${t.server} ${t.court} ${t.receiver}`; };
  test('the BWF Law 11 worked example: A&B vs C&D', () => {
    // A=h1, B=h2, C=a1, D=a2; A serves from the right to C
    let s = bd();
    const seq: string[] = [at(s)];
    for (const w of ['home', 'away', 'home', 'away', 'away', 'home', 'home'] as Side[]) { s = badminton.reducer(s, P(w)); seq.push(at(s)); }
    assert.deepEqual(seq, [
      'h1 right a1', // 0-0
      'h1 left a2', // 1-0  A&B win, change courts: A from the left to D
      'a2 left h1', // 1-1  service over: D (left) to A
      'h2 right a1', // 2-1 service over: B (right) to C
      'a1 right h2', // 2-2 service over: C (right) to B
      'a1 left h1', // 2-3  C&D win, change courts: C from the left to A
      'h1 left a1', // 3-3  service over: A (left) to C
      'h1 right a2', // 4-3 A&B win: A from the right to D
    ]);
  });
  test('picks per game (either player may serve / receive) and the next game opens with the winner', () => {
    let s = badminton.reducer(bd(), SO({ server: 'h2', receiver: 'a2' }));
    assert.equal(at(s), 'h2 right a2');
    s = run(badminton.reducer, s, Array.from({ length: 21 }, () => P('away'))); // 0-21
    assert.equal(s.games.length, 1);
    assert.equal(badmintonDoublesTurn(s, R)!.serverSide, 'away');
    assert.equal(at(s), 'a1 right h1');
    assert.equal(at(badminton.reducer(s, SO({ server: 'a2', receiver: 'h2' }))), 'a2 right h2');
  });
  test('server side always matches the engine\'s serve(); mid-game fix needs v:2', () => {
    let s = bd();
    for (const a of L.BADMINTON_LOG) {
      if (s.ended) break;
      const t = badmintonDoublesTurn(s, R)!;
      assert.equal(t.serverSide, badminton.serve(s).side);
      assert.equal(t.court, badminton.serve(s).court);
      s = badminton.reducer(s, a);
    }
    const mid = run(badminton.reducer, bd(), [P('home'), P('away')]);
    assert.equal(badminton.reducer(mid, SO({ server: 'h2' })), mid);
    assert.deepEqual(badminton.reducer(mid, SO({ server: 'h2', v: 2 })).current, mid.current);
  });
  test('serve stats: doubles server named only with a pick; old logs unchanged', () => {
    const plain = run(badminton.reducer, bd(), L.BADMINTON_LOG);
    assert.equal(serveStats('badminton', plain, R)!.serverKnown, false);
    const picked = run(badminton.reducer, badminton.reducer(bd(), SO({ server: 'h1' })), L.BADMINTON_LOG);
    assert.equal(serveStats('badminton', picked, R)!.serverKnown, true);
    const a = run(badminton.reducer, badminton.init(), L.BADMINTON_LOG);
    const b = run(badminton.reducer, badminton.reducer(badminton.init(), SO({ server: 'h1' })), L.BADMINTON_LOG);
    assert.equal(L.fingerprint(a as never, L.RALLY_KEYS), L.fingerprint(b as never, L.RALLY_KEYS)); // singles: ignored
  });
});

describe('SD-64 · padel Star Point', () => {
  const star = () => padel.reducer(padel.init({ deuce: 'star' }), FS('home'));
  test('two advantages, then the deciding point at the third deuce', () => {
    let s = run(padel.reducer, star(), pts('hhhaaa')); // 40-40 (deuce 1)
    assert.equal(padel.deuceNo(s), 1);
    assert.equal(padel.decidingPoint(s), null);
    s = run(padel.reducer, s, pts('ha')); // adv home lost → deuce 2
    assert.equal(padel.deuceNo(s), 2);
    s = run(padel.reducer, s, pts('ah')); // adv away lost → deuce 3
    assert.equal(padel.deuceNo(s), 3);
    assert.equal(padel.decidingPoint(s), 'star');
    s = padel.reducer(s, P('away'));
    assert.deepEqual(s.games, { home: 0, away: 1 });
  });
  test('an advantage converted before the third deuce wins as usual', () => {
    const s = run(padel.reducer, star(), pts('hhhaaahahh')); // deuce 2 → adv home → game
    assert.deepEqual(s.games, { home: 1, away: 0 });
  });
  test('advantage / golden formats and old logs unchanged', () => {
    assert.equal('starPoint' in padel.init(), false);
    const a = run(padel.reducer, padel.init(), L.PADEL_TWO_SETS);
    const g = run(padel.reducer, padel.init({ deuce: 'golden' }), pts('hhhaaaa'));
    assert.deepEqual(g.games, { home: 0, away: 1 });
    const adv = run(padel.reducer, padel.init(), pts('hhhaaahaahah'));
    assert.deepEqual(adv.games, { home: 0, away: 0 }); // advantage keeps going past deuce 3
    assert.ok(L.fingerprint(a as never, L.TENNIS_KEYS));
  });
  test('serve stats count star points (not golden ones at 40-40)', () => {
    const s = run(padel.reducer, star(), [...pts('hhhaaa'), ...pts('haah'), P('home'), ...pts('hhhh')]);
    const st = serveStats('padel', s)!;
    assert.equal(st.star, true);
    assert.equal(st.match.home.golden, 1);
    assert.equal(st.match.home.goldenWon, 1);
    assert.ok(serveRows(st, st.match).some((r) => r.label === 'Star points won'));
  });
});

describe('SD-75 · padel Hold / Break labels with team names', () => {
  test('server keeps it → Hold, receiver wins → Break; sets / match named', () => {
    const s = run(padel.reducer, padel.reducer(padel.init({ setsToWin: 1, gamesPerSet: 4 }), FS('away')), [...pts('hhhh'), ...pts('hhhh'), ...pts('aaaa'), ...pts('hhhh'), ...pts('hhhh')]);
    // away serves g1 (home wins → break), home g2 (hold), away g3 (away hold), home g4 (hold), away g5 (break) → 4-1
    const names = { home: 'Lions', away: 'Tigers' };
    const out = setSportGameLabels(s.events, s, names).filter((e) => e.stamp === 'Game' || e.stamp === 'Set' || e.stamp === 'Match').map((e) => e.label);
    assert.deepEqual(out, ['Break · Lions', 'Hold · Lions', 'Hold · Tigers', 'Hold · Lions', 'Break · Lions', 'Set 1 won · Lions', 'Match won · Lions']);
    // the stored log is untouched
    assert.ok(s.events.some((e) => e.label === 'Game home'));
  });
  test('across a set: game numbering continues (set 2 opens with the other server)', () => {
    const s = run(padel.reducer, padel.reducer(padel.init({ gamesPerSet: 2 }), FS('home')), [...pts('hhhh'), ...pts('hhhh'), ...pts('hhhh')]);
    // set 1: home holds g1, breaks g2 (2-0); set 2 g1 = match game 3 → home serves → hold
    const lab = setSportGameLabels(s.events, s, { home: 'H', away: 'A' }).filter((e) => e.stamp === 'Game').map((e) => e.label);
    assert.deepEqual(lab, ['Hold · H', 'Break · H', 'Hold · H']);
  });
});

describe('SD-65 · pickleball: game 2 first server', () => {
  test('new matches (alt) alternate the first serve by game — rally scoring', () => {
    const s0 = PICKLE.reducer(PICKLE.init({ scoring: 'rally' }), FS('home', { alt: true }));
    assert.equal(s0.altGames, true);
    const g1 = run(PICKLE.reducer, s0, Array.from({ length: 11 }, () => P('home'))); // home wins game 1
    assert.equal(g1.games.length, 1);
    assert.equal(rallyServingSide(g1), 'away'); // USA Pickleball 5.B.1: initial service changes
    assert.equal(rallyServingSide(PICKLE.reducer(g1, P('home'))), 'home'); // then the rally winner
  });
  test('side-out: game 2 opens with the other team (start-of-game exception)', () => {
    let s = PICKLE.reducer(PICKLE.init({ scoring: 'sideout' }), FS('home', { alt: true }));
    while (s.games.length === 0) s = PICKLE.reducer(s, P('home'));
    assert.equal(s.serving, 'away');
    assert.equal(s.serverNo, 2);
  });
  test('older matches (no alt) keep "the game winner serves first" — fingerprints unchanged', () => {
    const a = run(PICKLE.reducer, PICKLE.init({ scoring: 'sideout' }), L.PICKLEBALL_SIDEOUT_LOG);
    const b = run(PICKLE.reducer, PICKLE.reducer(PICKLE.init({ scoring: 'sideout' }), FS('home')), L.PICKLEBALL_SIDEOUT_LOG);
    assert.equal(L.fingerprint(a as never, L.RALLY_KEYS), L.fingerprint(b as never, L.RALLY_KEYS));
    const g1 = run(PICKLE.reducer, PICKLE.reducer(PICKLE.init({ scoring: 'rally' }), FS('home')), Array.from({ length: 11 }, () => P('home')));
    assert.equal(rallyServingSide(g1), 'home');
  });
  test('alt survives a timeline correction (EDIT_LOG) and a mid-match fix', () => {
    let s = PICKLE.reducer(PICKLE.init({ scoring: 'rally' }), FS('home', { alt: true }));
    s = run(PICKLE.reducer, s, Array.from({ length: 11 }, () => P('home')));
    const e = PICKLE.reducer(s, { type: 'EDIT_LOG', payload: { points: pointInputs(s.events) } });
    assert.equal(e.altGames, true);
    assert.equal(rallyServingSide(e), 'away');
    const f = PICKLE.reducer(s, FS('away', { v: 2 }));
    assert.equal(rallyServingSide(f), 'home');
  });
});

describe('SD-34 · pre-SD-104 tennis double faults re-labelled on replay', () => {
  const OLD: ScoreAction = { type: 'POINT', side: 'away', payload: { _attr2: { playerId: 'h1', stat: 'doubleFaults', playerName: 'Hana' } } };
  const LIVE_OLD: ScoreAction = { type: 'POINT', side: 'away', attribution2: { playerId: 'h1', stat: 'doubleFaults', playerName: 'Hana' } };
  test('marker + label, same score as a plain point', () => {
    const base = tennis.reducer(tennis.init(), FS('home'));
    for (const a of [OLD, LIVE_OLD]) {
      const s = run(tennis.reducer, base, [P('home'), a, P('home')]);
      const plain = run(tennis.reducer, base, [P('home'), P('away'), P('home')]);
      assert.equal(L.fingerprint({ ...s, events: [] } as never, L.TENNIS_KEYS), L.fingerprint({ ...plain, events: [] } as never, L.TENNIS_KEYS));
      const e = s.events[1];
      assert.equal(e.label, 'Double fault');
      assert.deepEqual(e.df, { playerId: 'h1', playerName: 'Hana' });
      assert.equal(e.side, 'away');
      // the edit list carries it; serve stats count it
      assert.deepEqual(pointInputs(s.events)[1].df, { playerId: 'h1', playerName: 'Hana' });
    }
  });
  test('a credited point (attribution) or another attribution2 stat is not a double fault', () => {
    const credited: ScoreAction = { ...LIVE_OLD, attribution: { playerId: 'a1', stat: 'points', playerName: 'Ava' } };
    assert.equal(tennis.reducer(tennis.init(), credited).events.at(-1)!.df, undefined);
    const other: ScoreAction = { type: 'POINT', side: 'away', attribution2: { playerId: 'h1', stat: 'winners', playerName: 'Hana' } };
    assert.equal(tennis.reducer(tennis.init(), other).events.at(-1)!.label, 'Point');
  });
  test('the pinned tennis logs (no double faults) keep their fingerprints', () => {
    const a = run(tennis.reducer, tennis.init(), L.TENNIS_BO3);
    assert.ok(!a.events.some((e) => e.df));
  });
});

describe('SD-52 · pickleball kitchen / foot fault reasons', () => {
  test('offered under Unforced error, with their own keys', () => {
    const ue = DETAIL_HOWS.pickleball.find((h) => h.how === 'ue')!;
    assert.ok(ue.strokes!.includes('kitchen') && ue.strokes!.includes('foot'));
    assert.ok(detailKeys('pickleball').includes('ueKitchen'));
  });
});
