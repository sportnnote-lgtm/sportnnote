/** Pure helper for the cricket batting-order editor. The organizer builds ONE
 *  ordered list (the order players bat); the first `cap` are the XI (ordered
 *  `starters`), the rest are `subs`. Kept pure + hooked so the split is
 *  deterministically testable without the (touch-flaky) UI. */

export function splitBattingOrder(picked: string[], cap: number): { starters: string[]; subs: string[] } {
  const seen = new Set<string>();
  const clean = picked.filter((id) => (seen.has(id) ? false : (seen.add(id), true))); // de-dupe, keep first position
  return { starters: clean.slice(0, cap), subs: clean.slice(cap) };
}

// Test/inspection hook (parity with the other __sportfolio* engines).
(globalThis as unknown as Record<string, unknown>).__sportfolioCricketLineup = { splitBattingOrder };
