import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeLog, eventKey, statReversals, isRejection } from '../src/data/eventLog.ts';

const e = (seq: number, clientId?: string, type = 'goal') => ({ seq, type, clientId });

test('mergeLog: server by seq, then unsynced taps in order, renumbered after the server', () => {
  const out = mergeLog([e(2, 'b'), e(1, 'a')], [e(5, 'c'), e(6, 'd')]);
  assert.deepEqual(out.map((x) => [x.seq, x.clientId]), [[1, 'a'], [2, 'b'], [3, 'c'], [4, 'd']]);
});

test('mergeLog: a pending tap already on the server (same clientId) appears once', () => {
  const out = mergeLog([e(1, 'a'), e(2, 'b')], [e(2, 'b'), e(3, 'c')]);
  assert.deepEqual(out.map((x) => x.clientId), ['a', 'b', 'c']);
});

test('mergeLog: two devices that both used seq 2 locally no longer overwrite each other', () => {
  const out = mergeLog([e(1, 'a'), e(2, 'other-device')], [e(2, 'mine')]);
  assert.deepEqual(out.map((x) => x.clientId), ['a', 'other-device', 'mine']);
  assert.equal(out[2].seq, 3);
});

test('mergeLog: legacy events without clientId de-dupe by seq', () => {
  const out = mergeLog([e(1), e(2)], [e(2), e(3)]);
  assert.deepEqual(out.map((x) => x.seq), [1, 2, 3]);
});

test('eventKey', () => {
  assert.equal(eventKey({ seq: 4, clientId: 'x' }), 'x');
  assert.equal(eventKey({ seq: 4 }), 'seq:4');
});

test('statReversals undoes attribution, extras and _attr2', () => {
  const r = statReversals({
    attribution: { playerId: 'p1', stat: 'goals', by: 1, extra: { shots: 1 } },
    payload: { _attr2: { playerId: 'p2', stat: 'assists' } },
  });
  assert.deepEqual(r, [
    { playerId: 'p1', stat: 'goals', by: -1 },
    { playerId: 'p1', stat: 'shots', by: -1 },
    { playerId: 'p2', stat: 'assists', by: -1 },
  ]);
  assert.deepEqual(statReversals({ attribution: null, payload: {} }), []);
});

test('isRejection: only the lock refusal is permanent', () => {
  assert.equal(isRejection('not_active_scorer'), true);
  assert.equal(isRejection('Failed to fetch'), false);
  assert.equal(isRejection(undefined), false);
});

import { followDisputes } from '../src/data/eventLog.ts';
test('followDisputes: resolved replacements (chained), others ignored', () => {
  const ds = [
    { playerId: 'a', status: 'resolved', replacementId: 'b' },
    { playerId: 'b', status: 'resolved', replacementId: 'c' },
    { playerId: 'x', status: 'open', replacementId: 'y' },
  ];
  assert.equal(followDisputes(ds, 'a'), 'c');
  assert.equal(followDisputes(ds, 'x'), 'x'); // not resolved
  assert.equal(followDisputes(ds, 'z'), 'z');
});
