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

/** A round-robin pairing tagged with the group it belongs to. */
export interface GroupPairing extends GeneratedPairing { group: string }

/** Split teams into `numGroups` groups by serpentine-free round-robin dealing
 *  (team i → group i % g), so counts stay as even as possible (25/5 → 5·5,
 *  22/4 → 6,6,5,5). Group labels are A, B, C… Returns the teamId list per group. */
export function drawGroups(teamIds: string[], numGroups: number): { name: string; teamIds: string[] }[] {
  const ids = [...new Set(teamIds)];
  const g = Math.max(1, Math.min(Math.floor(numGroups) || 1, ids.length || 1));
  const groups = Array.from({ length: g }, (_, i) => ({ name: String.fromCharCode(65 + i), teamIds: [] as string[] }));
  ids.forEach((id, i) => groups[i % g].teamIds.push(id));
  return groups;
}

/** Group stage = a round-robin *within* each group (not across), every pairing
 *  tagged with its group. Feeds a grouped tournament's league phase. */
export function groupStage(teamIds: string[], numGroups: number, doubleRound = false): GroupPairing[] {
  const out: GroupPairing[] = [];
  for (const grp of drawGroups(teamIds, numGroups)) {
    for (const p of roundRobin(grp.teamIds, doubleRound)) out.push({ ...p, group: grp.name });
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
(globalThis as unknown as Record<string, unknown>).__sportfolioFixtures = { roundRobin, knockoutFirstRound, drawGroups, groupStage };
