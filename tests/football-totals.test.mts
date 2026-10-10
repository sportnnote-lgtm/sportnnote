/**
 * SD-30 (FB-06 / FB-13) — football's absolute statTotals (src/sports/football/totals.ts).
 *
 * The actions below are built exactly as the controls dispatch them
 * (src/sports/football/index.tsx: recordGoal / attr / recordCard / recordStat /
 * recordOwnGoal / removeEvent / the voice "refine" UNDO_GOAL), so the live sums
 * are what useLiveMatch writes. Covers: clean log = live increments (+ every
 * undo prefix), own goals, corrections (timeline remove / edit, AMEND), the
 * unresolved-name safeguard, name healing for older logs, and legacy replay
 * identity against the frozen pre-SD-08 engine.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { assertContract, assertSameAsClean, amendRecord, toRecords, replay, liveSums, contractErrors, type TotalsSport } from './statTotalsHarness.mts';
import type { ScoreAction, StatTotalsContext } from '../src/sports/types.ts';
import * as football from '../src/sports/football/engine.ts';
import { footballStatTotals, footballBoxTotals, FOOTBALL_DERIVED_KEYS, GOAL_STAT, STAT_KEY, statCredits } from '../src/sports/football/totals.ts';
import type { GoalType, BodyPart, StatKind } from '../src/sports/football/events.ts';
import { planStatSync } from '../src/data/statSync.ts';
import { init as legacyInit, reducer as legacyReducer } from './footballLegacyEngine.mts';

type Side = 'home' | 'away';
const NAME = (id: string) => id.toUpperCase();
const sp = (ctx?: StatTotalsContext, config: Record<string, unknown> = { sinBinMinutes: 10 }): TotalsSport<football.FootballState> => ({
  name: 'football', init: football.init, reducer: football.reducer, statTotals: footballStatTotals, partial: true,
  derived: FOOTBALL_DERIVED_KEYS, config, ctx,
});

// ---- the controls' dispatches (pid = new logs; `legacy` drops it) ----
let minute = 1;
let half: 1 | 2 = 1;
const at = () => ({ minute: minute++, half });
const attr = (id: string, stat: string, extra?: Record<string, number>, by?: number) =>
  ({ playerId: id, stat, playerName: NAME(id), ...(extra ? { extra } : {}), ...(by !== undefined ? { by } : {}) });
const goal = (side: Side, id: string, goalType: GoalType = 'open', bodyPart?: BodyPart): ScoreAction =>
  ({ type: 'GOAL', side, payload: { goalType, bodyPart, pid: id, ...at() }, attribution: attr(id, 'goals', { shots: 1, shotsOnTarget: 1, [GOAL_STAT[goalType]]: 1 }) });
const assist = (side: Side, id: string): ScoreAction => ({ type: 'ASSIST', side, payload: { pid: id, ...at() }, attribution: attr(id, 'assists') });
const card = (side: Side, id: string, color: 'yellow' | 'red', secondYellow = false): ScoreAction =>
  ({ type: color === 'yellow' ? 'YELLOW' : 'RED', side, payload: { pid: id, ...(secondYellow ? { secondYellow: true } : {}), ...at() }, attribution: attr(id, color === 'yellow' ? 'yellowCards' : 'redCards') });
const og = (awardedTo: Side, id: string): ScoreAction => ({ type: 'OWN_GOAL', side: awardedTo, payload: { scorerName: NAME(id), pid: id, ...at() } });
const stat = (side: Side, kind: StatKind, id?: string, detail: Record<string, boolean> = {}): ScoreAction => {
  const key = STAT_KEY[kind];
  const c = statCredits({ kind, ...detail });
  const { [key ?? '']: _k, ...extra } = c;
  return {
    type: 'STAT', side, payload: { kind, at: 1, ...detail, playerName: id ? NAME(id) : undefined, ...at() },
    attribution: id && key ? attr(id, key, Object.keys(extra).length ? extra : undefined) : undefined,
  };
};
const sinbin = (side: Side, id: string): ScoreAction => ({ type: 'SUSPEND', side, payload: { minutes: 10, ...at() }, attribution: attr(id, 'sinBins') });
const sub = (side: Side, off: string, on: string): ScoreAction => ({ type: 'SUB', side, payload: { offName: NAME(off), onName: NAME(on), offId: off, onId: on, ...at() } });
const p = (id: string) => ({ id, name: NAME(id) });
const xi = (team: Side, gk: string, players: string[], keepers: string[] = [gk]): ScoreAction =>
  ({ type: 'XI', payload: { team, gk: p(gk), players: players.map(p), keepers: keepers.map(p) } });
/** removeEvent (timeline editor): the reducer drops it, the negative credits reverse it. */
const removeGoal = (id: number, scorer: string, goalType: GoalType = 'open', assister?: string): ScoreAction[] => [
  { type: 'REMOVE_EVENT', payload: { id, target: 'event' }, attribution: attr(scorer, 'goals', { shots: -1, shotsOnTarget: -1, [GOAL_STAT[goalType]]: -1 }, -1) },
  ...(assister ? [{ type: 'REMOVE_EVENT', payload: { id: -1, target: 'stat' }, attribution: attr(assister, 'assists', undefined, -1) } as ScoreAction] : []),
];
const removeCard = (id: number, who: string, color: 'yellow' | 'red'): ScoreAction =>
  ({ type: 'REMOVE_EVENT', payload: { id, target: 'event' }, attribution: attr(who, color === 'yellow' ? 'yellowCards' : 'redCards', undefined, -1) });
/** As an older version logged it: no `pid` (SD-30) and no sub ids (SD-09). */
const legacy = (a: ScoreAction): ScoreAction => {
  if (!a.payload) return a;
  const { pid: _p, offId: _o, onId: _i, ...payload } = a.payload;
  return { ...a, payload };
};

const KICK: ScoreAction[] = [
  { type: 'KICKOFF', payload: { at: 1, ord: true } },
  xi('home', 'hgk', ['hgk', 'hcb', 'hmf', 'hst']), xi('away', 'agk', ['agk', 'acb', 'amf', 'ast']),
];
/** A full match: every goal type, a header, assists, an own goal, both cards
 *  and a second yellow, shots on / off / blocked + the block, saves, fouls,
 *  passes, a penalty won / missed / saved, a sub and a sin-bin. */
function match(): ScoreAction[] {
  minute = 1; half = 1;
  return [
    ...KICK,
    stat('home', 'shot', 'hst', { onTarget: true }), stat('away', 'save', 'agk'),
    goal('home', 'hst'), assist('home', 'hmf'),
    stat('away', 'shot', 'ast', { onTarget: false, blocked: true }), stat('home', 'block', 'hcb'),
    stat('away', 'shot', 'ast', { onTarget: false }),
    og('away', 'hcb'), // home's centre-back into his own net → away's goal
    stat('home', 'foul', 'hmf'), card('home', 'hmf', 'yellow'),
    stat('home', 'pass', 'hmf', { complete: true }), stat('home', 'pass', 'hmf', { complete: false }),
    stat('home', 'tackle', 'hcb'), stat('away', 'interception', 'acb'), stat('home', 'corner'),
    goal('away', 'ast', 'freekick'),
    sub('home', 'hmf', 'hsub'),
    stat('home', 'penaltyWon', 'hst'), stat('home', 'penaltyMissed', 'hsub'), stat('away', 'save', 'agk'),
    stat('home', 'penaltyWon', 'hsub'), goal('home', 'hst', 'penalty'),
    goal('home', 'hsub', 'open', 'head'), assist('home', 'hst'),
    card('away', 'acb', 'yellow'), card('away', 'acb', 'yellow'), card('away', 'acb', 'red', true),
    card('away', 'amf', 'red'), sinbin('home', 'hcb'),
    { type: 'NEXT_HALF', payload: { at: 2 } },
    { type: 'END', payload: { at: 3 } },
  ];
}

describe('SD-30 · football statTotals = the live increments', () => {
  test('a clean log (and every undo prefix) — every credited key owned and absolute', () => {
    const acts = match();
    const t = assertContract(sp(), toRecords(acts), { every: 1 });
    // goals by type, headers, assists
    assert.deepEqual(
      { g: t.hst.stats.goals, op: t.hst.stats.openPlayGoals, pen: t.hst.stats.penaltyGoals, a: t.hst.stats.assists, sh: t.hst.stats.shots, sot: t.hst.stats.shotsOnTarget, pw: t.hst.stats.penaltiesWon },
      { g: 2, op: 1, pen: 1, a: 1, sh: 3, sot: 3, pw: 1 },
    );
    assert.deepEqual({ g: t.hsub.stats.goals, head: t.hsub.stats.headedGoals, pm: t.hsub.stats.penaltiesMissed, pw: t.hsub.stats.penaltiesWon }, { g: 1, head: 1, pm: 1, pw: 1 });
    assert.equal(t.hmf.stats.assists, 1);
    assert.deepEqual({ g: t.ast.stats.goals, fk: t.ast.stats.freekickGoals, sh: t.ast.stats.shots, sot: t.ast.stats.shotsOnTarget }, { g: 1, fk: 1, sh: 3, sot: 1 });
    // saves / blocks / fouls / passes / cards / sin-bin
    assert.equal(t.agk.stats.saves, 2);
    assert.deepEqual({ b: t.hcb.stats.blocks, tk: t.hcb.stats.tackles, sb: t.hcb.stats.sinBins }, { b: 1, tk: 1, sb: 1 });
    assert.deepEqual({ f: t.hmf.stats.fouls, y: t.hmf.stats.yellowCards, p: t.hmf.stats.passes, pc: t.hmf.stats.passesComplete }, { f: 1, y: 1, p: 2, pc: 1 });
    assert.deepEqual({ y: t.acb.stats.yellowCards, r: t.acb.stats.redCards }, { y: 2, r: 1 });
    assert.equal(t.amf.stats.redCards, 1);
    // minutes / keeper keys are merged in (SD-29 / SD-09)
    assert.equal(typeof t.hst.stats.minutes, 'number');
    assert.equal(t.agk.stats.goalsConceded, 3);
  });

  test('own goal: `ownGoals` to the player (his own side), never a goal; the goal is the other side\'s', () => {
    const acts = match();
    const s = replay(sp(), toRecords(acts));
    assert.deepEqual({ home: s.home, away: s.away }, { home: 3, away: 2 });
    const t = footballStatTotals(s);
    assert.equal(t.hcb.side, 'home');
    assert.equal(t.hcb.stats.ownGoals, 1);
    assert.equal(t.hcb.stats.goals, 0);
    assert.equal(t.hgk.stats.goalsConceded, 2, 'the own goal counts against his keeper');
    // owned on every credited line (0), so the sync can zero a stale one
    assert.equal(t.hst.stats.ownGoals, 0);
    // an OG-only player gets just ownGoals (no false zeros on a new line)
    minute = 1; half = 1;
    const only = footballBoxTotals(replay(sp(), toRecords([...KICK, og('home', 'acb')])));
    assert.deepEqual(only, { acb: { side: 'away', stats: { ownGoals: 1 } } });
  });

  test('ids ride on the events (new logs): scorer, assister, carded player, OG player', () => {
    const s = replay(sp(), toRecords(match()));
    const g = s.events.find((e) => e.type === 'goal' && e.playerName === 'HST')!;
    assert.deepEqual({ id: g.playerId, a: g.secondId, an: g.secondName }, { id: 'hst', a: 'hmf', an: 'HMF' });
    assert.equal(s.events.find((e) => e.type === 'owngoal')!.playerId, 'hcb');
    assert.ok(s.events.filter((e) => e.type === 'yellow' || e.type === 'red').every((e) => e.playerId));
  });
});

describe('SD-30 · corrections and undo', () => {
  test('timeline remove (goal + its assist) and edit (card to another player) = the clean match', () => {
    minute = 1; half = 1;
    const base = [...KICK, goal('home', 'hst'), assist('home', 'hmf'), card('away', 'acb', 'yellow'), goal('home', 'hmf')];
    const ids = replay(sp(), toRecords(base)).events.map((e) => e.id); // [goal, yellow, goal]
    const corrected = [
      ...base,
      ...removeGoal(ids[0], 'hst', 'open', 'hmf'),
      removeCard(ids[1], 'acb', 'yellow'), card('away', 'amf', 'yellow'), // edit = remove + re-enter
    ];
    minute = 1; half = 1;
    const clean = [...KICK, goal('home', 'hmf'), card('away', 'amf', 'yellow')];
    assertSameAsClean(sp(), toRecords(corrected), toRecords(clean), 'remove + edit');
    const t = footballStatTotals(replay(sp(), toRecords(corrected)));
    assert.equal(t.hst?.stats.goals ?? 0, 0);
    assert.equal(t.hmf.stats.assists, 0);
  });

  test('AMEND (#05): a card re-credited to another player, a goal voided with its assist', () => {
    minute = 1; half = 1;
    const red = card('away', 'acb', 'red');
    const awayGoal = goal('away', 'ast');
    const recs = toRecords([...KICK, goal('home', 'hst'), assist('home', 'hmf'), red, awayGoal]);
    const seqOf = (type: string, n = 0) => recs.filter((r) => r.type === type)[n].seq;
    // the editor re-credits the card in place (same minute)
    const fixed: ScoreAction = { ...card('away', 'amf', 'red'), payload: { pid: 'amf', minute: red.payload!.minute, half: 1 } };
    const am = amendRecord(recs, [
      { op: 'replace', seq: seqOf('RED'), action: fixed },
      { op: 'void', seq: seqOf('GOAL') }, { op: 'void', seq: seqOf('ASSIST') },
    ]);
    const clean = toRecords([...KICK, fixed, awayGoal]);
    assertSameAsClean(sp(), [...recs, am], clean, 'AMEND');
  });

  test('voice refine (UNDO_GOAL + a re-typed goal) reverses the first goal live', () => {
    minute = 1; half = 1;
    const first = goal('home', 'hst', 'open');
    const undo: ScoreAction = { type: 'UNDO_GOAL', side: 'home', attribution: attr('hst', 'goals', { shots: -1, shotsOnTarget: -1, openPlayGoals: -1 }, -1) };
    const acts = [...KICK, first, undo, goal('home', 'hst', 'penalty')];
    const t = assertContract(sp(), toRecords(acts), { every: 1 });
    assert.deepEqual({ g: t.hst.stats.goals, op: t.hst.stats.openPlayGoals, pen: t.hst.stats.penaltyGoals }, { g: 1, op: 0, pen: 1 });
  });

  test('the sync sets drifted lines absolutely and zeroes a stale owned key', () => {
    const t = footballStatTotals(replay(sp(), toRecords(match())));
    const writes = planStatSync([
      { id: 'L1', playerId: 'hst', stats: { goals: 4, assists: 1 } }, // a retried upload doubled the goals
      { id: 'L2', playerId: 'ghost', stats: { yellowCards: 1 } }, // a card later moved to someone else
    ], t, (id) => id);
    const l1 = writes.find((w) => w.playerId === 'hst')!;
    assert.equal(l1.stats.goals, 2);
    assert.equal(writes.find((w) => w.playerId === 'ghost')!.stats.yellowCards, 0);
  });
});

describe('SD-30 · older logs: names → ids, and the safeguard', () => {
  test('a pid-less log heals through the XI stamp / subs / stat events, and equals the live sums', () => {
    const acts = match().map(legacy);
    const recs = toRecords(acts);
    const s = replay(sp(), recs);
    assert.ok(s.events.every((e) => e.type === 'sub' || !e.secondId), 'no ids invented on old events');
    const t = assertContract(sp(), recs, { every: 1 });
    assert.equal(t.hcb.stats.ownGoals, 1);
    // the same totals as the match logged with ids (minutes aside: SD-29 gives a
    // name-only sub's player none — fieldTime.ts)
    const noMin = (x: typeof t) => Object.fromEntries(Object.entries(x).map(([id, l]) => [id, { side: l.side, stats: Object.fromEntries(Object.entries(l.stats).filter(([k]) => k !== 'minutes')) }]));
    assert.deepEqual(noMin(t), noMin(footballStatTotals(replay(sp(), toRecords(match())))), 'same totals as the same match with ids');
  });

  test('an unresolved name leaves the goal / card keys out entirely (stat keys stay)', () => {
    minute = 1; half = 1;
    // no XI, no squads: "Ghost" (id g9) is named only on his goal
    const acts = [{ type: 'KICKOFF', payload: { at: 1 } } as ScoreAction, legacy(goal('home', 'g9')), stat('home', 'tackle', 'hcb'), legacy(card('home', 'hcb', 'yellow'))];
    const recs = toRecords(acts);
    const t = footballStatTotals(replay(sp(), recs));
    assert.deepEqual(Object.keys(t), ['hcb']);
    assert.equal(t.hcb.stats.tackles, 1);
    for (const k of ['goals', 'shots', 'yellowCards', 'assists']) assert.ok(!(k in t.hcb.stats), `${k} not owned`);
    assert.deepEqual(contractErrors(sp(), t, liveSums(recs)), []);
    // the matchday squads (ctx) resolve him → every key back, equal to live
    const ctx: StatTotalsContext = { players: { home: [p('g9'), p('hcb')], away: [] } };
    const healed = assertContract(sp(ctx), recs, { every: 1 });
    assert.equal(healed.g9.stats.goals, 1);
    assert.equal(healed.hcb.stats.yellowCards, 1);
  });

  test('an unresolved own-goal name drops only ownGoals', () => {
    minute = 1; half = 1;
    const recs = toRecords([...KICK, legacy(og('home', 'nobody')), goal('home', 'hst')]);
    const t = footballStatTotals(replay(sp(), recs));
    assert.ok(Object.values(t).every((l) => !('ownGoals' in l.stats)));
    assert.equal(t.hst.stats.goals, 1);
  });

  test('a name used by two ids on one side is ambiguous → unresolved', () => {
    minute = 1; half = 1;
    const ctx: StatTotalsContext = { players: { home: [{ id: 'x1', name: 'SAM' }, { id: 'x2', name: 'SAM' }], away: [] } };
    const g: ScoreAction = { type: 'GOAL', side: 'home', payload: { goalType: 'open', minute: 3, half: 1 }, attribution: { playerId: 'x1', stat: 'goals', playerName: 'SAM', extra: { shots: 1, shotsOnTarget: 1, openPlayGoals: 1 } } };
    const t = footballStatTotals(replay(sp(ctx), toRecords([{ type: 'KICKOFF', payload: { at: 1 } }, g])), ctx);
    assert.ok(!t.x1 && !t.x2);
  });
});

describe('SD-30 · legacy replay identity (frozen pre-SD-08 engine)', () => {
  test('an old log with goals / assists / own goal / cards replays to exactly the old state', () => {
    const cfg = { halfMinutes: 45 };
    const acts = match().filter((a) => a.type !== 'XI' && a.type !== 'SUSPEND').map(legacy)
      // (and as that engine logged it: no ordinal kickoff, no SD-08 `blocked`)
      .map((a) => (a.type === 'KICKOFF' ? { ...a, payload: { at: 1 } } : a))
      .map((a) => (a.payload?.blocked ? { ...a, payload: { ...a.payload, blocked: undefined } } : a));
    const now = acts.reduce(football.reducer, football.init(cfg));
    const old = acts.reduce(legacyReducer, legacyInit(cfg));
    assert.deepEqual(now, old);
  });
});
