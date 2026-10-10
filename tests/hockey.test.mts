/**
 * SD-101 — hockey (FIH) born deep on the Wave 1 foundations:
 *  - goals by type (field / penalty corner / stroke) with scorer + assist, PC
 *    awards and conversion, strokes missed / saved, shots and keeper saves;
 *  - the stoppable game clock: periods, auto-stop on goals and PCs (FIH),
 *    events stamped in game seconds;
 *  - cards: green 2', yellow 5–10' (clamped), red permanent — the side plays
 *    short, a timed suspension ends by itself, and a stopped clock stops it;
 *  - the FIH shoot-out (5 each, early decision, sudden death with the order
 *    reversed) and the result it gives (level score + shoot-out winner);
 *  - statTotals (SD-19 contract via the harness: live sums, every undo prefix,
 *    live REMOVE_EVENT corrections, #05 AMEND re-credit / void);
 *  - minutes, keeper goals conceded and clean sheets (keeper change by sub);
 *  - the box score source; standings with the FIH presets (3-1-0, shoot-out
 *    bonus, the FIH tie-break chain); career, leaders and awards; the score
 *    line ("SO 4–3"), ticker detail and goal flash; the timeline rows.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  init, reducer, isComplete, result, matchSec, clockFace, periodName, eventCredits, creditAttribution, currentKeeper,
  decideShootout, nextShooter, soScore, teamFigures, pcConversion, hockeyScoreLine,
  type HockeyState, type Side, type GoalType, type CardColour, type HockeyEvent,
} from '../src/sports/hockey/engine.ts';
import { hockeyTotals, hockeyLiveField, hockeyField, DERIVED_KEYS } from '../src/sports/hockey/totals.ts';
import { hockeyBox } from '../src/sports/hockey/box.ts';
import { hockeyStats } from '../src/sports/hockey/stats.ts';
import { hockeyTimeline } from '../src/sports/hockey/timeline.ts';
import { hockeyTickerDetail, hockeyTickerFlash } from '../src/sports/hockey/ticker.ts';
import { buildBoxTable, comparisonRows } from '../src/sports/boxScore.ts';
import { careerFromSchema, validateSchema } from '../src/sports/statSchema.ts';
import { matchScoreLine } from '../src/sports/scoreline.ts';
import { FIELD_RULES } from '../src/sports/onField.ts';
import { STAT_SCHEMAS } from '../src/sports/statSchemas.ts';
import {
  teamStandings, standingsConfigFromFormat, standingsPresets, matchPoints, NEW_TOURNAMENT_POINTS, setStandingsUnitsProvider,
  setStandingsPointsProvider, setStandingsScoreProvider, categoryLeaders,
} from '../src/data/standings.ts';
import { rankAwardCandidates } from '../src/data/ratings.ts';
import { assertContract, assertSameAsClean, amendRecord, toRecords, type TotalsSport } from './statTotalsHarness.mts';
import type { ScoreAction } from '../src/sports/types.ts';
import { replayLog } from '../src/sports/amend.ts';
import type { Match, Player, SportId, StatLine } from '../src/core/types.ts';

/* ---------------------------------- helpers --------------------------------- */

const HOME = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8', 'h9', 'h10', 'hgk'];
const AWAY = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'a10', 'agk'];
const nm = (id: string) => id.toUpperCase();
const P = (id?: string) => (id ? { id, fullName: nm(id) } : null);
let u = 0;
/** One action as the controls fire it: game second + period + a stable uid,
 *  credits from `eventCredits` (exactly what the live stat lines get). */
function A(type: string, side: Side | undefined, sec: number, period: number, ev: Partial<HockeyEvent> = {}, payload: Record<string, unknown> = {}): ScoreAction {
  const cr = eventCredits({ type: ev.type ?? 'pc', ...ev } as HockeyEvent);
  const a: ScoreAction = { type, ...(side ? { side } : {}), payload: { ...payload, uid: `u${++u}`, sec, period } };
  const a1 = creditAttribution(cr.first);
  const a2 = creditAttribution(cr.second);
  if (a1) a.attribution = a1;
  if (a2) a.attribution2 = a2;
  return a;
}
const xi = (team: Side) => ({ type: 'XI', payload: { team, players: (team === 'home' ? HOME : AWAY).map((id) => ({ id, name: nm(id) })), gk: { id: team === 'home' ? 'hgk' : 'agk', name: nm(team === 'home' ? 'hgk' : 'agk') } } });
const goal = (side: Side, sec: number, period: number, goalType: GoalType, scorer?: string, assist?: string) =>
  A('GOAL', side, sec, period, { type: 'goal', goalType, playerId: scorer, playerName: scorer && nm(scorer), secondId: assist, secondName: assist && nm(assist) }, { goalType });
const opp = (x: Side): Side => (x === 'home' ? 'away' : 'home');
/** A keeper's save: its own action on the keeper's side, linked to the shot. */
const saveBy = (side: Side, sec: number, period: number, gk: string, ref: string) =>
  A('SAVE', side, sec, period, { type: 'save', playerId: gk, playerName: nm(gk) }, { ref });
/** SHOT (+ the keeper's SAVE when on goal), as the controls fire them. */
const shot = (side: Side, sec: number, period: number, onGoal: boolean, shooter?: string, gk?: string): ScoreAction[] => {
  const a = A('SHOT', side, sec, period, { type: 'shot', onGoal, playerId: shooter, playerName: shooter && nm(shooter) }, { onGoal });
  return onGoal && gk ? [a, saveBy(opp(side), sec, period, gk, a.payload!.uid as string)] : [a];
};
const stroke = (side: Side, sec: number, period: number, outcome: 'saved' | 'missed', taker?: string, gk?: string): ScoreAction[] => {
  const a = A('STROKE', side, sec, period, { type: 'stroke', outcome, playerId: taker, playerName: taker && nm(taker) }, { outcome });
  return outcome === 'saved' && gk ? [a, saveBy(opp(side), sec, period, gk, a.payload!.uid as string)] : [a];
};
const card = (side: Side, sec: number, period: number, colour: CardColour, who: string, minutes?: number) =>
  A('CARD', side, sec, period, { type: 'card', card: colour, playerId: who, playerName: nm(who) }, { card: colour, ...(minutes ? { minutes } : {}) });
const pc = (side: Side, sec: number, period: number) => A('PC', side, sec, period);
const sub = (side: Side, sec: number, period: number, off: string, on: string) =>
  A('SUB', side, sec, period, {}, { offId: off, offName: nm(off), onId: on, onName: nm(on) });
const endPeriod = (): ScoreAction => ({ type: 'END_PERIOD', payload: { at: 0 } });
const run = (actions: ScoreAction[], config?: Record<string, unknown>, from?: HockeyState): HockeyState =>
  actions.reduce(reducer, from ?? init(config));
/** Play whole periods: a period of `len` seconds — set the clock, end it. */
const fullPeriod = (len = 900): ScoreAction[] => [{ type: 'SET_CLOCK', payload: { periodSec: len } }, endPeriod()];

/* ------------------------------ scoring by type ----------------------------- */

describe('SD-101 · goals by type, penalty corners, strokes, shots', () => {
  const s = run([
    xi('home'), xi('away'),
    goal('home', 300, 1, 'field', 'h9', 'h7'),
    pc('home', 600, 1), pc('home', 700, 1), goal('home', 710, 1, 'pc', 'h4'),
    goal('away', 1000, 2, 'stroke', 'a9'),
    goal('away', 1100, 2, 'pc', 'a5', 'a6'), // a PC goal logged without its award
    ...stroke('home', 1500, 2, 'saved', 'h4', 'agk'),
    ...shot('home', 1600, 2, true, 'h10', 'agk'), ...shot('away', 1700, 2, false, 'a8'),
    goal('home', 2000, 3, 'field'), // team goal, no scorer
  ]);
  test('score, goal types and the event order', () => {
    assert.equal(s.home, 3); assert.equal(s.away, 2);
    assert.deepEqual(s.events.filter((e) => e.type === 'goal').map((e) => e.goalType), ['field', 'pc', 'stroke', 'pc', 'field']);
    assert.equal(s.events[0].type, 'goal');
    assert.equal(s.events.find((e) => e.goalType === 'stroke')?.playerName, 'A9');
  });
  test('team figures: PCs won and converted, strokes, saves, shots (a goal is a shot on goal)', () => {
    const h = teamFigures(s, 'home'), a = teamFigures(s, 'away');
    assert.deepEqual([h.goals, h.fieldGoals, h.pcGoals, h.pcs, h.strokes, h.shots, h.shotsOnGoal], [3, 2, 1, 2, 1, 4, 4]);
    assert.equal(pcConversion(h), 50);
    assert.deepEqual([a.pcs, a.pcGoals, a.strokeGoals, a.strokes, a.saves], [1, 1, 1, 1, 2]); // A's keeper: the stroke + the shot
    assert.equal(pcConversion(a), 100, 'a PC goal without its award still counts the corner');
    assert.equal(teamFigures(s, 'home', 1).goals, 2, 'per-period scope');
  });
  test('player credits: scorer, assist, PC / stroke goals, keeper saves', () => {
    const t = hockeyTotals(s);
    assert.deepEqual(t.h9.stats.goals, 1); assert.equal(t.h9.stats.fieldGoals, 1); assert.equal(t.h7.stats.assists, 1);
    assert.equal(t.h4.stats.pcGoals, 1); assert.equal(t.h4.stats.strokesMissed, 1);
    assert.equal(t.a9.stats.strokeGoals, 1);
    assert.equal(t.agk.stats.saves, 2); assert.equal(t.agk.side, 'away');
    assert.equal(t.h10.stats.shotsOnGoal, 1); assert.equal(t.a8.stats.shots, 1); assert.equal(t.a8.stats.shotsOnGoal, 0);
  });
  test('REMOVE_EVENT reverses a goal by its uid (even after another row is gone)', () => {
    const g = s.events.find((e) => e.type === 'goal' && e.playerId === 'h4')!;
    const r = reducer(s, { type: 'REMOVE_EVENT', payload: { id: g.id } });
    assert.equal(r.home, 2);
    assert.ok(!r.events.some((e) => e.id === g.id));
  });
});

/* ---------------------------------- clock ---------------------------------- */

describe('SD-101 · the stoppable game clock and periods', () => {
  const T = 1_700_000_000_000;
  test('start / stop accrues playing time; events are stamped in game seconds', () => {
    let s = init();
    s = reducer(s, { type: 'CLOCK', payload: { run: true, at: T } });
    assert.equal(matchSec(s, T + 65_000), 65);
    assert.equal(clockFace(s, T + 65_000), '13:55');
    s = reducer(s, { type: 'CLOCK', payload: { run: false, at: T + 120_000 } });
    assert.equal(matchSec(s, T + 999_000), 120, 'a stopped clock does not run');
    s = reducer(s, { type: 'CLOCK', payload: { run: true, at: T + 200_000 } });
    s = reducer(s, { type: 'SHOT', side: 'home', payload: { at: T + 230_000, onGoal: false } });
    assert.equal(s.events[0].sec, 150);
  });
  test('FIH: the clock stops by itself on a goal and a PC award (and not when off)', () => {
    let s = run([{ type: 'CLOCK', payload: { run: true, at: T } }]);
    s = reducer(s, { type: 'GOAL', side: 'home', payload: { at: T + 60_000 } });
    assert.equal(s.clock.since, undefined); assert.equal(matchSec(s, T + 500_000), 60);
    s = reducer(s, { type: 'CLOCK', payload: { run: true, at: T + 100_000 } });
    s = reducer(s, { type: 'PC', side: 'away', payload: { at: T + 130_000 } });
    assert.equal(matchSec(s, T + 500_000), 90);
    let k = run([{ type: 'CLOCK', payload: { run: true, at: T } }], { stopClock: false });
    k = reducer(k, { type: 'GOAL', side: 'home', payload: { at: T + 60_000 } });
    assert.ok(k.clock.since, 'school preset: the clock keeps running');
    const edited = reducer(run([{ type: 'CLOCK', payload: { run: true, at: T } }]), { type: 'GOAL', side: 'home', payload: { at: T + 5000, sec: 2, edit: true } });
    assert.ok(edited.clock.since, 'a re-entered (edited) goal never stops the running clock');
  });
  test('periods: Q1…Q4 then full time; 2 halves; the clock holds at the period end', () => {
    let s = init();
    for (let q = 1; q <= 3; q++) s = run(fullPeriod(), undefined, s);
    assert.equal(s.period, 4); assert.equal(periodName(s, 4), 'Q4'); assert.equal(matchSec(s), 2700);
    s = run(fullPeriod(), undefined, s);
    assert.ok(s.ended); assert.ok(isComplete(s));
    assert.deepEqual(result(s), { winner: 'draw', home: 0, away: 0 });
    const h = init({ periods: 2, periodMinutes: 25 });
    assert.equal(periodName(h, 2), 'H2');
    const over = reducer(h, { type: 'CLOCK', payload: { run: true, at: T } });
    assert.equal(clockFace(over, T + 40 * 60_000), '00:00');
  });
  test('the tournament shoot-out bonus turns the decider on', () => {
    assert.equal(init({ soWinPoints: 2, soLossPoints: 1 }).decider, 'shootout');
    assert.equal(init({ soWinPoints: 2, decider: 'none' }).decider, 'shootout', 'the bonus table needs every draw settled');
    assert.equal(init().decider, 'none');
  });
});

/* ----------------------------- cards & suspensions -------------------------- */

describe('SD-101 · cards: green 2\', yellow 5–10\', red — short-handed, automatic return', () => {
  const T = 1_700_000_000_000;
  const base = run([xi('home'), xi('away')]);
  test('green: the side is a player short for 2 minutes of playing time', () => {
    const s = run([card('home', 480, 1, 'green', 'h3')], undefined, base);
    assert.deepEqual(hockeyField(s, 9).short, { home: 1, away: 0 });
    assert.equal(hockeyField(s, 9).onField.home.length, 10);
    assert.deepEqual(hockeyField(s, 10).short, { home: 0, away: 0 }, 'back by himself at 10:00');
    assert.equal(hockeyField(s, 10).onField.home.length, 11);
    assert.equal(hockeyTotals({ ...s, clock: { ms: 900_000 } }).h3.stats.suspensionMinutes, 2);
  });
  test('yellow 5 or 10 (umpire\'s choice), clamped to 5–10; red is permanent', () => {
    const s = run([
      card('away', 1200, 2, 'yellow', 'a5'), card('away', 1260, 2, 'yellow', 'a7', 10),
      card('away', 3000, 4, 'yellow', 'a2', 15), card('home', 2400, 3, 'red', 'h9'),
    ], undefined, base);
    assert.deepEqual(s.events.filter((e) => e.type === 'card').map((e) => e.minutes ?? null), [5, 10, 10, null]);
    assert.equal(hockeyField(s, 22).short.away, 2);
    assert.equal(hockeyField(s, 26).short.away, 1);
    assert.equal(hockeyField(s, 31).short.away, 0);
    assert.equal(hockeyField(s, 45).short.home, 1);
    assert.equal(hockeyField(s, 59).short.home, 1, 'a red leaves the side short for the rest of the match');
    assert.equal(FIELD_RULES.hockey.green.minutes, 2);
  });
  test('the live banner counts down on the GAME clock: a stopped clock stops the suspension', () => {
    let s = reducer(base, { type: 'CLOCK', payload: { run: true, at: T } });
    s = reducer(s, { ...card('home', 0, 1, 'green', 'h3'), payload: { card: 'green', uid: 'g1', at: T + 60_000 } });
    assert.equal(s.events[0].sec, 60);
    let live = hockeyLiveField(s, T + 90_000);
    assert.deepEqual(live.suspended.map((x) => [x.name, x.left]), [['H3', '1:30']]);
    assert.deepEqual(live.onField, { home: 10, away: 11 });
    s = reducer(s, { type: 'CLOCK', payload: { run: false, at: T + 120_000 } }); // umpire stops time
    live = hockeyLiveField(s, T + 600_000);
    assert.deepEqual(live.suspended.map((x) => x.left), ['1:00'], 'still a minute to serve after a long stoppage');
    s = reducer(s, { type: 'CLOCK', payload: { run: true, at: T + 600_000 } });
    assert.deepEqual(hockeyLiveField(s, T + 661_000).suspended, [], 'back on after the remaining minute of play');
    assert.deepEqual(hockeyLiveField(s, T + 661_000).short, { home: 0, away: 0 });
  });
  test('without a line-up the banner still counts suspensions (players per side − short)', () => {
    let s = reducer(init(), { type: 'CLOCK', payload: { run: true, at: T } });
    s = reducer(s, { ...card('away', 0, 1, 'yellow', 'a5'), payload: { card: 'yellow', uid: 'y1', at: T + 30_000 } });
    const live = hockeyLiveField(s, T + 60_000);
    assert.deepEqual(live.onField, { home: 11, away: 10 });
    assert.equal(live.suspended[0].left, '4:30');
  });
});

/* -------------------------------- shoot-out --------------------------------- */

describe('SD-101 · FIH shoot-out', () => {
  const K = (scored: boolean) => ({ scored });
  test('decided early when a side cannot catch up', () => {
    assert.equal(decideShootout([K(true), K(true), K(true)], [K(false), K(false), K(false)]), 'home');
    assert.equal(decideShootout([K(true), K(true)], [K(false), K(false)]), undefined);
    assert.equal(decideShootout([K(true), K(true), K(true), K(false), K(false)], [K(true), K(true), K(true), K(false), K(false)]), undefined, '3–3 after 5: sudden death');
  });
  test('a level match goes to a shoot-out; sudden death with the order reversed; result keeps the level score', () => {
    let s = run([goal('home', 100, 1, 'field', 'h9'), goal('away', 200, 1, 'pc', 'a5'), ...fullPeriod(), ...fullPeriod(), ...fullPeriod(), ...fullPeriod()], { decider: 'shootout' });
    assert.ok(s.ended); assert.equal(isComplete(s), false, 'not complete until the shoot-out is decided');
    assert.equal(result(s), null);
    s = reducer(s, { type: 'START_SHOOTOUT', payload: { first: 'home' } });
    const order: Side[] = [];
    const kick = (scored: boolean, who?: string) => {
      const side = nextShooter(s.shootout!);
      order.push(side);
      s = reducer(s, { type: 'SO', side, payload: { scored }, ...(who ? { attribution: { playerId: who, stat: 'soTaken', ...(scored ? { extra: { soGoals: 1 } } : {}) } } : {}) });
    };
    // 5 rounds: both score 3
    for (const [h, a] of [[true, true], [false, true], [true, false], [true, true], [false, false]]) { kick(h, 'h9'); kick(a, 'a5'); }
    assert.equal(s.shootoutWinner, undefined);
    assert.deepEqual(order.slice(0, 10), ['home', 'away', 'home', 'away', 'home', 'away', 'home', 'away', 'home', 'away']);
    // sudden death: the side that went second goes first
    kick(true, 'a7'); kick(false, 'h3');
    assert.deepEqual(order.slice(10), ['away', 'home']);
    assert.equal(s.shootoutWinner, 'away');
    assert.deepEqual(soScore(s), { home: 3, away: 4 });
    assert.ok(isComplete(s));
    assert.deepEqual(result(s), { winner: 'away', home: 1, away: 1 });
    assert.equal(hockeyScoreLine(s), 'SO 3–4'); assert.equal(hockeyScoreLine(s, 'away'), 'SO 4–3');
    const t = hockeyTotals(s);
    assert.equal(t.h9.stats.goals, 1, 'shoot-out goals are not goals');
    assert.equal(t.h9.stats.soTaken, 5); assert.equal(t.h9.stats.soGoals, 3);
    assert.equal(t.a7.stats.soGoals, 1);
    // no more kicks once decided
    assert.equal(reducer(s, { type: 'SO', side: 'home', payload: { scored: true } }), s);
  });
  test('without a decider a level match is a draw', () => {
    const s = run([goal('home', 100, 1, 'field'), goal('away', 200, 1, 'field'), ...fullPeriod(), ...fullPeriod(), ...fullPeriod(), ...fullPeriod()]);
    assert.deepEqual(result(s), { winner: 'draw', home: 1, away: 1 });
    assert.equal(isComplete(s), true);
  });
});

/* -------------------------------- statTotals -------------------------------- */

const MATCH: ScoreAction[] = [
  xi('home'), xi('away'),
  goal('home', 120, 1, 'field', 'h9', 'h7'),
  pc('away', 300, 1), ...shot('away', 310, 1, true, 'a5', 'hgk'),
  card('home', 500, 1, 'green', 'h3'),
  endPeriod(),
  sub('home', 1000, 2, 'h7', 'h12'),
  goal('away', 1100, 2, 'pc', 'a5', 'a6'),
  ...stroke('home', 1200, 2, 'saved', 'h4', 'agk'),
  card('away', 1300, 2, 'yellow', 'a2', 10),
  endPeriod(),
  sub('away', 1900, 3, 'agk', 'agk2'), // the keeper is replaced: the sub goes in goal
  goal('home', 2000, 3, 'stroke', 'h4'),
  ...shot('home', 2100, 3, true, 'h12', 'agk2'), ...shot('home', 2150, 3, false),
  card('away', 2200, 3, 'red', 'a9'),
  endPeriod(),
  goal('home', 3000, 4, 'pc', 'h12', 'h9'),
  { type: 'SET_CLOCK', payload: { periodSec: 900 } }, endPeriod(),
];
const SPORT: TotalsSport<HockeyState> = {
  name: 'hockey', init, reducer, statTotals: hockeyTotals, partial: false, derived: DERIVED_KEYS,
};

describe('SD-101 · statTotals contract (SD-19 harness)', () => {
  test('clean log + every undo prefix: owned keys = live sums; derived ≥ 0', () => {
    const t = assertContract(SPORT, toRecords(MATCH), { every: 1 });
    assert.equal(t.h9.stats.goals, 1); assert.equal(t.h9.stats.assists, 1);
    assert.equal(t.h12.stats.pcGoals, 1);
    assert.equal(t.hgk.stats.saves, 1); assert.equal(t.agk.stats.saves, 1); assert.equal(t.agk2.stats.saves, 1);
    assert.equal(t.a9.stats.redCards, 1); assert.equal(t.a2.stats.suspensionMinutes, 10);
  });
  test('minutes on the game clock; keeper goals conceded; clean sheet only for a side that let in none', () => {
    const t = hockeyTotals(run(MATCH));
    assert.equal(t.h1.stats.minutes, 60);
    assert.equal(t.h7.stats.minutes, Math.round(1000 / 60)); // off at 16:40
    assert.equal(t.h12.stats.minutes, 60 - Math.round(1000 / 60));
    assert.equal(t.h3.stats.minutes, 58, 'two minutes in the sin bin don\'t count as playing time');
    assert.equal(t.a9.stats.minutes, Math.round(2200 / 60), 'sent off at 36:40');
    assert.equal(t.hgk.stats.goalsConceded, 1); assert.equal(t.hgk.stats.cleanSheets, 0);
    assert.equal(t.agk.stats.goalsConceded, 1, 'the first goal, before the change');
    assert.equal(t.agk2.stats.goalsConceded, 2);
    assert.equal(currentKeeper(run(MATCH), 'away')?.id, 'agk2');
    const shutout = hockeyTotals(run([xi('home'), xi('away'), goal('home', 120, 1, 'field', 'h9'), ...fullPeriod(), ...fullPeriod(), ...fullPeriod(), ...fullPeriod()]));
    assert.equal(shutout.hgk.stats.cleanSheets, 1); assert.equal(shutout.agk.stats.cleanSheets, 0);
  });
  test('a live correction (REMOVE_EVENT with the reversed credits) = the match scored cleanly', () => {
    const wrong = goal('home', 2000, 3, 'stroke', 'h5'); // wrong scorer, fixed live
    const live = [...MATCH.slice(0, 13), wrong];
    const ev = run(live).events.at(-1)!;
    const cr = eventCredits(ev);
    const fix: ScoreAction = { type: 'REMOVE_EVENT', payload: { id: ev.id }, attribution: creditAttribution(cr.first, -1), attribution2: creditAttribution(cr.second, -1) };
    const corrected = toRecords([...live, fix, ...MATCH.slice(13)]);
    assertContract(SPORT, corrected, { every: 1000, label: 'live remove' });
    assertSameAsClean(SPORT, corrected, toRecords(MATCH), 'live remove');
  });
  test('a save is its own action on the KEEPER\'s side (the live layer writes lines against the action\'s side); removing the shot takes its save', () => {
    const acts = shot('away', 310, 1, true, 'a5', 'hgk');
    assert.equal(acts[1].type, 'SAVE'); assert.equal(acts[1].side, 'home'); assert.equal(acts[1].attribution?.playerId, 'hgk');
    const base = [xi('home'), xi('away')];
    const st = run([...base, ...acts]);
    assert.equal(hockeyTotals(st).hgk.side, 'home');
    assert.equal(hockeyTimeline(st).length, 1, 'the save reads on the shot row');
    assert.match(hockeyTimeline(st)[0].detail ?? '', /save HGK/);
    const rm = st.events.map((e): ScoreAction => {
      const cr = eventCredits(e);
      return { type: 'REMOVE_EVENT', side: e.side, payload: { id: e.id }, attribution: creditAttribution(cr.first, -1) };
    });
    const recs = toRecords([...base, ...acts, ...rm]);
    assertContract(SPORT, recs, { every: 1000, label: 'remove shot + save' });
    assertSameAsClean(SPORT, recs, toRecords(base), 'remove shot + save');
  });
  test('#05 AMEND: re-credit a scorer and void a card — totals follow', () => {
    const recs = toRecords(MATCH);
    const g = recs.find((r) => r.type === 'GOAL' && r.attribution?.playerId === 'h4')!;
    const red = recs.find((r) => r.type === 'CARD' && r.attribution?.playerId === 'a9')!;
    const action = { type: g.type, side: g.side!, payload: g.payload!, attribution: { ...g.attribution!, playerId: 'h5', playerName: 'H5' } };
    const am = amendRecord(recs, [{ op: 'replace', seq: g.seq, action }, { op: 'void', seq: red.seq }]);
    const corrected = [...recs, am];
    assertContract(SPORT, corrected, { every: 1000, label: 'AMEND' });
    const t = hockeyTotals(replayLog({ createInitialState: init, reducer }, undefined, corrected));
    assert.equal(t.h5.stats.strokeGoals, 1); assert.equal(t.h4.stats.strokeGoals ?? 0, 0);
    assert.equal(t.a9.stats.redCards, 0);
  });
});
/* ------------------------------ box & timeline ------------------------------ */

describe('SD-101 · box score, comparison, timeline, ticker', () => {
  const s = run(MATCH);
  test('per-player box: G A SH SOG PCG SV GA cards MIN; per-quarter scope', () => {
    const src = hockeyBox(s);
    assert.deepEqual(src.periods.map((p) => p.label), ['Q1', 'Q2', 'Q3', 'Q4']);
    const table = buildBoxTable(hockeyStats, src.data('all'), { scope: 'all' });
    const cols = table.columns.map((c) => c.abbr);
    assert.deepEqual(cols, ['MIN', 'G', 'A', 'SH', 'SOG', 'PCG', 'SV', 'GA', 'GC', 'YC', 'RC']);
    const row = (side: 'home' | 'away', name: string) => table[side].rows.find((r) => r.name === name)!.cells;
    assert.equal(row('home', 'H12')[cols.indexOf('G')], '1');
    assert.equal(row('home', 'H12')[cols.indexOf('PCG')], '1');
    assert.equal(row('away', 'AGK2')[cols.indexOf('GA')], '2');
    const q3 = buildBoxTable(hockeyStats, src.data(3), { scope: 3 });
    assert.ok(!q3.columns.some((c) => c.abbr === 'MIN'), 'MIN is overall only');
    assert.equal(q3.home.totals[q3.columns.findIndex((c) => c.abbr === 'G')], '1');
  });
  test('comparison: penalty corners, PC conversion, strokes, cards', () => {
    const cmp = comparisonRows(hockeyStats, hockeyBox(s).data('all'), 'all');
    const r = (label: string) => cmp.rows.find((x) => x.label === label);
    assert.deepEqual([r('Penalty corners')?.home, r('Penalty corners')?.away], ['1', '1']);
    assert.deepEqual([r('PC conversion')?.home, r('PC conversion')?.away], ['100%', '100%']);
    assert.equal(r('Penalty strokes')?.home, '2');
    assert.equal(r('Red cards')?.away, '1');
    assert.equal(r('Shots on goal')?.home, '4'); // 3 goals + 1 saved shot
  });
  test('timeline rows (minute stamps, newest by game time)', () => {
    const rows = hockeyTimeline(s);
    const g = rows.find((x) => x.kind === 'goal' && x.label === 'Penalty-stroke goal')!;
    assert.equal(g.stamp, "34'");
    assert.equal(rows.find((x) => x.kind === 'card' && x.label.startsWith('Yellow'))!.label, 'Yellow card (10 min)');
    assert.equal(rows.find((x) => x.kind === 'sub')!.detail, 'H12 ⬆  H7 ⬇');
  });
  test('ticker: scorers with minutes and type; GOAL! flash once', () => {
    const d = hockeyTickerDetail(s, { home: 'Blue', away: 'Gold' });
    assert.equal(d.left?.[0], "🏑 H9 2' · H4 34' (PS) · H12 50' (PC)");
    assert.equal(d.right?.[0], "🏑 A5 19' (PC)");
    const prev = run(MATCH.slice(0, -3));
    const f = hockeyTickerFlash(prev, run(MATCH.slice(0, -2)));
    assert.deepEqual(f, { kind: 'goal', text: "GOAL! H12 50'", sub: 'Penalty corner', side: 'home' });
    assert.equal(hockeyTickerFlash(run(MATCH.slice(0, -2)), run(MATCH.slice(0, -1))), null);
  });
  test('score line through the shared matchScoreLine (manual marks too)', () => {
    const p = { scoreLine: hockeyScoreLine };
    assert.equal(matchScoreLine(p as never, s), '');
    assert.equal(matchScoreLine(p as never, s, { result: { kind: 'abandoned' } as never }), 'abandoned');
  });
});

/* --------------------------------- standings -------------------------------- */

let mn = 0;
function M(h: string, a: string, st: HockeyState): Match {
  const r = result(st)!;
  return {
    id: `hm${++mn}`, sport: 'hockey', status: 'completed', startsAt: '', score: { home: r.home, away: r.away }, winner: r.winner,
    homeTeam: { id: h, name: h }, awayTeam: { id: a, name: a }, state: st,
  } as unknown as Match;
}
const played = (hg: number, ag: number, config?: Record<string, unknown>, so?: Side): HockeyState => {
  let s = run([
    ...Array.from({ length: hg }, (_, i) => goal('home', 60 + i, 1, 'field')),
    ...Array.from({ length: ag }, (_, i) => goal('away', 120 + i, 1, 'field')),
    ...fullPeriod(), ...fullPeriod(), ...fullPeriod(), ...fullPeriod(),
  ], config);
  if (so) {
    s = reducer(s, { type: 'START_SHOOTOUT', payload: { first: 'home' } });
    for (let i = 0; i < 3; i++) {
      s = reducer(s, { type: 'SO', side: 'home', payload: { scored: so === 'home' } });
      s = reducer(s, { type: 'SO', side: 'away', payload: { scored: so === 'away' } });
    }
  }
  return s;
};

describe('SD-101 · standings: FIH 3-1-0, shoot-out bonus, FIH tie-breakers', () => {
  setStandingsUnitsProvider(null); setStandingsPointsProvider(null); setStandingsScoreProvider(null);
  const fih = standingsPresets('hockey').find((p) => p.id === 'fih')!;
  const fihSo = standingsPresets('hockey').find((p) => p.id === 'fih-so')!;
  test('new hockey tournaments start on FIH 3-1-0; the presets are offered', () => {
    assert.equal(NEW_TOURNAMENT_POINTS.hockey?.winPoints, 3);
    assert.deepEqual(standingsPresets('hockey').map((p) => p.id), ['fih', 'fih-so', 'simple']);
  });
  test('shoot-out bonus: a drawn match decided by shoot-out → 2 and 1', () => {
    const cfg = standingsConfigFromFormat('hockey' as SportId, fihSo.set);
    const st = played(2, 2, fihSo.set, 'away');
    assert.equal(st.decider, 'shootout', 'the preset turns the decider on');
    const m = M('A', 'B', st);
    assert.equal(m.winner, 'away');
    assert.deepEqual(matchPoints(m, cfg), { home: 1, away: 2 });
    assert.deepEqual(matchPoints(M('A', 'B', played(3, 1, fihSo.set)), cfg), { home: 3, away: 0 });
  });
  test('FIH order: points, then wins, then goal difference, goals scored, head-to-head', () => {
    const cfg = standingsConfigFromFormat('hockey' as SportId, fih.set);
    // A, B, C all 4 pts. A: W + D… build: A–B 1-0, B–C 1-0, C–A 1-0 (each 3), then all draw D 0-0 → 4 pts each.
    const ms = [
      M('A', 'B', played(1, 0)), M('B', 'C', played(1, 0)), M('C', 'A', played(4, 0)),
      M('A', 'D', played(0, 0)), M('B', 'D', played(0, 0)), M('C', 'D', played(0, 0)),
    ];
    const t = teamStandings(ms, 'hockey' as SportId, cfg);
    assert.deepEqual(t.map((r) => [r.teamId, r.points]).slice(0, 3), [['C', 4], ['B', 4], ['A', 4]], 'C on goal difference (+3), then B (0) over A (−3)');
    // wins beat goal difference: E 1 win 1 loss (3 pts), F 3 draws (3 pts)
    const ms2 = [M('E', 'G', played(1, 0)), M('E', 'H', played(0, 5)), M('F', 'G', played(0, 0)), M('F', 'H', played(0, 0)), M('F', 'I', played(0, 0))];
    const t2 = teamStandings(ms2, 'hockey' as SportId, cfg);
    const e = t2.findIndex((r) => r.teamId === 'E'), f = t2.findIndex((r) => r.teamId === 'F');
    assert.ok(e < f, 'more wins first, despite the worse goal difference');
  });
});

/* ----------------------------- career & leaders ----------------------------- */

describe('SD-101 · career, leaders and awards', () => {
  test('the schema is valid and registered', () => {
    assert.deepEqual(validateSchema(hockeyStats), []);
    assert.equal(STAT_SCHEMAS.hockey, hockeyStats);
    assert.equal(hockeyStats.stats.find((x) => x.key === 'greenCards')?.suspension?.minutes, 2);
    assert.deepEqual(hockeyStats.stats.find((x) => x.key === 'yellowCards')?.suspension, { minutes: 5, maxMinutes: 10 });
  });
  const lines: StatLine[] = [];
  const add = (matchId: string, st: HockeyState) => {
    for (const [pid, t] of Object.entries(hockeyTotals(st))) lines.push({ id: `${matchId}-${pid}`, matchId, playerId: pid, sport: 'hockey', stats: t.stats, won: false } as StatLine);
  };
  add('m1', run(MATCH));
  add('m2', run([xi('home'), xi('away'), goal('home', 100, 1, 'pc', 'h12'), goal('home', 200, 1, 'field', 'h9'), ...shot('away', 300, 1, true, 'a5', 'hgk'), ...shot('away', 400, 1, true, 'a5', 'hgk'), ...fullPeriod(), ...fullPeriod(), ...fullPeriod(), ...fullPeriod()]));
  test('career: goals per game, PC goals, save %, clean sheets, cards', () => {
    const c = careerFromSchema(hockeyStats, lines.filter((l) => l.playerId === 'h12'));
    const v = (sec: string, k: string) => c[sec]?.find((r) => r.key === k)?.value;
    assert.equal(v('attack', 'goals'), '2'); assert.equal(v('attack', 'pcGoals'), '2'); assert.equal(v('attack', 'goalsPerGame'), '1.00');
    const gk = careerFromSchema(hockeyStats, lines.filter((l) => l.playerId === 'hgk'));
    const g = (k: string) => gk.goalkeeping.find((r) => r.key === k)?.value;
    assert.equal(g('saves'), '3'); assert.equal(g('goalsConceded'), '1'); assert.equal(g('savePct'), '75%'); assert.equal(g('cleanSheets'), '1');
    const d = careerFromSchema(hockeyStats, lines.filter((l) => l.playerId === 'a2'));
    assert.equal(d.discipline.find((r) => r.key === 'yellowCards')?.value, '1');
    assert.equal(d.discipline.find((r) => r.key === 'suspensionMinutes')?.value, '10');
  });
  test('leaders: top scorer tie-break goals → field goals; keepers only for save %', () => {
    const players: Player[] = [...HOME, 'h12', ...AWAY, 'agk2'].map((id) => ({ id, fullName: nm(id), sports: ['hockey'] } as Player));
    const cats = categoryLeaders(lines, players, 'hockey' as SportId);
    const goals = cats.find((x) => x.key === 'goals')!.leaders.map((l) => [l.name, l.value]);
    // H9 2 (both field) ahead of H12 2 (both PC) and H4 1
    assert.deepEqual(goals.slice(0, 2), [['H9', 2], ['H12', 2]]);
    const gk = rankAwardCandidates(lines, players, 'hockey' as SportId, 'savePct', 5, { mins: { savePct: 1 } } as never);
    assert.ok(gk.length > 0 && gk.every((x) => ['hgk', 'agk', 'agk2'].includes(x.playerId)), 'keepers only');
    const top = rankAwardCandidates(lines, players, 'hockey' as SportId, 'goals', 3);
    assert.equal(top[0].playerId, 'h9');
  });
});
