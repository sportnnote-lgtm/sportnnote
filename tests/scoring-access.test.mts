import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canScoreMatch, isListedScorer, isMatchHost } from '../src/core/scoringAccess.ts';

test('a listed scorer can score', () => {
  assert.equal(canScoreMatch({ myPlayerId: 'p1', scorerIds: ['p1'] }), true);
  assert.equal(canScoreMatch({ myPlayerId: 'p1', scorerIds: [], scorerId: 'p1' }), true); // legacy single scorer
  assert.equal(isListedScorer({ myPlayerId: 'p1', scorerIds: ['p1'] }), true);
});

test('a match host can score without being listed', () => {
  assert.equal(canScoreMatch({ myPlayerId: 'h1', scorerIds: ['p1'], hostIds: ['h1'] }), true);
  assert.equal(canScoreMatch({ myPlayerId: 'h1', scorerIds: [], hostIds: ['h1'] }), true);
  assert.equal(isListedScorer({ myPlayerId: 'h1', scorerIds: ['p1'] }), false);
  assert.equal(isMatchHost({ myPlayerId: 'h1', hostIds: ['h1'] }), true);
});

test('a tournament host / org organizer can score its matches', () => {
  assert.equal(canScoreMatch({ myPlayerId: 't1', scorerIds: ['p1'], hostIds: [], tournamentHostIds: ['t1'] }), true);
});

test('viewers stay read-only', () => {
  const m = { scorerIds: ['p1'], scorerId: 'p1', hostIds: ['h1'], tournamentHostIds: ['t1'] };
  assert.equal(canScoreMatch({ myPlayerId: 'x', ...m }), false);
  assert.equal(canScoreMatch({ myPlayerId: null, ...m }), false);
  assert.equal(canScoreMatch({ myPlayerId: undefined, ...m }), false);
  assert.equal(canScoreMatch({ myPlayerId: 'x' }), false);
  assert.equal(canScoreMatch({ myPlayerId: 'x', scorerIds: null, hostIds: null, tournamentHostIds: null }), false);
});
