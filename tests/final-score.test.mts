/**
 * SD-01 — after a set/game match ends, every surface shows the real result
 * (sets/games won + the per-set line), never the reset current-game "0–0".
 * Covers tennis, padel, badminton, table tennis, squash, pickleball and carrom,
 * the shared scoreline helpers, the ticker model built from the summary, and
 * legacy replay identity (old logs replay to the same scores).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as L from './racketLogs.mts';
import { setScore, scoreLine, finalSummary, resultText } from '../src/sports/scoreline.ts';
import * as tennis from '../src/sports/tennis/engine.ts';
import * as padel from '../src/sports/padel/engine.ts';
import * as badminton from '../src/sports/badminton/engine.ts';
import * as carrom from '../src/sports/carrom/engine.ts';
import { makeRallyEngine, rallySummary, rallyScoreLine, type RallyState } from '../src/sports/rallyEngine.ts';
import { buildTicker } from '../src/sports/ticker.ts';
import type { ScoreAction } from '../src/sports/types.ts';

type Eng<S> = { init: (c?: Record<string, unknown>) => S; reducer: (s: S, a: ScoreAction) => S };
const run = <S,>(e: Eng<S>, cfg: Record<string, unknown>, log: ScoreAction[]): S => log.reduce(e.reducer, e.init(cfg));

const rally = (d: { playersPerSide: number; target: number; winBy: number; gamesToWin: number }, sideOutValue = '__none__') =>
  makeRallyEngine({ icon: '•', sideOutValue, sideOutLabel: 'Side out', defaults: d });
const TT = rally({ playersPerSide: 1, target: 11, winBy: 2, gamesToWin: 3 });
const SQUASH = rally({ playersPerSide: 1, target: 11, winBy: 2, gamesToWin: 3 }, 'english');
const PICKLE = rally({ playersPerSide: 2, target: 11, winBy: 2, gamesToWin: 2 }, 'sideout');

const playCarrom = (boards: L.Board[], cfg?: Record<string, unknown>) =>
  boards.reduce((s, [side, coins, queen]) => carrom.reducer(s, { type: 'BOARD', side, payload: { coins, queen } }), carrom.init(cfg));

describe('scoreline helpers', () => {
  test('a plain set, a tiebreak set (loser’s points), a match tiebreak', () => {
    assert.equal(setScore([6, 4]), '6-4');
    assert.equal(setScore([7, 6], { tb: [7, 4] }), '7-6(4)');
    assert.equal(setScore([6, 7], { tb: [8, 10] }), '6-7(8)');
    assert.equal(setScore([10, 8], { matchTb: true, tb: [10, 8] }), '[10-8]');
    assert.equal(setScore([0, 0], { matchTb: true, tb: [7, 10] }), '[7-10]');
  });
  test('the whole line, and from the away side', () => {
    const sets: Array<[number, number]> = [[6, 4], [3, 6], [7, 6]];
    assert.equal(scoreLine(sets, { tb: [null, null, [7, 4]] }), '6-4, 3-6, 7-6(4)');
    assert.equal(scoreLine(sets, { tb: [null, null, [7, 4]], perspective: 'away' }), '4-6, 6-3, 6-7(4)');
    assert.equal(scoreLine([]), '');
    assert.equal(scoreLine(undefined), '');
  });
  test('finalSummary / resultText', () => {
    assert.deepEqual(finalSummary({ home: 2, away: 1 }, '21-18, 19-21, 21-15'), {
      homeScore: '2', awayScore: '1', statusLine: 'Match Over', detailLine: '21-18, 19-21, 21-15',
    });
    assert.equal(resultText({ home: 2, away: 1 }, '21-18, 19-21, 21-15'), '2–1 · 21-18, 19-21, 21-15');
  });
});

describe('completed-match summary per sport (not 0–0)', () => {
  test('tennis — 2–1 · 6-4, 3-6, 7-6(4)', () => {
    const s = run(tennis, {}, L.TENNIS_BO3);
    assert.ok(s.ended);
    const sm = tennis.summary(s);
    assert.equal(sm.homeScore, '2');
    assert.equal(sm.awayScore, '1');
    assert.equal(sm.statusLine, 'Match Over');
    assert.equal(sm.detailLine, '6-4, 3-6, 7-6(4)');
    assert.equal(tennis.scoreLine(s, 'away'), '4-6, 6-3, 6-7(4)');
  });

  test('padel — full decider and a match tiebreak [10-7]', () => {
    const full = run(padel, {}, [...L.PADEL_TWO_SETS, ...L.tSet(6, 3)]);
    assert.ok(full.ended);
    assert.deepEqual(padel.summary(full), { homeScore: '2', awayScore: '1', statusLine: 'Match Over', detailLine: '6-4, 6-7(5), 6-3' });
    const mtb = run(padel, { decider: 'match10' }, [...L.PADEL_TWO_SETS, ...L.tbPts('away', 7), ...L.tbPts('home', 10)]);
    assert.ok(mtb.ended);
    assert.deepEqual(padel.summary(mtb), { homeScore: '2', awayScore: '1', statusLine: 'Match Over', detailLine: '6-4, 6-7(5), [10-7]' });
  });

  test('badminton — 2–1 · 21-18, 19-21, 21-15', () => {
    const s = run(badminton, {}, L.BADMINTON_LOG);
    assert.ok(s.ended);
    assert.deepEqual(badminton.summary(s), { homeScore: '2', awayScore: '1', statusLine: 'Match Over', detailLine: '21-18, 19-21, 21-15' });
    assert.equal(resultText(s.gamesWon, badminton.scoreLine(s)), '2–1 · 21-18, 19-21, 21-15');
  });

  test('table tennis — 3–1 · 11-7, 9-11, 11-5, 13-11', () => {
    const s = run(TT, {}, L.TT_LOG);
    assert.ok(s.ended);
    assert.deepEqual(rallySummary(s, 'n/a'), { homeScore: '3', awayScore: '1', statusLine: 'Match Over', detailLine: '11-7, 9-11, 11-5, 13-11' });
  });

  test('squash — 3–2 · 11-9, 8-11, 11-6, 7-11, 12-10', () => {
    const s = run(SQUASH, { scoring: 'par' }, L.SQUASH_LOG);
    assert.ok(s.ended);
    assert.deepEqual(rallySummary(s, 'English'), { homeScore: '3', awayScore: '2', statusLine: 'Match Over', detailLine: '11-9, 8-11, 11-6, 7-11, 12-10' });
  });

  test('pickleball — rally 2–0 · 11-4, 11-9; side-out 2–1 · 11-0, 0-11, 11-0', () => {
    const r = run(PICKLE, {}, L.PICKLEBALL_RALLY_LOG);
    assert.deepEqual(rallySummary(r, 'side-out'), { homeScore: '2', awayScore: '0', statusLine: 'Match Over', detailLine: '11-4, 11-9' });
    const so = run(PICKLE, { scoring: 'sideout' }, L.PICKLEBALL_SIDEOUT_LOG);
    assert.ok(so.ended);
    assert.deepEqual(rallySummary(so, 'side-out'), { homeScore: '2', awayScore: '1', statusLine: 'Match Over', detailLine: '11-0, 0-11, 11-0' });
  });

  test('carrom — 2–1 · 25-18, 12-25, 25-20 (board no longer reads 0 : 0)', () => {
    const s = playCarrom(L.CARROM_BOARDS);
    assert.ok(s.ended);
    assert.deepEqual(carrom.summary(s), { homeScore: '2', awayScore: '1', statusLine: 'Match Over', detailLine: '25-18, 12-25, 25-20' });
  });

  test('mid-match the summary is still the live game, with completed games in the detail', () => {
    const s = run(badminton, {}, [...L.rGame(21, 18), ...L.rGame(3, 5)]);
    const sm = badminton.summary(s);
    assert.equal(sm.homeScore, '3');
    assert.equal(sm.awayScore, '5');
    assert.match(sm.detailLine ?? '', /Games — 1:0 \(21-18\)/);
    const t = run(TT, {}, L.rGame(4, 2));
    assert.equal(rallySummary(t as RallyState, '').homeScore, '4');
    assert.equal(rallyScoreLine(t), '');
  });

  test('a stored snapshot missing fields never throws (match cards read old state)', () => {
    assert.equal(tennis.scoreLine({} as never), '');
    assert.equal(padel.scoreLine(null as never), '');
    assert.equal(badminton.scoreLine({} as never), '');
    assert.equal(rallyScoreLine({} as never), '');
    assert.equal(carrom.scoreLine(null as never), '');
  });
});

describe('ticker / overlay after full time', () => {
  test('the overlay shows sets won and the set line, phase done', () => {
    const s = run(tennis, {}, L.TENNIS_BO3);
    const plugin = { summary: tennis.summary, isComplete: (x: typeof s) => x.ended };
    const m = buildTicker(plugin, s, { home: { name: 'Ravi', short: 'RAV' }, away: { name: 'Arjun', short: 'ARJ' }, status: 'completed' }, 200);
    assert.equal(m.phase, 'done');
    assert.equal(m.home.score, '2');
    assert.equal(m.away.score, '1');
    assert.equal(m.detail, '6-4, 3-6, 7-6(4)');
  });
});

describe('legacy replay identity (pinned to the pre-SD-01 engines)', () => {
  // Captured by replaying the same logs through git HEAD d4c8cba's engines.
  const fp = L.fingerprint;
  test('tennis', () => {
    assert.equal(fp(run(tennis, {}, L.TENNIS_BO3) as never, L.TENNIS_KEYS), 'd8f068ca3af0');
    assert.equal(fp(run(tennis, { setsToWin: 3, finalSetTiebreak: 10 }, [...L.TENNIS_TWO_ALL, ...L.tbPts('home', 4), ...L.tbPts('away', 8), ...L.tbPts('home', 6)]) as never, L.TENNIS_KEYS), 'b7535222235d');
    assert.equal(fp(run(tennis, { setsToWin: 3 }, [...L.TENNIS_TWO_ALL, ...L.tSet(7, 5)]) as never, L.TENNIS_KEYS), '4a7bb398512a');
    assert.equal(fp(run(tennis, { setsToWin: 2, gamesPerSet: 4, setWinByTwo: false, tiebreakAt: 3, tiebreakPoints: 5, noAd: true }, [...L.tSet(4, 2), ...L.tTiebreakSet(3, [...L.tbPts('away', 4), ...L.tbPts('home', 5)])]) as never, L.TENNIS_KEYS), '7e45edf3f97b');
  });
  test('padel', () => {
    assert.equal(fp(run(padel, {}, [...L.PADEL_TWO_SETS, ...L.tSet(6, 3)]) as never, L.TENNIS_KEYS), 'eb32f132ad2f');
    assert.equal(fp(run(padel, { decider: 'match10' }, [...L.PADEL_TWO_SETS, ...L.tbPts('away', 7), ...L.tbPts('home', 10)]) as never, L.TENNIS_KEYS), 'be3656e14c13');
  });
  test('badminton', () => {
    assert.equal(fp(run(badminton, {}, L.BADMINTON_LOG) as never, L.RALLY_KEYS), '97bb601bd390');
  });
  test('table tennis, squash, pickleball', () => {
    assert.equal(fp(run(TT, {}, L.TT_LOG) as never, L.RALLY_KEYS), 'b7a2d20d7054');
    assert.equal(fp(run(SQUASH, { scoring: 'par' }, L.SQUASH_LOG) as never, L.RALLY_KEYS), '1455ac3c99a7');
    assert.equal(fp(run(PICKLE, {}, L.PICKLEBALL_RALLY_LOG) as never, L.RALLY_KEYS), '6da6172329ae');
    assert.equal(fp(run(PICKLE, { scoring: 'sideout' }, L.PICKLEBALL_SIDEOUT_LOG) as never, L.RALLY_KEYS), '708ab706e90d');
  });
  test('carrom', () => {
    assert.equal(fp(playCarrom(L.CARROM_BOARDS) as never, L.CARROM_KEYS), '1ed3c3de2692');
  });
});
