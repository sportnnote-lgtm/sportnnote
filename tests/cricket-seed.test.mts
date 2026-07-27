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
import { init, reducer, type CricketState } from '../src/sports/cricket/engine.ts';
import { CRICKET_MATCH_EVENTS, CRICKET_SEED_EXPECT } from '../src/data/cricketSeed.ts';

const replay = (events: { type: string; side?: unknown; payload?: unknown }[], config: Record<string, unknown>): CricketState =>
  events.reduce<CricketState>(
    (s, e) => reducer(s, { type: e.type, side: e.side as never, payload: e.payload as never }),
    init(config),
  );

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
