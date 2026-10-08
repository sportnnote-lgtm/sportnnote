import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canManageTeamLocal, nextLeaders } from '../src/core/teamPermissions.ts';

test('canManageTeamLocal: who may manage', () => {
  assert.equal(canManageTeamLocal({ role: 'organizer' }), true);
  assert.equal(canManageTeamLocal({ role: 'support' }), true);
  assert.equal(canManageTeamLocal({ role: 'player', myPlayerId: 'p1', leaders: { captainId: 'p1' } }), true);
  assert.equal(canManageTeamLocal({ role: 'player', myPlayerId: 'p1', leaders: { viceCaptainId: 'p1' } }), true);
  assert.equal(canManageTeamLocal({ role: 'player', myPlayerId: 'p1', isCaptainStore: true }), true);
  assert.equal(canManageTeamLocal({ role: 'player', myPlayerId: 'p1', isClubAdmin: true }), true);
});

test('canManageTeamLocal: plain player and no player are refused', () => {
  assert.equal(canManageTeamLocal({ role: 'player', myPlayerId: 'p9', leaders: { captainId: 'p1', viceCaptainId: 'p2' } }), false);
  assert.equal(canManageTeamLocal({ role: 'player', myPlayerId: null, leaders: { captainId: undefined } }), false);
  assert.equal(canManageTeamLocal({}), false);
});

test('canManageTeamLocal: a team admin may manage; adminIds of others or pre-migration may not', () => {
  assert.equal(canManageTeamLocal({ role: 'player', myPlayerId: 'p3', leaders: { captainId: 'p1', adminIds: ['p2', 'p3'] } }), true);
  assert.equal(canManageTeamLocal({ role: 'player', myPlayerId: 'p9', leaders: { captainId: 'p1', adminIds: ['p2', 'p3'] } }), false);
  assert.equal(canManageTeamLocal({ role: 'player', myPlayerId: 'p3', leaders: { captainId: 'p1', adminIds: undefined } }), false);
});

test('nextLeaders keeps adminIds', () => {
  assert.deepEqual(nextLeaders({ adminIds: ['x'] }, 'captainId', 'a'), { adminIds: ['x'], captainId: 'a' });
});

test('nextLeaders: toggle on and off', () => {
  assert.deepEqual(nextLeaders({}, 'captainId', 'a'), { captainId: 'a' });
  assert.deepEqual(nextLeaders({ captainId: 'a' }, 'captainId', 'a'), { captainId: undefined });
});

test('nextLeaders: captain and VC are never the same person', () => {
  assert.deepEqual(nextLeaders({ viceCaptainId: 'a' }, 'captainId', 'a'), { captainId: 'a', viceCaptainId: undefined });
  assert.deepEqual(nextLeaders({ captainId: 'a' }, 'viceCaptainId', 'a'), { captainId: undefined, viceCaptainId: 'a' });
});

test('nextLeaders: replacing a captain keeps the VC', () => {
  assert.deepEqual(nextLeaders({ captainId: 'a', viceCaptainId: 'b' }, 'captainId', 'c'), { captainId: 'c', viceCaptainId: 'b' });
});
