/**
 * SD-117a — football / hockey / basketball flow + rule follow-ups from
 * docs/sport-depth/scorer-ux-audit-sports.md:
 *  - football F12 (shootout "who kicks first?"), F13 (team officials carded —
 *    no stat line, no sending-off of a player, not in fair play);
 *  - hockey H6 (penalty-corner outcomes linked to the PC), H7 (circle entries
 *    as a team stat, "not tracked" on matches that never logged one);
 *  - basketball B8 / B11 (free throws a foul gives), B12 (FIBA U / D fouls and
 *    the 2T / 2U / T + U / D disqualifications).
 * Every new key rides only on new actions, so an old log replays to exactly
 * the state it always did (REVIEW Decision 8).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { ScoreAction } from '../src/sports/types.ts';
import * as fb from '../src/sports/football/engine.ts';
import { footballStatTotals } from '../src/sports/football/totals.ts';
import * as hk from '../src/sports/hockey/engine.ts';
import { hockeyBox } from '../src/sports/hockey/box.ts';
import { hockeyStats } from '../src/sports/hockey/stats.ts';
import { hockeyTimeline } from '../src/sports/hockey/timeline.ts';
import { comparisonRows } from '../src/sports/boxScore.ts';
import * as bb from '../src/sports/basketball/engine.ts';
import { validateSchema } from '../src/sports/statSchema.ts';

const run = <S,>(reducer: (s: S, a: ScoreAction) => S, s0: S, actions: ScoreAction[]): S => actions.reduce(reducer, s0);

/* --------------------------------- football --------------------------------- */

describe('SD-117 · football', () => {
  const level = (cfg: Record<string, unknown> = { decider: 'penalties' }) =>
    run(fb.reducer, fb.init(cfg), [{ type: 'KICKOFF', payload: { at: 1, ord: true } }, { type: 'END', payload: { at: 2 } }]);

  test('F12: the toss winner kicks first; an old START_SHOOTOUT keeps its exact shape', () => {
    const away = fb.reducer(level(), { type: 'START_SHOOTOUT', payload: { first: 'away' } });
    assert.deepEqual(away.shootout, { home: [], away: [], first: 'away' });
    const old = fb.reducer(level(), { type: 'START_SHOOTOUT' });
    assert.deepEqual(old.shootout, { home: [], away: [] });
    // the shootout is decided the same way whoever kicks first
    const kicks: ScoreAction[] = [
      ['away', true], ['home', false], ['away', true], ['home', true], ['away', true], ['home', false], ['away', true],
    ].map(([side, scored]) => ({ type: 'PEN', side: side as 'home' | 'away', payload: { scored } }));
    assert.equal(run(fb.reducer, away, kicks).shootoutWinner, 'away');
  });

  test('F13: a team official\'s card — on the timeline, on no stat line, not a player\'s card', () => {
    const s = run(fb.reducer, fb.init({}), [
      { type: 'KICKOFF', payload: { at: 1, ord: true } },
      { type: 'YELLOW', side: 'home', payload: { minute: 10, half: 1, official: true, officialName: 'Coach Rao' } },
      { type: 'RED', side: 'home', payload: { minute: 20, half: 1, official: true, officialName: 'Coach Rao' } },
      { type: 'YELLOW', side: 'away', payload: { minute: 30, half: 1, pid: 'a1' }, attribution: { playerId: 'a1', playerName: 'A One', stat: 'yellowCards' } },
    ]);
    const off = s.events.filter((e) => e.official);
    assert.equal(off.length, 2);
    assert.equal(off[0].playerName, 'Coach Rao');
    assert.equal(off[0].playerId, undefined);
    // no stat line for the official, the player's card still credited
    const t = footballStatTotals(s);
    assert.deepEqual(Object.keys(t), ['a1']);
    assert.equal(t.a1.stats.yellowCards, 1);
    // team card counts and fair play are about players
    const st = fb.footballStats(s, 0);
    assert.equal(st.totals.home.yellow, 0);
    assert.equal(st.totals.home.red, 0);
    assert.deepEqual(fb.fairPlayScore(s.events), { home: 0, away: -1 });
    // a player who shares the official's name isn't paired with his cards
    const yellow = s.events.find((e) => e.type === 'yellow' && e.official)!;
    assert.equal(fb.pairedSecondYellowRed(s.events, yellow), undefined);
  });

  test('F13: a player card keeps exactly the old event shape (no `official` key)', () => {
    const s = fb.reducer(fb.init({}), { type: 'YELLOW', side: 'home', payload: { minute: 5, half: 1 }, attribution: { playerId: 'h1', playerName: 'H', stat: 'yellowCards' } });
    assert.ok(!('official' in s.events[0]));
  });
});

/* ---------------------------------- hockey ---------------------------------- */

describe('SD-117 · hockey', () => {
  let n = 0;
  const A = (type: string, side: 'home' | 'away', payload: Record<string, unknown> = {}): ScoreAction =>
    ({ type, side, payload: { uid: `x${++n}`, sec: 60 * n, period: 1, ...payload } });

  test('H6: PC outcomes — saved / wide / goal ride on the attempt, defended / stroke on PC_OUTCOME', () => {
    let s = hk.init({});
    s = run(hk.reducer, s, [
      A('PC', 'home', { uid: 'pc1' }),
      A('SHOT', 'home', { onGoal: true, uid: 'sh1', pcRef: 'pc1' }),
      A('PC', 'home', { uid: 'pc2' }),
      A('SHOT', 'home', { onGoal: false, pcRef: 'pc2' }),
      A('PC', 'away', { uid: 'pc3' }),
      A('GOAL', 'away', { goalType: 'pc', pcRef: 'pc3' }),
      A('PC', 'away', { uid: 'pc4' }),
      { type: 'PC_OUTCOME', side: 'away', payload: { id: 'pc4', result: 'defended' } },
      A('PC', 'home', { uid: 'pc5' }),
      { type: 'PC_OUTCOME', side: 'home', payload: { id: 'pc5', result: 'stroke' } },
    ]);
    const res = (id: string) => s.events.find((e) => e.id === id)?.pcResult;
    assert.deepEqual(['pc1', 'pc2', 'pc3', 'pc4', 'pc5'].map(res), ['saved', 'wide', 'goal', 'defended', 'stroke']);
    assert.equal(s.events.find((e) => e.id === 'sh1')?.pcRef, 'pc1');
    assert.equal(s.away, 1);
    // removing the attempt takes the PC's outcome with it
    const r = hk.reducer(s, { type: 'REMOVE_EVENT', side: 'home', payload: { id: 'sh1' } });
    assert.equal(r.events.find((e) => e.id === 'pc1')?.pcResult, undefined);
    assert.equal(hk.openPc(r, 'home'), undefined, 'only the latest corner is "open"');
    // the timeline shows the outcome
    const row = hockeyTimeline(s).find((x) => x.kind === 'pc' && x.detail === 'defended');
    assert.ok(row);
  });

  test('H6: a re-awarded corner marks the one it replaces; an unknown id changes nothing', () => {
    const s = run(hk.reducer, hk.init({}), [A('PC', 'home', { uid: 'p1' }), A('PC', 'home', { uid: 'p2', reawardOf: 'p1' })]);
    assert.equal(s.events[0].pcResult, 'reawarded');
    assert.equal(hk.openPc(s, 'home')?.id, 'p2');
    assert.equal(hk.teamFigures(s, 'home').pcs, 2);
    assert.equal(hk.reducer(s, { type: 'PC_OUTCOME', side: 'home', payload: { id: 'nope', result: 'goal' } }), s);
  });

  test('H7: circle entries — one tap each, −1 takes the side\'s last back, per period', () => {
    let s = run(hk.reducer, hk.init({}), [
      A('CIRCLE', 'home'), A('CIRCLE', 'home'), A('CIRCLE', 'away'),
      A('CIRCLE', 'home', { period: 2 }), A('CIRCLE', 'away', { undo: true }),
    ]);
    assert.equal(hk.teamFigures(s, 'home').circleEntries, 3);
    assert.equal(hk.teamFigures(s, 'home', 1).circleEntries, 2);
    assert.equal(hk.teamFigures(s, 'away').circleEntries, 0);
    assert.ok(hk.circlesTracked(s));
    const cmp = comparisonRows(hockeyStats, hockeyBox(s).data('all'), 'all');
    const row = cmp.rows.find((r) => r.label === 'Circle entries');
    assert.deepEqual([row?.home, row?.away], ['3', '0']);
    s = hk.reducer(s, A('CIRCLE', 'away', { undo: true }));
    assert.equal(s.circles?.length, 3, 'nothing to take back');
  });

  test('H7: a match that never logged a circle entry reads "not tracked" (D8), and keeps its old state shape', () => {
    const s = run(hk.reducer, hk.init({}), [A('PC', 'home'), A('GOAL', 'home', { goalType: 'pc' })]);
    assert.ok(!('circles' in s));
    assert.ok(!hk.circlesTracked(s));
    const cmp = comparisonRows(hockeyStats, hockeyBox(s).data('all'), 'all');
    assert.ok(cmp.untracked.includes('Circle entries'));
    assert.ok(!cmp.rows.some((r) => r.label === 'Circle entries'));
    assert.ok(!s.events.some((e) => 'pcRef' in e || 'pcResult' in e));
    assert.deepEqual(validateSchema(hockeyStats), []);
  });
});

/* -------------------------------- basketball -------------------------------- */

describe('SD-117 · basketball', () => {
  const FIBA = { foulsToFoulOut: 5, foulsForBonus: 4, techIsTeamFoul: true, otFoulsCarry: true };
  const foul = (side: 'home' | 'away', name: string, foulType: string): ScoreAction =>
    ({ type: 'FOUL', side, payload: { foulType, quarter: 1, minute: 1 }, attribution: { playerName: name, playerId: name, stat: 'fouls' } });

  test('B12: D disqualifies; so do 2 T, 2 U and T + U — one T or one U doesn\'t', () => {
    const s0 = bb.init(FIBA);
    assert.equal(bb.disqualifyingFoul(s0, 'A', 'disqualifying'), 'D');
    assert.equal(bb.disqualifyingFoul(s0, 'A', 'technical'), undefined);
    assert.equal(bb.disqualifyingFoul(s0, 'A', 'unsportsmanlike'), undefined);
    const t = bb.reducer(s0, foul('home', 'A', 'technical'));
    assert.equal(bb.disqualifyingFoul(t, 'A', 'technical'), '2T');
    assert.equal(bb.disqualifyingFoul(t, 'A', 'unsportsmanlike'), 'T+U');
    assert.equal(bb.disqualifyingFoul(t, 'B', 'technical'), undefined, 'per player');
    assert.equal(bb.disqualifyingFoul(t, 'A', 'personal'), undefined);
    const u = bb.reducer(s0, foul('home', 'A', 'unsportsmanlike'));
    assert.equal(bb.disqualifyingFoul(u, 'A', 'unsportsmanlike'), '2U');
    assert.equal(bb.disqualifyingFoul(u, 'A', 'technical'), 'T+U');
  });

  test('B12: U and D are personal + team fouls; a rule ejection keeps its reason, a manual one has none', () => {
    let s = run(bb.reducer, bb.init(FIBA), [foul('home', 'A', 'unsportsmanlike'), foul('home', 'B', 'disqualifying')]);
    assert.equal(bb.foulCount(s, 'A'), 1);
    assert.equal(bb.teamFoulsThisQuarter(s, 'home'), 2);
    s = bb.reducer(s, { type: 'EJECT', side: 'home', payload: { reason: 'D' }, attribution: { playerName: 'B', playerId: 'B', stat: 'ejections' } });
    s = bb.reducer(s, { type: 'EJECT', side: 'home', payload: {}, attribution: { playerName: 'C', playerId: 'C', stat: 'ejections' } });
    const ej = s.events.filter((e) => e.type === 'eject');
    assert.equal(ej[0].reason, 'D');
    assert.ok(!('reason' in ej[1]));
    assert.ok(bb.isPlayerOut(s, 'B'));
  });

  test('B8 / B11: the free throws a foul gives the other side', () => {
    const s0 = bb.init(FIBA);
    assert.equal(bb.freeThrowsFor(s0, 'home', 'technical'), 1);
    assert.equal(bb.freeThrowsFor(s0, 'home', 'shooting'), 2);
    assert.equal(bb.freeThrowsFor(s0, 'home', 'unsportsmanlike'), 2);
    assert.equal(bb.freeThrowsFor(s0, 'home', 'disqualifying'), 2);
    assert.equal(bb.freeThrowsFor(s0, 'home', 'personal'), 0, 'not in the bonus yet');
    // 4 home team fouls: the 5th (and every further one) gives away 2 shots
    const four = run(bb.reducer, s0, ['A', 'B', 'C', 'D'].map((p) => foul('home', p, 'personal')));
    assert.equal(bb.freeThrowsFor(four, 'home', 'personal'), 2);
    assert.equal(bb.freeThrowsFor(four, 'home', 'offensive'), 0, 'an offensive foul never gives free throws');
    assert.equal(bb.freeThrowsFor(four, 'away', 'personal'), 0, 'the other side is not over the limit');
  });
});
