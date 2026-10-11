/**
 * Grouped-tournament advancement — the pure logic that turns finished group
 * tables into a seeded knockout. Handles the two shapes an organizer wants:
 *   • "top N of each group advance" (e.g. top 2 → quarter-finals), and
 *   • "top N + the best (N+1)-placed teams across all groups" to fill an
 *     awkward bracket (e.g. 5 groups → top 3 = 15, + the best 4th-placed = 16
 *     for a Round of 16 — the classic 24/25-team format), ranked by the same
 *     tie-breakers the league table uses (points → the sport's chain, e.g. goal
 *     difference → goals for; SD-12).
 * No I/O — the screen feeds it match results and gets back the bracket to create.
 */
import type { Match, SportId, TournamentEntry } from '../core/types.ts';
import { teamStandings, defaultStandingsConfig, seedKey, type TeamStanding, type StandingsConfig } from './standings.ts';
import type { GeneratedPairing } from './fixtures.ts';
import { isEliminationStage, bracketSeedOrder, seedPlayIn, planKnockout, stageForTeams, type KoStage } from './bracket.ts';
import type { TieBreaker } from './standings.ts';

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

/** Cross-group seed comparison (best-placed teams, seeding within a rank):
 *  points, then the SAME tie-break chain the sport's group table uses (SD-12) —
 *  with "among the tied" criteria swapped for their overall equivalents, since
 *  teams from different groups never met (`seedKey`: h2h skipped, ITTF games /
 *  points ratio → overall ratios; chess Sonneborn-Berger and wins as they are)
 *  — then name. */
function seedCmp(cfg: StandingsConfig, perGame = false) {
  const pts = (t: TeamStanding) => (perGame ? perGameOf(t, t.points) : t.points);
  return (x: TeamStanding, y: TeamStanding): number => {
    if (pts(y) !== pts(x)) return pts(y) - pts(x);
    for (const t of cfg.order) {
      let kx = seedKey(x, t);
      let ky = seedKey(y, t);
      if (kx === null || ky === null) continue;
      // SD-124: counting keys (difference, scored, wins…) per game played;
      // ratios and rates are already size-free.
      if (perGame && PER_GAME_KEYS.has(t)) { kx = perGameOf(x, kx); ky = perGameOf(y, ky); }
      if (kx === ky) continue;
      return ky > kx ? 1 : -1;
    }
    return x.name.localeCompare(y.name);
  };
}

/** Tie-breakers that grow with every game played — compared per game when the
 *  groups are different sizes (ratios / percentages / NRR are left as they are). */
const PER_GAME_KEYS = new Set<TieBreaker>(['diff', 'for', 'wins', 'sb', 'gamesDiff', 'pointsDiff', 'rubbersDiff', 'boardPoints', 'fairPlay'] as TieBreaker[]);
const perGameOf = (t: TeamStanding, v: number): number => (t.played > 0 ? v / t.played : 0);

/**
 * SD-124 — how teams from different groups are compared. Equal groups: the
 * totals (points, then the sport's chain). Groups of different sizes (22 teams
 * in 4 groups → 6, 6, 5, 5): a team in a bigger group has played more, so the
 * comparison is **per game played** — points per game, then goal (score)
 * difference per game, scored per game … — the size-neutral average.
 */
export function advancementBasis(tables: GroupTable[]): 'total' | 'perGame' {
  return new Set(tables.map((t) => t.rows.length)).size > 1 ? 'perGame' : 'total';
}

/** Per-group tables for a sport: partition the tournament's matches by their
 *  `group` tag and rank each with the normal league logic. Ungrouped matches
 *  (e.g. knockout ties) are ignored. Each group is the `group:<name>` phase, so
 *  the organiser's points adjustments for it feed qualification. */
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
    .map(([name, ms]) => ({ name, rows: teamStandings(ms, sport, cfg, `group:${name}`) }));
}

/** One points table of a tournament (parity #07). `key` is the phase an
 *  adjustment is tagged with: 'league' | 'group:A' | 'super' | 'swiss'. */
export interface StandingsPhase { key: string; title: string; rows: TeamStanding[] }

/**
 * Every points table for a sport, in tournament order: the league (untagged
 * matches) → each group ("Group A", …) → the Super round-robin (Super Four /
 * Six / …) → Swiss rounds. Knockout / elimination matches (QF, SF, final,
 * third place, playoff qualifiers, play-ins) never appear in a table. A phase
 * shows once it has a fixture, even before any result. [] when there are none.
 */
export function standingsPhases(
  matches: Match[], sport: SportId, cfg: StandingsConfig = defaultStandingsConfig(sport),
  /** names a Swiss bye-only entrant with no fixture yet (SD-10) */
  teams?: { id: string; name: string; colorHex?: string }[],
): StandingsPhase[] {
  const league: Match[] = [];
  const groups = new Map<string, Match[]>();
  const superMs: Match[] = [];
  const swiss: Match[] = [];
  for (const m of matches) {
    if (m.sport !== sport || isEliminationStage(m.stage)) continue;
    if (m.group) {
      const list = groups.get(m.group) ?? [];
      list.push(m);
      groups.set(m.group, list);
    } else if (m.stage === 'super') superMs.push(m);
    else if (m.stage?.startsWith('swiss')) swiss.push(m);
    else if (!m.stage || m.stage === 'group' || m.stage === 'league') league.push(m);
  }
  const out: StandingsPhase[] = [];
  if (league.length) out.push({ key: 'league', title: 'League', rows: teamStandings(league, sport, cfg, 'league') });
  for (const [name, ms] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])))
    out.push({ key: `group:${name}`, title: `Group ${name}`, rows: teamStandings(ms, sport, cfg, `group:${name}`) });
  if (superMs.length) {
    const size = new Set(superMs.flatMap((m) => [m.homeTeam.id, m.awayTeam.id])).size;
    out.push({ key: 'super', title: superPhaseLabel(size), rows: teamStandings(superMs, sport, cfg, 'super') });
  }
  if (swiss.length) out.push({ key: 'swiss', title: 'Swiss', rows: teamStandings(swiss, sport, cfg, 'swiss', teams) });
  return out;
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
  const cmp = seedCmp(cfg, advancementBasis(tables) === 'perGame');
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

/* ------------------------ SD-124: standard seeding ------------------------ */

/** One first-round tie with its bracket slot (0 = top of the draw). */
export interface SeededTie extends GeneratedPairing { slot: number }
/** A seeded first round: the ties (in bracket order), the teams that bye into
 *  the next round (top seeds), the stage the ties are tagged with, and how it
 *  was seeded (for the note under the preview). */
export interface SeededRound {
  ties: SeededTie[];
  byeIds: string[];
  stage: KoStage;
  method: 'crossover' | 'seeded';
}

const isPow2 = (n: number) => n >= 1 && (n & (n - 1)) === 0;

/** Every group sends exactly its winner and runner-up, and the number of groups
 *  is 2, 4, 8 or 16 — the shape the fixed cross-over table covers. */
export function crossoverFits(q: Qualifier[]): boolean {
  if (q.length < 4 || !isPow2(q.length)) return false;
  const groups = new Map<string, number[]>();
  for (const x of q) {
    if (x.via !== 'direct' || (x.rank !== 1 && x.rank !== 2)) return false;
    groups.set(x.group, [...(groups.get(x.group) ?? []), x.rank]);
  }
  if (groups.size * 2 !== q.length || !isPow2(groups.size)) return false;
  return [...groups.values()].every((r) => r.length === 2 && r.includes(1) && r.includes(2));
}

/**
 * The fixed cross-over draw (FIFA World Cup / UEFA EURO shape): groups paired
 * in letter order (A–B, C–D, …); the top half is A1 v B2, C1 v D2, …, the
 * bottom half B1 v A2, D1 v C2, …. So a group winner always meets another
 * group's runner-up, the two teams from one group are in opposite halves (they
 * can only meet in the final), and so are A1 and B1. With 8 groups this is
 * exactly the FIFA 2018/2022 Round of 16 (49 A1–B2, 50 C1–D2, 53 E1–F2,
 * 54 G1–H2 | 51 B1–A2, 52 D1–C2, 55 F1–E2, 56 H1–G2); with 4 it is EURO
 * 1996–2012's quarter-finals (A1–B2, C1–D2 | B1–A2, D1–C2).
 */
export function crossoverTies(q: Qualifier[]): SeededTie[] {
  const names = [...new Set(q.map((x) => x.group))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const at = (g: string, rank: number) => q.find((x) => x.group === g && x.rank === rank)!.teamId;
  const top: [string, string][] = [];
  const bottom: [string, string][] = [];
  for (let i = 0; i + 1 < names.length; i += 2) {
    top.push([at(names[i], 1), at(names[i + 1], 2)]);
    bottom.push([at(names[i + 1], 1), at(names[i], 2)]);
  }
  return [...top, ...bottom].map(([homeId, awayId], slot) => ({ homeId, awayId, round: 1, slot }));
}

/**
 * Seeded draw from a seed list (best → worst; a power-of-two field): standard
 * bracket positions (1 v N, 4 v N−3, 2 v N−1 … — `bracketSeedOrder`), so seeds
 * 1 and 2 are in opposite halves and can only meet in the final. With group
 * tags, a first-round tie between two teams of the same group swaps its lower
 * seed with another tie's (same half first) — best effort.
 */
export function seededTies(seedIds: string[], groupOf?: (id: string) => string | undefined): SeededTie[] {
  const n = seedIds.length;
  const pos = bracketSeedOrder(n);
  const ties: [string, string][] = [];
  for (let i = 0; i + 1 < pos.length; i += 2) ties.push([seedIds[pos[i] - 1], seedIds[pos[i + 1] - 1]]);
  if (groupOf) {
    const g = (id: string) => groupOf(id);
    const clash = (a: string, b: string) => !!g(a) && g(a) === g(b);
    const half = (i: number) => (i < ties.length / 2 ? 0 : 1);
    for (let i = 0; i < ties.length; i++) {
      if (!clash(ties[i][0], ties[i][1])) continue;
      const order = [...ties.keys()].filter((j) => j !== i).sort((a, b) => Number(half(a) !== half(i)) - Number(half(b) !== half(i)) || Math.abs(a - i) - Math.abs(b - i));
      for (const j of order) {
        if (!clash(ties[i][0], ties[j][1]) && !clash(ties[j][0], ties[i][1])) {
          const tmp = ties[i][1]; ties[i][1] = ties[j][1]; ties[j][1] = tmp;
          break;
        }
      }
    }
  }
  return ties.map(([homeId, awayId], slot) => ({ homeId, awayId, round: 1, slot }));
}

/**
 * A seeded first round for any field from a seed list. A power-of-two field is
 * drawn in standard positions; any other field gives the top seeds byes — the
 * bottom 2·(N−P) seeds play round 1 (seed k v seed 2P+1−k, exactly their places
 * in the full 2P draw) and the byes join the winners in the next round.
 */
export function seededRound(seedIds: string[], groupOf?: (id: string) => string | undefined): SeededRound {
  const n = seedIds.length;
  if (isPow2(n)) return { ties: seededTies(seedIds, groupOf), byeIds: [], stage: stageForTeams(n), method: 'seeded' };
  const pi = seedPlayIn(seedIds);
  return {
    ties: pi.ties.map((t, slot) => ({ ...t, round: 1, slot })),
    byeIds: pi.byeIds,
    stage: planKnockout(n).playInStage,
    method: 'seeded',
  };
}

/**
 * SD-124 — the knockout from group qualifiers (seed order from `advancement`
 * / `qualifiersFromSelection`): the fixed cross-over table when every group
 * sends its top two and there are 2/4/8/16 groups; otherwise seeded positions
 * (group winners first, then runners-up, then the best-placed) with byes for
 * the top seeds when the field isn't a power of two.
 */
export function seedFromGroups(q: Qualifier[]): SeededRound {
  if (crossoverFits(q)) return { ties: crossoverTies(q), byeIds: [], stage: stageForTeams(q.length), method: 'crossover' };
  const group = new Map(q.map((x) => [x.teamId, x.group]));
  return seededRound(q.map((x) => x.teamId), (id) => group.get(id));
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
  const cmp = seedCmp(cfg, advancementBasis(tables) === 'perGame');
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
(globalThis as unknown as Record<string, unknown>).__sportfolioGroups = { groupTables, standingsPhases, advancement, seedKnockout, seedFromGroups, seededRound, advancementBasis, knockoutRoundLabel, qualifiersFromSelection, matchesInDivision };
