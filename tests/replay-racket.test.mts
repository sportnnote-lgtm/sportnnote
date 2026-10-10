/**
 * SD-14 — engine replay tests for squash, pickleball and padel: the safety net
 * before the rally-engine work (SD-19..SD-22). Each test feeds a REAL published
 * result through the app's pure reducers and checks the final games/sets, each
 * game's score, the winner, the server sequence (where derivable), the SD-01
 * scoreline and a pinned fingerprint (tests/racketLogs.mts) so a refactor can't
 * silently change how an old log replays.
 *
 * None of these matches has a public point-by-point log, so every log below is
 * RECONSTRUCTED: a plausible rally/serve sequence that reproduces the published
 * game scores (plus any published in-game scores, noted where used). Who served
 * first is a guess where the source doesn't say.
 *
 * Sources:
 *  • Squash, PSA — CIB Egyptian Open 2024 final (Platinum), [3] Mostafa Asal bt
 *    [1] Ali Farag 11-3, 13-11, 5-11, 11-8 (82m). cibegyptiansquashopen.net/?p=6021
 *  • Squash, English (hand-out to 9) — British Open 1993 final, Jansher Khan bt
 *    Chris Dittmar 9-6, 9-5, 6-9, 9-2; and 1992 final, Jansher Khan bt Chris
 *    Robertson 9-7, 10-9, 9-5 (the 10-9 game was "set two" at 8-all).
 *    britishopensquash.info/history
 *  • Pickleball, PPA side-out doubles (bo5 medal match) — Veolia LA Open 2024,
 *    men's doubles gold (21 Apr 2024): Ben & Collin Johns bt Tyson McGuffin &
 *    Jaume Martinez Vich 7-11, 11-9, 11-9, 8-11, 11-6. pickleball.com news
 *    "Johns bros overcome McGuffin/Martinez Vich in five-game epic".
 *  • Pickleball, rally to 21 — MLP 2024 Premier championship, match 2: Dallas
 *    Flash won the DreamBreaker 21-15 v New Jersey 5s. thedinkpickleball.com
 *    "Top ten matches of MLP 2024".
 *  • Pickleball, singles side-out — PPA Orange County Cup 2024 (30 Jun 2024),
 *    men's singles final: Chris Haworth bt Federico Staksrud 9-11, 11-5, 11-7
 *    (game 3: Haworth led 5-2, 7-7, then won out). pickleball.com news
 *    "Haworth takes out Staksrud to earn first PPA title".
 *  • Padel, Premier Padel — Valencia P1 2026 men's final: Coello/Tapia bt
 *    Chingotto/Galán 6-7, 6-1, 7-6 (2h14m); Coello/Tapia came back from 2-5 in
 *    the third set and from 1-5 in the final tiebreak. premierpadel.com news.
 *    The tiebreak point totals aren't published: set 1 is reconstructed as 4-7,
 *    the set-3 breaker as 7-5. Which games went to golden point is invented.
 *  • Padel, short sets + match tiebreak — a synthetic FIP short-set match (to 4,
 *    tiebreak at 4-4, super tiebreak to 10); no pro tour plays this format.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as L from './racketLogs.mts';
import {
  makeRallyEngine, rallyScoreLine, rallySummary, rallyServingSide, serveSpot, serverId, type RallyState,
} from '../src/sports/rallyEngine.ts';
import * as padel from '../src/sports/padel/engine.ts';
import type { ScoreAction } from '../src/sports/types.ts';

type Side = 'home' | 'away';
const P = (side: Side): ScoreAction => ({ type: 'POINT', side });
const opp = (s: Side): Side => (s === 'home' ? 'away' : 'home');

// The same engine options the squash / pickleball plugins pass (src/sports/*/index.tsx).
const SQUASH = makeRallyEngine({ icon: '⚫', sideOutValue: 'english', sideOutLabel: 'Hand-out', defaults: { playersPerSide: 1, target: 11, winBy: 2, gamesToWin: 3 } });
const PICKLE = makeRallyEngine({ icon: '🥒', sideOutValue: 'sideout', sideOutLabel: 'Side-out', defaults: { playersPerSide: 2, target: 11, winBy: 2, gamesToWin: 2 } });
type RallyEng = typeof SQUASH;
const play = (e: RallyEng, cfg: Record<string, unknown>, log: ScoreAction[]) => log.reduce(e.reducer, e.init(cfg));
const playPadel = (cfg: Record<string, unknown>, log: ScoreAction[]) => log.reduce(padel.reducer, padel.init(cfg));

// ------------------------------------------------------------ log builders --

/** Rally scoring: straight runs through the given in-game scores (home's run
 *  first inside each step). Every rally scores for its winner. */
function runs(...checkpoints: Array<[number, number]>): ScoreAction[] {
  const out: ScoreAction[] = [];
  let h = 0;
  let a = 0;
  for (const [H, A] of checkpoints) {
    for (; h < H; h++) out.push(P('home'));
    for (; a < A; a++) out.push(P('away'));
  }
  return out;
}

/** Side-out SINGLES (squash English, pickleball singles): service turns,
 *  alternating from `first`. Each number = points the server wins in that turn;
 *  then the receiver wins a rally (hand-out). The last turn ends the game. */
function singlesTurns(first: Side, pts: number[]): ScoreAction[] {
  const out: ScoreAction[] = [];
  let srv = first;
  pts.forEach((n, i) => {
    for (let k = 0; k < n; k++) out.push(P(srv));
    if (i < pts.length - 1) out.push(P(opp(srv)));
    srv = opp(srv);
  });
  return out;
}

/** Side-out DOUBLES (pickleball): team turns alternating from `first`. The first
 *  turn is [n] (0-0-2: the start-of-game second server only); later turns are
 *  [server 1's points, server 2's points]. A lost rally moves serve to server 2,
 *  then side-out. The final turn may stop early (it ends the game). */
function doublesTurns(first: Side, turns: number[][]): ScoreAction[] {
  const out: ScoreAction[] = [];
  let srv = first;
  turns.forEach((t, i) => {
    t.forEach((n, j) => {
      for (let k = 0; k < n; k++) out.push(P(srv));
      const last = i === turns.length - 1 && j === t.length - 1;
      if (!last) out.push(P(opp(srv))); // fault → server 2, or side-out
    });
    srv = opp(srv);
  });
  return out;
}
/** The serve sequence that spec should produce: 'H2', 'A1', 'A2', ... */
function expectedDoublesServes(first: Side, turns: number[][]): string[] {
  const out: string[] = [];
  let srv = first;
  turns.forEach((t, i) => {
    const tag = srv === 'home' ? 'H' : 'A';
    if (i === 0) out.push(`${tag}2`);
    else t.forEach((_, j) => out.push(`${tag}${j + 1}`));
    srv = opp(srv);
  });
  return out;
}

/** Side-out: who held serve for each rally, per game, collapsed into turns. */
function serveTurns(e: RallyEng, cfg: Record<string, unknown>, log: ScoreAction[]): string[][] {
  const games: string[][] = [];
  let s = e.init(cfg);
  for (const a of log) {
    const g = s.games.length;
    const tag = `${s.serving === 'home' ? 'H' : 'A'}${s.doubles ? s.serverNo : ''}`;
    games[g] ??= [];
    if (games[g][games[g].length - 1] !== tag) games[g].push(tag);
    s = e.reducer(s, a);
  }
  return games;
}

/** Rally scoring: the side serving at 0-0 of each game. */
function gameOpeners(e: RallyEng, cfg: Record<string, unknown>, log: ScoreAction[]): Side[] {
  const out: Side[] = [];
  let s = e.init(cfg);
  out.push(rallyServingSide(s));
  for (const a of log) {
    const before = s.games.length;
    s = e.reducer(s, a);
    if (s.games.length > before && !s.ended) out.push(rallyServingSide(s));
  }
  return out;
}

// ------------------------------------------------------------------ squash --

describe('replay: squash PSA — CIB Egyptian Open 2024 final, Asal bt Farag (PAR 11, bo5)', () => {
  // home = Asal, away = Farag. Reconstructed rally runs; game 2 goes through 10-10, 11-11.
  const LOG = [
    ...runs([2, 0], [2, 1], [6, 1], [6, 3], [11, 3]),
    ...runs([3, 0], [3, 4], [7, 4], [7, 8], [10, 8], [10, 10], [11, 10], [11, 11], [13, 11]),
    ...runs([1, 0], [1, 3], [4, 3], [4, 8], [5, 8], [5, 11]),
    ...runs([2, 0], [2, 3], [6, 3], [6, 6], [9, 6], [9, 8], [11, 8]),
  ];
  const CFG = { scoring: 'par', pointsPerGame: 11, winBy: 2, gamesToWin: 3 }; // the 'psa' preset
  const s = play(SQUASH, CFG, LOG);

  test('Asal wins 3-1: 11-3, 13-11, 5-11, 11-8', () => {
    assert.equal(s.ended, true);
    assert.deepEqual(s.gamesWon, { home: 3, away: 1 });
    assert.deepEqual(s.games, [[11, 3], [13, 11], [5, 11], [11, 8]]);
    assert.equal(LOG.length, 11 + 3 + 13 + 11 + 5 + 11 + 11 + 8); // every rally scored (PAR)
  });
  test('win by two: 11-10 and 12-11 do not end game 2', () => {
    const g2 = play(SQUASH, CFG, [...runs([2, 0], [2, 1], [6, 1], [6, 3], [11, 3]), ...runs([10, 10], [11, 10])]);
    assert.deepEqual(g2.current, { home: 11, away: 10 });
    assert.equal(g2.games.length, 1);
    const g2b = play(SQUASH, CFG, [...runs([2, 0], [2, 1], [6, 1], [6, 3], [11, 3]), ...runs([10, 10], [11, 10], [11, 11], [12, 11])]);
    assert.deepEqual(g2b.current, { home: 12, away: 11 });
  });
  test('PAR serve: the rally winner serves; each game opens with the last game’s winner', () => {
    assert.deepEqual(gameOpeners(SQUASH, CFG, LOG), ['home', 'home', 'home', 'away']);
    const mid = play(SQUASH, CFG, runs([2, 0], [2, 1]));
    assert.equal(rallyServingSide(mid), 'away');
  });
  test('scoreline + summary (SD-01), both perspectives', () => {
    assert.equal(rallyScoreLine(s), '11-3, 13-11, 5-11, 11-8');
    assert.equal(rallyScoreLine(s, 'away'), '3-11, 11-13, 11-5, 8-11');
    assert.deepEqual(rallySummary(s, 'English'), { homeScore: '3', awayScore: '1', statusLine: 'Match Over', detailLine: '11-3, 13-11, 5-11, 11-8' });
  });
  test('fingerprint pinned', () => {
    assert.equal(L.fingerprint(s as never, L.RALLY_KEYS), '06ec6423ebd3');
  });
});

describe('replay: squash English — British Open 1993 final, Jansher Khan bt Dittmar (hand-out, to 9)', () => {
  // home = Jansher Khan, serving first (assumed). Turns = points per hand-in.
  const T = [
    { first: 'home' as Side, pts: [2, 1, 0, 3, 3, 2, 4] },    // 9-6
    { first: 'home' as Side, pts: [1, 2, 3, 0, 2, 3, 3] },    // 9-5
    { first: 'home' as Side, pts: [2, 0, 1, 4, 3, 2, 0, 3] }, // 6-9
    { first: 'away' as Side, pts: [1, 4, 1, 5] },             // 9-2
  ];
  const LOG = T.flatMap((g) => singlesTurns(g.first, g.pts));
  const CFG = { scoring: 'english', pointsPerGame: 9, winBy: 1, gamesToWin: 3 }; // the 'english' preset
  const s = play(SQUASH, CFG, LOG);

  test('Jansher wins 3-1: 9-6, 9-5, 6-9, 9-2', () => {
    assert.equal(s.ended, true);
    assert.deepEqual(s.gamesWon, { home: 3, away: 1 });
    assert.deepEqual(s.games, [[9, 6], [9, 5], [6, 9], [9, 2]]);
  });
  test('only the server scores: a receiver’s rally is a hand-out, not a point', () => {
    const one = play(SQUASH, CFG, [P('home'), P('home'), P('away')]);
    assert.deepEqual(one.current, { home: 2, away: 0 });
    assert.equal(one.serving, 'away');
    assert.equal(one.events.at(-1)?.label, 'Hand-out');
  });
  test('server sequence: one hand-in per turn; the game winner serves first next game', () => {
    const turns = serveTurns(SQUASH, CFG, LOG);
    assert.deepEqual(turns, T.map((g) => g.pts.map((_, i) => ((i % 2 === 0) === (g.first === 'home') ? 'H' : 'A'))));
    assert.deepEqual(T.map((g) => g.first), ['home', 'home', 'home', 'away']); // G3 → away opened G4
    const handOuts = s.events.filter((e) => e.label === 'Hand-out').length;
    assert.equal(handOuts, T.reduce((n, g) => n + g.pts.length - 1, 0));
  });
  test('scoreline + summary', () => {
    assert.equal(rallyScoreLine(s), '9-6, 9-5, 6-9, 9-2');
    assert.deepEqual(rallySummary(s, 'English'), { homeScore: '3', awayScore: '1', statusLine: 'Match Over', detailLine: '9-6, 9-5, 6-9, 9-2' });
  });
  test('fingerprint pinned', () => {
    assert.equal(L.fingerprint(s as never, L.RALLY_KEYS), 'df14b53aafd6');
  });

  // GAP (SQ-07): no "set one / set two" at 8-all. The English preset is a hard
  // cap (to 9, win by 1), so 8-8 is always decided by the next point.
  test('current behaviour: at 8-all the next point ends the game 9-8 (no set-two option)', () => {
    const g = play(SQUASH, CFG, singlesTurns('home', [4, 4, 4, 4]).concat(P('home'))); // 8-8 then home wins a rally
    // Home serves at 8-8? turns: H4 A4 H4 A4 → 8-8 with away serving; home's rally = hand-out.
    assert.deepEqual(g.current, { home: 8, away: 8 });
    const g2 = play(SQUASH, CFG, [...singlesTurns('home', [4, 4, 4, 4]), P('home'), P('home')]);
    assert.deepEqual(g2.games, [[9, 8]]);
  });
  test('British Open 1992 final, Jansher bt Robertson 9-7, 10-9, 9-5 — needs "set two" at 8-all',
    { todo: 'SQ-07: English set one / set two at 8-all is not modelled; 10-9 is unreachable (game ends 9-8)' }, () => {
      const LOG92 = [
        ...singlesTurns('home', [3, 2, 2, 3, 2, 2, 2]),       // 9-7
        ...singlesTurns('home', [2, 3, 3, 3, 3, 2, 1, 1, 1]), // 8-8, 9-8, 9-9, 10-9 under "set two"
        ...singlesTurns('home', [4, 2, 2, 3, 3]),             // 9-5
      ];
      const m = play(SQUASH, CFG, LOG92);
      assert.deepEqual(m.games, [[9, 7], [10, 9], [9, 5]]);
    });
});

// -------------------------------------------------------------- pickleball --

describe('replay: pickleball PPA side-out doubles — LA Open 2024 men’s gold, Johns bt McGuffin/Martinez Vich (bo5 to 11)', () => {
  // home = Ben & Collin Johns (served first, assumed), away = McGuffin & Martinez Vich.
  // Game winner serves first next game (engine rule; see PB-11 note below).
  const G: Array<{ first: Side; turns: number[][] }> = [
    { first: 'home', turns: [[1], [2, 0], [0, 2], [3, 1], [2, 0], [0, 2], [1, 1], [2, 1]] },         // 7-11
    { first: 'away', turns: [[2], [1, 2], [0, 3], [3, 0], [1, 1], [0, 2], [2, 0], [1, 2]] },         // 11-9
    { first: 'home', turns: [[3], [1, 2], [0, 1], [2, 0], [2, 2], [1, 1], [0, 1], [2, 0], [1, 1]] }, // 11-9
    { first: 'home', turns: [[2], [3, 0], [1, 2], [0, 2], [2, 0], [2, 2], [0, 1], [1, 1]] },         // 8-11
    { first: 'away', turns: [[1], [2, 1], [0, 2], [3, 0], [1, 0], [2, 2], [2, 0], [1]] },            // 11-6
  ];
  const LOG = G.flatMap((g) => doublesTurns(g.first, g.turns));
  const CFG = { scoring: 'sideout', playersPerSide: 2, pointsPerGame: 11, winBy: 2, gamesToWin: 3 }; // 'medal' preset
  const s = play(PICKLE, CFG, LOG);

  test('Johns win 3-2: 7-11, 11-9, 11-9, 8-11, 11-6', () => {
    assert.equal(s.ended, true);
    assert.deepEqual(s.gamesWon, { home: 3, away: 2 });
    assert.deepEqual(s.games, [[7, 11], [11, 9], [11, 9], [8, 11], [11, 6]]);
  });
  test('serve sequence: 0-0-2 start, server 1 → server 2 → side-out, every game', () => {
    const turns = serveTurns(PICKLE, CFG, LOG);
    assert.deepEqual(turns, G.map((g) => expectedDoublesServes(g.first, g.turns)));
    // game openers: the previous game's winner (7-11 → away opens game 2, etc.)
    assert.deepEqual(turns.map((t) => t[0]), ['H2', 'A2', 'H2', 'H2', 'A2']);
    const sideOuts = s.events.filter((e) => e.label === 'Side-out').length;
    const handovers = s.events.filter((e) => e.label === '2nd server').length;
    assert.equal(sideOuts, G.reduce((n, g) => n + g.turns.length - 1, 0));
    assert.equal(handovers, G.reduce((n, g) => n + g.turns.slice(1).filter((t) => t.length === 2).length, 0));
  });
  test('named server and score call follow court position (USA Pickleball 4.B)', () => {
    const R = { home: ['ben', 'collin'], away: ['tyson', 'jaume'] };
    const pre: ScoreAction[] = [{ type: 'SET_START_RIGHT', payload: { side: 'home', playerId: 'ben' } }, { type: 'SET_START_RIGHT', payload: { side: 'away', playerId: 'tyson' } }];
    const at = (n: number) => play(PICKLE, CFG, [...pre, ...LOG.slice(0, n)]);
    const who = (st: RallyState) => [serverId(st, R), serveSpot(st).court, serveSpot(st).call];
    assert.deepEqual(who(at(0)), ['ben', 'right', '0-0-2']);
    assert.deepEqual(who(at(1)), ['ben', 'left', '1-0-2']);    // Johns 1-0, Ben switched courts
    assert.deepEqual(who(at(2)), ['tyson', 'right', '0-1-1']); // side-out; away score even → starter on the right
    assert.deepEqual(who(at(4)), ['tyson', 'right', '2-1-1']); // two points, back on the right
    assert.deepEqual(who(at(5)), ['jaume', 'left', '2-1-2']);  // fault → partner, from where he stands
    assert.deepEqual(who(at(6)), ['collin', 'right', '1-2-1']); // side-out; home score odd → partner on the right
  });
  test('scoreline + summary', () => {
    assert.equal(rallyScoreLine(s), '7-11, 11-9, 11-9, 8-11, 11-6');
    assert.deepEqual(rallySummary(s, 'side-out'), { homeScore: '3', awayScore: '2', statusLine: 'Match Over', detailLine: '7-11, 11-9, 11-9, 8-11, 11-6' });
    const live = play(PICKLE, CFG, LOG.slice(0, 4));
    assert.equal(rallySummary(live, 'side-out').statusLine, 'Game 1 · side-out · 2-1-1');
  });
  test('fingerprint pinned', () => {
    assert.equal(L.fingerprint(s as never, L.RALLY_KEYS), 'b72315edd00d');
  });
  // GAP (PB-11, already logged): the engine gives game 2+ first serve to the
  // previous game's winner; the USA Pickleball tournament rule is to be checked.
});

describe('replay: pickleball rally to 21 — MLP 2024 Premier championship, Dallas DreamBreaker 21-15', () => {
  // home = Dallas Flash, away = New Jersey 5s. Plain rally scoring to 21 (the 'dreambreaker' preset).
  const LOG = runs([4, 0], [4, 3], [9, 3], [9, 8], [14, 8], [14, 12], [18, 12], [18, 15], [21, 15]);
  const CFG = { scoring: 'rally', playersPerSide: 1, pointsPerGame: 21, winBy: 2, gamesToWin: 1 };
  const s = play(PICKLE, CFG, LOG);

  test('Dallas win the single game 21-15', () => {
    assert.equal(s.ended, true);
    assert.deepEqual(s.gamesWon, { home: 1, away: 0 });
    assert.deepEqual(s.games, [[21, 15]]);
    assert.equal(LOG.length, 36);
  });
  test('rally scoring: every rally scores; the rally winner serves next', () => {
    const mid = play(PICKLE, CFG, runs([4, 0], [4, 3]));
    assert.deepEqual(mid.current, { home: 4, away: 3 });
    assert.equal(rallyServingSide(mid), 'away');
    assert.equal(mid.events.some((e) => e.label === 'Side-out'), false);
  });
  test('win by two to 21: 21-20 does not end it, 22-20 does', () => {
    const d = play(PICKLE, CFG, runs([20, 20], [21, 20]));
    assert.equal(d.ended, false);
    assert.equal(play(PICKLE, CFG, runs([20, 20], [22, 20])).ended, true);
  });
  test('scoreline + summary', () => {
    assert.equal(rallyScoreLine(s), '21-15');
    assert.deepEqual(rallySummary(s, 'side-out'), { homeScore: '1', awayScore: '0', statusLine: 'Match Over', detailLine: '21-15' });
  });
  test('fingerprint pinned', () => {
    assert.equal(L.fingerprint(s as never, L.RALLY_KEYS), '3e467672eb97');
  });
  test('MLP freeze at 20: a receiving team at 20 wins the rally → serve only, no point',
    { todo: 'PB-09: MLP freeze is not modelled; the receiver scores 21 on a rally won at 20' }, () => {
      // 20-19 home; away served last (won the 19th). Home wins the rally while receiving → frozen: serve only.
      const f = play(PICKLE, { ...CFG, freezeAt: 20 }, runs([20, 0], [20, 19], [21, 19]));
      assert.deepEqual(f.current, { home: 20, away: 19 });
    });
});

describe('replay: pickleball singles side-out — PPA OC Cup 2024 final, Haworth bt Staksrud', () => {
  // home = Haworth (served first, assumed). Game 3 follows the published 5-2 → 7-7 → 11-7.
  const G: Array<{ first: Side; pts: number[] }> = [
    { first: 'home', pts: [2, 3, 1, 0, 3, 2, 0, 4, 3, 2] }, // 9-11
    { first: 'away', pts: [1, 3, 2, 0, 0, 4, 2, 4] },       // 11-5
    { first: 'home', pts: [3, 1, 2, 1, 2, 5, 4] },          // 11-7
  ];
  const LOG = G.flatMap((g) => singlesTurns(g.first, g.pts));
  const CFG = { scoring: 'sideout', playersPerSide: 1, pointsPerGame: 11, winBy: 2, gamesToWin: 2 };
  const s = play(PICKLE, CFG, LOG);

  test('Haworth wins 2-1: 9-11, 11-5, 11-7', () => {
    assert.equal(s.ended, true);
    assert.deepEqual(s.gamesWon, { home: 2, away: 1 });
    assert.deepEqual(s.games, [[9, 11], [11, 5], [11, 7]]);
  });
  test('singles: no second server — every lost rally is a side-out', () => {
    assert.equal(s.events.some((e) => e.label === '2nd server'), false);
    const turns = serveTurns(PICKLE, CFG, LOG);
    assert.deepEqual(turns, G.map((g) => g.pts.map((_, i) => ((i % 2 === 0) === (g.first === 'home') ? 'H' : 'A'))));
  });
  test('game 3 passes through 5-2 and 7-7; the server stands right on even, left on odd', () => {
    const before3 = [...singlesTurns('home', G[0].pts), ...singlesTurns('away', G[1].pts)];
    const g3 = singlesTurns('home', G[2].pts);
    const at = (n: number) => play(PICKLE, CFG, [...before3, ...g3.slice(0, n)]);
    assert.deepEqual(at(3 + 1 + 1 + 1 + 2 + 1 + 1).current, { home: 5, away: 2 }); // H3 · A1 · H2 · A1
    const sevenAll = at(g3.length - 4);
    assert.deepEqual(sevenAll.current, { home: 7, away: 7 });
    assert.deepEqual([serveSpot(sevenAll).side, serveSpot(sevenAll).court, serveSpot(sevenAll).call], ['home', 'left', '7-7']);
  });
  test('scoreline + fingerprint pinned', () => {
    assert.equal(rallyScoreLine(s), '9-11, 11-5, 11-7');
    assert.equal(L.fingerprint(s as never, L.RALLY_KEYS), 'f7e0a2225f01');
  });
});

// ------------------------------------------------------------------- padel --

/** Games from a string: H/A = a love game; h/a = a golden-point game (3-3, then the deciding point). */
function padelGames(seq: string): ScoreAction[] {
  return [...seq].flatMap((c) => {
    const w: Side = c.toLowerCase() === 'h' ? 'home' : 'away';
    if (c === c.toUpperCase()) return L.tGame(w);
    return [P('home'), P('away'), P('home'), P('away'), P('home'), P('away'), P(w)];
  });
}

describe('replay: padel — Valencia Premier Padel P1 2026 final, Coello/Tapia bt Chingotto/Galán', () => {
  // home = Coello/Tapia (served first, assumed), away = Chingotto/Galán.
  const SET1 = 'HAHAhAHaHAHA';                 // 6-6, all holds (two at golden point)
  const TB1 = [P('home'), ...Array(5).fill(P('away')), P('home'), P('home'), P('home'), P('away'), P('away')]; // 4-7
  const SET2 = 'HHAHHHH';                      // 6-1
  const SET3 = 'HAAHAAA' + 'HHh' + 'A' + 'H';  // 2-5 down → 5-5 → 5-6 → 6-6
  const TB3 = [P('home'), ...Array(5).fill(P('away')), ...Array(6).fill(P('home'))]; // 1-5 → 7-5
  const LOG = [...padelGames(SET1), ...TB1, ...padelGames(SET2), ...padelGames(SET3), ...TB3];
  const CFG = { deuce: 'golden', gamesPerSet: 6, setsToWin: 2, decider: 'set', playersPerSide: 2 }; // 'premier' preset
  const s = playPadel(CFG, LOG);
  const prefix = (n: number) => playPadel(CFG, LOG.slice(0, n));
  const len = (seq: string) => padelGames(seq).length;

  test('Coello/Tapia win 2-1: 6-7(4), 6-1, 7-6(5)', () => {
    assert.equal(s.ended, true);
    assert.deepEqual(s.setsWon, { home: 2, away: 1 });
    assert.deepEqual(s.sets, [[6, 7], [6, 1], [7, 6]]);
    assert.deepEqual(s.tb, [[4, 7], null, [7, 5]]);
  });
  test('published in-set scores: 2-5 down in set 3, 1-5 down in its tiebreak', () => {
    const set3Start = len(SET1) + TB1.length + len(SET2);
    assert.deepEqual(prefix(set3Start + len('HAAHAAA')).games, { home: 2, away: 5 });
    const tb3 = prefix(set3Start + len(SET3) + 6);
    assert.equal(padel.inTiebreak(tb3), true);
    assert.deepEqual(tb3.pts, { home: 1, away: 5 });
  });
  test('golden point: at 40-40 the next point wins the game; advantage scoring would not', () => {
    const g = playPadel(CFG, padelGames('h'));
    assert.deepEqual(g.games, { home: 1, away: 0 });
    const adv = playPadel({ ...CFG, deuce: 'advantage' }, padelGames('h'));
    assert.deepEqual(adv.games, { home: 0, away: 0 });
    assert.equal(padel.disp(adv, 'home'), 'Ad');
    const deuce = playPadel(CFG, padelGames('h').slice(0, 6));
    assert.equal(padel.summary(deuce).homeScore, '40');
    assert.equal(padel.summary(deuce).awayScore, '40');
  });
  test('serve rotation: alternates by game, pairs alternate players, across sets', () => {
    const at = (games: string, extra: ScoreAction[] = []) => padel.serveInfo(playPadel(CFG, [...padelGames(games), ...extra]));
    assert.deepEqual(at(''), { side: 'home', slot: 0 });
    assert.deepEqual(at('H'), { side: 'away', slot: 0 });
    assert.deepEqual(at('HA'), { side: 'home', slot: 1 });
    assert.deepEqual(at('HAH'), { side: 'away', slot: 1 });
    assert.deepEqual(at('HAHA'), { side: 'home', slot: 0 });
    // Set 2 (13 games played, the tiebreak counts as one): the side that received first in the breaker serves.
    assert.deepEqual(padel.serveInfo(prefix(len(SET1) + TB1.length)), { side: 'away', slot: 0 });
    // Set 3 (20 games played): home again.
    assert.equal(padel.serveInfo(prefix(len(SET1) + TB1.length + len(SET2))).side, 'home');
  });
  test('tiebreak serve: first point, then every two points', () => {
    const tbStart = len(SET1);
    const sides = Array.from({ length: TB1.length }, (_, i) => padel.serveInfo(prefix(tbStart + i)).side);
    assert.deepEqual(sides, ['home', 'away', 'away', 'home', 'home', 'away', 'away', 'home', 'home', 'away', 'away']);
  });
  test('doubles tiebreak: the partner serves the pair’s second turn (ITF/FIP serving order, SD-103)', () => {
    const tbStart = len(SET1);
    // Set 1 home served games 0,2,..,10 with slots 0,1,0,1,0,1; away 1,3,..,11 the same.
    const slots = Array.from({ length: 11 }, (_, i) => padel.serveInfo(prefix(tbStart + i)));
    assert.deepEqual(slots.map((x) => `${x.side[0]}${x.slot}`), ['h0', 'a0', 'a0', 'h1', 'h1', 'a1', 'a1', 'h0', 'h0', 'a0', 'a0']);
  });
  test('scoreline + summary (SD-01)', () => {
    assert.equal(padel.scoreLine(s), '6-7(4), 6-1, 7-6(5)');
    assert.equal(padel.scoreLine(s, 'away'), '7-6(4), 1-6, 6-7(5)');
    assert.deepEqual(padel.summary(s), { homeScore: '2', awayScore: '1', statusLine: 'Match Over', detailLine: '6-7(4), 6-1, 7-6(5)' });
  });
  test('fingerprint pinned', () => {
    assert.equal(L.fingerprint(s as never, L.TENNIS_KEYS), '3e04742b8a3f');
  });
});

describe('replay: padel short sets + match tiebreak (synthetic FIP short-set format)', () => {
  // 'short' preset: to 4, tiebreak at 4-4, golden point, super tiebreak to 10 as the decider.
  const CFG = { deuce: 'golden', gamesPerSet: 4, setsToWin: 2, decider: 'match10', playersPerSide: 2 };
  const LOG = [
    ...L.tSet(4, 1),
    ...L.tTiebreakSet(4, [...L.tbPts('home', 5), ...L.tbPts('away', 7)]),
    ...L.tbPts('away', 8), ...L.tbPts('home', 10),
  ];
  const s = playPadel(CFG, LOG);

  test('home wins 2-1: 4-1, 4-5(5), [10-8]', () => {
    assert.equal(s.ended, true);
    assert.deepEqual(s.setsWon, { home: 2, away: 1 });
    assert.deepEqual(s.sets, [[4, 1], [4, 5], [10, 8]]); // SD-20: match-TB points in the set entry
    assert.deepEqual(s.tb, [null, [5, 7], [10, 8]]);
    assert.equal(padel.scoreLine(s), '4-1, 4-5(5), [10-8]');
  });
  test('short set: 4-3 is not a set (win by two); 4-4 goes to a 7-point tiebreak', () => {
    const t = playPadel(CFG, [...L.tSet(3, 3), ...L.tGame('home')]);
    assert.deepEqual(t.games, { home: 4, away: 3 });
    assert.equal(t.sets.length, 0);
    const tb = playPadel(CFG, L.tSet(4, 4).slice(0, 32));
    assert.equal(padel.inTiebreak(tb), true);
  });
  test('the match tiebreak is to 10, win by two, with tiebreak serve rotation', () => {
    const mtbStart = L.tSet(4, 1).length + 32 + 12;
    const m = playPadel(CFG, LOG.slice(0, mtbStart));
    assert.equal(padel.matchTbActive(m), true);
    assert.equal(padel.summary(m).statusLine, 'Match tiebreak');
    // 5 + 9 = 14 games played (set 2's tiebreak counted as one) → home, who received first in that breaker, serves first.
    const sides = Array.from({ length: 5 }, (_, i) => padel.serveInfo(playPadel(CFG, LOG.slice(0, mtbStart + i))).side);
    assert.deepEqual(sides, ['home', 'away', 'away', 'home', 'home']);
    // SD-103: partners alternate turns in the match tiebreak too. Home is due with
    // slot 1 (game index 14), away with slot 1 (its next game would be index 15).
    const who = Array.from({ length: 9 }, (_, i) => padel.serveInfo(playPadel(CFG, LOG.slice(0, mtbStart + i))));
    assert.deepEqual(who.map((x) => `${x.side[0]}${x.slot}`), ['h1', 'a1', 'a1', 'h0', 'h0', 'a0', 'a0', 'h1', 'h1']);
    const nine = playPadel(CFG, [...LOG.slice(0, mtbStart), ...L.tbPts('away', 8), ...L.tbPts('home', 9)]);
    assert.equal(nine.ended, false); // 9-8
  });
  test('fingerprint pinned', () => {
    assert.equal(L.fingerprint(s as never, L.TENNIS_KEYS), '4dbc0f862f01'); // SD-20: match-TB set stored as [10-8]
  });
});
