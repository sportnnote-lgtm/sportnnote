/**
 * Duckworth–Lewis–Stern rain adjustment.
 *
 * When rain cuts a limited-overs match short, the chasing side's target is
 * revised by the share of run-scoring **resources** (overs × wickets) each side
 * had. This is an **approximation** of the official ICC Standard Edition tables —
 * an exponential resource curve calibrated to the canonical 0-wicket points
 * (50 ov = 100%, 25 ov ≈ 66%, 10 ov ≈ 32%), with each wicket lowering the
 * asymptote and steepening the curve. Good enough to auto-revise a target during
 * a rain break; the exact ICC tables can be dropped in here later without any
 * change to callers.
 */

// Per-wickets-lost curve parameters: resource(u,w) = MAX[w] · (1 − e^(−DECAY[w]·u)).
// MAX/DECAY[0] solve resource(50,0)=100, resource(25,0)≈66, resource(10,0)≈32.
const MAX = [136.2, 129, 120, 109, 96, 82, 66, 49, 32, 15];
const DECAY = [0.0265, 0.029, 0.032, 0.036, 0.041, 0.048, 0.058, 0.075, 0.105, 0.20];
const G50 = 245; // average 50-over total — used when the chasing side has MORE resources

/** % of run-scoring resources remaining with `oversLeft` overs and `wicketsLost` down. */
export function resourcePct(oversLeft: number, wicketsLost: number): number {
  const u = Math.max(0, oversLeft);
  const w = Math.min(9, Math.max(0, Math.floor(wicketsLost)));
  return MAX[w] * (1 - Math.exp(-DECAY[w] * u));
}

/**
 * DLS revised target for the side batting second.
 * @param firstInningsRuns runs the side batting first scored
 * @param r1 % resources the first side had (≈100 for a full, uninterrupted innings)
 * @param r2 % resources available to the chasing side after interruptions
 * @returns the score the chasing side needs to WIN (par + 1)
 */
export function revisedTarget(firstInningsRuns: number, r1: number, r2: number): number {
  if (r2 <= r1) return Math.floor((firstInningsRuns * r2) / r1) + 1;
  // Chasing side has MORE resources (e.g. team 1 was cut) → add runs via G50.
  return firstInningsRuns + Math.floor(((r2 - r1) / 100) * G50) + 1;
}
