/** Americano engine: rotating-partner schedule + per-player points leaderboard. */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { americanoSchedule, americanoStandings, gameKey, suggestedAmericanoRounds } from '../src/data/americano.ts';

describe('americano', () => {
  test('4 players → one game per round, partners rotate', () => {
    const sched = americanoSchedule(['1', '2', '3', '4'], 3);
    assert.equal(sched.length, 3);
    for (const r of sched) { assert.equal(r.games.length, 1); assert.equal(r.resting.length, 0); }
    // Each round everyone plays (2 v 2), and partners differ across the 3 rounds.
    const partnerOf1 = sched.map((r) => {
      const g = r.games[0];
      const side = g.a.includes('1') ? g.a : g.b;
      return side.find((x) => x !== '1');
    });
    assert.deepEqual([...new Set(partnerOf1)].sort(), ['2', '3', '4']); // partnered each of the others once
  });

  test('odd field rests exactly one player each round', () => {
    const sched = americanoSchedule(['1', '2', '3', '4', '5'], 3);
    for (const r of sched) {
      const playing = new Set(r.games.flatMap((g) => [...g.a, ...g.b]));
      assert.equal(playing.size + r.resting.length, 5);
      assert.equal(r.resting.length, 1);
    }
  });

  test('6 players → one game (4 play) + 2 rest each round', () => {
    const sched = americanoSchedule(['1', '2', '3', '4', '5', '6'], 2);
    for (const r of sched) { assert.equal(r.games.length, 1); assert.equal(r.resting.length, 2); }
  });

  test('standings sum each player’s side score across games', () => {
    const sched = americanoSchedule(['1', '2', '3', '4'], 1);
    const g = sched[0].games[0];
    const scores = { [gameKey(g)]: { a: 24, b: 16 } };
    const players = ['1', '2', '3', '4'].map((id) => ({ id, name: id }));
    const table = americanoStandings(players, sched, scores);
    // The two 'a' players got 24 each; the two 'b' players 16 each.
    for (const id of g.a) assert.equal(table.find((t) => t.id === id)!.points, 24);
    for (const id of g.b) assert.equal(table.find((t) => t.id === id)!.points, 16);
    assert.equal(table[0].points, 24); // ranked by points desc
  });

  test('suggested rounds = n-1 (even), capped at 12', () => {
    assert.equal(suggestedAmericanoRounds(4), 3);
    assert.equal(suggestedAmericanoRounds(8), 7);
    assert.equal(suggestedAmericanoRounds(20), 12);
    assert.equal(suggestedAmericanoRounds(3), 0);
  });
});
