/**
 * SD-31 / SD-40 / SD-44 — basketball shooting depth: missed field goals
 * ("Miss 2" / "Miss 3", optional "Track missed shots"), FG / 3P made-attempted
 * and % with D8 coverage, OREB / DREB, FIBA EFF with missed FG, the FIBA box
 * columns + team fouls per period, absolute statTotals (SD-19 contract), the
 * career's FG% / 3P% / EFF per game, leaders, voice, and legacy replay identity.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Match, Player, SportId, StatLine, Team } from '../src/core/types.ts';
import type { ScoreAction } from '../src/sports/types.ts';
import { init, reducer, teamFoulsByPeriod, type BasketballState } from '../src/sports/basketball/engine.ts';
import { creditAttribution, eventCredits, ftCredits, makeCredits, missCredits, reboundCredits } from '../src/sports/basketball/credits.ts';
import { basketballBoxTotals, basketballStatTotals, shotsTracked } from '../src/sports/basketball/totals.ts';
import { basketballTotals } from '../src/sports/basketball/fieldTime.ts';
import { basketballBox } from '../src/sports/boxSources.ts';
import { buildBoxTable, comparisonRows, boxLayout } from '../src/sports/boxScore.ts';
import { STAT_SCHEMAS, statSchema } from '../src/sports/statSchemas.ts';
import { aggregateValue, statDefIn } from '../src/sports/statSchema.ts';
import { careerSections } from '../src/data/career.ts';
import { categoryLeaders } from '../src/data/standings.ts';
import { rankAwardCandidates } from '../src/data/ratings.ts';
import { basketballVoice } from '../src/sports/voiceParsers.ts';
import { legacyInit, legacyReducer } from './basketballLegacyReducer.mts';
import { assertContract, assertSameAsClean, toRecords, type TotalsSport } from './statTotalsHarness.mts';

type Side = 'home' | 'away';
const SCHEMA = STAT_SCHEMAS.basketball;
const P = (id: string, fullName: string): Player => ({ id, fullName, sports: [] } as Player);
const ARJUN = P('p-arjun', 'Arjun'), BEN = P('p-ben', 'Ben'), CHEN = P('p-chen', 'Chen');
const XAVI = P('p-xavi', 'Xavi'), YUSUF = P('p-yusuf', 'Yusuf');
const HOME = [ARJUN, BEN, CHEN], AWAY = [XAVI, YUSUF];

/* ---- the actions the controls dispatch (index.tsx), with credits.ts ---- */
const stamp = (q: number, m: number) => ({ quarter: q, minute: m });
const make = (side: Side, p: Player | undefined, pts: number, q = 1, m = 0, fga = true, halfCourt = false): ScoreAction =>
  ({ type: 'SCORE', side, payload: { points: pts, ...(fga ? { fga: true } : {}), ...(p ? { pid: p.id } : {}), ...stamp(q, m) }, attribution: p ? creditAttribution(p.id, p.fullName, makeCredits(pts, halfCourt, fga)) : undefined });
const miss = (side: Side, p: Player | undefined, pts: number, q = 1, m = 0): ScoreAction =>
  ({ type: 'MISS', side, payload: { points: pts, ...(p ? { pid: p.id } : {}), ...stamp(q, m) }, attribution: p ? creditAttribution(p.id, p.fullName, missCredits(pts)) : undefined });
const ft = (side: Side, p: Player, made: boolean, q = 1): ScoreAction =>
  ({ type: 'FREE_THROW', side, payload: { made, pid: p.id, ...stamp(q, 0) }, attribution: creditAttribution(p.id, p.fullName, ftCredits(made)) });
const reb = (side: Side, p: Player, rt?: 'off' | 'def', q = 1): ScoreAction =>
  ({ type: 'REBOUND', side, payload: { ...(rt ? { reboundType: rt } : {}), pid: p.id, ...stamp(q, 0) }, attribution: creditAttribution(p.id, p.fullName, reboundCredits(rt)) });
const simple = (type: string, stat: string) => (side: Side, p: Player, q = 1): ScoreAction =>
  ({ type, side, payload: { pid: p.id, ...stamp(q, 0) }, attribution: { playerId: p.id, stat, playerName: p.fullName } });
const ast = simple('ASSIST', 'assists'), stl = simple('STEAL', 'steals'), blk = simple('BLOCK', 'blocks'), tov = simple('TURNOVER', 'turnovers');
const foul = (side: Side, p: Player, q = 1, foulType = 'personal'): ScoreAction =>
  ({ type: 'FOUL', side, payload: { foulType, pid: p.id, ...stamp(q, 0) }, attribution: { playerId: p.id, stat: 'fouls', playerName: p.fullName } });
/** The timeline's Remove: reverse exactly what the play credited. */
const remove = (s: BasketballState, id: number): ScoreAction => {
  const e = s.events.find((x) => x.id === id)!;
  const pid = e.playerName ? s.ids?.[e.playerName] : undefined;
  return { type: 'REMOVE_EVENT', side: e.side, payload: { id }, attribution: pid ? creditAttribution(pid, e.playerName, eventCredits(e, s.targetPoints > 0, shotsTracked(s)), -1) : undefined };
};
const run = (s: BasketballState, ...as: ScoreAction[]) => as.reduce(reducer, s);
const TRACK = { periodMinutes: 10, regPeriods: 4, trackMisses: true, foulsForBonus: 4, techIsTeamFoul: true };

/** A tracked game: Arjun 3/7 FG (1/3 from three), 2/3 FT, Ben a big man, Xavi for the away side. */
function trackedGame(): ScoreAction[] {
  return [
    { type: 'KICKOFF', payload: { at: 1 } },
    make('home', ARJUN, 3, 1, 1), miss('home', ARJUN, 3, 1, 2), miss('home', ARJUN, 2, 1, 2), reb('home', BEN, 'off'),
    make('home', BEN, 2, 1, 3), ast('home', ARJUN), make('away', XAVI, 2, 1, 4), miss('home', ARJUN, 3, 1, 5),
    reb('away', YUSUF, 'def'), foul('home', CHEN), foul('home', CHEN, 1, 'shooting'), ft('away', XAVI, true), ft('away', XAVI, false),
    { type: 'NEXT_QUARTER' },
    make('home', ARJUN, 2, 2, 1), make('home', ARJUN, 2, 2, 2), miss('home', ARJUN, 2, 2, 3), reb('home', CHEN, 'def', 2),
    ft('home', ARJUN, true, 2), ft('home', ARJUN, true, 2), ft('home', ARJUN, false, 2), stl('away', YUSUF, 2), tov('home', BEN, 2),
    blk('home', CHEN, 2), make('home', undefined, 2, 2, 5), miss('away', undefined, 3, 2, 6), reb('home', BEN, undefined, 2),
    foul('away', XAVI, 2), foul('away', YUSUF, 2, 'technical'),
  ];
}

/* ------------------------------ 1 · capture ------------------------------ */

describe('SD-31 · missed field goals', () => {
  test('a miss is logged, the score does not move', () => {
    const s = run(init(TRACK), { type: 'KICKOFF', payload: { at: 1 } }, miss('home', ARJUN, 3), miss('home', ARJUN, 2), make('home', ARJUN, 2));
    assert.equal(s.home, 2);
    assert.deepEqual(s.events.map((e) => [e.type, e.points]), [['miss', 3], ['miss', 2], ['score', 2]]);
    assert.equal(s.events[2].fga, true);
    assert.equal(s.trackMisses, true);
  });
  test('a fouled-out player cannot be credited a miss', () => {
    let s = run(init({ ...TRACK, foulsToFoulOut: 1 }), { type: 'KICKOFF', payload: { at: 1 } }, foul('home', ARJUN));
    s = run(s, miss('home', ARJUN, 2));
    assert.equal(s.events.filter((e) => e.type === 'miss').length, 0);
  });
  test('credits: makes / misses / FG vs FT / 3×3', () => {
    assert.deepEqual(makeCredits(3, false, true), { points: 3, fgMade: 1, fgAtt: 1, threesMade: 1, threesAtt: 1 });
    assert.deepEqual(makeCredits(2, false, false), { points: 2, fgMade: 1 }); // untracked: no attempt (D8)
    assert.deepEqual(makeCredits(1, false, true), { points: 1 }); // a full-court +1 is not a field goal
    assert.deepEqual(makeCredits(1, true, true), { points: 1, fgMade: 1, fgAtt: 1 }); // 3×3 one-pointer
    assert.deepEqual(missCredits(3), { fgMissed: 1, fgAtt: 1, threesAtt: 1 });
    assert.deepEqual(reboundCredits('off'), { rebounds: 1, oreb: 1 });
    assert.deepEqual(reboundCredits(), { rebounds: 1 });
  });
  test('the player id rides in pid → state ids (newer logs only)', () => {
    const s = run(init(TRACK), { type: 'KICKOFF', payload: { at: 1 } }, make('home', ARJUN, 2));
    assert.deepEqual(s.ids, { Arjun: 'p-arjun' });
  });
  test('coverage: a match tracks misses by its config, or by any miss / fga play', () => {
    assert.equal(shotsTracked(init({})), false);
    assert.equal(shotsTracked(init({ trackMisses: true })), true);
    assert.equal(shotsTracked(run(init({}), { type: 'KICKOFF', payload: { at: 1 } }, miss('home', ARJUN, 2))), true);
  });
});

/* ------------------------------ 2 · box score ------------------------------ */

const cellOf = (t: ReturnType<typeof buildBoxTable>, side: Side, name: string, abbr: string) =>
  t[side].rows.find((r) => r.name === name)?.cells[t.columns.findIndex((c) => c.abbr === abbr)];
const totalOf = (t: ReturnType<typeof buildBoxTable>, side: Side, abbr: string) => t[side].totals[t.columns.findIndex((c) => c.abbr === abbr)];

describe('SD-40 · the FIBA box score', () => {
  const s = run(init(TRACK), ...trackedGame());
  const src = basketballBox(s, { homeRoster: HOME, awayRoster: AWAY, homeName: 'Reds', awayName: 'Blues' });
  const t = buildBoxTable(SCHEMA, src.data('all'));
  test('columns: M-A pairs, %, OREB / DREB, EFF (no five set → no MIN / +/-)', () => {
    assert.deepEqual(t.columns.map((c) => c.abbr), ['PTS', 'FGM-A', 'FG%', '3PM-A', '3P%', 'FTM-A', 'FT%', 'OREB', 'DREB', 'REB', 'AST', 'STL', 'BLK', 'TO', 'PF', 'EFF']);
  });
  test('Arjun: 3-7 FG, 1-3 3P, 2-3 FT, 43% / 33% / 67%', () => {
    assert.equal(cellOf(t, 'home', 'Arjun', 'PTS'), '9');
    assert.equal(cellOf(t, 'home', 'Arjun', 'FGM-A'), '3-7');
    assert.equal(cellOf(t, 'home', 'Arjun', 'FG%'), '43%');
    assert.equal(cellOf(t, 'home', 'Arjun', '3PM-A'), '1-3');
    assert.equal(cellOf(t, 'home', 'Arjun', '3P%'), '33%');
    assert.equal(cellOf(t, 'home', 'Arjun', 'FTM-A'), '2-3');
    assert.equal(cellOf(t, 'home', 'Arjun', 'FT%'), '67%');
  });
  test('EFF = PTS + REB + AST + STL + BLK − missed FG − missed FT − TO', () => {
    // Arjun: 9 + 0 + 1 + 0 + 0 − 4 missed FG − 1 missed FT − 0 TO = 5
    assert.equal(cellOf(t, 'home', 'Arjun', 'EFF'), '5');
    // Ben: 2 PTS + 2 REB − 1 TO = 3
    assert.equal(cellOf(t, 'home', 'Ben', 'EFF'), '3');
  });
  test('OREB / DREB split; an untyped rebound still counts in REB', () => {
    assert.deepEqual(['OREB', 'DREB', 'REB'].map((a) => cellOf(t, 'home', 'Ben', a)), ['1', '0', '2']);
    assert.deepEqual(['OREB', 'DREB', 'REB'].map((a) => cellOf(t, 'home', 'Chen', a)), ['0', '1', '1']);
  });
  test('totals: team row counts its make / miss; pairs and % recomputed over the side', () => {
    assert.equal(totalOf(t, 'home', 'PTS'), String(s.home));
    assert.equal(totalOf(t, 'home', 'FGM-A'), '5-9'); // Arjun 3-7, Ben 1-1, team 1-1
    assert.equal(totalOf(t, 'home', 'FG%'), '56%');
    assert.equal(totalOf(t, 'away', 'FGM-A'), '1-2'); // Xavi 1-1 + a team miss
    assert.equal(totalOf(t, 'away', '3PM-A'), '0-1');
  });
  test('team fouls per period (FIBA technicals count) under the tables', () => {
    assert.deepEqual(teamFoulsByPeriod(s, 'home'), [2, 0]);
    assert.deepEqual(teamFoulsByPeriod(s, 'away'), [0, 2]);
    assert.deepEqual(src.notes?.(), ['Team fouls (Reds–Blues): Q1 2–0 · Q2 0–2']);
  });
  test('comparison has FG% and 3P% when tracked', () => {
    const c = comparisonRows(SCHEMA, src.data('all'));
    assert.deepEqual(c.rows.filter((r) => r.key === 'fgPct' || r.key === 'threePct').map((r) => [r.label, r.home, r.away]),
      [['Field goal %', '56%', '50%'], ['3-point %', '33%', '0%']]);
  });
  test('per period: the pairs re-tally (Q2: Arjun 2-3)', () => {
    const q2 = buildBoxTable(SCHEMA, src.data(2), { scope: 2 });
    assert.equal(cellOf(q2, 'home', 'Arjun', 'FGM-A'), '2-3');
  });
  test('D8: an untracked match hides FGM-A / FG% / 3PM-A / 3P% and says so', () => {
    const u = run(init({ periodMinutes: 10 }), { type: 'KICKOFF', payload: { at: 1 } }, make('home', ARJUN, 3, 1, 1, false), make('home', ARJUN, 2, 1, 2, false), ft('home', ARJUN, true));
    const usrc = basketballBox(u, { homeRoster: HOME, awayRoster: AWAY });
    const ut = buildBoxTable(SCHEMA, usrc.data('all'));
    assert.deepEqual(ut.columns.map((c) => c.abbr), ['PTS', 'FTM-A', 'FT%', 'REB', 'AST', 'STL', 'BLK', 'TO', 'PF', 'EFF']);
    assert.ok(ut.hidden.includes('Field goal %') && ut.hidden.includes('Field goals made-attempted'));
    assert.deepEqual(comparisonRows(SCHEMA, usrc.data('all')).untracked, ['Field goal %', '3-point %']);
    assert.equal(cellOf(ut, 'home', 'Arjun', 'EFF'), '6'); // no misses guessed
  });
  test('375 px: the wider box pins names and scrolls the numbers inside its card', () => {
    const l = boxLayout(t, 317);
    assert.equal(l.sticky, true);
    assert.ok(l.nameWidth + 40 <= 317 && l.numbersWidth > 317 - l.nameWidth);
  });
});

/* ------------------------------ 3 · statTotals ------------------------------ */

const SP: TotalsSport<BasketballState> = {
  name: 'basketball', init, reducer, statTotals: basketballStatTotals, partial: true, config: TRACK,
  derived: ['minutes', 'plusMinus'], signed: ['plusMinus'],
};

describe('SD-40 · basketball statTotals (SD-19 contract)', () => {
  test('a tracked game: totals = live credits, on the full log and every undo prefix', () => {
    const t = assertContract(SP, toRecords(trackedGame()));
    assert.deepEqual(
      Object.fromEntries(['points', 'fgMade', 'fgAtt', 'threesMade', 'threesAtt', 'fgMissed', 'freeThrowsMade', 'freeThrowsAtt', 'oreb', 'dreb', 'rebounds'].map((k) => [k, t['p-arjun'].stats[k]])),
      { points: 9, fgMade: 3, fgAtt: 7, threesMade: 1, threesAtt: 3, fgMissed: 4, freeThrowsMade: 2, freeThrowsAtt: 3, oreb: 0, dreb: 0, rebounds: 0 });
    assert.equal(t['p-ben'].stats.oreb, 1);
    assert.equal(t['p-yusuf'].side, 'away');
  });
  test('with the five set: MIN / +/- merged in (mergeTotals)', () => {
    const five: ScoreAction[] = [
      { type: 'SET_LINEUP', payload: { home: ['Arjun', 'Ben', 'Chen'], ids: { Arjun: 'p-arjun', Ben: 'p-ben', Chen: 'p-chen' } } },
      { type: 'SET_LINEUP', payload: { away: ['Xavi', 'Yusuf'], ids: { Xavi: 'p-xavi', Yusuf: 'p-yusuf' } } },
    ];
    const recs = toRecords([...five, ...trackedGame(), { type: 'END' }]);
    const t = assertContract(SP, recs, { every: 4 });
    assert.equal(typeof t['p-arjun'].stats.minutes, 'number');
    assert.equal(typeof t['p-arjun'].stats.plusMinus, 'number');
    assert.equal(t['p-arjun'].stats.fgAtt, 7);
  });
  test('a removed play: the corrected log = the same match scored cleanly', () => {
    const base = trackedGame();
    const s = run(init(TRACK), ...base);
    const missId = s.events.find((e) => e.type === 'miss' && e.points === 3)!.id;
    const corrected = [...base, remove(s, missId)];
    const clean = base.filter((_, i) => i !== base.findIndex((a) => a.type === 'MISS' && a.payload?.points === 3));
    assertSameAsClean(SP, toRecords(corrected), toRecords(clean), 'remove a missed 3');
    assert.equal(basketballStatTotals(run(init(TRACK), ...corrected))['p-arjun'].stats.threesAtt, 2);
  });
  test('an untracked game owns no FGA / 3PA (never a false 0 attempts)', () => {
    const sp = { ...SP, config: { periodMinutes: 10 } };
    const acts: ScoreAction[] = [{ type: 'KICKOFF', payload: { at: 1 } }, make('home', ARJUN, 3, 1, 1, false), reb('home', BEN, 'def'), ft('home', ARJUN, false)];
    const t = assertContract(sp, toRecords(acts));
    assert.equal('fgAtt' in t['p-arjun'].stats, false);
    assert.equal(t['p-arjun'].stats.threesMade, 1);
  });
  test('an older log (names without ids) keeps the box keys on increments: only SD-29 figures', () => {
    const old: ScoreAction[] = [
      { type: 'KICKOFF', payload: { at: 1 } },
      { type: 'SCORE', side: 'home', payload: { points: 2 }, attribution: { playerId: 'p-arjun', stat: 'points', by: 2, playerName: 'Arjun' } },
    ];
    const s = run(init({}), ...old);
    assert.deepEqual(basketballBoxTotals(s), {});
    assert.deepEqual(basketballStatTotals(s), basketballTotals(s));
  });
});

/* ------------------------------ 4 · career + leaders ------------------------------ */

let mseq = 0;
const team = (id: string, name: string): Team => ({ id, name, shortName: name.slice(0, 3), sport: 'basketball' } as Team);
const M = (): Match => ({ id: `m${++mseq}`, sport: 'basketball', status: 'completed', startsAt: `2026-05-0${mseq}T10:00:00Z`, homeTeam: team('h', 'Reds'), awayTeam: team('a', 'Blues'), state: {} } as Match);
let lseq = 0;
const L = (stats: Record<string, number>, playerId = 'p1', matchId = M().id): StatLine =>
  ({ id: `l${++lseq}`, matchId, playerId, sport: 'basketball' as SportId, stats, won: true, result: 'W', opponent: 'Blues' } as StatLine);
const rowsOf = (lines: StatLine[]) =>
  Object.fromEntries(careerSections(statSchema('basketball')!, lines).map((s) => [s.id, Object.fromEntries(s.rows.map((r) => [r.label, r.value]))]));

describe('SD-44 · the career', () => {
  const tracked1 = L({ points: 20, rebounds: 5, assists: 2, steals: 1, blocks: 0, turnovers: 2, fouls: 1, freeThrowsMade: 4, freeThrowsAtt: 5, fgMade: 7, fgAtt: 15, threesMade: 2, threesAtt: 6, fgMissed: 8 });
  const tracked2 = L({ points: 12, rebounds: 3, assists: 4, steals: 0, blocks: 1, turnovers: 1, fouls: 2, freeThrowsMade: 2, freeThrowsAtt: 2, fgMade: 5, fgAtt: 10, threesMade: 0, threesAtt: 2, fgMissed: 5 });
  const untracked = L({ points: 30, rebounds: 2, assists: 1, steals: 0, blocks: 0, turnovers: 0, fouls: 0, freeThrowsMade: 0, freeThrowsAtt: 0, fgMade: 12, threesMade: 6, fgMissed: 0 });
  const legacy = L({ points: 10, rebounds: 1, assists: 0, steals: 0, blocks: 0, turnovers: 0, fouls: 0 });
  test('FG% / 3P% only over the games that tracked missed shots (D8)', () => {
    const c = rowsOf([tracked1, tracked2, untracked, legacy]);
    assert.equal(c.shooting['Field goals'], '12-25');
    assert.equal(c.shooting['Field goal %'], '48%');
    assert.equal(c.shooting['3-pointers'], '2-8');
    assert.equal(c.shooting['3-point %'], '25%');
    assert.equal(c.shooting['3-pointers made'], '8'); // made 3s count every game
    assert.equal(c.shooting['Free throw %'], '86%');
  });
  test('coverage note: "tracked in 2 of 4 games"', () => {
    const sec = careerSections(statSchema('basketball')!, [tracked1, tracked2, untracked, legacy]).find((s) => s.id === 'shooting')!;
    assert.deepEqual(sec.rows.find((r) => r.key === 'fgPct')?.coverage, { tracked: 2, total: 4 });
  });
  test('never tracked: no FG% row at all (not a false 100%)', () => {
    const c = rowsOf([untracked, legacy]);
    assert.equal(c.shooting?.['Field goal %'], undefined);
    assert.equal(c.shooting?.['Field goals'], undefined);
  });
  test('EFF per game counts missed FG where tracked; shooting career highs', () => {
    const c = rowsOf([tracked1, tracked2, untracked, legacy]);
    // EFF: t1 20+5+2+1+0−2−1−8 = 17; t2 12+3+4+0+1−1−0−5 = 14; u 30+2+1 = 33; legacy 11 → 75 / 4
    assert.equal(c.averages['Efficiency per game'], '18.8');
    assert.equal(c.bests['3-pointers'], '6');
    assert.equal(c.bests['Field goals made'], '12');
  });
  test('the EFF stat itself subtracts missed field goals', () => {
    const v = aggregateValue(SCHEMA, statDefIn(SCHEMA, 'eff')!, [tracked1]);
    assert.equal(v.value, 17);
  });
  test('leaders + Player of the Tournament: EFF/G with missed FG', () => {
    const players = [P('a', 'Asha'), P('b', 'Bala')];
    // Asha scores more but misses a lot; Bala is efficient
    const lines = [
      L({ points: 20, rebounds: 2, fgMade: 8, fgAtt: 24, fgMissed: 16 }, 'a', 'g1'), L({ points: 20, rebounds: 2, fgMade: 8, fgAtt: 24, fgMissed: 16 }, 'a', 'g2'),
      L({ points: 14, rebounds: 4, fgMade: 6, fgAtt: 8, fgMissed: 2 }, 'b', 'g1'), L({ points: 14, rebounds: 4, fgMade: 6, fgAtt: 8, fgMissed: 2 }, 'b', 'g2'),
    ];
    const eff = categoryLeaders(lines, players, 'basketball').find((c) => c.key === 'effPg');
    assert.deepEqual(eff?.leaders.map((e) => [e.name, e.display]), [['Bala', '16.0'], ['Asha', '6.0']]);
    assert.deepEqual(rankAwardCandidates(lines, players, 'basketball', 'mvp').map((c) => [c.name, c.value]), [['Bala', 16], ['Asha', 6]]);
  });
});

/* ------------------------------ 5 · voice ------------------------------ */

describe('SD-31 · voice', () => {
  const ctx = (s: BasketballState) => ({ state: s, homeName: 'Reds', awayName: 'Blues', homeRoster: HOME, awayRoster: AWAY });
  test('"miss three Arjun" → MISS 3 with the miss credits and pid', () => {
    const [a] = basketballVoice('miss three Arjun', ctx(init(TRACK)))!;
    assert.equal(a.type, 'MISS');
    assert.deepEqual(a.payload, { points: 3, pid: 'p-arjun' });
    assert.deepEqual(a.attribution, { playerId: 'p-arjun', stat: 'fgMissed', by: 1, playerName: 'Arjun', extra: { fgAtt: 1, threesAtt: 1 } });
    assert.equal(basketballVoice('missed two Xavi', ctx(init(TRACK)))![0].payload?.points, 2);
  });
  test('misses only while tracking; a missed free throw always', () => {
    assert.equal(basketballVoice('miss three Arjun', ctx(init({}))), null);
    const [f] = basketballVoice('missed free throw Arjun', ctx(init({})))!;
    assert.deepEqual([f.type, f.payload?.made, f.attribution?.stat], ['FREE_THROW', false, 'freeThrowsAtt']);
  });
  test('a spoken make while tracking counts the attempt', () => {
    const [a] = basketballVoice('three Arjun', ctx(init(TRACK)))!;
    assert.deepEqual(a.payload, { points: 3, fga: true, pid: 'p-arjun' });
    assert.deepEqual(a.attribution?.extra, { fgMade: 1, fgAtt: 1, threesMade: 1, threesAtt: 1 });
  });
});

/* ------------------------------ 6 · legacy identity ------------------------------ */

describe('D8 / Decision 8 · old logs replay identically', () => {
  test('an old log (no pid / fga / MISS, no trackMisses in config) = the frozen pre-SD-05 engine', () => {
    const at = (q: number) => ({ quarter: q, minute: 1 });
    const old: ScoreAction[] = [
      { type: 'KICKOFF', payload: { at: 1 } },
      { type: 'SCORE', side: 'home', payload: { points: 3, ...at(1) }, attribution: { playerId: 'p-arjun', stat: 'points', by: 3, playerName: 'Arjun' } },
      { type: 'REBOUND', side: 'away', payload: { reboundType: 'off', ...at(1) }, attribution: { playerId: 'p-xavi', stat: 'rebounds', playerName: 'Xavi' } },
      { type: 'FREE_THROW', side: 'home', payload: { made: false, ...at(1) }, attribution: { playerId: 'p-arjun', stat: 'freeThrowsAtt', by: 1, playerName: 'Arjun' } },
      { type: 'FOUL', side: 'away', payload: { foulType: 'personal', ...at(1) }, attribution: { playerId: 'p-xavi', stat: 'fouls', playerName: 'Xavi' } },
      { type: 'NEXT_QUARTER' },
      { type: 'REMOVE_EVENT', side: 'home', payload: { id: 1 } },
      { type: 'END' },
    ];
    for (const cfg of [undefined, {}, { foulsForBonus: 5, foulsToFoulOut: 5 }]) {
      assert.deepEqual(old.reduce(reducer, init(cfg)), old.reduce(legacyReducer as never, legacyInit(cfg) as never));
    }
  });
});
