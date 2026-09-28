/** Swiss-system pairing (pure, dependency-free). Everyone plays a fixed number of
 *  rounds; nobody is eliminated. Round 1 is seeded top-half vs bottom-half; each
 *  later round pairs entrants on similar scores while avoiding rematches. Final
 *  ranking is just the standings table (points, then tie-breakers) — no bracket.
 *
 *  Odd field → one entrant gets a bye that round (skips the lowest-ranked who
 *  hasn't had one yet). The caller schedules `pairings` and records `byeId`. */
import type { GeneratedPairing } from './fixtures';

/** Order-independent key for a pair, to detect rematches. */
export const pairKey = (a: string, b: string) => [a, b].sort().join('|');

export interface SwissRound {
  pairings: GeneratedPairing[];
  /** the entrant sitting out this round (odd field), if any */
  byeId?: string;
}

/** Round 1: split the seed order in half, top plays bottom (1 v h+1, 2 v h+2 …). */
export function swissRound1(seedIds: string[]): SwissRound {
  const ids = [...new Set(seedIds)];
  let byeId: string | undefined;
  let field = ids;
  if (ids.length % 2 === 1) {
    // Middle seed takes the bye so the top and bottom stay balanced.
    byeId = ids[Math.floor(ids.length / 2)];
    field = ids.filter((x) => x !== byeId);
  }
  const half = field.length / 2;
  const pairings: GeneratedPairing[] = [];
  for (let i = 0; i < half; i++) pairings.push({ homeId: field[i], awayId: field[i + half], round: 1 });
  return { pairings, byeId };
}

/**
 * A later round. `orderedIds` is the current standings order (best first);
 * `played` holds pairKeys already contested; `priorByes` are entrants who've had a
 * bye. Greedy: walk the ranking, pair each unpaired entrant with the nearest-ranked
 * opponent they haven't met (falling back to a rematch only if unavoidable).
 */
export function swissNextRound(orderedIds: string[], played: Set<string>, round: number, priorByes: Set<string> = new Set()): SwissRound {
  const ids = [...orderedIds];
  let byeId: string | undefined;
  if (ids.length % 2 === 1) {
    for (let i = ids.length - 1; i >= 0; i--) if (!priorByes.has(ids[i])) { byeId = ids[i]; break; }
    if (!byeId) byeId = ids[ids.length - 1];
  }
  const pool = byeId ? ids.filter((x) => x !== byeId) : ids;
  const used = new Set<string>();
  const pairings: GeneratedPairing[] = [];
  for (let i = 0; i < pool.length; i++) {
    const a = pool[i];
    if (used.has(a)) continue;
    let opp: string | undefined;
    for (let j = i + 1; j < pool.length; j++) {
      const b = pool[j];
      if (!used.has(b) && !played.has(pairKey(a, b))) { opp = b; break; }
    }
    if (!opp) for (let j = i + 1; j < pool.length; j++) if (!used.has(pool[j])) { opp = pool[j]; break; } // last resort: rematch
    if (!opp) continue;
    used.add(a); used.add(opp);
    pairings.push({ homeId: a, awayId: opp, round });
  }
  return { pairings, byeId };
}

/** Recommended number of rounds for a field size (enough to separate a clear
 *  winner): ceil(log2(n)), min 3. */
export function suggestedSwissRounds(n: number): number {
  return Math.max(3, Math.ceil(Math.log2(Math.max(2, n))));
}
