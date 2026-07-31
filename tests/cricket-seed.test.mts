/**
 * Completed-cricket seed integrity. The demo rebuilds a cricket match by
 * replaying its event log through the pure reducer; these seeds must therefore
 * replay to the EXACT final scoreboard with `ended: true`, or the completed
 * fixtures would show a wrong/placeholder Summary. This test replays each seed
 * through the real engine and asserts the totals — so a drift in the reducer or
 * a bad script fails CI, not the app.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { init, reducer, ballStamp, oversStr, type CricketState } from '../src/sports/cricket/engine.ts';
import { CRICKET_MATCH_EVENTS, CRICKET_SEED_EXPECT, CRICKET_LIVE_EVENTS, LIVE } from '../src/data/cricketSeed.ts';

const replay = (events: { type: string; side?: unknown; payload?: unknown }[], config: Record<string, unknown>): CricketState =>
  events.reduce<CricketState>(
    (s, e) => reducer(s, { type: e.type, side: e.side as never, payload: e.payload as never }),
    init(config),
  );

describe('ballStamp uses standard delivery notation (ball 1–6, not N.0)', () => {
  test('the 6th ball of an over is (over).6, not (over+1).0', () => {
    assert.equal(ballStamp(1), '0.1');
    assert.equal(ballStamp(5), '0.5');
    assert.equal(ballStamp(6), '0.6'); // was "1.0" before the fix
    assert.equal(ballStamp(7), '1.1');
    assert.equal(ballStamp(12), '1.6'); // was "2.0"
    assert.equal(ballStamp(13), '2.1');
    assert.equal(ballStamp(45), '7.3');
  });
  test('oversStr (over counts) is unchanged — 6 balls = 1.0 over', () => {
    assert.equal(oversStr(6), '1.0');
    assert.equal(oversStr(45), '7.3');
  });
});

describe('completed cricket seeds replay to the right final state', () => {
  for (const e of CRICKET_SEED_EXPECT) {
    test(`${e.id}: ${e.home}/${e.homeWkts} vs ${e.away}/${e.awayWkts}, match over`, () => {
      const events = CRICKET_MATCH_EVENTS[e.id];
      assert.ok(events && events.length > 0, `no seeded events for ${e.id}`);
      const s = replay(events, { overs: e.overs, playersPerSide: e.players });

      assert.equal(s.ended, true, `${e.id} should be ended`);
      assert.equal(s.scores.home.runs, e.home, `${e.id} home runs`);
      assert.equal(s.scores.away.runs, e.away, `${e.id} away runs`);
      assert.equal(s.scores.home.wickets, e.homeWkts, `${e.id} home wickets`);
      assert.equal(s.scores.away.wickets, e.awayWkts, `${e.id} away wickets`);
      // Home batted first and defends a bigger total, so home wins outright.
      assert.ok(s.scores.home.runs > s.scores.away.runs, `${e.id} home should out-score away`);
      assert.equal(s.pendingTie ?? false, false, `${e.id} must not be an unresolved tie`);
    });
  }

  test('run distribution is natural — the single is the most common scoring shot', () => {
    for (const e of CRICKET_SEED_EXPECT) {
      const runs = CRICKET_MATCH_EVENTS[e.id].filter((v) => v.type === 'RUNS').map((v) => (v.payload as { runs: number }).runs);
      const count = (r: number) => runs.filter((x) => x === r).length;
      const ones = count(1), twos = count(2), threes = count(3);
      // The old seed put 0 singles and a wall of twos; guard against that.
      assert.ok(ones >= 12, `${e.id}: too few singles (${ones})`);
      assert.ok(ones > twos && ones > threes, `${e.id}: singles (${ones}) should out-number 2s (${twos}) and 3s (${threes})`);
      // …and twos out-number threes, as in real cricket (not the reverse).
      assert.ok(twos >= threes, `${e.id}: twos (${twos}) should be ≥ threes (${threes})`);
      // Several distinct scoring outcomes appear (not a single degenerate value).
      const distinct = [0, 1, 2, 3, 4, 6].filter((r) => count(r) > 0).length;
      assert.ok(distinct >= 5, `${e.id}: only ${distinct} distinct outcomes`);
    }
  });

  test('each innings fills its overs (no early collapse) and books real batters', () => {
    for (const e of CRICKET_SEED_EXPECT) {
      const s = replay(CRICKET_MATCH_EVENTS[e.id], { overs: e.overs, playersPerSide: e.players });
      const legalBalls = e.overs * 6;
      assert.equal(s.scores.home.balls, legalBalls, `${e.id} first innings balls`);
      assert.equal(s.scores.away.balls, legalBalls, `${e.id} second innings balls`);
      // A populated card is what makes the Summary's ratings + podium render.
      assert.ok(Object.keys(s.batting).length >= 4, `${e.id} batting card too thin`);
      assert.ok(Object.keys(s.bowling).length >= 4, `${e.id} bowling card too thin`);
    }
  });
});

describe('live cricket seed replays to a real in-progress state', () => {
  const s = replay(CRICKET_LIVE_EVENTS[LIVE.id], { overs: LIVE.overs, playersPerSide: LIVE.players });

  test(`${LIVE.id}: ${LIVE.runs}/${LIVE.wickets}, mid-innings (not ended)`, () => {
    assert.equal(s.ended, false, 'live match must not be ended');
    assert.equal(s.innings, 1, 'still the first innings');
    assert.equal(s.battingSide, 'home', 'Red batting first');
    assert.equal(s.scores.home.runs, LIVE.runs, 'home runs');
    assert.equal(s.scores.home.wickets, LIVE.wickets, 'home wickets');
    assert.equal(s.scores.home.balls, LIVE.balls, 'balls bowled so far');
    assert.equal(s.scores.away.balls, 0, 'Blue has not batted');
  });

  test('the current crease and bowler are set for the live view', () => {
    assert.ok(s.strikerId && s.nonStrikerId, 'both batters at the crease are set');
    assert.notEqual(s.strikerId, s.nonStrikerId, 'striker and non-striker differ');
    assert.ok(s.bowlerId, 'a bowler is mid-over');
    // The two batters at the crease are not out.
    for (const id of [s.strikerId!, s.nonStrikerId!]) {
      assert.equal(s.batting[id]?.out ?? false, false, `crease batter ${id} should be not out`);
    }
  });
});
