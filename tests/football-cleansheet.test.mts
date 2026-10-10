/**
 * SD-09 — football clean sheets, keeper minutes and the Golden Glove.
 *
 * Standard (FIFA / Opta): a clean sheet is credited to the goalkeeper on the
 * pitch the longest for a side that conceded no goal in open play (regulation
 * + extra time; penalty-shootout kicks are not goals conceded). Outfield
 * players don't get one. The Golden Glove goes to a goalkeeper: clean sheets,
 * then saves, then fewest goals conceded.
 *
 * Also: legacy replay identity — old logs (no XI stamp, no `ord`, old
 * on-target "blocked" shots, CLEAN_SHEET rows) replay to exactly the state the
 * pre-SD-08 engine produced (frozen oracle: footballLegacyEngine.mts).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { init, reducer, type FootballState } from '../src/sports/football/engine.ts';
import { keeperSpells, keeperTotals, cleanSheetKeeper, isGoalkeeper } from '../src/sports/football/keepers.ts';
import { init as legacyInit, reducer as legacyReducer } from './footballLegacyEngine.mts';
import { replayLog } from '../src/sports/amend.ts';
import { deltasBesideTotals, planStatSync } from '../src/data/statSync.ts';
import { rankAwardCandidates, TOURNAMENT_AWARD_SLOTS } from '../src/data/ratings.ts';
import type { MatchEventRecord, Player, StatLine } from '../src/core/types.ts';
import type { ScoreAction } from '../src/sports/types.ts';

type Side = 'home' | 'away';
const run = (s: FootballState, ...as: ScoreAction[]) => as.reduce(reducer, s);
const p = (id: string) => ({ id, name: id.toUpperCase() });
const xi = (team: Side, gk: string | undefined, players: string[], keepers: string[] = []): ScoreAction =>
  ({ type: 'XI', payload: { team, ...(gk ? { gk: p(gk) } : {}), players: players.map(p), keepers: keepers.map(p) } });
const goal = (side: Side, minute: number, half: 1 | 2 | 3 | 4): ScoreAction =>
  ({ type: 'GOAL', side, payload: { minute, half, goalType: 'open' }, attribution: { playerId: `${side}-st`, stat: 'goals', playerName: 'ST' } });
const sub = (side: Side, minute: number, half: 1 | 2 | 3 | 4, off: string, on: string, ids = true): ScoreAction =>
  ({ type: 'SUB', side, payload: { minute, half, offName: off.toUpperCase(), onName: on.toUpperCase(), ...(ids ? { offId: off, onId: on } : {}) } });
const red = (side: Side, minute: number, half: 1 | 2 | 3 | 4, who: string): ScoreAction =>
  ({ type: 'RED', side, payload: { minute, half }, attribution: { playerId: who, stat: 'redCards', playerName: who.toUpperCase() } });
const KO: ScoreAction = { type: 'KICKOFF', payload: { at: 1, ord: true } };
const HT: ScoreAction = { type: 'NEXT_HALF', payload: { at: 2 } };
const END: ScoreAction = { type: 'END', payload: { at: 3 } };
const start = (cfg?: Record<string, unknown>) => run(init(cfg), KO,
  xi('home', 'hgk', ['hgk', 'hcb', 'hst'], ['hgk', 'hgk2']),
  xi('away', 'agk', ['agk', 'acb', 'ast'], ['agk', 'agk2']));

describe('SD-09 · clean sheet goes to the keeper, not the back line', () => {
  test('1–0: the home keeper keeps a clean sheet (90 minutes); the away keeper conceded 1', () => {
    const s = run(start(), goal('home', 30, 1), HT, END);
    const t = keeperTotals(s);
    assert.deepEqual(t.hgk, { side: 'home', stats: { cleanSheets: 1, goalsConceded: 0, minutes: 90 } });
    assert.deepEqual(t.agk, { side: 'away', stats: { cleanSheets: 0, goalsConceded: 1, minutes: 90 } });
    // defenders get nothing (no line is created for them)
    assert.equal(t.hcb, undefined);
  });
  test('an own goal counts against the side that put it in its own net', () => {
    const s = run(start(), { type: 'OWN_GOAL', side: 'away', payload: { minute: 10, half: 1, scorerName: 'HCB' } }, HT, END);
    assert.equal(keeperTotals(s).hgk.stats.goalsConceded, 1);
    assert.equal(keeperTotals(s).hgk.stats.cleanSheets, 0);
  });
});

describe('SD-09 · the longest-serving keeper', () => {
  test('keeper off at 60\' (injury): the starter played 60, the sub 30 → starter gets it', () => {
    const s = run(start(), HT, sub('home', 60, 2, 'hgk', 'hgk2'), END);
    const t = keeperTotals(s);
    assert.equal(t.hgk.stats.minutes, 60);
    assert.equal(t.hgk2.stats.minutes, 30);
    assert.equal(t.hgk.stats.cleanSheets, 1);
    assert.equal(t.hgk2.stats.cleanSheets, 0);
  });
  test('keeper off at 30\': the replacement played 60 → he gets it (the old code gave it to the starter)', () => {
    const s = run(start(), sub('home', 30, 1, 'hgk', 'hgk2'), HT, END);
    const t = keeperTotals(s);
    assert.equal(t.hgk2.stats.cleanSheets, 1);
    assert.equal(t.hgk.stats.cleanSheets, 0);
  });
  test('goals conceded follow whoever was in goal', () => {
    const s = run(start(), goal('away', 20, 1), sub('home', 30, 1, 'hgk', 'hgk2'), HT, goal('away', 70, 2), END);
    const t = keeperTotals(s);
    assert.equal(t.hgk.stats.goalsConceded, 1);
    assert.equal(t.hgk2.stats.goalsConceded, 1);
  });
  test('older name-only sub events resolve by name', () => {
    const s = run(start(), sub('home', 30, 1, 'hgk', 'hgk2', false), HT, END);
    assert.equal(cleanSheetKeeper(s, 'home')?.id, 'hgk2');
  });
  test('keeper sent off; a bench keeper comes on for an outfielder → he takes over', () => {
    const s = run(start(), red('home', 20, 1, 'hgk'), sub('home', 22, 1, 'hst', 'hgk2'), HT, END);
    const sp = keeperSpells(s, 'home');
    assert.equal(sp.find((x) => x.id === 'hgk')?.minutes, 20);
    assert.equal(sp.find((x) => x.id === 'hgk2')?.minutes, 68);
    assert.equal(cleanSheetKeeper(s, 'home')?.id, 'hgk2');
  });
  test('first-half added time breaks the tie: off at 45+2\' → the starter was on longer', () => {
    let s = start();
    s = reducer(s, { type: 'SET_STOPPAGE', payload: { minutes: 3 } });
    s = run(s, sub('home', 47, 1, 'hgk', 'hgk2'), HT, END);
    const t = keeperTotals(s);
    assert.equal(t.hgk.stats.minutes, 45);
    assert.equal(t.hgk2.stats.minutes, 45);
    assert.equal(t.hgk.stats.cleanSheets, 1);
  });
});

describe('SD-09 · every completion path, incl. penalties', () => {
  test('0–0 then a shootout: both keepers keep a clean sheet; kicks are not goals conceded', () => {
    let s = start({ decider: 'penalties' });
    s = run(s, HT, END, { type: 'START_SHOOTOUT' });
    for (const [side, scored] of [['home', true], ['away', true], ['home', true], ['away', false], ['home', true], ['away', false], ['home', true]] as const) {
      s = reducer(s, { type: 'PEN', side, payload: { scored } });
    }
    assert.equal(s.shootoutWinner, 'home');
    const t = keeperTotals(s);
    assert.deepEqual(t.hgk.stats, { cleanSheets: 1, goalsConceded: 0, minutes: 90 });
    assert.deepEqual(t.agk.stats, { cleanSheets: 1, goalsConceded: 0, minutes: 90 });
  });
  test('0–0 after extra time, then penalties: 120 minutes', () => {
    let s = start({ decider: 'extra_time' });
    s = run(s, HT, END, { type: 'START_EXTRA_TIME' }, { type: 'KICKOFF', payload: { at: 4 } }, { type: 'NEXT_HALF', payload: { at: 5 } }, END, { type: 'START_SHOOTOUT' });
    assert.equal(keeperTotals(s).hgk.stats.minutes, 120);
    assert.equal(keeperTotals(s).hgk.stats.cleanSheets, 1);
  });
  test('1–1 then penalties: no clean sheet for anyone', () => {
    const s = run(start({ decider: 'penalties' }), goal('home', 10, 1), goal('away', 80, 2), HT, END, { type: 'START_SHOOTOUT' });
    assert.equal(keeperTotals(s).hgk.stats.cleanSheets, 0);
    assert.equal(keeperTotals(s).agk.stats.cleanSheets, 0);
  });
  test('the XI stamp is accepted after full time (stamped on the way to the shootout)', () => {
    let s = run(init({ decider: 'penalties' }), KO, HT, END);
    s = reducer(s, xi('home', 'hgk', ['hgk']));
    assert.equal(s.xi?.home?.gk?.id, 'hgk');
  });
});

describe('SD-09 · without a full lineup', () => {
  test('a keeper is the GK slot or a profile position like "Goalkeeper"', () => {
    for (const p of ['GK', 'gk', 'Goalkeeper', 'goal keeper', 'Goal-keeper', 'Keeper']) assert.equal(isGoalkeeper(p), true, p);
    for (const p of ['CB', 'Striker', 'Wicket-keeper', '', undefined]) assert.equal(isGoalkeeper(p), false, String(p));
  });
  test('only the keeper known (squad\'s GK, no XI): he gets the clean sheet', () => {
    const s = run(init({}), KO, { type: 'XI', payload: { team: 'home', gk: p('hgk'), players: [], keepers: [p('hgk')] } }, HT, END);
    assert.deepEqual(keeperTotals(s).hgk.stats, { cleanSheets: 1, goalsConceded: 0, minutes: 90 });
  });
  test('no keeper known → no clean sheet for that side (never a defender)', () => {
    const s = run(init({}), KO, { type: 'XI', payload: { team: 'home', players: [p('hcb')], keepers: [] } }, HT, END);
    assert.deepEqual(keeperTotals(s), {});
  });
  test('old logs (no XI stamp) → no totals, so legacy CLEAN_SHEET increments stand', () => {
    const s = run(init({}), { type: 'KICKOFF', payload: { at: 1 } }, HT, END);
    assert.deepEqual(keeperTotals(s), {});
  });
});

describe('SD-09 · re-evaluated after a correction (#05 AMEND)', () => {
  const rec = (seq: number, a: ScoreAction): MatchEventRecord =>
    ({ seq, type: a.type, side: a.side ?? null, payload: a.payload ?? {}, attribution: a.attribution ?? null });
  const plugin = { createInitialState: init, reducer };
  const actions: ScoreAction[] = [KO, xi('home', 'hgk', ['hgk']), xi('away', 'agk', ['agk']), goal('away', 30, 1), HT, END];
  const log = actions.map((a, i) => rec(i + 1, a));
  test('voiding the only goal turns 0–1 into 0–0: the home keeper now has a clean sheet', () => {
    assert.equal(keeperTotals(replayLog(plugin, {}, log)).hgk.stats.cleanSheets, 0);
    const amend: MatchEventRecord = { seq: 7, type: 'AMEND', side: null, payload: { ops: [{ op: 'void', seq: 4 }], lines: [], byName: 'x', deltas: [] }, attribution: null };
    const after = replayLog(plugin, {}, [...log, amend]);
    assert.equal(after.away, 0);
    assert.equal(keeperTotals(after).hgk.stats.cleanSheets, 1);
  });
  test('the sync owns only the keeper keys; every other correction delta still applies', () => {
    const totals = keeperTotals(run(start(), HT, END));
    const deltas = [{ playerId: 'x', stat: 'goals', by: -1 }, { playerId: 'hgk', stat: 'cleanSheets', by: 1 }, { playerId: 'y', stat: 'assists', by: -1 }];
    assert.deepEqual(deltasBesideTotals(deltas, totals).map((d) => d.stat), ['goals', 'assists']);
    // old logs: no totals → every delta still applies (behaviour unchanged)
    assert.equal(deltasBesideTotals(deltas, {}).length, 3);
  });
  test('absolute sync: keeper line set, a stale legacy defender clean sheet in this match is zeroed', () => {
    const totals = keeperTotals(run(start(), HT, END));
    const writes = planStatSync(
      [{ id: 'l1', playerId: 'hgk', stats: { saves: 3 } }, { id: 'l2', playerId: 'hcb', stats: { cleanSheets: 1, tackles: 2 } }],
      totals, (id) => id,
    );
    assert.deepEqual(writes.find((w) => w.playerId === 'hgk'), { kind: 'update', id: 'l1', playerId: 'hgk', stats: { saves: 3, cleanSheets: 1, goalsConceded: 0, minutes: 90 } });
    assert.deepEqual(writes.find((w) => w.playerId === 'hcb'), { kind: 'update', id: 'l2', playerId: 'hcb', stats: { cleanSheets: 0, tackles: 2 } });
  });
});

describe('SD-09 · Golden Glove is goalkeeper-only', () => {
  const pl = (id: string, position?: string): Player => ({ id, fullName: id, sportDetails: position ? { football: { position } } : undefined } as unknown as Player);
  const line = (playerId: string, matchId: string, stats: Record<string, number>): StatLine =>
    ({ id: `${playerId}-${matchId}`, playerId, matchId, sport: 'football', stats } as unknown as StatLine);
  const players = [pl('cb', 'Centre-back'), pl('gk1', 'Goalkeeper'), pl('gk2'), pl('gk3', 'GK')];
  const lines = [
    line('cb', 'm1', { cleanSheets: 1 }), line('cb', 'm2', { cleanSheets: 1 }), line('cb', 'm3', { cleanSheets: 1 }), // legacy defender credit
    line('gk1', 'm1', { cleanSheets: 1, saves: 2 }), line('gk1', 'm2', { cleanSheets: 1, saves: 3 }),
    line('gk2', 'm1', { cleanSheets: 1, saves: 4, goalsConceded: 0, minutes: 90 }), line('gk2', 'm2', { cleanSheets: 1, saves: 1, goalsConceded: 0, minutes: 90 }),
    line('gk3', 'm1', { cleanSheets: 1, saves: 5, goalsConceded: 0 }), line('gk3', 'm3', { cleanSheets: 1, goalsConceded: 2 }),
  ];
  test('slot is named Golden Glove; a defender never ranks', () => {
    assert.equal(TOURNAMENT_AWARD_SLOTS.football.find((x) => x.slot === 'cleanSheets')?.label, 'Golden Glove');
    const ranked = rankAwardCandidates(lines, players, 'football', 'cleanSheets');
    assert.ok(!ranked.some((c) => c.playerId === 'cb'));
  });
  test('clean sheets → saves → fewer conceded (gk2 kept goal without a GK listing)', () => {
    const ranked = rankAwardCandidates(lines, players, 'football', 'cleanSheets');
    // all on 2 clean sheets; gk1 5 saves, gk2 5 saves 0 conceded, gk3 5 saves 2 conceded
    assert.deepEqual(ranked.map((c) => c.playerId), ['gk1', 'gk2', 'gk3']);
    assert.match(ranked.find((c) => c.playerId === 'gk2')!.detail, /2 clean sheets · 5 saves · 0 conceded · 2 m/);
  });
});

describe('SD-08/09 · legacy replay identity (frozen pre-change engine)', () => {
  // An old-version log: kickoff without `ord`, no XI, name-only subs, an old
  // "blocked" shot recorded on target + a defenceContribution, CLEAN_SHEET rows,
  // stoppage, a correction (REMOVE_EVENT), extra time and a shootout.
  const log: ScoreAction[] = [
    { type: 'KICKOFF', payload: { at: 1000, possSide: 'home' } },
    { type: 'GOAL', side: 'home', payload: { minute: 12, half: 1, goalType: 'open' }, attribution: { playerId: 'h9', stat: 'goals', playerName: 'H9' } },
    { type: 'ASSIST', side: 'home', payload: { minute: 12, half: 1 }, attribution: { playerId: 'h10', stat: 'assists', playerName: 'H10' } },
    { type: 'STAT', side: 'away', payload: { kind: 'shot', onTarget: true, minute: 20, half: 1, at: 2000 }, attribution: { playerId: 'a9', stat: 'shots', playerName: 'A9', extra: { shotsOnTarget: 1 } } },
    { type: 'STAT', side: 'home', payload: { kind: 'defenceContribution', minute: 20, half: 1, at: 2001, possSide: 'home' }, attribution: { playerId: 'h4', stat: 'defensiveContributions', playerName: 'H4' } },
    { type: 'SET_STOPPAGE', payload: { minutes: 2 } },
    { type: 'YELLOW', side: 'away', payload: { minute: 46, half: 1 }, attribution: { playerId: 'a5', stat: 'yellowCards', playerName: 'A5' } },
    { type: 'NEXT_HALF', payload: { at: 3000 } },
    { type: 'KICKOFF', payload: { at: 4000 } },
    { type: 'SUB', side: 'away', payload: { minute: 60, half: 2, offName: 'A1', onName: 'A12' } },
    { type: 'GOAL', side: 'away', payload: { minute: 88, half: 2, goalType: 'penalty' }, attribution: { playerId: 'a9', stat: 'goals', playerName: 'A9' } },
    { type: 'STAT', side: 'home', payload: { kind: 'foul', minute: 89, half: 2, secondName: 'A7', possSide: 'away', at: 5000 }, attribution: { playerId: 'h6', stat: 'fouls', playerName: 'H6' } },
    { type: 'REMOVE_EVENT', payload: { id: 7, target: 'stat' } }, // the foul
    { type: 'CLEAN_SHEET', side: 'home', attribution: { playerId: 'h1', stat: 'cleanSheets', playerName: 'H1' } },
    { type: 'END', payload: { at: 6000 } },
    { type: 'START_EXTRA_TIME', payload: { etMinutes: 15 } },
    { type: 'KICKOFF', payload: { at: 7000 } },
    { type: 'NEXT_HALF', payload: { at: 8000 } },
    { type: 'KICKOFF', payload: { at: 9000 } },
    { type: 'END', payload: { at: 10000 } },
    { type: 'START_SHOOTOUT' },
    ...([['home', true], ['away', true], ['home', false], ['away', true], ['home', true], ['away', true], ['home', true], ['away', true], ['home', false]] as const)
      .map(([side, scored]) => ({ type: 'PEN', side, payload: { scored } }) as ScoreAction),
  ];
  const cfg = { decider: 'extra_time', halfMinutes: 45 };
  test('the current engine replays an old log to exactly the old state', () => {
    const now = log.reduce(reducer, init(cfg));
    const old = log.reduce(legacyReducer, legacyInit(cfg));
    assert.deepEqual(now, old);
    assert.equal(now.minuteOrdinal, undefined);
    assert.equal(now.xi, undefined);
  });
  test('the oracle has not drifted', () => {
    const old = log.reduce(legacyReducer, legacyInit(cfg));
    assert.deepEqual({ h: old.home, a: old.away, half: old.half, w: old.shootoutWinner, ev: old.events.length, st: old.stats.length },
      { h: 1, a: 1, half: 4, w: 'away', ev: 4, st: 2 });
  });
});

describe('SD-09: tournament leaders rank clean sheets for keepers only', () => {
  test('a defender with an old CLEAN_SHEET credit is not a clean-sheet leader', async () => {
    const { leadersByKey } = await import('../src/data/standings.ts');
    const line = (playerId: string, stats: Record<string, number>) => ({ id: playerId, matchId: 'm', playerId, sport: 'football', stats, won: false }) as never;
    const players = [
      { id: 'gk', fullName: 'Keeper', sportDetails: { football: { position: 'GK' } } },
      { id: 'df', fullName: 'Defender', sportDetails: { football: { position: 'CB' } } },
      { id: 'k2', fullName: 'Stand-in', sportDetails: {} },
    ] as never;
    const out = leadersByKey([line('gk', { cleanSheets: 1 }), line('df', { cleanSheets: 2 }), line('k2', { cleanSheets: 1, goalsConceded: 0 })], players, 'football', 'cleanSheets');
    assert.deepEqual(out.map((l) => l.playerId).sort(), ['gk', 'k2']);
  });
});
