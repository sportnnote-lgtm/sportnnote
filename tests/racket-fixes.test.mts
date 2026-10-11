/**
 * SD-104 — racket fixes from the guide writer:
 *   1. table tennis: deuce (1 serve each) at (target − 1)-all; 21-point games
 *      give 5 serves each until 20-20
 *   2. tennis: ace / double fault belong to the serving side (UI — the engine
 *      side is covered by serve.ts; here: the double-fault point marker)
 *   3. a double fault recorded with `payload.df` is marked on its point, so a
 *      correction (EDIT_LOG + STAT_ADJUST) moves the server's doubleFaults;
 *      older double faults (no flag) replay exactly as before
 *   4. squash / table tennis: SET_FIRST_SERVER before the first rally
 *   7. tennis / padel doubles: SET_SERVE_ORDER per pair per set drives the
 *      game rotation, the SD-103 tiebreak turns and the SD-22 per-server stats
 * (5 and 6 are display-only: the squash serving-line icon and the badminton
 * serve dot — checked in the demo.)
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { ScoreAction } from '../src/sports/types.ts';
import { ttServer, ttServesEach } from '../src/sports/tabletennis/serve.ts';
import { makeRallyEngine, type RallyState } from '../src/sports/rallyEngine.ts';
import * as tennis from '../src/sports/tennis/engine.ts';
import * as padel from '../src/sports/padel/engine.ts';
import { pointInputs, correctionActions, replayPoints } from '../src/sports/rallyEdit.ts';
import { serveStats } from '../src/sports/serveStats.ts';
import { tennisVoice } from '../src/sports/voiceParsers.ts';
import { setFirstSlot } from '../src/sports/serve.ts';
import { tGame, tSet } from './racketLogs.mts';

type Side = 'home' | 'away';
const P = (side: Side): ScoreAction => ({ type: 'POINT', side });
const opp = (s: Side): Side => (s === 'home' ? 'away' : 'home');

// ------------------------------------------------------ 1 · TT service --

describe('SD-104 · table tennis service order by game target', () => {
  test('11-point games are unchanged: 2 each, 1 each from 10-10', () => {
    assert.equal(ttServesEach(11), 2);
    assert.deepEqual([[0, 0], [1, 0], [1, 1], [2, 1]].map(([h, a]) => ttServer(h, a, 0, 'home', 11)), ['home', 'home', 'away', 'away']);
    assert.equal(ttServer(10, 10, 0, 'home', 11), 'home');
    assert.equal(ttServer(11, 10, 0, 'home', 11), 'away');
    // the default target is 11 (every older caller)
    for (let h = 0; h < 14; h++) for (let a = 0; a < 14; a++) assert.equal(ttServer(h, a, 1, 'away'), ttServer(h, a, 1, 'away', 11));
  });
  test('21-point games: 5 serves each, then 1 each from 20-20 (not 10-10)', () => {
    assert.equal(ttServesEach(21), 5);
    const seq = Array.from({ length: 11 }, (_, i) => ttServer(i, 0, 0, 'home', 21));
    assert.deepEqual(seq, ['home', 'home', 'home', 'home', 'home', 'away', 'away', 'away', 'away', 'away', 'home']);
    // 10-10 is NOT deuce in a 21-point game: still runs of five (20 played → 4 runs → opener)
    assert.equal(ttServer(10, 10, 0, 'home', 21), 'home');
    assert.equal(ttServer(11, 10, 0, 'home', 21), 'home');
    assert.equal(ttServer(13, 12, 0, 'home', 21), 'away');
    // 19-20 → 39 played → 8th run (odd) → receiver
    assert.equal(ttServer(19, 20, 0, 'home', 21), 'away');
    // 20-20 deuce: alternate every point
    assert.deepEqual([[20, 20], [21, 20], [21, 21], [22, 21]].map(([h, a]) => ttServer(h, a, 0, 'home', 21)), ['home', 'away', 'home', 'away']);
    // game 2: the other player opens
    assert.equal(ttServer(0, 0, 1, 'home', 21), 'away');
  });
  test('SD-22 serve figures follow the target (21-point game)', () => {
    const eng = makeRallyEngine({ icon: '🏓', sideOutValue: '__none__', sideOutLabel: '', defaults: { playersPerSide: 1, target: 11, winBy: 2, gamesToWin: 3 } });
    let s = eng.init({ pointsPerGame: 21, gamesToWin: 1 });
    for (let i = 0; i < 21; i++) s = eng.reducer(s, P('home')); // 21-0
    const st = serveStats('tabletennis', s, { home: ['h'], away: ['a'] })!;
    // 21 rallies, runs of five: home serves 1-5, 11-15, 21 → 11; away 10
    assert.equal(st.match.home.srvPlayed, 11);
    assert.equal(st.match.away.srvPlayed, 10);
  });
  // (old logs: the pinned fingerprints in final-score / replay-racket / serve-stats stay green)
});

// ------------------------------------------ 2/3 · tennis double faults --

const tRun = (s: tennis.TennisState, as: ScoreAction[]) => as.reduce(tennis.reducer, s);
const DF = (server: Side, id: string, name: string): ScoreAction => ({ type: 'POINT', side: opp(server), payload: { df: true }, attribution2: { playerId: id, stat: 'doubleFaults', playerName: name } });

describe('SD-104 · tennis double faults are marked and follow corrections', () => {
  test('a flagged double fault scores for the receiver and marks the server', () => {
    const s = tRun(tennis.init(), [DF('home', 'h1', 'Hana')]);
    assert.deepEqual(s.pts, { home: 0, away: 1 });
    const e = s.events.at(-1)!;
    assert.equal(e.kind, 'point');
    assert.equal(e.side, 'away');
    assert.deepEqual(e.df, { playerId: 'h1', playerName: 'Hana' });
    assert.equal(e.playerName, undefined); // nobody on the receiving side is credited
  });
  test('replay from the stored log (attribution2 persisted as payload._attr2) keeps the marker', () => {
    const stored: ScoreAction = { type: 'POINT', side: 'away', payload: { df: true, _attr2: { playerId: 'h1', stat: 'doubleFaults', playerName: 'Hana' } } };
    const s = tRun(tennis.init(), [stored]);
    assert.deepEqual(s.events.at(-1)!.df, { playerId: 'h1', playerName: 'Hana' });
  });
  test('old double faults (no df flag) — SD-34: re-labelled on replay, same score', () => {
    const old: ScoreAction = { type: 'POINT', side: 'away', attribution2: { playerId: 'h1', stat: 'doubleFaults', playerName: 'Hana' } };
    const s = tRun(tennis.init(), [old]);
    assert.deepEqual(s.events.at(-1)!.df, { playerId: 'h1', playerName: 'Hana' });
    assert.equal(s.events.at(-1)!.label, 'Double fault');
    assert.deepEqual(s.pts, tRun(tennis.init(), [{ type: 'POINT', side: 'away' }]).pts);
  });
  test('the edit list carries the marker; an EDIT_LOG replay keeps it', () => {
    const s = tRun(tennis.init(), [P('home'), DF('home', 'h1', 'Hana'), P('home')]);
    const pts = pointInputs(s.events);
    assert.deepEqual(pts[1], { side: 'away', kind: 'point', playerName: undefined, df: { playerId: 'h1', playerName: 'Hana' } });
    const r = tennis.reducer(s, { type: 'EDIT_LOG', payload: { points: pts } });
    assert.deepEqual(r.events.map((e) => e.df ?? null), s.events.map((e) => e.df ?? null));
    assert.deepEqual(r.pts, s.pts);
  });
  test('removing a double-fault point debits the server; changing it to a plain point too; adding one credits', () => {
    const s = tRun(tennis.init(), [P('home'), DF('home', 'h1', 'Hana'), P('home')]);
    const pts = pointInputs(s.events);
    const resolve = () => undefined;
    const adj = (acts: ScoreAction[]) => acts.filter((a) => a.type === 'STAT_ADJUST').map((a) => [a.attribution!.playerId, a.attribution!.stat, a.attribution!.by]);
    // remove it
    assert.deepEqual(adj(correctionActions(pts, pts.filter((_, i) => i !== 1), resolve)), [['h1', 'doubleFaults', -1]]);
    // edit it into a plain point for the receiver
    assert.deepEqual(adj(correctionActions(pts, pts.map((p, i) => (i === 1 ? { side: 'away', kind: 'point' } : p)), resolve)), [['h1', 'doubleFaults', -1]]);
    // move the fault to the partner (doubles correction)
    assert.deepEqual(
      adj(correctionActions(pts, pts.map((p, i) => (i === 1 ? { ...p, df: { playerId: 'h2', playerName: 'Hugo' } } : p)), resolve)).sort(),
      [['h1', 'doubleFaults', -1], ['h2', 'doubleFaults', 1]],
    );
    // insert a missed double fault
    assert.deepEqual(adj(correctionActions(pts, [...pts, { side: 'home', kind: 'point', df: { playerId: 'a1', playerName: 'Ava' } }], resolve)), [['a1', 'doubleFaults', 1]]);
    // untouched → no adjustment
    assert.deepEqual(adj(correctionActions(pts, pts, resolve)), []);
  });
  test('replayPoints turns a df input back into a flagged double fault', () => {
    const r = replayPoints(tennis.reducer, tennis.init(), [{ side: 'away', kind: 'point', df: { playerId: 'h1', playerName: 'Hana' } }]);
    assert.deepEqual(r.events[0].df, { playerId: 'h1', playerName: 'Hana' });
  });
  test('voice "double fault" sends the df flag', () => {
    const ctx = { homeName: 'Red', awayName: 'Blue', homeRoster: [{ id: 'h1', fullName: 'Hana' }], awayRoster: [{ id: 'a1', fullName: 'Ava' }] } as never;
    const [a] = tennisVoice('double fault Hana', ctx) ?? [];
    assert.equal(a?.side, 'away');
    assert.equal(a?.payload?.df, true);
  });
});

// --------------------------------------------- 4 · first-server picker --

describe('SD-104 · squash / table tennis "who serves first" on the scoring screen', () => {
  const squash = makeRallyEngine({ icon: '⚫', sideOutValue: 'english', sideOutLabel: 'Hand-out', defaults: { playersPerSide: 1, target: 11, winBy: 2, gamesToWin: 3 } });
  const tt = makeRallyEngine({ icon: '🏓', sideOutValue: '__none__', sideOutLabel: '', defaults: { playersPerSide: 1, target: 11, winBy: 2, gamesToWin: 3 } });
  const FS = (side: Side): ScoreAction => ({ type: 'SET_FIRST_SERVER', payload: { side } });
  test('squash English: the picked server holds serve and only they can score', () => {
    let s = squash.reducer(squash.init({ scoring: 'english', pointsPerGame: 9, winBy: 1 }), FS('away'));
    assert.equal(s.serving, 'away');
    assert.equal(s.opening, 'away');
    s = squash.reducer(s, P('home')); // receiver wins → hand-out, no point
    assert.deepEqual(s.current, { home: 0, away: 0 });
    assert.equal(s.serving, 'home');
    // locked once a rally is logged (even a pointless hand-out)
    assert.equal(squash.reducer(s, FS('away')).serving, 'home');
  });
  test('squash PAR: the picked server serves the first rally (SD-22 figures)', () => {
    const s = [FS('away'), P('away'), P('away')].reduce(squash.reducer, squash.init());
    const st = serveStats('squash', s, { home: ['h'], away: ['a'] })!;
    assert.equal(st.match.away.srvPlayed, 2);
  });
  test('table tennis: the pick is the opening server (and game 2 flips)', () => {
    const s = tt.reducer(tt.init(), FS('away'));
    assert.equal(ttServer(0, 0, 0, s.opening, s.target), 'away');
    assert.equal(ttServer(0, 0, 1, s.opening, s.target), 'home');
    // an EDIT_LOG replay keeps it
    const r = tt.reducer(tt.reducer(s, P('home')), { type: 'EDIT_LOG', payload: { points: [{ side: 'home', kind: 'point' }] } });
    assert.equal(r.opening, 'away');
  });
  test('no pick → home (as before); too late once play starts', () => {
    // a log without the action starts from the toss default (home), as before
    assert.equal(squash.init().serving, 'home');
    const before = [P('home')].reduce(tt.reducer, tt.init()) as RallyState;
    assert.equal(tt.reducer(before, FS('away')).opening, 'home'); // too late
  });
});

// --------------------------------------------- 7 · doubles serving order --

const ORDER = (side: Side, slot: 0 | 1): ScoreAction => ({ type: 'SET_SERVE_ORDER', payload: { side, slot } });
const servers = (s: tennis.TennisState, games: Side[]) => {
  const out: string[] = [];
  for (const w of games) { const v = tennis.serveInfo(s); out.push(`${v.side[0]}${v.slot}`); s = tRun(s, tGame(w)); }
  return out;
};

describe('SD-104 · doubles serving order per pair, per set', () => {
  const dbl = () => tennis.init({ playersPerSide: 2 });
  test('no pick → roster order, exactly as before', () => {
    assert.deepEqual(servers(dbl(), ['home', 'away', 'home', 'away']), ['h0', 'a0', 'h1', 'a1']);
  });
  test('a pick reorders the pair inside the set', () => {
    const s = tRun(dbl(), [ORDER('home', 1), ORDER('away', 1)]);
    assert.deepEqual(servers(s, ['home', 'away', 'home', 'away', 'home']), ['h1', 'a1', 'h0', 'a0', 'h1']);
    assert.equal(setFirstSlot(s, 'home'), 1);
    assert.equal(setFirstSlot(dbl(), 'away'), 0);
  });
  test('picks are per set: set 2 can choose again (and no pick → roster order continuation)', () => {
    let s = tRun(dbl(), [ORDER('home', 1), ...tSet(6, 4)]); // 10 games
    // set 2 game index 10: home serves (even), roster-order slot for game 10 = 1
    assert.deepEqual(tennis.serveInfo(s), { side: 'home', slot: 1 });
    s = tRun(s, [ORDER('home', 0)]);
    assert.deepEqual(tennis.serveInfo(s), { side: 'home', slot: 0 });
    // locked after the set's first point
    s = tRun(s, [P('home'), ORDER('home', 1)]);
    assert.deepEqual(tennis.serveInfo(s), { side: 'home', slot: 0 });
  });
  test('singles ignores it', () => {
    const s = tRun(tennis.init(), [ORDER('home', 1)]);
    assert.equal(s.serveOrder, undefined);
  });
  test('SD-103 tiebreak turns start from the picked players', () => {
    // set 1 to 6-6 with home picking slot 1, away slot 1
    let s = tRun(dbl(), [ORDER('home', 1), ORDER('away', 1)]);
    for (let i = 0; i < 6; i++) s = tRun(s, [...tGame('home'), ...tGame('away')]);
    assert.equal(tennis.inTiebreak(s), true);
    // 12 games: home served games 0,2,..10 → h1,h0,h1,h0,h1,h0 ; next home game (12) → h1
    const seq: string[] = [];
    for (let i = 0; i < 7; i++) { const v = tennis.serveInfo(s); seq.push(`${v.side[0]}${v.slot}`); s = tRun(s, [P(i % 2 ? 'home' : 'away')]); }
    // A1 pt1, B1 pts 2-3, A2 pts 4-5, B2 pts 6-7 (A = home due to serve game 12)
    assert.deepEqual(seq, ['h1', 'a1', 'a1', 'h0', 'h0', 'a0', 'a0']);
  });
  test('EDIT_LOG keeps the pick; SD-22 per-server stats follow it', () => {
    let s = tRun(dbl(), [ORDER('home', 1), ...tGame('home'), ...tGame('away')]);
    s = tennis.reducer(s, { type: 'EDIT_LOG', payload: { points: pointInputs(s.events) } });
    assert.deepEqual(s.serveOrder?.[0], { home: 1 });
    const st = serveStats('tennis', s, { home: ['h1', 'h2'], away: ['a1', 'a2'] })!;
    assert.equal(st.match.players.h2?.srvPlayed, 4); // slot 1 = h2 served game 1
    assert.equal(st.match.players.h1, undefined);
    assert.equal(st.match.players.a1?.srvPlayed, 4);
  });
  test('padel: same action, same rotation', () => {
    const s = [ORDER('home', 1)].reduce(padel.reducer, padel.init());
    assert.deepEqual(padel.serveInfo(s), { side: 'home', slot: 1 });
    assert.deepEqual(padel.serveInfo(padel.init()), { side: 'home', slot: 0 });
  });
});
