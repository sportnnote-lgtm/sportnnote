/**
 * SD-53 conduct / cards / penalties, SD-54 timeouts + durations and the SD-63
 * squash plain Let, for the six racket sports. All new actions are additive:
 * a log without them replays identically (Decision 8).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { ScoreAction } from '../src/sports/types.ts';
import * as tennis from '../src/sports/tennis/engine.ts';
import * as padel from '../src/sports/padel/engine.ts';
import * as badminton from '../src/sports/badminton/engine.ts';
import { makeRallyEngine, rallyInputs, rallyServingSide, type RallyState } from '../src/sports/rallyEngine.ts';
import { pointInputs } from '../src/sports/rallyEdit.ts';
import { cueMarkers } from '../src/sports/courtCues.ts';
import { serveStats } from '../src/sports/serveStats.ts';
import { undoLabel } from '../src/sports/undoLabel.ts';
import {
  conductCount, durationLine, durations, fmtDuration, keepMarks, stampAt, stampDispatch, suggestLevel, suggestionText, timeoutsLeft, withDuration,
} from '../src/sports/conduct.ts';
import * as L from './racketLogs.mts';

type Side = 'home' | 'away';
const P = (side: Side, at?: number): ScoreAction => ({ type: 'POINT', side, ...(at ? { payload: { at } } : {}) });
const C = (side: Side, level: string, extra: Record<string, unknown> = {}): ScoreAction => ({ type: 'CONDUCT', side, payload: { level, ...extra } });
const TT = makeRallyEngine({ id: 'tabletennis', icon: '🏓', sideOutValue: '__none__', sideOutLabel: 'Service', defaults: { playersPerSide: 1, target: 11, winBy: 2, gamesToWin: 3 } });
const SQ = makeRallyEngine({ id: 'squash', icon: '⚫', sideOutValue: 'english', sideOutLabel: 'Hand-out', defaults: { playersPerSide: 1, target: 11, winBy: 2, gamesToWin: 3 } });
const PB = makeRallyEngine({ id: 'pickleball', icon: '🥒', sideOutValue: 'sideout', sideOutLabel: 'Side-out', defaults: { playersPerSide: 2, target: 11, winBy: 2, gamesToWin: 2 } });
const playT = (log: ScoreAction[], s = tennis.init()) => log.reduce(tennis.reducer, s);
const play = <S,>(r: (s: S, a: ScoreAction) => S, s: S, log: ScoreAction[]) => log.reduce(r, s);

describe('SD-53 · tennis code violations (ITF Point Penalty Schedule)', () => {
  test('warning → point → game is suggested, and a point penalty scores for the opponent', () => {
    let s = playT([{ type: 'SET_FIRST_SERVER', payload: { side: 'home' } }, P('home')]); // 15-0
    assert.equal(suggestLevel('tennis', s.events, 'home'), 'warning');
    s = tennis.reducer(s, C('home', 'warning', { reason: 'Racket abuse' }));
    assert.equal(s.pts.home, 1);
    assert.equal(s.events.at(-1)!.kind, 'conduct');
    assert.equal(s.events.at(-1)!.label, 'Code violation · warning');
    assert.equal(suggestLevel('tennis', s.events, 'home'), 'point');
    assert.equal(suggestionText('tennis', s.events, 'home'), '2nd code violation → point penalty');
    const before = s;
    s = tennis.reducer(s, C('home', 'point', { reason: 'Audible obscenity' }));
    assert.deepEqual(s.pts, { home: 1, away: 1 }); // 15-15
    const pen = s.events.at(-1)!;
    assert.equal(pen.kind, 'point');
    assert.equal(pen.side, 'away');
    assert.equal(pen.pen?.by, 'home');
    assert.equal(pen.label, 'Code violation · point penalty');
    assert.equal(undoLabel({ type: 'CONDUCT', prev: before, next: s }, { home: 'Nadal', away: 'Federer' }), 'code violation · point penalty · Nadal');
    assert.equal(suggestLevel('tennis', s.events, 'home'), 'game');
    assert.equal(suggestLevel('tennis', s.events, 'away'), 'warning'); // per side
    assert.equal(conductCount('tennis', s.events, 'home'), 2);
  });

  test('a game penalty awards the game in play; in a tiebreak it awards the set', () => {
    let s = playT([{ type: 'SET_FIRST_SERVER', payload: { side: 'home' } }, P('home'), P('away'), P('away')]); // 15-30
    s = tennis.reducer(s, C('away', 'game'));
    assert.deepEqual(s.games, { home: 1, away: 0 });
    assert.deepEqual(s.pts, { home: 0, away: 0 });
    // one violation, not four
    assert.equal(conductCount('tennis', s.events, 'away'), 1);
    // 6-6 → tiebreak → game penalty = the set 7-6
    let t = tennis.init();
    for (let g = 0; g < 12; g++) for (let i = 0; i < 4; i++) t = tennis.reducer(t, P(g % 2 ? 'away' : 'home'));
    assert.ok(tennis.inTiebreak(t));
    t = tennis.reducer(t, C('home', 'game'));
    assert.deepEqual(t.sets, [[6, 7]]);
  });

  test('a match-point penalty ends the match; default records only (the screen ends it)', () => {
    // set 1 6-0, then 5-0 40-0 in set 2 (best of 3): match point to home
    const s = playT([...Array(24 + 20 + 3)].map(() => P('home')));
    assert.equal(s.setsWon.home, 1);
    const d = tennis.reducer(s, C('away', 'default', { reason: 'Physical abuse' }));
    assert.equal(d.ended, false);
    assert.equal(d.events.at(-1)!.label, 'Code violation · default');
    assert.deepEqual(d.pts, s.pts);
    const p = tennis.reducer(s, C('away', 'point'));
    assert.equal(p.ended, true);
  });

  test('time violations: a warning, then server → fault (no score), receiver → point', () => {
    let s = playT([{ type: 'SET_FIRST_SERVER', payload: { side: 'home' } }]);
    assert.equal(suggestLevel('tennis', s.events, 'home', { track: 'time', serving: true }), 'warning');
    s = tennis.reducer(s, C('home', 'warning', { track: 'time' }));
    assert.equal(suggestLevel('tennis', s.events, 'home', { track: 'time', serving: true }), 'fault');
    assert.equal(suggestLevel('tennis', s.events, 'home', { track: 'time', serving: false }), 'point');
    // separate from the code schedule
    assert.equal(suggestLevel('tennis', s.events, 'home'), 'warning');
    s = tennis.reducer(s, C('home', 'fault', { track: 'time' }));
    assert.deepEqual(s.pts, { home: 0, away: 0 });
    assert.equal(s.events.at(-1)!.label, 'Time violation · fault · loss of serve');
  });

  test('medical timeout / toilet break are markers; padel / squash ignore them', () => {
    const s = tennis.reducer(playT([P('home')]), { type: 'TIMEOUT', side: 'away', payload: { t: 'medical' } });
    assert.equal(s.events.at(-1)!.label, 'Medical timeout');
    assert.equal(s.pts.home, 1);
    const p = padel.reducer(padel.init(), { type: 'TIMEOUT', side: 'away', payload: { t: 'medical' } });
    assert.equal(p.events.length, 0);
  });
});

describe('SD-53 · table tennis cards, badminton, squash, padel, pickleball', () => {
  test('TT: yellow → yellow+red 1 point → yellow+red 2 points → referee (per player)', () => {
    let s = TT.reducer(TT.init(), { type: 'SET_FIRST_SERVER', payload: { side: 'home' } });
    const pl = { playerId: 'p1', playerName: 'Ma Long' };
    assert.equal(suggestLevel('tabletennis', s.events, 'home', pl), 'warning');
    s = TT.reducer(s, C('home', 'warning', pl));
    assert.equal(suggestLevel('tabletennis', s.events, 'home', pl), 'point');
    s = TT.reducer(s, C('home', 'point', pl));
    assert.deepEqual(s.current, { home: 0, away: 1 });
    assert.equal(suggestLevel('tabletennis', s.events, 'home', pl), 'point2');
    s = TT.reducer(s, C('home', 'point2', pl));
    assert.deepEqual(s.current, { home: 0, away: 3 });
    assert.equal(suggestLevel('tabletennis', s.events, 'home', pl), 'referee');
    assert.equal(conductCount('tabletennis', s.events, 'home', 'code', 'p1'), 3);
  });

  test('TT: one timeout per match per side (ITTF 3.4.4.3)', () => {
    let s = TT.reducer(TT.init(), P('home'));
    assert.equal(timeoutsLeft('tabletennis', s.events, 'home', 'timeout'), 1);
    s = TT.reducer(s, { type: 'TIMEOUT', side: 'home', payload: { t: 'timeout' } });
    assert.equal(timeoutsLeft('tabletennis', s.events, 'home', 'timeout'), 0);
    const again = TT.reducer(s, { type: 'TIMEOUT', side: 'home', payload: { t: 'timeout' } });
    assert.equal(again.events.length, s.events.length);
    assert.equal(timeoutsLeft('tabletennis', s.events, 'away', 'timeout'), 1);
  });

  test('badminton: a fault (red card) is a point to the opponent, who serves next', () => {
    let s = badminton.reducer(badminton.init(), { type: 'SET_FIRST_SERVER', payload: { side: 'home' } });
    s = badminton.reducer(s, P('home'));
    s = badminton.reducer(s, C('home', 'warning'));
    assert.equal(suggestLevel('badminton', s.events, 'home'), 'point');
    s = badminton.reducer(s, C('home', 'point'));
    assert.deepEqual(s.current, { home: 1, away: 1 });
    assert.equal(badminton.serve(s).side, 'away');
    // no timeouts in badminton
    const t = badminton.reducer(s, { type: 'TIMEOUT', side: 'home', payload: { t: 'timeout' } });
    assert.equal(t.events.length, s.events.length);
  });

  test('squash: conduct stroke / game, and a plain Let scores nothing', () => {
    let s = SQ.reducer(SQ.init(), { type: 'SET_FIRST_SERVER', payload: { side: 'home' } });
    s = SQ.reducer(s, P('home'));
    s = SQ.reducer(s, { type: 'LET', side: 'away' });
    assert.deepEqual(s.current, { home: 1, away: 0 });
    assert.equal(s.events.at(-1)!.kind, 'let');
    assert.equal(undoLabel({ type: 'LET', prev: SQ.reducer(SQ.init(), P('home')), next: s }, { home: 'H', away: 'A' }), 'let');
    s = SQ.reducer(s, C('away', 'game'));
    assert.deepEqual(s.games, [[11, 0]]);
    assert.equal(suggestLevel('squash', s.events, 'away'), 'point'); // steps up one each time
    // a Let in another sport is ignored
    assert.equal(TT.reducer(TT.init(), { type: 'LET' }).events.length, 0);
  });

  test('padel: warning → point → game', () => {
    let s = padel.reducer(padel.init(), { type: 'SET_FIRST_SERVER', payload: { side: 'home' } });
    s = padel.reducer(s, C('away', 'warning'));
    assert.equal(suggestLevel('padel', s.events, 'away'), 'point');
    s = padel.reducer(s, C('away', 'point'));
    assert.deepEqual(s.pts, { home: 1, away: 0 });
    s = padel.reducer(s, C('away', 'game'));
    assert.deepEqual(s.games, { home: 1, away: 0 });
  });

  test('pickleball side-out: a technical foul adds a point without a side-out; timeouts 2 per game (3 to 21)', () => {
    let s = PB.reducer(PB.init({ scoring: 'sideout' }), { type: 'SET_FIRST_SERVER', payload: { side: 'home' } });
    s = PB.reducer(s, P('home')); // home serving, scores 1-0
    const serving = s.serving;
    s = PB.reducer(s, C('home', 'point')); // receiver gets the point
    assert.deepEqual(s.current, { home: 1, away: 1 });
    assert.equal(s.serving, serving);
    assert.equal(suggestLevel('pickleball', s.events, 'home'), 'point'); // 1 so far → a technical foul next
    for (let i = 0; i < 3; i++) s = PB.reducer(s, { type: 'TIMEOUT', side: 'away', payload: { t: 'timeout' } });
    assert.equal(s.events.filter((e) => e.kind === 'timeout').length, 2);
    const s21 = PB.init({ scoring: 'rally', pointsPerGame: 21 });
    assert.equal(timeoutsLeft('pickleball', s21.events, 'home', 'timeout', { game: 1, target: 21 }), 3);
    // medical: one per match
    let m = PB.reducer(s, { type: 'TIMEOUT', side: 'home', payload: { t: 'medical' } });
    m = PB.reducer(m, { type: 'TIMEOUT', side: 'home', payload: { t: 'medical' } });
    assert.equal(m.events.filter((e) => e.tmo === 'medical').length, 1);
  });
});

describe('SD-53 · corrections, stats and replay', () => {
  test('a timeline correction keeps penalty points (as penalties) and the records', () => {
    let s = PB.reducer(PB.init({ scoring: 'sideout', playersPerSide: 1 }), { type: 'SET_FIRST_SERVER', payload: { side: 'home' } });
    s = play(PB.reducer, s, [P('home'), C('home', 'warning'), C('home', 'point'), P('home'), { type: 'TIMEOUT', side: 'away', payload: { t: 'timeout' } }, P('away')]);
    const edited = PB.reducer(s, { type: 'EDIT_LOG', payload: { points: rallyInputs(s.events) } });
    assert.deepEqual(edited.current, s.current);
    assert.deepEqual(edited.events.map((e) => e.label), s.events.map((e) => e.label));
    // the warning sits after the 1st point; the penalty point replays as one
    assert.equal(edited.events[1].kind, 'conduct');
    assert.equal(edited.events[2].pen?.level, 'point');
    // serve figures skip the penalty and stay consistent with the board
    const st = serveStats('pickleball', s)!;
    assert.equal(st.consistent, true);
    assert.equal(st.match.home.srvPlayed + st.match.away.srvPlayed, 3);
  });

  test('tennis correction keeps the warning between the same points; cue markers stay aligned', () => {
    let s = playT([{ type: 'SET_FIRST_SERVER', payload: { side: 'home' } }, P('home'), P('home'), C('away', 'warning'), P('home'), P('home'), P('away')]);
    const edited = tennis.reducer(s, { type: 'EDIT_LOG', payload: { points: pointInputs(s.events) } });
    assert.deepEqual(edited.events.map((e) => e.label), s.events.map((e) => e.label));
    // change-ends after game 1: the marker still follows the "Game home" row
    const cleared = tennis.reducer(s, { type: 'EDIT_LOG', payload: { points: [] } });
    const marks = cueMarkers(tennis.reducer, cleared, pointInputs(s.events), tennis.tennisCue, s.events);
    const game1 = s.events.find((e) => e.label === 'Game home')!;
    assert.equal(marks[0].id, game1.id + 0.5);
  });

  test('keepMarks / stampAt are no-ops for logs without the new actions (Decision 8)', () => {
    for (const log of [L.TENNIS_BO3, L.TENNIS_TWO_ALL]) {
      const s = playT(log);
      assert.equal(keepMarks(s.events, s), s);
      const e = tennis.reducer(s, { type: 'EDIT_LOG', payload: { points: pointInputs(s.events) } });
      assert.deepEqual(e.events, s.events);
    }
    const r = play(TT.reducer, TT.init(), L.TT_LOG);
    assert.deepEqual(TT.reducer(r, { type: 'EDIT_LOG', payload: { points: rallyInputs(r.events) } }).events, r.events);
    const s = playT([P('home'), P('away')]);
    assert.equal(stampAt(s, s, P('home')), s);
    const n = tennis.reducer(s, P('home'));
    assert.equal(n.events.at(-1)!.at, undefined);
  });
});

describe('SD-54 · durations from the scorer clock', () => {
  test('stamped steps → match and per-game durations; summary gets the match time once ended', () => {
    const t0 = 1_700_000_000_000;
    let s = TT.init({ gamesToWin: 1 });
    for (let i = 0; i < 11; i++) s = TT.reducer(s, P('home', t0 + i * 60_000));
    assert.equal(s.ended, true);
    assert.equal(s.events.at(-1)!.at, t0 + 10 * 60_000);
    const d = durations(s.events);
    assert.equal(d.match, 10 * 60_000);
    assert.equal(fmtDuration(d.match), '10 min');
    assert.equal(durationLine(s.events, 'G'), '⏱ 10 min · G1 10 min');
    assert.equal(withDuration({ detailLine: '1-0' }, s.events, true).detailLine, '1-0 · ⏱ 10 min');
    assert.equal(fmtDuration(65 * 60_000), '1 h 05 min');
    // stamps survive a correction
    const e = TT.reducer(s, { type: 'EDIT_LOG', payload: { points: rallyInputs(s.events) } });
    assert.equal(durations(e.events).match, 10 * 60_000);
  });

  test('stampDispatch adds the clock to scoring steps only', () => {
    const got: ScoreAction[] = [];
    const d = stampDispatch((a) => got.push(a));
    d(P('home'));
    d({ type: 'SET_FIRST_SERVER', payload: { side: 'home' } });
    assert.equal(typeof got[0].payload?.at, 'number');
    assert.equal(got[1].payload?.at, undefined);
  });

  test('rally scoring: after a penalty point the beneficiary serves (squash PAR)', () => {
    let s: RallyState = SQ.reducer(SQ.init(), { type: 'SET_FIRST_SERVER', payload: { side: 'home' } });
    s = SQ.reducer(s, P('home'));
    s = SQ.reducer(s, C('home', 'point'));
    assert.equal(rallyServingSide(s), 'away');
  });
});
