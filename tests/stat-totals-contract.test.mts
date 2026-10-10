/**
 * SD-19 — the `statTotals` contract (src/sports/types.ts) over EVERY sport that
 * implements it: cricket, football (keepers / on-field), volleyball (sets), and
 * the racket sports (tennis, padel, badminton, table tennis, squash,
 * pickleball). For each: the totals equal the sum of the live increments on a
 * clean log and on every prefix (undo), are deterministic, keep derived keys
 * ≥ 0, and — after an EDIT_LOG (rally editor), STAT_ADJUST or an AMEND (#05) —
 * equal the totals of the same match scored cleanly.
 *
 * A later item adds its sport by appending a `TotalsSport` case below.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as L from './racketLogs.mts';
import { assertContract, assertSameAsClean, amendRecord, toRecords, replay, type TotalsSport } from './statTotalsHarness.mts';
import type { ScoreAction } from '../src/sports/types.ts';
import { makeRallyEngine, rallyInputs } from '../src/sports/rallyEngine.ts';
import * as tennis from '../src/sports/tennis/engine.ts';
import * as padel from '../src/sports/padel/engine.ts';
import * as badminton from '../src/sports/badminton/engine.ts';
import * as volleyball from '../src/sports/volleyball/engine.ts';
import * as cricket from '../src/sports/cricket/engine.ts';
import { statTotals as cricketTotals } from '../src/sports/cricket/scorecard.ts';
import * as football from '../src/sports/football/engine.ts';
import { keeperTotals } from '../src/sports/football/keepers.ts';
import { tennisTotals, padelTotals, badmintonTotals, rallyTotals, volleyballSetRecord, mergeTotals, RACKET_RECORD_KEYS, SET_RECORD_KEYS } from '../src/sports/racketTotals.ts';
import { correctionActions, pointInputs, type PointInput } from '../src/sports/rallyEdit.ts';

type Side = 'home' | 'away';
const RECORD = [...RACKET_RECORD_KEYS, ...SET_RECORD_KEYS];
const SINGLES = { home: ['h1'], away: ['a1'] };
const DOUBLES = { home: ['h1', 'h2'], away: ['a1', 'a2'] };

const TT = makeRallyEngine({ icon: '🏓', sideOutValue: '__none__', sideOutLabel: 'Side change', defaults: { playersPerSide: 1, target: 11, winBy: 2, gamesToWin: 3 } });
const SQUASH = makeRallyEngine({ icon: '⚫', sideOutValue: 'english', sideOutLabel: 'Hand-out', defaults: { playersPerSide: 1, target: 11, winBy: 2, gamesToWin: 3 } });
const PICKLE = makeRallyEngine({ icon: '🥒', sideOutValue: 'sideout', sideOutLabel: 'Side-out', defaults: { playersPerSide: 2, target: 11, winBy: 2, gamesToWin: 2 } });

/** A racket sport case + its credited log. */
function racket<S extends { events: { kind?: string; side?: Side }[] }>(
  name: string, eng: { init: (c?: Record<string, unknown>) => S; reducer: (s: S, a: ScoreAction) => S },
  totals: TotalsSport<S>['statTotals'], config: Record<string, unknown>, players: { home: string[]; away: string[] }, log: ScoreAction[],
) {
  const sp: TotalsSport<S> = { name, init: eng.init, reducer: eng.reducer, statTotals: totals, partial: true, config, ctx: L.ctxOf(players), derived: RECORD };
  return { sp, actions: L.credited(eng.reducer, eng.init(config), log, players) };
}

const RACKET = [
  racket('tennis singles', tennis, tennisTotals, {}, SINGLES, L.TENNIS_BO3),
  racket('tennis doubles', tennis, tennisTotals, { playersPerSide: 2 }, DOUBLES, L.TENNIS_BO3),
  racket('padel (match tiebreak)', padel, padelTotals, { decider: 'match10' }, DOUBLES, [...L.PADEL_TWO_SETS, ...L.tbPts('home', 10), ...L.tbPts('away', 7)]),
  racket('badminton doubles', badminton, badmintonTotals, { playersPerSide: 2 }, DOUBLES, L.BADMINTON_LOG),
  racket('table tennis', TT, rallyTotals, {}, SINGLES, L.TT_LOG),
  racket('squash', SQUASH, rallyTotals, {}, SINGLES, L.SQUASH_LOG),
  racket('pickleball side-out doubles', PICKLE, rallyTotals, { scoring: 'sideout' }, DOUBLES, L.PICKLEBALL_SIDEOUT_LOG),
  racket('pickleball rally', PICKLE, rallyTotals, {}, DOUBLES, L.PICKLEBALL_RALLY_LOG),
];

describe('SD-19 · contract: racket sports (clean log + every undo prefix)', () => {
  for (const { sp, actions } of RACKET) {
    test(sp.name, () => {
      const t = assertContract(sp as TotalsSport<unknown>, toRecords(actions), { every: 3 });
      // every rostered player is on a line, with every owned key
      for (const id of [...sp.ctx!.players!.home, ...sp.ctx!.players!.away].map((p) => p.id)) {
        assert.ok(t[id], `${sp.name}: ${id} missing`);
        for (const k of RACKET_RECORD_KEYS) assert.equal(typeof t[id].stats[k], 'number', `${sp.name}: ${id}.${k}`);
      }
    });
  }
  test('tennis: a double fault (attribution2) stays on increments — partial, not owned', () => {
    const { sp, actions } = RACKET[0];
    const df: ScoreAction = { type: 'POINT', side: 'away', attribution2: { playerId: 'h1', stat: 'doubleFaults', playerName: 'H1' } };
    const recs = toRecords([df, ...actions]);
    const t = assertContract(sp as TotalsSport<unknown>, recs, { every: 25 });
    assert.equal('doubleFaults' in t.h1.stats, false);
  });
});

/** The corrected point list as a clean log (each point credited as live). */
function cleanFrom(points: PointInput[]): ScoreAction[] {
  return points.map((p) => ({
    type: p.kind === 'ace' ? 'ACE' : 'POINT', side: p.side,
    ...(p.playerId && p.kind !== 'rally' ? { attribution: { playerId: p.playerId, stat: p.kind === 'ace' ? 'aces' : 'points', playerName: p.playerName } } : {}),
  }));
}

describe('SD-19 · contract: corrections (EDIT_LOG + STAT_ADJUST, AMEND)', () => {
  const resolve = (name?: string) => (name ? name.toLowerCase() : undefined);
  for (const idx of [0, 1, 3, 4, 6]) {
    const { sp, actions } = RACKET[idx];
    test(`${sp.name}: rally editor — re-credit a point, flip a point, delete a point`, () => {
      const recs = toRecords(actions);
      const s = replay(sp as TotalsSport<unknown>, recs) as { events: never[] };
      const isRally = idx >= 4;
      const old = isRally ? rallyInputs(s.events) : pointInputs(s.events);
      const edited = old.map((p) => ({ ...p }));
      // re-credit the first credited point to the partner / same player
      const i = edited.findIndex((p) => p.playerId);
      const mate = sp.ctx!.players![edited[i].side].map((x) => x.id).find((x) => x !== edited[i].playerId) ?? edited[i].playerId!;
      edited[i] = { ...edited[i], playerId: mate, playerName: mate.toUpperCase() };
      // flip the 5th point to the other side (no player), delete the 9th
      const j = 4;
      edited[j] = { side: edited[j].side === 'home' ? 'away' : 'home', kind: edited[j].kind === 'rally' ? 'rally' : 'point' };
      edited.splice(8, 1);
      const eng = sp as TotalsSport<{ events: never[] }>;
      const norm = isRally ? (pts: PointInput[]) => rallyInputs(eng.reducer(s, { type: 'EDIT_LOG', payload: { points: pts } }).events) : undefined;
      const fix = correctionActions(old, edited, resolve, undefined, norm);
      const next = (fix[0].payload!.points as PointInput[]);
      const corrected = [...recs, ...toRecords(fix, recs.length + 1)];
      assertContract(sp as TotalsSport<unknown>, corrected, { every: 1000, label: 'edited' });
      assertSameAsClean(sp as TotalsSport<unknown>, corrected, toRecords(cleanFrom(next)), 'EDIT_LOG');
    });
  }
  test('tennis: AMEND (#05) re-credits a point and voids another → equals the clean log', () => {
    const { sp, actions } = RACKET[1];
    const recs = toRecords(actions);
    const target = recs.find((r) => r.type === 'POINT' && r.attribution?.playerId === 'h1')!;
    const ops = [{ op: 'replace' as const, seq: target.seq, action: { type: 'POINT', side: 'home' as const, attribution: { playerId: 'h2', stat: 'points', playerName: 'H2' } } }];
    const corrected = [...recs, amendRecord(recs, ops)];
    assertContract(sp as TotalsSport<unknown>, corrected, { every: 1000, label: 'AMEND' });
    const clean = recs.map((r) => (r.seq === target.seq ? { ...r, attribution: { playerId: 'h2', stat: 'points', playerName: 'H2' } } : r));
    assertSameAsClean(sp as TotalsSport<unknown>, corrected, clean, 'AMEND');
  });
});

describe('SD-19 · contract: the sports that had totals before', () => {
  test('cricket (whole-line totals): runs / wickets / catches equal the live credits', () => {
    const LIVE = new Set(['runs', 'wickets', 'catches', 'stumpings', 'runouts', 'dropped', 'runsSaved', 'runsMissed']);
    const sp: TotalsSport<cricket.CricketState> = {
      name: 'cricket', init: cricket.init, reducer: cricket.reducer, statTotals: cricketTotals as never,
      config: { overs: 2, playersPerSide: 11 }, derived: (k) => !LIVE.has(k),
    };
    const setup: ScoreAction[] = [
      { type: 'SET_KEEPER', payload: { side: 'away', id: 'k', name: 'K' } },
      { type: 'SET_STRIKER', payload: { id: 'A', name: 'A' } },
      { type: 'SET_NONSTRIKER', payload: { id: 'B', name: 'B' } },
      { type: 'SET_BOWLER', payload: { id: 'X', name: 'X' } },
    ];
    // replay as we go so each ball carries the striker / bowler like the controls
    let s = setup.reduce(cricket.reducer, cricket.init(sp.config));
    const acts: ScoreAction[] = [...setup];
    const push = (a: ScoreAction) => { acts.push(a); s = cricket.reducer(s, a); };
    const ball = (type: string, payload: Record<string, unknown>, extra: Partial<ScoreAction> = {}) =>
      push({ type, side: s.battingSide, payload: { strikerId: s.strikerId, strikerName: s.strikerName, bowlerId: s.bowlerId, bowlerName: s.bowlerName, ...payload }, ...extra } as ScoreAction);
    const runs = (r: number) => ball('RUNS', { runs: r, boundary: r === 4 || r === 6 }, s.strikerId ? { attribution: { playerId: s.strikerId, stat: 'runs', by: r, playerName: s.strikerName } } : {});
    runs(1); runs(4); runs(0);
    ball('WICKET', { kind: 'caught', fielderId: 'F', fielderName: 'F', newBatId: 'C', newBatName: 'C' }, cricket.wicketAttribution({ kind: 'caught', bowler: { id: s.bowlerId, name: s.bowlerName }, fielder: { id: 'F', name: 'F' } }));
    runs(2); runs(6);
    push({ type: 'SET_BOWLER', payload: { id: 'Y', name: 'Y' } });
    runs(1); runs(0); runs(3);
    assertContract(sp, toRecords(acts), { every: 1 });
  });

  test('football (partial: keeper / on-field keys are derived)', () => {
    const sp: TotalsSport<football.FootballState> = {
      name: 'football', init: football.init, reducer: football.reducer, statTotals: keeperTotals as never, partial: true,
      derived: (k) => !['goals', 'assists', 'redCards', 'yellowCards'].includes(k),
    };
    const p = (id: string) => ({ id, name: id.toUpperCase() });
    const xi = (team: Side, gk: string, players: string[]): ScoreAction => ({ type: 'XI', payload: { team, gk: p(gk), players: players.map(p), keepers: [p(gk)] } });
    const goal = (side: Side, minute: number, half: 1 | 2, who: string): ScoreAction =>
      ({ type: 'GOAL', side, payload: { minute, half, goalType: 'open' }, attribution: { playerId: who, stat: 'goals', playerName: who.toUpperCase() } });
    const acts: ScoreAction[] = [
      { type: 'KICKOFF', payload: { at: 1, ord: true } },
      xi('home', 'hgk', ['hgk', 'hcb', 'hst']), xi('away', 'agk', ['agk', 'acb', 'ast']),
      goal('home', 20, 1, 'hst'), { type: 'NEXT_HALF', payload: { at: 2 } }, goal('home', 70, 2, 'hst'), { type: 'END', payload: { at: 3 } },
    ];
    const t = assertContract(sp, toRecords(acts), { every: 1 });
    assert.equal(t.hgk.stats.cleanSheets, 1);
  });

  test('volleyball (SD-19 set record): setsWon / setsLost derived, ≥ 0, every rostered player', () => {
    const players = { home: ['v1', 'v2'], away: ['w1', 'w2'] };
    const sp: TotalsSport<volleyball.VolleyballState> = {
      name: 'volleyball', init: volleyball.init, reducer: volleyball.reducer, partial: true, ctx: L.ctxOf(players),
      statTotals: (s, ctx) => volleyballSetRecord(s, ctx), derived: ['setsWon', 'setsLost'],
    };
    const acts: ScoreAction[] = [...L.rGame(25, 20), ...L.rGame(22, 25), ...L.rGame(15, 10)]
      .map((a) => ({ ...a, side: a.side }));
    // (sets of 25 / 25 / 15: the generic game builder gives the right totals)
    const t = assertContract(sp, toRecords(acts), { every: 10 });
    assert.deepEqual(t.v1.stats, { setsWon: 2, setsLost: 1 });
    assert.deepEqual(t.w2.stats, { setsWon: 1, setsLost: 2 });
    assert.deepEqual(mergeTotals({ v1: { side: 'home', stats: { setsPlayed: 3 } } }, t).v1.stats, { setsPlayed: 3, setsWon: 2, setsLost: 1 });
  });
});
