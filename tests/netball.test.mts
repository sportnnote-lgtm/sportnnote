/**
 * SD-146 — netball (World Netball) born on the Wave 1 foundations:
 *  - goals / attempts by GS and GA, feeds and goal assists, intercepts,
 *    deflections, rebounds (linked to the miss), turnovers, penalties;
 *  - the stoppable clock (4 × 15 counting down; presets), held time, league
 *    time-outs;
 *  - the centre pass: alternation through goals and quarters, the owed centre
 *    after a goal at the buzzer, the scorer's swap;
 *  - positions: line-up, subs, position changes, quarters per position;
 *  - sanctions: warning, suspension (team short on playing time, back by
 *    herself), ordering off (not replaced);
 *  - extra time 2 × 7, then play on to a 2-goal lead (or golden goal);
 *  - statTotals (SD-19 harness), box, standings (World Netball 2-1-0 with goal
 *    %), leaders / career / awards, records, discipline, walkover, the stage
 *    decider, voice, scorer-flow guards.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  init, reducer, isComplete, result, matchSec, clockFace, periodName, eventCredits, creditAttribution, centreInfo, lineupAt, timeoutCheck,
  teamFigures, totalPeriods,
  type NetballState, type Side, type NetballEvent, type Pos,
} from '../src/sports/netball/engine.ts';
import { netballTotals, netballLiveField, netballField, DERIVED_KEYS } from '../src/sports/netball/totals.ts';
import { netballBox } from '../src/sports/netball/box.ts';
import { netballStats } from '../src/sports/netball/stats.ts';
import { netballTimeline } from '../src/sports/netball/timeline.ts';
import { netballTickerDetail, netballTickerFlash } from '../src/sports/netball/ticker.ts';
import { netballMatchRecords } from '../src/sports/netball/records.ts';
import { netballVoice, netballVoiceEnds } from '../src/sports/netball/voice.ts';
import { NETBALL_DISCIPLINE } from '../src/sports/netball/discipline.ts';
import { buildBoxTable, comparisonRows } from '../src/sports/boxScore.ts';
import { careerFromSchema, validateSchema } from '../src/sports/statSchema.ts';
import { matchBoxSource } from '../src/sports/boxSources.ts';
import { STAT_SCHEMAS } from '../src/sports/statSchemas.ts';
import { MATCH_RECORD_HOOKS } from '../src/sports/matchRecordHooks.ts';
import { matchRecordTypes } from '../src/sports/matchRecords.ts';
import { FLOW_CONTROLS } from '../src/core/matchSafety.ts';
import { DISCIPLINE_SPECS, readSportRule } from '../src/sports/discipline.ts';
import { walkoverRuleFor } from '../src/data/walkover.ts';
import { matchFormatFor, KO_DECIDER } from '../src/data/matchFormat.ts';
import { gameFlowFor } from '../src/sports/gameFlow.ts';
import {
  teamStandings, standingsConfigFromFormat, standingsPresets, matchPoints, NEW_TOURNAMENT_POINTS, setStandingsUnitsProvider,
  setStandingsPointsProvider, setStandingsScoreProvider, categoryLeaders, tieBreakerLabel,
} from '../src/data/standings.ts';
import { assertContract, assertSameAsClean, amendRecord, toRecords, type TotalsSport } from './statTotalsHarness.mts';
import type { ScoreAction } from '../src/sports/types.ts';
import { replayLog } from '../src/sports/amend.ts';
import type { Match, Player, SportId, StatLine } from '../src/core/types.ts';

/* ---------------------------------- helpers --------------------------------- */

const POS: Pos[] = ['GS', 'GA', 'WA', 'C', 'WD', 'GD', 'GK'];
const HOME = ['hgs', 'hga', 'hwa', 'hc', 'hwd', 'hgd', 'hgk'];
const AWAY = ['ags', 'aga', 'awa', 'ac', 'awd', 'agd', 'agk'];
const nm = (id: string) => id.toUpperCase();
let u = 0;
function A(type: string, side: Side | undefined, sec: number, period: number, ev: Partial<NetballEvent> = {}, payload: Record<string, unknown> = {}): ScoreAction {
  const cr = eventCredits({ type: ev.type ?? 'timeout', ...ev } as NetballEvent);
  const a: ScoreAction = { type, ...(side ? { side } : {}), payload: { ...payload, uid: `u${++u}`, sec, period } };
  const a1 = creditAttribution(cr.first);
  const a2 = creditAttribution(cr.second);
  if (a1) a.attribution = a1;
  if (a2) a.attribution2 = a2;
  return a;
}
const xi = (team: Side) => ({ type: 'XI', payload: { team, pos: Object.fromEntries(POS.map((p, i) => [p, { id: (team === 'home' ? HOME : AWAY)[i], name: nm((team === 'home' ? HOME : AWAY)[i]) }])) } });
const shooterOf = (side: Side, pos: 'GS' | 'GA') => (side === 'home' ? HOME : AWAY)[pos === 'GS' ? 0 : 1];
const goal = (side: Side, sec: number, period: number, pos: 'GS' | 'GA' = 'GS', feeder?: string) => {
  const sh = shooterOf(side, pos);
  return A('GOAL', side, sec, period, { type: 'goal', playerId: sh, playerName: nm(sh), secondId: feeder, secondName: feeder && nm(feeder) }, { pos });
};
const miss = (side: Side, sec: number, period: number, pos: 'GS' | 'GA' = 'GS', rebound?: { side: Side; id: string }): ScoreAction[] => {
  const sh = shooterOf(side, pos);
  const a = A('MISS', side, sec, period, { type: 'miss', playerId: sh, playerName: nm(sh) }, { pos });
  return rebound ? [a, A('STAT', rebound.side, sec, period, { type: 'stat', stat: 'rebound', playerId: rebound.id, playerName: nm(rebound.id) }, { kind: 'rebound', ref: a.payload!.uid })] : [a];
};
const stat = (side: Side, sec: number, period: number, kind: 'intercept' | 'deflection' | 'turnover', who: string) =>
  A('STAT', side, sec, period, { type: 'stat', stat: kind, playerId: who, playerName: nm(who) }, { kind });
const penalty = (side: Side, sec: number, period: number, kind: 'contact' | 'obstruction', who: string) =>
  A('PENALTY', side, sec, period, { type: 'penalty', penalty: kind, playerId: who, playerName: nm(who) }, { penalty: kind });
const sanction = (side: Side, sec: number, period: number, kind: 'warning' | 'suspension' | 'off', who: string) =>
  A('SANCTION', side, sec, period, { type: 'sanction', sanction: kind, playerId: who, playerName: nm(who) }, { sanction: kind, ...(kind === 'suspension' ? { minutes: 2 } : {}) });
const sub = (side: Side, sec: number, period: number, off: string | null, on: string, pos?: Pos) =>
  A('SUB', side, sec, period, {}, { ...(off ? { offId: off, offName: nm(off) } : {}), onId: on, onName: nm(on), ...(pos ? { pos } : {}) });
const move = (side: Side, sec: number, period: number, who: string, pos: Pos) => A('POS', side, sec, period, {}, { id: who, name: nm(who), pos });
const endPeriod = (): ScoreAction => ({ type: 'END_PERIOD', payload: { at: 0 } });
const run = (actions: ScoreAction[], config?: Record<string, unknown>, from?: NetballState): NetballState => actions.reduce(reducer, from ?? init(config));
const fullPeriod = (len = 900): ScoreAction[] => [{ type: 'SET_CLOCK', payload: { periodSec: len } }, endPeriod()];
const toss = (side: Side): ScoreAction => ({ type: 'FIRST_CENTRE', side });

/* ---------------------------------- format ---------------------------------- */

describe('SD-146 · format and clock (4 × 15 counting down; presets)', () => {
  const T = 1_700_000_000_000;
  test('international 4 × 15 by default; school 4 × 10, halves 2 × 20', () => {
    const s = init();
    assert.deepEqual([s.periods, s.periodMinutes, s.decider, s.etMinutes, s.suspensionMinutes, s.timeoutsPerHalf], [4, 15, 'none', 7, 2, 0]);
    assert.equal(init({ periods: 4, periodMinutes: 10 }).periodMinutes, 10);
    const h = init({ periods: 2, periodMinutes: 20 });
    assert.deepEqual([h.periods, periodName(h, 1), periodName(h, 2)], [2, 'H1', 'H2']);
  });
  test('the face counts down the quarter; stamps run on match time', () => {
    let s = reducer(init(), { type: 'CLOCK', payload: { run: true, at: T } });
    assert.equal(clockFace(s, T + 75_000), '13:45');
    s = run(fullPeriod(), undefined, init());
    assert.equal(s.period, 2); assert.equal(periodName(s, 2), 'Q2'); assert.equal(matchSec(s), 900);
    s = reducer(s, { type: 'CLOCK', payload: { run: true, at: T } });
    assert.equal(clockFace(s, T + 60_000), '14:00'); assert.equal(matchSec(s, T + 60_000), 960);
  });
  test('held time stops the clock (injury / blood / tactical); a warning does not, a suspension does', () => {
    let s = reducer(init(), { type: 'CLOCK', payload: { run: true, at: T } });
    s = reducer(s, { type: 'STOP', payload: { reason: 'injury', at: T + 30_000 } });
    assert.equal(s.clock.since, undefined); assert.equal(matchSec(s, T + 999_000), 30);
    assert.equal(s.events.at(-1)?.reason, 'injury');
    s = reducer(s, { type: 'CLOCK', payload: { run: true, at: T + 60_000 } });
    s = reducer(s, { type: 'SANCTION', side: 'away', payload: { sanction: 'warning', at: T + 70_000 } });
    assert.ok(s.clock.since);
    s = reducer(s, { type: 'SANCTION', side: 'away', payload: { sanction: 'suspension', at: T + 80_000 } });
    assert.equal(s.clock.since, undefined);
  });
  test('team time-outs: none by default (international); a league\'s 2 a half; none in extra time', () => {
    assert.equal(timeoutCheck(init(), 'home').ok, false);
    let s = run([A('TIMEOUT', 'home', 100, 1), A('TIMEOUT', 'home', 1000, 2)], { timeoutsPerHalf: 2 });
    assert.equal(timeoutCheck(s, 'home').ok, false);
    assert.equal(timeoutCheck(s, 'away').left, 2);
    s = run([...fullPeriod(), ...fullPeriod()], undefined, { ...s, period: 1 });
    assert.equal(s.period, 3); assert.equal(timeoutCheck(s, 'home').left, 2, 'a new half');
  });
});

/* ------------------------------- centre pass -------------------------------- */

describe('SD-146 · centre pass alternates (World Netball)', () => {
  test('the toss picks the first; each goal hands the next centre to the other team, whoever scored', () => {
    let s = run([toss('away')]);
    assert.equal(centreInfo(s).now, 'away');
    s = run([goal('away', 30, 1)], undefined, s); // away scores off their centre
    assert.equal(centreInfo(s).now, 'home');
    s = run([goal('away', 60, 1)], undefined, s); // away score again — a gain goal
    assert.equal(centreInfo(s).now, 'away', 'alternates regardless of who scored');
    const c = centreInfo(s);
    assert.deepEqual([c.cpGoals.away, c.gainGoals.away], [1, 1]);
  });
  test('a quarter starts with the centre that is due', () => {
    // Q1: home centre, home score (centre → away taken), quarter ends in play
    const s = run([toss('home'), goal('home', 100, 1), { type: 'SET_CLOCK', payload: { periodSec: 900 } }, endPeriod()]);
    assert.equal(centreInfo(s).now, 'home', 'away took the centre after the goal; Q2 → home');
  });
  test('a goal at the buzzer leaves its centre owed to the next quarter', () => {
    const s = run([toss('home'), goal('home', 899, 1), { type: 'SET_CLOCK', payload: { periodSec: 900 } }, endPeriod()]);
    assert.equal(centreInfo(s).now, 'away');
  });
  test('the scorer\'s swap overrides the order from then on', () => {
    let s = run([toss('home'), goal('home', 100, 1), A('CENTRE', 'home', 101, 1)]);
    assert.equal(centreInfo(s).now, 'home');
    s = run([goal('away', 130, 1)], undefined, s);
    assert.equal(centreInfo(s).now, 'away');
  });
  test('the first centre can\'t be changed by FIRST_CENTRE once goals exist', () => {
    const s = run([toss('home'), goal('home', 100, 1), toss('away')]);
    assert.equal(s.firstCentre, 'home');
  });
});

/* -------------------------------- positions --------------------------------- */

describe('SD-146 · positions: line-up, subs, position changes, quarters per position', () => {
  const base = run([xi('home'), xi('away'), toss('home')]);
  test('a sub takes the position; a position change swaps', () => {
    const s = run([sub('home', 300, 1, 'hgs', 'h8'), move('home', 400, 1, 'hga', 'GS')], undefined, base);
    const l = lineupAt(s, 'home');
    assert.equal(l.GS?.id, 'hga'); assert.equal(l.GA?.id, 'h8');
  });
  test('a sub into an empty position names it', () => {
    const s = run([sanction('home', 100, 1, 'off', 'hwa'), sub('home', 900, 2, null, 'h9', 'WA')], undefined, base);
    assert.equal(lineupAt(s, 'home').WA?.id, 'h9');
  });
  test('quarters per position: break changes count for the next quarter', () => {
    const s = run([...fullPeriod(), move('home', 900, 2, 'hgs', 'GA'), ...fullPeriod(), ...fullPeriod(), ...fullPeriod()], undefined, base);
    const t = netballTotals(s);
    assert.equal(t.hgs.stats.quarters, 4);
    assert.deepEqual([t.hgs.stats.qGS, t.hgs.stats.qGA], [1, 3]);
    assert.deepEqual([t.hga.stats.qGA, t.hga.stats.qGS], [1, 3]);
    assert.equal(t.hc.stats.qC, 4);
  });
});

/* -------------------------------- sanctions --------------------------------- */

describe('SD-146 · sanctions: warning, suspension (team short on playing time), ordering off', () => {
  const base = run([xi('home'), xi('away')]);
  test('suspension: six on court for 2 minutes of playing time, back by herself', () => {
    const s = run([sanction('home', 600, 1, 'suspension', 'hgd')], undefined, base);
    assert.equal(netballField(s, 11).onField.home.length, 6);
    assert.equal(netballField(s, 12).onField.home.length, 7);
    assert.equal(lineupAt(s, 'home').GD?.id, 'hgd', 'she keeps her position');
    assert.equal(netballTotals({ ...s, clock: { ms: 900_000 } }).hgd.stats.suspensionMinutes, 2);
  });
  test('ordered off: out for good, never replaced; the position is empty', () => {
    const s = run([sanction('away', 300, 1, 'off', 'agk')], undefined, base);
    assert.equal(netballField(s, 50).onField.away.length, 6);
    assert.equal(lineupAt(s, 'away').GK, undefined);
    const t = netballTotals(s);
    assert.equal(t.agk.stats.orderedOff, 1);
  });
  test('live banner counts suspensions without a line-up', () => {
    const T = 1_700_000_000_000;
    let s = reducer(init(), { type: 'CLOCK', payload: { run: true, at: T } });
    s = reducer(s, { ...sanction('away', 0, 1, 'suspension', 'awd'), payload: { sanction: 'suspension', minutes: 2, uid: 'z', at: T + 30_000 } });
    s = reducer(s, { type: 'CLOCK', payload: { run: true, at: T + 30_000 } });
    const live = netballLiveField(s, T + 60_000);
    assert.deepEqual(live.onField, { home: 7, away: 6 });
    assert.equal(live.suspended[0].left, '1:30');
  });
});

/* --------------------------- extra time + play on ---------------------------- */

describe('SD-146 · extra time 2 × 7, then play on to a 2-goal lead', () => {
  const level = (): ScoreAction[] => [goal('home', 60, 1), goal('away', 120, 1), ...fullPeriod(), ...fullPeriod(), ...fullPeriod(), ...fullPeriod()];
  test('league: a level match is a draw', () => {
    const s = run(level());
    assert.ok(s.ended); assert.deepEqual(result(s), { winner: 'draw', home: 1, away: 1 });
  });
  test('knockout: extra time, then play on; the 2-goal lead ends it', () => {
    let s = run(level(), { decider: 'et' });
    assert.equal(s.ended, false); assert.equal(s.period, 5); assert.equal(periodName(s, 5), 'ET1');
    s = run([...fullPeriod(420), goal('home', 3900, 6), goal('away', 3950, 6), ...fullPeriod(420)], undefined, s);
    assert.equal(s.playOn, true); assert.equal(totalPeriods(s), 7); assert.equal(periodName(s, 7), 'PO');
    s = run([goal('home', 4100, 7)], undefined, s);
    assert.equal(s.ended, false, 'one ahead is not enough');
    s = run([goal('home', 4150, 7)], undefined, s);
    assert.ok(s.ended); assert.deepEqual(result(s), { winner: 'home', home: 4, away: 2 });
  });
  test('a lead at the end of extra time wins; golden goal option', () => {
    const a = run([...level(), ...fullPeriod(420), goal('away', 3900, 6), ...fullPeriod(420)], { decider: 'et' });
    assert.ok(a.ended); assert.equal(result(a)?.winner, 'away');
    let g = run([...level(), ...fullPeriod(420), ...fullPeriod(420)], { decider: 'et', etThen: 'golden' });
    assert.ok(g.playOn);
    g = run([goal('away', 4000, 7)], undefined, g);
    assert.ok(g.ended && isComplete(g));
  });
  test('stage-aware: a knockout gets extra time, a group match keeps the draw', () => {
    assert.equal(KO_DECIDER.netball, 'et');
    assert.equal(matchFormatFor({ formats: { netball: {} } } as never, 'netball', true).decider, 'et');
    assert.equal(matchFormatFor({ formats: { netball: { decider: 'et' } } } as never, 'netball', false).decider, 'none');
  });
});

/* -------------------------------- statTotals -------------------------------- */

const MATCH: ScoreAction[] = [
  xi('home'), xi('away'), toss('home'),
  goal('home', 30, 1, 'GS', 'hwa'),
  ...miss('away', 60, 1, 'GA', { side: 'home', id: 'hgk' }),
  goal('away', 90, 1, 'GS', 'ac'),
  stat('home', 120, 1, 'intercept', 'hgd'),
  stat('away', 130, 1, 'deflection', 'agk'),
  penalty('home', 140, 1, 'contact', 'hgk'),
  penalty('away', 150, 1, 'obstruction', 'awd'),
  stat('home', 160, 1, 'turnover', 'hc'),
  sanction('home', 200, 1, 'warning', 'hgd'),
  ...fullPeriod(),
  sub('home', 900, 2, 'hwa', 'h8'),
  goal('home', 1000, 2, 'GA', 'h8'),
  sanction('away', 1100, 2, 'suspension', 'agd'),
  goal('home', 1200, 2, 'GS'),
  ...miss('home', 1300, 2, 'GS', { side: 'home', id: 'hgs' }),
  goal('home', 1301, 2, 'GS'),
  ...fullPeriod(), ...fullPeriod(), ...fullPeriod(),
];
const SPORT: TotalsSport<NetballState> = { name: 'netball', init, reducer, statTotals: netballTotals, partial: false, derived: DERIVED_KEYS };

describe('SD-146 · statTotals contract (SD-19 harness)', () => {
  test('clean log + every undo prefix: owned keys = live sums; derived ≥ 0', () => {
    const t = assertContract(SPORT, toRecords(MATCH), { every: 1 });
    assert.deepEqual([t.hgs.stats.goals, t.hgs.stats.attempts, t.hgs.stats.rebounds], [3, 4, 1]);
    assert.deepEqual([t.hwa.stats.goalAssists, t.hwa.stats.feeds], [1, 1]);
    assert.equal(t.h8.stats.goalAssists, 1); assert.equal(t.hga.stats.goals, 1);
    assert.equal(t.hgk.stats.rebounds, 1); assert.equal(t.hgk.stats.contacts, 1); assert.equal(t.hgk.stats.penaltiesConceded, 1);
    assert.equal(t.hgd.stats.intercepts, 1); assert.equal(t.agk.stats.deflections, 1); assert.equal(t.hc.stats.turnovers, 1);
    assert.equal(t.agd.stats.suspensions, 1); assert.equal(t.agd.stats.suspensionMinutes, 2);
    assert.equal(t.aga.stats.attempts, 1); assert.equal(t.aga.stats.goals, 0);
  });
  test('minutes and quarters from the line-up', () => {
    const t = netballTotals(run(MATCH));
    assert.equal(t.hc.stats.minutes, 60); assert.equal(t.hwa.stats.minutes, 15); assert.equal(t.h8.stats.minutes, 45);
    assert.equal(t.agd.stats.minutes, 58);
    assert.deepEqual([t.h8.stats.quarters, t.h8.stats.qWA], [3, 3]);
  });
  test('a live correction (REMOVE_EVENT with reversed credits) = the match scored cleanly', () => {
    const wrong = goal('home', 1200, 2, 'GA'); // GA credited instead of GS, fixed live
    const at = MATCH.findIndex((a) => a.type === 'GOAL' && a.payload?.sec === 1200);
    const live = [...MATCH.slice(0, at), wrong];
    const ev = run(live).events.at(-1)!;
    const cr = eventCredits(ev);
    const fix: ScoreAction = { type: 'REMOVE_EVENT', payload: { id: ev.id }, attribution: creditAttribution(cr.first, -1), attribution2: creditAttribution(cr.second, -1) };
    const corrected = toRecords([...live, fix, ...MATCH.slice(at)]);
    assertContract(SPORT, corrected, { every: 1000, label: 'live remove' });
    assertSameAsClean(SPORT, corrected, toRecords(MATCH), 'live remove');
  });
  test('#05 AMEND: re-credit a goal to the GA — totals follow', () => {
    const recs = toRecords(MATCH);
    const g = recs.find((r) => r.type === 'GOAL' && r.payload?.sec === 1200)!;
    const action = { type: g.type, side: g.side!, payload: g.payload!, attribution: { ...g.attribution!, playerId: 'hga', playerName: 'HGA' } };
    const am = amendRecord(recs, [{ op: 'replace', seq: g.seq, action }]);
    assertContract(SPORT, [...recs, am], { every: 1000, label: 'AMEND' });
    const t = netballTotals(replayLog({ createInitialState: init, reducer }, undefined, [...recs, am]));
    assert.deepEqual([t.hga.stats.goals, t.hgs.stats.goals], [2, 2]);
  });
});

/* ------------------------------ box & timeline ------------------------------ */

describe('SD-146 · box score, comparison, timeline, ticker, records, game flow', () => {
  const s = run(MATCH);
  test('per-player box: Q G G/A % GA FD INT DEF REB TO PEN; per-quarter scope', () => {
    const src = netballBox(s);
    assert.deepEqual(src.periods.map((p) => p.label), ['Q1', 'Q2', 'Q3', 'Q4']);
    const table = buildBoxTable(netballStats, src.data('all'), { scope: 'all' });
    const cols = table.columns.map((c) => c.abbr);
    assert.deepEqual(cols.slice(0, 11), ['Q', 'G', 'G/A', '%', 'GA', 'FD', 'INT', 'DEF', 'REB', 'TO', 'PEN']);
    const row = (side: Side, name: string) => table[side].rows.find((r) => r.name === name)!.cells;
    assert.equal(row('home', 'HGS')[cols.indexOf('G/A')], '3-4');
    assert.equal(row('home', 'HGS')[cols.indexOf('%')], '75%');
    assert.equal(table.home.totals[cols.indexOf('G')], String(s.home), 'totals = the score');
    const q2 = buildBoxTable(netballStats, src.data(2), { scope: 2 });
    assert.equal(q2.home.totals[q2.columns.findIndex((c) => c.abbr === 'G')], '3');
  });
  test('comparison: shooting %, centre passes, centre-pass and gain goals', () => {
    const cmp = comparisonRows(netballStats, netballBox(s).data('all'), 'all');
    const r = (label: string) => cmp.rows.find((x) => x.label === label);
    assert.equal(r('Shooting %')?.home, '80%');
    assert.ok(Number(r('Centre passes')?.home) > 0);
    const c = centreInfo(s);
    assert.equal(c.cpGoals.home + c.gainGoals.home, s.home);
    assert.equal(c.cpGoals.away + c.gainGoals.away, s.away);
  });
  test('timeline rows: toss, quarter stamps, rebound on the miss row, sanctions', () => {
    const rows = netballTimeline(s, { home: 'Sharks', away: 'Kites' });
    assert.equal(rows[0].label, 'First centre pass — Sharks');
    assert.equal(rows.find((x) => x.kind === 'goal' && x.half === 2)!.stamp, 'Q2 01:40');
    assert.match(rows.find((x) => x.kind === 'miss')!.detail ?? '', /rebound HGK/);
    assert.equal(rows.find((x) => x.label.startsWith('Suspended'))!.tone, 'wicket');
  });
  test('ticker: shooters with goals / attempts; GOAL! flash once', () => {
    const d = netballTickerDetail(s, { home: 'Sharks', away: 'Kites' });
    assert.equal(d.left?.[0], '🥅 HGS 3/4 · HGA 1/1');
    const i = MATCH.findIndex((a) => a.type === 'GOAL' && a.payload?.sec === 1000);
    const f = netballTickerFlash(run(MATCH.slice(0, i)), run(MATCH.slice(0, i + 1)));
    assert.deepEqual(f, { kind: 'goal', text: 'GOAL! HGA (GA)', sub: '2–1', side: 'home' });
  });
  test('records: team high, biggest win, top shooters, perfect shooting (10+)', () => {
    const r = netballMatchRecords(s)!;
    assert.ok(r.items.some((x) => x.type === 'biggestWin' && x.text === '4–1'));
    assert.ok(r.items.some((x) => x.type === 'playerGoals' && x.playerId === 'hgs' && x.text === '3/4'));
    const perfect = run([...Array.from({ length: 12 }, (_, i) => goal('home', 10 + i, 1)), ...fullPeriod(), ...fullPeriod(), ...fullPeriod(), ...fullPeriod()]);
    const pr = netballMatchRecords(perfect)!;
    assert.equal(pr.items.find((x) => x.type === 'perfectShooting')?.text, '12/12');
    assert.equal(MATCH_RECORD_HOOKS.netball, netballMatchRecords);
    assert.deepEqual(matchRecordTypes('netball').map((t) => t.key), ['teamHigh', 'biggestWin', 'playerGoals', 'perfectShooting']);
  });
  test('wiring: box source, period-flow controls, game flow', () => {
    assert.ok(matchBoxSource('netball', s)?.data('all').home.rows.length);
    assert.deepEqual(FLOW_CONTROLS.netball, ['endPeriod', 'fullTime']);
    assert.equal(gameFlowFor('netball', s)?.scores, 5);
  });
});

/* --------------------------------- standings -------------------------------- */

let mn = 0;
function M(h: string, a: string, st: NetballState): Match {
  const r = result(st)!;
  return {
    id: `nb${++mn}`, sport: 'netball', status: 'completed', startsAt: '', score: { home: r.home, away: r.away }, winner: r.winner,
    homeTeam: { id: h, name: h }, awayTeam: { id: a, name: a }, state: st,
  } as unknown as Match;
}
const played = (hg: number, ag: number): NetballState => run([
  ...Array.from({ length: hg }, (_, i) => A('GOAL', 'home', 10 + i, 1, { type: 'goal' })),
  ...Array.from({ length: ag }, (_, i) => A('GOAL', 'away', 100 + i, 1, { type: 'goal' })),
  ...fullPeriod(), ...fullPeriod(), ...fullPeriod(), ...fullPeriod(),
]);

describe('SD-146 · standings: World Netball 2-1-0, goal percentage', () => {
  test('new tournaments start on 2-1-0; presets offered', () => {
    assert.equal(NEW_TOURNAMENT_POINTS.netball?.winPoints, 2);
    assert.deepEqual(standingsPresets('netball').map((p) => p.id), ['wn', 'wn-gd', 'simple']);
    assert.equal(tieBreakerLabel('pointRatio', 'netball'), 'goal percentage');
  });
  test('2 a win, 1 a draw; ties on goal percentage (goals for ÷ against)', () => {
    // the units provider is what the registry wires (plugin.standingsUnits = goals)
    setStandingsPointsProvider(null); setStandingsScoreProvider(null);
    setStandingsUnitsProvider((sport, st) => (sport === 'netball' ? { points: { home: (st as NetballState).home, away: (st as NetballState).away } } : null));
    const cfg = standingsConfigFromFormat('netball' as SportId, standingsPresets('netball')[0].set);
    assert.deepEqual(matchPoints(M('A', 'B', played(40, 38)), cfg), { home: 2, away: 0 });
    assert.deepEqual(matchPoints(M('A', 'B', played(30, 30)), cfg), { home: 1, away: 1 });
    // A and B both 2 points, same goal difference (+5): A 15-10 (150%), B 50-45 (111%)
    const ms = [M('A', 'C', played(15, 10)), M('B', 'D', played(50, 45))];
    const t = teamStandings(ms, 'netball' as SportId, cfg);
    assert.deepEqual(t.slice(0, 2).map((r) => r.teamId), ['A', 'B']);
    const gd = teamStandings([M('B', 'D', played(50, 45)), M('A', 'C', played(15, 10))], 'netball' as SportId, standingsConfigFromFormat('netball' as SportId, standingsPresets('netball')[1].set));
    assert.deepEqual(gd.slice(0, 2).map((r) => r.teamId), ['B', 'A'], 'goal difference preset: goals scored next');
    setStandingsUnitsProvider(null);
  });
});

/* ---------------------- discipline, walkover, schema ------------------------ */

describe('SD-146 · discipline, walkover, schema, leaders, career', () => {
  test('discipline: warning / suspension / ordered off; ordering off = 1 match by default', () => {
    assert.equal(DISCIPLINE_SPECS.netball, NETBALL_DISCIPLINE);
    assert.deepEqual(readSportRule(NETBALL_DISCIPLINE, {}).bans, { banOff: 1 });
    const marks = NETBALL_DISCIPLINE.marks({ state: run(MATCH.concat()) } as never);
    assert.deepEqual(marks.map((m) => m.col).sort(), ['suspension', 'warning']);
  });
  test('walkover 20-0 (verify), organiser can change it', () => {
    assert.deepEqual([walkoverRuleFor('netball')?.win, walkoverRuleFor('netball')?.verify], [20, true]);
    assert.equal(walkoverRuleFor('netball', { walkoverScore: '10-0' })?.win, 10);
  });
  test('the schema is valid and registered', () => {
    assert.deepEqual(validateSchema(netballStats), []);
    assert.equal(STAT_SCHEMAS.netball, netballStats);
  });
  const lines: StatLine[] = [];
  const add = (matchId: string, st: NetballState) => {
    for (const [pid, t] of Object.entries(netballTotals(st))) lines.push({ id: `${matchId}-${pid}`, matchId, playerId: pid, sport: 'netball', stats: t.stats, won: false } as StatLine);
  };
  add('m1', run(MATCH));
  add('m2', run([xi('home'), xi('away'), goal('home', 10, 1), goal('home', 20, 1), ...miss('home', 30, 1), stat('home', 40, 1, 'intercept', 'hgd'), ...fullPeriod(), ...fullPeriod(), ...fullPeriod(), ...fullPeriod()]));
  test('career: shooting %, goals per game, positions played', () => {
    const c = careerFromSchema(netballStats, lines.filter((l) => l.playerId === 'hgs'));
    const v = (sec: string, k: string) => c[sec]?.find((r) => r.key === k)?.value;
    assert.equal(v('shooting', 'goals'), '5'); assert.equal(v('shooting', 'attempts'), '7'); assert.equal(v('shooting', 'shotPct'), '71%');
    assert.equal(v('shooting', 'goalsPerGame'), '2.5');
    assert.equal(v('positions', 'qGS'), '8'); assert.equal(v('positions', 'quarters'), '8');
    const d = careerFromSchema(netballStats, lines.filter((l) => l.playerId === 'hgd'));
    assert.equal(d.defence.find((r) => r.key === 'intercepts')?.value, '2');
  });
  test('leaders: top shooter; intercepts', () => {
    const players: Player[] = [...HOME, 'h8', ...AWAY].map((id) => ({ id, fullName: nm(id), sports: ['netball'] } as Player));
    const cats = categoryLeaders(lines, players, 'netball' as SportId);
    assert.deepEqual(cats.find((x) => x.key === 'goals')!.leaders.slice(0, 1).map((l) => [l.name, l.value]), [['HGS', 5]]);
    assert.deepEqual(cats.find((x) => x.key === 'intercepts')!.leaders.slice(0, 1).map((l) => l.name), ['HGD']);
  });
});

/* ----------------------------------- voice ---------------------------------- */

describe('SD-146 · voice (goal GS / GA, miss, centre, end quarter → confirm)', () => {
  const T = 1_700_000_000_000;
  const roster = (ids: string[]) => ids.map((id) => ({ id, fullName: id === 'hgs' ? 'Asha Rao' : nm(id), sports: ['netball'] } as Player));
  const live = run([xi('home'), xi('away'), toss('home'), { type: 'CLOCK', payload: { run: true, at: T } }]);
  const ctx = (state: NetballState) => ({ state, homeName: 'Sharks', awayName: 'Kites', homeRoster: roster(HOME), awayRoster: roster(AWAY), now: T + 60_000 });
  test('"goal GS home" credits the GS on court; "miss GA away" an attempt', () => {
    const a = netballVoice('goal GS home', ctx(live))!;
    assert.equal(a[0].type, 'GOAL'); assert.equal(a[0].side, 'home'); assert.equal(a[0].payload?.pos, 'GS'); assert.equal(a[0].attribution?.playerId, 'hgs');
    const m = netballVoice('miss GA away', ctx(live))!;
    assert.equal(m[0].type, 'MISS'); assert.equal(m[0].attribution?.playerId, 'aga');
  });
  test('"goal Asha" finds her side and position; a non-shooter can\'t score', () => {
    const a = netballVoice('goal Asha', ctx(live))!;
    assert.deepEqual([a[0].side, a[0].payload?.pos], ['home', 'GS']);
    assert.equal(netballVoice('goal HC', ctx(live)), null);
  });
  test('"centre away" sets the centre; "end quarter" asks first; "full time" only in the last', () => {
    assert.equal(netballVoice('centre away', ctx(live))![0].type, 'CENTRE');
    const e = netballVoice('end quarter', ctx(live))!;
    assert.deepEqual(netballVoiceEnds(e, live), { action: 'endPeriod', period: '1st quarter', score: '0-0' });
    assert.equal(netballVoice('full time', ctx(live)), null);
  });
});

/* ------------------------------- source guards ------------------------------- */

describe('SD-146 · scorer-flow guards (SD-106 / SD-114 / SD-116)', () => {
  const src = readFileSync(new URL('../src/sports/netball/index.tsx', import.meta.url), 'utf8');
  test('Full time asks first and is disabled until the last period has started', () => {
    assert.ok(/confirmMatchAction\('fullTime'/.test(src) && /confirmMatchAction\('endPeriod'/.test(src));
    assert.ok(/label="🏁 Full time" variant="danger" disabled=\{!periodStarted\(s\)\}/.test(src));
    assert.ok(!/onPress=\{\(\) => dispatch\(\{ type: '(END|END_PERIOD)'/.test(src));
  });
  test('edits go through usePendingEdit; ✕ via the shared confirm; backfill bar', () => {
    assert.match(src, /usePendingEdit\(liveState, rawDispatch, reducer\)/);
    assert.match(src, /holdRemoval\(/); assert.match(src, /dropHeldRemoval\(\)/);
    assert.match(src, /confirmRemove\(/); assert.match(src, /<RowAction label="✕"/);
    assert.match(src, /<BackfillBar /);
  });
  test('team figures by position (GS / GA)', () => {
    const f = teamFigures(run(MATCH), 'home');
    assert.deepEqual([f.byPos.GS.goals, f.byPos.GS.attempts, f.byPos.GA.goals], [3, 4, 1]);
  });
});
