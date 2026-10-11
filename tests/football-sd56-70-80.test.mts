/**
 * SD-56 (HT score, shirt numbers, no dead `PlayerStatLine.goals`), SD-70
 * (discipline table + suspension rule) and SD-80 (own goals credited,
 * shootout takers / keepers) — football.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { ScoreAction } from '../src/sports/types.ts';
import type { Match, Player } from '../src/core/types.ts';
import * as football from '../src/sports/football/engine.ts';
import { footballStatTotals, FOOTBALL_DERIVED_KEYS, SHOOTOUT_KEYS } from '../src/sports/football/totals.ts';
import { footballBox } from '../src/sports/boxSources.ts';
import { buildBoxTable } from '../src/sports/boxScore.ts';
import { STAT_SCHEMAS } from '../src/sports/statSchemas.ts';
import { trackedIn } from '../src/sports/statSchema.ts';
import { disciplineTable, suspensionsFor, readDisciplineRule, disciplineRuleText, isSuspended, type DisciplineMatch } from '../src/sports/football/discipline.ts';
import { init as legacyInit, reducer as legacyReducer } from './footballLegacyEngine.mts';
import { assertContract, toRecords, type TotalsSport } from './statTotalsHarness.mts';

type Side = 'home' | 'away';
const run = (s: football.FootballState, ...acts: ScoreAction[]) => acts.reduce(football.reducer, s);
const goal = (side: Side, minute: number, half: 1 | 2 | 3 | 4, who = 'X'): ScoreAction =>
  ({ type: 'GOAL', side, payload: { minute, half, goalType: 'open', pid: who.toLowerCase() }, attribution: { playerId: who.toLowerCase(), stat: 'goals', playerName: who, extra: { shots: 1, shotsOnTarget: 1, openPlayGoals: 1 } } });
const og = (awardedTo: Side, minute: number, half: 1 | 2, who: string, id = who.toLowerCase()): ScoreAction =>
  ({ type: 'OWN_GOAL', side: awardedTo, payload: { minute, half, scorerName: who, pid: id } });
const KO = (cfg: Record<string, unknown> = {}) => run(football.init(cfg), { type: 'KICKOFF', payload: { at: 1, ord: true } });
const NEXT: ScoreAction = { type: 'NEXT_HALF', payload: { at: 2 } };
const END: ScoreAction = { type: 'END', payload: { at: 3 } };

describe('SD-56 · half-time score in the status / detail line', () => {
  test('nothing before half-time; "HT 1-0" from the 2nd half; own goals count for the side awarded', () => {
    let s = run(KO(), goal('home', 20, 1, 'A'));
    assert.equal(football.halfTimeText(s), '');
    assert.equal(football.footballDetailLine(s), undefined);
    s = run(s, NEXT, og('home', 50, 2, 'Z'), goal('away', 60, 2, 'B'));
    assert.equal(football.halfTimeText(s), 'HT 1-0');
    assert.equal(s.home, 2); // the OG counted for home
    s = run(s, END);
    assert.equal(football.footballDetailLine(s), 'HT 1-0');
  });
  test('a first-half added-time goal is half-time; extra time adds FT; the shootout follows', () => {
    let s = run(KO({ decider: 'extra_time' }), goal('home', 47, 1, 'A'), NEXT, goal('away', 80, 2, 'B'), END,
      { type: 'START_EXTRA_TIME', payload: {} });
    assert.equal(football.halfTimeText(s), 'HT 1-0 · FT 1-1');
    s = run(s, { type: 'END', payload: { at: 4 } }, { type: 'START_SHOOTOUT', payload: { first: 'away' } });
    assert.equal(football.footballDetailLine(s), 'HT 1-0 · FT 1-1 · Shootout · 0–0');
  });
  test('an old log (no half on events) uses the minute', () => {
    const s = run(football.init({}), { type: 'KICKOFF', payload: { at: 1 } }, { type: 'GOAL', side: 'away', payload: { minute: 30 } }, NEXT);
    assert.equal(football.halfTimeText(s), 'HT 0-1');
  });
});

describe('SD-56 · the dead PlayerStatLine.goals is gone', () => {
  test('player lines carry no goals key (goals live in statTotals / the box)', () => {
    const s = run(KO(), { type: 'STAT', side: 'home', payload: { kind: 'shot', onTarget: true, minute: 3, half: 1 }, attribution: { playerId: 'p1', stat: 'shots', playerName: 'P1' } }, goal('home', 5, 1, 'P1'));
    const line = football.footballStats(s, 0).players.find((p) => p.id === 'p1')!;
    assert.equal('goals' in line, false);
    assert.equal(line.shots, 1);
  });
});

const H: Player[] = [
  { id: 'hgk', fullName: 'Home Keeper', jerseyNo: 1, sports: ['football'] },
  { id: 'h9', fullName: 'Home Nine', jerseyNo: 9, sports: ['football'] },
  { id: 'h4', fullName: 'Home Four', sports: ['football'] },
];
const A: Player[] = [
  { id: 'agk', fullName: 'Away Keeper', jerseyNo: 1, sports: ['football'] },
  { id: 'a7', fullName: 'Away Seven', jerseyNo: 7, sports: ['football'] },
];
const xi = (team: Side, gk: Player, players: Player[]): ScoreAction =>
  ({ type: 'XI', payload: { team, gk: { id: gk.id, name: gk.fullName }, players: players.map((p) => ({ id: p.id, name: p.fullName })), keepers: [{ id: gk.id, name: gk.fullName }] } });

describe('SD-56 · shirt-number column', () => {
  test('rows carry the squad number; the table shows the # column only when some row has one', () => {
    const s = run(KO(), xi('home', H[0], H), xi('away', A[0], A), goal('home', 10, 1, 'Home Nine'));
    const t = buildBoxTable(STAT_SCHEMAS.football, footballBox(s, { homeRoster: H, awayRoster: A, now: 2 }).data('all'));
    assert.equal(t.numbers, true);
    assert.deepEqual(t.home.rows.map((r) => [r.name, r.number]), [['Home Keeper', 1], ['Home Nine', 9], ['Home Four', undefined]]);
    const none = buildBoxTable(STAT_SCHEMAS.football, footballBox(s, { now: 2 }).data('all'));
    assert.equal(none.numbers, undefined);
  });
});

describe('SD-80 · own goals', () => {
  const s = run(KO(), xi('home', H[0], H), xi('away', A[0], A), og('away', 12, 1, 'Home Four', 'h4'), NEXT, END);
  test('the OG counts for the opponent; the player gets ownGoals, never a goal', () => {
    assert.deepEqual([s.home, s.away], [0, 1]);
    const t = footballStatTotals(s);
    assert.equal(t.h4.stats.ownGoals, 1);
    assert.equal(t.h4.stats.goals, undefined);
    assert.equal(t.h4.side, 'home');
    assert.equal(t.hgk.stats.goalsConceded, 1);
  });
  test('box: an OG column on the player\'s own side, only when the match had one', () => {
    const t = buildBoxTable(STAT_SCHEMAS.football, footballBox(s, { homeRoster: H, awayRoster: A, now: 4 }).data('all'));
    const og = t.columns.findIndex((c) => c.abbr === 'OG');
    assert.ok(og >= 0);
    const four = t.home.rows.find((r) => r.name === 'Home Four')!;
    assert.equal(four.cells[og], '1');
    assert.equal(four.cells[t.columns.findIndex((c) => c.abbr === 'G')], '0');
    assert.equal(t.home.totals[og], '1');
    const clean = buildBoxTable(STAT_SCHEMAS.football, footballBox(run(KO(), xi('home', H[0], H), goal('home', 3, 1, 'Home Nine')), { homeRoster: H, now: 4 }).data('all'));
    assert.ok(!clean.columns.some((c) => c.abbr === 'OG' || c.abbr === 'SO'));
    assert.ok(!clean.hidden.includes('Own goals')); // occasional: not "untracked"
  });
});

describe('SD-80 · shootout takers and keepers', () => {
  const level = () => run(KO({ decider: 'penalties' }), xi('home', H[0], H), xi('away', A[0], A), NEXT, END, { type: 'START_SHOOTOUT', payload: { first: 'home' } });
  const pen = (side: Side, outcome: 'scored' | 'saved' | 'missed', taker?: Player, keeper?: Player): ScoreAction =>
    ({ type: 'PEN', side, payload: { scored: outcome === 'scored', outcome, ...(taker ? { takerId: taker.id, takerName: taker.fullName } : {}), ...(keeper ? { keeperId: keeper.id, keeperName: keeper.fullName } : {}) } });
  const shootout = () => run(level(),
    pen('home', 'scored', H[1], A[0]), pen('away', 'saved', A[1], H[0]),
    pen('home', 'missed', H[2], A[0]), pen('away', 'scored', A[0], H[0]),
    pen('home', 'scored', H[0], A[0]), pen('away', 'saved', A[1], H[0]),
    pen('home', 'scored', H[1], A[0]), pen('away', 'missed', A[1], H[0]),
  );
  test('each kick is recorded with taker, outcome and keeper; the dots are unchanged', () => {
    const s = shootout();
    assert.deepEqual(s.shootout!.home, [true, false, true, true]);
    assert.deepEqual(s.shootout!.away, [false, true, false, false]);
    assert.equal(s.shootoutWinner, 'home');
    assert.equal(s.shootout!.kicks!.length, 8);
    assert.deepEqual(s.shootout!.kicks![1], { side: 'away', scored: false, outcome: 'saved', takerId: 'a7', takerName: 'Away Seven', keeperId: 'hgk', keeperName: 'Home Keeper' });
    assert.equal(football.kickText(s.shootout!.kicks![1]), 'Away Seven ✗ saved (Home Keeper)');
    assert.equal(football.kickText(s.shootout!.kicks![2]), 'Home Four ✗ missed');
  });
  test('statTotals: penKicksTaken / penKicksScored / shootoutSaves, apart from goals and saves; keyed', () => {
    const t = footballStatTotals(shootout());
    assert.deepEqual([t.h9.stats.penKicksTaken, t.h9.stats.penKicksScored], [2, 2]);
    assert.deepEqual([t.h4.stats.penKicksTaken, t.h4.stats.penKicksScored], [1, 0]);
    assert.equal(t.hgk.stats.shootoutSaves, 2);
    assert.equal(t.agk.stats.shootoutSaves, 0); // faced kicks, saved none (0 is tracked)
    assert.deepEqual([t.agk.stats.penKicksTaken, t.agk.stats.penKicksScored], [1, 1]);
    assert.equal(t.h9.stats.goals, undefined);
    assert.equal(t.hgk.stats.saves, undefined);
    for (const k of SHOOTOUT_KEYS) assert.ok((FOOTBALL_DERIVED_KEYS as readonly string[]).includes(k));
    // keyed coverage: a line without the key didn't take part ("not tracked", never a false 0)
    const line = (stats: Record<string, number>) => ({ id: 'l', playerId: 'p', sport: 'football', stats }) as never;
    assert.equal(trackedIn(STAT_SCHEMAS.football, line({ goals: 1 }), 'penKicksTaken'), false);
    assert.equal(trackedIn(STAT_SCHEMAS.football, line({ penKicksTaken: 1, penKicksScored: 0 }), 'penKicksScored'), true);
  });
  test('the statTotals contract holds through the shootout (every prefix)', () => {
    const sp: TotalsSport<football.FootballState> = { name: 'football', init: football.init, reducer: football.reducer, statTotals: footballStatTotals, partial: true, derived: FOOTBALL_DERIVED_KEYS, config: { decider: 'penalties' } };
    const acts: ScoreAction[] = [{ type: 'KICKOFF', payload: { at: 1, ord: true } }, xi('home', H[0], H), xi('away', A[0], A), NEXT, END, { type: 'START_SHOOTOUT', payload: { first: 'home' } },
      pen('home', 'scored', H[1], A[0]), pen('away', 'saved', A[1], H[0]), pen('home', 'missed', H[2], A[0])];
    assertContract(sp, toRecords(acts), { every: 1 });
  });
  test('box: SO (scored-taken) and SOS columns on the Overall view; the kick list as notes', () => {
    const s = shootout();
    const src = footballBox(s, { homeRoster: H, awayRoster: A, now: 9, homeName: 'Home', awayName: 'Away' });
    const t = buildBoxTable(STAT_SCHEMAS.football, src.data('all'), { scope: 'all' });
    const so = t.columns.findIndex((c) => c.abbr === 'SO');
    const sv = t.columns.findIndex((c) => c.abbr === 'SOS');
    assert.equal(t.home.rows.find((r) => r.name === 'Home Nine')!.cells[so], '2-2');
    assert.equal(t.home.rows.find((r) => r.name === 'Home Keeper')!.cells[sv], '2');
    assert.equal(t.home.totals[so], '3-4');
    assert.deepEqual(src.notes!(), [
      'Shootout · Home: Home Nine ✓, Home Four ✗ missed, Home Keeper ✓, Home Nine ✓',
      'Shootout · Away: Away Seven ✗ saved (Home Keeper), Away Keeper ✓, Away Seven ✗ saved (Home Keeper), Away Seven ✗ missed',
    ]);
    const half = buildBoxTable(STAT_SCHEMAS.football, src.data(1), { scope: 1 });
    assert.ok(!half.columns.some((c) => c.abbr === 'SO'));
  });
  test('a kick without a taker still keeps the list aligned; earlier undetailed kicks are backfilled in order', () => {
    const s = run(level(), { type: 'PEN', side: 'home', payload: { scored: true } }, { type: 'PEN', side: 'away', payload: { scored: false } },
      pen('home', 'saved', H[1]));
    assert.deepEqual(s.shootout!.kicks!.map((k) => [k.side, k.scored, k.outcome]), [['home', true, undefined], ['away', false, undefined], ['home', false, 'saved']]);
    const away1st = football.backfillKicks({ home: [true, false], away: [true], first: 'away' });
    assert.deepEqual(away1st.map((k) => k.side), ['away', 'home', 'home']);
  });
  test('legacy: an old shootout (scored only) replays to exactly the frozen engine\'s state — no kicks key', () => {
    const acts: ScoreAction[] = [{ type: 'KICKOFF', payload: { at: 1 } }, { type: 'GOAL', side: 'home', payload: { minute: 10 } }, { type: 'GOAL', side: 'away', payload: { minute: 30 } },
      NEXT, END, { type: 'START_SHOOTOUT' }, { type: 'PEN', side: 'home', payload: { scored: true } }, { type: 'PEN', side: 'away', payload: { scored: false } },
      { type: 'PEN', side: 'home', payload: { scored: true } }];
    const cfg = { decider: 'penalties' };
    const now = acts.reduce(football.reducer, football.init(cfg));
    const old = acts.reduce(legacyReducer, legacyInit(cfg));
    assert.deepEqual(now, old);
    assert.equal('kicks' in now.shootout!, false);
  });
});

/* -------------------------------- SD-70 --------------------------------- */

const team = (id: string) => ({ id, name: id.toUpperCase(), colorHex: '#000' }) as Match['homeTeam'];
let day = 1;
const card = (type: 'yellow' | 'red', side: Side, name: string, extra: Record<string, unknown> = {}) => ({ id: day * 100 + Math.random(), minute: 10, type, side, playerName: name, playerId: name.toLowerCase(), ...extra });
const fx = (home: string, away: string, events: unknown[] = [], o: Partial<DisciplineMatch> = {}): DisciplineMatch => ({
  id: `m${day}`, sport: 'football', status: 'completed', startsAt: `2026-11-${String(day++).padStart(2, '0')}T10:00:00Z`,
  homeTeam: team(home), awayTeam: team(away), state: { events }, ...o,
});

describe('SD-70 · discipline rule', () => {
  test('defaults: red 1 match, 2 yellows = 1 match, never reset; organiser keys override', () => {
    assert.deepEqual(readDisciplineRule(undefined), { banRed: 1, banYellows: 2, yellowReset: 'never' });
    assert.deepEqual(readDisciplineRule({ banRed: 2, banYellows: 0, yellowReset: 'groups' }), { banRed: 2, banYellows: 0, yellowReset: 'groups' });
    assert.equal(disciplineRuleText(readDisciplineRule({ yellowReset: 'qf' })), 'Red card = 1 match out · 2 yellow cards = 1 match out · yellows wiped after the quarter-finals');
  });

  test('2 yellows in different matches → suspended for the next match, served by one match', () => {
    day = 1;
    const ms = [fx('a', 'b', [card('yellow', 'home', 'Ravi')]), fx('a', 'c', [card('yellow', 'home', 'Ravi')])];
    const next = fx('a', 'd', [], { status: 'scheduled' });
    const later = fx('d', 'a', [], { status: 'scheduled' });
    const all = [...ms, next, later];
    let t = disciplineTable(all);
    assert.deepEqual(t.rows.map((r) => [r.name, r.yellows, r.suspended, r.banReason]), [['Ravi', 2, true, '2 yellow cards']]);
    assert.deepEqual(suspensionsFor(next, all).home.map((x) => [x.name, x.reason]), [['Ravi', '2 yellow cards']]);
    // the earlier unplayed fixture serves it first → not suspended for the one after
    assert.deepEqual(suspensionsFor(later, all).away, []);
    // once the next match is played, the ban is served
    const played = [...ms, { ...next, status: 'completed' as const }, later];
    t = disciplineTable(played);
    assert.equal(t.rows[0].suspended, false);
    assert.equal(t.rows[0].yellowsTowardBan, 0);
    assert.deepEqual(suspensionsFor(later, played).away, []);
  });

  test('a second-yellow red = 1 match and its yellows don\'t accumulate; a direct red = banRed', () => {
    day = 1;
    const ms = [
      fx('a', 'b', [card('yellow', 'home', 'Ravi'), card('yellow', 'home', 'Ravi'), card('red', 'home', 'Ravi', { secondYellow: true }), card('red', 'away', 'Dev')]),
    ];
    const n1 = fx('a', 'b', [], { status: 'scheduled' });
    const n2 = fx('b', 'a', [], { status: 'scheduled' });
    const fmt = { banRed: 2 };
    const t = disciplineTable([...ms, n1, n2], fmt);
    const ravi = t.rows.find((r) => r.name === 'Ravi')!;
    assert.deepEqual([ravi.yellows, ravi.secondYellows, ravi.reds, ravi.banLeft, ravi.yellowsTowardBan, ravi.banReason], [2, 1, 0, 1, 0, 'second yellow']);
    const dev = t.rows.find((r) => r.name === 'Dev')!;
    assert.deepEqual([dev.reds, dev.banLeft, dev.banReason], [1, 2, 'red card']);
    const s1 = suspensionsFor(n1, [...ms, n1, n2], fmt);
    assert.deepEqual([s1.home.map((x) => x.name), s1.away.map((x) => x.name)], [['Ravi'], ['Dev']]);
    const s2 = suspensionsFor(n2, [...ms, n1, n2], fmt);
    assert.deepEqual([s2.home.map((x) => x.name), s2.away.map((x) => x.name)], [['Dev'], []]); // Dev's 2nd match
    assert.deepEqual(t.teams.map((x) => [x.teamName, x.yellows, x.reds]), [['A', 2, 1], ['B', 0, 1]]);
  });

  test('yellows wiped when the knockouts start (pending bans survive); off = no accumulation', () => {
    day = 1;
    const ms = [fx('a', 'b', [card('yellow', 'home', 'Ravi')], { stage: 'group' }), fx('a', 'c', [card('yellow', 'home', 'Ravi')], { stage: 'qf' })];
    assert.equal(disciplineTable(ms, { yellowReset: 'groups' }).rows[0].suspended, false);
    assert.equal(disciplineTable(ms, { yellowReset: 'qf' }).rows[0].suspended, true);
    assert.equal(disciplineTable(ms, { banYellows: 0 }).rows[0].suspended, false);
  });

  test('team officials are listed apart and never suspend anyone; names-only logs join their id', () => {
    day = 1;
    const ms = [
      fx('a', 'b', [card('yellow', 'home', 'Coach K', { official: true, playerId: undefined }), { id: 1, minute: 5, type: 'yellow', side: 'home', playerName: 'Ravi' }]),
      fx('a', 'c', [card('yellow', 'home', 'Ravi')]),
    ];
    const t = disciplineTable(ms);
    assert.deepEqual(t.officials, [{ teamId: 'a', teamName: 'A', name: 'Coach K', yellows: 1, reds: 0 }]);
    assert.deepEqual(t.rows.map((r) => [r.name, r.playerId, r.yellows, r.suspended]), [['Ravi', 'ravi', 2, true]]);
  });

  test('isSuspended matches by id, else by name; other sports / played matches have none', () => {
    const list = [{ playerId: 'ravi', name: 'Ravi', teamId: 'a', reason: 'red card' }, { name: 'Old Name', teamId: 'a', reason: 'red card' }];
    assert.ok(isSuspended(list, { id: 'ravi', fullName: 'Someone' }));
    assert.ok(isSuspended(list, { id: 'zz', fullName: 'Old Name' }));
    assert.equal(isSuspended(list, { id: 'zz', fullName: 'Ravi' }), undefined);
    day = 1;
    const m = fx('a', 'b');
    assert.deepEqual(suspensionsFor(m, [m]), { home: [], away: [] });
    assert.deepEqual(suspensionsFor({ ...m, status: 'scheduled', sport: 'hockey' }, [m]), { home: [], away: [] });
  });
});
