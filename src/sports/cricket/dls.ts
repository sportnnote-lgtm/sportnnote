/**
 * Duckworth–Lewis–Stern rain adjustment.
 *
 * When rain cuts a limited-overs match short, the chasing side's target is
 * revised by the share of run-scoring **resources** (overs × wickets) each side
 * had.
 *
 * Two resource models live here (parity #18, REVIEW Decision 8):
 *  - `resourcePct` — the ICC Standard Edition values: the published 0-wicket
 *    column for every whole over 0–50 (`Z0`) plus wicket rows at 8 anchors
 *    (`ROWS`). Used by any match that has seen a `v: 2` overs/target event.
 *  - `resourcePctV1` — the original exponential fit, kept unchanged so legacy
 *    logs (RAIN without `v`) replay to exactly the targets they showed.
 * Everything is in 6-ball overs: `u = (oversLimit × bpo − balls) / 6`.
 */

// ─── Standard Edition table (v2) ──────────────────────────────────────────────

/** 0 wickets lost, u = 0..50 whole overs remaining. */
const Z0 = [
  0, 3.6, 7.2, 10.6, 13.9, 17.2, 20.3, 23.4, 26.4, 29.3,
  32.1, 34.9, 37.6, 40.2, 42.7, 45.2, 47.6, 49.9, 52.2, 54.4,
  56.6, 58.7, 60.7, 62.7, 64.6, 66.5, 68.3, 70.1, 71.8, 73.5,
  75.1, 76.7, 78.3, 79.8, 81.3, 82.7, 84.1, 85.4, 86.7, 88.0,
  89.3, 90.5, 91.7, 92.8, 93.9, 95.0, 96.1, 97.1, 98.1, 99.1, 100,
];
/** Anchor rows (overs remaining → % for 0..9 wickets lost), ascending u. */
const ANCHORS: [number, number[]][] = [
  [0, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
  [5, [17.2, 17.0, 16.8, 16.5, 16.1, 15.4, 14.3, 12.5, 9.4, 4.6]],
  [10, [32.1, 31.6, 30.8, 29.8, 28.3, 26.1, 22.8, 17.9, 10.9, 4.7]],
  [15, [45.2, 44.1, 42.6, 40.5, 37.6, 33.5, 27.8, 20.2, 11.5, 4.7]],
  [20, [56.6, 54.8, 52.4, 49.1, 44.6, 38.6, 30.8, 21.2, 11.7, 4.7]],
  [25, [66.5, 63.9, 60.5, 56.0, 50.0, 42.2, 32.6, 21.6, 11.8, 4.7]],
  [30, [75.1, 71.8, 67.3, 61.6, 54.1, 44.7, 33.6, 21.8, 11.9, 4.7]],
  [40, [89.3, 84.2, 77.8, 69.6, 59.5, 47.6, 34.6, 22.0, 11.9, 4.7]],
  [50, [100, 93.4, 85.1, 74.9, 62.7, 49.0, 34.9, 22.0, 11.9, 4.7]],
];

/** The 0-wicket resource for (fractional) overs remaining — linear between whole overs. */
const z0At = (u: number): number => {
  const lo = Math.floor(u);
  if (lo >= 50) return Z0[50];
  return Z0[lo] + (u - lo) * (Z0[lo + 1] - Z0[lo]);
};

/** ROWS[u][w] / ROWS[u][0] at overs remaining `u`: linear between anchors, 1 at u = 0. */
const ratioAt = (u: number, w: number): number => {
  let i = 1;
  while (i < ANCHORS.length - 1 && ANCHORS[i][0] < u) i++;
  const [uLo, rowLo] = ANCHORS[i - 1];
  const [uHi, rowHi] = ANCHORS[i];
  const rLo = uLo === 0 ? 1 : rowLo[w] / rowLo[0];
  const rHi = rowHi[w] / rowHi[0];
  return rLo + ((u - uLo) / (uHi - uLo)) * (rHi - rLo);
};

/**
 * % of run-scoring resources remaining with `oversLeft` (6-ball) overs and
 * `wicketsLost` down — ICC Standard Edition (parity #18 spec method):
 *  1. clamp u to [0, 50];
 *  2. interpolate `Z0` linearly in u;
 *  3. multiply by ROWS[u][w] / ROWS[u][0], that ratio interpolated linearly
 *     between anchors (1 at u = 0).
 * Exact at every Z0 point (0 wickets) and at every anchor row. A full 51×10
 * table can be dropped in later without any change to callers.
 *
 * Known property of this method (tests/cricket-dls.test.mts): monotonic in
 * wickets everywhere and in overs for 0–5 down; with 6–9 down a FLAT row
 * (e.g. 9 down = 4.7 from 10 to 50 overs) bulges slightly between anchors
 * (≤ 0.26 points), so the engine clamps a rain loss at ≥ 0.
 */
export function resourcePct(oversLeft: number, wicketsLost: number): number {
  const u = Math.min(50, Math.max(0, oversLeft));
  const w = Math.min(9, Math.max(0, Math.floor(wicketsLost)));
  const z = z0At(u);
  return w === 0 ? z : z * ratioAt(u, w);
}

// ─── Legacy exponential fit (v1 — replay only) ────────────────────────────────

// Per-wickets-lost curve parameters: resource(u,w) = MAX[w] · (1 − e^(−DECAY[w]·u)).
// MAX/DECAY[0] solve resource(50,0)=100, resource(25,0)≈66, resource(10,0)≈32.
//
// INVARIANT — losing a wicket must never increase resources at ANY over count.
// Two curves only stay apart if BOTH the asymptote (MAX) and the initial slope
// (MAX·DECAY) are non-increasing in w; otherwise a steeper curve overtakes the
// one above it early on. DECAY is therefore derived from MAX to hold that:
//   DECAY[w] = (MAX[0]·DECAY[0] · s[w]) / MAX[w],  s[w] = 1 − 0.02w
// which still steepens decay as wickets fall, without ever crossing.
// (Regression-tested in tests/cricket-dls.test.mts — a crossing at 30 overs
// between 0 and 1 wicket is exactly what the earlier constants got wrong.)
const MAX = [136.2, 126, 115, 103, 90, 76, 61, 45, 29, 14];
const DECAY = [0.0265, 0.02807, 0.03013, 0.03294, 0.0369, 0.04274, 0.05207, 0.06898, 0.10455, 0.2114];
const G50 = 245; // average 50-over total — used when the chasing side has MORE resources

/** LEGACY (v1) — % of resources remaining with `oversLeft` overs and
 *  `wicketsLost` down. Kept byte-for-byte so stored DLS results replay. */
export function resourcePctV1(oversLeft: number, wicketsLost: number): number {
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
