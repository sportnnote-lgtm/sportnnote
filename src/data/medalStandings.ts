/** Medal / position-points standings for a multi-sport meet (Olympics or an
 *  inter-school sports day). Each sport produces a final ranking (its normal
 *  league table); a contingent's finishing position in that sport earns
 *  configurable points — optionally weighted per sport — and those points sum
 *  across every sport into one overall table.
 *
 *  Contingents are merged by NAME (the app's cross-sport identity: "Red House"
 *  football + "Red House" cricket = one house), the same convention
 *  `overallStandings` uses. Pure + dependency-free over the standings engine, so
 *  it's unit-testable and works in demo and live alike. */
import type { Match, SportId, TournamentScoring, SportFormat } from '../core/types';
import { standingsConfigFromFormat } from './standings.ts';
import type { FieldResultInput } from './results/medals.ts';
import { sportPlaces, type BronzeRule } from './bracketPlaces.ts';
import { structureFromFormat } from './structureConfig.ts';
import { isEventSport } from '../sports/eventSports.ts';

/** A contingent's result in one sport. */
export interface SportPlacement {
  sport: SportId;
  /** 1-based finishing position (1 = winner); undefined if it played no games. */
  position?: number;
  /** field size in that sport (for "3rd of 7") */
  fieldSize: number;
  played: number;
  /** weighted position points earned in this sport */
  points: number;
  /** SD-123: entrants sharing this place (2 = joint bronze, 4 = "=5th" …) */
  shared?: number;
  /** SD-123: the entrant that placed, when it isn't the contingent itself
   *  (a singles player scoring for their house) */
  entrant?: string;
}

/** One row of the overall medal table. */
export interface MedalRow {
  name: string;
  colorHex?: string;
  teamId: string;
  /** total weighted position points across all sports */
  total: number;
  /** 1st / 2nd / 3rd-place finishes (Olympic-style ordering + display) */
  golds: number;
  silvers: number;
  bronzes: number;
  perSport: SportPlacement[];
  /** timed / measured events (results engine): one line per placing that scored */
  perEvent?: EventPlacement[];
}

/** A contingent's placing in one timed / measured event (athletics 100 m …). */
export interface EventPlacement {
  sport: string;
  event: string;
  position: number;
  /** who placed (athlete or relay team) */
  name: string;
  /** weighted points earned */
  points: number;
}

/** Points for finishing `position` (1-based), before the per-sport weight. */
function positionPoints(cfg: TournamentScoring | undefined, position: number, fieldSize: number): number {
  const table = cfg?.positionPoints;
  if (table && table.length) return table[position - 1] ?? 0;
  // Sensible fallback when no table is set: N points for 1st down to 1 for last.
  return Math.max(0, fieldSize - position + 1);
}

/** SD-123: a place shared by `shared` entrants splits the points of the
 *  places they cover (joint 3rd of 2 = average of 3rd + 4th points). */
function sharedPoints(cfg: TournamentScoring | undefined, position: number, shared: number, fieldSize: number): number {
  if (shared <= 1) return positionPoints(cfg, position, fieldSize);
  let sum = 0;
  for (let i = 0; i < shared; i++) sum += positionPoints(cfg, position + i, fieldSize);
  return Math.round((sum / shared) * 100) / 100;
}

/** SD-123: the bronze rule for a sport ('playoff' unless the organiser chose
 *  shared bronze for it). */
export const bronzeRuleFor = (cfg: TournamentScoring | undefined, sport: SportId): BronzeRule =>
  cfg?.sharedBronze?.[sport] ? 'shared' : 'playoff';

/** SD-123: medals first (gold → silver → bronze, Olympic order), else points. */
export function compareMedalRows(rankBy: TournamentScoring['rankBy']) {
  return (a: MedalRow, b: MedalRow): number =>
    rankBy === 'medals'
      ? b.golds - a.golds || b.silvers - a.silvers || b.bronzes - a.bronzes || b.total - a.total || a.name.localeCompare(b.name)
      : b.total - a.total || b.golds - a.golds || b.silvers - a.silvers || b.bronzes - a.bronzes || a.name.localeCompare(b.name);
}

/** Who an entrant scores for. A team entrant is its own contingent; a singles
 *  player / pair returns their house (SD-123). undefined ⇒ the entrant itself. */
export type ContingentOf = (entrant: { id: string; name: string; colorHex?: string }, sport: SportId) =>
  { id?: string; name: string; colorHex?: string } | undefined;

export function medalStandings(
  matches: Match[],
  sports: SportId[],
  scoring: TournamentScoring | undefined,
  formats?: Partial<Record<SportId, SportFormat>>,
  /** timed / measured events (results engine, SD-28): each event's medals and
   *  position points go to the athlete's / relay's contingent (matched by name,
   *  like the sports above). Entries without a team don't score. */
  fieldResults?: FieldResultInput[],
  /** SD-123: credit singles players / pairs to their house or contingent */
  contingentOf?: ContingentOf,
): MedalRow[] {
  const rows = new Map<string, MedalRow>();
  const ensure = (name: string, teamId: string, colorHex?: string): MedalRow => {
    const key = name.trim().toLowerCase();
    let r = rows.get(key);
    if (!r) { r = { name, colorHex, teamId, total: 0, golds: 0, silvers: 0, bronzes: 0, perSport: [] }; rows.set(key, r); }
    return r;
  };

  for (const sport of sports) {
    // Timed / measured sports score through fieldResults (and golf stroke play
    // through its leaderboard) — never as a match table.
    if (isEventSport(sport)) continue;
    const weight = scoring?.sportWeights?.[sport] ?? 1;
    const fmt = formats?.[sport] as Record<string, unknown> | undefined;
    const { places, fieldSize } = sportPlaces(matches, sport, standingsConfigFromFormat(sport, fmt), {
      bronze: bronzeRuleFor(scoring, sport),
      shape: structureFromFormat(fmt)?.shape ?? null,
    });
    for (const t of places) {
      const { position, shared } = t;
      const points = sharedPoints(scoring, position, shared, fieldSize) * weight;
      const c = contingentOf?.({ id: t.teamId, name: t.name, colorHex: t.colorHex }, sport);
      const row = c ? ensure(c.name, c.id ?? c.name, c.colorHex) : ensure(t.name, t.teamId, t.colorHex);
      row.total += points;
      if (position === 1) row.golds += 1;
      else if (position === 2) row.silvers += 1;
      else if (position === 3) row.bronzes += 1;
      row.perSport.push({ sport, position, fieldSize, played: t.played, points, ...(shared > 1 ? { shared } : {}), ...(c ? { entrant: t.name } : {}) });
    }
  }

  for (const ev of fieldResults ?? []) {
    const weight = scoring?.sportWeights?.[ev.sport as SportId] ?? 1;
    for (const a of ev.awards) {
      if (!a.team?.name) continue;
      const row = ensure(a.team.name, a.team.id ?? a.team.name, a.team.colorHex);
      const points = a.points * weight;
      row.total += points;
      if (a.medal === 'gold') row.golds += 1;
      else if (a.medal === 'silver') row.silvers += 1;
      else if (a.medal === 'bronze') row.bronzes += 1;
      (row.perEvent ??= []).push({ sport: ev.sport, event: ev.event, position: a.position, name: a.name, points });
    }
  }

  for (const r of rows.values()) r.total = Math.round(r.total * 100) / 100;
  return [...rows.values()].sort(compareMedalRows(scoring?.rankBy));
}

/**
 * SD-123: in a house / contingent meet a singles player (or a doubles pair)
 * scores for their house, not as a contingent of their own. An individual
 * entrant is an entry "team" named after the player; its house comes from its
 * roster's players (all on one house), else from the one player whose name
 * matches the entry. A pair from two different houses, or a player with no
 * house, stays its own entrant. Team sports are untouched.
 */
export function houseContingent(
  individualSports: ReadonlySet<SportId>,
  rosters: ReadonlyMap<string, readonly string[]>,
  players: readonly { id: string; fullName: string; houseName?: string; houseColor?: string }[],
): ContingentOf {
  const byId = new Map(players.map((p) => [p.id, p]));
  const byName = new Map<string, typeof players[number][]>();
  for (const p of players) {
    const k = p.fullName.trim().toLowerCase();
    byName.set(k, [...(byName.get(k) ?? []), p]);
  }
  return (entrant, sport) => {
    if (!individualSports.has(sport)) return undefined;
    let ps = (rosters.get(entrant.id) ?? []).map((id) => byId.get(id)).filter((p): p is typeof players[number] => !!p);
    if (!ps.length) {
      const named = byName.get(entrant.name.trim().toLowerCase()) ?? [];
      if (named.length === 1) ps = named;
    }
    const houses = new Set(ps.map((p) => p.houseName?.trim().toLowerCase()));
    if (!ps.length || houses.size !== 1 || !ps[0].houseName) return undefined;
    return { name: ps[0].houseName.trim(), colorHex: ps[0].houseColor };
  };
}
