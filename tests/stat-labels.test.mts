/**
 * Stat-label pluralization. Single-match / single-count surfaces (the
 * notifications feed, the generic Match Summary, profile headlines) must read
 * "1 goal", not "1 goals" — while mass nouns and abbreviations ("on target",
 * "pts", "wkts") stay invariant. Both label helpers share the same contract.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { statLabelShort, sportSummary } from '../src/data/stats.ts';
import { statLabel } from '../src/data/ratings.ts';

describe('statLabelShort (stats.ts — notifications / profiles / discover)', () => {
  test('singular for exactly one', () => {
    assert.equal(statLabelShort('goals', 1), 'goal');
    assert.equal(statLabelShort('assists', 1), 'assist');
    assert.equal(statLabelShort('shots', 1), 'shot');
    assert.equal(statLabelShort('saves', 1), 'save');
    assert.equal(statLabelShort('shotsOnTarget', 1), 'shot on target');
    assert.equal(statLabelShort('runs', 1), 'run');
  });

  test('plural for zero or many', () => {
    assert.equal(statLabelShort('goals', 2), 'goals');
    assert.equal(statLabelShort('goals', 0), 'goals');
    assert.equal(statLabelShort('shotsOnTarget', 3), 'shots on target');
  });

  test('mass nouns / abbreviations are invariant', () => {
    for (const k of ['points', 'rebounds', 'wickets', 'raidPoints', 'tacklePoints', 'openPlayGoals']) {
      assert.equal(statLabelShort(k, 1), statLabelShort(k, 2), `${k} should not inflect`);
    }
  });

  test('unknown keys fall back to the raw key', () => {
    assert.equal(statLabelShort('somethingNew', 1), 'somethingNew');
  });

  test('no count behaves as plural (back-compat)', () => {
    assert.equal(statLabelShort('goals'), 'goals');
  });
});

describe('sportSummary renders count-aware labels', () => {
  test('a single goal reads "1 goal"', () => {
    const line = sportSummary({ sport: 'football', matches: 1, wins: 1, totals: { goals: 1, assists: 2 } });
    assert.equal(line, '1 goal · 2 assists');
  });
});

describe('statLabel (ratings.ts — generic Match Summary)', () => {
  test('singular for one, plural otherwise, invariants hold', () => {
    assert.equal(statLabel('goals', 1), 'goal');
    assert.equal(statLabel('goals', 2), 'goals');
    assert.equal(statLabel('fouls', 1), 'foul');
    assert.equal(statLabel('shotsOnTarget', 1), 'on target');
    assert.equal(statLabel('shotsOnTarget', 2), 'on target');
    assert.equal(statLabel('points', 1), 'pts');
  });
});
