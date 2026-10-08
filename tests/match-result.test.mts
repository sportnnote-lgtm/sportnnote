import { test } from 'node:test';
import assert from 'node:assert/strict';
import { manualResultLine, isNoResult } from '../src/core/matchResult.ts';
import { mergeMatchConfig, stripInternal } from '../src/core/matchConfig.ts';
import { isEliminationStage } from '../src/data/bracket.ts';

const at = '2026-10-09T10:00:00Z';

test('manualResultLine for every kind', () => {
  assert.equal(manualResultLine({ kind: 'no_result', reason: 'Rain', at }, 'Red', 'Blue'), 'No result — Rain');
  assert.equal(manualResultLine({ kind: 'abandoned', reason: 'Bad light', at }, 'Red', 'Blue'), 'Match abandoned — Bad light');
  assert.equal(manualResultLine({ kind: 'draw', reason: 'Time up', at }, 'Red', 'Blue'), 'Match drawn');
  assert.equal(manualResultLine({ kind: 'tie', reason: 'Scores level', at }, 'Red', 'Blue'), 'Match tied');
  assert.equal(manualResultLine({ kind: 'conceded', winner: 'away', reason: 'Team left', at }, 'Red', 'Blue'), 'Blue won — Red conceded');
  assert.equal(manualResultLine({ kind: 'awarded', winner: 'home', reason: 'Injury', at }, 'Red', 'Blue'), 'Red awarded the match — Injury');
});

test('isNoResult', () => {
  assert.equal(isNoResult({ kind: 'abandoned', reason: 'x', at }), true);
  assert.equal(isNoResult({ kind: 'no_result', reason: 'x', at }), true);
  assert.equal(isNoResult({ kind: 'tie', reason: 'x', at }), false);
  assert.equal(isNoResult(undefined), false);
});

test('isEliminationStage', () => {
  for (const s of ['qf', 'sf', 'final', 'r16', 'third', 'q1', 'q2', 'eliminator', 'playin']) assert.equal(isEliminationStage(s), true, s);
  for (const s of ['group', 'super', 'swiss2', undefined, null, '']) assert.equal(isEliminationStage(s as string), false, String(s));
});

test('config merge: a per-match key never drops the tournament format', () => {
  const tour = { overs: 20, playersPerSide: 11, halfMinutes: 45 };
  assert.deepEqual(mergeMatchConfig(tour, { halfMinutes: 30 }), { overs: 20, playersPerSide: 11, halfMinutes: 30 });
  assert.deepEqual(mergeMatchConfig(tour, { __walkover: { winner: 'home' } }), tour);
  assert.deepEqual(mergeMatchConfig(undefined, { overs: 6, __break: 1 }), { overs: 6 });
  assert.equal(mergeMatchConfig(undefined, undefined), undefined);
  assert.deepEqual(stripInternal({ a: 1, __seriesId: 'x' }), { a: 1 });
});

import { snapshotOutcome } from '../src/core/matchResult.ts';
test('a snapshot never overwrites a manual result (AMEND or stale device)', () => {
  const awarded = { kind: 'awarded' as const, winner: 'home' as const, reason: 'Injury', at };
  assert.deepEqual(snapshotOutcome(awarded, true), { status: 'completed', rederive: false });
  assert.deepEqual(snapshotOutcome(awarded, false), { status: 'completed', rederive: false }); // never back to live
  assert.deepEqual(snapshotOutcome(undefined, true), { status: 'completed', rederive: true });
  assert.deepEqual(snapshotOutcome(null, false), { status: 'live', rederive: false });
});
