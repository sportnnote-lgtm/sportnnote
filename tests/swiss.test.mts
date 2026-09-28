/** Swiss pairing engine: round 1 seeding, rematch avoidance, and byes. */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { swissRound1, swissNextRound, pairKey, suggestedSwissRounds } from '../src/data/swiss.ts';

describe('swiss', () => {
  test('round 1 pairs top half vs bottom half (8 seeds)', () => {
    const { pairings, byeId } = swissRound1(['1', '2', '3', '4', '5', '6', '7', '8']);
    assert.equal(byeId, undefined);
    assert.equal(pairings.length, 4);
    // 1v5, 2v6, 3v7, 4v8
    assert.deepEqual(pairings.map((p) => [p.homeId, p.awayId]), [['1', '5'], ['2', '6'], ['3', '7'], ['4', '8']]);
    assert.ok(pairings.every((p) => p.round === 1));
  });

  test('odd field gives exactly one bye and pairs the rest', () => {
    const { pairings, byeId } = swissRound1(['1', '2', '3', '4', '5']);
    assert.ok(byeId, 'someone gets a bye');
    assert.equal(pairings.length, 2); // 4 remaining → 2 matches
    const scheduled = new Set(pairings.flatMap((p) => [p.homeId, p.awayId]));
    assert.ok(!scheduled.has(byeId!), 'the bye entrant is not scheduled');
  });

  test('next round avoids rematches', () => {
    const played = new Set([pairKey('1', '2'), pairKey('3', '4')]);
    const { pairings } = swissNextRound(['1', '2', '3', '4'], played, 2);
    assert.equal(pairings.length, 2);
    for (const p of pairings) assert.ok(!played.has(pairKey(p.homeId, p.awayId)), `no rematch: ${p.homeId} v ${p.awayId}`);
  });

  test('next round bye skips someone who already had one', () => {
    const { byeId } = swissNextRound(['1', '2', '3'], new Set(), 2, new Set(['3']));
    assert.notEqual(byeId, '3'); // 3 already had a bye → someone else sits out
    assert.ok(byeId === '1' || byeId === '2');
  });

  test('suggested rounds ~ log2, min 3', () => {
    assert.equal(suggestedSwissRounds(4), 3);
    assert.equal(suggestedSwissRounds(16), 4);
    assert.equal(suggestedSwissRounds(2), 3);
  });
});
