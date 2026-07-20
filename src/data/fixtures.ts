/**
 * Pure fixture generators for bulk scheduling. Given a set of team ids and a
 * structure, produce the ordered pairings an organizer would otherwise enter one
 * match at a time. No I/O — the screen assigns kickoff times and calls createMatch.
 */
export interface GeneratedPairing { homeId: string; awayId: string; round: number }

const BYE = '__bye__';

/**
 * Round-robin via the circle method: every team plays every other once
 * (`doubleRound` → twice, home & away swapped). An odd count gets a rotating bye
 * so no team is over- or under-scheduled. Home/away alternates by round for fairness.
 */
export function roundRobin(teamIds: string[], doubleRound = false): GeneratedPairing[] {
  const ids = [...new Set(teamIds)];
  if (ids.length < 2) return [];
  const arr = ids.length % 2 === 1 ? [...ids, BYE] : [...ids];
  const n = arr.length;
  const rounds = n - 1;
  const half = n / 2;
  const out: GeneratedPairing[] = [];
  let list = [...arr];
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < half; i++) {
      const a = list[i];
      const b = list[n - 1 - i];
      if (a === BYE || b === BYE) continue;
      out.push(r % 2 === 0 ? { homeId: a, awayId: b, round: r + 1 } : { homeId: b, awayId: a, round: r + 1 });
    }
    // rotate everyone but the first fixed position
    list = [list[0], list[n - 1], ...list.slice(1, n - 1)];
  }
  if (doubleRound) {
    const reverse = out.map((p) => ({ homeId: p.awayId, awayId: p.homeId, round: p.round + rounds }));
    return [...out, ...reverse];
  }
  return out;
}

/**
 * First-round knockout pairings (1v2, 3v4, …). An odd team out gets a bye and
 * simply isn't scheduled this round. Later rounds depend on results, so they
 * advance in the bracket as scores come in rather than being pre-created.
 */
export function knockoutFirstRound(teamIds: string[]): GeneratedPairing[] {
  const ids = [...new Set(teamIds)];
  const out: GeneratedPairing[] = [];
  for (let i = 0; i + 1 < ids.length; i += 2) {
    out.push({ homeId: ids[i], awayId: ids[i + 1], round: 1 });
  }
  return out;
}

// Test/inspection hook (parity with the other engines).
(globalThis as unknown as Record<string, unknown>).__sportfolioFixtures = { roundRobin, knockoutFirstRound };
