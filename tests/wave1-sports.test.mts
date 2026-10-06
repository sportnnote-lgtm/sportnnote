/**
 * Wave-1 sports: table-tennis service order, chess results, carrom boards.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ttServer } from '../src/sports/tabletennis/serve.ts';
import * as chess from '../src/sports/chess/engine.ts';
import * as carrom from '../src/sports/carrom/engine.ts';
import { defaultStandingsConfig } from '../src/data/standings.ts';

describe('table tennis — ITTF service order', () => {
  test('two serves each, starting with the opening server', () => {
    const seq = [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2], [3, 2]].map(([h, a]) => ttServer(h, a, 0));
    assert.deepEqual(seq, ['home', 'home', 'away', 'away', 'home', 'home']);
  });
  test('from 10-10 service alternates every point', () => {
    assert.equal(ttServer(10, 10, 0), 'home');
    assert.equal(ttServer(11, 10, 0), 'away');
    assert.equal(ttServer(11, 11, 0), 'home');
    assert.equal(ttServer(12, 11, 0), 'away');
  });
  test('the opening server alternates game by game', () => {
    assert.equal(ttServer(0, 0, 1), 'away');
    assert.equal(ttServer(0, 0, 2), 'home');
    assert.equal(ttServer(0, 0, 1, 'away'), 'home');
  });
  test('10-9 is not yet deuce (still 2 each)', () => {
    // 19 points played → floor(19/2)=9 → odd → the other side
    assert.equal(ttServer(10, 9, 0), 'away');
  });
});

describe('chess — results', () => {
  test('a decisive result scores 1-0 and is written white-first', () => {
    let s = chess.init({ timeControl: 'blitz' });
    s = chess.reducer(s, { type: 'SET_WHITE', payload: { side: 'away' } });
    s = chess.reducer(s, { type: 'RESULT', payload: { winner: 'home', method: 'checkmate', moves: 34 } });
    assert.equal(s.ended, true);
    assert.deepEqual(chess.points(s), { home: 1, away: 0 });
    assert.equal(chess.resultString(s), '0-1'); // home had Black and won
    assert.equal(s.moves, 34);
  });
  test('a draw is ½-½', () => {
    const s = chess.reducer(chess.init(), { type: 'RESULT', payload: { winner: 'draw', method: 'agreement' } });
    assert.deepEqual(chess.points(s), { home: 0.5, away: 0.5 });
    assert.equal(chess.resultString(s), '½-½');
  });
  test('an inconsistent method is rejected (no "draw by checkmate")', () => {
    const s0 = chess.init();
    assert.equal(chess.reducer(s0, { type: 'RESULT', payload: { winner: 'draw', method: 'checkmate' } }).ended, false);
    assert.equal(chess.reducer(s0, { type: 'RESULT', payload: { winner: 'home', method: 'stalemate' } }).ended, false);
  });
  test('colours lock once the result is in', () => {
    let s = chess.reducer(chess.init(), { type: 'RESULT', payload: { winner: 'away' } });
    s = chess.reducer(s, { type: 'SET_WHITE', payload: { side: 'away' } });
    assert.equal(s.white, 'home');
  });
  test('league tables use 1 / ½ / 0 with FIDE tie-breaks', () => {
    assert.deepEqual(defaultStandingsConfig('chess'), { win: 1, draw: 0.5, loss: 0, order: ['sb', 'wins', 'h2h'] });
  });
});

describe('carrom — ICF boards', () => {
  const board = (s: carrom.CarromState, side: 'home' | 'away', coins: number, queen = false) =>
    carrom.reducer(s, { type: 'BOARD', side, payload: { coins, queen } });

  test('a board scores the opponent\'s coins left, +3 for a covered queen', () => {
    const s = board(carrom.init(), 'home', 5, true);
    assert.deepEqual(s.current, { home: 8, away: 0 });
  });
  test('the queen stops counting once the winner has 22+', () => {
    let s = carrom.init({ gamesToWin: 1 });
    s = board(s, 'home', 9, true); // 12
    s = board(s, 'home', 9, true); // 24 (queen counted: 12 < 22)
    // reached 24 → not 25 yet
    assert.equal(s.current.home, 24);
    const s2 = { ...carrom.init(), current: { home: 22, away: 0 } };
    assert.equal(carrom.boardPoints(2, true, 22, s2), 2);
  });
  test('first to 25 wins the game; best of 3 games wins the match', () => {
    let s = carrom.init();
    s = board(s, 'home', 9, true); s = board(s, 'home', 9, true); s = board(s, 'home', 1);
    assert.equal(s.gamesWon.home, 1);
    assert.deepEqual(s.games[0], [25, 0]);
    s = board(s, 'away', 9, true); s = board(s, 'away', 9, true); s = board(s, 'away', 2);
    assert.equal(s.gamesWon.away, 1);
    assert.equal(s.ended, false);
    s = board(s, 'home', 9, true); s = board(s, 'home', 9, true); s = board(s, 'home', 3);
    assert.equal(s.ended, true);
    assert.deepEqual(carrom.result(s), { winner: 'home', home: 2, away: 1 });
  });
  test('after the board limit the leader wins; a tie forces extra boards', () => {
    let s = carrom.init({ maxBoards: 2, gamesToWin: 1 });
    s = board(s, 'home', 3); s = board(s, 'away', 3); // 3-3 after 2 boards
    assert.equal(s.ended, false);
    s = board(s, 'away', 1); // tie-break board
    assert.equal(s.ended, true);
    assert.equal(carrom.result(s)?.winner, 'away');
  });
  test('boards after the match ends are ignored', () => {
    let s = carrom.init({ gamesToWin: 1, target: 5 });
    s = board(s, 'home', 5);
    const after = board(s, 'away', 9);
    assert.equal(after, s);
  });
});
