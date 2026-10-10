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
import { teamStandings, standingsConfigFromFormat } from './standings.ts';
import type { FieldResultInput } from './results/medals.ts';

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

/**
 * The overall medal table plus, on each row, the contingent's placement in every
 * sport. `formats` supplies each sport's tie-break rules so positions match its
 * own league table. Sorted by total points, then most golds / silvers / bronzes,
 * then name.
 */
export function medalStandings(
  matches: Match[],
  sports: SportId[],
  scoring: TournamentScoring | undefined,
  formats?: Partial<Record<SportId, SportFormat>>,
  /** timed / measured events (results engine, SD-28): each event's medals and
   *  position points go to the athlete's / relay's contingent (matched by name,
   *  like the sports above). Entries without a team don't score. */
  fieldResults?: FieldResultInput[],
): MedalRow[] {
  const rows = new Map<string, MedalRow>();
  const ensure = (name: string, teamId: string, colorHex?: string): MedalRow => {
    const key = name.trim().toLowerCase();
    let r = rows.get(key);
    if (!r) { r = { name, colorHex, teamId, total: 0, golds: 0, silvers: 0, bronzes: 0, perSport: [] }; rows.set(key, r); }
    return r;
  };

  for (const sport of sports) {
    const weight = scoring?.sportWeights?.[sport] ?? 1;
    const table = teamStandings(matches, sport, standingsConfigFromFormat(sport, formats?.[sport]));
    const fieldSize = table.length;
    table.forEach((t, i) => {
      const position = i + 1;
      const points = positionPoints(scoring, position, fieldSize) * weight;
      const row = ensure(t.name, t.teamId, t.colorHex);
      row.total += points;
      if (position === 1) row.golds += 1;
      else if (position === 2) row.silvers += 1;
      else if (position === 3) row.bronzes += 1;
      row.perSport.push({ sport, position, fieldSize, played: t.played, points });
    });
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

  return [...rows.values()].sort(
    (a, b) => b.total - a.total || b.golds - a.golds || b.silvers - a.silvers || b.bronzes - a.bronzes || a.name.localeCompare(b.name),
  );
}
