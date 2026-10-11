/**
 * SD-143 — rugby union (15s / tens / sevens / age-grade), World Rugby Laws:
 *  - scoring (Law 8): try 5, penalty try 7, conversion 2, penalty goal 3,
 *    drop goal 3; kicker credits made / attempted; conversion %;
 *  - the referee's clock (Law 5): halves counting up, time added past 40:00
 *    ("40:00 +1:12", "40+2'"), playing time across half-time;
 *  - cards (Law 9): yellow = sin-bin on playing time (10', sevens 2'), second
 *    yellow = red, red = off for good, 20-minute red (trial) = side short 20';
 *  - replacements: limit, HIA / blood temporary replacements and returns;
 *  - knockouts: ET 2 × 10 → sudden death → kicking competition; sevens
 *    sudden-death periods; first score in sudden death ends it;
 *  - statTotals (SD-19 harness), box score, standings (bonus points, tries
 *    tie-breaks, sevens 3-2-1, walkover bonus), discipline, walkover, voice,
 *    match records, game flow, timeline, ticker, match safety.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  init, reducer, isComplete, result, clockAt, minuteText, periodName, eventCredits, creditAttribution, matchSec, triesOf, nextPlan,
  decideShootout, nextKicker, subsUsed, openTemps, resolveDecider, rugbyStandingsUnits,
  type RugbyEvent, type RugbyState, type Side, type KickKind,
} from '../src/sports/rugby/engine.ts';
import { rugbyTotals, rugbyLiveField, DERIVED_KEYS } from '../src/sports/rugby/totals.ts';
import { rugbyBox } from '../src/sports/rugby/box.ts';
import { rugbyStats } from '../src/sports/rugby/stats.ts';
import { rugbyTimeline, rugbyUndoLabel } from '../src/sports/rugby/timeline.ts';
import { rugbyTickerDetail, rugbyTickerFlash } from '../src/sports/rugby/ticker.ts';
import { rugbyVoice, rugbyVoiceEnds } from '../src/sports/rugby/voice.ts';
import { RUGBY_DISCIPLINE } from '../src/sports/rugby/discipline.ts';
import { buildBoxTable } from '../src/sports/boxScore.ts';
import { careerFromSchema, validateSchema } from '../src/sports/statSchema.ts';
import { matchBoxSource } from '../src/sports/boxSources.ts';
import { STAT_SCHEMAS } from '../src/sports/statSchemas.ts';
import { FLOW_CONTROLS } from '../src/core/matchSafety.ts';
import { MATCH_RECORD_HOOKS, rugbyMatchRecords } from '../src/sports/matchRecordHooks.ts';
import { MATCH_RECORD_TYPES } from '../src/sports/matchRecords.ts';
import { gameFlowFor } from '../src/sports/gameFlow.ts';
import { DISCIPLINE_SPECS, readSportRule, sportDisciplineTable } from '../src/sports/discipline.ts';
import { walkoverRuleFor, forfeitFor } from '../src/data/walkover.ts';
import { KO_DECIDER, stageAwareFormat } from '../src/data/matchFormat.ts';
import {
  teamStandings, standingsConfigFromFormat, standingsPresets, matchPoints, NEW_TOURNAMENT_POINTS, setStandingsUnitsProvider,
  setStandingsPointsProvider, setStandingsScoreProvider, activePreset, categoryLeaders,
} from '../src/data/standings.ts';
import { tableColumns } from '../src/data/standingsColumns.ts';
import { assertContract, assertSameAsClean, amendRecord, toRecords, type TotalsSport } from './statTotalsHarness.mts';
import type { ScoreAction, VoiceContext } from '../src/sports/types.ts';
import { replayLog } from '../src/sports/amend.ts';
import type { Match, Player, SportId, StatLine } from '../src/core/types.ts';

/* ---------------------------------- helpers --------------------------------- */

const HOME = Array.from({ length: 15 }, (_, i) => `h${i + 1}`);
const AWAY = Array.from({ length: 15 }, (_, i) => `a${i + 1}`);
const nm = (id: string) => id.toUpperCase();
let u = 0;
/** One action as the controls fire it: playing second, period second, period,
 *  a stable uid; credits from `eventCredits`. */
function A(type: string, side: Side | undefined, sec: number, period: number, psec: number, ev: Partial<RugbyEvent> = {}, payload: Record<string, unknown> = {}): ScoreAction {
  const cr = eventCredits({ type: ev.type ?? 'setpiece', ...ev } as RugbyEvent);
  const a: ScoreAction = { type, ...(side ? { side } : {}), payload: { ...payload, uid: `u${++u}`, sec, psec, period } };
  const a1 = creditAttribution(cr.first);
  const a2 = creditAttribution(cr.second);
  if (a1) a.attribution = a1;
  if (a2) a.attribution2 = a2;
  return a;
}
const H1 = (min: number) => [min * 60, 1, min * 60] as const;
const H2 = (min: number, h1 = 2400) => [h1 + (min - 40) * 60, 2, (min - 40) * 60] as const;
type T = readonly [number, number, number];
const xi = (team: Side) => ({ type: 'XI', payload: { team, players: (team === 'home' ? HOME : AWAY).map((id) => ({ id, name: nm(id) })) } });
const tryA = (side: Side, t: T, scorer?: string, assist?: string) =>
  A('TRY', side, t[0], t[1], t[2], { type: 'try', playerId: scorer, playerName: scorer && nm(scorer), secondId: assist, secondName: assist && nm(assist) });
const kickA = (side: Side, t: T, kick: KickKind, made: boolean, kicker?: string) =>
  A('KICK', side, t[0], t[1], t[2], { type: 'kick', kick, made, playerId: kicker, playerName: kicker && nm(kicker) }, { kick, made });
const cardA = (side: Side, t: T, card: 'yellow' | 'red', who: string, extra: Record<string, unknown> = {}) =>
  A('CARD', side, t[0], t[1], t[2], { type: 'card', card, playerId: who, playerName: nm(who), ...(extra.second ? { second: true } : {}) }, { card, ...extra });
const subA = (side: Side, t: T, off: string, on: string, extra: Record<string, unknown> = {}) =>
  A('SUB', side, t[0], t[1], t[2], {}, { offId: off, offName: nm(off), onId: on, onName: nm(on), ...extra });
/** End the period at exactly `len` seconds (the clock run that long). */
const endAt = (len: number): ScoreAction[] => [{ type: 'CLOCK', payload: { run: true, at: 1_000 } }, { type: 'END_PERIOD', payload: { at: 1_000 + len * 1000 } }];
const run = (acts: ScoreAction[], config?: Record<string, unknown>): RugbyState => acts.reduce(reducer, init(config));

/** A 15s match: H1 runs 42:00 (2 minutes added), H2 40:00. */
const MATCH: ScoreAction[] = [
  xi('home'), xi('away'),
  tryA('home', H1(5), 'h11', 'h10'), kickA('home', H1(6), 'conv', true, 'h10'),
  kickA('away', H1(12), 'pen', true, 'a10'),
  cardA('home', H1(30), 'yellow', 'h6'),
  tryA('away', H1(35), 'a14'), kickA('away', H1(35), 'conv', false, 'a10'),
  kickA('away', [41 * 60, 1, 41 * 60], 'drop', true, 'a10'), // in time added
  ...endAt(42 * 60),
  A('PENALTY_TRY', 'home', ...H2(50, 2520)),
  subA('home', H2(55, 2520), 'h1', 'h16'),
  subA('away', H2(60, 2520), 'a12', 'a22', { temp: 'hia' }),
  tryA('home', H2(70, 2520), 'h11'), kickA('home', H2(70, 2520), 'conv', true, 'h10'),
  cardA('away', H2(72, 2520), 'red', 'a7'),
  kickA('home', H2(75, 2520), 'pen', false, 'h10'),
  ...endAt(40 * 60),
];

/* ---------------------------------- engine ---------------------------------- */

describe('SD-143 · scoring (Law 8) and the clock (Law 5)', () => {
  test('try 5, conversion 2, penalty goal 3, drop goal 3, penalty try 7', () => {
    const s = run(MATCH);
    assert.equal(s.home, 5 + 2 + 7 + 5 + 2);
    assert.equal(s.away, 3 + 5 + 3);
    assert.ok(s.ended && isComplete(s));
    assert.deepEqual(result(s), { winner: 'home', home: 21, away: 11 });
    assert.deepEqual(triesOf(s), { home: 3, away: 1 });
  });
  test('time added: the clock runs past 40:00; playing time carries across half-time', () => {
    const s = run(MATCH);
    assert.deepEqual(s.played, [2520, 2400]);
    const drop = s.events.find((e) => e.type === 'kick' && e.kick === 'drop')!;
    assert.equal(clockAt(s, drop.period, drop.psec), '40:00 +1:00');
    assert.equal(minuteText(s, drop.period, drop.psec), "40+1'");
    const pt = s.events.find((e) => e.type === 'pentry')!;
    assert.equal(clockAt(s, 2, pt.psec), '50:00');
    assert.equal(minuteText(s, 2, pt.psec), "50'");
    assert.equal(pt.sec, 2520 + 600);
    assert.equal(periodName(s, 1), 'H1');
  });
  test('sevens: 2 × 7, sin-bin 2 minutes, sudden-death periods by default in a knockout', () => {
    const s = init({ preset: 'sevens', variant: '7s', playersPerSide: 7, periodMinutes: 7, decider: 'standard' });
    assert.equal(s.periodMinutes, 7); assert.equal(s.sinBinMinutes, 2); assert.equal(s.decider, 'sd'); assert.equal(s.sdMinutes, 5);
    assert.equal(resolveDecider('standard', '15s'), 'et');
    assert.equal(KO_DECIDER.rugby, 'standard');
    assert.equal(stageAwareFormat({ decider: 'none' }, 'rugby' as SportId, true).decider, 'standard');
    assert.equal(stageAwareFormat({ decider: 'et' }, 'rugby' as SportId, false).decider, 'none');
  });
});

describe('SD-143 · cards (Law 9) and replacements (Law 3)', () => {
  test('yellow = sin-bin on playing time, back by himself; second yellow = red', () => {
    const s = run(MATCH.slice(0, 6));
    const at30 = run([...MATCH.slice(0, 6)]);
    // live banner at 34:00 of H1: 6 minutes left
    const now = 1_000 + 34 * 60 * 1000;
    const live = run([...MATCH.slice(0, 6), { type: 'CLOCK', payload: { run: true, at: 1_000 } }, { type: 'SET_CLOCK', payload: { periodSec: 0, at: 1_000 } }]);
    const lf = rugbyLiveField(live, now);
    assert.equal(lf.suspended.length, 1); assert.equal(lf.suspended[0].left, '6:00'); assert.equal(lf.short.home, 1);
    assert.equal(s.events.length, at30.events.length);
    const two = run([xi('home'), cardA('home', H1(10), 'yellow', 'h4'), cardA('home', H1(30), 'red', 'h4', { second: true })]);
    assert.deepEqual(eventCredits(two.events[1]).first?.stats, { redCards: 1, yellowCards: 1 });
  });
  test('the sin-bin runs across half-time on playing time', () => {
    // yellow at 38:00 of a 42-minute first half → 4 min served, 6 more into H2
    const s = run([xi('home'), xi('away'), cardA('home', [38 * 60, 1, 38 * 60], 'yellow', 'h3'), ...endAt(42 * 60), { type: 'CLOCK', payload: { run: true, at: 5_000 } }]);
    const lf = rugbyLiveField(s, 5_000 + 5 * 60 * 1000);
    assert.equal(lf.suspended[0]?.left, '1:00');
    const after = rugbyLiveField(s, 5_000 + 7 * 60 * 1000);
    assert.equal(after.suspended.length, 0); assert.equal(after.short.home, 0);
  });
  test('red = off for good; 20-minute red = short 20 minutes, then a replacement may come on', () => {
    const cfg = { red20: true };
    const s = run([xi('home'), xi('away'), cardA('away', H1(10), 'red', 'a3', { red20: true }), { type: 'CLOCK', payload: { run: true, at: 1 } }, { type: 'SET_CLOCK', payload: { periodSec: 25 * 60, at: 1 } }], cfg);
    assert.equal(s.events[0].red20, true);
    const lf = rugbyLiveField(s, 1);
    assert.equal(lf.short.away, 1, 'still one short until a replacement comes on');
    const filled = run([xi('home'), xi('away'), cardA('away', H1(10), 'red', 'a3', { red20: true }), A('SUB', 'away', 31 * 60, 1, 31 * 60, {}, { onId: 'a16', onName: 'A16' })], cfg);
    assert.equal(rugbyLiveField({ ...filled, clock: { ms: 32 * 60 * 1000 } }, 0).short.away, 0);
    const full = run([xi('home'), xi('away'), cardA('away', H1(10), 'red', 'a3'), { type: 'CLOCK', payload: { run: true, at: 1 } }, { type: 'SET_CLOCK', payload: { periodSec: 35 * 60, at: 1 } }]);
    assert.equal(rugbyLiveField(full, 1).short.away, 1, 'a full red: short for the rest of the match');
  });
  test('replacements count; HIA / blood are temporary and the player comes back', () => {
    const s = run(MATCH);
    assert.equal(subsUsed(s, 'home'), 1); assert.equal(subsUsed(s, 'away'), 0);
    assert.equal(openTemps(s, 'away').length, 1);
    const back = run([...MATCH.slice(0, -2), subA('away', H2(71, 2520), 'a22', 'a12', { back: true })]);
    assert.equal(openTemps(back, 'away').length, 0);
    assert.equal(subsUsed(back, 'away'), 0);
  });
});

describe('SD-143 · knockouts: extra time, sudden death, kicking competition', () => {
  const level = (d: string, extra: Record<string, unknown> = {}) => [tryA('home', H1(5), 'h1'), tryA('away', H1(9), 'a1'), ...endAt(2400), ...endAt(2400)];
  test('15s standard: ET 2 × 10, then 10-minute sudden death, then kicks', () => {
    let s = run(level('et'), { decider: 'standard' });
    assert.equal(s.ended, false); assert.deepEqual(s.plan, ['reg', 'reg', 'et', 'et']); assert.equal(periodName(s, 3), 'ET1');
    s = [...endAt(600), ...endAt(600)].reduce(reducer, s);
    assert.deepEqual(s.plan, ['reg', 'reg', 'et', 'et', 'sd']); assert.equal(periodName(s, 5), 'SD');
    s = endAt(600).reduce(reducer, s);
    assert.ok(s.ended); assert.equal(isComplete(s), false, 'level: the kicking competition');
    s = reducer(s, { type: 'START_SHOOTOUT', payload: { first: 'away' } });
    for (const [side, ok] of [['away', true], ['home', true], ['away', true], ['home', false], ['away', true], ['home', true], ['away', true], ['home', false]] as [Side, boolean][]) s = reducer(s, { type: 'SO', side, payload: { scored: ok } });
    assert.equal(s.shootoutWinner, 'away'); assert.equal(result(s)?.winner, 'away');
  });
  test('the first score in sudden death ends the match (no conversion)', () => {
    let s = run(level('et'), { decider: 'et' });
    s = [...endAt(600), ...endAt(600)].reduce(reducer, s);
    s = reducer(s, { type: 'CLOCK', payload: { run: true, at: 1 } });
    s = reducer(s, kickA('home', [6000, 5, 200], 'pen', false, 'h10'));
    assert.equal(s.ended, false, 'a miss is no score');
    s = reducer(s, { ...kickA('home', [6100, 5, 300], 'drop', true, 'h10'), payload: { ...kickA('home', [6100, 5, 300], 'drop', true, 'h10').payload, at: 301_000 } });
    assert.ok(s.ended && isComplete(s)); assert.equal(result(s)?.winner, 'home');
  });
  test('sevens: sudden-death periods repeat until someone scores', () => {
    let s = run(level('sd'), { variant: '7s', decider: 'sd', periodMinutes: 7 });
    assert.deepEqual(nextPlan({ plan: ['reg', 'reg', 'sd'], decider: 'sd' }), ['sd']);
    s = endAt(300).reduce(reducer, s);
    assert.equal(s.plan.length, 4); assert.equal(periodName(s, 4), 'SD2');
    s = reducer(reducer(s, { type: 'CLOCK', payload: { run: true, at: 1 } }), tryA('away', [9999, 4, 30], 'a2'));
    assert.ok(s.ended); assert.equal(result(s)?.winner, 'away');
  });
  test('league: a draw stands', () => {
    const s = run(level('none'));
    assert.ok(isComplete(s)); assert.equal(result(s)?.winner, 'draw');
  });
  test('kicking competition: 5 each, then one each; decided once out of reach', () => {
    const k = (n: number, m: number) => Array.from({ length: n }, (_, i) => ({ scored: i < m }));
    assert.equal(decideShootout(k(3, 3), k(3, 0)), 'home');
    assert.equal(decideShootout(k(5, 4), k(5, 4)), undefined);
    assert.equal(decideShootout(k(6, 5), k(6, 4)), 'home');
    assert.equal(nextKicker({ home: [], away: [], first: 'away' }), 'away');
  });
});

/* -------------------------------- statTotals -------------------------------- */

const SPORT: TotalsSport<RugbyState> = { name: 'rugby', init, reducer, statTotals: rugbyTotals, partial: false, derived: DERIVED_KEYS };

describe('SD-143 · statTotals contract (SD-19 harness)', () => {
  test('clean log + every undo prefix: owned keys = live sums', () => {
    const t = assertContract(SPORT, toRecords(MATCH), { every: 1 });
    assert.equal(t.h11.stats.tries, 2); assert.equal(t.h11.stats.points, 10);
    assert.equal(t.h10.stats.points, 4); assert.equal(t.h10.stats.conversions, 2); assert.equal(t.h10.stats.conversionAttempts, 2);
    assert.equal(t.h10.stats.penGoalAttempts, 1); assert.equal(t.h10.stats.penGoals, 0); assert.equal(t.h10.stats.tryAssists, 1);
    assert.equal(t.a10.stats.points, 6); assert.equal(t.a10.stats.dropGoals, 1);
    assert.equal(t.a7.stats.redCards, 1);
  });
  test('minutes on playing time (time added counts)', () => {
    const t = rugbyTotals(run(MATCH));
    assert.equal(t.h11.stats.minutes, 82);
    assert.equal(t.h1.stats.minutes, Math.round((2520 + 900) / 60));
    assert.equal(t.h16.stats.minutes, Math.round((2400 - 900) / 60));
    assert.equal(t.h6.stats.minutes, 72, 'ten minutes in the sin-bin don\'t count');
  });
  test('a live correction (REMOVE_EVENT, reversed credits) = the match scored cleanly', () => {
    const wrong = tryA('home', H1(5), 'h12', 'h10');
    const live = [...MATCH.slice(0, 2), wrong];
    const ev = run(live).events.at(-1)!;
    const cr = eventCredits(ev);
    const fix: ScoreAction = { type: 'REMOVE_EVENT', side: ev.side, payload: { id: ev.id }, attribution: creditAttribution(cr.first, -1), attribution2: creditAttribution(cr.second, -1) };
    const corrected = toRecords([...live, fix, ...MATCH.slice(2)]);
    assertContract(SPORT, corrected, { every: 1000, label: 'live remove' });
    assertSameAsClean(SPORT, corrected, toRecords(MATCH));
  });
  test('an AMEND (#05) re-credits the kicker and voids a card', () => {
    const recs = toRecords(MATCH);
    const k = recs.find((r) => r.type === 'KICK' && r.attribution?.playerId === 'a10' && (r.payload as { kick?: string }).kick === 'drop')!;
    const red = recs.find((r) => r.type === 'CARD' && r.attribution?.playerId === 'a7')!;
    const action = { type: k.type, side: k.side!, payload: k.payload!, attribution: { ...k.attribution!, playerId: 'a9', playerName: 'A9' } };
    const corrected = [...recs, amendRecord(recs, [{ op: 'replace', seq: k.seq, action }, { op: 'void', seq: red.seq }])];
    assertContract(SPORT, corrected, { every: 1000, label: 'AMEND' });
    const t = rugbyTotals(replayLog({ createInitialState: init, reducer }, undefined, corrected));
    assert.equal(t.a9.stats.dropGoals, 1); assert.equal(t.a10.stats.dropGoals, 0); assert.equal(t.a7.stats.redCards, 0);
  });
  test('optional detail: keyed — owned only when the match tracks it', () => {
    const plain = rugbyTotals(run(MATCH));
    assert.equal('tackles' in plain.h11.stats, false);
    const det = [xi('home'), A('DETAIL', 'home', 60, 1, 60, { type: 'detail', detail: 'tackle', playerId: 'h7', playerName: 'H7' }, { detail: 'tackle' }),
      A('SET_PIECE', 'home', 70, 1, 70, {}, { piece: 'lineout', won: true }), tryA('home', H1(3), 'h11')];
    const t = assertContract({ ...SPORT, config: { trackDetail: true } }, toRecords(det), { every: 1 });
    assert.equal(t.h7.stats.tackles, 1); assert.equal(t.h11.stats.tackles, 0);
  });
});

/* --------------------------- box, timeline, ticker --------------------------- */

describe('SD-143 · box score, timeline, ticker, undo label', () => {
  test('box: T C PG DG PTS YC RC; a penalty try lands on the Team row; totals equal the score', () => {
    const s = run(MATCH);
    const src = matchBoxSource('rugby' as SportId, s)!;
    assert.ok(src);
    const d = rugbyBox(s).data('all');
    const sum = (sd: 'home' | 'away', k: string) => d[sd].rows.reduce((a, r) => a + (r.stats[k] ?? 0), 0) + (d[sd].team?.stats[k] ?? 0);
    assert.equal(sum('home', 'points'), 21); assert.equal(sum('away', 'points'), 11);
    assert.equal(d.home.team?.stats.points, 7); assert.equal(d.home.team?.stats.tries, 1);
    assert.equal(d.home.teamStats?.penaltyTries, 1);
    const table = buildBoxTable(rugbyStats, d, { scope: 'all' });
    const cols = table.columns.map((c) => c.abbr);
    assert.deepEqual(cols, ['MIN', 'T', 'C', 'PG', 'DG', 'PTS', 'TA', 'YC', 'RC'], 'detail columns hidden when not tracked');
    assert.equal(table.home.totals[cols.indexOf('PTS')], '21', 'totals = the score');
    assert.equal(table.home.rows.find((r) => r.name === 'H10')!.cells[cols.indexOf('C')], '2-2');
    const h1 = rugbyBox(s).data(1);
    assert.equal(h1.away.rows.reduce((a, r) => a + (r.stats.points ?? 0), 0), 11);
  });
  test('timeline rows with rugby minutes; ticker scorers + try flash; named Undo', () => {
    const s = run(MATCH);
    const rows = rugbyTimeline(s, { home: 'Lions', away: 'Sharks' });
    assert.equal(rows.filter((r) => r.label === 'Try').length, 3);
    assert.ok(rows.some((r) => r.stamp === "40+1'" && r.label === 'Drop goal good'));
    const sorted = [...rows].sort((a, b) => Number(a.id) - Number(b.id));
    assert.equal(sorted.findIndex((r) => r.label === 'Drop goal good') < sorted.findIndex((r) => r.label === 'Penalty try (7)'), true, 'time added sits in H1');
    const t = rugbyTickerDetail(s, { home: 'Lions', away: 'Sharks' });
    assert.match(t.left![0], /H11 2|H11/);
    const prev = run(MATCH.slice(0, 2));
    const next = run(MATCH.slice(0, 3));
    assert.match(rugbyTickerFlash(prev, next)!.text, /^TRY! .* 5'$/);
    assert.equal(rugbyUndoLabel({ type: 'TRY', prev, next }), 'Try · H11 (5-0)');
    assert.equal(rugbyUndoLabel({ type: 'KICK', prev: next, next: run(MATCH.slice(0, 4)) }), 'Conversion good · H10 (7-0)');
  });
});

/* -------------------------------- standings -------------------------------- */

let mn = 0;
function M(h: string, a: string, st: RugbyState, walkover = false): Match {
  const r = result(st)!;
  return {
    id: `rg${++mn}`, sport: 'rugby', status: 'completed', startsAt: '', score: { home: r.home, away: r.away }, winner: r.winner,
    homeTeam: { id: h, name: h }, awayTeam: { id: a, name: a }, state: st, ...(walkover ? { walkover: true } : {}),
  } as unknown as Match;
}
/** home tries / away tries + penalty goals to make the points. */
const played = (ht: number, at: number, hp = 0, ap = 0): RugbyState => run([
  ...Array.from({ length: ht }, (_, i) => tryA('home', H1(1 + i), 'h1')),
  ...Array.from({ length: at }, (_, i) => tryA('away', H1(20 + i), 'a1')),
  ...Array.from({ length: hp }, (_, i) => kickA('home', H1(30 + i), 'pen', true, 'h10')),
  ...Array.from({ length: ap }, (_, i) => kickA('away', H1(35 + i), 'pen', true, 'a10')),
  ...endAt(2400), ...endAt(2400),
]);

describe('SD-143 · standings: bonus points, tries tie-breaks, sevens 3-2-1', () => {
  setStandingsPointsProvider(null); setStandingsScoreProvider(null);
  setStandingsUnitsProvider((sport, state) => (sport === 'rugby' ? rugbyStandingsUnits(state as RugbyState) : null));
  test('new rugby tournaments start on bonus points; the presets', () => {
    assert.equal(NEW_TOURNAMENT_POINTS.rugby?.winPoints, 4);
    assert.equal(NEW_TOURNAMENT_POINTS.rugby?.tryBonusTries, 4);
    assert.deepEqual(standingsPresets('rugby').map((p) => p.id), ['bonus', 'rwc', 'nobonus', 'sevens', 'simple']);
    const nob = standingsPresets('rugby').find((p) => p.id === 'nobonus')!;
    assert.equal(standingsConfigFromFormat('rugby' as SportId, { ...standingsPresets('rugby')[0].set, ...nob.set }).tryBonus, undefined, 'switching preset clears the bonus');
    assert.equal(activePreset('rugby' as SportId, standingsPresets('rugby')[1].set)?.id, 'rwc');
  });
  const cfg = standingsConfigFromFormat('rugby' as SportId, standingsPresets('rugby')[0].set);
  test('4 a win, 2 a draw, +1 for 4 tries (win or lose), +1 losing by 7 or fewer', () => {
    assert.deepEqual(matchPoints(M('A', 'B', played(4, 0)), cfg), { home: 5, away: 0 });
    assert.deepEqual(matchPoints(M('A', 'B', played(4, 4, 1)), cfg), { home: 5, away: 2 }, 'loser: 4 tries + within 7');
    assert.deepEqual(matchPoints(M('A', 'B', played(2, 1, 0, 2)), cfg), { home: 1, away: 4 }, '10-11: the home side loses by 1');
    assert.deepEqual(matchPoints(M('A', 'B', played(1, 1)), cfg), { home: 2, away: 2 });
    assert.deepEqual(matchPoints(M('A', 'B', played(5, 4)), cfg), { home: 5, away: 2 });
  });
  test('walkover: 28-0 and the winner takes the try bonus', () => {
    const wo = { ...M('A', 'B', played(0, 0)), winner: 'home', walkover: true, result: { forfeit: forfeitFor({ sport: 'rugby', kind: 'walkover', winner: 'home' }) } } as unknown as Match;
    assert.equal(walkoverRuleFor('rugby')?.win, 28);
    assert.deepEqual(matchPoints(wo, cfg), { home: 5, away: 0 });
  });
  test('table: BP and TF columns; ties on points difference, then tries', () => {
    const ms = [M('A', 'C', played(2, 0)), M('B', 'C', played(1, 0, 1)), M('A', 'B', played(0, 0)), M('B', 'A', played(0, 0))];
    const t = teamStandings(ms, 'rugby' as SportId, cfg);
    assert.deepEqual(t.slice(0, 2).map((r) => [r.teamId, r.points, r.diff, r.triesFor]), [['A', 8, 10, 2], ['B', 8, 8, 1]]);
    const cols = tableColumns('rugby', cfg, 'team', t).columns.map((c) => c.label);
    assert.deepEqual(cols, ['P', 'W', 'D', 'L', 'PF', 'PA', '±', 'TF', 'BP', 'Pts']);
    const bp = teamStandings([M('A', 'B', played(4, 3))], 'rugby' as SportId, cfg);
    assert.deepEqual(bp.map((r) => [r.teamId, r.points, r.bonus]), [['A', 5, 1], ['B', 1, 1]]);
  });
  test('sevens 3-2-1 (no-show 0); try difference tie-break', () => {
    const c7 = standingsConfigFromFormat('rugby' as SportId, standingsPresets('rugby').find((p) => p.id === 'sevens')!.set);
    assert.deepEqual(matchPoints(M('A', 'B', played(3, 1)), c7), { home: 3, away: 1 });
    assert.deepEqual(matchPoints(M('A', 'B', played(1, 1)), c7), { home: 2, away: 2 });
    assert.ok(c7.order.includes('triesDiff'));
  });
});

/* ------------------------- discipline, records, voice ------------------------ */

describe('SD-143 · discipline, records, game flow', () => {
  test('cards to the discipline table; red = 1 match by default, 20-minute red none', () => {
    assert.equal(DISCIPLINE_SPECS.rugby, RUGBY_DISCIPLINE);
    assert.deepEqual(readSportRule(RUGBY_DISCIPLINE, {}).bans, { banRed: 1, banRed20: 0 });
    const marks = RUGBY_DISCIPLINE.marks({ state: run([cardA('home', H1(3), 'yellow', 'h2'), cardA('away', H1(4), 'red', 'a3', { red20: true }), cardA('away', H1(5), 'red', 'a4', { second: true })]) } as never);
    assert.deepEqual(marks.map((m) => m.col), ['yellow', 'red20', 'yellow', 'red']);
    assert.equal(typeof sportDisciplineTable, 'function');
  });
  test('match records: biggest win, most points, fastest try, hat-trick, top points scorers', () => {
    assert.equal(MATCH_RECORD_HOOKS.rugby, rugbyMatchRecords);
    const s = run([tryA('home', H1(2), 'h11'), tryA('home', H1(8), 'h11'), tryA('home', H1(20), 'h11'), kickA('home', H1(21), 'conv', true, 'h10'), ...endAt(2400), ...endAt(2400)]);
    const b = rugbyMatchRecords(s)!;
    const types = new Set(MATCH_RECORD_TYPES.rugby!.map((t) => t.key));
    for (const it of b.items) assert.ok(types.has(it.type), it.type);
    assert.equal(b.items.find((i) => i.type === 'tryHatTrick')?.playerId, 'h11');
    assert.equal(b.items.find((i) => i.type === 'fastestTry')?.text, "2'");
    assert.equal(b.items.find((i) => i.type === 'biggestWin')?.text, '17–0');
  });
  test('game flow in points', () => {
    const f = gameFlowFor('rugby', run(MATCH))!;
    assert.equal(f.unit, 'points'); assert.ok(f.leadChanges >= 1);
  });
});

const SUR_H = ['Rao', 'Khan', 'Nair', 'Iyer', 'Das', 'Pillai', 'Sen', 'Bose', 'Gill', 'Shah', 'Mehta', 'Joshi', 'Roy', 'Paul', 'Kapoor'];
const SUR_A = ['Smith', 'Jones', 'Brown', 'Taylor', 'Wilson', 'Evans', 'Thomas', 'Walker', 'White', 'Hughes', 'Green', 'Hall', 'Wood', 'Clarke', 'Lewis'];
const roster = (ids: string[], sur: string[]): Player[] => ids.map((id, i) => ({ id, fullName: `${['Asha', 'Meera', 'Ravi', 'Kiran', 'Dev'][i % 5]} ${sur[i]}`, jerseyNo: i + 1, sports: ['rugby'] } as Player));
const HR = roster(HOME, SUR_H), AR = roster(AWAY, SUR_A);
const ctxOf = (s: RugbyState): VoiceContext => ({ state: s, homeName: 'Lions', awayName: 'Sharks', homeRoster: HR, awayRoster: AR, now: 1_000 + 600_000 });

describe('SD-143 · voice', () => {
  const live = () => reducer(init(), { type: 'CLOCK', payload: { run: true, at: 1_000 } });
  test('try with assist, conversion to the last try\'s side, kicks, cards, penalty try', () => {
    const s = live();
    const t = rugbyVoice('try Rao assist Khan', ctxOf(s))!;
    assert.equal(t[0].type, 'TRY'); assert.equal(t[0].attribution?.playerId, 'h1'); assert.equal(t[0].attribution2?.playerId, 'h2');
    const s2 = reducer(s, t[0]);
    const c = rugbyVoice('conversion good Iyer', ctxOf(s2))!;
    assert.equal(c[0].side, 'home'); assert.equal(c[0].payload?.made, true); assert.equal(c[0].attribution?.playerId, 'h4');
    assert.equal(rugbyVoice('conversion missed', ctxOf(s2))![0].payload?.made, false);
    assert.equal(rugbyVoice('penalty goal Smith', ctxOf(s2))![0].payload?.kick, 'pen');
    assert.equal(rugbyVoice('drop goal missed Khan', ctxOf(s2))![0].payload?.kick, 'drop');
    assert.equal(rugbyVoice('penalty try away', ctxOf(s2))![0].type, 'PENALTY_TRY');
    const y = rugbyVoice('yellow card Nair', ctxOf(s2))!;
    assert.equal(y[0].payload?.card, 'yellow');
    const s3 = reducer(s2, y[0]);
    assert.equal(rugbyVoice('yellow card Nair', ctxOf(s3))![0].payload?.second, true);
  });
  test('ends ask first: end half; full time only when it is', () => {
    const s = live();
    assert.equal(rugbyVoiceEnds(rugbyVoice('end half', ctxOf(s))!, s)?.action, 'endPeriod');
    assert.equal(rugbyVoice('full time', ctxOf(s)), null);
    const h2 = reducer(endAt(2400).reduce(reducer, init()), { type: 'CLOCK', payload: { run: true, at: 1_000 } });
    assert.equal(rugbyVoiceEnds(rugbyVoice('full time', ctxOf(h2))!, h2)?.action, 'fullTime');
  });
});

/* ------------------------------ schema & safety ------------------------------ */

describe('SD-143 · schema, career, leaders, safety', () => {
  test('schema valid and registered; cards carry suspensions', () => {
    assert.deepEqual(validateSchema(rugbyStats), []);
    assert.equal(STAT_SCHEMAS.rugby, rugbyStats);
    assert.equal(rugbyStats.stats.find((x) => x.key === 'yellowCards')?.suspension?.minutes, 10);
  });
  test('career: points per game, conversion %, goal-kicking %; leaders', () => {
    const lines: StatLine[] = [];
    for (const [mid, st] of [['m1', run(MATCH)], ['m2', run([xi('home'), kickA('home', H1(3), 'pen', true, 'h10'), kickA('home', H1(4), 'conv', false, 'h10'), ...endAt(2400), ...endAt(2400)])]] as [string, RugbyState][]) {
      for (const [pid, t] of Object.entries(rugbyTotals(st))) lines.push({ id: `${mid}-${pid}`, matchId: mid, playerId: pid, sport: 'rugby', stats: t.stats, won: false } as StatLine);
    }
    const c = careerFromSchema(rugbyStats, lines.filter((l) => l.playerId === 'h10'));
    const v = (sec: string, k: string) => c[sec]?.find((r) => r.key === k)?.value;
    assert.equal(v('scoring', 'points'), '7');
    assert.equal(v('kicking', 'conversionPct'), '67%');
    assert.equal(v('kicking', 'goalKickPct'), '60%');
    const players: Player[] = [...HOME, ...AWAY, 'h16', 'a22'].map((id) => ({ id, fullName: nm(id), sports: ['rugby'] } as Player));
    const cats = categoryLeaders(lines, players, 'rugby' as SportId);
    assert.deepEqual(cats.find((x) => x.key === 'tries')!.leaders.slice(0, 1).map((l) => [l.name, l.value]), [['H11', 2]]);
  });
  test('match safety: period / full time through the ConfirmSheet; nothing dispatches END from a tap', () => {
    assert.deepEqual(FLOW_CONTROLS.rugby, ['endPeriod', 'fullTime']);
    const src = readFileSync(new URL('../src/sports/rugby/index.tsx', import.meta.url), 'utf8');
    assert.ok(!/onPress=\{\(\) => dispatch\(\{ type: '(END|END_PERIOD)'/.test(src));
    assert.ok(/confirmMatchAction\('fullTime'/.test(src) && /confirmMatchAction\('endPeriod'/.test(src));
    assert.equal(matchSec(run(MATCH)), 2520 + 2400);
  });
});
