/**
 * SD-23 (GEN-10) — the shared, schema-driven box score.
 *
 *  1. Golden: per sport, the shared model draws the same rows and values the
 *     bespoke component drew (tests/boxScoreLegacy.mts = the old tables), on
 *     real-shaped fixtures, for Overall and every period.
 *  2. Totals row, the team row (unattributed points), made-attempted pairs,
 *     percentages, signed +/-.
 *  3. Period filter: overall-only columns (MIN, +/-, GA) leave period views.
 *  4. D8: a column the match didn't track is hidden, never a column of zeros.
 *  5. Team comparison: football equals its old Stats panel; per-sport keys.
 *  6. Sticky layout model at 375 px.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Player } from '../src/core/types.ts';
import type { ScoreAction } from '../src/sports/types.ts';
import { STAT_SCHEMAS } from '../src/sports/statSchemas.ts';
import { validateSchema, type SportStatSchema } from '../src/sports/statSchema.ts';
import {
  buildBoxTable, comparisonRows, boxLayout, boxColumns, barShares, leaderOf, NAME_MIN,
  type BoxTable, type BoxData, type MatchBoxSource, type BoxScope,
} from '../src/sports/boxScore.ts';
import {
  basketballBox, volleyballBox, kabaddiBox, footballBox, tennisBox, badmintonBox, rallyBox, padelBox, carromBox, matchBoxSource,
} from '../src/sports/boxSources.ts';
import { init as bkInit, reducer as bkReducer, type BasketballState } from '../src/sports/basketball/engine.ts';
import { boxFieldByName } from '../src/sports/basketball/fieldTime.ts';
import { init as vbInit, reducer as vbReducer, outcomeAction, type VolleyballState } from '../src/sports/volleyball/engine.ts';
import { init as kbInit, reducer as kbReducer, raidActions, type KabaddiState, type RaidForm } from '../src/sports/kabaddi/engine.ts';
import { init as fbInit, reducer as fbReducer, footballStats, type FootballState } from '../src/sports/football/engine.ts';
import { makeRallyEngine } from '../src/sports/rallyEngine.ts';
import * as tennis from '../src/sports/tennis/engine.ts';
import * as padel from '../src/sports/padel/engine.ts';
import * as badminton from '../src/sports/badminton/engine.ts';
import * as carrom from '../src/sports/carrom/engine.ts';
import * as L from './racketLogs.mts';
import {
  legacyBasketball, legacyVolleyball, legacyKabaddi, legacyTennis, legacyBadminton, legacyPoint, type LegacyTable,
} from './boxScoreLegacy.mts';

type Side = 'home' | 'away';
const SIDES: Side[] = ['home', 'away'];
const P = (id: string, fullName: string): Player => ({ id, fullName } as Player);
const roster = (...names: string[]) => names.map((n) => P(n.toLowerCase(), n));
const scopes = (src: MatchBoxSource): BoxScope[] => ['all', ...src.periods.map((p) => p.value)];

/** The shared table equals the old one: same players in the same order, and
 *  every old column's cells (old header → new header via `rename`). */
function assertSame(legacy: LegacyTable, t: BoxTable, side: Side, rename: Record<string, string> = {}, msg = '') {
  const rows = t[side].rows.filter((r) => !r.team);
  assert.deepEqual(rows.map((r) => r.name), legacy.rows.map((r) => r[0]), `${msg} ${side}: players`);
  legacy.headers.forEach((h, i) => {
    const j = t.columns.findIndex((c) => c.abbr === (rename[h] ?? h));
    assert.ok(j >= 0, `${msg} ${side}: column ${h} missing (have ${t.columns.map((c) => c.abbr)})`);
    assert.deepEqual(rows.map((r) => r.cells[j]), legacy.rows.map((r) => r[i + 1]), `${msg} ${side}: ${h}`);
  });
}
const cell = (t: BoxTable, side: Side, name: string, abbr: string) => {
  const j = t.columns.findIndex((c) => c.abbr === abbr);
  return j < 0 ? undefined : t[side].rows.find((r) => r.name === name)?.cells[j];
};
const total = (t: BoxTable, side: Side, abbr: string) => t[side].totals[t.columns.findIndex((c) => c.abbr === abbr)];
const abbrs = (t: BoxTable) => t.columns.map((c) => c.abbr);

/* -------------------------------- fixtures --------------------------------- */

const bk = (s: BasketballState, ...as: ScoreAction[]) => as.reduce(bkReducer, s);
const act = (type: string, side: Side, name: string | undefined, quarter: number, minute: number, payload: Record<string, unknown> = {}): ScoreAction =>
  ({ type, side, payload: { quarter, minute, ...payload }, ...(name ? { attribution: { playerId: name.toLowerCase(), stat: 'x', playerName: name } } : null) });
const five = (side: Side, names: string[]): ScoreAction =>
  ({ type: 'SET_LINEUP', payload: { [side]: names, ids: Object.fromEntries(names.map((n) => [n, n.toLowerCase()])) } });
const BK_H = roster('H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7');
const BK_A = roster('A1', 'A2', 'A3', 'A4', 'A5', 'A6');
function basketballGame(withFive: boolean): BasketballState {
  return bk(bkInit({ periodMinutes: 10, regPeriods: 4 }),
    ...(withFive ? [five('home', ['H1', 'H2', 'H3', 'H4', 'H5']), five('away', ['A1', 'A2', 'A3', 'A4', 'A5'])] : []),
    act('SCORE', 'home', 'H1', 1, 1, { points: 2 }), act('ASSIST', 'home', 'H2', 1, 1),
    act('SCORE', 'away', 'A1', 1, 2, { points: 3 }), act('REBOUND', 'home', 'H3', 1, 2, { reboundType: 'def' }),
    act('FOUL', 'away', 'A2', 1, 3, { foulType: 'shooting' }),
    act('FREE_THROW', 'home', 'H1', 1, 3, { made: true }), act('FREE_THROW', 'home', 'H1', 1, 3, { made: false }),
    act('SUB', 'home', undefined, 1, 5, { offName: 'H5', onName: 'H6', offId: 'h5', onId: 'h6' }),
    act('SCORE', 'home', 'H6', 1, 6, { points: 3 }), act('STEAL', 'away', 'A3', 1, 7), act('TURNOVER', 'home', 'H2', 1, 7),
    { type: 'NEXT_QUARTER' },
    act('SCORE', 'away', 'A1', 2, 1, { points: 2 }), act('BLOCK', 'home', 'H4', 2, 2), act('SCORE', 'home', undefined, 2, 3, { points: 2 }),
    act('REBOUND', 'away', undefined, 2, 4), act('FREE_THROW', 'away', 'A1', 2, 5, { made: true }), act('FOUL', 'home', 'H1', 2, 5),
    { type: 'NEXT_QUARTER' }, act('SCORE', 'home', 'H7', 3, 2, { points: 2 }),
  );
}

const VB_H = [P('va', 'Asha'), P('vb', 'Bina'), P('vc', 'Chitra')];
const VB_A = [P('vx', 'Xena'), P('vy', 'Yami')];
const vbPlay = (acts: ScoreAction[], cfg = {}) => acts.reduce(vbReducer, vbInit(cfg));
function volleyballMatch(outcomes: boolean): VolleyballState {
  const [a, b, c] = VB_H; const [x, y] = VB_A;
  const acts: ScoreAction[] = [];
  // set 1 to 25-20, set 2 to 18-25, set 3 partial — kinds rotate
  const home = outcomes ? [outcomeAction('attack', 'home', a), outcomeAction('ace', 'home', b), outcomeAction('block', 'home', c), outcomeAction('opperror', 'home'), outcomeAction('attack', 'home')]
    : [{ type: 'POINT', side: 'home', attribution: { playerId: a.id, stat: 'points', playerName: a.fullName } }, { type: 'POINT', side: 'home', attribution: { playerId: b.id, stat: 'points', playerName: b.fullName } }] as ScoreAction[];
  const away = outcomes ? [outcomeAction('attack', 'away', x), outcomeAction('serveerror', 'away'), outcomeAction('ace', 'away', y), outcomeAction('block', 'away', x)]
    : [{ type: 'POINT', side: 'away', attribution: { playerId: x.id, stat: 'points', playerName: x.fullName } }] as ScoreAction[];
  const set = (h: number, w: number) => { for (let i = 0; i < Math.max(h, w); i++) { if (i < h) acts.push(home[(acts.length + i) % home.length]); if (i < w) acts.push(away[(acts.length + i) % away.length]); } };
  set(25, 20); set(18, 25); set(7, 4);
  return vbPlay(acts, { setsToWin: 3 });
}

const KB_H = [P('kr', 'Ravi'), P('kd', 'Dev'), P('ks', 'Sunil')];
const KB_A = [P('ka', 'Arjun'), P('kb', 'Bhanu')];
function kabaddiMatch(): KabaddiState {
  let s = kbInit({ playersPerSide: 7, style: 'sanjeevani', proRules: true });
  const raid = (f: Partial<RaidForm> & { side: Side }, minute: number, half: number) => {
    for (const a of raidActions(s, { touches: 0, bonus: false, tackled: false, ...f })) {
      s = kbReducer(s, a.type === 'REMOVE_EVENT' ? a : { ...a, payload: { ...a.payload, minute, half } });
    }
  };
  raid({ side: 'home', raider: KB_H[0], touches: 2 }, 2, 1);
  raid({ side: 'away', raider: KB_A[0], tackled: true, tackler: KB_H[1] }, 3, 1);
  raid({ side: 'home', raider: KB_H[2], touches: 1, bonus: true }, 5, 1);
  raid({ side: 'away', raider: KB_A[1], touches: 1 }, 8, 1);
  raid({ side: 'home', raider: KB_H[0] }, 9, 1); // empty raid
  s = kbReducer(s, { type: 'NEXT_HALF' });
  raid({ side: 'away', raider: KB_A[0], touches: 3 }, 21, 2);
  raid({ side: 'home', raider: KB_H[0], tackled: true, tackler: KB_A[1] }, 23, 2);
  raid({ side: 'home', touches: 1 }, 25, 2); // a raid nobody was named on
  return s;
}

const fb = (s: FootballState, ...as: ScoreAction[]) => as.reduce(fbReducer, s);
const pid = (id: string) => ({ id, name: id.toUpperCase() });
const FB_H = roster('HGK', 'H1', 'H2', 'H3', 'H4');
const FB_A = roster('AGK', 'A1', 'A2', 'A3');
const fbStat = (side: Side, kind: string, who: string | undefined, minute: number, half: 1 | 2, extra: Record<string, unknown> = {}): ScoreAction =>
  ({ type: 'STAT', side, payload: { kind, minute, half, ...extra }, ...(who ? { attribution: { playerId: who.toLowerCase(), stat: kind, playerName: who } } : null) });
function footballMatch(track: Record<string, boolean> = {}): FootballState {
  return fb(fbInit({ halfMinutes: 45, ...Object.fromEntries(Object.entries(track).map(([k, v]) => [`track${k[0].toUpperCase()}${k.slice(1)}`, v])) }),
    { type: 'KICKOFF', payload: { at: 1_000, ord: true } },
    { type: 'XI', payload: { team: 'home', gk: pid('hgk'), players: ['hgk', 'h1', 'h2', 'h3'].map(pid), keepers: [pid('hgk')] } },
    { type: 'XI', payload: { team: 'away', gk: pid('agk'), players: ['agk', 'a1', 'a2'].map(pid), keepers: [pid('agk')] } },
    fbStat('home', 'shot', 'H1', 5, 1, { onTarget: true }), fbStat('away', 'save', 'AGK', 5, 1),
    fbStat('home', 'shot', 'H2', 9, 1, { onTarget: false }), fbStat('away', 'shot', 'A1', 12, 1, { onTarget: true, blocked: true }),
    { type: 'GOAL', side: 'home', payload: { minute: 20, half: 1, goalType: 'open' }, attribution: { playerId: 'h1', stat: 'goals', playerName: 'H1' } },
    { type: 'ASSIST', side: 'home', attribution: { playerId: 'h2', stat: 'assists', playerName: 'H2' } },
    fbStat('away', 'foul', 'A2', 25, 1), fbStat('home', 'corner', undefined, 26, 1), fbStat('away', 'offside', 'A1', 30, 1),
    { type: 'YELLOW', side: 'away', payload: { minute: 31, half: 1 }, attribution: { playerId: 'a2', stat: 'yellowCards', playerName: 'A2' } },
    { type: 'NEXT_HALF', payload: { at: 2 } },
    { type: 'SUB', side: 'home', payload: { minute: 60, half: 2, offName: 'H3', onName: 'H4', offId: 'h3', onId: 'h4' } },
    { type: 'GOAL', side: 'away', payload: { minute: 70, half: 2, goalType: 'penalty' }, attribution: { playerId: 'a1', stat: 'goals', playerName: 'A1' } },
    fbStat('home', 'save', 'HGK', 75, 2), fbStat('home', 'tackle', 'H4', 80, 2), fbStat('home', 'foul', 'H4', 82, 2),
    { type: 'GOAL', side: 'home', payload: { minute: 88, half: 2, goalType: 'header' }, attribution: { playerId: 'h4', stat: 'goals', playerName: 'H4' } },
    { type: 'END', payload: { at: 3 } },
  );
}

/* ----------------------------------- 0 ----------------------------------- */

describe('SD-23 · schemas declare the box', () => {
  test('every schema still validates with box column specs and compare rows', () => {
    for (const s of Object.values(STAT_SCHEMAS)) assert.deepEqual(validateSchema(s as SportStatSchema<string>), [], s.sport);
  });
  test('a bad column / compare key is caught', () => {
    const bad: SportStatSchema<string> = { sport: 'x', stats: [{ key: 'a', label: 'A' }], box: [{ columns: ['a', { key: 'p', pair: ['a', 'nope'] }] }], compare: ['zz'], leaders: [], headline: [], awards: [] };
    assert.deepEqual(validateSchema(bad), ['box  names unknown stat "nope"', 'compare names unknown stat "zz"']);
  });
  test('per-sport columns (headers, in order)', () => {
    const h = (sp: keyof typeof STAT_SCHEMAS) => boxColumns(STAT_SCHEMAS[sp]).map((c) => c.abbr);
    // SD-40: the FIBA box (shooting pairs / % and OREB / DREB show only when tracked)
    assert.deepEqual(h('basketball'), ['MIN', 'PTS', 'FGM-A', 'FG%', '3PM-A', '3P%', 'FTM-A', 'FT%', 'OREB', 'DREB', 'REB', 'AST', 'STL', 'BLK', 'TO', 'PF', '+/-', 'EFF']);
    assert.deepEqual(h('volleyball'), ['PTS', 'ATK', 'ACE', 'BLK', 'ATT', 'EFF', 'SE', 'ERR']); // SD-81
    assert.deepEqual(h('kabaddi'), ['RAID', 'TKL', 'PTS']);
    // SD-80: OG / shootout columns are occasional (only when a row carries them)
    assert.deepEqual(h('football'), ['MIN', 'G', 'A', 'SH', 'SOT', 'SV', 'GA', 'FC', 'YC', 'RC', 'OG', 'SO', 'SOS']);
    assert.deepEqual(h('carrom'), ['PTS', 'Boards', 'Queens']);
    assert.equal(matchBoxSource('cricket', {}), undefined); // cricket keeps InningsCard
  });
});

/* ------------------------------ 1 · golden ------------------------------ */

describe('SD-23 · golden: the shared table equals the old components', () => {
  test('basketball, five set (MIN / +/- on Overall), every quarter', () => {
    const s = basketballGame(true);
    const src = basketballBox(s, { homeRoster: BK_H, awayRoster: BK_A });
    const field = boxFieldByName(s);
    for (const sc of scopes(src)) {
      const t = buildBoxTable(STAT_SCHEMAS.basketball, src.data(sc), { scope: sc });
      for (const sd of SIDES) assertSame(legacyBasketball(s.events, sd, sd === 'home' ? BK_H : BK_A, sc, field), t, sd, {}, `Q${sc}`);
    }
    const all = buildBoxTable(STAT_SCHEMAS.basketball, src.data('all'));
    // SD-40: no missed shots tracked → no FGM-A / FG% / 3PM-A / 3P% (D8); a typed rebound → OREB / DREB
    assert.deepEqual(abbrs(all), ['MIN', 'PTS', 'FTM-A', 'FT%', 'OREB', 'DREB', 'REB', 'AST', 'STL', 'BLK', 'TO', 'PF', '+/-', 'EFF']);
    assert.equal(cell(all, 'home', 'H6', '+/-'), '+4'); // on from Q1 5': +3 +2 −2 −1 +2
    assert.equal(cell(all, 'home', 'H7', 'MIN'), '–'); // never on court
  });
  test('basketball without a five: no MIN / +/- (as before)', () => {
    const s = basketballGame(false);
    const src = basketballBox(s, { homeRoster: BK_H, awayRoster: BK_A });
    for (const sc of scopes(src)) {
      const t = buildBoxTable(STAT_SCHEMAS.basketball, src.data(sc), { scope: sc });
      for (const sd of SIDES) assertSame(legacyBasketball(s.events, sd, sd === 'home' ? BK_H : BK_A, sc, boxFieldByName(s)), t, sd);
      assert.ok(!abbrs(t).includes('MIN') && !abbrs(t).includes('+/-'));
    }
  });
  test('volleyball, outcomes logged and legacy "Point"-only, every set', () => {
    for (const outcomes of [true, false]) {
      const s = volleyballMatch(outcomes);
      const src = volleyballBox(s, { homeRoster: VB_H, awayRoster: VB_A });
      assert.equal(src.periods.length, 3);
      for (const sc of scopes(src)) {
        const t = buildBoxTable(STAT_SCHEMAS.volleyball, src.data(sc), { scope: sc });
        for (const sd of SIDES) assertSame(legacyVolleyball(s.events, sd, sc), t, sd, {}, `set ${sc}`);
        assert.equal(abbrs(t).includes('ATK'), outcomes, 'ATK only when outcomes were logged (D8)');
      }
    }
  });
  test('kabaddi (guided raids incl. tackles, bonus, empty, unnamed), every half', () => {
    const s = kabaddiMatch();
    const src = kabaddiBox(s, { homeRoster: KB_H, awayRoster: KB_A });
    for (const sc of scopes(src)) {
      const t = buildBoxTable(STAT_SCHEMAS.kabaddi, src.data(sc), { scope: sc });
      for (const sd of SIDES) assertSame(legacyKabaddi(s.events, sd, sc), t, sd, { TCKL: 'TKL' }, `half ${sc}`);
    }
  });
  test('tennis, badminton, table tennis, squash, pickleball, padel: every game / set', () => {
    const SINGLES = { home: ['h1'], away: ['a1'] };
    const DOUBLES = { home: ['h1', 'h2'], away: ['a1', 'a2'] };
    const play = <S extends { events: { kind?: string; side?: Side }[] }>(eng: { init: (c?: Record<string, unknown>) => S; reducer: (s: S, a: ScoreAction) => S }, cfg: Record<string, unknown>, players: { home: string[]; away: string[] }, log: ScoreAction[]) =>
      L.credited(eng.reducer, eng.init(cfg), log, players).reduce(eng.reducer, eng.init(cfg));
    const rost = (ids: string[]) => ids.map((id) => P(id, id.toUpperCase()));
    const ctx = (p: { home: string[]; away: string[] }) => ({ homeRoster: rost(p.home), awayRoster: rost(p.away) });

    const ts = play(tennis, {}, SINGLES, L.TENNIS_BO3);
    const tsrc = tennisBox(ts, ctx(SINGLES));
    for (const sc of scopes(tsrc)) {
      const t = buildBoxTable(STAT_SCHEMAS.tennis, tsrc.data(sc), { scope: sc });
      for (const sd of SIDES) assertSame(legacyTennis(ts.events, sd, sc), t, sd, {}, `tennis ${sc}`);
      assert.ok(!abbrs(t).includes('DF'), 'double faults are not on the log: hidden, not 0');
    }
    const bs = play(badminton, { playersPerSide: 2 }, DOUBLES, L.BADMINTON_LOG);
    const bsrc = badmintonBox(bs, ctx(DOUBLES));
    for (const sc of scopes(bsrc)) for (const sd of SIDES) assertSame(legacyBadminton(bs.events, sd, sc), buildBoxTable(STAT_SCHEMAS.badminton, bsrc.data(sc), { scope: sc }), sd);

    const engines = {
      tabletennis: [makeRallyEngine({ icon: '🏓', sideOutValue: '__none__', sideOutLabel: 'Side change', defaults: { playersPerSide: 1, target: 11, winBy: 2, gamesToWin: 3 } }), L.TT_LOG, SINGLES],
      squash: [makeRallyEngine({ icon: '⚫', sideOutValue: 'english', sideOutLabel: 'Hand-out', defaults: { playersPerSide: 1, target: 11, winBy: 2, gamesToWin: 3 } }), L.SQUASH_LOG, SINGLES],
      pickleball: [makeRallyEngine({ icon: '🥒', sideOutValue: 'sideout', sideOutLabel: 'Side-out', defaults: { playersPerSide: 2, target: 11, winBy: 2, gamesToWin: 2 } }), L.PICKLEBALL_SIDEOUT_LOG, DOUBLES],
    } as const;
    for (const [sport, [eng, log, players]] of Object.entries(engines)) {
      const rs = play(eng, {}, players, log as ScoreAction[]);
      const c = ctx(players);
      const src = rallyBox(rs, c);
      for (const sc of scopes(src)) {
        const t = buildBoxTable(STAT_SCHEMAS[sport as 'squash'], src.data(sc), { scope: sc });
        for (const sd of SIDES) assertSame(legacyPoint(rs.events, sd, sc, sd === 'home' ? c.homeRoster : c.awayRoster), t, sd, {}, `${sport} ${sc}`);
      }
    }
    const ps = play(padel, {}, DOUBLES, L.PADEL_TWO_SETS);
    const psrc = padelBox(ps, ctx(DOUBLES));
    for (const sc of scopes(psrc)) for (const sd of SIDES) assertSame(legacyPoint(ps.events, sd, sc, ctx(DOUBLES)[sd === 'home' ? 'homeRoster' : 'awayRoster']), buildBoxTable(STAT_SCHEMAS.padel, psrc.data(sc), { scope: sc }), sd);
  });
});

/* -------------------------- 2 · totals & formats -------------------------- */

describe('SD-23 · totals row, team row, formats', () => {
  test('basketball totals = the team score (incl. points logged with no player); +/- not totalled', () => {
    const s = basketballGame(true);
    const t = buildBoxTable(STAT_SCHEMAS.basketball, basketballBox(s, { homeRoster: BK_H, awayRoster: BK_A }).data('all'));
    assert.equal(total(t, 'home', 'PTS'), String(s.home));
    assert.equal(total(t, 'away', 'PTS'), String(s.away));
    assert.equal(total(t, 'home', '+/-'), '');
    const team = t.home.rows.find((r) => r.team);
    assert.equal(team?.name, 'Team');
    assert.equal(team?.cells[t.columns.findIndex((c) => c.abbr === 'PTS')], '2');
    assert.equal(total(t, 'away', 'REB'), '1'); // the unattributed team rebound
    // MIN totals: the minutes played by the side's players
    assert.equal(Number(total(t, 'home', 'MIN')), t.home.rows.filter((r) => !r.team).reduce((a, r) => a + (Number(r.cells[0]) || 0), 0));
  });
  test('volleyball totals = the side\'s points (opponent errors on their own row)', () => {
    const s = volleyballMatch(true);
    const src = volleyballBox(s, { homeRoster: VB_H, awayRoster: VB_A });
    const set1 = buildBoxTable(STAT_SCHEMAS.volleyball, src.data(1), { scope: 1 });
    assert.deepEqual([total(set1, 'home', 'PTS'), total(set1, 'away', 'PTS')], s.sets[0].map(String));
    assert.match(set1.home.rows.at(-1)!.name, /opp\. errors/i);
    const all = buildBoxTable(STAT_SCHEMAS.volleyball, src.data('all'));
    const pts = (sd: Side) => s.sets.reduce((a, x) => a + x[sd === 'home' ? 0 : 1], 0) + s.current[sd];
    assert.deepEqual([total(all, 'home', 'PTS'), total(all, 'away', 'PTS')], [String(pts('home')), String(pts('away'))]);
  });
  test('kabaddi totals = raid + tackle points; the box-only PTS column sums them', () => {
    const s = kabaddiMatch();
    const t = buildBoxTable(STAT_SCHEMAS.kabaddi, kabaddiBox(s, { homeRoster: KB_H, awayRoster: KB_A }).data('all'));
    const sum = (sd: Side) => s.events.filter((e) => e.side === sd && (e.kind === 'raid' || e.kind === 'tackle')).reduce((a, e) => a + (e.points ?? 0), 0);
    assert.equal(total(t, 'home', 'PTS'), String(sum('home')));
    assert.equal(total(t, 'away', 'PTS'), String(sum('away')));
    assert.equal(cell(t, 'home', 'Ravi', 'PTS'), String(Number(cell(t, 'home', 'Ravi', 'RAID')) + Number(cell(t, 'home', 'Ravi', 'TKL'))));
  });
  test('made-attempted pairs, percentages and signed cells (a FIBA-style schema)', () => {
    const schema: SportStatSchema<string> = {
      sport: 'x', leaders: [], headline: [], awards: [],
      stats: [
        { key: 'ftm', label: 'FT made' }, { key: 'fta', label: 'FT att' }, { key: 'pm', label: 'Plus minus', abbr: '+/-' },
        { key: 'ftp', label: 'FT%', abbr: 'FT%', source: 'derived', format: { unit: 'percent', dp: 1 }, agg: { kind: 'rate', num: 'ftm', den: 'fta', scale: 100, dp: 1 } },
      ],
      box: [{ columns: [{ key: 'ft', abbr: 'FTM-A', pair: ['ftm', 'fta'] }, 'ftp', { key: 'pm', signed: true, total: false }] }],
    };
    const data: BoxData = {
      home: { rows: [{ name: 'A', stats: { ftm: 3, fta: 4, pm: 5 } }, { name: 'B', stats: { ftm: 0, fta: 0, pm: -2 } }, { name: 'C', stats: { ftm: 1, fta: 3, pm: 0 } }] },
      away: { rows: [] },
    };
    const t = buildBoxTable(schema, data);
    assert.deepEqual(t.home.rows.map((r) => r.cells), [['3-4', '75.0%', '+5'], ['0-0', '–', '-2'], ['1-3', '33.3%', '0']]);
    assert.deepEqual(t.home.totals, ['4-7', '57.1%', '']); // the rate recomputed over the side, not averaged
  });
});

/* --------------------------- 3 · period filter --------------------------- */

describe('SD-23 · period filter', () => {
  test('a period view re-tallies and drops the whole-game columns', () => {
    const s = basketballGame(true);
    const src = basketballBox(s, { homeRoster: BK_H, awayRoster: BK_A });
    assert.deepEqual(src.periods.map((p) => p.label), ['Q1', 'Q2', 'Q3']);
    const q2 = buildBoxTable(STAT_SCHEMAS.basketball, src.data(2), { scope: 2 });
    assert.ok(!abbrs(q2).includes('MIN') && !abbrs(q2).includes('+/-'));
    assert.equal(cell(q2, 'home', 'H1', 'PTS'), '0');
    assert.equal(cell(q2, 'home', 'H1', 'PF'), '1');
    assert.equal(total(q2, 'home', 'PTS'), '2'); // the team basket
  });
  test('football per half: goals by half, minutes / GA only overall; the toggle only from the 2nd half', () => {
    const s = footballMatch();
    const src = footballBox(s, { homeRoster: FB_H, awayRoster: FB_A, now: 4 });
    assert.deepEqual(src.periods.map((p) => p.label), ['1st half', '2nd half']);
    const h1 = buildBoxTable(STAT_SCHEMAS.football, src.data(1), { scope: 1 });
    assert.ok(!abbrs(h1).includes('MIN') && !abbrs(h1).includes('GA'));
    assert.equal(cell(h1, 'home', 'H1', 'G'), '1');
    assert.equal(cell(h1, 'home', 'H4', 'G'), '0');
    const h2 = buildBoxTable(STAT_SCHEMAS.football, src.data(2), { scope: 2 });
    assert.equal(cell(h2, 'home', 'H4', 'G'), '1');
    assert.equal(cell(h2, 'home', 'H1', 'G'), '0');
    const first = fb(fbInit({}), { type: 'KICKOFF', payload: { at: 1 } });
    assert.deepEqual(footballBox(first).periods, []);
  });
});

/* ------------------------------ football table ----------------------------- */

describe('SD-23 · football player box score (FB-09)', () => {
  const s = footballMatch();
  const src = footballBox(s, { homeRoster: FB_H, awayRoster: FB_A, now: 4 });
  const t = buildBoxTable(STAT_SCHEMAS.football, src.data('all'));
  test('starters first (marked), then the sub; the bench only on request', () => {
    assert.deepEqual(t.home.rows.map((r) => [r.name, !!r.starter]), [['HGK', true], ['H1', true], ['H2', true], ['H3', true], ['H4', false]]);
    assert.deepEqual(t.away.rows.map((r) => r.name), ['AGK', 'A1', 'A2']);
    const bench = buildBoxTable(STAT_SCHEMAS.football, src.data('all'), { showDnp: true });
    assert.deepEqual(bench.away.rows.filter((r) => r.dnp).map((r) => r.name), ['A3']);
    assert.ok(bench.away.rows.find((r) => r.dnp)!.cells.every((c) => c === '–'));
  });
  test('values: minutes, goals, assists, shots (a goal is a shot on target), saves, GA, fouls, cards', () => {
    const row = (sd: Side, n: string) => Object.fromEntries(t.columns.map((c, i) => [c.abbr, t[sd].rows.find((r) => r.name === n)!.cells[i]]));
    assert.deepEqual(row('home', 'H1'), { MIN: '90', G: '1', A: '0', SH: '2', SOT: '2', SV: '0', GA: '–', FC: '0', YC: '0', RC: '0' });
    assert.deepEqual(row('home', 'H2'), { MIN: '90', G: '0', A: '1', SH: '1', SOT: '0', SV: '0', GA: '–', FC: '0', YC: '0', RC: '0' });
    assert.deepEqual(row('home', 'H4'), { MIN: '30', G: '1', A: '0', SH: '1', SOT: '1', SV: '0', GA: '–', FC: '1', YC: '0', RC: '0' });
    assert.deepEqual(row('home', 'HGK'), { MIN: '90', G: '0', A: '0', SH: '0', SOT: '0', SV: '1', GA: '1', FC: '0', YC: '0', RC: '0' });
    assert.equal(row('away', 'A2').YC, '1');
    assert.equal(row('away', 'AGK').GA, '2');
    assert.equal(total(t, 'home', 'G'), String(s.home));
    assert.equal(total(t, 'away', 'G'), String(s.away));
  });
  test('the player shots / SOT add up to the team figures', () => {
    const { totals } = footballStats(s, 4);
    for (const sd of SIDES) {
      assert.equal(total(t, sd, 'SH'), String(totals[sd].shots));
      assert.equal(total(t, sd, 'SOT'), String(totals[sd].shotsOnTarget));
    }
  });
});

/* ------------------------------ 4 · D8 hidden ------------------------------ */

describe('SD-23 · not-tracked columns are hidden (D8)', () => {
  test('football: shots / saves / fouls / cards switched off → their columns and comparison rows go', () => {
    const s = footballMatch({ shots: false, saves: false, fouls: false, cards: false });
    const data = footballBox(s, { homeRoster: FB_H, awayRoster: FB_A, now: 4 }).data('all');
    const t = buildBoxTable(STAT_SCHEMAS.football, data);
    assert.deepEqual(abbrs(t), ['MIN', 'G', 'A', 'GA']);
    assert.deepEqual(t.hidden, ['Shots', 'Shots on target', 'Saves', 'Fouls committed', 'Yellow cards', 'Red cards']);
    const cmp = comparisonRows(STAT_SCHEMAS.football, data);
    assert.ok(!cmp.rows.some((r) => ['Shots', 'Saves', 'Fouls', 'Yellow cards'].includes(r.label)));
    assert.deepEqual(cmp.untracked.slice(0, 3), ['Shots', 'Shots on target', 'Blocked shots']);
  });
  test('football without an XI stamp (older log): no MIN / GA columns', () => {
    const s = fb(fbInit({}), { type: 'KICKOFF', payload: { at: 1 } },
      { type: 'GOAL', side: 'home', payload: { minute: 5, half: 1 }, attribution: { playerId: 'h1', stat: 'goals', playerName: 'H1' } });
    const t = buildBoxTable(STAT_SCHEMAS.football, footballBox(s, { homeRoster: FB_H, awayRoster: FB_A, now: 2 }).data('all'));
    assert.ok(!abbrs(t).includes('MIN') && !abbrs(t).includes('GA'));
    assert.deepEqual(t.home.rows.map((r) => r.name), ['H1']);
  });
  test('a key no row carries hides its column; an explicit untracked list wins', () => {
    const schema = STAT_SCHEMAS.carrom;
    const data: BoxData = { home: { rows: [{ name: 'A', stats: { points: 3, boards: 1 } }] }, away: { rows: [] } };
    assert.deepEqual(abbrs(buildBoxTable(schema, data)), ['PTS', 'Boards']);
    assert.deepEqual(abbrs(buildBoxTable(schema, { ...data, untracked: ['boards'] })), ['PTS']);
  });
});

/* ---------------------------- 5 · comparison ---------------------------- */

describe('SD-23 · team comparison panel', () => {
  test('football: identical to the old Stats panel rows (labels, values, order), per half too', () => {
    const s = footballMatch();
    const src = footballBox(s, { homeRoster: FB_H, awayRoster: FB_A, now: 4 });
    for (const sc of scopes(src)) {
      // the old StatsComparison, reduced to its visible rows
      const scoped = sc === 'all' ? s : { ...s, stats: s.stats.filter((e) => e.half === sc), events: s.events.filter((e) => e.half === sc) };
      const { totals: T, possession, passAcc } = footballStats(scoped, 4);
      const t = s.track;
      const old = [
        ['Shots', T.home.shots, T.away.shots, t.shots], ['Shots on target', T.home.shotsOnTarget, T.away.shotsOnTarget, t.shots],
        ['Blocked shots', T.home.blockedShots, T.away.blockedShots, t.shots], ['Possession', `${possession.home}%`, `${possession.away}%`, t.possession, true],
        ['Passes', T.home.passes, T.away.passes, t.passes], ['Pass accuracy', `${passAcc.home}%`, `${passAcc.away}%`, t.passes],
        ['Fouls', T.home.fouls, T.away.fouls, t.fouls], ['Yellow cards', T.home.yellow, T.away.yellow, t.cards], ['Red cards', T.home.red, T.away.red, t.cards],
        ['Offsides', T.home.offsides, T.away.offsides, t.offsides], ['Corners', T.home.corners, T.away.corners, t.corners],
        ['Tackles', T.home.tackles, T.away.tackles, t.tackles], ['Interceptions', T.home.interceptions, T.away.interceptions, t.interceptions],
        ['Saves', T.home.saves, T.away.saves, t.saves], ['Crosses', T.home.crosses, T.away.crosses, t.crosses], ['Dribbles', T.home.dribbles, T.away.dribbles, t.dribbles],
        ['Handballs', T.home.handballs, T.away.handballs, t.handball], ['Attacking plays', T.home.attackContributions, T.away.attackContributions, t.attackContribution],
        ['Defensive plays', T.home.defenceContributions, T.away.defenceContributions, t.defenceContribution],
      ] as [string, number | string, number | string, boolean, boolean?][];
      const shown = old.filter((r) => (sc === 'all' || !r[4]) && r[3]).map((r) => [r[0], String(r[1]), String(r[2])]);
      const untracked = old.filter((r) => !r[3]).map((r) => r[0]);
      const cmp = comparisonRows(STAT_SCHEMAS.football, src.data(sc), sc);
      assert.deepEqual(cmp.rows.map((r) => [r.label, r.home, r.away]), shown, `scope ${sc}`);
      assert.deepEqual(cmp.untracked, untracked);
    }
  });
  test('basketball: rebounds, assists … and FT% recomputed per side', () => {
    const s = basketballGame(true);
    const cmp = comparisonRows(STAT_SCHEMAS.basketball, basketballBox(s, { homeRoster: BK_H, awayRoster: BK_A }).data('all'));
    assert.deepEqual(cmp.rows.map((r) => r.label), ['Rebounds', 'Assists', 'Steals', 'Blocks', 'Turnovers', 'Fouls', 'Free throw %']);
    const ft = cmp.rows.find((r) => r.key === 'freeThrowPct')!;
    assert.deepEqual([ft.home, ft.away], ['50%', '100%']);
    assert.deepEqual([cmp.rows[0].home, cmp.rows[0].away], ['1', '1']);
  });
  test('volleyball: attack / blocks / aces / opponent errors / serve errors', () => {
    const s = volleyballMatch(true);
    const cmp = comparisonRows(STAT_SCHEMAS.volleyball, volleyballBox(s).data('all'));
    assert.deepEqual(cmp.rows.map((r) => r.key), ['points', 'attackPoints', 'blocks', 'aces', 'oppErrors', 'serveErrors']);
    const count = (sd: Side, k: string) => String(s.events.filter((e) => e.side === sd && e.kind === k).length);
    const row = (k: string) => cmp.rows.find((r) => r.key === k)!;
    assert.deepEqual([row('aces').home, row('aces').away], [count('home', 'ace'), count('away', 'ace')]);
    assert.equal(row('serveErrors').home, count('away', 'serveerror')); // home's serve errors = away's points from them
    const legacy = comparisonRows(STAT_SCHEMAS.volleyball, volleyballBox(volleyballMatch(false)).data('all'));
    assert.ok(!legacy.rows.some((r) => r.key === 'attackPoints' || r.key === 'oppErrors'));
  });
  test('kabaddi: raid / tackle / all-out points and raids (unnamed raids count for the team)', () => {
    const s = kabaddiMatch();
    const cmp = comparisonRows(STAT_SCHEMAS.kabaddi, kabaddiBox(s).data('all'));
    // SD-41 extended the panel to the PKL match centre (tests/kabaddi-depth.test.mts)
    assert.deepEqual(cmp.rows.map((r) => r.label).slice(0, 5), ['Raid pts', 'Tackle pts', 'All-out pts', 'Extra pts', 'Raids']);
    const raid = (sd: Side) => String(s.events.filter((e) => e.side === sd && e.kind === 'raid').reduce((a, e) => a + (e.points ?? 0), 0));
    assert.deepEqual([cmp.rows[0].home, cmp.rows[0].away], [raid('home'), raid('away')]);
    const raids = cmp.rows.find((r) => r.key === 'raids')!;
    assert.deepEqual([raids.home, raids.away], ['5', '3']); // incl. the empty raid and the unnamed one
  });
  test('carrom: points / boards / queens per game, no player table', () => {
    let s = carrom.init({});
    for (const [side, coins, queen] of L.CARROM_BOARDS) s = carrom.reducer(s, { type: 'BOARD', side, payload: { coins, queen } });
    const src = carromBox(s);
    assert.equal(src.players, false);
    const cmp = comparisonRows(STAT_SCHEMAS.carrom, src.data('all'));
    assert.deepEqual(cmp.rows.map((r) => r.label), ['Points', 'Boards', 'Queens']);
    // SD-37: capped board points — the box equals the games' scores (25+12+25, 18+25+20)
    const sumPts = (sd: Side) => String(s.games.reduce((a, g) => a + g[sd === 'home' ? 0 : 1], 0));
    assert.deepEqual([cmp.rows[0].home, cmp.rows[0].away], [sumPts('home'), sumPts('away')]);
    assert.deepEqual([cmp.rows[0].home, cmp.rows[0].away], ['62', '63']);
    const g1 = comparisonRows(STAT_SCHEMAS.carrom, src.data(1), 1);
    assert.equal(Number(g1.rows[1].home) + Number(g1.rows[1].away), s.boards.filter((b) => b.game === 1).length);
  });
  test('bars and the leader', () => {
    assert.deepEqual(barShares({ h: 3, a: 1 }), { home: 0.75, away: 0.25 });
    assert.deepEqual(barShares({ h: 0, a: 0 }), { home: 0.5, away: 0.5 });
    assert.equal(leaderOf({ h: 2, a: 2 }), null);
    assert.equal(leaderOf({ h: 1, a: 4 }), 'away');
  });
});

/* ------------------------------ 6 · layout ------------------------------ */

describe('SD-23 · sticky-name layout', () => {
  test('basketball at 375 px: the name column is pinned and the numbers scroll', () => {
    const s = basketballGame(true);
    const t = buildBoxTable(STAT_SCHEMAS.basketball, basketballBox(s, { homeRoster: BK_H, awayRoster: BK_A }).data('all'));
    // 375 px phone − 16 px page gutters − card padding/border ≈ 317 px of table
    const l = boxLayout(t, 317);
    assert.equal(l.sticky, true);
    assert.ok(l.nameWidth >= 80 && l.nameWidth + 40 <= 317, 'a readable name and at least one number column on screen');
    assert.equal(l.widths.length, 14); // SD-40: + FTM-A, FT%, OREB, DREB, EFF
    // a tablet fits everything beside a flexing name
    const wide = boxLayout(t, 700);
    assert.equal(wide.sticky, false);
    assert.ok(wide.nameWidth >= NAME_MIN && wide.nameWidth + wide.numbersWidth === 700);
  });
  test('a one-column racket table never scrolls at 375 px', () => {
    const t = buildBoxTable(STAT_SCHEMAS.tabletennis, { home: { rows: [{ name: 'Asha', stats: { points: 11 } }] }, away: { rows: [] } });
    assert.equal(boxLayout(t, 317).sticky, false);
  });
  test('column widths fit their widest cell (pairs, signed, %)', () => {
    const t = buildBoxTable(STAT_SCHEMAS.basketball, basketballBox(basketballGame(true), { homeRoster: BK_H }).data('all'));
    const l = boxLayout(t, 317);
    t.columns.forEach((c, i) => assert.ok(l.widths[i] >= 30 && l.widths[i] <= 56, c.abbr));
  });
});
