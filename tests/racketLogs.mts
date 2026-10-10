/**
 * Sample event logs for the set/game sports (SD-01 / SD-02 tests) and a
 * fingerprint of the SCORING state they replay to. Not a test file itself (no
 * `.test.`), so `npm test` doesn't run it directly.
 *
 * The fingerprints pinned in final-score.test.mts were captured by replaying
 * these same logs through the engines as they were BEFORE SD-01/02 (git HEAD
 * d4c8cba). Matching them proves old logs still replay to the same scores, and
 * that the new `tb` field is purely derived (it's left out of the fingerprint).
 */
import { createHash } from 'node:crypto';
import type { ScoreAction } from '../src/sports/types.ts';

export type Side = 'home' | 'away';
const P = (side: Side): ScoreAction => ({ type: 'POINT', side });
const ACE = (side: Side): ScoreAction => ({ type: 'ACE', side });

// ----------------------------------------------------------- tennis/padel --

/** One game won to love. */
export const tGame = (side: Side): ScoreAction[] => [P(side), P(side), P(side), P(side)];

/** A set to an exact score without a tiebreak (e.g. 6-4): alternate games, then the winner's run. */
export function tSet(h: number, a: number): ScoreAction[] {
  const out: ScoreAction[] = [];
  const lo = Math.min(h, a);
  for (let i = 0; i < lo; i++) out.push(...tGame('home'), ...tGame('away'));
  const w: Side = h > a ? 'home' : 'away';
  for (let i = 0; i < Math.abs(h - a); i++) out.push(...tGame(w));
  return out;
}

/** A set that reaches `at`-all, then a tiebreak with these points (in order). */
export function tTiebreakSet(at: number, tb: ScoreAction[]): ScoreAction[] {
  const out: ScoreAction[] = [];
  for (let i = 0; i < at; i++) out.push(...tGame('home'), ...tGame('away'));
  return [...out, ...tb];
}

/** `n` tiebreak points for `side` (the first one an ace, to cover ACE). */
export const tbPts = (side: Side, n: number, withAce = false): ScoreAction[] =>
  Array.from({ length: n }, (_, i) => (withAce && i === 0 ? ACE(side) : P(side)));

/** Bo3: 6-4, 3-6, 7-6(4) — the set-3 tiebreak goes 7-4 to home. */
export const TENNIS_BO3: ScoreAction[] = [
  ...tSet(6, 4),
  ...tSet(3, 6),
  ...tTiebreakSet(6, [...tbPts('home', 3, true), ...tbPts('away', 4), ...tbPts('home', 4)]),
];

/** Bo5 to two sets all, used for the Grand Slam decider tests. */
export const TENNIS_TWO_ALL: ScoreAction[] = [...tSet(6, 3), ...tSet(4, 6), ...tSet(6, 2), ...tSet(3, 6)];

/** Padel Bo3: 6-4, 6-7(5), then the decider (a full set or a match tiebreak). */
export const PADEL_TWO_SETS: ScoreAction[] = [
  ...tSet(6, 4),
  ...tTiebreakSet(6, [...tbPts('home', 5), ...tbPts('away', 7)]),
];

// ----------------------------------------------------------------- rally --

/** A game to an exact score: alternate rallies to the loser's total, then the winner's run. */
export function rGame(h: number, a: number): ScoreAction[] {
  const out: ScoreAction[] = [];
  const lo = Math.min(h, a);
  for (let i = 0; i < lo; i++) out.push(P('home'), P('away'));
  const w: Side = h > a ? 'home' : 'away';
  for (let i = 0; i < Math.abs(h - a); i++) out.push(P(w));
  return out;
}
export const rMatch = (...games: Array<[number, number]>): ScoreAction[] => games.flatMap(([h, a]) => rGame(h, a));

/** Badminton 21-18, 19-21, 21-15 (BWF bo3). */
export const BADMINTON_LOG = rMatch([21, 18], [19, 21], [21, 15]);
/** Table tennis bo5: 11-7, 9-11, 11-5, 13-11. */
export const TT_LOG = rMatch([11, 7], [9, 11], [11, 5], [13, 11]);
/** Squash PAR 11 bo5: 11-9, 8-11, 11-6, 7-11, 12-10. */
export const SQUASH_LOG = rMatch([11, 9], [8, 11], [11, 6], [7, 11], [12, 10]);
/** Pickleball rally scoring bo3: 11-4, 11-9. */
export const PICKLEBALL_RALLY_LOG = rMatch([11, 4], [11, 9]);
/** Pickleball side-out doubles: who WON each rally (the server scores only on a win). */
export const PICKLEBALL_SIDEOUT_LOG: ScoreAction[] = (() => {
  const out: ScoreAction[] = [];
  // Home wins game 1 11-0 serving throughout; game 2: away holds serve to 11-0.
  for (let i = 0; i < 11; i++) out.push(P('home'));
  out.push(P('away')); // game 2: home (winner) serves first as server 2 → fault = side-out
  for (let i = 0; i < 11; i++) out.push(P('away'));
  out.push(P('home')); // game 3: away serves first, home wins the rally → side-out
  for (let i = 0; i < 11; i++) out.push(P('home'));
  return out;
})();

// ---------------------------------------------------------------- carrom --

export type Board = [Side, number, boolean];
/** ICF bo3: 25-18 (with a queen), 12-25, 25-20. Boards are [winner, opp coins left, queen]. */
export const CARROM_BOARDS: Board[] = [
  // game 1: home 25 (9+3, 9, 4 = 25), away 18 (9, 9)
  ['home', 9, true], ['away', 9, false], ['home', 9, false], ['away', 9, false], ['home', 4, false],
  // game 2: away to 25 (9+3, 9, 4), home 12 (9, 3)
  ['away', 9, true], ['home', 9, false], ['away', 9, false], ['home', 3, false], ['away', 4, false],
  // game 3: home 25 (9+3, 9, 9 → capped at 25), away 20 (9, 9, 2)
  ['home', 9, true], ['away', 9, false], ['home', 9, false], ['away', 9, false], ['away', 2, false], ['home', 9, false],
];

// ----------------------------------------------------------- fingerprint --

type AnyEvent = { stamp?: string; label?: string; detail?: string; side?: string };
/** A short hash of the scoring state — everything a replay must reproduce. */
export function fingerprint(state: Record<string, unknown>, keys: string[]): string {
  const pick: Record<string, unknown> = {};
  for (const k of keys) pick[k] = state[k];
  const events = (state.events as AnyEvent[] | undefined)?.map((e) => [e.stamp, e.label, e.detail, e.side]);
  return createHash('sha1').update(JSON.stringify({ pick, events })).digest('hex').slice(0, 12);
}
export const TENNIS_KEYS = ['pts', 'games', 'sets', 'setsWon', 'ended'];
export const RALLY_KEYS = ['current', 'games', 'gamesWon', 'ended', 'serving', 'serverNo'];
export const CARROM_KEYS = ['current', 'games', 'gamesWon', 'ended', 'boards'];

// ------------------------------------------------- SD-19 · credited logs --

/** SD-19 — the log as the live controls would dispatch it: every action that
 *  SCORES a point (or ace) carries an attribution to a player of the scoring
 *  side (rotating through `players[side]`), exactly like ScoringControls; a
 *  side-out rally that scores nothing carries none. Player names are the ids
 *  upper-cased (so name-only resolution can be tested). */
export function credited<S extends { events: Array<{ kind?: string; side?: Side }> }>(
  reducer: (s: S, a: ScoreAction) => S,
  start: S,
  actions: ScoreAction[],
  players: { home: string[]; away: string[] },
): ScoreAction[] {
  let s = start;
  const turn = { home: 0, away: 0 };
  const out: ScoreAction[] = [];
  for (const a of actions) {
    const next = reducer(s, a);
    const fresh = next.events.slice(s.events.length).find((e) => e.kind === 'point' || e.kind === 'ace');
    let act = a;
    if (fresh?.side && players[fresh.side].length && (a.type === 'POINT' || a.type === 'ACE')) {
      const list = players[fresh.side];
      const id = list[turn[fresh.side]++ % list.length];
      act = { ...a, attribution: { playerId: id, stat: a.type === 'ACE' ? 'aces' : 'points', playerName: id.toUpperCase() } };
    }
    out.push(act);
    s = reducer(s, act);
  }
  return out;
}

/** ctx players for `credited` logs (names = ids upper-cased). */
export const ctxOf = (players: { home: string[]; away: string[] }) => ({
  players: {
    home: players.home.map((id) => ({ id, name: id.toUpperCase() })),
    away: players.away.map((id) => ({ id, name: id.toUpperCase() })),
  },
});

// ------------------------------------- SD-14 real-match logs (shared, SD-22) --
// The reconstructions replayed in tests/replay-racket.test.mts (sources there),
// exported so the SD-22 serve-stats tests run on the very same logs.

const opp = (s: Side): Side => (s === 'home' ? 'away' : 'home');
/** Rally scoring: straight runs through the given in-game scores (home first). */
export function runs(...checkpoints: Array<[number, number]>): ScoreAction[] {
  const out: ScoreAction[] = [];
  let h = 0;
  let a = 0;
  for (const [H, A] of checkpoints) {
    for (; h < H; h++) out.push(P('home'));
    for (; a < A; a++) out.push(P('away'));
  }
  return out;
}
/** Side-out singles: points per service turn, alternating from `first`. */
export function singlesTurns(first: Side, pts: number[]): ScoreAction[] {
  const out: ScoreAction[] = [];
  let srv = first;
  pts.forEach((n, i) => {
    for (let k = 0; k < n; k++) out.push(P(srv));
    if (i < pts.length - 1) out.push(P(opp(srv)));
    srv = opp(srv);
  });
  return out;
}
/** Side-out doubles: team turns ([n] first, then [server 1, server 2]). */
export function doublesTurns(first: Side, turns: number[][]): ScoreAction[] {
  const out: ScoreAction[] = [];
  let srv = first;
  turns.forEach((t, i) => {
    t.forEach((n, j) => {
      for (let k = 0; k < n; k++) out.push(P(srv));
      const last = i === turns.length - 1 && j === t.length - 1;
      if (!last) out.push(P(opp(srv)));
    });
    srv = opp(srv);
  });
  return out;
}
/** Padel games: H/A = a love game; h/a = a golden-point game (3-3, then the decider). */
export function padelGames(seq: string): ScoreAction[] {
  return [...seq].flatMap((c) => {
    const w: Side = c.toLowerCase() === 'h' ? 'home' : 'away';
    if (c === c.toUpperCase()) return tGame(w);
    return [P('home'), P('away'), P('home'), P('away'), P('home'), P('away'), P(w)];
  });
}

/** Squash PSA — Egyptian Open 2024 final, Asal (home) bt Farag 11-3, 13-11, 5-11, 11-8. */
export const SQUASH_PSA = {
  cfg: { scoring: 'par', pointsPerGame: 11, winBy: 2, gamesToWin: 3 },
  log: [
    ...runs([2, 0], [2, 1], [6, 1], [6, 3], [11, 3]),
    ...runs([3, 0], [3, 4], [7, 4], [7, 8], [10, 8], [10, 10], [11, 10], [11, 11], [13, 11]),
    ...runs([1, 0], [1, 3], [4, 3], [4, 8], [5, 8], [5, 11]),
    ...runs([2, 0], [2, 3], [6, 3], [6, 6], [9, 6], [9, 8], [11, 8]),
  ],
};
/** Squash English — British Open 1993 final, Jansher (home) bt Dittmar 9-6, 9-5, 6-9, 9-2. */
export const SQUASH_ENGLISH = {
  cfg: { scoring: 'english', pointsPerGame: 9, winBy: 1, gamesToWin: 3 },
  log: [
    { first: 'home' as Side, pts: [2, 1, 0, 3, 3, 2, 4] },
    { first: 'home' as Side, pts: [1, 2, 3, 0, 2, 3, 3] },
    { first: 'home' as Side, pts: [2, 0, 1, 4, 3, 2, 0, 3] },
    { first: 'away' as Side, pts: [1, 4, 1, 5] },
  ].flatMap((g) => singlesTurns(g.first, g.pts)),
};
/** Pickleball PPA side-out doubles — LA Open 2024, Johns (home) bt McGuffin / Martinez Vich. */
export const PICKLE_SIDEOUT_DOUBLES = {
  cfg: { scoring: 'sideout', playersPerSide: 2, pointsPerGame: 11, winBy: 2, gamesToWin: 3 },
  games: [
    { first: 'home' as Side, turns: [[1], [2, 0], [0, 2], [3, 1], [2, 0], [0, 2], [1, 1], [2, 1]] },
    { first: 'away' as Side, turns: [[2], [1, 2], [0, 3], [3, 0], [1, 1], [0, 2], [2, 0], [1, 2]] },
    { first: 'home' as Side, turns: [[3], [1, 2], [0, 1], [2, 0], [2, 2], [1, 1], [0, 1], [2, 0], [1, 1]] },
    { first: 'home' as Side, turns: [[2], [3, 0], [1, 2], [0, 2], [2, 0], [2, 2], [0, 1], [1, 1]] },
    { first: 'away' as Side, turns: [[1], [2, 1], [0, 2], [3, 0], [1, 0], [2, 2], [2, 0], [1]] },
  ],
  get log() { return this.games.flatMap((g) => doublesTurns(g.first, g.turns)); },
};
/** Pickleball MLP rally to 21 — Dallas (home) 21-15. */
export const PICKLE_RALLY21 = {
  cfg: { scoring: 'rally', playersPerSide: 1, pointsPerGame: 21, winBy: 2, gamesToWin: 1 },
  log: runs([4, 0], [4, 3], [9, 3], [9, 8], [14, 8], [14, 12], [18, 12], [18, 15], [21, 15]),
};
/** Pickleball singles side-out — PPA OC Cup 2024, Haworth (home) bt Staksrud 9-11, 11-5, 11-7. */
export const PICKLE_SIDEOUT_SINGLES = {
  cfg: { scoring: 'sideout', playersPerSide: 1, pointsPerGame: 11, winBy: 2, gamesToWin: 2 },
  log: [
    { first: 'home' as Side, pts: [2, 3, 1, 0, 3, 2, 0, 4, 3, 2] },
    { first: 'away' as Side, pts: [1, 3, 2, 0, 0, 4, 2, 4] },
    { first: 'home' as Side, pts: [3, 1, 2, 1, 2, 5, 4] },
  ].flatMap((g) => singlesTurns(g.first, g.pts)),
};
/** Padel Premier — Valencia P1 2026 final, Coello/Tapia (home) bt Chingotto/Galán 6-7(4), 6-1, 7-6(5). */
export const PADEL_VALENCIA = {
  cfg: { deuce: 'golden', gamesPerSet: 6, setsToWin: 2, decider: 'set', playersPerSide: 2 },
  log: [
    ...padelGames('HAHAhAHaHAHA'),
    P('home'), ...Array(5).fill(P('away')), P('home'), P('home'), P('home'), P('away'), P('away'),
    ...padelGames('HHAHHHH'),
    ...padelGames('HAAHAAAHHhAH'),
    P('home'), ...Array(5).fill(P('away')), ...Array(6).fill(P('home')),
  ] as ScoreAction[],
};
