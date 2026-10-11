/**
 * SD-51 (GEN-21 / CK-07) — per-match records: each sport's `matchRecords`
 * hook over REPLAYED logs, the completed-snapshot write (`withMatchRecords`),
 * the tournament Records ranking (top 5 per type, direction, ties, manual
 * results skipped, stored block vs derive fallback) and the backfill planner
 * (dry-run diff, keys-only, idempotent).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Match, SportId, Team } from '../src/core/types.ts';
import type { ScoreAction } from '../src/sports/types.ts';
import { replayLog } from '../src/sports/amend.ts';
import {
  MATCH_RECORD_TYPES, readMatchRecords, recordsDiff, stateWithRecords, withMatchRecords, MATCH_RECORDS_KEY,
  type MatchRecordsBlock,
} from '../src/sports/matchRecords.ts';
import {
  MATCH_RECORD_HOOKS, cricketMatchRecords, footballMatchRecords, hockeyMatchRecords, handballMatchRecords,
  basketballMatchRecords, kabaddiMatchRecords, chessMatchRecords, tennisMatchRecords, badmintonMatchRecords, rallyMatchRecords,
} from '../src/sports/matchRecordHooks.ts';
import { tournamentRecords } from '../src/data/tournamentRecords.ts';
import * as cricket from '../src/sports/cricket/engine.ts';
import { partnerships } from '../src/sports/cricket/scorecard.ts';
import { CRICKET_MATCH_EVENTS, CRICKET_SEED_EXPECT } from '../src/data/cricketSeed.ts';
import * as football from '../src/sports/football/engine.ts';
import * as hockey from '../src/sports/hockey/engine.ts';
import * as handball from '../src/sports/handball/engine.ts';
import * as basketball from '../src/sports/basketball/engine.ts';
import * as kabaddi from '../src/sports/kabaddi/engine.ts';
import { kabaddiTotals } from '../src/sports/kabaddi/totals.ts';
import * as chess from '../src/sports/chess/engine.ts';
import * as tennis from '../src/sports/tennis/engine.ts';
import * as badminton from '../src/sports/badminton/engine.ts';
import { makeRallyEngine } from '../src/sports/rallyEngine.ts';
import * as L from './racketLogs.mts';

type Side = 'home' | 'away';
const of = (b: MatchRecordsBlock | null, type: string) => (b?.items ?? []).filter((i) => i.type === type);
const play = <S,>(init: (c?: Record<string, unknown>) => S, reducer: (s: S, a: ScoreAction) => S, acts: ScoreAction[], cfg?: Record<string, unknown>) =>
  acts.reduce(reducer, init(cfg));

/* ---------------------------------------------------------------- cricket -- */

describe('cricket — replayed seed match (ck1: Red 118/5 v Gold 104/6)', () => {
  const e = CRICKET_SEED_EXPECT.find((x) => x.id === 'ck1')!;
  const s = replayLog({ createInitialState: cricket.init, reducer: cricket.reducer }, { overs: e.overs, playersPerSide: e.players }, CRICKET_MATCH_EVENTS.ck1);
  const b = cricketMatchRecords(s);
  test('team totals: both highs; the first innings and the failed chase are lows', () => {
    assert.ok(s.ended);
    assert.deepEqual(of(b, 'teamHigh').map((i) => [i.side, i.value]), [['home', 118], ['away', 104]]);
    assert.equal(of(b, 'teamHigh')[0].text, '118/5 (10.0 ov)');
    assert.deepEqual(of(b, 'teamLow').map((i) => i.value), [118, 104]);
  });
  test('partnerships: top 3 per side, with the wicket and both batters, equal to the scorecard', () => {
    const p = of(b, 'partnership');
    assert.ok(p.length > 0 && p.length <= 6);
    const best = Math.max(...partnerships(s, 'home').map((x) => x.runs));
    assert.equal(Math.max(...p.filter((i) => i.side === 'home').map((i) => i.value)), best);
    for (const i of p) { assert.ok(i.playerId && i.partnerId); assert.match(i.note!, /^\d+(st|nd|rd|th) wkt$/); }
  });
  test('best innings / bowling link to the players (ids from the cards), margin 14 runs', () => {
    const bi = of(b, 'bestInnings');
    assert.ok(bi.length && bi.every((i) => i.playerId && s.batting[i.playerId!]));
    const top = [...bi].sort((x, y) => y.value - x.value)[0];
    assert.equal(Math.floor(top.value / 10), Math.max(...Object.values(s.batting).map((c) => c.runs)));
    const bb = of(b, 'bestBowling');
    assert.ok(bb.length && bb.every((i) => /^\d+\/\d+$/.test(i.text)));
    assert.deepEqual(of(b, 'marginRuns').map((i) => [i.side, i.value, i.text]), [['home', 14, 'by 14 runs']]);
    assert.equal(of(b, 'marginWkts').length, 0);
  });
  test('the snapshot (no ball log) still gives totals and figures, but no partnerships', () => {
    const snap = cricketMatchRecords(cricket.snapshotState(s));
    assert.equal(of(snap, 'partnership').length, 0);
    assert.deepEqual(of(snap, 'teamHigh'), of(b, 'teamHigh'));
  });
  test('withMatchRecords: completed → block from the FULL state on the snapshot; open → none (and a stale one dropped)', () => {
    const plugin = { snapshot: cricket.snapshotState, matchRecords: cricketMatchRecords };
    const done = withMatchRecords(plugin, s, true) as Record<string, unknown>;
    assert.equal('log' in done, false);
    assert.equal(of(readMatchRecords(done), 'partnership').length, of(b, 'partnership').length);
    const open = withMatchRecords(plugin, { ...s, [MATCH_RECORDS_KEY]: b } as never, false) as Record<string, unknown>;
    assert.equal(MATCH_RECORDS_KEY in open, false);
    const throwing = withMatchRecords({ matchRecords: () => { throw new Error('x'); } }, { a: 1 }, true);
    assert.deepEqual(throwing, { a: 1 });
  });
  test('a chase that gets there wins by wickets (with balls left)', () => {
    let t = cricket.init({ overs: 2, playersPerSide: 3 });
    const go = (a: ScoreAction) => { t = cricket.reducer(t, a); };
    const bat = (side: Side) => { const p = side === 'home' ? 'h' : 'a'; go({ type: 'SET_STRIKER', payload: { id: `${p}1`, name: `${p}1` } }); go({ type: 'SET_NONSTRIKER', payload: { id: `${p}2`, name: `${p}2` } }); };
    const ball = (r: number) => go({ type: 'RUNS', side: t.battingSide, payload: { runs: r, strikerId: t.strikerId, strikerName: t.strikerName, bowlerId: t.bowlerId, bowlerName: t.bowlerName } });
    bat('home'); go({ type: 'SET_BOWLER', payload: { id: 'a9', name: 'a9' } });
    for (let i = 0; i < 6; i++) ball(1);
    go({ type: 'SET_BOWLER', payload: { id: 'a8', name: 'a8' } });
    for (let i = 0; i < 6; i++) ball(0);
    bat('away'); go({ type: 'SET_BOWLER', payload: { id: 'h9', name: 'h9' } });
    ball(4); ball(4);
    assert.ok(t.ended);
    const r = cricketMatchRecords(t);
    assert.deepEqual(of(r, 'marginWkts').map((i) => [i.side, i.text]), [['away', 'by 2 wkts (10 balls left)']]);
    assert.deepEqual(of(r, 'teamLow').map((i) => i.side), ['home']); // the winning chase isn't a low
  });
});

/* ----------------------------------------------------------- goal sports -- */

describe('football / hockey / handball — replayed logs', () => {
  let minute = 1;
  const g = (side: Side, id: string): ScoreAction => ({ type: 'GOAL', side, payload: { goalType: 'open', pid: id, minute: minute++, half: 1 }, attribution: { playerId: id, stat: 'goals', playerName: id.toUpperCase() } });
  test('football: biggest win, most goals, the first goal (own goal skipped), a hat-trick', () => {
    minute = 3;
    const og: ScoreAction = { type: 'OWN_GOAL', side: 'away', payload: { scorerName: 'HCB', pid: 'hcb', minute: 2, half: 1 } };
    const s = play(football.init, football.reducer, [
      { type: 'KICKOFF', payload: { at: 1, ord: true } }, og,
      g('home', 'h9'), g('home', 'h9'), g('away', 'a7'), g('home', 'h9'), g('home', 'h10'),
      { type: 'NEXT_HALF', payload: { at: 2 } }, { type: 'END', payload: { at: 3 } },
    ]);
    const b = footballMatchRecords(s);
    assert.deepEqual(of(b, 'biggestWin').map((i) => [i.side, i.text]), [['home', '4–2']]);
    assert.deepEqual(of(b, 'mostGoals').map((i) => i.value), [6]);
    assert.deepEqual(of(b, 'fastestGoal').map((i) => [i.playerId, i.text]), [['h9', "3'"]]);
    assert.deepEqual(of(b, 'hatTrick').map((i) => [i.playerId, i.value]), [['h9', 3]]);
  });
  const hg = (side: Side, sec: number, id: string): ScoreAction =>
    ({ type: 'GOAL', side, payload: { sec, period: 1, uid: `g${sec}` }, attribution: { playerId: id, stat: 'goals', playerName: id.toUpperCase() } });
  test('hockey: fastest goal by the clock second ("1\'" at 0:42), hat-trick', () => {
    const s = play(hockey.init, hockey.reducer, [hg('away', 42, 'a9'), hg('home', 300, 'h4'), hg('away', 500, 'a9'), hg('away', 800, 'a9'), { type: 'END', payload: { at: 0 } }], { periods: 2 });
    const b = hockeyMatchRecords(s);
    assert.deepEqual(of(b, 'fastestGoal').map((i) => [i.playerId, i.value, i.text]), [['a9', 42, "1'"]]);
    assert.deepEqual(of(b, 'hatTrick').map((i) => i.playerId), ['a9']);
    assert.deepEqual(of(b, 'biggestWin').map((i) => [i.side, i.text]), [['away', '3–1']]);
  });
  test('handball: most goals by a player (no hat-trick type), top 3', () => {
    const acts: ScoreAction[] = [];
    for (let i = 0; i < 7; i++) acts.push(hg('home', 60 + i * 60, 'h7'));
    for (let i = 0; i < 4; i++) acts.push(hg('away', 70 + i * 60, 'a2'));
    acts.push(hg('home', 900, 'h3'), { type: 'END', payload: { at: 0 } });
    const b = handballMatchRecords(play(handball.init, handball.reducer, acts));
    assert.equal(of(b, 'hatTrick').length, 0);
    assert.deepEqual(of(b, 'playerGoals').map((i) => [i.playerId, i.value]), [['h7', 7], ['a2', 4], ['h3', 1]]);
    assert.ok(!MATCH_RECORD_TYPES.handball!.some((t) => t.key === 'hatTrick'));
  });
});

/* ------------------------------------------------------------ basketball -- */

test('basketball: team high, margin, top scorers, a 40-point game, a triple-double', () => {
  const sc = (side: Side, who: string, points: number): ScoreAction => ({ type: 'SCORE', side, payload: { points, pid: who }, attribution: { playerId: who, stat: 'points', by: points, playerName: who.toUpperCase() } });
  const ev = (type: string, side: Side, who: string): ScoreAction => ({ type, side, payload: { pid: who }, attribution: { playerId: who, stat: type.toLowerCase(), playerName: who.toUpperCase() } });
  const acts: ScoreAction[] = [{ type: 'KICKOFF', payload: { at: 1 } }];
  for (let i = 0; i < 14; i++) acts.push(sc('home', 'h23', 3)); // 42
  for (let i = 0; i < 6; i++) acts.push(sc('home', 'h3', 2)); // 12
  for (let i = 0; i < 10; i++) acts.push(ev('REBOUND', 'home', 'h3'), ev('ASSIST', 'home', 'h3'));
  for (let i = 0; i < 20; i++) acts.push(sc('away', 'a1', 2)); // 40
  acts.push({ type: 'END' });
  const s = play(basketball.init, basketball.reducer, acts);
  const b = basketballMatchRecords(s);
  assert.deepEqual(of(b, 'teamHigh').map((i) => i.value), [54, 40]);
  assert.deepEqual(of(b, 'biggestWin').map((i) => [i.side, i.text]), [['home', '54–40']]);
  assert.deepEqual(of(b, 'bigGame').map((i) => [i.playerId, i.text]), [['h23', '42 pts · 40+'], ['a1', '40 pts · 40+']]);
  assert.deepEqual(of(b, 'tripleDouble').map((i) => [i.playerId, i.text]), [['h3', '12 pts · 10 reb · 10 ast']]);
  assert.deepEqual(of(b, 'playerHigh').filter((i) => i.side === 'home').map((i) => i.playerId), ['h23', 'h3']);
});

/* --------------------------------------------------------------- kabaddi -- */

test('kabaddi: raid-point leaders, Super 10 and High 5 agree with the raid replay totals', () => {
  const H = [{ id: 'h1', fullName: 'Ravi' }, { id: 'h2', fullName: 'Dev' }];
  const A = [{ id: 'a1', fullName: 'Arjun' }, { id: 'a2', fullName: 'Bhanu' }];
  let s = kabaddi.init({ playersPerSide: 7, style: 'sanjeevani', proRules: true });
  const push = (a: ScoreAction) => { s = kabaddi.reducer(s, a); };
  push({ type: 'KICKOFF', payload: { at: 1 } });
  let minute = 1;
  const raid = (f: Partial<kabaddi.RaidForm> & { side: Side }) => {
    for (const a of kabaddi.raidActions(s, { touches: 0, bonus: false, tackled: false, ...f } as kabaddi.RaidForm)) push(a.type === 'REMOVE_EVENT' ? a : { ...a, payload: { ...a.payload, minute: minute++, half: 1 } });
  };
  for (let i = 0; i < 6; i++) {
    raid({ side: 'home', raider: H[0], touches: 3 } as never);
    raid({ side: 'away', raider: A[0], tackled: true, tackler: H[1] } as never);
  }
  push({ type: 'END' });
  const t = kabaddiTotals(s);
  const b = kabaddiMatchRecords(s);
  const rp = t.h1.stats.raidPoints;
  assert.ok(rp >= 10, `raid points ${rp}`);
  assert.deepEqual(of(b, 'super10').map((i) => [i.playerId, i.value, i.playerName]), [['h1', rp, 'Ravi']]);
  assert.equal(of(b, 'high5').length, t.h2.stats.tacklePoints >= 5 ? 1 : 0);
  assert.deepEqual(of(b, 'teamHigh').map((i) => i.value), [s.home, s.away]);
});

/* ----------------------------------------------------------------- chess -- */

test('chess: fastest win needs a winner and a move count; forfeits and draws have none', () => {
  const won = chess.reducer(chess.init(), { type: 'RESULT', payload: { winner: 'away', method: 'checkmate', moves: 23 } });
  assert.deepEqual(of(chessMatchRecords(won), 'fastestWin').map((i) => [i.side, i.value, i.text, i.note]), [['away', 23, '23 moves', chess.METHOD_LABEL.checkmate]]);
  assert.equal(chessMatchRecords(chess.reducer(chess.init(), { type: 'RESULT', payload: { winner: 'home', method: 'resignation' } })), null);
  assert.equal(chessMatchRecords(chess.reducer(chess.init(), { type: 'RESULT', payload: { winner: 'draw', method: 'agreement', moves: 30 } })), null);
  assert.equal(chessMatchRecords(chess.reducer(chess.init(), { type: 'RESULT', payload: { winner: 'home', method: 'forfeit', moves: 1 } })), null);
});

/* ------------------------------------------------------- set / game sports -- */

describe('set / game sports — replayed racket logs', () => {
  test('tennis 6-4 3-6 7-6(4): 3 sets, the 7-4 tiebreak, a stamped duration', () => {
    const stamped = L.TENNIS_BO3.map((a, i) => ({ ...a, payload: { ...(a.payload ?? {}), at: 1_000_000 + i * 30_000 } }));
    const s = play(tennis.init, tennis.reducer, stamped, { setsToWin: 2 });
    const b = tennisMatchRecords(s);
    assert.deepEqual(of(b, 'longestMatch').map((i) => i.text), ['3 sets · 6-4, 3-6, 7-6(4)']);
    assert.deepEqual(of(b, 'longestTiebreak').map((i) => [i.value, i.text]), [[11, '7-6 · tiebreak 7-4']]);
    assert.equal(of(b, 'comeback').length, 0); // home won the first set
    assert.equal(of(b, 'longestTime').length, 1);
    assert.match(of(b, 'longestTime')[0].text, /^1 h /);
  });
  test('badminton 21-18 19-21 21-15: longest game 19-21; no clock stamps → no time record', () => {
    const b = badmintonMatchRecords(play(badminton.init, badminton.reducer, L.BADMINTON_LOG));
    assert.deepEqual(of(b, 'longestGame').map((i) => [i.value, i.text]), [[40, '19-21']]);
    assert.equal(of(b, 'longestTime').length, 0);
  });
  test('squash: a comeback from 0-2 down', () => {
    const SQ = makeRallyEngine({ icon: '⚫', sideOutValue: 'english', sideOutLabel: 'Hand-out', defaults: { playersPerSide: 1, target: 11, winBy: 2, gamesToWin: 3 } });
    const s = play(SQ.init, SQ.reducer, L.rMatch([5, 11], [7, 11], [11, 9], [11, 8], [12, 10]), { scoring: 'psa' });
    const b = rallyMatchRecords(s);
    assert.ok(s.ended);
    assert.deepEqual(of(b, 'comeback').map((i) => [i.side, i.text]), [['home', '3–2 from 0-2 down']]);
    assert.deepEqual(of(b, 'longestMatch').map((i) => i.value), [5 * 10000 + 95]);
  });
  test('an unfinished match has no records', () => {
    assert.equal(tennisMatchRecords(play(tennis.init, tennis.reducer, L.TENNIS_TWO_ALL, { setsToWin: 3 })), null);
  });
});

/* ------------------------------------------------- tournament aggregation -- */

const team = (id: string, name: string, sport: SportId): Team => ({ id, name, shortName: name.slice(0, 3), sport });
let mseq = 0;
const M = (sport: SportId, h: Team, a: Team, state: unknown, o: Partial<Match> = {}): Match =>
  ({ id: `m${++mseq}`, sport, status: 'completed', startsAt: `2026-10-${String(mseq).padStart(2, '0')}T10:00:00Z`, homeTeam: h, awayTeam: a, state, ...o } as Match);
const blk = (...items: MatchRecordsBlock['items']): MatchRecordsBlock => ({ v: 1, items });

describe('tournament Records — ranking across matches', () => {
  const R = team('r', 'Red House', 'football');
  const B = team('b', 'Blue House', 'football');
  const ms: Match[] = [];
  for (let i = 1; i <= 7; i++) ms.push(M('football', R, B, { [MATCH_RECORDS_KEY]: blk({ type: 'mostGoals', value: i, text: `${i}–0` }, { type: 'fastestGoal', value: 10 - i, text: `${10 - i}'`, side: 'away', playerId: `p${i}`, playerName: `P${i}` }) }));
  ms.push(M('football', R, B, { [MATCH_RECORDS_KEY]: blk({ type: 'mostGoals', value: 7, text: 'late 7' }) }));
  ms.push(M('football', R, B, { [MATCH_RECORDS_KEY]: blk({ type: 'mostGoals', value: 99, text: 'w/o' }) }, { result: { kind: 'walkover', winner: 'home' } as never }));
  ms.push(M('football', R, B, { [MATCH_RECORDS_KEY]: blk({ type: 'mostGoals', value: 98, text: 'live' }) }, { status: 'live' }));
  ms.push(M('cricket', R, B, { [MATCH_RECORDS_KEY]: blk({ type: 'teamHigh', value: 500, text: '500' }) }));
  const secs = tournamentRecords('football', ms);
  test('top 5 per type, best first; a tie keeps the earlier match; manual / live / other sports ignored', () => {
    const most = secs.find((x) => x.type.key === 'mostGoals')!;
    assert.deepEqual(most.rows.map((r) => r.item.text), ['7–0', 'late 7', '6–0', '5–0', '4–0']);
    assert.equal(most.rows[0].context, 'Red House v Blue House');
  });
  test('a "low" record ranks ascending; team rows carry the team and the opponent', () => {
    const fast = secs.find((x) => x.type.key === 'fastestGoal')!;
    assert.deepEqual(fast.rows.map((r) => r.item.value), [3, 4, 5, 6, 7]);
    assert.deepEqual([fast.rows[0].teamName, fast.rows[0].context], ['Blue House', 'vs Red House']);
  });
  test('sections follow the sport\'s type order; empty types are left out', () => {
    assert.deepEqual(secs.map((x) => x.type.key), ['mostGoals', 'fastestGoal']);
  });
  test('derive stands in for a match with no stored block (a real hook over its snapshot)', () => {
    let fs = football.init();
    fs = football.reducer(fs, { type: 'KICKOFF', payload: { at: 1, ord: true } });
    fs = football.reducer(fs, { type: 'GOAL', side: 'home', payload: { pid: 'h1', minute: 1, half: 1 }, attribution: { playerId: 'h1', stat: 'goals', playerName: 'H1' } });
    fs = football.reducer(fs, { type: 'END', payload: { at: 2 } });
    const out = tournamentRecords('football', [M('football', R, B, fs)], { derive: (m) => MATCH_RECORD_HOOKS.football!(m.state) });
    assert.deepEqual(out.find((x) => x.type.key === 'biggestWin')?.rows.map((r) => [r.teamName, r.item.text]), [['Red House', '1–0']]);
    assert.equal(tournamentRecords('football', [M('football', R, B, fs)]).length, 0); // no derive → nothing
  });
  test('results sports have no record types (SD-137a: carrom and golf match play now do)', () => {
    for (const s of ['athletics', 'swimming'] as SportId[]) assert.equal(MATCH_RECORD_TYPES[s], undefined);
    assert.ok(MATCH_RECORD_HOOKS.golf && MATCH_RECORD_HOOKS.carrom);
  });
});

/* -------------------------------------------------------------- backfill -- */

describe('backfill planner — dry-run diff, keys-only, idempotent', () => {
  const e = CRICKET_SEED_EXPECT.find((x) => x.id === 'ck2')!;
  const full = replayLog({ createInitialState: cricket.init, reducer: cricket.reducer }, { overs: e.overs, playersPerSide: e.players }, CRICKET_MATCH_EVENTS.ck2);
  const stored = cricket.snapshotState(full) as unknown as Record<string, unknown>; // a pre-SD-51 snapshot
  const rec = cricketMatchRecords(full);
  test('an old snapshot (no block) → change, every type listed', () => {
    const d = recordsDiff(stored, rec);
    assert.equal(d.change, true);
    assert.equal(d.before, 0);
    assert.equal(d.after, rec!.items.length);
    assert.ok(d.types.includes('partnership') && d.types.includes('teamHigh'));
  });
  test('the write swaps ONLY the records key; a second run is a no-op', () => {
    const next = stateWithRecords(stored, rec);
    const { [MATCH_RECORDS_KEY]: blockAfter, ...rest } = next;
    assert.deepEqual(rest, stored);
    assert.deepEqual(blockAfter, rec);
    assert.deepEqual(recordsDiff(next, rec), { change: false, before: rec!.items.length, after: rec!.items.length, types: [] });
  });
  test('a changed figure is reported by type; a malformed block is rewritten; a block with nothing to record is removed', () => {
    const tweaked = stateWithRecords(stored, { v: 1, items: rec!.items.map((i) => (i.type === 'marginRuns' ? { ...i, value: 1 } : i)) });
    assert.deepEqual(recordsDiff(tweaked, rec).types, ['marginRuns']);
    assert.equal(recordsDiff({ ...stored, [MATCH_RECORDS_KEY]: { v: 9 } }, rec).change, true);
    const gone = recordsDiff(stateWithRecords(stored, rec), null);
    assert.equal(gone.change, true);
    assert.equal(MATCH_RECORDS_KEY in stateWithRecords(stateWithRecords(stored, rec), null), false);
  });
  test('every seeded cricket match replays to a block (dry run over the demo logs)', () => {
    for (const x of CRICKET_SEED_EXPECT) {
      const st = replayLog({ createInitialState: cricket.init, reducer: cricket.reducer }, { overs: x.overs, playersPerSide: x.players }, CRICKET_MATCH_EVENTS[x.id]);
      const r = cricketMatchRecords(st);
      assert.ok(r && of(r, 'teamHigh').length === 2, x.id);
      assert.equal(recordsDiff(cricket.snapshotState(st), r).change, true);
    }
  });
});
