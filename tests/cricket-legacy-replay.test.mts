/**
 * SD-133 — the frozen-oracle replay test cricket never had (audit-2 cricket §5).
 * Ten logs (tests/cricketLegacyLogs.mts) were generated with the engine as it was
 * BEFORE SD-133 and their replayed state pinned by fingerprint. Today's engine
 * must replay every one of them to the byte-identical state, the same stat
 * totals / NRR inputs and the same result (REVIEW Decision 8): new rules ride on
 * `v: 2` payloads, new action types and new optional format keys only.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { init, reducer, outcome, nrrOvers, nrrRuns } from '../src/sports/cricket/engine.ts';
import { statTotals } from '../src/sports/cricket/scorecard.ts';
import { CRICKET_LEGACY_LOGS } from './cricketLegacyLogs.mts';

const fp = (s: unknown) => createHash('sha256').update(JSON.stringify(s)).digest('hex').slice(0, 24);

describe('cricket legacy logs replay byte-identically (frozen before SD-133)', () => {
  assert.equal(CRICKET_LEGACY_LOGS.length, 10);
  for (const L of CRICKET_LEGACY_LOGS) {
    test(L.name, () => {
      const s = L.actions.reduce(reducer, init(L.config));
      assert.equal(s.ended, true, 'the match finished');
      assert.equal(JSON.stringify(outcome(s)), L.result, 'same result line');
      assert.equal(fp([statTotals(s), nrrOvers(s), nrrRuns(s)]), L.totalsFp, 'same stat totals + NRR inputs');
      assert.equal(fp(s), L.fp, 'same replayed state (every key)');
    });
  }
});

describe('the frozen logs cover the risky paths', () => {
  const types = new Set(CRICKET_LEGACY_LOGS.flatMap((l) => l.actions.map((a) => a.type)));
  for (const t of ['RUNS', 'BYES', 'LEGBYES', 'WICKET', 'EXTRA', 'PENALTY', 'ADJUST', 'FIELD_NOTE', 'SET_RULES', 'RAIN', 'SET_OVERS', 'RAIN_STOP', 'END_INNINGS', 'START_SUPER_OVER', 'SET_BOWLER', 'SWAP_STRIKE']) {
    test(`has ${t}`, () => assert.ok(types.has(t)));
  }
  test('a second Super Over re-uses the first one’s bowler and a batter out in it (legacy: accepted)', () => {
    const tie = CRICKET_LEGACY_LOGS.find((l) => l.name.startsWith('tie'))!;
    const s = tie.actions.reduce(reducer, init(tie.config));
    assert.equal(s.superOver?.round, 2);
    assert.ok(s.superOver?.state.bowling.a6, 'a6 bowled Super Over 2');
    assert.ok(s.superOver?.state.batting.a3, 'a3 batted in Super Over 2');
  });
});
