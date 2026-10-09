/** Quick search for the team picker (Tournament → Teams). Pure + unit-tested.
 *  Matching shares global search's name matcher (src/data/search.ts) so a team
 *  found in one box is found in the other; only the order differs (picked teams
 *  first, then A–Z, which suits a picker). */
import { bestTier } from '../data/search.ts';

export interface SearchableTeam { id: string; name: string; shortName?: string }

/** Teams whose name or short name contains `q` (case-insensitive; blank `q`
 *  keeps all). Selected teams come first, then alphabetical by name. */
export function filterTeams<T extends SearchableTeam>(teams: readonly T[], q: string, selectedIds: Iterable<string> = []): T[] {
  const needle = q.trim();
  const selected = new Set(selectedIds);
  const hits = needle ? teams.filter((t) => bestTier([t.name, t.shortName], needle) < 4) : [...teams];
  return hits.sort((a, b) => {
    const sa = selected.has(a.id) ? 0 : 1;
    const sb = selected.has(b.id) ? 0 : 1;
    if (sa !== sb) return sa - sb;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id);
  });
}
