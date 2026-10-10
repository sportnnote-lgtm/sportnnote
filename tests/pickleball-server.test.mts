/**
 * SD-06 — pickleball server identity by court position (USA Pickleball rules).
 * Doubles side-out: 0-0-2 start from the right, players switch courts only on
 * their own team's points, server 1 at each side-out is the right-court player,
 * then the partner as server 2. Singles: right on an even score, left on odd.
 * Old logs (no SET_START_RIGHT) replay to the same scoring state.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as L from './racketLogs.mts';
import {
  makeRallyEngine, serveSpot, serverId, rightCourtId, rallySummary, type RallyState,
} from '../src/sports/rallyEngine.ts';
import type { ScoreAction } from '../src/sports/types.ts';

const PB = makeRallyEngine({ icon: '🥒', sideOutValue: 'sideout', sideOutLabel: 'Side-out', defaults: { playersPerSide: 2, target: 11, winBy: 2, gamesToWin: 2 } });
const P = (side: 'home' | 'away'): ScoreAction => ({ type: 'POINT', side });
const START = (side: 'home' | 'away', playerId: string): ScoreAction => ({ type: 'SET_START_RIGHT', payload: { side, playerId } });
const play = (cfg: Record<string, unknown>, log: ScoreAction[], from?: RallyState) => log.reduce(PB.reducer, from ?? PB.init(cfg));

// Rosters in lineup order: Asha is listed first, but Bina starts on the right.
const R = { home: ['asha', 'bina'], away: ['chen', 'dev'] };
const SO = { scoring: 'sideout', playersPerSide: 2 };
const who = (s: RallyState) => ({ id: serverId(s, R), ...serveSpot(s) });

describe('doubles side-out: right-court server', () => {
  const picked = play(SO, [START('home', 'bina'), START('away', 'dev')]);

  test('0-0-2 start: the right-court starter serves from the right', () => {
    const w = who(picked);
    assert.equal(w.side, 'home');
    assert.equal(w.id, 'bina');
    assert.equal(w.court, 'right');
    assert.equal(w.call, '0-0-2');
    assert.equal(rallySummary(picked, 'side-out').statusLine, 'Game 1 · side-out · 0-0-2');
  });

  test('the server switches courts on each point won, and keeps serving', () => {
    const s1 = play(SO, [P('home')], picked);
    assert.deepEqual([who(s1).id, who(s1).court, who(s1).call], ['bina', 'left', '1-0-2']);
    assert.equal(rightCourtId(s1, 'home', R.home), 'asha');
    const s2 = play(SO, [P('home')], s1);
    assert.deepEqual([who(s2).id, who(s2).court, who(s2).call], ['bina', 'right', '2-0-2']);
  });

  test('a fault at the start is a side-out (no second server); server 1 = right-court player', () => {
    const s = play(SO, [P('home'), P('away')], picked); // home 1-0, then home faults
    const w = who(s);
    assert.equal(w.side, 'away');
    assert.equal(w.id, 'dev'); // away score 0 → their starter is on the right
    assert.equal(w.court, 'right');
    assert.equal(w.call, '0-1-1');
  });

  test('second server is the partner, serving from wherever they stand', () => {
    // home 1-0 · side-out · away wins 1 (dev → left) · away faults → 2nd server
    const s = play(SO, [P('home'), P('away'), P('away'), P('home')], picked);
    assert.equal(s.serverNo, 2);
    const w = who(s);
    assert.equal(w.side, 'away');
    assert.equal(w.id, 'chen');
    assert.equal(w.court, 'right'); // away on 1 (odd) → chen is in the right court
    assert.equal(w.call, '1-1-2');
    // chen wins a point → moves left, still serving
    const s2 = play(SO, [P('away')], s);
    assert.deepEqual([who(s2).id, who(s2).court, who(s2).call], ['chen', 'left', '2-1-2']);
    // chen faults → side-out to home on 1 (odd) → asha is right → asha is server 1
    const s3 = play(SO, [P('home')], s2);
    assert.deepEqual([who(s3).side, who(s3).id, who(s3).court, who(s3).call], ['home', 'asha', 'right', '1-2-1']);
  });

  test('second server can start from the left', () => {
    // side-out to away; dev (right) wins 0→1 (left), 1→2 (right); faults → chen, who is LEFT on 2
    const s = play(SO, [P('away'), P('away'), P('away'), P('home')], picked);
    assert.deepEqual([who(s).id, who(s).court, who(s).call], ['chen', 'left', '2-0-2']);
  });

  test('without a pick, the first listed player starts on the right', () => {
    const s = PB.init(SO);
    assert.equal(serverId(s, R), 'asha');
    const so = play(SO, [P('away')], s);
    assert.equal(serverId(so, R), 'chen');
  });

  test('SET_START_RIGHT is pre-serve only and never changes the score', () => {
    const s = play(SO, [P('home')], PB.init(SO));
    const after = PB.reducer(s, START('home', 'bina'));
    assert.equal(after, s); // ignored once a point is on the board
    const pre = PB.reducer(PB.init(SO), START('home', 'bina'));
    assert.deepEqual(pre.current, { home: 0, away: 0 });
    assert.equal(pre.events.length, 0);
    assert.equal(PB.reducer(pre, START('home', '')), pre);
  });

  test('a new game: 0-0-2 again, the pick carries over and can be changed', () => {
    const g1 = play(SO, Array(11).fill(P('home')), picked);
    assert.equal(g1.games.length, 1);
    assert.deepEqual([who(g1).id, who(g1).call], ['bina', '0-0-2']);
    const g2 = PB.reducer(g1, START('home', 'asha'));
    assert.equal(serverId(g2, R), 'asha');
  });
});

describe('singles side-out: court by the server\'s score', () => {
  const S1 = { scoring: 'sideout', playersPerSide: 1 };
  const RS = { home: ['asha'], away: ['chen'] };
  test('right when even, left when odd; two-number call', () => {
    let s = PB.init(S1);
    assert.deepEqual([serveSpot(s).court, serveSpot(s).call, serverId(s, RS)], ['right', '0-0', 'asha']);
    s = play(S1, [P('home')], s);
    assert.deepEqual([serveSpot(s).court, serveSpot(s).call], ['left', '1-0']);
    s = play(S1, [P('away')], s); // side-out at 1-0 (singles has one server)
    assert.deepEqual([serveSpot(s).side, serveSpot(s).court, serveSpot(s).call, serverId(s, RS)], ['away', 'right', '0-1', 'chen']);
    s = play(S1, [P('away')], s);
    assert.deepEqual([serveSpot(s).court, serveSpot(s).call], ['left', '1-1']);
  });
});

describe('rally scoring still works', () => {
  const RA = { scoring: 'rally', playersPerSide: 2 };
  test('every rally scores; the rally winner serves from the right-court player', () => {
    let s = play(RA, [START('home', 'bina')]);
    assert.equal(serverId(s, R), 'bina');
    s = play(RA, [P('away')], s);
    assert.deepEqual(s.current, { home: 0, away: 1 });
    // away on 1 (odd) → their partner (dev) is on the right and serves
    assert.deepEqual([serveSpot(s).side, serveSpot(s).court, serveSpot(s).call, serverId(s, R)], ['away', 'right', '1-0', 'dev']);
    s = play(RA, [P('home')], s);
    assert.deepEqual([serveSpot(s).side, serverId(s, R), serveSpot(s).call], ['home', 'asha', '1-1']);
    assert.equal(rallySummary(s, 'side-out').statusLine, 'Game 1');
  });
  test('a rally match replays to the same final', () => {
    const s = play({}, L.PICKLEBALL_RALLY_LOG);
    assert.deepEqual(s.games, [[11, 4], [11, 9]]);
    assert.equal(s.ended, true);
  });
});

describe('legacy replay identity', () => {
  // The same engine options final-score.test.mts pinned before SD-06.
  const LEGACY = makeRallyEngine({ icon: '•', sideOutValue: 'sideout', sideOutLabel: 'Side out', defaults: { playersPerSide: 2, target: 11, winBy: 2, gamesToWin: 2 } });
  const run = (cfg: Record<string, unknown>, log: ScoreAction[]) => log.reduce(LEGACY.reducer, LEGACY.init(cfg));
  test('old pickleball logs (no SET_START_RIGHT) keep their fingerprints', () => {
    assert.equal(L.fingerprint(run({}, L.PICKLEBALL_RALLY_LOG) as never, L.RALLY_KEYS), '6da6172329ae');
    assert.equal(L.fingerprint(run({ scoring: 'sideout' }, L.PICKLEBALL_SIDEOUT_LOG) as never, L.RALLY_KEYS), '708ab706e90d');
  });
  test('a pick adds no events and leaves the scoring state identical', () => {
    const plain = run({ scoring: 'sideout' }, L.PICKLEBALL_SIDEOUT_LOG);
    const withPick = run({ scoring: 'sideout' }, [START('home', 'bina'), START('away', 'dev'), ...L.PICKLEBALL_SIDEOUT_LOG]);
    assert.equal(L.fingerprint(withPick as never, L.RALLY_KEYS), L.fingerprint(plain as never, L.RALLY_KEYS));
  });
  test('stored point attribution is replayed as recorded (credit is never re-derived)', () => {
    const credit: ScoreAction = { type: 'POINT', side: 'home', attribution: { playerId: 'asha', stat: 'points', playerName: 'Asha' } };
    const s = run({ scoring: 'sideout' }, [START('home', 'bina'), credit]);
    assert.equal(s.events.at(-1)?.playerName, 'Asha');
  });
});
