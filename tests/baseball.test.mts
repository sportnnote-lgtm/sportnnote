/**
 * SD-144 — baseball + softball (WBSC) born on the Wave 1 foundations:
 *  - the count (ball four, strike three, fouls with two strikes, slow pitch's
 *    1-1 count and foul-out), outs and half-innings, left on base;
 *  - plate-appearance outcomes with the default runner advance, RBI, the
 *    OBR 5.08 force-out rule, the walk-off (only the winning run unless a
 *    home run), the run rule, regulation / extra innings with the WBSC
 *    tie-break runners, a called game;
 *  - runner plays (steal, caught stealing, wild pitch, balk), subs (pinch
 *    hitter / runner, pitching change), pitch counts, inherited runners,
 *    earned runs + the scorer's override, W / L / SV;
 *  - statTotals (SD-19 harness), box scores, schema / career / leaders /
 *    awards, records, discipline, walkover, the stage rule, WBSC standings
 *    (win %, head-to-head, TQB), voice, scorer-flow guards.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  init, reducer, buildPitch, buildPlay, buildRunner, defaultMoves, situation, result, statusText, mercyRules, readConfig, inningsAtBat, eventCredits, creditAttribution,
  type BaseballState, type Outcome, type Move,
} from '../src/sports/baseball/engine.ts';
import { baseballTotals, DERIVED_KEYS, notation } from '../src/sports/baseball/totals.ts';
import { baseballBox, baseballPitchingBox } from '../src/sports/baseball/box.ts';
import { baseballStats, baseballPitchingStats } from '../src/sports/baseball/stats.ts';
import { baseballTimeline } from '../src/sports/baseball/timeline.ts';
import { baseballTickerDetail, baseballTickerFlash } from '../src/sports/baseball/ticker.ts';
import { baseballMatchRecords } from '../src/sports/baseball/records.ts';
import { baseballVoice, baseballVoiceEnds } from '../src/sports/baseball/voice.ts';
import { BASEBALL_DISCIPLINE } from '../src/sports/baseball/discipline.ts';
import { buildBoxTable, comparisonRows } from '../src/sports/boxScore.ts';
import { careerFromSchema, validateSchema } from '../src/sports/statSchema.ts';
import { matchBoxSource } from '../src/sports/boxSources.ts';
import { STAT_SCHEMAS } from '../src/sports/statSchemas.ts';
import { MATCH_RECORD_HOOKS } from '../src/sports/matchRecordHooks.ts';
import { matchRecordTypes } from '../src/sports/matchRecords.ts';
import { FLOW_CONTROLS } from '../src/core/matchSafety.ts';
import { DISCIPLINE_SPECS, readSportRule } from '../src/sports/discipline.ts';
import { walkoverRuleFor } from '../src/data/walkover.ts';
import { matchFormatFor } from '../src/data/matchFormat.ts';
import { gameFlowFor } from '../src/sports/gameFlow.ts';
import { teamStandings, standingsConfigFromFormat, standingsPresets, NEW_TOURNAMENT_POINTS, categoryLeaders, tieBreakerLabel, availableTieBreakers, scoreUnit } from '../src/data/standings.ts';
import { tableColumns } from '../src/data/standingsColumns.ts';
import { assertContract, assertSameAsClean, amendRecord, toRecords, type TotalsSport } from './statTotalsHarness.mts';
import type { ScoreAction } from '../src/sports/types.ts';
import { replayLog } from '../src/sports/amend.ts';
import type { Match, Player, SportId, StatLine } from '../src/core/types.ts';

/* ---------------------------------- helpers --------------------------------- */

const ORDER = (p: string, n = 9) => Array.from({ length: n }, (_, i) => ({ id: `${p}${i + 1}`, name: `${p.toUpperCase()}${i + 1}` }));
function start(config?: Record<string, unknown>): BaseballState {
  let s = init(config);
  s = reducer(s, { type: 'LINEUP', payload: { team: 'home', order: ORDER('h', readConfig(config).lineupSize), pitcher: { id: 'hp', name: 'HP' } } });
  s = reducer(s, { type: 'LINEUP', payload: { team: 'away', order: ORDER('a', readConfig(config).lineupSize), pitcher: { id: 'ap', name: 'AP' } } });
  return s;
}
/** a little scripted game: each step builds its action from the state */
type Step = (s: BaseballState) => ScoreAction;
const P = (o: Outcome, moves?: (s: BaseballState) => Move[], extra: { fielders?: string; rbi?: number } = {}): Step => (s) => buildPlay(s, o, { ...(moves ? { moves: moves(s) } : {}), ...extra });
const pitch = (k: 'ball' | 'called' | 'swinging' | 'foul'): Step => (s) => buildPitch(s, k);
const runner = (k: Parameters<typeof buildRunner>[1], base?: 1 | 2 | 3): Step => (s) => buildRunner(s, k, base ? [{ ...s.g.bases[base - 1] && { id: s.g.bases[base - 1]!.id, name: s.g.bases[base - 1]!.name }, from: base, to: k === 'CS' ? -1 : ((base + 1) as 2 | 3 | 4) }] : undefined);
const sub = (side: 'home' | 'away', payload: Record<string, unknown>): Step => () => ({ type: 'SUB', side, payload: { uid: `sub${Math.random()}`, ...payload } });
function play(s: BaseballState, steps: Step[]): { s: BaseballState; actions: ScoreAction[] } {
  const actions: ScoreAction[] = [];
  for (const st of steps) { const a = st(s); actions.push(a); s = reducer(s, a); }
  return { s, actions };
}
const outs = (n: number): Step[] => Array.from({ length: n }, () => P('GO'));
/** three up, three down */
const half3 = (): Step[] => outs(3);

/* ------------------------------- the count ---------------------------------- */

describe('SD-144 · formats and the count', () => {
  test('presets: baseball 9 / softball 7 / slow pitch 10 in the order, 1-1, foul-out / youth 6 / school 7', () => {
    const b = readConfig();
    assert.deepEqual([b.innings, b.tiebreak, b.tbFrom, b.dh, b.lineupSize], [9, 'r12', 10, true, 9]);
    assert.deepEqual(mercyRules(b.mercy), [{ lead: 15, after: 5 }, { lead: 10, after: 7 }]);
    const sb = readConfig({ preset: 'softball' });
    assert.deepEqual([sb.innings, sb.tiebreak, sb.tbFrom], [7, 'r2', 8]);
    const sp = readConfig({ preset: 'slowpitch' });
    assert.deepEqual([sp.lineupSize, sp.startBalls, sp.startStrikes, sp.foulOut], [10, 1, 1, true]);
    assert.equal(readConfig({ preset: 'youth' }).innings, 6);
    assert.equal(readConfig({ preset: 'school', innings: 5 }).innings, 5, 'organiser override');
  });
  test('ball four is a walk, strike three a strikeout; a 2-strike foul keeps the count', () => {
    let { s } = play(start(), [pitch('ball'), pitch('ball'), pitch('called'), pitch('foul'), pitch('foul'), pitch('foul')]);
    assert.deepEqual([s.g.balls, s.g.strikes], [2, 2]);
    ({ s } = play(s, [pitch('ball'), pitch('ball')]));
    assert.equal(s.events.at(-1)!.outcome, 'BB');
    assert.ok(s.g.bases[0]);
    assert.deepEqual([s.g.balls, s.g.strikes], [0, 0]);
    ({ s } = play(s, [pitch('swinging'), pitch('called'), pitch('swinging')]));
    assert.equal(s.events.at(-1)!.outcome, 'K');
    assert.equal(s.g.outs, 1);
    assert.equal(s.g.pitches.hp, 11, 'every pitch counts for the pitcher');
  });
  test('slow pitch: the count starts 1-1 and a foul with two strikes is out', () => {
    const { s } = play(start({ preset: 'slowpitch' }), [pitch('called'), pitch('foul')]);
    assert.equal(s.events.at(-1)!.outcome, 'K');
    assert.deepEqual([s.g.balls, s.g.strikes, s.g.outs], [1, 1, 1]);
  });
});

/* ---------------------------- outs, runs, innings ---------------------------- */

describe('SD-144 · outs, runs, half-innings', () => {
  test('three outs end the half; runners left on base are counted', () => {
    const { s } = play(start(), [P('1B'), P('BB'), ...outs(3)]);
    assert.equal(s.g.half, 1);
    assert.equal(s.g.lob.away, 2);
    assert.equal(situation(s).bat, 'home');
    assert.equal(statusText(s), '▼ 1st · 0 outs');
  });
  test('default advance: single +1, double +2, triple / homer clear the bases; a bases-loaded walk forces a run with 1 RBI', () => {
    let { s } = play(start(), [P('1B'), P('2B')]);
    assert.deepEqual(s.g.bases.map((r) => r?.id ?? null), [null, 'a2', 'a1']);
    ({ s } = play(s, [P('BB'), P('BB')]));
    assert.equal(s.g.score.away, 1);
    assert.equal(s.events.at(-1)!.rbi, 1);
    ({ s } = play(s, [P('HR')]));
    assert.equal(s.g.score.away, 5);
    assert.equal(s.events.at(-1)!.rbi, 4);
  });
  test('OBR 5.08: no run scores on a 3rd-out force or when the batter is out', () => {
    const { s } = play(start(), [P('3B'), P('BB'), P('GO'), P('GO'), P('FC', (st) => [{ from: 3, to: 4, id: st.g.bases[2]!.id }, ...defaultMoves(st, 'FC')])]);
    assert.equal(s.g.score.away, 0);
    assert.equal(s.g.half, 1);
  });
  test('a sac fly scores the runner from 3rd with an RBI and no at bat; an error scores no RBI', () => {
    const { s } = play(start(), [P('3B'), P('SF'), P('1B'), P('E', undefined, { fielders: 'E6' })]);
    const sf = s.events[1];
    assert.equal(sf.rbi, 1);
    assert.equal(eventCredits(sf).first!.stats.atBats, undefined);
    assert.equal(s.events[3].rbi, 0);
    assert.equal(s.g.errors.home, 1);
  });
  test('home ahead after the top of the 9th: no bottom half (X)', () => {
    const steps: Step[] = [];
    for (let i = 0; i < 8; i++) steps.push(...half3(), ...(i === 0 ? [P('HR')] : []), ...half3());
    steps.push(...half3());
    const { s } = play(start(), steps);
    assert.equal(s.g.ended, true);
    assert.equal(s.g.endReason, 'reg');
    assert.deepEqual(result(s), { winner: 'home', home: 1, away: 0 });
  });
  test('walk-off: only the winning run counts on a single; a home run counts every run', () => {
    const toBottom9: Step[] = [];
    for (let i = 0; i < 8; i++) toBottom9.push(...half3(), ...half3());
    toBottom9.push(...half3());
    const base = play(start(), [...toBottom9, P('BB'), P('BB'), P('BB')]).s;
    const single = play(base, [P('2B')]).s; // two runners cross, the first wins it
    assert.deepEqual([single.g.ended, single.g.endReason, single.g.score.home], [true, 'walkoff', 1]);
    const hr = play(base, [P('HR')]).s;
    assert.equal(hr.g.score.home, 4);
    assert.equal(statusText(hr), 'Final');
  });
  test('run rule: 15 after 5 (WBSC baseball) ends after the half; youth 10 after 4', () => {
    const steps: Step[] = [];
    for (let i = 0; i < 15; i++) steps.push(P('HR'));
    steps.push(...half3(), ...half3());
    for (let i = 1; i < 5; i++) steps.push(...half3(), ...half3());
    const { s } = play(start(), steps);
    assert.equal(s.g.endReason, 'mercy');
    assert.match(statusText(s), /run rule \(5 inn\)/);
    const y: Step[] = [];
    for (let i = 0; i < 10; i++) y.push(P('HR'));
    y.push(...half3());
    for (let i = 0; i < 3; i++) y.push(...half3(), ...half3());
    y.push(...half3());
    assert.equal(play(start({ preset: 'youth' }), y).s.g.endReason, 'mercy');
  });
  test('extra innings: WBSC tie-break runners on 1st + 2nd from the 10th (unearned); softball runner on 2nd from the 8th', () => {
    const steps: Step[] = [];
    for (let i = 0; i < 9; i++) steps.push(...half3(), ...half3());
    const s = play(start(), steps).s;
    assert.equal(s.g.ended, false);
    assert.equal(s.g.half, 18);
    assert.deepEqual(s.g.bases.map((r) => r?.id ?? null), ['a8', 'a9', null], 'the two batters before the lead-off');
    const after = play(s, [P('HR')]).s;
    assert.deepEqual([after.g.runs.length, after.g.runs.filter((r) => !r.earned).length], [3, 2]);
    const sb: Step[] = [];
    for (let i = 0; i < 7; i++) sb.push(...half3(), ...half3());
    const t = play(start({ preset: 'softball' }), sb).s;
    assert.deepEqual(t.g.bases.map((r) => r?.id ?? null), [null, 'a3', null]);
  });
  test('a called game ends at the score; a level called game is a draw', () => {
    const s = play(start(), [P('HR'), ...half3(), ...half3()]).s;
    const c = reducer(s, { type: 'END', payload: {} });
    assert.deepEqual([c.g.ended, c.g.endReason, result(c)?.winner], [true, 'called', 'away']);
    assert.equal(result(reducer(start(), { type: 'END' }))?.winner, 'draw');
  });
});

/* ------------------------- runners, subs, pitchers -------------------------- */

describe('SD-144 · runners, substitutions, pitchers, earned runs, decisions', () => {
  test('steal, caught stealing (an out for the pitcher), wild pitch moves everyone, balk', () => {
    let { s } = play(start(), [P('1B'), runner('SB', 1)]);
    assert.equal(s.g.bases[1]?.id, 'a1');
    ({ s } = play(s, [P('BB'), runner('WP')]));
    assert.deepEqual(s.g.bases.map((r) => r?.id ?? null), [null, 'a2', 'a1']);
    ({ s } = play(s, [runner('CS', 2)]));
    assert.equal(s.g.outs, 1);
    const cs = s.events.at(-1)!;
    assert.deepEqual(eventCredits(cs).second?.stats, { outsPitched: 1 });
    ({ s } = play(s, [runner('BK')]));
    assert.equal(s.g.score.away, 1);
  });
  test('pinch runner keeps the run charged to the pitcher who put the runner on; a reliever inherits', () => {
    const s = play(start(), [
      P('1B'),
      sub('away', { kind: 'pr', base: 1, slot: 0, on: { id: 'a10', name: 'A10' } }),
      sub('home', { kind: 'p', on: { id: 'hr1', name: 'HR1' }, off: { id: 'hp', name: 'HP' } }),
      P('HR'),
    ]).s;
    assert.equal(s.g.order.away[0].id, 'a10');
    const t = baseballTotals(s);
    assert.equal(t.a10.stats.runs, 1);
    assert.equal(t.hp.stats.runsAllowed, 1, 'inherited runner → the starter');
    assert.equal(t.hr1.stats.runsAllowed, 1);
    assert.equal(t.hr1.stats.hrAllowed, 1);
  });
  test('a pinch hitter takes the slot; the order moves on from him', () => {
    const s = play(start(), [sub('away', { kind: 'ph', slot: 0, on: { id: 'a10', name: 'A10' } }), P('1B')]).s;
    assert.equal(s.events.at(-1)!.batter?.id, 'a10');
    assert.equal(situation(s).batter.id, 'a2');
  });
  test('earned runs: a runner who reached on an error scores unearned; the scorer can override', () => {
    let s = play(start(), [P('E', undefined, { fielders: 'E5' }), P('HR')]).s;
    let t = baseballTotals(s);
    assert.deepEqual([t.hp.stats.runsAllowed, t.hp.stats.earnedRuns], [2, 1]);
    s = reducer(s, { type: 'ER', payload: { ref: s.events.at(-1)!.id, earned: false } });
    t = baseballTotals(s);
    assert.equal(t.hp.stats.earnedRuns, 0);
    assert.equal(t.h5?.stats.fieldErrors, undefined, 'no position stamped → no fielder credit');
  });
  test('W / L / SV: the winning pitcher when his team took the lead for good; a save for the closer', () => {
    const steps: Step[] = [...half3(), P('HR'), ...outs(3)];
    for (let i = 1; i < 8; i++) steps.push(...half3(), ...half3());
    steps.push(...half3(), ...half3());
    steps.splice(steps.length - 6, 0, sub('home', { kind: 'p', on: { id: 'hc', name: 'HC' } }));
    const s = play(start(), steps).s;
    assert.equal(s.g.ended, true);
    assert.deepEqual(s.g.decisions, { w: 'hp', l: 'ap', sv: 'hc' });
    const t = baseballTotals(s);
    assert.deepEqual([t.hp.stats.pitchWins, t.ap.stats.pitchLosses, t.hc.stats.pitchSaves], [1, 1, 1]);
    assert.equal(t.hp.stats.outsPitched, 24);
  });
});

/* ------------------------------ statTotals ---------------------------------- */

const GAME: Step[] = [
  pitch('ball'), pitch('called'), P('1B'), runner('SB', 1), pitch('swinging'), P('2B'), P('BB'), P('GO'),
  P('SF'), P('K'),
  pitch('ball'), P('HR'), P('E', undefined, { fielders: 'E6' }), sub('away', { kind: 'p', on: { id: 'ar', name: 'AR' } }), runner('WP'), P('DP'),
  P('3B'), P('FO', undefined, { fielders: '8' }), P('LO'), P('GO'),
];
const SPORT: TotalsSport<BaseballState> = { name: 'baseball', init: () => start(), reducer, statTotals: baseballTotals, partial: false, derived: DERIVED_KEYS };
const gameActions = () => play(start(), GAME).actions;

describe('SD-144 · statTotals contract (SD-19 harness)', () => {
  test('clean log + every undo prefix: owned keys = live sums; derived ≥ 0', () => {
    const t = assertContract(SPORT, toRecords(gameActions()), { every: 1 });
    assert.deepEqual([t.a1.stats.hits, t.a1.stats.stolenBases, t.a1.stats.runs], [1, 1, 1]);
    assert.deepEqual([t.a2.stats.twoB, t.a2.stats.rbi], [1, 1]);
    assert.equal(t.a5.stats.sacFlies, 1);
    assert.equal(t.h1.stats.homeRuns, 1);
    assert.ok(t.hp.stats.outsPitched >= 3);
  });
  test('a live correction (REMOVE_EVENT with reversed credits) = the game scored cleanly', () => {
    const clean = gameActions();
    const i = 5; // the double
    const s0 = play(start(), GAME.slice(0, i)).s;
    const wrong = buildPlay(s0, '1B');
    const ev = reducer(s0, wrong).events.at(-1)!;
    const cr = eventCredits(ev);
    const fix: ScoreAction = { type: 'REMOVE_EVENT', payload: { id: ev.id }, attribution: creditAttribution(cr.first, -1), attribution2: creditAttribution(cr.second, -1) };
    const corrected = toRecords([...clean.slice(0, i), wrong, fix, ...clean.slice(i)]);
    assertContract(SPORT, corrected, { every: 1000, label: 'live remove' });
    assertSameAsClean(SPORT, corrected, toRecords(clean), 'live remove');
  });
  test('#05 AMEND: re-credit the home run to another batter — totals follow', () => {
    const recs = toRecords(gameActions());
    const hr = recs.find((r) => r.type === 'PLAY' && (r.payload as Record<string, unknown>).outcome === 'HR')!;
    const p = hr.payload as Record<string, unknown>;
    const action = { type: hr.type, side: hr.side!, payload: { ...p, batter: { id: 'h9', name: 'H9', slot: 0 } }, attribution: { ...hr.attribution!, playerId: 'h9', playerName: 'H9' } };
    const am = amendRecord(recs, [{ op: 'replace', seq: hr.seq, action }]);
    assertContract(SPORT, [...recs, am], { every: 1000, label: 'AMEND' });
    const t = baseballTotals(replayLog({ createInitialState: () => start(), reducer }, undefined, [...recs, am]));
    assert.equal(t.h9.stats.homeRuns, 1);
    assert.equal(t.h1?.stats.homeRuns ?? 0, 0);
  });
  test('fielding from the notation: 6-4-3 → PO 3, A 6 and 4; E5 → an error', () => {
    assert.deepEqual(notation('6-4-3'), { po: [3], a: [6, 4], e: [] });
    assert.deepEqual(notation('E5'), { po: [], a: [], e: [5] });
    let s = init();
    s = reducer(s, { type: 'LINEUP', payload: { team: 'home', order: [{ id: 'cf', name: 'CF', pos: 'CF' }, ...ORDER('h', 8)], pitcher: { id: 'hp', name: 'HP' } } });
    s = play(s, [P('FO', undefined, { fielders: '8' })]).s;
    assert.equal(baseballTotals(s).cf.stats.putouts, 1);
  });
});

/* ---------------------------- box, schema, career --------------------------- */

describe('SD-144 · box score, timeline, ticker, records, game flow', () => {
  const s = play(start(), GAME).s;
  test('batting box: AB R H RBI BB SO AVG (+2B 3B HR SB when someone has one); totals = the score', () => {
    const t = buildBoxTable(baseballStats, baseballBox(s).data('all'), { scope: 'all' });
    const cols = t.columns.map((c) => c.abbr);
    assert.deepEqual(cols, ['AB', 'R', 'H', 'RBI', 'BB', 'SO', '2B', '3B', 'HR', 'SB', 'AVG']);
    assert.equal(t.away.totals[cols.indexOf('R')], String(s.g.score.away));
    assert.equal(t.home.totals[cols.indexOf('R')], String(s.g.score.home));
    const a1 = t.away.rows.find((r) => r.name === 'A1')!;
    assert.equal(a1.cells[cols.indexOf('AVG')], '1.000');
    const a5 = t.away.rows.find((r) => r.name === 'A5')!;
    assert.equal(a5.cells[cols.indexOf('AVG')], '–', 'a sac fly is no at bat');
    assert.ok(matchBoxSource('baseball', s));
  });
  test('pitching box: IP H R ER BB SO NP ERA; the comparison has errors and LOB', () => {
    const t = buildBoxTable(baseballPitchingStats, baseballPitchingBox(s).data('all'), { scope: 'all' });
    const cols = t.columns.map((c) => c.abbr);
    assert.deepEqual(cols.slice(0, 6), ['IP', 'H', 'R', 'ER', 'BB', 'SO']);
    const hp = t.home.rows.find((r) => r.name.startsWith('HP'))!;
    assert.match(hp.cells[0], /^\d\.\d$/);
    const cmp = comparisonRows(baseballStats, baseballBox(s).data('all'), 'all');
    assert.equal(cmp.rows.find((r) => r.label === 'Errors')?.away, '1');
  });
  test('timeline: plate appearances with runs and RBI, runner plays, changes; ticker situation + HR flash', () => {
    const rows = baseballTimeline(s);
    assert.ok(rows.some((r) => r.label.startsWith('Home run') && r.tone === 'boundary'));
    assert.ok(rows.some((r) => r.label === 'Pitching change'));
    assert.ok(rows.some((r) => r.label === 'Stolen base'));
    const live = play(start(), [P('1B'), pitch('ball')]).s;
    assert.equal(baseballTickerDetail(live).detail, '▲ 1st · 0 out · 1-0 · 1B');
    const pre = play(start(), [P('BB'), P('BB'), P('BB')]).s;
    const f = baseballTickerFlash(pre, play(pre, [P('HR')]).s);
    assert.equal(f?.text, 'GRAND SLAM! A4');
  });
  test('records: no-hitter, perfect game, cycle, grand slam, most strikeouts', () => {
    // home's pitcher retires 27 in a row; home scores once
    const steps: Step[] = [];
    for (let i = 0; i < 8; i++) steps.push(P('K'), P('K'), P('GO'), ...(i === 0 ? [P('HR')] : []), ...half3());
    steps.push(...half3());
    const perfect = play(start(), steps).s;
    const r = baseballMatchRecords(perfect)!;
    assert.ok(r.items.some((x) => x.type === 'noHitter' && x.playerId === 'hp'));
    assert.ok(r.items.some((x) => x.type === 'perfectGame' && x.text === '27 up, 27 down'));
    assert.equal(r.items.find((x) => x.type === 'mostKPitched')?.text, '16 K');
    // a cycle and a grand slam
    const cyc: Step[] = [P('1B'), P('BB'), P('BB'), P('HR')];
    const g = play(start(), [...cyc, ...half3(), ...half3()]).s;
    assert.ok(baseballMatchRecords(reducer(g, { type: 'END' }))!.items.some((x) => x.type === 'grandSlam' && x.playerId === 'a4'));
    assert.equal(MATCH_RECORD_HOOKS.baseball, baseballMatchRecords);
    assert.deepEqual(matchRecordTypes('baseball').map((x) => x.key), ['teamHigh', 'biggestWin', 'noHitter', 'perfectGame', 'cycle', 'grandSlam', 'mostKPitched']);
  });
  test('wiring: flow controls (called game only), game flow by runs', () => {
    assert.deepEqual(FLOW_CONTROLS.baseball, ['fullTime']);
    assert.equal(gameFlowFor('baseball', s)?.scores, s.g.score.home + s.g.score.away);
  });
});

describe('SD-144 · schema, career, leaders', () => {
  test('the schema is valid and registered; shared keys keep their labels', () => {
    assert.deepEqual(validateSchema(baseballStats), []);
    assert.deepEqual(validateSchema(baseballPitchingStats), []);
    assert.equal(STAT_SCHEMAS.baseball, baseballStats);
  });
  let n = 0;
  const L = (playerId: string, stats: Record<string, number>, matchId = `m${++n}`): StatLine => ({ id: `${matchId}-${playerId}`, matchId, playerId, sport: 'baseball', stats } as StatLine);
  // a batter over 3 games: 12 AB, 5 H (1 2B, 1 HR), 2 BB, 1 HBP, 1 SF
  const bat = [
    L('b1', { plateAppearances: 5, atBats: 4, hits: 2, twoB: 1, homeRuns: 1, baseOnBalls: 1, rbi: 3, runs: 2 }),
    L('b1', { plateAppearances: 5, atBats: 4, hits: 2, baseOnBalls: 1 }),
    L('b1', { plateAppearances: 6, atBats: 4, hits: 1, hitByPitch: 1, sacFlies: 1, rbi: 1 }),
    L('b2', { plateAppearances: 4, atBats: 4, hits: 1, homeRuns: 1, rbi: 1 }),
    L('b3', { plateAppearances: 12, atBats: 11, hits: 2, baseOnBalls: 1 }),
  ];
  // a 9-inning game (27 outs, 3 ER → erN 27) and a 7-inning softball game (7 outs, 1 ER → erN 7)
  const pit = [
    L('p1', { outsPitched: 27, earnedRuns: 3, erN: 27, hitsAllowed: 6, bbAllowed: 2, kPitched: 9, gamesPitched: 1, pitchWins: 1 }),
    L('p1', { outsPitched: 7, earnedRuns: 1, erN: 7, hitsAllowed: 2, bbAllowed: 1, kPitched: 3, gamesPitched: 1 }),
    L('p2', { outsPitched: 6, earnedRuns: 0, erN: 0, hitsAllowed: 1, bbAllowed: 0, kPitched: 2, gamesPitched: 1 }),
  ];
  test('career: AVG / OBP / SLG / OPS with no leading zero; IP as innings; ERA on each format\'s scale', () => {
    const c = careerFromSchema(baseballStats, bat.filter((l) => l.playerId === 'b1'));
    const v = (k: string) => c.batting.find((r) => r.key === k)?.value;
    assert.equal(v('battingAvg'), '.417'); // 5 / 12
    assert.equal(v('obp'), '.500'); // (5 + 2 + 1) / (12 + 2 + 1 + 1)
    assert.equal(v('slg'), '.750'); // TB = 5 H + 1 (2B) + 3 (HR) = 9 / 12
    assert.equal(v('ops'), '1.250');
    assert.equal(v('totalBases'), '9');
    const p = careerFromSchema(baseballStats, pit.filter((l) => l.playerId === 'p1'));
    const pv = (k: string) => p.pitching.find((r) => r.key === k)?.value;
    assert.equal(pv('outsPitched'), '11.1');
    assert.equal(pv('era'), '3.00'); // (3 ER × 9 + 1 ER × 7) × 3 ÷ 34 outs
    assert.equal(pv('whip'), '0.97');
  });
  test('leaders: AVG (min 10 at bats), home runs, ERA (min 3 innings)', () => {
    const players: Player[] = ['b1', 'b2', 'b3', 'p1', 'p2'].map((id) => ({ id, fullName: id.toUpperCase(), sports: ['baseball'] } as Player));
    const cats = categoryLeaders([...bat, ...pit], players, 'baseball' as SportId);
    const avg = cats.find((x) => x.key === 'battingAvg')!;
    assert.deepEqual(avg.leaders.map((l) => l.name), ['B1', 'B3'], 'B2 has 4 at bats');
    assert.deepEqual(cats.find((x) => x.key === 'homeRuns')!.leaders.map((l) => l.name), ['B1', 'B2']);
    assert.deepEqual(cats.find((x) => x.key === 'era')!.leaders.map((l) => l.name), ['P1'], 'P2 has 2 innings');
  });
});

/* --------------------- discipline, walkover, stage, standings ---------------- */

describe('SD-144 · discipline, walkover, the stage rule, WBSC standings', () => {
  test('ejections: 1 game by default; an official listed only', () => {
    assert.equal(DISCIPLINE_SPECS.baseball, BASEBALL_DISCIPLINE);
    assert.deepEqual(readSportRule(BASEBALL_DISCIPLINE, {}).bans, { banEject: 1 });
    let s = start();
    s = reducer(s, { type: 'EJECT', side: 'home', payload: { player: { id: 'h3', name: 'H3' } } });
    s = reducer(s, { type: 'EJECT', side: 'away', payload: { official: 'Manager' } });
    const marks = BASEBALL_DISCIPLINE.marks({ state: s } as never);
    assert.deepEqual(marks.map((m) => [m.playerId ?? m.official, m.off]), [['h3', 'banEject'], ['Manager', 'banEject']]);
  });
  test('walkover: baseball 9-0, softball formats 7-0 (verify)', () => {
    assert.deepEqual([walkoverRuleFor('baseball')?.win, walkoverRuleFor('baseball')?.verify], [9, true]);
    assert.equal(walkoverRuleFor('baseball', { preset: 'softball' })?.win, 7);
    assert.equal(walkoverRuleFor('baseball', { walkoverScore: '5-0' })?.win, 5);
  });
  test('a knockout never lets a tie stand; a league may', () => {
    assert.equal(matchFormatFor({ formats: { baseball: { allowTies: true } } } as never, 'baseball', true).allowTies, false);
    assert.equal(matchFormatFor({ formats: { baseball: { allowTies: true } } } as never, 'baseball', false).allowTies, true);
  });
  test('standings: win %, then head-to-head, then TQB among the tied', () => {
    assert.equal(scoreUnit('baseball'), 'runs');
    assert.deepEqual(standingsPresets('baseball').map((p) => p.id), ['wbsc', 'runs', 'simple']);
    assert.equal(NEW_TOURNAMENT_POINTS.baseball?.rankBy, 'winPct');
    assert.equal(tieBreakerLabel('tqb' as never, 'baseball'), 'TQB (team quality balance)');
    assert.ok(availableTieBreakers('baseball' as SportId).includes('erTqb' as never));
    assert.ok(!availableTieBreakers('chess' as SportId).includes('tqb' as never), 'chess keeps its own list');
    // A, B, C each 1-1 among themselves (h2h level); TQB decides
    let mn = 0;
    const game = (h: string, a: string, hr: number, ar: number): Match => {
      const steps: Step[] = [];
      for (let i = 0; i < ar; i++) steps.push(P('HR'));
      steps.push(...half3());
      for (let i = 0; i < hr; i++) steps.push(P('HR'));
      steps.push(...half3());
      const st = reducer(play(start(), steps).s, { type: 'END' });
      const r = result(st)!;
      return { id: `bb${++mn}`, sport: 'baseball', status: 'completed', startsAt: '', score: { home: r.home, away: r.away }, winner: r.winner, homeTeam: { id: h, name: h }, awayTeam: { id: a, name: a }, state: st } as unknown as Match;
    };
    const ms = [game('A', 'B', 9, 1), game('B', 'C', 2, 1), game('C', 'A', 3, 2)];
    const cfg = standingsConfigFromFormat('baseball' as SportId, standingsPresets('baseball')[0].set);
    const rows = teamStandings(ms, 'baseball' as SportId, cfg);
    assert.deepEqual(rows.map((r) => r.teamId), ['A', 'C', 'B']);
    const cols = tableColumns('baseball', cfg, 'team', rows).columns.map((c) => c.label);
    assert.ok(cols.includes('PCT') && cols.includes('RS') && cols.includes('RD'));
    assert.deepEqual(inningsAtBat(ms[0].state as BaseballState), { home: 1, away: 1 });
  });
});

/* ----------------------------------- voice ---------------------------------- */

describe('SD-144 · voice', () => {
  const ctx = (state: BaseballState) => ({ state, homeName: 'Hawks', awayName: 'Owls', homeRoster: [], awayRoster: [], now: 0 });
  test('pitches, hits, outs with fielders, runner plays; "end game" asks first', () => {
    const s = start();
    assert.equal(baseballVoice('ball', ctx(s))![0].type, 'PITCH');
    assert.equal(baseballVoice('strike swinging', ctx(s))![0].payload?.kind, 'swinging');
    const hr = baseballVoice('home run', ctx(s))![0];
    assert.deepEqual([hr.type, hr.payload?.outcome, hr.attribution?.playerId], ['PLAY', 'HR', 'a1']);
    const go = baseballVoice('ground out 6 3', ctx(s))![0];
    assert.deepEqual([go.payload?.outcome, go.payload?.fielders], ['GO', '6-3']);
    assert.equal(baseballVoice('error 6', ctx(s))![0].payload?.fielders, 'E6');
    assert.equal(baseballVoice('double play', ctx(s))![0].payload?.outcome, 'DP');
    assert.equal(baseballVoice('stolen base', ctx(s)), null, 'nobody on');
    const on = play(s, [P('1B')]).s;
    assert.equal(baseballVoice('stolen base', ctx(on))![0].type, 'RUNNER');
    const end = baseballVoice('end game', ctx(on))!;
    assert.equal(baseballVoiceEnds(end, on)?.action, 'fullTime');
  });
});

/* ------------------------------- source guards ------------------------------- */

describe('SD-144 · scorer-flow guards (SD-106 / SD-114)', () => {
  const src = readFileSync(new URL('../src/sports/baseball/index.tsx', import.meta.url), 'utf8');
  test('a called game asks first; nothing dispatches END from a tap', () => {
    assert.match(src, /confirmMatchAction\('fullTime'/);
    assert.ok(!/onPress=\{\(\) => dispatch\(\{ type: '(END|END_PERIOD)'/.test(src));
  });
  test('edits go through usePendingEdit; ✕ via the shared confirm; backfill bar', () => {
    assert.match(src, /usePendingEdit\(liveState, rawDispatch, reducer\)/);
    assert.match(src, /holdRemoval\(/); assert.match(src, /dropHeldRemoval\(\)/);
    assert.match(src, /confirmRemove\(/); assert.match(src, /<RowAction label="✕"/);
    assert.match(src, /<BackfillBar /);
  });
  test('a re-entered play goes back to its place in the log', () => {
    const s = play(start(), [P('1B'), P('K'), P('K')]).s;
    const first = s.events[0];
    const removed = reducer(s, { type: 'REMOVE_EVENT', payload: { id: first.id } });
    const back = reducer(removed, buildPlay(init(), '2B', { extra: { after: '' } }));
    assert.equal(back.events[0].outcome, '2B');
    assert.equal(back.g.bases[1]?.id, undefined, 'the batter in the re-entered play is the first slot');
    assert.ok(back.g.bases[1]);
  });
});
