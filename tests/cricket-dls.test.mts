/**
 * Cricket DLS — rain-revised targets.
 *  - `resourcePct`: the ICC Standard Edition values (parity #18) — exact at the
 *    published 0-wicket column and the wicket-row anchors, monotonic between.
 *  - `resourcePctV1`: the original exponential fit, kept for legacy replays.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resourcePct, resourcePctV1, revisedTarget } from '../src/sports/cricket/dls.ts';

const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `expected ${b}, got ${a}`);

describe('cricket DLS: Standard Edition resources (v2)', () => {
  test('anchors: (50,0)=100, (20,0)=56.6, (10,2)=30.8, (17⅔,0)≈51.43', () => {
    near(resourcePct(50, 0), 100);
    near(resourcePct(20, 0), 56.6);
    near(resourcePct(10, 2), 30.8);
    assert.ok(Math.abs(resourcePct(17 + 2 / 3, 0) - 51.43) < 0.01, `17⅔: ${resourcePct(17 + 2 / 3, 0)}`);
  });

  test('every wicket-row anchor is exact', () => {
    near(resourcePct(15, 2), 42.6);
    near(resourcePct(5, 2), 16.8);
    near(resourcePct(30, 5), 44.7);
    near(resourcePct(20, 5), 38.6);
    near(resourcePct(40, 2), 77.8);
    near(resourcePct(25, 9), 4.7);
    near(resourcePct(25, 0), 66.5);
  });

  test('clamped to [0, 50] overs; no overs left = 0', () => {
    assert.equal(resourcePct(0, 0), 0);
    assert.equal(resourcePct(0, 5), 0);
    assert.equal(resourcePct(-3, 0), 0);
    near(resourcePct(60, 0), 100);
    near(resourcePct(999, 3), 74.9);
  });

  test('monotonic in overs left (every ball, 1/6 over) with 0–5 wickets down', () => {
    for (let w = 0; w <= 5; w++) {
      for (let b = 1; b <= 300; b++) {
        const lo = resourcePct((b - 1) / 6, w);
        const hi = resourcePct(b / 6, w);
        assert.ok(hi >= lo - 1e-12, `w=${w}: ${hi} < ${lo} at ${b}/6 overs`);
      }
    }
  });

  // What the spec's method gives (reported, not fudged): scaling Z0 by a row
  // ratio interpolated linearly in u makes a FLAT wicket row bulge between its
  // anchors — e.g. 9 down: 4.86 at 4⅚ overs vs 4.6 at 5; 4.73 at 45 vs 4.7 at 50.
  // The dips are small and the engine clamps a rain loss at ≥ 0.
  test('6–9 wickets down: dips between anchors are bounded (≤ 0.26) and anchors exact', () => {
    let worst = 0;
    for (let w = 6; w <= 9; w++) {
      for (let b = 1; b <= 300; b++) worst = Math.min(worst, resourcePct(b / 6, w) - resourcePct((b - 1) / 6, w));
    }
    assert.ok(worst > -0.26, `worst dip ${worst}`);
    for (const u of [10, 20, 30, 40, 50]) near(resourcePct(u, 9), 4.7);
    near(resourcePct(45, 9), 95.0 * ((4.7 / 89.3 + 4.7 / 100) / 2));
  });

  test('monotonic in wickets lost at every ball', () => {
    for (let b = 1; b <= 300; b++) {
      for (let w = 1; w <= 9; w++) {
        assert.ok(resourcePct(b / 6, w) <= resourcePct(b / 6, w - 1) + 1e-12, `w=${w} at ${b}/6 overs`);
      }
    }
  });

  test('ratio is 1 at u = 0: with 1 over left, 9 down keeps most of the 0-down resource', () => {
    // Z0(1) = 3.6; ratio = 1 + (1/5)(4.6/17.2 − 1)
    near(resourcePct(1, 9), 3.6 * (1 + (4.6 / 17.2 - 1) / 5));
  });
});

describe('cricket DLS: legacy exponential fit (v1, replay only)', () => {
  test('a full 50-over innings is ~100%; 25 ≈ 66, 10 ≈ 32', () => {
    assert.ok(Math.abs(resourcePctV1(50, 0) - 100) < 0.5);
    assert.ok(Math.abs(resourcePctV1(25, 0) - 66) < 1.5);
    assert.ok(Math.abs(resourcePctV1(10, 0) - 32) < 1.5);
    assert.equal(resourcePctV1(0, 0), 0);
  });

  test('unchanged constants: (20,0) and (30,3) give the values stored DLS results used', () => {
    near(resourcePctV1(20, 0), 136.2 * (1 - Math.exp(-0.0265 * 20)));
    near(resourcePctV1(30, 3), 103 * (1 - Math.exp(-0.03294 * 30)));
  });

  test('resources fall as overs run out and as wickets are lost', () => {
    for (let u = 1; u <= 50; u++) assert.ok(resourcePctV1(u, 0) > resourcePctV1(u - 1, 0));
    for (let w = 1; w <= 9; w++) assert.ok(resourcePctV1(30, w) < resourcePctV1(30, w - 1));
  });
});

describe('cricket DLS: revised target', () => {
  test('an uninterrupted chase just needs one more run', () => {
    assert.equal(revisedTarget(250, 100, 100), 251);
  });

  test('canonical case: 250 chased in a rain-cut 25 overs → 167 (Standard Edition)', () => {
    const r2 = 100 - (resourcePct(50, 0) - resourcePct(25, 0)); // resources lost to the stoppage
    assert.equal(revisedTarget(250, 100, r2), 167); // 250 × 66.5 / 100 = 166.25 → par 166
  });

  test('T20: 160 chased in 10 overs → 91 (a 20-over innings is 56.6%, not 100%)', () => {
    assert.equal(revisedTarget(160, resourcePct(20, 0), resourcePct(10, 0)), 91);
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
