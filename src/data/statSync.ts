/**
 * Absolute stat-line sync (parity #19) — the PURE planner. Given a match's
 * existing stat lines and a sport's `statTotals(state)`, decide exactly which
 * rows to write. `repos.syncMatchStatLines` runs it and applies the writes.
 *
 *  • Player ids in the state are the ORIGINALLY recorded players; a resolved
 *    participation dispute moved that player's line to the replacement. Every
 *    id goes through `mapId` (the shared dispute mapping) first, so the sync
 *    updates the replacement's line and never recreates the disputed one.
 *  • Values are absolute: `stats = {...existing, ...totals}` — never `+=`, so
 *    running the sync twice gives the same numbers.
 *  • Only rows whose stats actually change are written (the follower-push
 *    webhook fires on every INSERT/UPDATE), so a second run writes nothing.
 *  • A line of this match whose player is no longer in the totals (a correction
 *    moved their catch to someone else) has the totals-owned keys zeroed.
 * No React Native imports — node tests load this file.
 */

export interface ExistingStatLine {
  id: string;
  playerId: string;
  stats: Record<string, number>;
}

export type MatchTotals = Record<string, { side: 'home' | 'away'; stats: Record<string, number> }>;

export type StatWrite =
  | { kind: 'update'; id: string; playerId: string; stats: Record<string, number> }
  | { kind: 'insert'; playerId: string; stats: Record<string, number>; opponent?: string };

/** Same keys, same values (a missing key differs from 0 — it gets written once). */
export function sameStats(a: Record<string, number>, b: Record<string, number>): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && a[k] === b[k]);
}

export function planStatSync(
  existing: ExistingStatLine[],
  totals: MatchTotals,
  mapId: (playerId: string) => string,
  names: { home?: string; away?: string } = {},
): StatWrite[] {
  // State ids → whoever holds the line now. Two ids landing on one player
  // (can't normally happen) add up rather than overwrite each other.
  const mapped = new Map<string, { side: 'home' | 'away'; stats: Record<string, number> }>();
  for (const [id, t] of Object.entries(totals)) {
    const to = mapId(id);
    const cur = mapped.get(to);
    if (!cur) { mapped.set(to, { side: t.side, stats: { ...t.stats } }); continue; }
    for (const [k, v] of Object.entries(t.stats)) cur.stats[k] = (cur.stats[k] ?? 0) + v;
  }
  const owned = new Set<string>();
  for (const t of Object.values(totals)) for (const k of Object.keys(t.stats)) owned.add(k);

  const byPlayer = new Map(existing.map((l) => [l.playerId, l]));
  const writes: StatWrite[] = [];
  for (const [playerId, t] of mapped) {
    const line = byPlayer.get(playerId);
    if (!line) {
      writes.push({ kind: 'insert', playerId, stats: t.stats, opponent: t.side === 'home' ? names.away : names.home });
      continue;
    }
    const stats = { ...line.stats, ...t.stats };
    if (!sameStats(stats, line.stats)) writes.push({ kind: 'update', id: line.id, playerId, stats });
  }
  for (const line of existing) {
    if (mapped.has(line.playerId)) continue;
    const stale = Object.keys(line.stats).filter((k) => owned.has(k) && line.stats[k] !== 0);
    if (!stale.length) continue;
    const stats = { ...line.stats };
    for (const k of stale) stats[k] = 0;
    writes.push({ kind: 'update', id: line.id, playerId: line.playerId, stats });
  }
  return writes;
}

/** Apply planned writes to an in-memory line list (the demo store; tests). */
export function applyStatWrites<L extends ExistingStatLine>(lines: L[], writes: StatWrite[], create: (w: Extract<StatWrite, { kind: 'insert' }>) => L): void {
  for (const w of writes) {
    if (w.kind === 'insert') lines.push(create(w));
    else {
      const l = lines.find((x) => x.id === w.id);
      if (l) l.stats = { ...w.stats };
    }
  }
}

/** SD-09 — for a sport whose `statTotals` is partial: the correction deltas
 *  the absolute sync does NOT cover (stats outside the keys the totals return).
 *  Those still have to be written as deltas. */
export function deltasBesideTotals<D extends { stat: string }>(deltas: D[], totals: MatchTotals): D[] {
  const owned = new Set<string>();
  for (const t of Object.values(totals)) for (const k of Object.keys(t.stats)) owned.add(k);
  return deltas.filter((d) => !owned.has(d.stat));
}
