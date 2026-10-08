import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lockStatus, canWriteWith } from '../src/core/scoringLock.ts';

test('lockStatus covers every branch', () => {
  assert.equal(lockStatus(null, 'p1', 'd1'), 'unsupported');
  assert.equal(lockStatus({ supported: false }, 'p1', 'd1'), 'unsupported');
  assert.equal(lockStatus({ supported: true, holderId: null }, 'p1', 'd1'), 'free');
  assert.equal(lockStatus({ supported: true, holderId: 'p1', device: 'd1' }, 'p1', 'd1'), 'mine');
  assert.equal(lockStatus({ supported: true, holderId: 'p1', device: null }, 'p1', 'd1'), 'mine'); // handed over, binds on first tap
  assert.equal(lockStatus({ supported: true, holderId: 'p1', device: 'd2' }, 'p1', 'd1'), 'mine-other-device');
  assert.equal(lockStatus({ supported: true, holderId: 'p2', device: 'd2' }, 'p1', 'd1'), 'other');
  assert.equal(lockStatus({ supported: true, holderId: 'p2' }, null, 'd1'), 'other');
});

test('who may write', () => {
  assert.equal(canWriteWith('mine'), true);
  assert.equal(canWriteWith('free'), true);
  assert.equal(canWriteWith('unsupported'), true);
  assert.equal(canWriteWith('other'), false);
  assert.equal(canWriteWith('mine-other-device'), false);
});
