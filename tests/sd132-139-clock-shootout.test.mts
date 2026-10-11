/**
 * SD-132 — a stoppable game clock for basketball (5×5 and 3×3) and futsal,
 * the 3×3 rules (first to 2 in overtime, the team-foul ladder) and the FIBA
 * 3×3 standings preset. SD-139 — the scorer picks who goes first in every
 * shoot-out, and again in sudden death where the rules allow a new order.
 *
 * Everything is behind new optional format keys / new action types, so older
 * logs replay exactly as before (the legacy oracles in basketball.test.mts,
 * sd122-basketball-side-fouls.test.mts and football.test.mts stay green).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { ScoreAction } from '../src/sports/types.ts';
import type { Match } from '../src/core/types.ts';
import {
  init as bbInit, reducer as bbReducer, gameSec, clockLeft, clockRunning, timeUp, timedPeriod, timeoutStatus,
  freeThrowsFor, possessionAfterFoul, otPoints, eventClock, type BasketballState,
} from '../src/sports/basketball/engine.ts';
import { basketballTotals } from '../src/sports/basketball/fieldTime.ts';
import {
  init as fbInit, reducer as fbReducer, gcSec, gcRunning, gcTimeUp, futsalTimeout, accumulatedFouls, type FootballState,
} from '../src/sports/football/engine.ts';
import { liveClockMinutes } from '../src/sports/football/fieldTime.ts';
import { init as hkInit, reducer as hkReducer, nextShooter, needsSdPick as hkNeedsPick, type HockeyState } from '../src/sports/hockey/engine.ts';
import { hockeyTimeline } from '../src/sports/hockey/timeline.ts';
import { init as hbInit, reducer as hbReducer, nextThrower, needsSdPick as hbNeedsPick, type HandballState } from '../src/sports/handball/engine.ts';
import { handballTimeline } from '../src/sports/handball/timeline.ts';
import { newTournamentFormats, standingsConfigFromFormat, standingsPresets, teamStandings } from '../src/data/standings.ts';

type Side = 'home' | 'away';
const T0 = 1_700_000_000_000;
const MIN = 60_000;
const bb = (s: BasketballState, ...as: ScoreAction[]) => as.reduce(bbReducer, s);
const FIBA = { regPeriods: 4, periodMinutes: 10, foulsToFoulOut: 5, foulsForBonus: 4, overtimeMinutes: 5, timeoutRule: 'fiba', gameClock: true };
/** a live play as the controls send it on the game clock: quarter, minute, clock second, `at`, v: 2 */
const play = (type: string, side: Side, q: number, sec: number, at: number, extra: Record<string, unknown> = {}, name?: string, pid?: string): ScoreAction => ({
  type, side, payload: { quarter: q, minute: Math.floor(sec / 60), sec, at, v: 2, ...(pid ? { pid } : {}), ...extra },
  ...(name ? { attribution: { playerId: pid ?? name, stat: 'points', playerName: name } } : {}),
});

describe('SD-132 — basketball game clock', () => {
  test('no `gameClock` key → no clock on the state (older matches keep their exact shape)', () => {
    const s = bbInit({ regPeriods: 4, periodMinutes: 10 });
    assert.equal('gc' in s, false);
    assert.equal(timedPeriod(s), false);
    const t = bb(s, { type: 'KICKOFF', payload: { at: T0 } }, { type: 'CLOCK', payload: { run: false, at: T0 + MIN } });
    assert.equal('gc' in t, false, 'CLOCK is ignored without a game clock');
  });

  test('tip-off starts it; stop / start / set time; holds at 0:00', () => {
    let s = bb(bbInit(FIBA), { type: 'KICKOFF', payload: { at: T0 } });
    assert.equal(clockRunning(s), true);
    assert.equal(gameSec(s, T0 + 95_000), 95);
    assert.equal(clockLeft(s, T0 + 95_000), 505);
    s = bb(s, { type: 'CLOCK', payload: { run: false, at: T0 + 100_000 } });
    assert.equal(clockRunning(s), false);
    assert.equal(gameSec(s, T0 + 10 * MIN), 100, 'a stopped clock does not move');
    s = bb(s, { type: 'CLOCK', payload: { run: true, at: T0 + 10 * MIN } });
    assert.equal(gameSec(s, T0 + 10 * MIN + 20_000), 120);
    s = bb(s, { type: 'SET_CLOCK', payload: { left: 60, at: T0 + 11 * MIN } });
    assert.equal(clockLeft(s, T0 + 11 * MIN), 60, 'the table shows 1:00');
    assert.equal(timeUp(s, T0 + 11 * MIN + 59_000), false);
    assert.equal(timeUp(s, T0 + 13 * MIN), true, '0:00 → end-of-period prompt');
    assert.equal(clockLeft(s, T0 + 30 * MIN), 0, 'held at 0:00');
    s = bb(s, { type: 'NEXT_QUARTER' });
    assert.deepEqual(s.gc, { ms: 0 }, 'a new quarter starts from 10:00, stopped');
  });

  test('a foul and a time-out stop the clock; a re-entered (edited) play without `at` does not', () => {
    let s = bb(bbInit(FIBA), { type: 'KICKOFF', payload: { at: T0 } });
    s = bb(s, play('FOUL', 'home', 1, 30, T0 + 30_000, { foulType: 'personal' }, 'Asha', 'p1'));
    assert.equal(clockRunning(s), false);
    assert.equal(s.events.at(-1)!.sec, 30, 'the play carries its clock second');
    s = bb(s, { type: 'CLOCK', payload: { run: true, at: T0 + 60_000 } });
    s = bb(s, { type: 'FOUL', side: 'away', payload: { quarter: 1, minute: 0, sec: 10, v: 2, foulType: 'personal' } });
    assert.equal(clockRunning(s), true, 'an edit stamped at an old moment leaves the clock alone');
    s = bb(s, play('TIMEOUT', 'away', 1, 45, T0 + 75_000));
    assert.equal(clockRunning(s), false);
  });

  test('FIBA Art. 49.2.3 — a field goal stops the clock only in the last 2 minutes of Q4 / OT', () => {
    let s = bb(bbInit(FIBA), { type: 'NEXT_QUARTER' }, { type: 'NEXT_QUARTER' }, { type: 'NEXT_QUARTER' }, { type: 'KICKOFF', payload: { at: T0 } });
    s = bb(s, play('SCORE', 'home', 4, 400, T0 + 400_000, { points: 2 }));
    assert.equal(clockRunning(s), true, '3:20 left: keeps running');
    s = bb(s, play('SCORE', 'home', 4, 500, T0 + 500_000, { points: 2 }));
    assert.equal(clockRunning(s), false, '1:40 left: stops');
    assert.equal(eventClock(s, s.events.at(-1)!), '01:40', 'the timeline reads the time left');
  });

  test('the last-2-minutes time-out cap is on the real clock, not wall minutes since tip-off', () => {
    let s = bb(bbInit(FIBA), { type: 'NEXT_QUARTER' }, { type: 'NEXT_QUARTER' }, { type: 'NEXT_QUARTER' }, { type: 'KICKOFF', payload: { at: T0 } });
    // a long stoppage: 25 real minutes in, but only 7:50 played (2:10 left)
    s = bb(s, play('TIMEOUT', 'home', 4, 470, T0 + 25 * MIN));
    s = bb(s, play('TIMEOUT', 'home', 4, 500, T0 + 30 * MIN));
    s = bb(s, play('TIMEOUT', 'home', 4, 530, T0 + 35 * MIN));
    // 3 used in the 2nd half: none left anyway; the late cap counts the two at ≤ 2:00
    const st = timeoutStatus(s, 'home', { quarter: 4, minute: 9 });
    assert.equal(st.left, 0);
    const s2 = bb(bbInit(FIBA), { type: 'NEXT_QUARTER' }, { type: 'NEXT_QUARTER' }, { type: 'NEXT_QUARTER' }, { type: 'KICKOFF', payload: { at: T0 } },
      play('TIMEOUT', 'away', 4, 300, T0 + 40 * MIN));
    // 40 wall minutes after tip-off but 5:00 left on the clock — not the last 2 minutes
    assert.equal(timeoutStatus(s2, 'away', { quarter: 4, minute: Math.floor(gameSec(s2, 0) / 60) }).late, false);
    assert.equal(timeoutStatus(s2, 'away', { quarter: 4, minute: 5 }).left, 2);
  });

  test('MIN and +/- follow the clock seconds, not the wall clock', () => {
    const lineup: ScoreAction = { type: 'SET_LINEUP', payload: {
      home: ['H1', 'H2', 'H3', 'H4', 'H5'], away: ['A1', 'A2', 'A3', 'A4', 'A5'],
      ids: { H1: 'h1', H2: 'h2', H3: 'h3', H4: 'h4', H5: 'h5', A1: 'a1', A2: 'a2', A3: 'a3', A4: 'a4', A5: 'a5', H6: 'h6' } } };
    let s = bb(bbInit(FIBA), lineup, { type: 'KICKOFF', payload: { at: T0 } });
    s = bb(s, play('SCORE', 'home', 1, 120, T0 + 4 * MIN, { points: 2 }, 'H2', 'h2'));
    // H1 goes off at 5:00 played — 20 real minutes after tip-off
    s = bb(s, play('SUB', 'home', 1, 300, T0 + 20 * MIN, { offName: 'H1', onName: 'H6', offId: 'h1', onId: 'h6' }));
    s = bb(s, play('SCORE', 'away', 1, 400, T0 + 22 * MIN, { points: 3 }, 'A1', 'a1'));
    s = bb(s, { type: 'NEXT_QUARTER' }, { type: 'NEXT_QUARTER' }, { type: 'NEXT_QUARTER' }, { type: 'END' });
    const t = basketballTotals(s);
    assert.equal(t.h1.stats.minutes, 5);
    assert.equal(t.h1.stats.plusMinus, 2, 'on for the +2, off before the away 3');
    assert.equal(t.h6.stats.minutes, 35);
    assert.equal(t.h6.stats.plusMinus, -3);
  });
});

describe('SD-132 — 3×3 (FIBA 3×3 Rules)', () => {
  const X3 = { regPeriods: 1, periodMinutes: 10, overtimeMinutes: 0, targetPoints: 21, winBy: 1, foulsForBonus: 6, foulsToFoulOut: 0, otFoulsCarry: true, techIsTeamFoul: true, timeouts: 1, gameClock: true, otTarget: 2, foulLadder: '3x3' };
  const pts = (side: Side, n: number) => ({ type: 'SCORE', side, payload: { points: n, quarter: 1, minute: 0 } } as ScoreAction);
  const level = (cfg: Record<string, unknown>) => {
    let s = bbInit(cfg);
    for (let i = 0; i < 9; i++) s = bb(s, pts('home', 2), pts('away', 2));
    return bb(s, { type: 'START_OVERTIME' });
  };

  test('first to 21 still ends the game early', () => {
    let s = bbInit(X3);
    for (let i = 0; i < 10; i++) s = bb(s, pts('home', 2));
    s = bb(s, pts('home', 1));
    assert.equal(s.ended, true);
  });

  test('overtime: the first side to score 2 points wins (Art. 6.4)', () => {
    let s = level(X3);
    assert.equal(s.quarter, 2);
    assert.equal(timedPeriod(s), false, 'overtime is untimed');
    s = bb(s, { type: 'SCORE', side: 'home', payload: { points: 1, quarter: 2, minute: 0 } });
    assert.equal(s.ended, false);
    s = bb(s, { type: 'SCORE', side: 'away', payload: { points: 2, quarter: 2, minute: 0 } });
    assert.equal(s.ended, true);
    assert.equal(otPoints(s, 'away'), 2);
    assert.equal(s.away, 20);
  });

  test('older 3×3 matches (no `otTarget`) keep playing overtime as before', () => {
    const s = bb(level({ ...X3, otTarget: undefined }), { type: 'SCORE', side: 'away', payload: { points: 2, quarter: 2, minute: 0 } });
    assert.equal(s.ended, false);
  });

  test('team-foul ladder: shooting 1 inside the arc; 7–9 → 2; 10+ → 2 + possession (Art. 15)', () => {
    let s = bbInit(X3);
    assert.equal(freeThrowsFor(s, 'home', 'shooting'), 1);
    assert.equal(freeThrowsFor(s, 'home', 'personal'), 0);
    const foul = { type: 'FOUL', side: 'home', payload: { foulType: 'personal', quarter: 1, minute: 0 } } as ScoreAction;
    for (let i = 0; i < 6; i++) s = bb(s, foul);
    assert.equal(freeThrowsFor(s, 'home', 'personal'), 2, 'the 7th team foul');
    assert.equal(freeThrowsFor(s, 'home', 'shooting'), 2);
    assert.equal(possessionAfterFoul(s, 'home', 'personal'), false);
    for (let i = 0; i < 3; i++) s = bb(s, foul);
    assert.equal(possessionAfterFoul(s, 'home', 'personal'), true, 'the 10th team foul');
    assert.equal(possessionAfterFoul(s, 'home', 'offensive'), false);
    assert.equal(freeThrowsFor(s, 'home', 'offensive'), 0);
  });

  test('5×5 free throws are unchanged without the ladder', () => {
    const s = bbInit({ foulsForBonus: 4 });
    assert.equal(freeThrowsFor(s, 'home', 'shooting'), 2);
    assert.equal(possessionAfterFoul(s, 'home', 'personal'), false);
  });
});

describe('SD-132 (BK-13) — FIBA 3×3 standings preset', () => {
  const bm = (h: string, a: string, hs: number, as: number): Match =>
    ({ id: `${h}-${a}-${hs}`, sport: 'basketball', status: 'completed', startsAt: '', score: { home: hs, away: as },
      winner: hs > as ? 'home' : 'away', homeTeam: { id: h, name: h }, awayTeam: { id: a, name: a }, state: null }) as unknown as Match;
  const p3 = () => standingsPresets('basketball').find((p) => p.id === 'fiba3x3')!;

  test('the preset is offered and a new 3×3 event starts on it; 5×5 keeps FIBA 2-1', () => {
    assert.ok(p3());
    const f3 = newTournamentFormats(['basketball'], { basketball: { preset: '3x3' } }).basketball!;
    assert.equal(f3.rankBy, 'winPct');
    const f5 = newTournamentFormats(['basketball'], { basketball: { preset: 'fiba' } }).basketball!;
    assert.equal(f5.rankBy, undefined);
    assert.equal(f5.lossPoints, 1);
  });

  test('ranked by win % when teams played a different number of games', () => {
    const cfg = standingsConfigFromFormat('basketball', p3().set);
    // A: 2-1 (67%), B: 1-0 (100%), C: 0-2, D: 1-1
    const ms = [bm('A', 'C', 21, 10), bm('A', 'D', 21, 15), bm('D', 'A', 21, 19), bm('B', 'C', 21, 12)];
    const order = teamStandings(ms, 'basketball', cfg).map((r) => r.teamId);
    assert.deepEqual(order, ['B', 'A', 'D', 'C']);
  });

  test('two tied → head-to-head; three tied → average points scored', () => {
    const cfg = standingsConfigFromFormat('basketball', p3().set);
    const two = [bm('A', 'B', 15, 21), bm('A', 'C', 21, 5), bm('B', 'C', 10, 21)];
    // A, B, C all 1-1: three tied → average points: A 18, B 15.5, C 13
    assert.deepEqual(teamStandings(two, 'basketball', cfg).map((r) => r.teamId), ['A', 'B', 'C']);
    const pair = [bm('A', 'B', 15, 21), bm('A', 'C', 21, 5), bm('B', 'D', 10, 21), bm('C', 'D', 21, 20)];
    // A 1-1, B 1-1 (B beat A), C 1-1, D 1-1 → 4 tied: average points A 18, B 15.5, C 13, D 20.5
    assert.deepEqual(teamStandings(pair, 'basketball', cfg).map((r) => r.teamId), ['D', 'A', 'B', 'C']);
    const h2h = [bm('A', 'B', 12, 21), bm('A', 'C', 21, 20), bm('B', 'D', 10, 21), bm('C', 'D', 21, 5)];
    // A 1-1 (avg 16.5), B 1-1 (avg 15.5) … all four 1-1 → avg: C 20.5, A 16.5, B 15.5, D 13
    assert.deepEqual(teamStandings(h2h, 'basketball', cfg).map((r) => r.teamId), ['C', 'A', 'B', 'D']);
    const onlyTwo = [bm('A', 'B', 12, 21), bm('A', 'C', 21, 20), bm('B', 'C', 5, 21), bm('C', 'D', 21, 0), bm('D', 'A', 0, 21)];
    // A 2-1 (avg 18), C 2-1 (avg 20.7): exactly two tied → head-to-head first (A beat C)
    const r = teamStandings(onlyTwo, 'basketball', cfg).map((x) => x.teamId);
    assert.deepEqual(r.slice(0, 2), ['A', 'C']);
  });
});

describe('SD-132 — futsal stopped clock, time-outs, accumulated fouls', () => {
  const FUTSAL = { playersPerSide: 5, halfMinutes: 20, stoppedClock: true, futsal: true, extraTimeMinutes: 5, decider: 'extra_time' };
  const fb = (s: FootballState, ...as: ScoreAction[]) => as.reduce(fbReducer, s);
  const foul = (side: Side, half: 1 | 2 | 3 | 4): ScoreAction => ({ type: 'STAT', side, payload: { kind: 'foul', minute: 1, half } });

  test('11-a-side (no keys) is unchanged: no clock, time-outs ignored', () => {
    const s = fb(fbInit({}), { type: 'KICKOFF', payload: { at: T0 } }, { type: 'TIMEOUT', side: 'home', payload: { at: T0 + MIN } });
    assert.equal('gc' in s, false);
    assert.equal('futsal' in s, false);
    assert.equal(s.events.length, 0);
  });

  test('the clock runs from kick-off, stops and restarts; minutes come from time played', () => {
    let s = fb(fbInit(FUTSAL), { type: 'KICKOFF', payload: { at: T0, ord: true } });
    assert.equal(gcRunning(s), true);
    s = fb(s, { type: 'CLOCK', payload: { run: false, at: T0 + 3 * MIN } });
    assert.equal(gcSec(s, T0 + 30 * MIN), 180);
    assert.equal(liveClockMinutes(s, T0 + 30 * MIN), 3, 'not 30 wall minutes');
    s = fb(s, { type: 'CLOCK', payload: { run: true, at: T0 + 10 * MIN } });
    assert.equal(gcSec(s, T0 + 12 * MIN), 300);
    s = fb(s, { type: 'SET_CLOCK', payload: { sec: 19 * 60 + 30, at: T0 + 12 * MIN } });
    assert.equal(gcTimeUp(s, T0 + 12 * MIN + 29_000), false);
    assert.equal(gcTimeUp(s, T0 + 12 * MIN + 31_000), true, '20:00 played → time is up');
    s = fb(s, { type: 'NEXT_HALF', payload: { at: T0 + 13 * MIN } });
    assert.deepEqual(s.gc, { ms: 0 });
    s = fb(s, { type: 'KICKOFF', payload: { at: T0 + 20 * MIN } });
    assert.equal(liveClockMinutes(s, T0 + 21 * MIN), 21, 'the 2nd half counts on from 20');
  });

  test('time-outs: 1 per team per half, the clock stops, none in extra time (Law 7)', () => {
    let s = fb(fbInit(FUTSAL), { type: 'KICKOFF', payload: { at: T0 } });
    assert.equal(futsalTimeout(s, 'home').left, 1);
    s = fb(s, { type: 'TIMEOUT', side: 'home', payload: { at: T0 + 4 * MIN, minute: 5, half: 1 } });
    assert.equal(gcRunning(s), false);
    assert.equal(s.events.at(-1)!.type, 'timeout');
    assert.equal(futsalTimeout(s, 'home').ok, false);
    assert.equal(futsalTimeout(s, 'away').left, 1);
    s = fb(s, { type: 'NEXT_HALF', payload: { at: T0 + 30 * MIN } });
    assert.equal(futsalTimeout(s, 'home').left, 1, 'a fresh one in the 2nd half');
    s = fb(s, { type: 'END' }, { type: 'START_EXTRA_TIME' });
    assert.equal(s.etMinutes, 5, 'futsal extra time is 2 × 5');
    assert.equal(futsalTimeout(s, 'home').ok, false);
  });

  test('accumulated fouls per half; the 2nd half carries into extra time (Law 13)', () => {
    let s = fb(fbInit(FUTSAL), { type: 'KICKOFF', payload: { at: T0 } }, foul('home', 1), foul('home', 1), foul('away', 1));
    assert.equal(accumulatedFouls(s, 'home'), 2);
    s = fb(s, { type: 'NEXT_HALF' }, { type: 'KICKOFF', payload: { at: T0 + 30 * MIN } }, foul('home', 2));
    assert.equal(accumulatedFouls(s, 'home'), 1, 'the count restarts in the 2nd half');
    s = fb(s, { type: 'END' }, { type: 'START_EXTRA_TIME' }, { type: 'KICKOFF', payload: { at: T0 + 60 * MIN } }, foul('home', 3));
    assert.equal(accumulatedFouls(s, 'home'), 2, '2nd-half fouls count on in extra time');
  });
});

describe('SD-139 — the scorer picks the shoot-out order', () => {
  const kicks = <S,>(reducer: (s: S, a: ScoreAction) => S, s: S, next: (s: S) => Side, n: number, scored = true): S => {
    for (let i = 0; i < n; i++) s = reducer(s, { type: 'SO', side: next(s), payload: { scored } });
    return s;
  };

  test('hockey: first pick, sudden-death pick, FIH order kept on older logs', () => {
    let s: HockeyState = hkInit({ decider: 'shootout' });
    s = hkReducer({ ...s, ended: true }, { type: 'START_SHOOTOUT', payload: { first: 'away' } });
    assert.equal(nextShooter(s.shootout!), 'away');
    assert.equal(hkReducer(s, { type: 'SO_ORDER', payload: { first: 'home' } }), s, 'no pick before 5 each');
    s = kicks(hkReducer, s, (x) => nextShooter(x.shootout!), 10);
    assert.equal(hkNeedsPick(s), true);
    assert.equal(nextShooter(s.shootout!), 'home', 'without a pick: FIH order (the side that went second)');
    const picked = hkReducer(s, { type: 'SO_ORDER', payload: { first: 'away' } });
    assert.equal(picked.shootout!.sdFirst, 'away');
    assert.equal(nextShooter(picked.shootout!), 'away');
    assert.equal(hkNeedsPick(picked), false);
    const rows = hockeyTimeline(picked, { home: 'India', away: 'Spain' }).filter((r) => r.kind === 'soOrder');
    assert.deepEqual(rows.map((r) => r.label), ['Shoot-out — Spain shoot first', 'Sudden death — Spain shoot first']);
  });

  test('handball: first pick, sudden-death pick, same order kept on older logs', () => {
    let s: HandballState = hbInit({ decider: 'shootout' });
    s = hbReducer({ ...s, ended: true }, { type: 'START_SHOOTOUT', payload: { first: 'home' } });
    s = kicks(hbReducer, s, (x) => nextThrower(x.shootout!), 10, false);
    assert.equal(hbNeedsPick(s), true);
    assert.equal(nextThrower(s.shootout!), 'home', 'without a pick: same order as before');
    const picked = hbReducer(s, { type: 'SO_ORDER', payload: { first: 'away' } });
    assert.equal(nextThrower(picked.shootout!), 'away');
    const after = hbReducer(picked, { type: 'SO', side: 'away', payload: { scored: true } });
    assert.equal(nextThrower(after.shootout!), 'home');
    const rows = handballTimeline(picked, { home: 'Kiel', away: 'Veszprém' }).filter((r) => r.kind === 'soOrder');
    assert.equal(rows[0].label, '7-metre throws — Kiel throw first');
    assert.equal(rows[1].label, 'Sudden death — Veszprém throw first');
  });

  test('football keeps the toss pick on the state (Law 10: same order in sudden death)', () => {
    const s = fbReducer({ ...fbInit({ decider: 'penalties' }), ended: true }, { type: 'START_SHOOTOUT', payload: { first: 'away' } });
    assert.equal(s.shootout!.first, 'away');
  });
});
