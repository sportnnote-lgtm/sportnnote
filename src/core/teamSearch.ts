/** Quick search for the team picker (Tournament → Teams). Pure + unit-tested. */

export interface SearchableTeam { id: string; name: string; shortName?: string }

/** Teams whose name or short name contains `q` (case-insensitive; blank `q`
 *  keeps all). Selected teams come first, then alphabetical by name. */
export function filterTeams<T extends SearchableTeam>(teams: readonly T[], q: string, selectedIds: Iterable<string> = []): T[] {
  const needle = q.trim().toLowerCase();
  const selected = new Set(selectedIds);
  const hits = needle
    ? teams.filter((t) => t.name.toLowerCase().includes(needle) || (t.shortName ?? '').toLowerCase().includes(needle))
    : [...teams];
  return hits.sort((a, b) => {
    const sa = selected.has(a.id) ? 0 : 1;
    const sb = selected.has(b.id) ? 0 : 1;
    if (sa !== sb) return sa - sb;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id);
  });
}
