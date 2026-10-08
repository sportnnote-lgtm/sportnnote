/** Bulk scorer planner (parity #11): share a tournament's scorer pool across its
 *  fixtures. Pure — the screen previews the plan, `bulkSetMatchScorers` saves it. */

export interface AssignableMatch {
  id: string;
  status: string;
  startsAt?: string;
  venueName?: string;
  venueId?: string;
  scorerIds?: string[];
  /** legacy single scorer (older rows / demo) — counts as "has a scorer" */
  scorerId?: string;
}

export type AssignMode = 'rotate' | 'byVenue' | 'one';

export interface AssignOptions {
  mode: AssignMode;
  /** byVenue: venue key (see `venueKey`) → the scorer(s) for that ground.
   *  Grounds without an entry fall back to the whole pool. */
  venueMap?: Record<string, string[]>;
  /** leave matches that already have a scorer alone (default true) */
  onlyUnassigned?: boolean;
}

/** The key a match's ground is grouped by ('' = no ground set). */
export function venueKey(m: Pick<AssignableMatch, 'venueName' | 'venueId'>): string {
  return (m.venueName ?? '').trim() || m.venueId || '';
}

/** Matches the planner may touch: not finished/cancelled, and (by default) without a scorer. */
export function assignableMatches<M extends AssignableMatch>(matches: M[], onlyUnassigned = true): M[] {
  return matches.filter((m) => m.status !== 'completed' && m.status !== 'cancelled'
    && (!onlyUnassigned || !currentScorers(m).length));
}

/** Who scores a match now (scorerIds, else the legacy single scorerId). */
export function currentScorers(m: Pick<AssignableMatch, 'scorerIds' | 'scorerId'>): string[] {
  return m.scorerIds?.length ? m.scorerIds : m.scorerId ? [m.scorerId] : [];
}

const timeKey = (s?: string) => {
  if (!s) return '';
  const t = Date.parse(s);
  return Number.isNaN(t) ? s : String(t);
};

/** → `{ matchId: [scorerId] }` for every match it assigns. Rotate / byVenue
 *  balance the load (fewest matches first, pool order breaks ties) and never
 *  give one scorer two matches at the same start time while another is free. */
export function planScorerAssignments(
  matches: AssignableMatch[],
  scorerIds: string[],
  opts: AssignOptions,
): Record<string, string[]> {
  const pool = [...new Set(scorerIds.filter(Boolean))];
  const out: Record<string, string[]> = {};
  if (!pool.length) return out;
  const todo = assignableMatches(matches, opts.onlyUnassigned ?? true)
    .slice()
    .sort((a, b) => (Date.parse(a.startsAt ?? '') || 0) - (Date.parse(b.startsAt ?? '') || 0) || a.id.localeCompare(b.id));
  if (opts.mode === 'one') {
    for (const m of todo) out[m.id] = [pool[0]];
    return out;
  }
  const todoIds = new Set(todo.map((m) => m.id));
  // who is already busy at each start time (kept matches count too)
  const busy = new Map<string, Set<string>>();
  const mark = (t: string, s: string) => { if (!t) return; if (!busy.has(t)) busy.set(t, new Set()); busy.get(t)!.add(s); };
  for (const m of matches) {
    if (todoIds.has(m.id) || m.status === 'cancelled') continue;
    for (const s of currentScorers(m)) mark(timeKey(m.startsAt), s);
  }
  const count = new Map<string, number>(pool.map((s) => [s, 0]));
  for (const m of todo) {
    let cands = pool;
    if (opts.mode === 'byVenue') {
      const v = opts.venueMap?.[venueKey(m)]?.filter(Boolean);
      if (v?.length) cands = v;
    }
    const t = timeKey(m.startsAt);
    const taken = busy.get(t);
    const free = taken ? cands.filter((s) => !taken.has(s)) : cands;
    const from = free.length ? free : cands;
    let best = from[0];
    for (const s of from) if ((count.get(s) ?? 0) < (count.get(best) ?? 0)) best = s;
    out[m.id] = [best];
    count.set(best, (count.get(best) ?? 0) + 1);
    mark(t, best);
  }
  return out;
}
