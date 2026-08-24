/**
 * Grouped-tournament advancement — the pure logic that turns finished group
 * tables into a seeded knockout. Handles the two shapes an organizer wants:
 *   • "top N of each group advance" (e.g. top 2 → quarter-finals), and
 *   • "top N + the best (N+1)-placed teams across all groups" to fill an
 *     awkward bracket (e.g. 5 groups → top 3 = 15, + the best 4th-placed = 16
 *     for a Round of 16 — the classic 24/25-team format), ranked by the same
 *     tie-breakers the league table uses (points → goal difference → goals for).
 * No I/O — the screen feeds it match results and gets back the bracket to create.
 */
import type { Match, SportId, TournamentEntry } from '../core/types.ts';
import { teamStandings, defaultStandingsConfig, type TeamStanding, type StandingsConfig } from './standings.ts';
import type { GeneratedPairing } from './fixtures.ts';

/** One group's ranked table. */
export interface GroupTable { name: string; rows: TeamStanding[] }

/** A team that has advanced, with how it got there. */
export interface Qualifier {
  teamId: string;
  name: string;
  group: string;
  /** finishing position in its group (1 = winner) */
  rank: number;
  /** 'direct' = a top-N finish; 'best' = a best-placed wildcard */
  via: 'direct' | 'best';
}

/** Cross-group seed comparison: points, then the config's numeric tie-breakers
 *  (NRR / goal difference / goals for — head-to-head is meaningless between teams
 *  from different groups), then name. */
function seedCmp(cfg: StandingsConfig) {
  const numeric = cfg.order.filter((t): t is 'nrr' | 'diff' | 'for' => t !== 'h2h');
  return (x: TeamStanding, y: TeamStanding): number => {
    if (y.points !== x.points) return y.points - x.points;
    for (const t of numeric) {
      const d = t === 'nrr' ? (y.nrr ?? 0) - (x.nrr ?? 0) : t === 'diff' ? y.diff - x.diff : y.for - x.for;
      if (d) return d;
    }
    return x.name.localeCompare(y.name);
  };
}

/** Per-group tables for a sport: partition the tournament's matches by their
 *  `group` tag and rank each with the normal league logic. Ungrouped matches
 *  (e.g. knockout ties) are ignored. */
export function groupTables(matches: Match[], sport: SportId, cfg: StandingsConfig = defaultStandingsConfig(sport)): GroupTable[] {
  const byGroup = new Map<string, Match[]>();
  for (const m of matches) {
    if (m.sport !== sport || !m.group) continue;
    const list = byGroup.get(m.group) ?? [];
    list.push(m);
    byGroup.set(m.group, list);
  }
  return [...byGroup.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, ms]) => ({ name, rows: teamStandings(ms, sport, cfg) }));
}

/**
 * Who advances. `topPerGroup` teams from each group qualify directly; if
 * `bestPlacedSlots > 0`, that many more come from the best (topPerGroup+1)-placed
 * teams across all groups (ranked by the league tie-breakers). Returns the
 * qualifiers in **seed order** — all group winners first (best record first),
 * then all runners-up, … then the best-placed wildcards — which is what
 * `seedKnockout` pairs into a bracket.
 */
export function advancement(tables: GroupTable[], topPerGroup: number, bestPlacedSlots = 0, cfg: StandingsConfig = defaultStandingsConfig('football')): Qualifier[] {
  const cmp = seedCmp(cfg);
  const direct: { q: Qualifier; row: TeamStanding }[] = [];
  const bestPool: { row: TeamStanding; group: string }[] = [];
  for (const t of tables) {
    t.rows.forEach((row, i) => {
      if (i < topPerGroup) direct.push({ q: { teamId: row.teamId, name: row.name, group: t.name, rank: i + 1, via: 'direct' }, row });
      else if (i === topPerGroup && bestPlacedSlots > 0) bestPool.push({ row, group: t.name });
    });
  }
  // Seed the direct qualifiers: by rank first (all 1st places, then all 2nds…),
  // and within a rank by record — so winners occupy the top seeds.
  direct.sort((a, b) => a.q.rank - b.q.rank || cmp(a.row, b.row));
  const best = bestPool
    .sort((a, b) => cmp(a.row, b.row))
    .slice(0, bestPlacedSlots)
    .map(({ row, group }): Qualifier => ({ teamId: row.teamId, name: row.name, group, rank: topPerGroup + 1, via: 'best' }));
  return [...direct.map((d) => d.q), ...best];
}

/**
 * Seeded first round from a seed-ordered qualifier list: 1v last, 2v second-last,
 * … then a **de-clash pass** — a group-stage rematch shouldn't happen in round one,
 * so any tie whose two teams share a group swaps its lower seed with another tie's
 * to break the clash (this recovers the classic A1-vB2 / B1-vA2 cross-group bracket
 * from top-2-of-four-groups). An odd count byes the top seed through. The swap is
 * best-effort: a pathological group split may leave one unavoidable rematch.
 */
export function seedKnockout(qualified: Qualifier[]): GeneratedPairing[] {
  const seeds = qualified.slice(qualified.length % 2); // odd → top seed gets a bye
  const ties: [Qualifier, Qualifier][] = [];
  for (let i = 0; i < seeds.length / 2; i++) ties.push([seeds[i], seeds[seeds.length - 1 - i]]);
  for (let i = 0; i < ties.length; i++) {
    if (ties[i][0].group !== ties[i][1].group) continue;
    // find another tie we can swap away-teams with, resolving this clash without
    // creating one in the other tie.
    for (let j = 0; j < ties.length; j++) {
      if (j === i) continue;
      if (ties[i][0].group !== ties[j][1].group && ties[j][0].group !== ties[i][1].group) {
        const tmp = ties[i][1]; ties[i][1] = ties[j][1]; ties[j][1] = tmp;
        break;
      }
    }
  }
  return ties.map(([h, a]) => ({ homeId: h.teamId, awayId: a.teamId, round: 1 }));
}

/** Label the knockout round for N teams (drives Match.stage / the bracket UI). */
export function knockoutRoundLabel(teams: number): string {
  if (teams <= 2) return 'final';
  if (teams <= 4) return 'sf';
  if (teams <= 8) return 'qf';
  if (teams <= 16) return 'r16';
  return 'r32';
}

/** Name a "Super" round-robin phase by its size — Super Four / Six / Eight
 *  (the Asia-Cup-style second group among the group-stage qualifiers). */
export function superPhaseLabel(teams: number): string {
  if (teams === 4) return 'Super Four';
  if (teams === 6) return 'Super Six';
  if (teams === 8) return 'Super Eight';
  return `Super ${teams}`;
}

/**
 * Qualifiers for a **manually chosen** set of teams (custom control): the
 * organizer overrides who advances — to reflect an off-app tie-break, or to fill
 * an awkward field the rules can't. Builds a Qualifier for each selected team
 * from its group + finishing position, seeded the same way the rule-based path
 * seeds direct qualifiers: by finishing rank (all group winners first, then all
 * runners-up, …), and within a rank by record. Teams not in any group table are
 * ignored. `via` is 'direct' for every manual pick (no best-placed distinction).
 */
export function qualifiersFromSelection(tables: GroupTable[], selectedTeamIds: string[], cfg: StandingsConfig = defaultStandingsConfig('football')): Qualifier[] {
  const cmp = seedCmp(cfg);
  const sel = new Set(selectedTeamIds);
  const picks: { q: Qualifier; row: TeamStanding }[] = [];
  for (const t of tables) {
    t.rows.forEach((row, i) => {
      if (sel.has(row.teamId)) picks.push({ q: { teamId: row.teamId, name: row.name, group: t.name, rank: i + 1, via: 'direct' }, row });
    });
  }
  picks.sort((a, b) => a.q.rank - b.q.rank || cmp(a.row, b.row));
  return picks.map((p) => p.q);
}

/** Filter matches to one division (category) of a tournament. A team belongs to
 *  exactly one division and fixtures are generated within a division, so a match
 *  is "in" a division when its teams are. `categoryId` null/undefined ⇒ no
 *  divisions (or "all") ⇒ every match is returned unchanged. Lets standings,
 *  schedules and brackets be scoped per division without a matches.category_id
 *  column — the division is derived from the entry roster. */
export function matchesInDivision(matches: Match[], entries: TournamentEntry[], categoryId?: string | null): Match[] {
  if (!categoryId) return matches;
  const div = new Map(entries.map((e) => [e.team.id, e.categoryId]));
  return matches.filter((m) => div.get(m.homeTeam.id) === categoryId || div.get(m.awayTeam.id) === categoryId);
}

// Test/inspection hook (parity with the other engines).
(globalThis as unknown as Record<string, unknown>).__sportfolioGroups = { groupTables, advancement, seedKnockout, knockoutRoundLabel, qualifiersFromSelection, matchesInDivision };
