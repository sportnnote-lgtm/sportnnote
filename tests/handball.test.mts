/**
 * SD-102 — handball (IHF) born deep on the Wave 1 foundations:
 *  - goals and attempts by type (6 m / 9 m / wing / breakthrough / fast break /
 *    7 m), assists, saved / missed / blocked attempts with keeper and blocker
 *    credit, technical faults and steals;
 *  - the running game clock (counts up), halves, team time-outs (IHF 2:10:
 *    3 a match, 2 a half, 1 in the last 5 minutes, none in extra time);
 *  - sanctions (IHF 16): warning, 2-minute suspension (team short 2' of playing
 *    time, back by himself), the 3rd suspension = disqualification, red / blue
 *    (out for good, team short 2'), officials' sanctions;
 *  - IHF 2:2: extra time 2 × 5 (twice), then 7-metre throws;
 *  - statTotals (SD-19 contract via the harness: live sums, every undo prefix,
 *    live REMOVE_EVENT corrections, #05 AMEND re-credit / void);
 *  - minutes, keeper goals conceded; the box score; standings (IHF 2-1-0 with
 *    the IHF tie-break chain, Simple); career, leaders, awards; timeline,
 *    ticker, score line.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  init, reducer, isComplete, result, matchSec, clockFace, periodName, eventCredits, creditAttribution, currentKeeper,
  decideShootout, nextThrower, soScore, teamFigures, handballScoreLine, timeoutCheck, suspensionsOf, totalPeriods,
  type HandballState, type Side, type ShotType, type Sanction, type HandballEvent, type MissResult,
} from '../src/sports/handball/engine.ts';
import { handballTotals, handballLiveField, handballField, DERIVED_KEYS } from '../src/sports/handball/totals.ts';
import { handballBox } from '../src/sports/handball/box.ts';
import { handballStats } from '../src/sports/handball/stats.ts';
import { handballTimeline } from '../src/sports/handball/timeline.ts';
import { handballTickerDetail, handballTickerFlash } from '../src/sports/handball/ticker.ts';
import { buildBoxTable, comparisonRows } from '../src/sports/boxScore.ts';
import { careerFromSchema, validateSchema } from '../src/sports/statSchema.ts';
import { matchBoxSource } from '../src/sports/boxSources.ts';
import { FIELD_RULES } from '../src/sports/onField.ts';
import { STAT_SCHEMAS } from '../src/sports/statSchemas.ts';
import { FLOW_CONTROLS } from '../src/core/matchSafety.ts';
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

const HOME = ['hgk', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7'];
const AWAY = ['agk', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'];
const nm = (id: string) => id.toUpperCase();
let u = 0;
/** One action as the controls fire it: game second + period + a stable uid,
 *  credits from `eventCredits` (exactly what the live stat lines get). */
function A(type: string, side: Side | undefined, sec: number, period: number, ev: Partial<HandballEvent> = {}, payload: Record<string, unknown> = {}): ScoreAction {
  const cr = eventCredits({ type: ev.type ?? 'timeout', ...ev } as HandballEvent);
  const a: ScoreAction = { type, ...(side ? { side } : {}), payload: { ...payload, uid: `u${++u}`, sec, period } };
  const a1 = creditAttribution(cr.first);
  const a2 = creditAttribution(cr.second);
  if (a1) a.attribution = a1;
  if (a2) a.attribution2 = a2;
  return a;
}
const xi = (team: Side) => ({ type: 'XI', payload: { team, players: (team === 'home' ? HOME : AWAY).map((id) => ({ id, name: nm(id) })), gk: { id: team === 'home' ? 'hgk' : 'agk', name: nm(team === 'home' ? 'hgk' : 'agk') } } });
const opp = (x: Side): Side => (x === 'home' ? 'away' : 'home');
const goal = (side: Side, sec: number, period: number, shotType: ShotType, scorer?: string, assist?: string) =>
  A('GOAL', side, sec, period, { type: 'goal', shotType, playerId: scorer, playerName: scorer && nm(scorer), secondId: assist, secondName: assist && nm(assist) }, { shotType });
/** MISS (+ the keeper's SAVE / the defender's BLOCK), as the controls fire them. */
const miss = (side: Side, sec: number, period: number, shotType: ShotType, res: MissResult, shooter?: string, answer?: string): ScoreAction[] => {
  const a = A('MISS', side, sec, period, { type: 'miss', shotType, result: res, playerId: shooter, playerName: shooter && nm(shooter) }, { shotType, result: res });
  if (!answer) return [a];
  const ref = a.payload!.uid as string;
  return res === 'saved'
    ? [a, A('SAVE', opp(side), sec, period, { type: 'save', shotType, playerId: answer, playerName: nm(answer) }, { ref, shotType })]
    : [a, A('BLOCK', opp(side), sec, period, { type: 'block', playerId: answer, playerName: nm(answer) }, { ref })];
};
const turnover = (side: Side, sec: number, period: number, who?: string, stealer?: string): ScoreAction[] => {
  const a = A('TURNOVER', side, sec, period, { type: 'turnover', playerId: who, playerName: who && nm(who) });
  return stealer ? [a, A('STEAL', opp(side), sec, period, { type: 'steal', playerId: stealer, playerName: nm(stealer) }, { ref: a.payload!.uid })] : [a];
};
const card = (side: Side, sec: number, period: number, kind: Sanction, who: string, opts: { third?: boolean; blue?: boolean } = {}) =>
  A('CARD', side, sec, period, { type: 'card', card: kind, ...opts, playerId: who, playerName: nm(who) }, { card: kind, ...opts });
const officialCard = (side: Side, sec: number, period: number, kind: Sanction, name = 'Coach') =>
  ({ type: 'CARD', side, payload: { card: kind, official: name, uid: `u${++u}`, sec, period } }) as ScoreAction;
const timeout = (side: Side, sec: number, period: number): ScoreAction => A('TIMEOUT', side, sec, period);
const sub = (side: Side, sec: number, period: number, off: string | null, on: string) =>
  A('SUB', side, sec, period, {}, { ...(off ? { offId: off, offName: nm(off) } : {}), onId: on, onName: nm(on) });
const endPeriod = (): ScoreAction => ({ type: 'END_PERIOD', payload: { at: 0 } });
const run = (actions: ScoreAction[], config?: Record<string, unknown>, from?: HandballState): HandballState =>
  actions.reduce(reducer, from ?? init(config));
const fullPeriod = (len = 1800): ScoreAction[] => [{ type: 'SET_CLOCK', payload: { periodSec: len } }, endPeriod()];

/* ------------------------------ scoring by type ----------------------------- */

describe('SD-102 · goals and attempts by type, 7 m, saves, blocks, turnovers', () => {
  const s = run([
    xi('home'), xi('away'),
    goal('home', 60, 1, 'nineM', 'h4', 'h3'),
    goal('home', 120, 1, 'wing', 'h2'),
    goal('away', 200, 1, 'sevenM', 'a5', 'a4'), // a 7 m goal never carries an assist
    ...miss('home', 300, 1, 'sevenM', 'saved', 'h4', 'agk'),
    ...miss('home', 400, 1, 'sixM', 'blocked', 'h6', 'a3'),
    ...miss('away', 500, 1, 'fastBreak', 'missed', 'a7'),
    ...turnover('away', 600, 1, 'a2', 'h5'),
    ...turnover('home', 650, 1, 'h3'),
    goal('away', 2000, 2, 'breakthrough'), // team goal, no scorer
  ]);
  test('score and goal types', () => {
    assert.deepEqual([s.home, s.away], [2, 2]);
    assert.deepEqual(s.events.filter((e) => e.type === 'goal').map((e) => e.shotType), ['nineM', 'wing', 'sevenM', 'breakthrough']);
    assert.equal(s.events.find((e) => e.shotType === 'sevenM' && e.type === 'goal')?.secondId, undefined);
  });
  test('team figures: attempts by type, 7 m, saves, blocks, technical faults, steals', () => {
    const h = teamFigures(s, 'home'), a = teamFigures(s, 'away');
    assert.deepEqual([h.goals, h.shots, h.sevenMGoals, h.sevenMTaken, h.steals, h.technicalFaults], [2, 4, 0, 1, 1, 1]);
    assert.deepEqual([a.goals, a.shots, a.saves, a.blocks, a.technicalFaults, a.sevenMGoals, a.sevenMTaken], [2, 3, 1, 1, 1, 1, 1]);
    assert.deepEqual(h.byType.sixM, { goals: 0, shots: 1 });
    assert.equal(teamFigures(s, 'away', 2).goals, 1, 'per-half scope');
  });
  test('player credits: type keys, assists, keeper 7 m save, blocker, stealer', () => {
    const t = handballTotals(s);
    assert.equal(t.h4.stats.goals, 1); assert.equal(t.h4.stats.nineMGoals, 1); assert.equal(t.h4.stats.shots, 2); assert.equal(t.h4.stats.sevenMTaken, 1);
    assert.equal(t.h3.stats.assists, 1); assert.equal(t.h3.stats.technicalFaults, 1);
    assert.equal(t.a5.stats.sevenMGoals, 1); assert.equal(t.a4?.stats.assists ?? 0, 0);
    assert.equal(t.agk.stats.saves, 1); assert.equal(t.agk.stats.sevenMSaves, 1); assert.equal(t.agk.side, 'away');
    assert.equal(t.a3.stats.blocks, 1); assert.equal(t.h5.stats.steals, 1); assert.equal(t.a2.stats.technicalFaults, 1);
    assert.equal(t.h6.stats.sixMShots, 1); assert.equal(t.h6.stats.sixMGoals ?? 0, 0);
  });
  test('keepers: goals conceded and 7 m conceded', () => {
    const t = handballTotals(s);
    assert.equal(t.hgk.stats.goalsConceded, 2); assert.equal(t.hgk.stats.sevenMConceded, 1);
    assert.equal(t.agk.stats.goalsConceded, 2);
  });
});

/* -------------------------------- clock, time-outs -------------------------- */

describe('SD-102 · running clock (counts up), halves, team time-outs (IHF 2:10)', () => {
  const T = 1_700_000_000_000;
  test('the clock counts up over the match; the 2nd half starts at 30:00', () => {
    let s = reducer(init(), { type: 'CLOCK', payload: { run: true, at: T } });
    assert.equal(clockFace(s, T + 75_000), '01:15');
    s = run(fullPeriod(), undefined, init());
    assert.equal(s.period, 2); assert.equal(periodName(s, 2), 'H2'); assert.equal(matchSec(s), 1800);
    s = reducer(s, { type: 'CLOCK', payload: { run: true, at: T } });
    assert.equal(clockFace(s, T + 61_000), '31:01');
    s = run(fullPeriod(), undefined, init({ periodMinutes: 25 }));
    assert.equal(matchSec(s), 1500, 'youth 2 × 25');
  });
  test('a time-out stops the clock; a suspension too (2:9); a warning does not', () => {
    let s = reducer(init(), { type: 'CLOCK', payload: { run: true, at: T } });
    s = reducer(s, { type: 'TIMEOUT', side: 'home', payload: { at: T + 60_000 } });
    assert.equal(s.clock.since, undefined); assert.equal(matchSec(s, T + 999_000), 60);
    s = reducer(s, { type: 'CLOCK', payload: { run: true, at: T + 120_000 } });
    s = reducer(s, { type: 'CARD', side: 'away', payload: { card: 'yellow', at: T + 130_000 } });
    assert.ok(s.clock.since, 'a warning keeps the clock running');
    s = reducer(s, { type: 'CARD', side: 'away', payload: { card: 'twoMin', at: T + 140_000 } });
    assert.equal(s.clock.since, undefined);
    let k = reducer(init({ stopClock: false }), { type: 'CLOCK', payload: { run: true, at: T } });
    k = reducer(k, { type: 'CARD', side: 'away', payload: { card: 'twoMin', at: T + 10_000 } });
    assert.ok(k.clock.since, 'option off: only time-outs stop it');
  });
  test('3 per match, at most 2 per half, 1 in the last 5 minutes, none in extra time', () => {
    let s = run([timeout('home', 100, 1), timeout('home', 200, 1)]);
    assert.equal(timeoutCheck(s, 'home').ok, false); assert.match(timeoutCheck(s, 'home').reason!, /2 team time-outs a half/);
    assert.equal(timeoutCheck(s, 'away').ok, true);
    s = run(fullPeriod(), undefined, s);
    assert.equal(timeoutCheck(s, 'home').ok, true); assert.equal(timeoutCheck(s, 'home').left, 1);
    s = run([timeout('home', 2000, 2)], undefined, s);
    assert.equal(timeoutCheck(s, 'home').ok, false); assert.match(timeoutCheck(s, 'home').reason!, /All 3/);
    // the last 5 minutes: one only
    let l = run([...fullPeriod(), { type: 'SET_CLOCK', payload: { periodSec: 1560 } }, timeout('away', 3360, 2)]);
    assert.equal(timeoutCheck(l, 'away').ok, false); assert.match(timeoutCheck(l, 'away').reason!, /last 5 minutes/);
    l = run([...fullPeriod(), { type: 'SET_CLOCK', payload: { periodSec: 1560 } }]);
    assert.equal(timeoutCheck(l, 'away').ok, true);
    const et = run([...fullPeriod(), ...fullPeriod()], { decider: 'et' });
    assert.equal(et.period, 3); assert.equal(timeoutCheck(et, 'home').ok, false); assert.match(timeoutCheck(et, 'home').reason!, /extra time/);
  });
});

/* --------------------------------- sanctions -------------------------------- */

describe('SD-102 · sanctions (IHF 16): 2 minutes, 3rd = disqualification, red / blue, officials', () => {
  const base = run([xi('home'), xi('away')]);
  test('2-minute suspension: six court players for 2 minutes of playing time, back by himself', () => {
    const s = run([card('home', 600, 1, 'twoMin', 'h3')], undefined, base);
    assert.equal(handballField(s, 11).onField.home.length, 6);
    assert.equal(handballField(s, 12).onField.home.length, 7, 'back at 12:00');
    assert.equal(FIELD_RULES.handball.twoMinutes.minutes, 2);
    assert.equal(handballTotals({ ...s, clock: { ms: 1_800_000 } }).h3.stats.suspensionMinutes, 2);
  });
  test('the 3rd suspension disqualifies: out for good, the team short for 2 minutes, then a team-mate may come on', () => {
    const s = run([
      card('home', 300, 1, 'twoMin', 'h3'), card('home', 900, 1, 'twoMin', 'h3'),
      card('home', 2400, 2, 'twoMin', 'h3', { third: true }),
      sub('home', 2600, 2, null, 'h8'),
    ], undefined, base);
    assert.equal(suspensionsOf(s, 'home', { id: 'h3' }), 3);
    const t = handballTotals(s);
    assert.equal(t.h3.stats.twoMinutes, 3); assert.equal(t.h3.stats.redCards, 1); assert.equal(t.h3.stats.suspensionMinutes, 6);
    assert.equal(handballField(s, 41).short.home, 1);
    assert.equal(handballField(s, 42).short.home, 0, 'the team may refill after 2 minutes');
    assert.equal(handballField(s, 42.5).onField.home.length, 6, 'until someone comes on');
    assert.equal(handballField(s, 44).onField.home.length, 7);
    assert.ok(!handballField(s, 44).onField.home.some((p) => p.id === 'h3'));
    assert.equal(handballTimeline(s).find((r) => r.label.includes('3rd'))?.tone, 'wicket');
  });
  test('red / blue: disqualified, team short 2 minutes; blue counted separately', () => {
    const s = run([card('away', 1200, 1, 'red', 'a6', { blue: true })], undefined, base);
    const t = handballTotals(s);
    assert.equal(t.a6.stats.redCards, 1); assert.equal(t.a6.stats.blueCards, 1);
    assert.equal(handballField(s, 21).short.away, 1); assert.equal(handballField(s, 22).short.away, 0);
    assert.equal(FIELD_RULES.handball.red.shortFor, 2);
  });
  test('a team official\'s 2 minutes: the team plays short, no player line is credited', () => {
    const T = 1_700_000_000_000;
    let s = reducer(base, { type: 'CLOCK', payload: { run: true, at: T } });
    s = reducer(s, { ...officialCard('home', 0, 1, 'twoMin'), payload: { card: 'twoMin', official: 'Coach', uid: 'o1', at: T + 60_000 } });
    s = reducer(s, { type: 'CLOCK', payload: { run: true, at: T + 61_000 } });
    const live = handballLiveField(s, T + 90_000);
    assert.deepEqual(live.onField, { home: 6, away: 7 });
    assert.equal(live.suspended[0].name, 'Coach (official)');
    assert.deepEqual(Object.keys(handballTotals(s)).filter((k) => k.startsWith('official')), []);
    assert.equal(teamFigures(s, 'home').twoMinutes, 1);
  });
  test('without a line-up the banner still counts suspensions (players per side − short)', () => {
    const T = 1_700_000_000_000;
    let s = reducer(init(), { type: 'CLOCK', payload: { run: true, at: T } });
    s = reducer(s, { ...card('away', 0, 1, 'twoMin', 'a5'), payload: { card: 'twoMin', uid: 'y1', at: T + 30_000 } });
    s = reducer(s, { type: 'CLOCK', payload: { run: true, at: T + 30_000 } });
    const live = handballLiveField(s, T + 60_000);
    assert.deepEqual(live.onField, { home: 7, away: 6 });
    assert.equal(live.suspended[0].left, '1:30');
  });
});

/* ------------------------- extra time + 7 m throws -------------------------- */

describe('SD-102 · IHF 2:2 — extra time 2 × 5 (twice), then 7-metre throws', () => {
  const level = (n = 1): ScoreAction[] => [goal('home', 60, 1, 'nineM', 'h4'), goal('away', 120, 1, 'nineM', 'a4'), ...Array.from({ length: n }, () => fullPeriod()).flat()];
  test('league: a level match is a draw at full time', () => {
    const s = run(level(2));
    assert.ok(s.ended); assert.deepEqual(result(s), { winner: 'draw', home: 1, away: 1 });
  });
  test('et2: two extra times of 2 × 5, then 7 m throws; extra-time goals count', () => {
    let s = run(level(2), { decider: 'et2' });
    assert.equal(s.ended, false); assert.equal(s.period, 3); assert.equal(totalPeriods(s), 4); assert.equal(periodName(s, 3), 'ET1');
    assert.equal(matchSec(s), 3600);
    s = run([...fullPeriod(300), ...fullPeriod(300)], undefined, s);
    assert.equal(s.period, 5, 'still level: the second extra time'); assert.equal(s.etRounds, 2);
    s = run([goal('home', 4000, 5, 'fastBreak', 'h2'), ...fullPeriod(300), ...fullPeriod(300)], undefined, s);
    assert.ok(s.ended); assert.deepEqual(result(s), { winner: 'home', home: 2, away: 1 });
    const t = run([...level(2), ...fullPeriod(300), ...fullPeriod(300)], { decider: 'et' });
    assert.ok(t.ended); assert.equal(isComplete(t), false, 'et: level after one extra time → 7 m throws');
  });
  test('7-metre throws: 5 each, decided early, then one each; the result keeps the level score', () => {
    let s = run(level(2), { decider: 'shootout' });
    assert.ok(s.ended); assert.equal(result(s), null);
    s = reducer(s, { type: 'START_SHOOTOUT', payload: { first: 'away' } });
    const order: Side[] = [];
    const kick = (scored: boolean, who?: string) => {
      const side = nextThrower(s.shootout!);
      order.push(side);
      s = reducer(s, { type: 'SO', side, payload: { scored }, ...(who ? { attribution: { playerId: who, stat: 'soTaken', ...(scored ? { extra: { soGoals: 1 } } : {}) } } : {}) });
    };
    for (const [a, h] of [[true, true], [true, true], [false, true], [true, false], [true, true]]) { kick(a, 'a5'); kick(h, 'h4'); }
    assert.equal(s.shootoutWinner, undefined);
    kick(true, 'a7'); kick(false, 'h2');
    assert.deepEqual(order.slice(0, 4), ['away', 'home', 'away', 'home']);
    assert.equal(s.shootoutWinner, 'away');
    assert.deepEqual(soScore(s), { home: 4, away: 5 });
    assert.deepEqual(result(s), { winner: 'away', home: 1, away: 1 });
    assert.equal(handballScoreLine(s), 'SO 4–5'); assert.equal(handballScoreLine(s, 'away'), 'SO 5–4');
    const t = handballTotals(s);
    assert.equal(t.h4.stats.goals, 1, 'shoot-out goals are not goals'); assert.equal(t.h4.stats.soTaken, 5); assert.equal(t.h4.stats.soGoals, 4);
    assert.equal(decideShootout([{ scored: true }, { scored: true }, { scored: true }], [{ scored: false }, { scored: false }, { scored: false }]), 'home');
  });
});

/* -------------------------------- statTotals -------------------------------- */

const MATCH: ScoreAction[] = [
  xi('home'), xi('away'),
  goal('home', 60, 1, 'nineM', 'h4', 'h3'),
  ...miss('away', 90, 1, 'wing', 'saved', 'a2', 'hgk'),
  goal('away', 150, 1, 'sevenM', 'a5'),
  ...turnover('home', 200, 1, 'h6', 'a3'),
  card('home', 300, 1, 'twoMin', 'h6'),
  timeout('away', 400, 1),
  ...miss('home', 500, 1, 'sixM', 'blocked', 'h7', 'a4'),
  endPeriod(),
  sub('home', 2000, 2, 'h2', 'h8'),
  goal('home', 2100, 2, 'fastBreak', 'h8', 'h5'),
  sub('away', 2200, 2, 'agk', 'agk2'), // the keeper is replaced: the sub goes in goal
  ...miss('home', 2300, 2, 'sevenM', 'saved', 'h4', 'agk2'),
  card('away', 2400, 2, 'yellow', 'a6'),
  card('away', 2500, 2, 'red', 'a7'),
  goal('home', 3000, 2, 'breakthrough', 'h4'),
  officialCard('away', 3100, 2, 'yellow'),
  { type: 'SET_CLOCK', payload: { periodSec: 1800 } }, endPeriod(),
];
const SPORT: TotalsSport<HandballState> = { name: 'handball', init, reducer, statTotals: handballTotals, partial: false, derived: DERIVED_KEYS };

describe('SD-102 · statTotals contract (SD-19 harness)', () => {
  test('clean log + every undo prefix: owned keys = live sums; derived ≥ 0', () => {
    const t = assertContract(SPORT, toRecords(MATCH), { every: 1 });
    assert.equal(t.h4.stats.goals, 2); assert.equal(t.h4.stats.sevenMTaken, 1);
    assert.equal(t.hgk.stats.saves, 1); assert.equal(t.agk2.stats.sevenMSaves, 1);
    assert.equal(t.a7.stats.redCards, 1); assert.equal(t.h6.stats.suspensionMinutes, 2);
  });
  test('minutes on the game clock; keeper goals conceded per spell', () => {
    const t = handballTotals(run(MATCH));
    assert.equal(t.h3.stats.minutes, 60);
    assert.equal(t.h6.stats.minutes, 58, 'two minutes suspended don\'t count');
    assert.equal(t.h2.stats.minutes, Math.round(2000 / 60));
    assert.equal(t.a7.stats.minutes, Math.round(2500 / 60), 'disqualified at 41:40');
    assert.equal(t.agk.stats.goalsConceded, 2, 'before the change at 36:40'); assert.equal(t.agk2.stats.goalsConceded, 1);
    assert.equal(currentKeeper(run(MATCH), 'away')?.id, 'agk2');
  });
  test('a live correction (REMOVE_EVENT with the reversed credits) = the match scored cleanly', () => {
    const wrong = goal('home', 3000, 2, 'breakthrough', 'h5'); // wrong scorer, fixed live
    const at = MATCH.length - 4;
    const live = [...MATCH.slice(0, at), wrong];
    const ev = run(live).events.at(-1)!;
    const cr = eventCredits(ev);
    const fix: ScoreAction = { type: 'REMOVE_EVENT', payload: { id: ev.id }, attribution: creditAttribution(cr.first, -1), attribution2: creditAttribution(cr.second, -1) };
    const corrected = toRecords([...live, fix, ...MATCH.slice(at)]);
    assertContract(SPORT, corrected, { every: 1000, label: 'live remove' });
    assertSameAsClean(SPORT, corrected, toRecords(MATCH), 'live remove');
  });
  test('removing an attempt takes its keeper\'s save (the save\'s own side)', () => {
    const base = [xi('home'), xi('away')];
    const acts = miss('away', 90, 1, 'wing', 'saved', 'a2', 'hgk');
    assert.equal(acts[1].side, 'home');
    const st = run([...base, ...acts]);
    assert.equal(handballTimeline(st).length, 1, 'the save reads on the attempt row');
    assert.match(handballTimeline(st)[0].detail ?? '', /save HGK/);
    const rm = st.events.map((e): ScoreAction => ({ type: 'REMOVE_EVENT', side: e.side, payload: { id: e.id }, attribution: creditAttribution(eventCredits(e).first, -1) }));
    const recs = toRecords([...base, ...acts, ...rm]);
    assertContract(SPORT, recs, { every: 1000, label: 'remove attempt + save' });
    assertSameAsClean(SPORT, recs, toRecords(base), 'remove attempt + save');
  });
  test('#05 AMEND: re-credit a scorer and void a disqualification — totals follow', () => {
    const recs = toRecords(MATCH);
    const g = recs.find((r) => r.type === 'GOAL' && r.attribution?.playerId === 'h8')!;
    const red = recs.find((r) => r.type === 'CARD' && r.attribution?.playerId === 'a7')!;
    const action = { type: g.type, side: g.side!, payload: g.payload!, attribution: { ...g.attribution!, playerId: 'h7', playerName: 'H7' } };
    const am = amendRecord(recs, [{ op: 'replace', seq: g.seq, action }, { op: 'void', seq: red.seq }]);
    const corrected = [...recs, am];
    assertContract(SPORT, corrected, { every: 1000, label: 'AMEND' });
    const t = handballTotals(replayLog({ createInitialState: init, reducer }, undefined, corrected));
    assert.equal(t.h7.stats.fastBreakGoals, 1); assert.equal(t.h8.stats.fastBreakGoals ?? 0, 0);
    assert.equal(t.a7.stats.redCards, 0);
  });
});

/* ------------------------------ box & timeline ------------------------------ */

describe('SD-102 · box score, comparison, timeline, ticker', () => {
  const s = run(MATCH);
  test('per-player box: MIN G SH 7M AS TF ST BS SV GA YC 2\' D; per-half scope', () => {
    const src = handballBox(s);
    assert.deepEqual(src.periods.map((p) => p.label), ['H1', 'H2']);
    const table = buildBoxTable(handballStats, src.data('all'), { scope: 'all' });
    const cols = table.columns.map((c) => c.abbr);
    assert.deepEqual(cols, ['MIN', 'G', 'SH', '7M', 'AS', 'TF', 'ST', 'BS', 'SV', 'GA', 'YC', "2'", 'D']);
    const row = (side: Side, name: string) => table[side].rows.find((r) => r.name === name)!.cells;
    assert.equal(row('home', 'H4')[cols.indexOf('G')], '2');
    assert.equal(row('home', 'H4')[cols.indexOf('7M')], '0-1');
    assert.equal(row('away', 'AGK2')[cols.indexOf('GA')], '1');
    assert.equal(table.home.totals[cols.indexOf('G')], String(s.home), 'totals = the score');
    const h2 = buildBoxTable(handballStats, src.data(2), { scope: 2 });
    assert.ok(!h2.columns.some((c) => c.abbr === 'MIN'), 'MIN is overall only');
    assert.equal(h2.home.totals[h2.columns.findIndex((c) => c.abbr === 'G')], '2');
  });
  test('comparison: shooting %, types, time-outs; an official\'s warning on the Team row', () => {
    const cmp = comparisonRows(handballStats, handballBox(s).data('all'), 'all');
    const r = (label: string) => cmp.rows.find((x) => x.label === label);
    assert.deepEqual([r('Team time-outs')?.home, r('Team time-outs')?.away], ['0', '1']);
    assert.equal(r('Warnings')?.away, '2', 'a player + the official');
    assert.equal(r('Fast break goals')?.home, '1');
    assert.equal(r('Shooting %')?.home, '60%'); // 3 goals / 5 attempts
  });
  test('timeline rows: match-clock stamps, types, sanctions', () => {
    const rows = handballTimeline(s);
    assert.equal(rows.find((x) => x.kind === 'goal' && x.label === 'Goal · Fast break')!.stamp, '35:00');
    assert.equal(rows.find((x) => x.label === 'Disqualification (red)')!.tone, 'wicket');
    assert.equal(rows.find((x) => x.kind === 'turnover')!.detail, 'H6 · steal A3');
    assert.equal(rows.find((x) => x.kind === 'card' && x.detail === 'Coach (official)')!.label, 'Warning (yellow)');
  });
  test('ticker: top scorers with goal counts; GOAL! flash once', () => {
    const d = handballTickerDetail(s, { home: 'Blue', away: 'Gold' });
    assert.equal(d.left?.[0], '🤾 H4 2 · H8 1');
    const i = MATCH.findIndex((a) => a.type === 'GOAL' && a.attribution?.playerId === 'h8');
    const f = handballTickerFlash(run(MATCH.slice(0, i)), run(MATCH.slice(0, i + 1)));
    assert.deepEqual(f, { kind: 'goal', text: 'GOAL! H8 35:00', sub: 'Fast break', side: 'home' });
    assert.equal(handballTickerFlash(run(MATCH.slice(0, i + 1)), run(MATCH.slice(0, i + 2))), null);
  });
  test('match source wiring (boxSources) and the period-flow controls', () => {
    assert.ok(matchBoxSource('handball', s)?.data('all').home.rows.length);
    assert.deepEqual(FLOW_CONTROLS.handball, ['endPeriod', 'fullTime']);
  });
});

/* --------------------------------- standings -------------------------------- */

let mn = 0;
function M(h: string, a: string, st: HandballState): Match {
  const r = result(st)!;
  return {
    id: `hb${++mn}`, sport: 'handball', status: 'completed', startsAt: '', score: { home: r.home, away: r.away }, winner: r.winner,
    homeTeam: { id: h, name: h }, awayTeam: { id: a, name: a }, state: st,
  } as unknown as Match;
}
const played = (hg: number, ag: number): HandballState => run([
  ...Array.from({ length: hg }, (_, i) => goal('home', 60 + i, 1, 'nineM')),
  ...Array.from({ length: ag }, (_, i) => goal('away', 120 + i, 1, 'nineM')),
  ...fullPeriod(), ...fullPeriod(),
]);

describe('SD-102 · standings: IHF 2-1-0 and the IHF tie-break chain; Simple', () => {
  setStandingsUnitsProvider(null); setStandingsPointsProvider(null); setStandingsScoreProvider(null);
  test('new handball tournaments start on IHF 2-1-0; Simple is offered', () => {
    assert.equal(NEW_TOURNAMENT_POINTS.handball?.winPoints, 2);
    assert.deepEqual(standingsPresets('handball').map((p) => p.id), ['ihf', 'simple']);
  });
  test('2 a win, 1 a draw; ties: head-to-head points, then head-to-head goal difference', () => {
    const cfg = standingsConfigFromFormat('handball' as SportId, standingsPresets('handball')[0].set);
    assert.deepEqual(matchPoints(M('A', 'B', played(30, 28)), cfg), { home: 2, away: 0 });
    assert.deepEqual(matchPoints(M('A', 'B', played(25, 25)), cfg), { home: 1, away: 1 });
    // A, B, C on 4 points each; head-to-head among them is a cycle → h2h goal difference
    const ms = [
      M('A', 'B', played(30, 20)), M('B', 'C', played(25, 24)), M('C', 'A', played(28, 26)),
      M('A', 'D', played(21, 20)), M('B', 'D', played(30, 20)), M('C', 'D', played(19, 18)),
    ];
    const t = teamStandings(ms, 'handball' as SportId, cfg);
    assert.deepEqual(t.slice(0, 3).map((r) => [r.teamId, r.points]), [['A', 4], ['C', 4], ['B', 4]], 'A +8, C +1, B −9 among the three');
  });
});

/* ----------------------------- career & leaders ----------------------------- */

describe('SD-102 · career, leaders and awards', () => {
  test('the schema is valid and registered; suspensions declared', () => {
    assert.deepEqual(validateSchema(handballStats), []);
    assert.equal(STAT_SCHEMAS.handball, handballStats);
    assert.equal(handballStats.stats.find((x) => x.key === 'twoMinutes')?.suspension?.minutes, 2);
    assert.equal(handballStats.stats.find((x) => x.key === 'redCards')?.suspension?.permanent, true);
  });
  const lines: StatLine[] = [];
  const add = (matchId: string, st: HandballState) => {
    for (const [pid, t] of Object.entries(handballTotals(st))) lines.push({ id: `${matchId}-${pid}`, matchId, playerId: pid, sport: 'handball', stats: t.stats, won: false } as StatLine);
  };
  add('m1', run(MATCH));
  add('m2', run([xi('home'), xi('away'), goal('home', 100, 1, 'sevenM', 'h4'), goal('home', 200, 1, 'wing', 'h8'), ...miss('away', 300, 1, 'nineM', 'saved', 'a5', 'hgk'), ...miss('away', 400, 1, 'nineM', 'saved', 'a5', 'hgk'), ...fullPeriod(), ...fullPeriod()]));
  test('career: goals per game, 7 m %, save %, discipline', () => {
    const c = careerFromSchema(handballStats, lines.filter((l) => l.playerId === 'h4'));
    const v = (sec: string, k: string) => c[sec]?.find((r) => r.key === k)?.value;
    assert.equal(v('attack', 'goals'), '3'); assert.equal(v('attack', 'goalsPerGame'), '1.50'); assert.equal(v('attack', 'sevenMPct'), '50%');
    const gk = careerFromSchema(handballStats, lines.filter((l) => l.playerId === 'hgk'));
    const g = (k: string) => gk.goalkeeping.find((r) => r.key === k)?.value;
    assert.equal(g('saves'), '3'); assert.equal(g('goalsConceded'), '1'); assert.equal(g('savePct'), '75%');
    const d = careerFromSchema(handballStats, lines.filter((l) => l.playerId === 'h6'));
    assert.equal(d.discipline.find((r) => r.key === 'twoMinutes')?.value, '1');
    assert.equal(d.discipline.find((r) => r.key === 'suspensionMinutes')?.value, '2');
  });
  test('leaders: top scorer; keepers only for save %', () => {
    const players: Player[] = [...HOME, 'h8', ...AWAY, 'agk2'].map((id) => ({ id, fullName: nm(id), sports: ['handball'] } as Player));
    const cats = categoryLeaders(lines, players, 'handball' as SportId);
    assert.deepEqual(cats.find((x) => x.key === 'goals')!.leaders.slice(0, 1).map((l) => [l.name, l.value]), [['H4', 3]]);
    const gk = rankAwardCandidates(lines, players, 'handball' as SportId, 'savePct', 5, { mins: { savePct: 1 } } as never);
    assert.ok(gk.length > 0 && gk.every((x) => ['hgk', 'agk', 'agk2'].includes(x.playerId)), 'keepers only');
  });
});

/* ------------------------------- source guards ------------------------------- */

describe('SD-102 · scorer-flow guards (SD-106 / SD-114 / SD-116)', () => {
  const src = readFileSync(new URL('../src/sports/handball/index.tsx', import.meta.url), 'utf8');
  test('Full time asks first and is disabled until the last half has started', () => {
    assert.ok(/confirmMatchAction\('fullTime'/.test(src) && /confirmMatchAction\('endPeriod'/.test(src));
    assert.ok(/label="🏁 Full time" variant="danger" disabled=\{!periodStarted\(s\)\}/.test(src));
  });
  test('edits go through usePendingEdit; ✕ via the shared confirm; backfill bar', () => {
    assert.match(src, /usePendingEdit\(liveState, rawDispatch, reducer\)/);
    assert.match(src, /holdRemoval\(/); assert.match(src, /dropHeldRemoval\(\)/);
    assert.match(src, /confirmRemove\(/); assert.match(src, /<RowAction label="✕"/);
    assert.match(src, /<BackfillBar /);
  });
});
