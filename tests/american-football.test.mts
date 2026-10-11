/**
 * SD-147 — American football: flag (IFAF 5v5, the first preset) and tackle
 * (NFL / college / high school):
 *  - scoring: TD 6, try 1 (kick / flag 1-pt play) or 2, FG 3, safety 2, a
 *    returned try 2 to the defence;
 *  - the game clock counting down, quarters / halves, timeouts per half, the
 *    NFL two-minute warning;
 *  - play by play: possession, down & distance, ball spot (flag: 3 downs to
 *    midfield then 3 to score, failed series → own 5; tackle: 4 downs for 10),
 *    run / pass / sack / interception / fumble / punt / kickoff / penalty,
 *    a gain to the goal line is a touchdown, behind your own goal a safety;
 *  - overtime: flag conversions, Kansas, NFL regular season (may tie) / playoff;
 *  - statTotals (SD-19 harness), box score, standings (win %, ties half),
 *    walkover, discipline, records, game flow, voice, schema, safety.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  init, reducer, isComplete, result, credit, buildPlay, eventCredits, creditAttribution, timeoutsLeft, periodName, clockAt, downText, spotText,
  teamFigures, possessionTime, isLast, resolveDecider, foulsFor,
  type AFState, type Side, type TdHow, type TryKind, type Who,
} from '../src/sports/american_football/engine.ts';
import { afTotals, DERIVED_KEYS } from '../src/sports/american_football/totals.ts';
import { afBox } from '../src/sports/american_football/box.ts';
import { americanFootballStats, passerRating } from '../src/sports/american_football/stats.ts';
import { afTimeline, afUndoLabel } from '../src/sports/american_football/timeline.ts';
import { afTickerDetail, afTickerFlash } from '../src/sports/american_football/ticker.ts';
import { afVoice, afVoiceEnds } from '../src/sports/american_football/voice.ts';
import { AF_DISCIPLINE } from '../src/sports/american_football/discipline.ts';
import { afMatchRecords } from '../src/sports/american_football/records.ts';
import { buildBoxTable } from '../src/sports/boxScore.ts';
import { careerFromSchema, validateSchema, aggregateValue, statDefIn } from '../src/sports/statSchema.ts';
import { matchBoxSource } from '../src/sports/boxSources.ts';
import { STAT_SCHEMAS } from '../src/sports/statSchemas.ts';
import { FLOW_CONTROLS } from '../src/core/matchSafety.ts';
import { MATCH_RECORD_HOOKS } from '../src/sports/matchRecordHooks.ts';
import { MATCH_RECORD_TYPES } from '../src/sports/matchRecords.ts';
import { gameFlowFor } from '../src/sports/gameFlow.ts';
import { DISCIPLINE_SPECS, readSportRule } from '../src/sports/discipline.ts';
import { walkoverRuleFor } from '../src/data/walkover.ts';
import { KO_DECIDER, stageAwareFormat } from '../src/data/matchFormat.ts';
import { teamStandings, standingsConfigFromFormat, standingsPresets, NEW_TOURNAMENT_POINTS, categoryLeaders, tableLabels } from '../src/data/standings.ts';
import { tableColumns } from '../src/data/standingsColumns.ts';
import { sportDisplayName } from '../src/core/markets.ts';
import { assertContract, assertSameAsClean, amendRecord, toRecords, type TotalsSport } from './statTotalsHarness.mts';
import type { ScoreAction, VoiceContext } from '../src/sports/types.ts';
import { replayLog } from '../src/sports/amend.ts';
import type { Match, Player, SportId, StatLine } from '../src/core/types.ts';

/* ---------------------------------- helpers --------------------------------- */

const HOME = Array.from({ length: 11 }, (_, i) => `h${i + 1}`);
const AWAY = Array.from({ length: 11 }, (_, i) => `a${i + 1}`);
const nm = (id: string) => id.toUpperCase();
const W = (id?: string): Who | undefined => (id ? { id, name: nm(id) } : undefined);
let u = 0;
/** period, seconds elapsed in it (the clock shows the time LEFT) */
const at = (period: number, psec: number, len = 900) => ({ uid: `u${++u}`, period, psec, sec: (period - 1) * len + psec });
const run = (acts: ScoreAction[], config?: Record<string, unknown>): AFState => acts.reduce(reducer, init(config));
const td = (side: Side, t: Record<string, unknown>, how: TdHow, scorer?: string, passer?: string, yards?: number): ScoreAction =>
  ({ type: 'TD', side, payload: { how, ...(yards != null ? { yards } : {}), ...t }, ...credit({ type: 'td', how, yards, playerId: scorer, playerName: scorer && nm(scorer), ...(passer ? { secondId: passer, secondName: nm(passer) } : {}) }) });
const tryA = (side: Side, t: Record<string, unknown>, kind: TryKind, good: boolean, who?: string): ScoreAction =>
  ({ type: 'TRY', side, payload: { kind, good, ...t }, ...credit({ type: 'try', kind, good, playerId: who, playerName: who && nm(who) }) });
const fg = (side: Side, t: Record<string, unknown>, good: boolean, yards: number, kicker?: string): ScoreAction =>
  ({ type: 'FG', side, payload: { good, yards, ...t }, ...credit({ type: 'fg', good, playerId: kicker, playerName: kicker && nm(kicker) }) });
const safety = (side: Side, t: Record<string, unknown>, who?: string): ScoreAction => ({ type: 'SAFETY', side, payload: { ...t }, ...credit({ type: 'safety', playerId: who, playerName: who && nm(who) }) });
const endP = (): ScoreAction => ({ type: 'END_PERIOD', payload: { at: 0 } });
const xi = (team: Side) => ({ type: 'XI', payload: { team, players: (team === 'home' ? HOME : AWAY).map((id) => ({ id, name: nm(id) })) } });

/** An NFL game, scores only: 21–18. */
const NFL: ScoreAction[] = [
  xi('home'), xi('away'),
  td('home', at(1, 200), 'pass', 'h3', 'h1', 24), tryA('home', at(1, 200), 'kick', true, 'h11'),
  fg('away', at(1, 600), true, 42, 'a11'),
  td('away', at(2, 300), 'run', 'a2', undefined, 3), tryA('away', at(2, 300), 'kick', true, 'a11'),
  { type: 'TIMEOUT', side: 'home', payload: { ...at(2, 800), at: 0 } },
  fg('home', at(2, 890), true, 51, 'h11'), endP(), endP(),
  td('home', at(3, 100), 'int', 'h9', undefined, 35), tryA('home', at(3, 100), 'two', true, 'h3'),
  safety('away', at(3, 500), 'a5'),
  td('away', at(4, 200), 'pass', 'a3', 'a1', 12), tryA('away', at(4, 200), 'two', false),
  fg('home', at(4, 700), true, 33, 'h11'),
  endP(), endP(),
];

/* ---------------------------------- engine ---------------------------------- */

describe('SD-147 · scoring and the clock', () => {
  test('tackle: TD 6, PAT 1, 2-pt 2, FG 3, safety 2; quarters; final', () => {
    const s = run(NFL, { preset: 'nfl', variant: 'tackle', rules: 'nfl' });
    assert.equal(s.home, 7 + 3 + 6 + 2 + 3); assert.equal(s.away, 3 + 7 + 2 + 6);
    assert.equal(periodName(s, 1), 'Q1');
    assert.ok(isComplete(s)); assert.deepEqual(result(s), { winner: 'home', home: 21, away: 18 });
  });
  test('flag (IFAF): 2 × 20 halves, conversions 1 (5 yd) / 2 (12 yd), returned try 2, safety 2', () => {
    const s = run([
      td('home', at(1, 100, 1200), 'pass', 'h2', 'h1'), tryA('home', at(1, 100, 1200), 'one', true, 'h3'),
      td('away', at(1, 500, 1200), 'run', 'a2'), tryA('away', at(1, 500, 1200), 'two', true, 'a2'),
      td('home', at(2, 100, 1200), 'run', 'h4'), { type: 'DEF_TRY', side: 'away', payload: at(2, 100, 1200), ...credit({ type: 'defTry', playerId: 'a5', playerName: 'A5' }) },
      safety('home', at(2, 900, 1200)),
    ]);
    assert.equal(s.variant, 'flag'); assert.equal(s.periodMinutes, 20); assert.equal(s.periods, 2); assert.equal(s.field, 50); assert.equal(s.downs, 3);
    assert.equal(periodName(s, 2), 'H2');
    assert.equal(s.home, 6 + 1 + 6 + 2); assert.equal(s.away, 6 + 2 + 2);
    assert.equal(clockAt(s, 1, 100), '18:20');
  });
  test('timeouts: 3 per half (tackle), reset at half-time; two-minute warning stops the clock at 2:00', () => {
    let s = init({ preset: 'nfl', variant: 'tackle', rules: 'nfl' });
    for (let i = 0; i < 4; i++) s = reducer(s, { type: 'TIMEOUT', side: 'home', payload: { at: 0 } });
    assert.equal(s.events.filter((e) => e.type === 'timeout').length, 3, 'the 4th is refused');
    assert.equal(timeoutsLeft(s, 'home'), 0);
    s = reducer(reducer(s, endP()), endP());
    assert.equal(timeoutsLeft(s, 'home', 3), 3);
    s = reducer(s, { type: 'CLOCK', payload: { run: true, at: 1000 } });
    assert.equal(s.twoMinute, true);
    s = reducer(reducer(s, endP()), { type: 'CLOCK', payload: { run: true, at: 1000 } });
    s = reducer(s, { type: 'TWO_MIN', payload: { at: 1000 + 800_000 } });
    assert.deepEqual(s.warned, [4]); assert.equal(s.clock.since, undefined); assert.equal(clockAt(s, 4, s.clock.ms / 1000), '2:00');
    assert.equal(init({ preset: 'flag' }).twoMinute, false);
  });
});

/* ------------------------------ play by play ------------------------------- */

const P = (s: AFState, side: Side, inp: Parameters<typeof buildPlay>[2], t = at(1, 0, 1200)) => buildPlay(s, side, inp, t);
const step = (s: AFState, side: Side, inp: Parameters<typeof buildPlay>[2]) => reducer(s, P(s, side, inp));

describe('SD-147 · play by play: drive, downs, spot', () => {
  test('flag: own 5, 3 downs to midfield, then 3 to score; a failed series → the other side on its own 5', () => {
    let s = reducer(init({ preset: 'flag', mode: 'pbp' }), { type: 'SET_DRIVE', payload: { off: 'home', spot: 5 } });
    assert.equal(downText(s, s.drive!, true), '1st & 20 at Own 5');
    s = step(s, 'home', { play: 'pass', yards: 12, p1: W('h1'), p2: W('h2') });
    assert.equal(downText(s, s.drive!), '2nd & 8');
    s = step(s, 'home', { play: 'run', yards: 10, p1: W('h3') });
    assert.equal(downText(s, s.drive!, true), '1st & Goal at Opp 23'); assert.equal(s.events.at(-1)!.first, true);
    s = step(s, 'home', { play: 'inc', p1: W('h1') });
    s = step(s, 'home', { play: 'sack', yards: -4, p2: W('a5') });
    assert.equal(spotText(s, s.drive!.spot), 'Own 23');
    s = step(s, 'home', { play: 'inc', p1: W('h1') });
    assert.equal(s.drive!.off, 'away'); assert.equal(s.drive!.spot, 5, 'flag: own 5 after a failed series');
    const spot = reducer(init({ preset: 'flag', mode: 'pbp', flagTurnover: 'spot' }), { type: 'SET_DRIVE', payload: { off: 'home', spot: 40, down: 3 } });
    assert.equal(step(spot, 'home', { play: 'inc' }).drive!.spot, 10, 'organiser option: at the dead-ball spot');
  });
  test('tackle: 10 yards for a first down, 4 downs; turnover on downs at the spot', () => {
    let s = reducer(init({ preset: 'nfl', variant: 'tackle', rules: 'nfl', mode: 'pbp' }), { type: 'PLAY', side: 'home', payload: { play: 'kickoff', newSpot: 35 } });
    assert.equal(downText(s, s.drive!, true), '1st & 10 at Own 35');
    s = step(s, 'home', { play: 'run', yards: 4, p1: W('h2') });
    s = step(s, 'home', { play: 'run', yards: 7, p1: W('h2') });
    assert.equal(downText(s, s.drive!, true), '1st & 10 at Own 46');
    for (let i = 0; i < 4; i++) s = step(s, 'home', { play: 'inc', p1: W('h1') });
    assert.equal(s.drive!.off, 'away'); assert.equal(spotText(s, s.drive!.spot), 'Own 46'.replace('Own 46', 'Opp 46'));
  });
  test('a run to the goal line is a touchdown; tackled in your own end zone is a safety', () => {
    let s = reducer(init({ preset: 'nfl', variant: 'tackle', rules: 'nfl', mode: 'pbp' }), { type: 'SET_DRIVE', payload: { off: 'home', spot: 92 } });
    const a = P(s, 'home', { play: 'run', yards: 15, p1: W('h2') });
    assert.equal(a.type, 'TD'); assert.equal(a.payload?.yards, 8); assert.equal(a.attribution?.extra?.rushYds, 8);
    s = reducer(s, a);
    assert.equal(s.home, 6); assert.equal(s.pendingTry, 'home'); assert.equal(s.drive, null);
    s = reducer(s, tryA('home', at(1, 10), 'kick', true, 'h11'));
    assert.equal(s.kickBy, 'home', 'tackle: the scoring team kicks off');
    s = reducer(s, { type: 'PLAY', side: 'away', payload: { play: 'kickoff', newSpot: 2 } });
    const sf = P(s, 'away', { play: 'sack', yards: -5, p2: W('h7') });
    assert.equal(sf.type, 'SAFETY'); assert.equal(sf.side, 'home');
    s = reducer(s, sf);
    assert.equal(s.home, 9); assert.equal(s.kickBy, 'away', 'free kick by the team scored upon');
  });
  test('penalties: defence + automatic first down; offence half the distance; loss of down', () => {
    const base = reducer(init({ preset: 'nfl', variant: 'tackle', rules: 'nfl', mode: 'pbp' }), { type: 'SET_DRIVE', payload: { off: 'home', spot: 30, down: 3, toGo: 8 } });
    const dpi = foulsFor(base).find((f) => f.key === 'roughPasser')!;
    let s = step(base, 'home', { play: 'penalty', yards: dpi.yards, on: 'away', autoFirst: true, foul: dpi.label });
    assert.equal(downText(s, s.drive!, true), '1st & 10 at Own 45'); assert.equal(s.events.at(-1)!.first, true);
    s = step(base, 'home', { play: 'penalty', yards: 10, on: 'home', foul: 'Holding' });
    assert.equal(downText(s, s.drive!, true), '3rd & 18 at Own 20');
    const deep = reducer(base, { type: 'SET_DRIVE', payload: { off: 'home', spot: 6, down: 2 } });
    assert.equal(step(deep, 'home', { play: 'penalty', yards: 10, on: 'home' }).drive!.spot, 3, 'half the distance to the goal');
    assert.equal(step(base, 'home', { play: 'penalty', yards: 10, on: 'home', lossOfDown: true }).drive!.down, 4);
    const nfhs = foulsFor({ variant: 'tackle', rules: 'nfhs' }).find((f) => f.key === 'holdDef')!;
    assert.deepEqual([nfhs.yards, !!nfhs.autoFirst], [10, false]);
  });
  test('interception / fumble / punt change possession; first downs, yards and time of possession', () => {
    let s = reducer(init({ preset: 'nfl', variant: 'tackle', rules: 'nfl', mode: 'pbp' }), { type: 'SET_DRIVE', payload: { off: 'home', spot: 25 } });
    s = reducer(s, buildPlay(s, 'home', { play: 'pass', yards: 15, p1: W('h1'), p2: W('h3') }, at(1, 30)));
    s = reducer(s, buildPlay(s, 'home', { play: 'run', yards: 3, p1: W('h2') }, at(1, 60)));
    s = reducer(s, buildPlay(s, 'home', { play: 'int', p1: W('h1'), p2: W('a8'), newSpot: 30 }, at(1, 90)));
    assert.equal(s.drive!.off, 'away'); assert.equal(s.drive!.spot, 30);
    s = reducer(s, buildPlay(s, 'away', { play: 'punt', yards: 45, p1: W('a10'), ret: 5 }, at(1, 150)));
    assert.equal(s.drive!.off, 'home'); assert.equal(s.drive!.spot, 100 - 75 + 5);
    s = reducer(s, buildPlay(s, 'home', { play: 'fumble', p1: W('h2'), p2: W('a4'), newSpot: 70 }, at(1, 200)));
    const h = teamFigures(s, 'home');
    assert.deepEqual([h.firstDowns, h.passYds, h.rushYds, h.turnovers, h.totalYards], [1, 15, 3, 2, 18]);
    const top = possessionTime(s, 260);
    assert.deepEqual(top, { home: 30 + 30 + 50, away: 60 + 60 });
    const t = afTotals(s);
    assert.equal(t.a8.side, 'away'); assert.equal(t.a8.stats.defInt, 1); assert.equal(t.h1.stats.passInt, 1); assert.equal(t.a4.stats.fumRec, 1);
  });
});

/* -------------------------------- overtime --------------------------------- */

describe('SD-147 · overtime', () => {
  const level = (cfg: Record<string, unknown>) => {
    const n = Number(cfg.periods ?? 4);
    return run([td('home', at(1, 10), 'run', 'h2'), tryA('home', at(1, 10), 'kick', true), td('away', at(1, 20), 'run', 'a2'), tryA('away', at(1, 20), 'kick', true),
      ...Array.from({ length: n }, endP)], cfg);
  };
  test('Kansas: one possession each from the 10 / 25; level after both → next OT; a lead after both → final', () => {
    let s = level({ preset: 'nfhs', variant: 'tackle', rules: 'nfhs', decider: 'kansas' });
    assert.equal(s.ended, false); assert.equal(periodName(s, 5), 'OT');
    s = reducer(s, { type: 'OT_FIRST', payload: { first: 'away' } });
    s = reducer(s, fg('away', at(5, 0), true, 27, 'a11'));
    assert.equal(s.ended, false, 'the other side still gets its possession');
    s = reducer(s, fg('home', at(5, 0), true, 25, 'h11'));
    assert.equal(s.ended, false); assert.equal(periodName(s, 6), 'OT2'); assert.equal(s.otFirst, 'home', 'OT2: the other team first');
    s = reducer(s, td('home', at(6, 0), 'run', 'h2')); s = reducer(s, tryA('home', at(6, 0), 'kick', true));
    s = reducer(s, { type: 'POSS_END', side: 'away', payload: at(6, 0) });
    assert.ok(s.ended); assert.equal(result(s)?.winner, 'home');
  });
  test('Kansas: the second team taking the lead with a TD wins at once (no try)', () => {
    let s = level({ preset: 'ncaa', variant: 'tackle', rules: 'ncaa', decider: 'kansas' });
    s = reducer(s, { type: 'OT_FIRST', payload: { first: 'home' } });
    s = reducer(s, fg('home', at(5, 0), true, 40));
    s = reducer(s, td('away', at(5, 0), 'pass', 'a3', 'a1'));
    assert.ok(s.ended); assert.equal(s.pendingTry, undefined); assert.equal(result(s)?.winner, 'away');
  });
  test('NFL regular season: both get the ball, then sudden death; may end tied. Playoffs go on.', () => {
    let s = level({ preset: 'nfl', variant: 'tackle', rules: 'nfl', decider: 'nfl' });
    assert.equal(isLast(s), true, 'NFL regular-season OT can end the game tied');
    s = reducer(s, { type: 'OT_FIRST', payload: { first: 'home' } });
    s = reducer(s, fg('home', at(5, 100, 600), true, 30));
    s = reducer(s, fg('away', at(5, 300, 600), true, 44));
    assert.equal(s.ended, false);
    s = reducer(s, endP());
    assert.ok(s.ended); assert.equal(result(s)?.winner, 'draw');
    let p = level({ preset: 'nfl', variant: 'tackle', rules: 'nfl', decider: 'nfl_playoff' });
    p = reducer(reducer(p, { type: 'OT_FIRST', payload: { first: 'home' } }), endP());
    assert.equal(p.ended, false); assert.equal(periodName(p, 6), 'OT2');
    p = reducer(p, { type: 'POSS_END', side: 'home', payload: at(6, 0) });
    p = reducer(p, { type: 'POSS_END', side: 'away', payload: at(6, 0) });
    p = reducer(p, safety('away', at(6, 0)));
    assert.ok(p.ended); assert.equal(result(p)?.winner, 'away', 'a safety in overtime ends it');
  });
  test('flag: one conversion try each per round until one leads', () => {
    let s = level({ preset: 'flag', periods: 2 });
    assert.equal(s.decider, 'flag');
    s = reducer(s, { type: 'OT_FIRST', payload: { first: 'home' } });
    s = reducer(s, tryA('home', at(3, 0), 'two', true, 'h2'));
    s = reducer(s, tryA('away', at(3, 0), 'two', true, 'a2'));
    assert.equal(s.ended, false); assert.equal(periodName(s, 4), 'OT2');
    s = reducer(s, tryA('away', at(4, 0), 'one', false));
    s = reducer(s, tryA('home', at(4, 0), 'one', true, 'h3'));
    assert.ok(s.ended); assert.equal(result(s)?.winner, 'home');
  });
  test('the standard knockout decider per rules; leagues keep the organiser\'s', () => {
    assert.equal(resolveDecider('standard', 'flag', 'ifaf'), 'flag');
    assert.equal(resolveDecider('standard', 'tackle', 'nfl'), 'nfl_playoff');
    assert.equal(resolveDecider('standard', 'tackle', 'nfhs'), 'kansas');
    assert.equal(KO_DECIDER.american_football, 'standard');
    assert.equal(stageAwareFormat({ decider: 'none' }, 'american_football' as SportId, true).decider, 'standard');
    assert.equal(stageAwareFormat({ decider: 'nfl' }, 'american_football' as SportId, true).decider, 'standard');
    assert.equal(stageAwareFormat({ decider: 'nfl' }, 'american_football' as SportId, false).decider, 'nfl');
    assert.equal(stageAwareFormat({ decider: 'none' }, 'american_football' as SportId, false).decider, 'none');
  });
});

/* -------------------------------- statTotals -------------------------------- */

const SPORT: TotalsSport<AFState> = { name: 'american_football', init, reducer, statTotals: afTotals, partial: false, derived: DERIVED_KEYS, config: { preset: 'nfl', variant: 'tackle', rules: 'nfl' } };

/** A play-by-play drive log (actions built against the running state). */
function pbpLog(): ScoreAction[] {
  const cfg = { preset: 'nfl', variant: 'tackle', rules: 'nfl', mode: 'pbp', trackTackles: true };
  const acts: ScoreAction[] = [];
  let s = init(cfg);
  const go = (a: ScoreAction) => { acts.push(a); s = reducer(s, a); };
  go({ type: 'PLAY', side: 'home', payload: { play: 'kickoff', newSpot: 25, ...at(1, 0) } });
  go(buildPlay(s, 'home', { play: 'pass', yards: 20, p1: W('h1'), p2: W('h3') }, at(1, 20)));
  go({ type: 'TACKLE', side: 'away', payload: at(1, 20), ...credit({ type: 'tackle', playerId: 'a6', playerName: 'A6' }) });
  go(buildPlay(s, 'home', { play: 'run', yards: 6, p1: W('h2') }, at(1, 50)));
  go(buildPlay(s, 'home', { play: 'sack', yards: -7, p2: W('a9') }, at(1, 80)));
  go(buildPlay(s, 'home', { play: 'pass', yards: 60, p1: W('h1'), p2: W('h4') }, at(1, 100)));
  go(tryA('home', at(1, 100), 'kick', true, 'h11'));
  go({ type: 'PLAY', side: 'away', payload: { play: 'kickoff', newSpot: 35, ...at(1, 110) } });
  go(buildPlay(s, 'away', { play: 'int', p1: W('a1'), p2: W('h8'), newSpot: 40 }, at(1, 140)));
  go(buildPlay(s, 'home', { play: 'run', yards: -2, p1: W('h2') }, at(1, 170)));
  go(fg('home', at(1, 200), true, 45, 'h11'));
  return acts;
}

describe('SD-147 · statTotals contract (SD-19 harness)', () => {
  test('scores only: clean log + every undo prefix: owned keys = live sums', () => {
    const t = assertContract(SPORT, toRecords(NFL), { every: 1 });
    assert.equal(t.h3.stats.touchdowns, 1); assert.equal(t.h3.stats.recTD, 1); assert.equal(t.h3.stats.twoPt, 1); assert.equal(t.h3.stats.points, 8);
    assert.equal(t.h1.stats.passTD, 1); assert.equal(t.h11.stats.patAtt, 1); assert.equal(t.h11.stats.patMade, 1); assert.equal(t.h11.stats.fgAtt, 2);
    assert.equal(t.h11.stats.fgMade, 2); assert.equal(t.h11.stats.fgLong, 51); assert.equal(t.a5.stats.safeties, 1); assert.equal(t.h9.stats.retTD, 1);
    assert.equal('passAtt' in t.h1.stats, false, 'score-only games carry no play-by-play keys');
  });
  test('play by play: every prefix; the defender credits sit on the defence', () => {
    const t = assertContract({ ...SPORT, config: { preset: 'nfl', variant: 'tackle', rules: 'nfl', mode: 'pbp', trackTackles: true } }, toRecords(pbpLog()), { every: 1 });
    assert.deepEqual([t.h1.stats.passComp, t.h1.stats.passAtt, t.h1.stats.passYds, t.h1.stats.passTD], [2, 2, 20 + 56, 1]);
    assert.deepEqual([t.h4.stats.rec, t.h4.stats.recYds, t.h4.stats.recTD], [1, 56, 1]);
    assert.deepEqual([t.h2.stats.rushAtt, t.h2.stats.rushYds], [2, 4]);
    assert.equal(t.a9.stats.sacks, 1); assert.equal(t.a9.side, 'away'); assert.equal(t.h8.stats.defInt, 1); assert.equal(t.a6.stats.tackles, 1);
    assert.equal(t.a1.stats.passInt, 1);
  });
  test('a live correction (REMOVE_EVENT, reversed credits) = the game scored cleanly', () => {
    const wrong = td('home', at(1, 200), 'pass', 'h4', 'h1', 24);
    const live = [...NFL.slice(0, 2), wrong];
    const ev = run(live, SPORT.config).events.at(-1)!;
    const cr = eventCredits(ev);
    const fix: ScoreAction = { type: 'REMOVE_EVENT', side: ev.side, payload: { id: ev.id }, attribution: creditAttribution(cr.first, -1), attribution2: creditAttribution(cr.second, -1) };
    const corrected = toRecords([...live, fix, ...NFL.slice(2)]);
    assertContract(SPORT, corrected, { every: 1000, label: 'live remove' });
    assertSameAsClean(SPORT, corrected, toRecords(NFL));
  });
  test('an AMEND (#05) re-credits the kicker', () => {
    const recs = toRecords(NFL);
    const k = recs.find((r) => r.type === 'FG' && r.attribution?.playerId === 'a11')!;
    const action = { type: k.type, side: k.side!, payload: k.payload!, attribution: { ...k.attribution!, playerId: 'a10', playerName: 'A10' } };
    const corrected = [...recs, amendRecord(recs, [{ op: 'replace', seq: k.seq, action }])];
    assertContract(SPORT, corrected, { every: 1000, label: 'AMEND' });
    const t = afTotals(replayLog({ createInitialState: init, reducer }, SPORT.config, corrected));
    assert.equal(t.a10.stats.fgMade, 1); assert.equal(t.a11.stats.fgMade, 0);
  });
});

/* --------------------------- box, timeline, ticker --------------------------- */

describe('SD-147 · box score, timeline, ticker, undo label', () => {
  test('score-only box: TD / FG / XP / PTS; totals equal the score; untracked play-by-play columns hidden', () => {
    const s = run(NFL, SPORT.config);
    assert.ok(matchBoxSource('american_football' as SportId, s));
    const d = afBox(s).data('all');
    const table = buildBoxTable(americanFootballStats, d, { scope: 'all' });
    const cols = table.columns.map((c) => c.abbr);
    assert.ok(!cols.includes('C/ATT') && !cols.includes('RYDS'));
    assert.ok(cols.includes('FG') && cols.includes('XP') && cols.includes('PTS'));
    assert.equal(table.home.totals[cols.indexOf('PTS')], String(s.home));
    assert.equal(table.away.totals[cols.indexOf('PTS')], String(s.away), 'the safety lands on its scorer; totals = the score');
  });
  test('play-by-play box: passing / rushing / receiving / defence; team comparison and notes', () => {
    const s = run(pbpLog(), { preset: 'nfl', variant: 'tackle', rules: 'nfl', mode: 'pbp', trackTackles: true });
    const src = afBox(s, { homeName: 'Lions', awayName: 'Bears' });
    const d = src.data('all');
    const table = buildBoxTable(americanFootballStats, d, { scope: 'all' });
    const cols = table.columns.map((c) => c.abbr);
    for (const k of ['C/ATT', 'PYDS', 'CAR', 'RYDS', 'REC', 'RCYDS', 'SCK', 'DINT', 'TKL']) assert.ok(cols.includes(k), k);
    assert.equal(table.home.rows.find((r) => r.name === 'H1')!.cells[cols.indexOf('C/ATT')], '2-2');
    assert.equal(d.home.teamStats?.firstDowns, 1);
    assert.match(src.notes!()[0], /^Time of possession: Lions \d+:\d\d · Bears/);
  });
  test('timeline: scores with the game clock; ticker; TD flash; named Undo', () => {
    const s = run(NFL, SPORT.config);
    const rows = afTimeline(s);
    assert.equal(rows.filter((r) => r.label === 'Touchdown').length, 4);
    assert.ok(rows.some((r) => r.stamp === 'Q1 11:40' && r.label === 'Touchdown' && /24-yd pass from H1/.test(r.detail ?? '')));
    assert.ok(rows.some((r) => r.label === 'Field goal good · 42 yds'));
    const prev = run(NFL.slice(0, 2), SPORT.config);
    const next = run(NFL.slice(0, 3), SPORT.config);
    assert.match(afTickerFlash(prev, next)!.text, /^TOUCHDOWN! /);
    assert.match(afTickerDetail(next, { home: 'Lions', away: 'Bears' }).left![0], /H3/);
    assert.equal(afUndoLabel({ type: 'TD', prev, next }), 'Touchdown · H3 (6-0)');
    assert.equal(afUndoLabel({ type: 'TRY', prev: next, next: run(NFL.slice(0, 4), SPORT.config) }), 'Extra point good · H11 (7-0)');
  });
});

/* -------------------------------- standings -------------------------------- */

let mn = 0;
function M(h: string, a: string, hs: number, as: number): Match {
  return {
    id: `af${++mn}`, sport: 'american_football', status: 'completed', startsAt: '', score: { home: hs, away: as },
    winner: hs > as ? 'home' : as > hs ? 'away' : 'draw', homeTeam: { id: h, name: h }, awayTeam: { id: a, name: a }, state: null,
  } as unknown as Match;
}

describe('SD-147 · standings: win %, ties count half; walkover', () => {
  test('presets: flag pools first; new tournaments rank by win %', () => {
    assert.deepEqual(standingsPresets('american_football').map((p) => p.id), ['flag', 'nfl', 'simple']);
    assert.equal(NEW_TOURNAMENT_POINTS.american_football?.rankBy, 'winPct');
    assert.equal(tableLabels('american_football' as SportId).draw, 'T');
  });
  test('a tie is half a win; the PCT column; ties broken by head-to-head', () => {
    const cfg = standingsConfigFromFormat('american_football' as SportId, standingsPresets('american_football')[1].set);
    const ms = [M('A', 'B', 21, 14), M('B', 'C', 10, 10), M('C', 'A', 28, 7), M('B', 'D', 7, 3), M('A', 'D', 3, 0), M('C', 'D', 0, 6)];
    const t = teamStandings(ms, 'american_football' as SportId, cfg);
    assert.deepEqual(t.map((r) => r.teamId), ['A', 'C', 'B', 'D']);
    const cols = tableColumns('american_football', cfg, 'team', t);
    const labels = cols.columns.map((c) => c.label);
    assert.deepEqual(labels.slice(0, 5), ['P', 'W', 'T', 'L', 'PCT']);
    assert.equal(cols.columns.find((c) => c.key === 'pct')!.value(t.find((r) => r.teamId === 'B')!, t), '.500');
  });
  test('walkover default 1-0 (NFHS / NCAA; NFL 2-0) — organiser option', () => {
    assert.deepEqual([walkoverRuleFor('american_football')?.win, walkoverRuleFor('american_football')?.loss], [1, 0]);
    assert.equal(walkoverRuleFor('american_football', { walkoverScore: '2-0' })?.win, 2);
  });
});

/* ------------------------- discipline, records, voice ------------------------ */

describe('SD-147 · discipline, records, game flow, names', () => {
  test('ejections to the discipline table; 1 match by default', () => {
    assert.equal(DISCIPLINE_SPECS.american_football, AF_DISCIPLINE);
    assert.deepEqual(readSportRule(AF_DISCIPLINE, {}).bans, { banEject: 1 });
    const s = run([{ type: 'EJECT', side: 'away', payload: at(1, 5), ...credit({ type: 'eject', playerId: 'a7', playerName: 'A7' }) }]);
    assert.deepEqual(AF_DISCIPLINE.marks({ state: s } as never).map((m) => [m.col, m.playerId]), [['eject', 'a7']]);
  });
  test('match records: longest TD, most TDs by a player, longest FG, biggest win', () => {
    assert.equal(MATCH_RECORD_HOOKS.american_football, afMatchRecords);
    const s = run([td('home', at(1, 1), 'run', 'h2', undefined, 65), td('home', at(1, 2), 'run', 'h2', undefined, 2), fg('away', at(1, 3), true, 52, 'a11'), endP(), endP(), endP(), endP()], SPORT.config);
    const b = afMatchRecords(s)!;
    const types = new Set(MATCH_RECORD_TYPES.american_football!.map((t) => t.key));
    for (const it of b.items) assert.ok(types.has(it.type), it.type);
    assert.equal(b.items.filter((i) => i.type === 'longestTD').sort((x, y) => y.value - x.value)[0].text, '65 yds');
    assert.equal(b.items.find((i) => i.type === 'playerTD')?.value, 2);
    assert.equal(b.items.find((i) => i.type === 'longestFG')?.value, 52);
  });
  test('game flow in points; US name "Football", elsewhere "American football"', () => {
    const f = gameFlowFor('american_football', run(NFL, SPORT.config))!;
    assert.equal(f.unit, 'points'); assert.ok(f.leadChanges >= 1);
    assert.equal(sportDisplayName('american_football', 'American football', 'us'), 'Football');
    assert.equal(sportDisplayName('football', 'Football', 'us'), 'Soccer');
    assert.equal(sportDisplayName('american_football', 'American football', 'in'), 'American football');
  });
});

const SUR_H = ['Rao', 'Khan', 'Nair', 'Iyer', 'Das', 'Pillai', 'Sen', 'Bose', 'Gill', 'Shah', 'Mehta'];
const SUR_A = ['Smith', 'Jones', 'Brown', 'Taylor', 'Wilson', 'Evans', 'Thomas', 'Walker', 'White', 'Hughes', 'Green'];
const roster = (ids: string[], sur: string[]): Player[] => ids.map((id, i) => ({ id, fullName: `${['Asha', 'Meera', 'Ravi', 'Kiran', 'Dev'][i % 5]} ${sur[i]}`, jerseyNo: i + 1, sports: ['american_football'] } as Player));
const HR = roster(HOME, SUR_H), AR = roster(AWAY, SUR_A);
const ctxOf = (s: AFState): VoiceContext => ({ state: s, homeName: 'Lions', awayName: 'Bears', homeRoster: HR, awayRoster: AR, now: 1_000 + 60_000 });

describe('SD-147 · voice', () => {
  const live = (cfg?: Record<string, unknown>) => reducer(init(cfg), { type: 'CLOCK', payload: { run: true, at: 1_000 } });
  test('touchdown, the try, field goal, safety, timeout', () => {
    const s = live(SPORT.config);
    const t = afVoice('touchdown pass Khan from Rao 24', ctxOf(s))!;
    assert.equal(t[0].type, 'TD'); assert.equal(t[0].payload?.how, 'pass'); assert.equal(t[0].payload?.yards, 24);
    assert.equal(t[0].attribution?.playerId, 'h2'); assert.equal(t[0].attribution2?.playerId, 'h1');
    const s2 = reducer(s, t[0]);
    const x = afVoice('extra point good Mehta', ctxOf(s2))!;
    assert.equal(x[0].type, 'TRY'); assert.equal(x[0].side, 'home'); assert.equal(x[0].payload?.kind, 'kick'); assert.equal(x[0].attribution?.playerId, 'h11');
    assert.equal(afVoice('two point no good', ctxOf(s2))![0].payload?.good, false);
    const f = afVoice('field goal good 32 Green', ctxOf(s2))!;
    assert.equal(f[0].type, 'FG'); assert.equal(f[0].side, 'away'); assert.equal(f[0].payload?.yards, 32); assert.equal(f[0].attribution?.playerId, 'a11');
    assert.equal(afVoice('field goal no good 45 Green', ctxOf(s2))![0].payload?.good, false);
    assert.equal(afVoice('safety home', ctxOf(s2))![0].type, 'SAFETY');
    assert.equal(afVoice('timeout away', ctxOf(s2))![0].side, 'away');
    assert.equal(afVoice('touchdown Rao', ctxOf(s2))![0].attribution?.playerId, 'h1');
  });
  test('play by play: "pass complete to X for 12", "run X for 5", "incomplete", "sack"', () => {
    let s = live({ ...SPORT.config, mode: 'pbp' });
    s = reducer(s, { type: 'SET_DRIVE', payload: { off: 'home', spot: 30 } });
    s = reducer(s, buildPlay(s, 'home', { play: 'pass', yards: 5, p1: W('h1'), p2: W('h2') }, at(1, 10)));
    const p = afVoice('pass complete to Nair for 12', ctxOf(s))!;
    assert.equal(p[0].type, 'PLAY'); assert.equal(p[0].payload?.yards, 12); assert.equal(p[0].attribution?.playerId, 'h1', 'the last passer');
    assert.equal(p[0].attribution2?.playerId, 'h3', '12 is yards, not shirt 12');
    assert.equal(afVoice('run Khan for 5', ctxOf(s))![0].attribution?.extra?.rushYds, 5);
    assert.equal(afVoice('Khan loss of 3', ctxOf(s))![0].payload?.yards, -3);
    assert.equal(afVoice('incomplete', ctxOf(s))![0].payload?.play, 'inc');
    assert.equal(afVoice('sack Wilson 6', ctxOf(s))![0].attribution2?.playerId, 'a5');
  });
  test('ends ask first: end quarter; end of game only when it is', () => {
    const s = live(SPORT.config);
    assert.equal(afVoiceEnds(afVoice('end quarter', ctxOf(s))!, s)?.action, 'endPeriod');
    assert.equal(afVoice('end of game', ctxOf(s)), null);
    const q4 = reducer([endP(), endP(), endP()].reduce(reducer, init(SPORT.config)), { type: 'CLOCK', payload: { run: true, at: 1_000 } });
    assert.equal(afVoiceEnds(afVoice('end of game', ctxOf({ ...q4, home: 7 }))!, { ...q4, home: 7 })?.action, 'fullTime');
  });
});

/* ------------------------------ schema & safety ------------------------------ */

describe('SD-147 · schema, career, leaders, safety', () => {
  test('schema valid and registered', () => {
    assert.deepEqual(validateSchema(americanFootballStats), []);
    assert.equal(STAT_SCHEMAS.american_football, americanFootballStats);
  });
  test('passer rating (NFL formula): perfect 158.3; career + qualifier', () => {
    assert.equal(passerRating({ passComp: 20, passAtt: 20, passYds: 400, passTD: 6, passInt: 0 }), 158.3);
    assert.equal(passerRating({ passComp: 0, passAtt: 10, passYds: 0, passTD: 0, passInt: 3 }), 0);
    assert.equal(passerRating({ passComp: 22, passAtt: 33, passYds: 260, passTD: 2, passInt: 1 }), 98);
    const s = run(pbpLog(), { ...SPORT.config, mode: 'pbp', trackTackles: true });
    const lines: StatLine[] = Object.entries(afTotals(s)).map(([pid, t]) => ({ id: `m1-${pid}`, matchId: 'm1', playerId: pid, sport: 'american_football', stats: t.stats, won: false } as StatLine));
    const qb = lines.filter((l) => l.playerId === 'h1');
    const v = aggregateValue(americanFootballStats, statDefIn(americanFootballStats, 'passerRating')!, qb);
    assert.equal(v.text, '158.3'); assert.equal(v.den, 2);
    const c = careerFromSchema(americanFootballStats, qb);
    assert.equal(c.passing.find((r) => r.key === 'passYds')?.value, '76');
    const players: Player[] = [...HOME, ...AWAY].map((id) => ({ id, fullName: nm(id), sports: ['american_football'] } as Player));
    const cats = categoryLeaders(lines, players, 'american_football' as SportId);
    assert.deepEqual(cats.find((x) => x.key === 'passYds')!.leaders.slice(0, 1).map((l) => [l.name, l.value]), [['H1', 76]]);
    assert.equal(cats.find((x) => x.key === 'passerRating')?.leaders.length ?? 0, 0, 'min 20 attempts to rank');
  });
  test('match safety: period / game end through the ConfirmSheet; nothing dispatches END from a tap', () => {
    assert.deepEqual(FLOW_CONTROLS.american_football, ['endPeriod', 'fullTime']);
    const src = readFileSync(new URL('../src/sports/american_football/index.tsx', import.meta.url), 'utf8');
    assert.ok(!/onPress=\{\(\) => dispatch\(\{ type: '(END|END_PERIOD)'/.test(src));
    assert.ok(/confirmMatchAction\('fullTime'/.test(src) && /confirmMatchAction\('endPeriod'/.test(src));
  });
});
