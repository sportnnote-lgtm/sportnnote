/**
 * SD-121 — Wave A P0s #4–#6:
 *  - cricket: "Rain — no more play" decides a chase on the DLS par score after
 *    the minimum overs (ICC Men's T20I PC 13.8: 5; ODI 20), with ICC NRR
 *    crediting (team 1 = par off team 2's overs); refused before the minimum;
 *  - chess: a knockout match runs mini-match → rapid → blitz → Armageddon until
 *    it has a winner; a level team knockout goes to the event's rule.
 * Every older log replays unchanged: RAIN_STOP is a new action (v: 2 only),
 * `ko` a new RESULT payload key, `minOvers` / `koPlan` only from new formats.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  init, reducer, outcome, nrrOvers, nrrRuns, rainStopPar, defaultMinOvers, minOversOf, chaseHasMinOvers, type CricketState,
} from '../src/sports/cricket/engine.ts';
import { resourcePct } from '../src/sports/cricket/dls.ts';
import * as chess from '../src/sports/chess/engine.ts';
import { chessTeamKoWinner, teamKoRuleWinner, koBreakOf, type TeamKoInput } from '../src/sports/chess/teamKo.ts';
import type { ScoreAction } from '../src/sports/types.ts';

const inn = (runs: number, wickets: number, balls: number) => ({ runs, wickets, balls, extras: 0 });
const seed = (s: CricketState, runs: number, wickets: number, balls: number): CricketState =>
  ({ ...s, scores: { ...s.scores, [s.battingSide]: inn(runs, wickets, balls) }, ballsInOver: balls % s.ballsPerOver === 0 && balls > 0 ? s.ballsPerOver : balls % s.ballsPerOver });
const END_INN: ScoreAction = { type: 'END_INNINGS' };
const STOP = (extra: Record<string, unknown> = {}): ScoreAction => ({ type: 'RAIN_STOP', payload: { v: 2, ...extra } });
/** Home bats first for `runs` in 20 overs, then away chases: `r2`/`w2` in `b2` balls. */
const chase = (cfg: Record<string, unknown>, runs: number, r2: number, w2: number, b2: number): CricketState => {
  const s = reducer(seed(init(cfg), runs, 4, Number(cfg.overs ?? 20) * 6), END_INN);
  return seed(s, r2, w2, b2);
};
const T20 = { overs: 20, dls: true };

describe('cricket — rain stops the chase (DLS par)', () => {
  test('par = team 1 runs × R2 used / R1 (Standard Edition), the score that ties', () => {
    const s = chase(T20, 160, 60, 2, 60);
    const r = resourcePct(20, 0);
    const used = r - resourcePct(10, 2);
    assert.equal(rainStopPar(s), Math.floor((160 * used) / r));
    assert.equal(rainStopPar(s), 72);
  });

  test('behind par after the minimum: team 1 wins by the runs short of par (DLS); NRR credits par', () => {
    const s = reducer(chase(T20, 160, 60, 2, 60), STOP());
    assert.equal(s.ended, true);
    assert.deepEqual(s.rainStop, { par: 72, balls: 60, wickets: 2, minOvers: 5 });
    assert.deepEqual(outcome(s), { winner: 'home', text: 'Won by 12 runs (DLS)' });
    // ICC NRR: team 1 credited with team 2's par off the same overs team 2 faced
    assert.deepEqual(nrrOvers(s), { home: 10, away: 10 });
    assert.deepEqual(nrrRuns(s), { home: 72, away: 60 });
  });

  test('ahead of par: the chasing side wins by the runs over par (DLS)', () => {
    const s = reducer(chase(T20, 160, 80, 2, 60), STOP());
    assert.deepEqual(outcome(s), { winner: 'away', text: 'Won by 8 runs (DLS)' });
  });

  test('level with par: a tie — the Super Over call (pendingTie), then a Super Over can be played', () => {
    let s = reducer(chase(T20, 160, 72, 2, 60), STOP());
    assert.equal(s.ended, false);
    assert.equal(s.pendingTie, true);
    assert.deepEqual(outcome(s), { winner: null, text: 'Match tied (DLS)' });
    s = reducer(s, { type: 'START_SUPER_OVER' });
    assert.equal(s.superOver?.round, 1);
    // accepting the tie (outside a knockout) ends it as a tie
    const t = reducer(reducer(chase(T20, 160, 72, 2, 60), STOP()), { type: 'END' });
    assert.equal(t.ended, true);
    assert.equal(outcome(t).winner, null);
  });

  test('before the minimum overs: refused (no result goes through End match)', () => {
    const s = chase(T20, 160, 25, 1, 29);
    assert.equal(chaseHasMinOvers(s), false);
    assert.equal(reducer(s, STOP()), s);
    // at exactly 5 overs it counts
    assert.equal(chaseHasMinOvers(chase(T20, 160, 25, 1, 30)), true);
    // a higher minimum from the sheet (e.g. a knockout's 10) is honoured
    assert.equal(reducer(chase(T20, 160, 50, 1, 50), STOP({ minOvers: 10 })).ended, false);
  });

  test('innings 1, a missing v: 2, a Super Over or an ended match: refused', () => {
    const one = seed(init(T20), 50, 1, 40);
    assert.equal(reducer(one, STOP()), one);
    const s = chase(T20, 160, 60, 2, 60);
    assert.equal(reducer(s, { type: 'RAIN_STOP', payload: {} }), s);
    const done = reducer(s, { type: 'END' });
    assert.equal(reducer(done, STOP()), done);
  });

  test('a target typed by hand (DLS off): the par comes from the official sheet', () => {
    let s = chase(T20, 160, 60, 2, 60);
    s = reducer(s, { type: 'SET_TARGET', payload: { runs: 150, overs: 18, v: 2 } });
    assert.equal(rainStopPar(s), null);
    assert.equal(reducer(s, STOP()).ended, false);
    const t = reducer(s, STOP({ par: 70 }));
    assert.deepEqual(outcome(t), { winner: 'home', text: 'Won by 10 runs (par score)' });
  });

  test('minimum overs: ICC T20 5, ODI 20; a format value wins; older states carry no key', () => {
    assert.equal(defaultMinOvers(20), 5);
    assert.equal(defaultMinOvers(50), 20);
    assert.equal(defaultMinOvers(10), 3);
    assert.equal(minOversOf(init({ overs: 50 })), 20);
    assert.equal(minOversOf(init({ overs: 20, minOvers: 10 })), 10);
    assert.equal('minOvers' in init({ overs: 20 }), false);
    assert.equal('minOvers' in init({ overs: 20, minOvers: 0 }), false);
  });

  test('a rain cut earlier in the chase: par uses the reduced resources', () => {
    let s = chase(T20, 160, 40, 1, 36);
    s = reducer(s, { type: 'RAIN', payload: { overs: 15, v: 2 } });
    s = seed(s, 70, 2, 60);
    const par = rainStopPar(s)!;
    const t = reducer(s, STOP());
    assert.equal(t.rainStop?.par, par);
    assert.ok(par < 160);
  });
});

describe('chess — knockout tie-breaks', () => {
  type A = Parameters<typeof chess.reducer>[1];
  const R = (winner: 'home' | 'away' | 'draw', extra: Record<string, unknown> = {}): A =>
    ({ type: 'RESULT', payload: { winner, ...extra } });
  const KO = { ko: { games: 1, rapid: 1, blitz: 1 } };

  test('a decisive single game ends the knockout at once (same fields as before)', () => {
    const s = chess.reducer(chess.init({}), R('home', { method: 'checkmate', ...KO }));
    assert.equal(s.ended, true);
    assert.equal(s.winner, 'home');
    assert.equal(chess.resultString(s), '1-0');
    assert.deepEqual(chess.points(s), { home: 1, away: 0 });
  });

  test('draws go on: rapid pair, blitz pair, then Armageddon — a draw sends Black through', () => {
    let s = chess.init({});
    s = chess.reducer(s, R('draw', KO));
    assert.equal(s.ended, false);
    assert.equal(s.winner, undefined);
    assert.equal(s.white, 'away', 'colours alternate');
    assert.deepEqual(chess.koStatus(s.ko!), { phase: 1, game: 1, winner: null });
    s = chess.reducer(s, R('home')); // rapid g1
    s = chess.reducer(s, R('away')); // rapid g2 → 1-1
    assert.equal(chess.koStatus(s.ko!).phase, 2);
    s = chess.reducer(s, R('draw'));
    s = chess.reducer(s, R('draw'));
    assert.equal(chess.koPhases(s.ko!.plan)[chess.koStatus(s.ko!).phase].kind, 'armageddon');
    // the arbiter draws lots: home gets White
    s = chess.reducer(s, { type: 'SET_WHITE', payload: { side: 'home' } });
    s = chess.reducer(s, R('draw', { method: 'agreement' }));
    assert.equal(s.ended, true);
    assert.equal(s.winner, 'away', 'Black (away) has draw odds');
    assert.equal(chess.resultString(s), '3-3');
    assert.equal(s.ko!.games.length, 6);
  });

  test('a 2-game mini-match ends early only when the lead can’t be caught', () => {
    let s = chess.init({});
    const k = { ko: { games: 2, rapid: 1, blitz: 0 } };
    s = chess.reducer(s, R('home', k));
    assert.equal(s.ended, false);
    s = chess.reducer(s, R('draw'));
    assert.equal(s.ended, true);
    assert.equal(s.winner, 'home');
    assert.equal(chess.resultString(s), '1½-½');
  });

  test('the plan comes from the format; older fixtures and results are unchanged', () => {
    assert.equal('koPlan' in chess.init({ timeControl: 'rapid' }), false);
    assert.deepEqual(chess.init({ koGames: 2, koRapidPairs: 2, koBlitzPairs: 0 }).koPlan, { games: 2, rapid: 2, blitz: 0 });
    const legacy = chess.reducer(chess.init({}), R('draw', { method: 'agreement' }));
    assert.equal(legacy.ended, true);
    assert.equal(legacy.winner, 'draw');
    assert.equal(legacy.ko, undefined);
    assert.equal(chess.resultString(legacy), '½-½');
  });
});

describe('chess — level team knockout', () => {
  const T = (id: string) => ({ id, name: id } as never);
  const leg = (w: 'home' | 'away' | 'draw') => ({ status: 'completed' as const, winner: w, homeTeam: T('A'), awayTeam: T('B') });
  const tie = (...ws: ('home' | 'away' | 'draw')[]): TeamKoInput => ({ teamAId: 'A', teamBId: 'B', legs: ws.map(leg) });

  test('board points decide first', () => {
    assert.equal(chessTeamKoWinner(tie('home', 'home', 'away', 'draw')), 'A');
  });
  test('2-2: board count (board 1 weighs most)', () => {
    assert.equal(chessTeamKoWinner(tie('home', 'away', 'draw', 'draw')), 'A');
    assert.equal(chessTeamKoWinner(tie('away', 'home', 'draw', 'draw')), 'B');
    // wins on boards 2+3 v 1+4 → 5 v 5: still level under the board count
    assert.equal(chessTeamKoWinner(tie('away', 'home', 'home', 'away'), 'board-count'), undefined);
  });
  test('lowest board off: drop board 4, then 3…', () => {
    assert.equal(teamKoRuleWinner(tie('draw', 'draw', 'home', 'away'), 'lowest-board'), 'A');
    assert.equal(teamKoRuleWinner(tie('home', 'away', 'away', 'home'), 'lowest-board'), 'B');
  });
  test('still level after the rule → the play-off winner; none → undefined (organiser pick)', () => {
    const level = tie('draw', 'draw', 'draw', 'draw');
    assert.equal(chessTeamKoWinner(level, 'board-count'), undefined);
    assert.equal(chessTeamKoWinner(level, 'board-count', 'B'), 'B');
    assert.equal(koBreakOf(null), 'board-count');
    assert.equal(koBreakOf({ koBreak: 'lowest-board' }), 'lowest-board');
  });
});
