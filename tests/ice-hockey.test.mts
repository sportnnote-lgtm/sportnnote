/**
 * SD-145 — ice hockey (IIHF; NHL / NFHS / youth presets):
 *  - goals with up to two assists, PP / SH / EN flags, shots on goal with the
 *    other goalie's save, penalty shots;
 *  - the penalty box: minors end early on a power-play goal (the earliest),
 *    double minors lose one half, majors run in full, a third penalty waits
 *    (never below 3 skaters), coincident minors (4 on 4 at full strength,
 *    cancelled otherwise), misconducts, ejections, 3-on-3 overtime strength;
 *  - periods, sudden-death overtime (round robin / play-off, NHL repeat),
 *    shoot-out (5 / 3 shooters, early decision, sudden-death order pick), the
 *    shoot-out winner's credited goal;
 *  - statTotals (SD-19 harness: live sums, every undo prefix, corrections),
 *    goalie MIN / GA / SA / shutout, GWG, +/-; box score; standings (IIHF
 *    3-2-1-0, NHL 2-1-0 with RW / ROW), OTW / OTL columns; stage-aware
 *    deciders; walkover; discipline; records; game flow; voice; timeline,
 *    ticker, undo label; schema, leaders and awards.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  init, reducer, isComplete, result, matchSec, clockFace, periodName, eventCredits, creditAttribution, penaltyBox, skatersOn,
  goalFlagsNow, goalieAt, decideShootout, nextShooter, soScore, teamFigures, iceHockeyScoreLine, standingsUnits, decidedIn, penMinutes,
  type IceHockeyState, type Side, type IceEvent, type PenKind, type Strength,
} from '../src/sports/ice_hockey/engine.ts';
import { iceHockeyTotals, DERIVED_KEYS, gameWinningGoal } from '../src/sports/ice_hockey/totals.ts';
import { iceHockeyBox } from '../src/sports/ice_hockey/box.ts';
import { iceHockeyStats } from '../src/sports/ice_hockey/stats.ts';
import { iceHockeyTimeline } from '../src/sports/ice_hockey/timeline.ts';
import { iceHockeyTickerDetail, iceHockeyTickerFlash } from '../src/sports/ice_hockey/ticker.ts';
import { iceHockeyVoice, iceHockeyVoiceEnds } from '../src/sports/ice_hockey/voice.ts';
import { iceHockeyMatchRecords } from '../src/sports/ice_hockey/records.ts';
import { ICE_HOCKEY_DISCIPLINE } from '../src/sports/ice_hockey/discipline.ts';
import { buildBoxTable } from '../src/sports/boxScore.ts';
import { validateSchema, careerFromSchema } from '../src/sports/statSchema.ts';
import { matchBoxSource } from '../src/sports/boxSources.ts';
import { STAT_SCHEMAS } from '../src/sports/statSchemas.ts';
import { FLOW_CONTROLS } from '../src/core/matchSafety.ts';
import { matchFormatFor, aggregateLegFormat, hasDecider } from '../src/data/matchFormat.ts';
import { walkoverRuleFor } from '../src/data/walkover.ts';
import { DISCIPLINE_SPECS, hasDiscipline } from '../src/sports/discipline.ts';
import { MATCH_RECORD_HOOKS } from '../src/sports/matchRecordHooks.ts';
import { matchRecordTypes } from '../src/sports/matchRecords.ts';
import { gameFlowFor, GAME_FLOW_SPORTS } from '../src/sports/gameFlow.ts';
import { tableColumns } from '../src/data/standingsColumns.ts';
import {
  teamStandings, standingsConfigFromFormat, standingsPresets, NEW_TOURNAMENT_POINTS, setStandingsUnitsProvider, activePreset, scoreUnit,
} from '../src/data/standings.ts';
import { assertContract, assertSameAsClean, toRecords, type TotalsSport } from './statTotalsHarness.mts';
import type { ScoreAction } from '../src/sports/types.ts';
import type { Match, Player, SportId, StatLine } from '../src/core/types.ts';

/* ---------------------------------- helpers --------------------------------- */

const HOME = ['hg', 'h2', 'h3', 'h4', 'h5', 'h6'];
const AWAY = ['ag', 'a2', 'a3', 'a4', 'a5', 'a6'];
const nm = (id: string) => id.toUpperCase();
let u = 0;
function A(type: string, side: Side | undefined, sec: number, period: number, ev: Partial<IceEvent> = {}, payload: Record<string, unknown> = {}): ScoreAction {
  const cr = eventCredits({ type: ev.type ?? 'timeout', side: side ?? 'home', ...ev } as IceEvent);
  const a: ScoreAction = { type, ...(side ? { side } : {}), payload: { ...payload, uid: `u${++u}`, sec, period } };
  const a1 = creditAttribution(cr.first);
  const a2 = creditAttribution(cr.second);
  if (a1) a.attribution = a1;
  if (a2) a.attribution2 = a2;
  return a;
}
const xi = (team: Side) => ({ type: 'XI', payload: { team, players: (team === 'home' ? HOME : AWAY).map((id) => ({ id, name: nm(id) })), gk: { id: team === 'home' ? 'hg' : 'ag', name: nm(team === 'home' ? 'hg' : 'ag') } } });
const opp = (x: Side): Side => (x === 'home' ? 'away' : 'home');
/** a goal (+ the second assist's own action), flags given */
function goal(side: Side, sec: number, period: number, scorer?: string, a1?: string, a2?: string, f: { strength?: Strength; en?: boolean; onIce?: { home?: string[]; away?: string[] } } = {}): ScoreAction[] {
  const strength = f.strength ?? 'ev';
  const g = A('GOAL', side, sec, period, { type: 'goal', playerId: scorer, playerName: scorer && nm(scorer), secondId: a1, secondName: a1 && nm(a1), strength, en: f.en },
    { strength, ...(f.en ? { en: true } : {}), ...(f.onIce ? { onIce: f.onIce } : {}) });
  if (!a2) return [g];
  const c3 = creditAttribution(eventCredits({ type: 'goal', side, thirdId: a2, thirdName: nm(a2) }).third);
  return [g, { type: 'ASSIST2', side, payload: { ref: g.payload!.uid, uid: `u${++u}` }, attribution: c3 }];
}
const shot = (side: Side, sec: number, period: number, shooter?: string, gk: string | undefined = side === 'home' ? 'ag' : 'hg') =>
  A('SHOT', side, sec, period, { type: 'shot', playerId: shooter, playerName: shooter && nm(shooter), gkId: gk, gkName: gk && nm(gk) });
const pen = (side: Side, sec: number, period: number, kind: PenKind, who?: string, infraction?: string) =>
  A('PEN', side, sec, period, { type: 'pen', pen: kind, playerId: who, playerName: who && nm(who) }, { pen: kind, ...(infraction ? { infraction } : {}) });
const endPeriod = (): ScoreAction => ({ type: 'END_PERIOD', payload: { at: 0 } });
const run = (actions: ScoreAction[], config?: Record<string, unknown>, from?: IceHockeyState): IceHockeyState => actions.reduce(reducer, from ?? init(config));
const periods = (n: number): ScoreAction[] => Array.from({ length: n }, () => endPeriod());

/* ------------------------------ goals and shots ----------------------------- */

describe('SD-145 · goals, two assists, shots on goal and saves', () => {
  const s = run([
    xi('home'), xi('away'),
    ...goal('home', 100, 1, 'h4', 'h3', 'h2'),
    ...goal('away', 400, 1, 'a5'),
    shot('home', 500, 1, 'h4'), shot('home', 520, 1, 'h5'), shot('away', 600, 1, 'a2'),
    ...goal('home', 1500, 2, undefined, 'h6'), // team goal (no scorer), one assist
  ]);
  test('score, assists on the goal event', () => {
    assert.deepEqual([s.home, s.away], [2, 1]);
    const g = s.events.find((e) => e.type === 'goal')!;
    assert.deepEqual([g.playerId, g.secondId, g.thirdId], ['h4', 'h3', 'h2']);
  });
  test('player credits: points = G + A, shots on goal, goalie saves (other side)', () => {
    const t = iceHockeyTotals(s);
    assert.deepEqual([t.h4.stats.goals, t.h4.stats.points, t.h4.stats.shotsOnGoal], [1, 1, 2]);
    assert.deepEqual([t.h3.stats.assists, t.h3.stats.points, t.h2.stats.assists, t.h6.stats.assists], [1, 1, 1, 1]);
    assert.equal(t.ag.side, 'away'); assert.equal(t.ag.stats.saves, 2);
    assert.equal(t.hg.stats.saves, 1);
  });
  test('goalie derived figures: GA, SA, minutes in net', () => {
    const t = iceHockeyTotals(s);
    assert.deepEqual([t.ag.stats.goalsAgainst, t.ag.stats.shotsAgainst], [2, 4]);
    assert.deepEqual([t.hg.stats.goalsAgainst, t.hg.stats.shotsAgainst], [1, 2]);
    assert.equal(t.hg.stats.gkMinutes, 25);
  });
  test('team figures', () => {
    const h = teamFigures(s, 'home');
    assert.deepEqual([h.goals, h.shotsOnGoal, h.saves], [2, 4, 1]);
    assert.equal(teamFigures(s, 'home', 2).goals, 1);
  });
});

/* ------------------------------- penalty box -------------------------------- */

describe('SD-145 · penalties: power play, early end, double minor, major, delayed, coincident', () => {
  test('a minor: 5 on 4, ends early on a power-play goal (the earliest minor)', () => {
    let s = run([xi('home'), xi('away'), pen('away', 100, 1, 'minor', 'a2', 'Tripping'), pen('away', 130, 1, 'minor', 'a3')]);
    let box = penaltyBox(s, 140);
    assert.deepEqual(skatersOn(s, box), { home: 5, away: 3 });
    assert.equal(goalFlagsNow(s, 'home', 140).strength, 'pp');
    assert.equal(goalFlagsNow(s, 'away', 140).strength, 'sh');
    s = run(goal('home', 150, 1, 'h4', undefined, undefined, { strength: 'pp' }), undefined, s);
    box = penaltyBox(s, 160);
    assert.deepEqual(box.running.away.map((p) => p.who.id), ['a3']);
    assert.equal(box.all.find((p) => p.who.id === 'a2')?.endedBy, 'goal');
    assert.deepEqual(skatersOn(s, box), { home: 5, away: 4 });
    // a3's minor runs out at 130 + 120
    assert.deepEqual(skatersOn(s, penaltyBox(s, 251)), { home: 5, away: 5 });
  });
  test('a short-handed goal ends nothing', () => {
    const s = run([pen('away', 100, 1, 'minor', 'a2'), ...goal('away', 150, 1, 'a4', undefined, undefined, { strength: 'sh' })]);
    assert.equal(penaltyBox(s, 160).running.away.length, 1);
  });
  test('double minor: a PP goal ends only the current 2 minutes', () => {
    let s = run([pen('home', 100, 1, 'double', 'h5', 'High-sticking')]);
    s = run(goal('away', 160, 1, 'a2', undefined, undefined, { strength: 'pp' }), undefined, s);
    const box = penaltyBox(s, 170);
    assert.equal(box.running.home.length, 1);
    assert.equal(box.running.home[0].part, 1);
    assert.equal(box.running.home[0].partStart, 160);
    assert.equal(penaltyBox(s, 281).running.home.length, 0, 'ends 2 min after the goal');
  });
  test('major: runs the full 5 minutes whatever the goals', () => {
    const s = run([pen('home', 100, 1, 'major', 'h5', 'Boarding'), ...goal('away', 150, 1, 'a2', undefined, undefined, { strength: 'pp' }), ...goal('away', 200, 1, 'a3', undefined, undefined, { strength: 'pp' })]);
    assert.equal(penaltyBox(s, 390).running.home.length, 1);
    assert.equal(penaltyBox(s, 401).running.home.length, 0);
  });
  test('a third penalty waits (delayed) — never below 3 skaters', () => {
    const s = run([pen('home', 100, 1, 'minor', 'h2'), pen('home', 110, 1, 'minor', 'h3'), pen('home', 120, 1, 'minor', 'h4')]);
    const box = penaltyBox(s, 130);
    assert.equal(box.running.home.length, 2);
    assert.equal(box.waiting.home.length, 1);
    assert.deepEqual(skatersOn(s, box), { home: 3, away: 5 });
    const later = penaltyBox(s, 225);
    assert.equal(later.running.home.find((p) => p.who.id === 'h4')?.start, 220, 'starts when h2\'s ends');
  });
  test('coincident minors: one each at full strength = 4 on 4; otherwise cancelled', () => {
    const s = run([pen('home', 100, 1, 'minor', 'h2'), pen('away', 100, 1, 'minor', 'a2')]);
    assert.deepEqual(skatersOn(s, penaltyBox(s, 110)), { home: 4, away: 4 });
    const t = run([pen('home', 50, 1, 'minor', 'h6'), pen('home', 100, 1, 'minor', 'h2'), pen('away', 100, 1, 'minor', 'a2')]);
    const box = penaltyBox(t, 110);
    assert.ok(box.all.filter((p) => p.coincident).length === 2);
    assert.deepEqual(skatersOn(t, box), { home: 4, away: 5 });
  });
  test('misconduct: player sits 10 minutes, team not short; GM / match eject', () => {
    const s = run([pen('home', 100, 1, 'misconduct', 'h2'), pen('away', 100, 1, 'gm', 'a3'), pen('away', 200, 1, 'match', 'a4')]);
    const box = penaltyBox(s, 210);
    assert.equal(box.misconduct.length, 1);
    assert.deepEqual(box.ejected.map((x) => x.who.id).sort(), ['a3', 'a4']);
    assert.deepEqual(skatersOn(s, box), { home: 5, away: 4 }, 'a match penalty leaves the team short 5 minutes');
  });
  test('PIM: IIHF GM 20 / MP 25, NHL 10 / 10; counts', () => {
    assert.deepEqual([penMinutes('gm', 'iihf'), penMinutes('match', 'iihf'), penMinutes('gm', 'nhl'), penMinutes('match', 'nhl'), penMinutes('majorGm', 'iihf')], [20, 25, 10, 10, 25]);
    const s = run([pen('home', 1, 1, 'minor', 'h2'), pen('home', 2, 1, 'double', 'h2'), pen('home', 3, 1, 'major', 'h3')]);
    const t = iceHockeyTotals(s);
    assert.deepEqual([t.h2.stats.penaltyMinutes, t.h2.stats.minors, t.h3.stats.majors], [6, 2, 1]);
  });
  test('3-on-3 overtime: a penalty makes it 4 on 3', () => {
    let s = run([...periods(3)], { decider: 'otso' });
    assert.equal(s.period, 4);
    s = run([pen('away', 3700, 4, 'minor', 'a2')], undefined, s);
    assert.deepEqual(skatersOn(s, penaltyBox(s, 3710)), { home: 4, away: 3 });
  });
  test('empty net flag from a pulled goalie; goalie back', () => {
    let s = run([xi('home'), xi('away'), { type: 'PULL', side: 'away', payload: { uid: 'p', sec: 3500, period: 3 } }]);
    assert.equal(goalFlagsNow(s, 'home', 3510).en, true);
    assert.equal(goalieAt(s, 'away'), undefined);
    s = run([...goal('home', 3510, 3, 'h3', undefined, undefined, { en: true })], undefined, s);
    const t = iceHockeyTotals(s);
    assert.equal(t.h3.stats.enGoals, 1);
    assert.equal(t.ag.stats.goalsAgainst, 0, 'an empty-net goal isn\'t on the goalie');
    s = run([{ type: 'BACK', side: 'away', payload: { uid: 'b', sec: 3520, period: 3 } }], undefined, s);
    assert.equal(goalieAt(s, 'away')?.id, 'ag');
  });
});

/* ------------------------- periods, overtime, shoot-out --------------------- */

describe('SD-145 · periods, sudden-death overtime, shoot-out', () => {
  const T = 1_700_000_000_000;
  test('the clock counts down per period; events carry elapsed game seconds', () => {
    let s = init({ periodMinutes: 20 });
    s = reducer(s, { type: 'CLOCK', payload: { run: true, at: T } });
    assert.equal(clockFace(s, T + 65_000), '18:55');
    s = reducer(s, { type: 'END_PERIOD', payload: { at: T + 1_200_000 } });
    assert.equal(s.period, 2);
    assert.equal(matchSec(s), 1200);
    assert.equal(periodName(s, 4), 'OT');
  });
  test('regulation tie with no decider stands', () => {
    const s = run(periods(3));
    assert.equal(isComplete(s), true);
    assert.deepEqual(result(s), { winner: 'draw', home: 0, away: 0 });
  });
  test('round-robin OT: a goal ends it (sudden death), decided in OT', () => {
    const s = run([...periods(3), ...goal('away', 3700, 4, 'a3')], { decider: 'otso' });
    assert.equal(s.ended, true);
    assert.deepEqual(result(s), { winner: 'away', home: 0, away: 1 });
    assert.equal(decidedIn(s), 'ot');
    assert.deepEqual(standingsUnits(s), { decidedIn: 'ot', overtime: true });
  });
  test('round-robin OT scoreless → shoot-out; the winner is credited one goal', () => {
    let s = run([...goal('home', 10, 1, 'h2'), ...goal('away', 20, 1, 'a2'), ...periods(4)], { decider: 'otso', soRounds: 3 });
    assert.equal(s.ended, true);
    assert.equal(isComplete(s), false);
    s = reducer(s, { type: 'START_SHOOTOUT', payload: { first: 'away' } });
    for (const [side, scored] of [['away', true], ['home', false], ['away', false], ['home', true], ['away', true], ['home', false]] as [Side, boolean][]) {
      assert.equal(nextShooter(s.shootout!, 3), side);
      s = reducer(s, { type: 'SO', side, payload: { scored } });
    }
    assert.equal(s.shootoutWinner, 'away');
    assert.deepEqual(result(s), { winner: 'away', home: 1, away: 2 });
    assert.equal(iceHockeyScoreLine(s), 'SO 1–2');
    assert.equal(decidedIn(s), 'so');
    assert.equal(gameWinningGoal(s), undefined, 'no GWG in a shoot-out win');
  });
  test('shoot-out: decided early; sudden death with the order picked (SD-139)', () => {
    assert.equal(decideShootout([{ scored: true }, { scored: true }, { scored: true }], [{ scored: false }, { scored: false }], 5), undefined);
    assert.equal(decideShootout([{ scored: true }, { scored: true }], [{ scored: false }, { scored: false }], 3), 'home');
    let s = run(periods(3), { decider: 'so', soRounds: 3 });
    s = reducer(s, { type: 'START_SHOOTOUT', payload: { first: 'home' } });
    for (let i = 0; i < 6; i++) s = reducer(s, { type: 'SO', side: nextShooter(s.shootout!, 3), payload: { scored: false } });
    assert.equal(s.shootout!.sdFirst, undefined);
    s = reducer(s, { type: 'SO_ORDER', payload: { first: 'away' } });
    assert.equal(nextShooter(s.shootout!, 3), 'away');
    s = reducer(s, { type: 'SO', side: 'away', payload: { scored: true } });
    s = reducer(s, { type: 'SO', side: 'home', payload: { scored: false } });
    assert.equal(s.shootoutWinner, 'away');
    assert.deepEqual(soScore(s), { home: 0, away: 1 });
  });
  test('NHL play-off overtime repeats until a goal; IIHF play-off OT then a shoot-out', () => {
    let nhl = run(periods(3), { decider: 'playoff', poShootout: false, poOtMinutes: 20, poOtSkaters: 5 });
    nhl = run(periods(2), undefined, nhl);
    assert.equal(nhl.period, 6);
    assert.equal(periodName(nhl, 6), 'OT3');
    nhl = run(goal('home', 3 * 1200 + 2 * 1200 + 300, 6, 'h2'), undefined, nhl);
    assert.equal(isComplete(nhl), true);
    let iihf = run(periods(4), { decider: 'playoff', poShootout: true });
    assert.equal(iihf.ended, true);
    iihf = reducer(iihf, { type: 'START_SHOOTOUT', payload: { first: 'home' } });
    assert.ok(iihf.shootout);
  });
  test('removing an OT winner reopens the game', () => {
    let s = run([...periods(3), ...goal('away', 3700, 4, 'a3')], { decider: 'otso' });
    const id = s.events[0].id;
    s = reducer(s, { type: 'REMOVE_EVENT', payload: { id } });
    assert.equal(s.ended, false);
  });
});

/* ------------------------------- statTotals --------------------------------- */

const SPORT: TotalsSport<IceHockeyState> = {
  name: 'ice hockey', init, reducer, statTotals: iceHockeyTotals, config: { decider: 'otso', plusMinus: true },
  derived: DERIVED_KEYS as unknown as string[], signed: ['plusMinus'],
};

describe('SD-145 · statTotals contract (SD-19 harness)', () => {
  const log: ScoreAction[] = [
    xi('home'), xi('away'),
    ...goal('home', 100, 1, 'h4', 'h3', 'h2', { onIce: { home: ['h2', 'h3', 'h4', 'h5', 'h6'], away: ['a2', 'a3', 'a4', 'a5', 'a6'] } }),
    shot('away', 150, 1, 'a2'), pen('away', 200, 1, 'minor', 'a3', 'Hooking'),
    ...goal('home', 230, 1, 'h5', 'h4', undefined, { strength: 'pp', onIce: { home: ['h2', 'h3', 'h4', 'h5', 'h6'], away: ['a2', 'a4', 'a5', 'a6'] } }),
    shot('home', 300, 1, 'h6'), pen('home', 1500, 2, 'double', 'h2'), pen('home', 1600, 2, 'misconduct', 'h3'),
    ...goal('away', 1550, 2, 'a6', 'a5', 'a4', { strength: 'pp' }),
    { type: 'GK', side: 'away', payload: { id: 'a9', name: 'A9', uid: 'gk', sec: 2400, period: 3 } },
    shot('home', 2500, 3, 'h4', 'a9'),
    { type: 'PULL', side: 'away', payload: { uid: 'pl', sec: 3500, period: 3 } },
    ...goal('home', 3550, 3, 'h3', undefined, undefined, { en: true, onIce: { home: ['h2', 'h3', 'h4', 'h5', 'h6'], away: ['a2', 'a3', 'a4', 'a5', 'a6', 'a9'] } }),
    endPeriod(), endPeriod(), endPeriod(),
  ];
  const records = toRecords(log);
  test('live sums = totals on every prefix (undo)', () => {
    const t = assertContract(SPORT, records);
    assert.equal(t.h4.stats.points, 2);
    assert.equal(t.h5.stats.ppGoals, 1);
    assert.equal(t.a6.stats.ppGoals, 1);
    assert.equal(t.h2.stats.penaltyMinutes, 4);
    assert.equal(t.h3.stats.penaltyMinutes, 10);
    assert.equal(t.h3.stats.enGoals, 1);
  });
  test('goalies: change mid-game, shutout only for a lone goalie, GWG, +/-', () => {
    const s = run(log, SPORT.config);
    const t = iceHockeyTotals(s);
    assert.equal(t.ag.stats.goalsAgainst, 2);
    assert.equal(t.a9.stats.goalsAgainst, 0, 'pulled for the empty-net goal');
    assert.equal(t.a9.stats.saves, 1);
    assert.equal(t.ag.stats.shutouts + t.a9.stats.shutouts, 0);
    assert.equal(t.hg.stats.shutouts, 0, 'conceded one');
    assert.equal(t.h5.stats.gwg, 1, '2nd home goal beats the away total of 1');
    assert.equal(t.h2.stats.plusMinus, 2, '+1 ev goal, +1 en goal; the PP goal does not count');
    assert.equal(t.a2.stats.plusMinus, -2);
    assert.equal(t.a9.stats.plusMinus, undefined, 'goalies never get +/-');
  });
  test('a correction (remove + re-enter, backfilled to its time) matches a clean log', () => {
    const play = log.slice(0, -3);
    const wrong = [...play.slice(0, 2), ...goal('home', 100, 1, 'h6', 'h3'), ...play.slice(2 + 2)];
    const s0 = run(wrong, SPORT.config);
    const bad = s0.events.find((e) => e.type === 'goal')!;
    const cr = eventCredits(bad);
    const fix: ScoreAction[] = [
      { type: 'REMOVE_EVENT', side: 'home', payload: { id: bad.id }, attribution: creditAttribution(cr.first, -1), attribution2: creditAttribution(cr.second, -1) },
      ...goal('home', 100, 1, 'h4', 'h3', 'h2', { onIce: { home: ['h2', 'h3', 'h4', 'h5', 'h6'], away: ['a2', 'a3', 'a4', 'a5', 'a6'] } }),
    ];
    assertSameAsClean(SPORT, toRecords([...wrong, ...fix, ...periods(3)]), toRecords(log), 'goal re-entered');
  });
  test('shutout for the only goalie who conceded nothing', () => {
    const s = run([xi('home'), xi('away'), ...goal('home', 100, 1, 'h2'), shot('away', 200, 1, 'a2'), ...periods(3)]);
    assert.equal(iceHockeyTotals(s).hg.stats.shutouts, 1);
    assert.equal(iceHockeyMatchRecords(s)!.items.some((i) => i.type === 'shutout' && i.playerId === 'hg'), true);
  });
});

/* -------------------------------- box score --------------------------------- */

describe('SD-145 · box score, timeline, ticker', () => {
  const s = run([xi('home'), xi('away'), ...goal('home', 100, 1, 'h4', 'h3', 'h2'), shot('away', 150, 1, 'a2'), pen('home', 200, 1, 'bench'), endPeriod(), ...goal('away', 1300, 2, 'a3', undefined, undefined, { strength: 'pp' })]);
  test('box: G A PTS PIM SOG for skaters, SA SV SV% GA for goalies; bench minor on the team row', () => {
    const src = matchBoxSource('ice_hockey', s)!;
    const t = buildBoxTable(iceHockeyStats, src.data('all'));
    const cols = t.columns.map((c) => c.abbr);
    for (const k of ['G', 'A', 'PTS', 'PIM', 'SOG', 'SA', 'SV', 'SV%', 'GA', 'MIN']) assert.ok(cols.includes(k), k);
    const h4 = t.home.rows.find((r) => r.playerId === 'h4')!;
    assert.equal(h4.cells[cols.indexOf('PTS')], '1');
    const hg = t.home.rows.find((r) => r.playerId === 'hg')!;
    assert.equal(hg.cells[cols.indexOf('SV%')], '50.0%');
    assert.ok(t.home.rows.some((r) => r.team), 'bench minor on the team row');
    assert.equal(t.home.totals[cols.indexOf('PIM')], '2');
    assert.deepEqual(src.data(2).home.rows.find((r) => r.playerId === 'h4')?.stats.goals, 0);
  });
  test('timeline rows: goals with tags and assists, penalties; shots left out', () => {
    const tl = iceHockeyTimeline(s);
    assert.equal(tl.length, 3);
    assert.match(tl[0].detail!, /H4 · assists H3, H2/);
    assert.match(tl[2].label, /Goal \(PP\)/);
    assert.equal(tl[2].stamp, 'P2 01:40');
  });
  test('ticker: scorers by period, flash on a new goal', () => {
    const d = iceHockeyTickerDetail(s, { home: 'Hawks', away: 'Wolves' });
    assert.match(d.left![0], /P1/);
    const prev = { ...s, events: s.events.slice(0, -1) };
    assert.equal(iceHockeyTickerFlash(prev, s)?.sub, 'PP');
  });
});

/* -------------------------- standings and deciders -------------------------- */

const team = (id: string) => ({ id, name: id.toUpperCase(), shortName: id, sport: 'ice_hockey' as SportId });
let mid = 0;
function game(h: string, a: string, st: IceHockeyState, stage = 'group'): Match {
  const r = result(st)!;
  return { id: `m${++mid}`, sport: 'ice_hockey', status: 'completed', startsAt: '2026-10-12', stage, homeTeam: team(h), awayTeam: team(a), score: { home: r.home, away: r.away }, winner: r.winner, state: st } as Match;
}
const reg = (h: number, a: number) => run([...Array.from({ length: h }, (_, i) => goal('home', 10 + i, 1)).flat(), ...Array.from({ length: a }, (_, i) => goal('away', 20 + i, 1)).flat(), ...periods(3)], { decider: 'otso' });
const ot = (winner: Side) => run([...periods(3), ...goal(winner, 3700, 4)], { decider: 'otso' });
const so = (winner: Side) => {
  let s = run(periods(4), { decider: 'otso', soRounds: 3 });
  s = reducer(s, { type: 'START_SHOOTOUT', payload: { first: winner } });
  s = reducer(s, { type: 'SO', side: winner, payload: { scored: true } });
  for (let i = 0; i < 5; i++) s = reducer(s, { type: 'SO', side: nextShooter(s.shootout!, 3), payload: { scored: false } });
  return s;
};

describe('SD-145 · standings: IIHF 3-2-1-0, NHL 2-1-0, RW / ROW, OTW / OTL', () => {
  setStandingsUnitsProvider((sport, state) => (sport === 'ice_hockey' && state ? standingsUnits(state as IceHockeyState) : null));
  const ms = [game('a', 'b', reg(3, 1)), game('b', 'c', ot('home')), game('c', 'a', so('home')), game('a', 'd', so('away')), game('d', 'b', reg(0, 2))];
  test('IIHF: regulation win 3, OT / SO win 2, OT / SO loss 1', () => {
    assert.equal(scoreUnit('ice_hockey'), 'goals');
    const cfg = standingsConfigFromFormat('ice_hockey', NEW_TOURNAMENT_POINTS.ice_hockey);
    assert.deepEqual(cfg.overtime, { win: 2, loss: 1 });
    const rows = teamStandings(ms, 'ice_hockey', cfg);
    const p = Object.fromEntries(rows.map((r) => [r.teamId, r.points]));
    // a: reg W 3 (a-b) + SO L 1 (c-a) + SO L 1 (a-d, d won); b: 2 (OT W) + 3; c: 1 + 2; d: 2
    assert.deepEqual(p, { a: 5, b: 5, c: 3, d: 2 });
    const cols = tableColumns('ice_hockey', cfg, 'team', rows);
    assert.deepEqual(cols.columns.slice(0, 5).map((c) => c.label), ['P', 'W', 'OTW', 'OTL', 'L']);
    const a = rows.find((r) => r.teamId === 'a')!;
    const val = (k: string) => cols.columns.find((c) => c.key === k)!.value(a, rows);
    assert.deepEqual([val('won'), val('otw'), val('otl'), val('lost')], ['1', '0', '2', '0']);
    assert.equal(activePreset('ice_hockey', NEW_TOURNAMENT_POINTS.ice_hockey)?.id, 'iihf');
  });
  test('NHL: 2 a win, 1 an OT loss; ties on regulation wins then ROW', () => {
    const nhl = standingsPresets('ice_hockey').find((p) => p.id === 'nhl')!;
    const cfg = standingsConfigFromFormat('ice_hockey', nhl.set);
    // x beats y in regulation, y beats x in OT → 2 + 1 = 3 and 2 + 1 = 3? x: 2 + 1 (OTL) = 3, y: 0 + 2 = 2
    const two = [game('x', 'y', reg(2, 0)), game('y', 'x', ot('home')), game('z', 'w', so('home')), game('w', 'z', so('home'))];
    const rows = teamStandings(two, 'ice_hockey', cfg);
    const pts = Object.fromEntries(rows.map((r) => [r.teamId, r.points]));
    assert.deepEqual(pts, { x: 3, y: 2, z: 3, w: 3 });
    // x (1 RW) ranks above z / w (0 RW) on 3 points
    assert.equal(rows[0].teamId, 'x');
    const cols = tableColumns('ice_hockey', cfg, 'team', rows);
    assert.ok(cols.columns.some((c) => c.key === 'otl') && !cols.columns.some((c) => c.key === 'otw'));
  });
  test('Simple 2-1-0 preset clears the overtime points', () => {
    const simple = standingsPresets('ice_hockey').find((p) => p.id === 'simple')!;
    assert.equal(simple.set.otWinPoints, '');
    assert.equal(standingsConfigFromFormat('ice_hockey', simple.set).overtime, undefined);
  });
  test('stage-aware deciders: groups OT + SO, knockouts play-off OT, ties allowed by option, two legs', () => {
    assert.equal(hasDecider('ice_hockey'), true);
    assert.equal(matchFormatFor(null, 'ice_hockey', false).decider, 'otso');
    assert.equal(matchFormatFor({ formats: { ice_hockey: { allowTies: true } } } as never, 'ice_hockey', false).decider, 'none');
    assert.equal(matchFormatFor({ formats: { ice_hockey: { decider: 'none' } } } as never, 'ice_hockey', true).decider, 'playoff');
    assert.equal(matchFormatFor({ formats: { ice_hockey: { decider: 'so' } } } as never, 'ice_hockey', false).decider, 'so');
    assert.equal(aggregateLegFormat({}, 'ice_hockey', 1).decider, 'none');
    const leg2 = aggregateLegFormat({ aggPriorHome: 1, aggPriorAway: 2 }, 'ice_hockey', 2);
    assert.equal(leg2.decider, 'playoff');
    // leg 2 won 1-0 levels the aggregate → play-off OT
    let s = run([...goal('home', 100, 1), ...periods(3)], { ...leg2, aggPriorHome: 1, aggPriorAway: 2 });
    assert.equal(s.period, 4);
    s = run(goal('home', 3700, 4), undefined, s);
    assert.equal(isComplete(s), true);
  });
  test('walkover 5-0 (IIHF, verify), discipline spec, records, game flow, flow controls', () => {
    assert.deepEqual([walkoverRuleFor('ice_hockey')?.win, walkoverRuleFor('ice_hockey')?.loss], [5, 0]);
    assert.equal(hasDiscipline('ice_hockey'), true);
    assert.equal(DISCIPLINE_SPECS.ice_hockey, ICE_HOCKEY_DISCIPLINE);
    const marks = ICE_HOCKEY_DISCIPLINE.marks({ state: run([pen('home', 1, 1, 'match', 'h2'), pen('away', 2, 1, 'majorGm', 'a2'), pen('away', 3, 1, 'bench')]) } as never);
    assert.deepEqual(marks.map((m) => `${m.col}:${m.off ?? ''}`), ['match:banMatch', 'major:', 'gm:banGm', 'minor:']);
    assert.equal(marks[3].official, 'Bench');
    assert.equal(MATCH_RECORD_HOOKS.ice_hockey, iceHockeyMatchRecords);
    assert.ok(matchRecordTypes('ice_hockey').some((t) => t.key === 'shutout'));
    const hat = run([...goal('home', 10, 1, 'h2'), ...goal('home', 20, 1, 'h2'), ...goal('home', 30, 1, 'h2'), ...periods(3)]);
    assert.equal(iceHockeyMatchRecords(hat)!.items.find((i) => i.type === 'hatTrick')?.value, 3);
    assert.ok((GAME_FLOW_SPORTS as readonly string[]).includes('ice_hockey'));
    assert.equal(gameFlowFor('ice_hockey', hat)?.scores, 3);
    assert.deepEqual(FLOW_CONTROLS.ice_hockey, ['endPeriod', 'fullTime']);
  });
});

/* ----------------------------------- voice ---------------------------------- */

describe('SD-145 · voice (confirm gate for ends)', () => {
  const P = (id: string, fullName: string, jerseyNo?: number): Player => ({ id, fullName, jerseyNo, sports: ['ice_hockey'] } as Player);
  const homeRoster = [P('h2', 'Asha Rao', 2), P('h3', 'Meera Khan', 3), P('h4', 'Kiran Patel', 4), P('hg', 'Tara Singh', 1)];
  const awayRoster = [P('a2', 'Ravi Nair', 12), P('ag', 'Dev Shah', 31)];
  const T = 1_700_000_000_000;
  const live = run([xi('home'), xi('away'), { type: 'CLOCK', payload: { run: true, at: T - 300_000 } }]);
  const ctx = (s: IceHockeyState) => ({ state: s, homeName: 'Hawks', awayName: 'Wolves', homeRoster, awayRoster, now: T });
  test('goal with two assists → GOAL + ASSIST2; strength from the penalties', () => {
    const acts = iceHockeyVoice('goal Rao assist Khan and Patel', ctx(live))!;
    assert.deepEqual(acts.map((a) => a.type), ['GOAL', 'ASSIST2']);
    assert.equal(acts[0].attribution?.playerId, 'h2');
    assert.equal(acts[0].attribution2?.playerId, 'h3');
    assert.equal(acts[1].attribution?.playerId, 'h4');
    const s = run(acts, undefined, live);
    assert.equal(s.events[0].thirdId, 'h4');
    const pp = run([pen('away', 250, 1, 'minor', 'a2')], undefined, live);
    assert.equal(iceHockeyVoice('goal Rao', ctx(pp))![0].payload?.strength, 'pp');
  });
  test('penalty two minutes tripping; shot; save; time-out', () => {
    const p = iceHockeyVoice('penalty two minutes tripping Nair', ctx(live))![0];
    assert.deepEqual([p.type, p.side, p.payload?.pen, p.payload?.infraction, p.attribution?.playerId], ['PEN', 'away', 'minor', 'Tripping', 'a2']);
    assert.equal(iceHockeyVoice('double minor Rao', ctx(live))![0].payload?.pen, 'double');
    const sh = iceHockeyVoice('shot Rao', ctx(live))![0];
    assert.deepEqual([sh.type, sh.attribution?.playerId, sh.attribution2?.playerId, sh.attribution2?.side], ['SHOT', 'h2', 'ag', 'away']);
    const sv = iceHockeyVoice('save Wolves', ctx(live))![0];
    assert.deepEqual([sv.type, sv.side, sv.attribution2?.playerId], ['SHOT', 'home', 'ag']);
    assert.equal(iceHockeyVoice('time out home', ctx(live))![0].type, 'TIMEOUT');
  });
  test('end period asks; full time only in the last period', () => {
    assert.equal(iceHockeyVoiceEnds(iceHockeyVoice('end period', ctx(live))!, live)?.action, 'endPeriod');
    assert.equal(iceHockeyVoice('full time', ctx(live)), null);
    const p3 = run([endPeriod(), endPeriod(), { type: 'CLOCK', payload: { run: true, at: T - 1000 } }, ...goal('home', 2500, 3)]);
    assert.equal(iceHockeyVoiceEnds(iceHockeyVoice('full time', ctx(p3))!, p3)?.action, 'fullTime');
  });
});

/* --------------------------------- schema ----------------------------------- */

describe('SD-145 · stat schema, careers, leaders', () => {
  test('valid, registered, every live and derived key declared', () => {
    assert.deepEqual(validateSchema(iceHockeyStats), []);
    assert.equal(STAT_SCHEMAS.ice_hockey, iceHockeyStats);
    const keys = new Set(iceHockeyStats.stats.map((d) => d.key));
    for (const k of [...DERIVED_KEYS, 'goals', 'assists', 'points', 'shotsOnGoal', 'ppGoals', 'shGoals', 'enGoals', 'saves', 'penaltyMinutes', 'minors', 'majors', 'misconducts', 'gameMisconducts', 'matchPenalties', 'soTaken', 'soGoals']) assert.ok(keys.has(k), k);
  });
  test('career: save % and GAA over goalie lines, points per game', () => {
    const L = (stats: Record<string, number>): StatLine => ({ id: String(Math.random()), playerId: 'p', sport: 'ice_hockey', matchId: String(Math.random()), stats } as unknown as StatLine);
    const c = careerFromSchema(iceHockeyStats, [L({ saves: 27, shotsAgainst: 30, goalsAgainst: 3, gkMinutes: 60, gkGames: 1 }), L({ saves: 18, shotsAgainst: 20, goalsAgainst: 2, gkMinutes: 60, gkGames: 1 })]);
    const v = (k: string) => c.goalkeeping.find((r) => r.key === k)?.value;
    assert.equal(v('savePct'), '90.0%');
    assert.equal(v('gaa'), '2.50');
  });
});
