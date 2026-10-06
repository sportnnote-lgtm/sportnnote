/**
 * Real-event replays for the wave-1 sports (2026-10-07). Each test feeds a REAL
 * published result through the app's pure engines and checks the app reproduces
 * the official outcome. Sources: docs/sport-coverage/replay-validation.md.
 *
 *  • Chess — FIDE Candidates 2024 (8 players, double RR, full crosstable) and
 *    Tata Steel Masters 2024 (14 players, single RR): scores, Sonneborn-Berger,
 *    wins and the official order of every tied group.
 *  • Golf — Scheffler's 2024 Masters final round hole by hole (68, −4; 277, −11),
 *    the Masters top 5 with a three-way T3, and the 2023 Ryder Cup singles
 *    Rahm v Scheffler (halved), hole by hole.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { teamStandings } from '../src/data/standings.ts';
import {
  summarize, rankLeaderboard, matchState, type Hole, type HoleWinner, type RankInput,
} from '../src/sports/golf/engine.ts';
import type { Match } from '../src/core/types.ts';
import { makeRallyEngine, type RallyState } from '../src/sports/rallyEngine.ts';
import { ttServer } from '../src/sports/tabletennis/serve.ts';
import * as carrom from '../src/sports/carrom/engine.ts';

// ---------------------------------------------------------------- chess ----

let gameNo = 0;
function game(white: string, black: string, r: number): Match {
  gameNo += 1;
  return {
    id: `g${gameNo}`, sport: 'chess', status: 'completed', startsAt: '',
    winner: r === 1 ? 'home' : r === 0 ? 'away' : 'draw', score: { home: r, away: 1 - r },
    homeTeam: { id: white, name: white }, awayTeam: { id: black, name: black }, state: null,
  } as unknown as Match;
}

describe('replay: FIDE Candidates 2024 (Toronto, double round robin)', () => {
  // Row player's results vs column player: [game with White, game with Black].
  const R: Record<string, [number, number]> = {
    'GUK|NAK': [0.5, 0.5], 'GUK|NEP': [0.5, 0.5], 'GUK|CAR': [0.5, 0.5], 'GUK|PRA': [0.5, 1], 'GUK|VID': [0.5, 1], 'GUK|FIR': [1, 0], 'GUK|ABA': [1, 1],
    'NAK|NEP': [0.5, 0.5], 'NAK|CAR': [1, 0.5], 'NAK|PRA': [0.5, 1], 'NAK|VID': [0, 0], 'NAK|FIR': [1, 1], 'NAK|ABA': [1, 0.5],
    'NEP|CAR': [0.5, 0.5], 'NEP|PRA': [0.5, 0.5], 'NEP|VID': [1, 1], 'NEP|FIR': [1, 0.5], 'NEP|ABA': [0.5, 0.5],
    'CAR|PRA': [0.5, 1], 'CAR|VID': [1, 0.5], 'CAR|FIR': [1, 0.5], 'CAR|ABA': [1, 0.5],
    'PRA|VID': [0.5, 1], 'PRA|FIR': [0.5, 0.5], 'PRA|ABA': [1, 1],
    'VID|FIR': [1, 0.5], 'VID|ABA': [0.5, 0.5],
    'FIR|ABA': [1, 0.5],
  };
  const games = Object.entries(R).flatMap(([pair, [w, b]]) => {
    const [x, y] = pair.split('|');
    return [game(x, y, w), game(y, x, 1 - b)]; // x had White in game 1, Black in game 2
  });
  const table = teamStandings(games, 'chess');
  const by = (id: string) => table.find((t) => t.teamId === id)!;

  test('56 games, every player 14', () => {
    assert.equal(games.length, 56);
    for (const t of table) assert.equal(t.played, 14);
  });
  test('final scores match the official table', () => {
    const official = { GUK: 9, NAK: 8.5, NEP: 8.5, CAR: 8.5, PRA: 7, VID: 6, FIR: 5, ABA: 3.5 };
    for (const [id, pts] of Object.entries(official)) assert.equal(by(id).points, pts, id);
  });
  test('Sonneborn-Berger matches the official values', () => {
    const sb = { GUK: 57, NAK: 56, NEP: 56, CAR: 54, PRA: 42.5, VID: 40.25, FIR: 32.75, ABA: 25.5 };
    for (const [id, v] of Object.entries(sb)) assert.equal(by(id).sb, v, id);
  });
  test('official order: the 8.5 three-way tie goes NAK, NEP (SB 56, wins 5 v 3), CAR (SB 54)', () => {
    assert.deepEqual(table.map((t) => t.teamId), ['GUK', 'NAK', 'NEP', 'CAR', 'PRA', 'VID', 'FIR', 'ABA']);
    assert.equal(by('NAK').won, 5);
    assert.equal(by('NEP').won, 3);
  });
});

describe('replay: Tata Steel Masters 2024 (single round robin, 14 players)', () => {
  const P = ['Wei Yi', 'Gukesh', 'Giri', 'Abdusattorov', 'Firouzja', 'Vidit', 'Praggnanandhaa', 'Nepomniachtchi', 'Ding Liren', 'Ju Wenjun', 'Donchenko', 'van Foreest', 'Maghsoodloo', 'Warmerdam'];
  // Upper triangle, row player's result vs each later player (official crosstable).
  const rows: number[][] = [
    [0, 0.5, 0.5, 0, 1, 0.5, 1, 0.5, 1, 1, 0.5, 1, 1],
    [0, 0.5, 0.5, 0.5, 0.5, 1, 0, 0.5, 1, 1, 1, 1],
    [0, 0.5, 0.5, 0.5, 0.5, 0.5, 1, 1, 1, 0.5, 1],
    [0.5, 0, 0.5, 0, 0.5, 1, 1, 1, 1, 1],
    [0, 0.5, 1, 1, 0, 0, 1, 1, 0.5],
    [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 1, 0.5],
    [0.5, 1, 1, 0.5, 0.5, 0.5, 0.5],
    [1, 0.5, 0.5, 0.5, 0.5, 1],
    [0.5, 0.5, 0.5, 0.5, 1],
    [0.5, 0, 0.5, 0.5],
    [0.5, 0.5, 0],
    [0.5, 0],
    [1],
  ];
  const games = rows.flatMap((row, i) => row.map((r, k) => game(P[i], P[i + 1 + k], r)));
  const table = teamStandings(games, 'chess');
  const by = (id: string) => table.find((t) => t.teamId === id)!;

  test('91 games; scores match the official table', () => {
    assert.equal(games.length, 91);
    const pts = [8.5, 8.5, 8.5, 8.5, 7.5, 7.5, 7.5, 6.5, 6, 4.5, 4.5, 4.5, 4.5, 4];
    P.forEach((p, i) => assert.equal(by(p).points, pts[i], p));
  });
  test('Sonneborn-Berger matches the published values', () => {
    const sb: Record<string, number> = { Firouzja: 48.5, Vidit: 47.75, Praggnanandhaa: 47, 'Ju Wenjun': 28.25, Donchenko: 28, 'van Foreest': 27, Maghsoodloo: 25 };
    for (const [p, v] of Object.entries(sb)) assert.equal(by(p).sb, v, p);
  });
  test('tied groups land in the official order (the 4-way tie for 1st went to a blitz playoff)', () => {
    const ids = table.map((t) => t.teamId);
    assert.deepEqual(new Set(ids.slice(0, 4)), new Set(['Wei Yi', 'Gukesh', 'Giri', 'Abdusattorov']));
    assert.deepEqual(ids.slice(4), ['Firouzja', 'Vidit', 'Praggnanandhaa', 'Nepomniachtchi', 'Ding Liren', 'Ju Wenjun', 'Donchenko', 'van Foreest', 'Maghsoodloo', 'Warmerdam']);
  });
});

// ----------------------------------------------------------------- golf ----

const AUGUSTA_PARS = [4, 5, 4, 3, 4, 3, 4, 5, 4, 4, 4, 3, 5, 4, 5, 3, 4, 4];
const AUGUSTA: Hole[] = AUGUSTA_PARS.map((par, i) => ({ n: i + 1, par, si: i + 1 }));
const zero = AUGUSTA.map(() => 0);

/** A card adding up to `total` (par everywhere, the difference spread from hole 1). */
function cardTotalling(total: number): { strokes: number[] } {
  const s = [...AUGUSTA_PARS];
  let d = total - 72;
  for (let i = 0; d !== 0; i = (i + 1) % 18) { const step = d > 0 ? 1 : -1; s[i] += step; d -= step; }
  return { strokes: s };
}

describe('replay: 2024 Masters — Scottie Scheffler', () => {
  const r4 = [4, 5, 3, 4, 4, 3, 5, 4, 3, 3, 5, 3, 4, 3, 5, 2, 4, 4];

  test('Augusta National is par 72 (36-36)', () => {
    assert.equal(AUGUSTA_PARS.reduce((a, b) => a + b, 0), 72);
    assert.equal(AUGUSTA_PARS.slice(0, 9).reduce((a, b) => a + b, 0), 36);
  });
  test('final round: 68 (−4), out 35 in 33, 7 birdies 3 bogeys', () => {
    const s = summarize({ strokes: r4 }, AUGUSTA, zero, { maxScore: 'none' });
    assert.equal(s.gross, 68);
    assert.equal(s.toPar, -4);
    assert.equal(r4.slice(0, 9).reduce((a, b) => a + b, 0), 35);
    const diffs = r4.map((x, i) => x - AUGUSTA_PARS[i]);
    assert.equal(diffs.filter((d) => d === -1).length, 7);
    assert.equal(diffs.filter((d) => d === 1).length, 3);
  });
  test('72 holes: 66-72-71-68 = 277 (−11)', () => {
    const rounds = [cardTotalling(66), cardTotalling(72), cardTotalling(71), { strokes: r4 }];
    const [row] = rankLeaderboard([{ id: 'scheffler', status: 'finished', rounds: rounds.map((card) => ({ card, holes: AUGUSTA, received: zero })) }], { scoring: 'stroke', net: false, tieBreak: 'shared' });
    assert.equal(row.grossTotal, 277);
    assert.equal(row.total, -11);
  });
  test('top 5: Scheffler 1, Åberg 2, Fleetwood/Homa/Morikawa T3 on −4', () => {
    const field: Array<[string, number[]]> = [
      ['scheffler', [66, 72, 71, 68]], ['aberg', [73, 69, 70, 69]],
      ['fleetwood', [72, 71, 72, 69]], ['homa', [67, 71, 73, 73]], ['morikawa', [71, 70, 69, 74]],
    ];
    const inputs: RankInput[] = field.map(([id, rs]) => ({ id, status: 'finished', rounds: rs.map((t) => ({ card: cardTotalling(t), holes: AUGUSTA, received: zero })) }));
    const board = rankLeaderboard(inputs, { scoring: 'stroke', net: false, tieBreak: 'shared' });
    const label = Object.fromEntries(board.map((r) => [r.id, `${r.positionLabel} ${r.total}`]));
    assert.equal(label.scheffler, '1 -11');
    assert.equal(label.aberg, '2 -7');
    assert.equal(label.fleetwood, 'T3 -4');
    assert.equal(label.homa, 'T3 -4');
    assert.equal(label.morikawa, 'T3 -4');
  });
});

describe('replay: 2023 Ryder Cup singles — Rahm (home) v Scheffler (away)', () => {
  // Hole winners per the PGA Tour live blog (7 & 8 inferred halved: 1 up after 6
  // and after 8, Scheffler won 9 to square).
  const W: HoleWinner[] = ['home', 'halved', 'away', 'home', 'home', 'away', 'halved', 'halved', 'away',
    'halved', 'away', 'home', 'home', 'away', 'away', 'halved', 'halved', 'home'];
  // Reported status after each hole (from Rahm's side: + = Rahm up).
  const UP = [1, 1, 0, 1, 2, 1, 1, 1, 0, 0, -1, 0, 1, 0, -1, -1, -1, 0];

  test('status after every hole matches the live reports', () => {
    for (let i = 0; i < 18; i++) {
      const s = matchState(W.slice(0, i + 1), 18);
      assert.equal(s.up, UP[i], `after hole ${i + 1}`);
      if (i < 17) assert.equal(s.decided, false, `not over after ${i + 1}`);
    }
  });
  test('Scheffler dormie 1 on the 18th tee; Rahm birdies 18 → halved, half a point each', () => {
    const tee18 = matchState(W.slice(0, 17), 18);
    assert.equal(tee18.status, 'Dormie 1');
    assert.equal(tee18.leader, 'away');
    const end = matchState(W, 18);
    assert.equal(end.decided, true);
    assert.equal(end.winner, 'halved');
    assert.equal(end.result, 'Halved');
  });
});

// -------------------------------------------------------- table tennis ----


const ttEngine = makeRallyEngine({ icon: '🏓', sideOutValue: '__none__', sideOutLabel: 'Service', defaults: { playersPerSide: 1, target: 11, winBy: 2, gamesToWin: 3 } });

/** Feed a real game score as a point sequence that can't end early: alternate
 *  points up to the loser's total, then the winner's remaining points. Records
 *  who should serve each point per ITTF 2.13.3 / 2.13.6. */
function playGame(s: RallyState, [h, a]: [number, number], servers: string[]): RallyState {
  const lo = Math.min(h, a);
  const seq: Array<'home' | 'away'> = [];
  for (let i = 0; i < lo; i++) seq.push('home', 'away');
  const win = h > a ? 'home' : 'away';
  for (let i = 0; i < Math.abs(h - a); i++) seq.push(win);
  for (const side of seq) {
    servers.push(ttServer(s.current.home, s.current.away, s.games.length, s.opening ?? 'home'));
    s = ttEngine.reducer(s, { type: 'POINT', side } as never);
  }
  return s;
}

describe('replay: Paris 2024 Olympic table tennis finals (best of 7)', () => {
  test('men: Möregårdh (home) v Fan Zhendong — 11-7, 9-11, 9-11, 8-11, 8-11 → Fan 4-1', () => {
    let s = ttEngine.init({ gamesToWin: 4, pointsPerGame: 11, winBy: 2 });
    const servers: string[] = [];
    for (const g of [[11, 7], [9, 11], [9, 11], [8, 11], [8, 11]] as Array<[number, number]>) s = playGame(s, g, servers);
    assert.deepEqual(s.games, [[11, 7], [9, 11], [9, 11], [8, 11], [8, 11]]);
    assert.deepEqual(s.gamesWon, { home: 1, away: 4 });
    assert.equal(s.ended, true);
    // Serving: home opens game 1 (2 serves each), away opens game 2.
    assert.deepEqual(servers.slice(0, 5), ['home', 'home', 'away', 'away', 'home']);
    assert.equal(servers[18], 'away'); // first point of game 2
  });

  test('women: Chen Meng (home) v Sun Yingsha — 4-11, 11-7, 11-4, 9-11, 11-9, 11-6 → Chen 4-2', () => {
    let s = ttEngine.init({ gamesToWin: 4, pointsPerGame: 11, winBy: 2 });
    for (const g of [[4, 11], [11, 7], [11, 4], [9, 11], [11, 9], [11, 6]] as Array<[number, number]>) s = playGame(s, g, []);
    assert.deepEqual(s.gamesWon, { home: 4, away: 2 });
    assert.equal(s.ended, true);
  });

  test('a match is over at 4 games — later points are ignored', () => {
    let s = ttEngine.init({ gamesToWin: 4 });
    for (const g of [[11, 7], [11, 7], [11, 7], [11, 7]] as Array<[number, number]>) s = playGame(s, g, []);
    const after = ttEngine.reducer(s, { type: 'POINT', side: 'away' } as never);
    assert.equal(after, s);
  });

  test('deuce games from the 2024 World Team Championships play out: 16-14, 14-12, 13-15', () => {
    for (const g of [[16, 14], [14, 12], [13, 15]] as Array<[number, number]>) {
      const servers: string[] = [];
      const s = playGame(ttEngine.init({}), g, servers);
      assert.deepEqual(s.games[0], g);
      // From 10-10 service alternates every point (ITTF 2.13.3).
      const from = 20; // point index 20 is played at 10-10
      for (let i = from + 1; i < servers.length; i++) assert.notEqual(servers[i], servers[i - 1], `point ${i}`);
    }
  });

  test('the toss: if the away player chose to serve, they open games 1, 3, 5…', () => {
    const s = ttEngine.init({ firstServe: 'away' });
    assert.equal(ttServer(0, 0, 0, s.opening), 'away');
    assert.equal(ttServer(0, 0, 1, s.opening), 'home');
    assert.equal(ttServer(0, 0, 2, s.opening), 'away');
  });
});

// --------------------------------------------------------------- carrom ----

/** Play boards in order: [winner, opponent's coins left, winner covered the queen]. */
function boards(list: Array<['home' | 'away', number, boolean]>, cfg: Record<string, unknown> = {}) {
  let s = carrom.init(cfg);
  for (const [side, coins, queen] of list) s = carrom.reducer(s, { type: 'BOARD', side, payload: { coins, queen } });
  return s;
}

describe('replay: Carrom World Cup results (ICF Laws of Carrom)', () => {
  test('2018 women\'s team final, Rashmi Kumari v Roshita Joseph game 1: 19-15 on the 8-board limit', () => {
    // Eight boards, nobody reaches 25 → the leader after board 8 wins the game.
    const s = boards([
      ['home', 5, false], ['away', 4, false], ['home', 3, true], ['away', 6, false],
      ['home', 2, false], ['away', 5, false], ['home', 6, false], ['away', 0, false],
    ]);
    assert.deepEqual(s.games[0], [19, 15]);
    assert.equal(s.gamesWon.home, 1);
  });

  test('a game is recorded at 25 even when the last board goes past it (25-22, not 31-22)', () => {
    // Away leads 22-16; home wins the next board with 9 coins + queen → 16 + 12 = 28.
    const s = boards([
      ['away', 9, true], ['home', 7, true], ['away', 8, false], ['home', 6, false], ['away', 2, false],
      ['home', 9, true],
    ]);
    assert.deepEqual(s.games[0], [25, 22]);
  });

  test('the queen is worth 3 only up to 21 — a winner on 22 gets coins only', () => {
    const s = boards([['home', 9, true], ['home', 7, false], ['home', 2, true]]);
    // 12 (≤21 → queen counts), 19, then on 19 → queen still counts: 19 + 2 + 3 = 24
    assert.deepEqual(s.current, { home: 24, away: 0 });
    const t = boards([['home', 9, true], ['home', 9, true], ['home', 1, true]]);
    // 12, 24 → on 24 (≥22) the queen no longer counts: 24 + 1 = 25 → game
    assert.deepEqual(t.games[0], [25, 0]);
  });

  test('2025 World Cup men\'s final, Prashant More v K. Srinivas: 5-25, 25-11, 25-18 → More 2-1', () => {
    const s = boards([
      // game 1: Srinivas 25-5
      ['away', 9, true], ['home', 5, false], ['away', 9, true], ['away', 1, false],
      // game 2: More 25-11
      ['home', 9, true], ['away', 8, true], ['home', 9, true], ['home', 1, false],
      // game 3: More 25-18
      ['away', 9, true], ['home', 9, true], ['away', 6, false], ['home', 9, true], ['home', 1, false],
    ]);
    assert.deepEqual(s.games, [[5, 25], [25, 11], [25, 18]]);
    assert.deepEqual(carrom.result(s), { winner: 'home', home: 2, away: 1 });
  });

  test('level after 8 boards → an extra board decides (r.56)', () => {
    const s = boards([
      ['home', 2, false], ['away', 2, false], ['home', 2, false], ['away', 2, false],
      ['home', 2, false], ['away', 2, false], ['home', 2, false], ['away', 2, false],
    ]);
    assert.equal(s.games.length, 0); // 8-8 after 8 boards: not over
    const t = carrom.reducer(s, { type: 'BOARD', side: 'away', payload: { coins: 1, queen: false } });
    assert.deepEqual(t.games[0], [8, 9]);
  });
});
