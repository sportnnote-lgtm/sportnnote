/**
 * SD-19 — the racket sports' absolute statTotals (src/sports/racketTotals.ts):
 * games / sets / points won-lost, deciders, tiebreaks and the doubles partner,
 * on the sample logs of tests/racketLogs.mts (the SD-01/SD-14 replays). Plus:
 * old logs (no player id on events, no `tb`) give the same totals, edit / undo
 * stay consistent, and the planner writes changed rows only.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as L from './racketLogs.mts';
import type { ScoreAction } from '../src/sports/types.ts';
import { makeRallyEngine } from '../src/sports/rallyEngine.ts';
import * as tennis from '../src/sports/tennis/engine.ts';
import * as padel from '../src/sports/padel/engine.ts';
import * as badminton from '../src/sports/badminton/engine.ts';
import { tennisTotals, padelTotals, badmintonTotals, rallyTotals } from '../src/sports/racketTotals.ts';
import { planStatSync, applyStatWrites, type ExistingStatLine } from '../src/data/statSync.ts';
import { liveSums, toRecords } from './statTotalsHarness.mts';

const SINGLES = { home: ['h1'], away: ['a1'] };
const DOUBLES = { home: ['h1', 'h2'], away: ['a1', 'a2'] };
const TT = makeRallyEngine({ icon: '🏓', sideOutValue: '__none__', sideOutLabel: 'Side change', defaults: { playersPerSide: 1, target: 11, winBy: 2, gamesToWin: 3 } });
const SQUASH = makeRallyEngine({ icon: '⚫', sideOutValue: 'english', sideOutLabel: 'Hand-out', defaults: { playersPerSide: 1, target: 11, winBy: 2, gamesToWin: 3 } });
const PICKLE = makeRallyEngine({ icon: '🥒', sideOutValue: 'sideout', sideOutLabel: 'Side-out', defaults: { playersPerSide: 2, target: 11, winBy: 2, gamesToWin: 2 } });

function play<S extends { events: { kind?: string; side?: 'home' | 'away' }[] }>(
  eng: { init: (c?: Record<string, unknown>) => S; reducer: (s: S, a: ScoreAction) => S }, cfg: Record<string, unknown>, players: { home: string[]; away: string[] }, log: ScoreAction[],
): { s: S; actions: ScoreAction[] } {
  const actions = L.credited(eng.reducer, eng.init(cfg), log, players);
  return { s: actions.reduce(eng.reducer, eng.init(cfg)), actions };
}
const pick = (st: Record<string, number>, keys: string[]) => Object.fromEntries(keys.map((k) => [k, st[k]]));
const REC = ['gamesWon', 'gamesLost', 'ptsWon', 'ptsLost', 'decidersPlayed', 'decidersWon'];
const SET_REC = [...REC, 'setsWon', 'setsLost', 'tiebreaksPlayed', 'tiebreaksWon'];

describe('SD-19 · tennis', () => {
  test('Bo3 6-4, 3-6, 7-6(4): games 16-16, sets 2-1, TB 1/1, decider won, points 67-68, 1 ace', () => {
    const { s } = play(tennis, {}, SINGLES, L.TENNIS_BO3);
    const t = tennisTotals(s, L.ctxOf(SINGLES));
    assert.deepEqual(pick(t.h1.stats, SET_REC), { gamesWon: 16, gamesLost: 16, ptsWon: 67, ptsLost: 68, decidersPlayed: 1, decidersWon: 1, setsWon: 2, setsLost: 1, tiebreaksPlayed: 1, tiebreaksWon: 1 });
    assert.deepEqual(pick(t.a1.stats, SET_REC), { gamesWon: 16, gamesLost: 16, ptsWon: 68, ptsLost: 67, decidersPlayed: 1, decidersWon: 0, setsWon: 1, setsLost: 2, tiebreaksPlayed: 1, tiebreaksWon: 0 });
    assert.equal(t.h1.stats.aces, 1);
    assert.equal(t.h1.stats.points, 66);
    assert.equal(t.h1.side, 'home');
    assert.equal(t.h1.partnerId, undefined); // singles: no partner
  });
  test('doubles: both partners carry the side record; partnerId pairs them; points split', () => {
    const { s } = play(tennis, { playersPerSide: 2 }, DOUBLES, L.TENNIS_BO3);
    const t = tennisTotals(s, L.ctxOf(DOUBLES));
    assert.equal(t.h1.partnerId, 'h2');
    assert.equal(t.h2.partnerId, 'h1');
    assert.equal(t.a1.partnerId, 'a2');
    assert.deepEqual(pick(t.h2.stats, SET_REC), pick(t.h1.stats, SET_REC));
    assert.equal(t.h1.stats.points + t.h2.stats.points + t.h1.stats.aces + t.h2.stats.aces, 67);
    assert.equal('partnerId' in t.h1.stats, false); // never a stat key
  });
  test('straight sets: no decider, no tiebreak', () => {
    const { s } = play(tennis, {}, SINGLES, [...L.tSet(6, 2), ...L.tSet(6, 3)]);
    const t = tennisTotals(s, L.ctxOf(SINGLES));
    assert.deepEqual(pick(t.h1.stats, ['setsWon', 'setsLost', 'gamesWon', 'gamesLost', 'decidersPlayed', 'tiebreaksPlayed']), { setsWon: 2, setsLost: 0, gamesWon: 12, gamesLost: 5, decidersPlayed: 0, tiebreaksPlayed: 0 });
  });
  test('champions\' tiebreak decider counts as one game (ATP) and as a tiebreak', () => {
    const { s } = play(tennis, { finalSetTiebreak: 10 }, SINGLES, [...L.tSet(6, 4), ...L.tSet(3, 6), ...L.tbPts('away', 10)]);
    const t = tennisTotals(s, L.ctxOf(SINGLES));
    assert.deepEqual(pick(t.a1.stats, ['setsWon', 'gamesWon', 'gamesLost', 'tiebreaksPlayed', 'tiebreaksWon', 'decidersWon']), { setsWon: 2, gamesWon: 11, gamesLost: 9, tiebreaksPlayed: 1, tiebreaksWon: 1, decidersWon: 1 });
  });
  test('an old snapshot (no `tb`, no player ids on events) gives the same totals through ctx names', () => {
    const { s } = play(tennis, {}, SINGLES, L.TENNIS_BO3);
    const old = { ...s, tb: undefined, events: s.events.map(({ playerId: _drop, ...e }) => e) };
    assert.deepEqual(tennisTotals(old as never, L.ctxOf(SINGLES)), tennisTotals(s, L.ctxOf(SINGLES)));
  });
});

describe('SD-19 · padel', () => {
  test('6-4, 6-7(5), [10-7]: sets 2-1, games 13-11, TB 2 (1 each), decider (match TB) won', () => {
    const { s } = play(padel, { decider: 'match10' }, DOUBLES, [...L.PADEL_TWO_SETS, ...L.tbPts('home', 10), ...L.tbPts('away', 7)]);
    // (home reached 10 first — the 7 away points after the end are ignored)
    const t = padelTotals(s, L.ctxOf(DOUBLES));
    assert.deepEqual(pick(t.h2.stats, ['setsWon', 'setsLost', 'gamesWon', 'gamesLost', 'tiebreaksPlayed', 'tiebreaksWon', 'decidersPlayed', 'decidersWon']),
      { setsWon: 2, setsLost: 1, gamesWon: 13, gamesLost: 11, tiebreaksPlayed: 2, tiebreaksWon: 1, decidersPlayed: 1, decidersWon: 1 });
    assert.equal(t.a2.partnerId, 'a1');
  });
});

describe('SD-19 · games sports', () => {
  test('badminton doubles 21-18, 19-21, 21-15: games 2-1, points 61-54, decider won; partner', () => {
    const { s } = play(badminton, { playersPerSide: 2 }, DOUBLES, L.BADMINTON_LOG);
    const t = badmintonTotals(s, L.ctxOf(DOUBLES));
    assert.deepEqual(pick(t.h1.stats, REC), { gamesWon: 2, gamesLost: 1, ptsWon: 61, ptsLost: 54, decidersPlayed: 1, decidersWon: 1 });
    assert.deepEqual(pick(t.a2.stats, REC), { gamesWon: 1, gamesLost: 2, ptsWon: 54, ptsLost: 61, decidersPlayed: 1, decidersWon: 0 });
    assert.equal(t.h1.stats.points + t.h2.stats.points, 61);
    assert.equal(t.h1.partnerId, 'h2');
    assert.equal('setsWon' in t.h1.stats, false);
  });
  test('table tennis bo5 11-7, 9-11, 11-5, 13-11: 3-1, no decider', () => {
    const { s } = play(TT, {}, SINGLES, L.TT_LOG);
    assert.deepEqual(pick(rallyTotals(s, L.ctxOf(SINGLES)).h1.stats, REC), { gamesWon: 3, gamesLost: 1, ptsWon: 44, ptsLost: 34, decidersPlayed: 0, decidersWon: 0 });
  });
  test('squash PAR bo5 in five: decider played and won', () => {
    const { s } = play(SQUASH, {}, SINGLES, L.SQUASH_LOG);
    assert.deepEqual(pick(rallyTotals(s, L.ctxOf(SINGLES)).a1.stats, REC), { gamesWon: 2, gamesLost: 3, ptsWon: 47, ptsLost: 49, decidersPlayed: 1, decidersWon: 0 });
  });
  test('pickleball side-out doubles: only scoring rallies credit the server; hand-outs credit nobody', () => {
    const { s, actions } = play(PICKLE, { scoring: 'sideout' }, DOUBLES, L.PICKLEBALL_SIDEOUT_LOG);
    const t = rallyTotals(s, L.ctxOf(DOUBLES));
    assert.deepEqual(pick(t.h1.stats, REC), { gamesWon: 2, gamesLost: 1, ptsWon: 22, ptsLost: 11, decidersPlayed: 1, decidersWon: 1 });
    assert.equal(t.h1.stats.points + t.h2.stats.points, 22);
    assert.equal(actions.filter((a) => a.attribution).length, 33);
  });
  test('no ctx: only players credited on the log get a line (still with the side record)', () => {
    const { s } = play(badminton, { playersPerSide: 2 }, { home: ['h1'], away: [] }, L.BADMINTON_LOG);
    const t = badmintonTotals(s);
    assert.deepEqual(Object.keys(t), ['h1']);
    assert.equal(t.h1.stats.gamesWon, 2);
  });
  test('a match still in its deciding game counts the decider as played, not won', () => {
    const { s } = play(badminton, {}, SINGLES, [...L.rGame(21, 10), ...L.rGame(10, 21), ...L.rGame(5, 3).slice(0, 5)]);
    const t = badmintonTotals(s, L.ctxOf(SINGLES));
    assert.equal(t.h1.stats.decidersPlayed, 1);
    assert.equal(t.h1.stats.decidersWon, 0);
  });
});

describe('SD-19 · edit / undo / sync', () => {
  test('replaying the same log twice is identical; every prefix equals its live sums for points', () => {
    const { actions } = play(TT, {}, SINGLES, L.TT_LOG);
    const recs = toRecords(actions);
    for (let n = 0; n <= recs.length; n += 7) {
      const s = actions.slice(0, n).reduce(TT.reducer, TT.init({}));
      const t = rallyTotals(s, L.ctxOf(SINGLES));
      const live = liveSums(recs.slice(0, n));
      for (const id of ['h1', 'a1']) assert.equal(t[id].stats.points, live[id]?.points ?? 0, `${n} ${id}`);
    }
  });
  test('the planner heals lost / doubled live increments, writes changed rows only, and twice = once', () => {
    const { s } = play(badminton, { playersPerSide: 2 }, DOUBLES, L.BADMINTON_LOG);
    const totals = badmintonTotals(s, L.ctxOf(DOUBLES));
    const lines: ExistingStatLine[] = [
      { id: 'l1', playerId: 'h1', stats: { points: totals.h1.stats.points - 1 } }, // a lost increment
      { id: 'l2', playerId: 'h2', stats: { points: totals.h2.stats.points + 1 } }, // a doubled retry
      { id: 'l3', playerId: 'a1', stats: { ...totals.a1.stats } }, // already right
    ];
    const w = planStatSync(lines, totals, (id) => id, { home: 'Home', away: 'Away' });
    assert.deepEqual(w.map((x) => `${x.kind}:${x.playerId}`).sort(), ['insert:a2', 'update:h1', 'update:h2']);
    applyStatWrites(lines, w, (x) => ({ id: `n-${x.playerId}`, playerId: x.playerId, stats: { ...x.stats } }));
    assert.equal(lines.find((l) => l.playerId === 'h1')!.stats.points, totals.h1.stats.points);
    assert.equal(lines.find((l) => l.playerId === 'h1')!.stats.gamesWon, 2);
    assert.equal(lines.find((l) => l.playerId === 'a2')!.stats.decidersPlayed, 1);
    assert.deepEqual(planStatSync(lines, totals, (id) => id), []);
  });
  test('a resolved dispute moves a racket line to the replacement player', () => {
    const { s } = play(badminton, {}, SINGLES, L.BADMINTON_LOG);
    const totals = badmintonTotals(s, L.ctxOf(SINGLES));
    const w = planStatSync([], totals, (id) => (id === 'h1' ? 'h9' : id));
    assert.ok(w.some((x) => x.kind === 'insert' && x.playerId === 'h9' && x.stats.gamesWon === 2));
    assert.ok(!w.some((x) => x.playerId === 'h1'));
  });
});
