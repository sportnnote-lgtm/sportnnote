/**
 * SD-107 — optional point detail for the racket sports (src/sports/pointDetail.ts):
 * POINT_DETAIL / SET_DETAIL in every racket engine, tennis 1st / 2nd serve,
 * EDIT_LOG round-trips, absolute statTotals (D8: untracked = no keys), the
 * box score, the match-stats panel rows, the schema / career / leaders, and
 * Decision 8 — old logs replay identically.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as L from './racketLogs.mts';
import type { ScoreAction } from '../src/sports/types.ts';
import type { StatLine } from '../src/core/types.ts';
import * as tennis from '../src/sports/tennis/engine.ts';
import * as padel from '../src/sports/padel/engine.ts';
import * as badminton from '../src/sports/badminton/engine.ts';
import { makeRallyEngine, rallyInputs } from '../src/sports/rallyEngine.ts';
import { pointInputs, correctionActions } from '../src/sports/rallyEdit.ts';
import { tennisTotals, badmintonTotals, rallyTotals, padelTotals } from '../src/sports/racketTotals.ts';
import { serveStats, serveRows, serveCareerKeys } from '../src/sports/serveStats.ts';
import { tennisBox, badmintonBox } from '../src/sports/boxSources.ts';
import { buildBoxTable } from '../src/sports/boxScore.ts';
import { STAT_SCHEMAS } from '../src/sports/statSchemas.ts';
import { aggregateValue, statDefIn, validateSchema } from '../src/sports/statSchema.ts';
import { careerSections } from '../src/data/career.ts';
import { planStatSync } from '../src/data/statSync.ts';
import {
  DETAIL_HOWS, applyPointDetail, detailKeys, detailRows, detailTally, pdText, strokeKey, type PointDetail,
} from '../src/sports/pointDetail.ts';
import { detailLiveSettings } from '../src/sports/pointDetailSettings.ts';
import { planLiveApply } from '../src/sports/liveSettings.ts';

type Side = 'home' | 'away';
const SINGLES = L.ctxOf({ home: ['h1'], away: ['a1'] });
const DOUBLES = L.ctxOf({ home: ['h1', 'h2'], away: ['a1', 'a2'] });
const P = (side: Side, id?: string): ScoreAction => ({ type: 'POINT', side, ...(id ? { attribution: { playerId: id, stat: 'points', playerName: id.toUpperCase() } } : {}) });
const D = (pd: PointDetail | null, serve?: 1 | 2): ScoreAction => ({ type: 'POINT_DETAIL', payload: { pd, ...(serve ? { serve } : {}) } });
const S2: ScoreAction = { type: 'POINT_DETAIL', payload: { serve: 2 } };
const ON = (extra: Record<string, boolean> = {}): ScoreAction => ({ type: 'SET_DETAIL', payload: { pointDetail: true, ...extra } });
const run = <S,>(reducer: (s: S, a: ScoreAction) => S, s0: S, log: ScoreAction[]) => log.reduce(reducer, s0);
const TT = makeRallyEngine({ icon: '🏓', sideOutValue: '__none__', sideOutLabel: 'Side change', defaults: { playersPerSide: 1, target: 11, winBy: 2, gamesToWin: 3 } });
const PICKLE = makeRallyEngine({ icon: '🥒', sideOutValue: 'sideout', sideOutLabel: 'Side-out', defaults: { playersPerSide: 1, target: 11, winBy: 2, gamesToWin: 2 } });
const SQUASH = makeRallyEngine({ icon: '⚫', sideOutValue: 'english', sideOutLabel: 'Hand-out', defaults: { playersPerSide: 1, target: 11, winBy: 2, gamesToWin: 3 } });

/** The founder's demo game: home serves. FH winner (1st serve), BH unforced
 *  error by home, an ace on the 2nd serve, a double fault → 30-30. */
const DEMO: ScoreAction[] = [
  ON({ serveDetail: true }),
  P('home', 'h1'), D({ how: 'winner', stroke: 'fh' }),
  P('away', 'a1'), D({ how: 'ue', stroke: 'bh', err: { playerId: 'h1', playerName: 'H1' } }),
  { type: 'ACE', side: 'home', attribution: { playerId: 'h1', stat: 'aces', playerName: 'H1' } }, S2,
  { type: 'POINT', side: 'away', payload: { df: true }, attribution2: { playerId: 'h1', stat: 'doubleFaults', playerName: 'H1' } },
];

describe('SD-107 · Decision 8 — old logs are untouched', () => {
  test('a log without the new actions replays to the same state, with no detail keys', () => {
    const s = run(tennis.reducer, tennis.init(), L.TENNIS_BO3);
    assert.equal(L.fingerprint(s as never, L.TENNIS_KEYS), L.fingerprint(run(tennis.reducer, tennis.init(), L.TENNIS_BO3) as never, L.TENNIS_KEYS));
    assert.equal('pointDetail' in s, false);
    assert.ok(s.events.every((e) => !e.pd && !e.serve));
    const t = tennisTotals(s, SINGLES);
    for (const k of ['winners', 'unforcedErrors', 'forcedErrors', 'srv1Pts', 'netPtsWon']) assert.equal(k in t.h1.stats, false, k);
    // an EDIT_LOG of the same list is still identical
    const e = tennis.reducer(s, { type: 'EDIT_LOG', payload: { points: pointInputs(s.events) } });
    assert.equal(L.fingerprint(e as never, L.TENNIS_KEYS), L.fingerprint(s as never, L.TENNIS_KEYS));
  });
  test('POINT_DETAIL / SET_DETAIL never change the score', () => {
    const plain = run(tennis.reducer, tennis.init(), DEMO.filter((a) => a.type !== 'POINT_DETAIL' && a.type !== 'SET_DETAIL'));
    const detailed = run(tennis.reducer, tennis.init(), DEMO);
    assert.deepEqual([detailed.pts, detailed.games], [plain.pts, plain.games]);
    assert.deepEqual(detailed.events.map((e) => [e.stamp, e.label, e.side]), plain.events.map((e) => [e.stamp, e.label, e.side]));
  });
  test('format flags absent unless switched on', () => {
    assert.equal('pointDetail' in tennis.init({}), false);
    assert.equal(tennis.init({ pointDetail: true, serveDetail: true }).serveDetail, true);
    assert.equal(badminton.init({ pointDetail: true }).pointDetail, true);
    assert.equal(TT.init({ pointDetail: true }).pointDetail, true);
  });
});

describe('SD-107 · tennis', () => {
  const s = run(tennis.reducer, tennis.init(), DEMO);
  test('the four demo points are described on the log', () => {
    const pts = s.events.filter((e) => e.kind === 'point' || e.kind === 'ace');
    assert.deepEqual(pts.map((e) => [e.side, e.pd?.how ?? null, e.pd?.stroke ?? null, e.serve ?? null, !!e.df]), [
      ['home', 'winner', 'fh', 1, false], ['away', 'ue', 'bh', 1, false], ['home', null, null, 2, false], ['away', null, null, 2, true],
    ]);
    assert.equal(tennis.disp(s, 'home'), '30');
    assert.equal(pdText(pts[0].pd), 'Forehand winner');
    assert.equal(pdText(pts[1].pd), 'Unforced error (backhand) · H1');
    assert.equal(pdText(pts[1].pd, false), 'Unforced error (backhand)');
  });
  test('statTotals: winner / UE credits, all keys 0 elsewhere; 1st / 2nd serve on the server', () => {
    const t = tennisTotals(s, SINGLES);
    assert.equal(t.h1.stats.winners, 1);
    assert.equal(t.h1.stats.winnersFh, 1);
    assert.equal(t.h1.stats.unforcedErrors, 1);
    assert.equal(t.h1.stats.ueBh, 1);
    assert.equal(t.a1.stats.winners, 0);
    assert.equal(t.a1.stats.unforcedErrors, 0);
    for (const k of detailKeys('tennis')) assert.equal(typeof t.a1.stats[k], 'number', k);
    assert.deepEqual([t.h1.stats.srv1Pts, t.h1.stats.srv1In, t.h1.stats.srv1Won, t.h1.stats.srv2Pts, t.h1.stats.srv2Won], [4, 2, 1, 2, 1]);
    assert.equal(t.a1.stats.srv1Pts, 0); // tracked match, a1 hasn't served
    assert.equal(t.h1.stats.aces, 1); // the ace keeps its own key
  });
  test('match-stats panel: 1st serve rows, DF row and the detail rows', () => {
    const st = serveStats('tennis', s, { home: ['h1'], away: ['a1'] })!;
    assert.equal(st.serveTracked, true);
    assert.deepEqual(st.last, { server: 'home', winner: 'away' });
    const rows = serveRows(st, st.match);
    const r = (k: string) => rows.find((x) => x.key === k);
    assert.equal(r('dfs')?.home, '1');
    assert.equal(r('s1in')?.home, '2/4 (50%)');
    assert.equal(r('s1won')?.home, '1/2 (50%)');
    assert.equal(r('s2won')?.home, '1/2 (50%)');
    const d = detailRows('tennis', s.events);
    assert.deepEqual(d.slice(0, 4).map((x) => [x.key, x.home, x.away]), [['winners', '1', '0'], ['unforcedErrors', '1', '0'], ['forcedErrors', '0', '0'], ['wue', '1.00', '–']]);
    assert.ok(d.some((x) => x.label === 'Forehand winners' && x.home === '1'));
    assert.deepEqual(detailRows('tennis', s.events, 2), []); // set 2: nothing described
  });
  test('box score: W / UE / FE columns appear only on a tracked match', () => {
    const roster = { homeRoster: [{ id: 'h1', fullName: 'H1' }], awayRoster: [{ id: 'a1', fullName: 'A1' }] } as never;
    const tracked = buildBoxTable(STAT_SCHEMAS.tennis, tennisBox(s, roster).data('all'), { scope: 'all' });
    assert.ok(['W', 'UE', 'FE'].every((a) => tracked.columns.some((c) => c.abbr === a)), tracked.columns.map((c) => c.abbr).join());
    const old = run(tennis.reducer, tennis.init(), L.TENNIS_BO3);
    const plain = buildBoxTable(STAT_SCHEMAS.tennis, tennisBox(old, roster).data('all'), { scope: 'all' });
    assert.equal(plain.columns.some((c) => c.abbr === 'W' || c.abbr === 'UE'), false);
  });
  test('POINT_DETAIL replaces, clears, and leaves a double fault alone', () => {
    const a = run(tennis.reducer, tennis.init(), [ON(), P('home'), D({ how: 'winner' }), D({ how: 'fe' })]);
    assert.equal(a.events.at(-1)!.pd?.how, 'fe');
    const b = tennis.reducer(a, D(null));
    assert.equal(b.events.at(-1)!.pd, undefined);
    const c = run(tennis.reducer, tennis.init(), [P('away', undefined), { type: 'POINT', side: 'away', payload: { df: true } }]);
    assert.equal(applyPointDetail(c.events, { pd: { how: 'winner' } }), null);
    // an invalid how is ignored; serve 2 on an untracked point is ignored
    assert.equal(applyPointDetail(a.events, { pd: { how: 'nonsense' } }), null);
    assert.equal(tennis.reducer(a, S2).events.at(-1)!.serve, undefined);
    // after the match point too
    const done = run(tennis.reducer, tennis.init({ setsToWin: 1, gamesPerSet: 1, setWinByTwo: false }), [ON(), ...L.tGame('home')]);
    assert.equal(done.ended, true);
    assert.equal(tennis.reducer(done, D({ how: 'winner', stroke: 'overhead' })).events.filter((e) => e.kind === 'point').at(-1)!.pd?.stroke, 'overhead');
  });
  test('undo (the log without its last action) drops the detail', () => {
    const undone = run(tennis.reducer, tennis.init(), DEMO.slice(0, 2));
    assert.equal(undone.events.at(-1)!.pd, undefined);
  });
  test('EDIT_LOG keeps detail and serve; a point from before serve tracking stays untracked', () => {
    const log = [P('home', 'h1'), ON({ serveDetail: true }), P('home', 'h1'), D({ how: 'winner', stroke: 'bh', net: true }), P('away', 'a1'), S2];
    const s1 = run(tennis.reducer, tennis.init(), log);
    assert.deepEqual(s1.events.map((e) => e.serve ?? null), [null, 1, 2]);
    const s2 = tennis.reducer(s1, { type: 'EDIT_LOG', payload: { points: pointInputs(s1.events) } });
    assert.deepEqual(s2.events.map((e) => [e.serve ?? null, e.pd?.how ?? null, e.pd?.net ?? null]), [[null, null, null], [1, 'winner', true], [2, null, null]]);
    assert.equal(s2.serveDetail, true);
    // a correction deleting the first point keeps the others' detail
    const acts = correctionActions(pointInputs(s1.events), pointInputs(s1.events).slice(1), () => undefined);
    const s3 = acts.reduce(tennis.reducer, s1);
    assert.equal(s3.events[0].pd?.stroke, 'bh');
    assert.equal(tennisTotals(s3, SINGLES).h1.stats.netPtsWon, 1);
  });
  test('detail on, nothing described: keys written as 0 (tracked), not left out', () => {
    const s0 = run(tennis.reducer, tennis.init(), [ON(), P('home', 'h1')]);
    assert.equal(tennisTotals(s0, SINGLES).h1.stats.winners, 0);
    assert.equal('srv1Pts' in tennisTotals(s0, SINGLES).h1.stats, false); // serve tracking off
  });
  test('doubles: an error credits the picked opponent, else nobody (side-level only)', () => {
    const s0 = run(tennis.reducer, tennis.init({ playersPerSide: 2 }), [
      ON(), P('home', 'h2'), D({ how: 'fe', err: { playerId: 'a2', playerName: 'A2' } }), P('home', 'h1'), D({ how: 'ue' }),
    ]);
    const t = tennisTotals(s0, DOUBLES);
    assert.equal(t.a2.stats.forcedErrors, 1);
    assert.equal(t.a1.stats.unforcedErrors + t.a2.stats.unforcedErrors, 0);
    assert.equal(detailTally('tennis', s0.events).away.unforcedErrors, 1); // the panel still counts it for the side
  });
});

describe('SD-107 · badminton, padel, rally engine', () => {
  test('badminton: smash winner and a service fault', () => {
    const s = run(badminton.reducer, badminton.init({}), [ON(), P('home', 'h1'), D({ how: 'winner', stroke: 'smash' }), P('home', 'h1'), D({ how: 'sf' })]);
    const t = badmintonTotals(s, SINGLES);
    assert.deepEqual([t.h1.stats.winners, t.h1.stats.winnersSmash, t.a1.stats.serviceFaults], [1, 1, 1]);
    const box = buildBoxTable(STAT_SCHEMAS.badminton, badmintonBox(s, { homeRoster: [{ id: 'h1', fullName: 'H1' }], awayRoster: [{ id: 'a1', fullName: 'A1' }] } as never).data('all'), { scope: 'all' });
    assert.ok(box.columns.some((c) => c.abbr === 'W'));
    assert.equal(detailRows('badminton', s.events).find((r) => r.key === 'winnersSmash')?.home, '1');
    // EDIT_LOG round-trip
    const e = badminton.reducer(s, { type: 'EDIT_LOG', payload: { points: pointInputs(s.events) } });
    assert.deepEqual(e.events.filter((x) => x.kind === 'point').map((x) => x.pd?.how), ['winner', 'sf']);
  });
  test('padel: bandeja winner, ace', () => {
    const s = run(padel.reducer, padel.init({ playersPerSide: 1 }), [ON(), P('home', 'h1'), D({ how: 'winner', stroke: 'bandeja' }), P('home', 'h1'), D({ how: 'ace' })]);
    const t = padelTotals(s, SINGLES);
    assert.deepEqual([t.h1.stats.winnersBandeja, t.h1.stats.aces], [1, 1]);
  });
  test('table tennis (rally scoring) and squash decisions', () => {
    const s = run(TT.reducer, TT.init({}), [ON(), P('away', 'a1'), D({ how: 'winner', stroke: 'loop' }), P('home', 'h1'), D({ how: 'ue', stroke: 'net' })]);
    const t = rallyTotals(s, SINGLES, 'tabletennis');
    assert.deepEqual([t.a1.stats.winnersLoop, t.a1.stats.unforcedErrors, t.a1.stats.ueNet], [1, 1, 1]);
    const q = run(SQUASH.reducer, SQUASH.init({}), [ON(), P('home', 'h1'), D({ how: 'stroke' }), P('away', 'a1'), D({ how: 'nolet' }), P('away', 'a1'), D({ how: 'winner', stroke: 'nick' })]);
    const tq = rallyTotals(q, SINGLES, 'squash');
    assert.deepEqual([tq.h1.stats.strokesWon, tq.a1.stats.strokesConceded, tq.h1.stats.noLets, tq.a1.stats.winnersNick], [1, 1, 1, 1]);
  });
  test('side-out: a hand-out rally can be described; the erring server is credited', () => {
    // home serves, away wins the rally → a side-out (no point), home's unforced error
    const s = run(PICKLE.reducer, PICKLE.init({ scoring: 'sideout' }), [ON(), P('away'), D({ how: 'ue', stroke: 'net' })]);
    assert.equal(s.events.at(-1)!.kind, 'rally');
    assert.equal(s.events.at(-1)!.pd?.how, 'ue');
    const t = rallyTotals(s, SINGLES, 'pickleball');
    assert.equal(t.h1.stats.unforcedErrors, 1);
    // and survives a correction replay
    const r = PICKLE.reducer(s, { type: 'EDIT_LOG', payload: { points: rallyInputs(s.events) } });
    assert.equal(r.events.at(-1)!.pd?.stroke, 'net');
  });
  test('the rally engine with no sport writes no detail keys (unknown, not 0)', () => {
    const s = run(TT.reducer, TT.init({}), [ON(), P('home', 'h1'), D({ how: 'winner' })]);
    assert.equal('winners' in rallyTotals(s, SINGLES).h1.stats, false);
  });
});

describe('SD-107 · schema, career, leaders, settings', () => {
  const line = (stats: Record<string, number>, id = 'm1'): StatLine => ({ id, matchId: id, playerId: 'p', sport: 'tennis', stats } as StatLine);
  test('every racket schema declares its detail keys and stays valid', () => {
    for (const sp of Object.keys(DETAIL_HOWS) as (keyof typeof DETAIL_HOWS)[]) {
      const schema = STAT_SCHEMAS[sp];
      assert.deepEqual(validateSchema(schema as never), [], sp);
      for (const k of detailKeys(sp)) assert.ok(statDefIn(schema as never, k), `${sp}.${k}`);
      assert.ok(schema.sections?.some((x) => x.id === 'shots' && x.title === 'Shot making'), sp);
      assert.ok(schema.leaders.includes('winnersPerMatch'), sp);
    }
    for (const k of ['srv1Pts', 'srv1In', 'firstServePct', 'secondServeWonPct']) assert.ok(statDefIn(STAT_SCHEMAS.tennis as never, k), k);
    assert.equal(strokeKey('winner', 'fhVolley'), 'winnersFhVolley');
  });
  test('per match / ratio over tracked matches only; untracked reads "not tracked"', () => {
    const sch = STAT_SCHEMAS.tennis as never;
    const tracked = line({ winners: 12, unforcedErrors: 8, points: 60 }, 'm1');
    const old = line({ points: 55 }, 'm2');
    const pm = aggregateValue(sch, statDefIn(sch, 'winnersPerMatch')!, [tracked, old]);
    assert.deepEqual([pm.text, pm.games], ['12.0', 1]);
    assert.equal(aggregateValue(sch, statDefIn(sch, 'wueRatio')!, [tracked, old]).text, '1.50');
    assert.equal(aggregateValue(sch, statDefIn(sch, 'winnersPerMatch')!, [old]).tracked, false);
    assert.equal(aggregateValue(sch, statDefIn(sch, 'wueRatio')!, [old]).tracked, false);
    const fs = aggregateValue(sch, statDefIn(sch, 'firstServePct')!, [line({ srv1Pts: 40, srv1In: 26 }), old]);
    assert.equal(fs.text, '65%');
  });
  test('career: the Shot making section shows only what was tracked', () => {
    const sch = STAT_SCHEMAS.tennis as never;
    const secs = careerSections(sch, [line({ winners: 5, winnersFh: 3, unforcedErrors: 2, ueBh: 2, forcedErrors: 1, winnersBh: 0 })]);
    const shots = secs.find((x) => x.id === 'shots');
    assert.ok(shots, secs.map((x) => x.id).join());
    const keys = shots!.rows.map((r) => r.key);
    assert.ok(keys.includes('winners') && keys.includes('winnersFh') && keys.includes('ueBh'));
    assert.equal(keys.includes('winnersBh'), false); // a stroke row hides at 0
    assert.equal(careerSections(sch, [line({ points: 10 })]).some((x) => x.id === 'shots'), false);
  });
  test('statSync writes the absolute detail keys at completion', () => {
    const done = run(tennis.reducer, tennis.init({ setsToWin: 1, gamesPerSet: 1, setWinByTwo: false }), [ON(), P('home', 'h1'), D({ how: 'winner', stroke: 'fh' }), ...L.tGame('home').slice(1)]);
    const writes = planStatSync([{ id: 'l1', playerId: 'h1', stats: { points: 4, winners: 3 } }], tennisTotals(done, SINGLES), (x) => x);
    const w = writes.find((x) => x.playerId === 'h1')!;
    assert.equal(w.stats.winners, 1); // absolute, never added
    assert.equal(w.stats.winnersFh, 1);
  });
  test('live setting: event mode — format before the first point, SET_DETAIL after', () => {
    const ls = detailLiveSettings('tennis');
    assert.deepEqual(ls.fields.map((f) => f.key), ['pointDetail', 'serveDetail']);
    assert.deepEqual(detailLiveSettings('badminton').fields.map((f) => f.key), ['pointDetail']);
    const fresh = tennis.init();
    assert.deepEqual(planLiveApply(ls as never, fresh, 0, ls.read(fresh), { ...ls.read(fresh), pointDetail: true }), { kind: 'format', patch: { pointDetail: true } });
    const live = run(tennis.reducer, fresh, [P('home')]);
    const plan = planLiveApply(ls as never, live, 1, ls.read(live), { ...ls.read(live), pointDetail: true });
    assert.deepEqual(plan, { kind: 'event', action: { type: 'SET_DETAIL', payload: { pointDetail: true } } });
    assert.equal(ls.read(tennis.reducer(live, (plan as { action: ScoreAction }).action)).pointDetail, true);
  });
  test('serveCareerKeys leaves 1st-serve keys out of an untracked match', () => {
    const st = serveStats('tennis', run(tennis.reducer, tennis.init(), L.TENNIS_BO3), { home: ['h1'], away: ['a1'] });
    assert.equal('srv1Pts' in serveCareerKeys(st, 'home', 'h1'), false);
  });
});
