/**
 * Cricket DLS — rain-revised targets. The model is an approximation of the ICC
 * Standard Edition tables, so these assert the anchors it's calibrated to and the
 * properties that must always hold (monotonicity, fair revision).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resourcePct, revisedTarget } from '../src/sports/cricket/dls.ts';

describe('cricket DLS: resource curve', () => {
  test('a full 50-over innings is 100% of resources', () => {
    assert.ok(Math.abs(resourcePct(50, 0) - 100) < 0.5, `expected ~100, got ${resourcePct(50, 0)}`);
  });

  test('calibrated anchors: 25 overs ≈ 66%, 10 overs ≈ 32%', () => {
    assert.ok(Math.abs(resourcePct(25, 0) - 66) < 1.5, `25ov: ${resourcePct(25, 0)}`);
    assert.ok(Math.abs(resourcePct(10, 0) - 32) < 1.5, `10ov: ${resourcePct(10, 0)}`);
  });

  test('no overs left = no resources left', () => {
    assert.equal(resourcePct(0, 0), 0);
  });

  test('resources fall as overs run out', () => {
    for (let u = 1; u <= 50; u++) {
      assert.ok(resourcePct(u, 0) > resourcePct(u - 1, 0), `not decreasing at ${u} overs`);
    }
  });

  test('resources fall as wickets are lost', () => {
    for (let w = 1; w <= 9; w++) {
      assert.ok(resourcePct(30, w) < resourcePct(30, w - 1), `not decreasing at ${w} wickets`);
    }
  });
});

describe('cricket DLS: revised target', () => {
  test('an uninterrupted chase just needs one more run', () => {
    assert.equal(revisedTarget(250, 100, 100), 251);
  });

  test('canonical case: 250 chased in a rain-cut 25 overs → ~165', () => {
    const r2 = 100 - (resourcePct(50, 0) - resourcePct(25, 0)); // resources lost to the stoppage
    const target = revisedTarget(250, 100, r2);
    assert.ok(Math.abs(target - 165) <= 3, `expected ~165 (official ≈166), got ${target}`);
  });

  test('fewer resources ⇒ a smaller target', () => {
    assert.ok(revisedTarget(300, 100, 50) < revisedTarget(300, 100, 80));
  });

  test('the chasing side with MORE resources gets a raised target (G50)', () => {
    // team 1's innings was cut, team 2 has the full allocation
    assert.ok(revisedTarget(200, 80, 100) > 201);
  });

  test('a target is always at least 1 run', () => {
    assert.ok(revisedTarget(0, 100, 20) >= 1);
  });
});
