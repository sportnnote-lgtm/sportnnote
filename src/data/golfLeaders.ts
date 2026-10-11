/**
 * SD-49 (GEN-18 / GF-08) — golf's field results in the tournament: which
 * leader categories a golf tournament shows (by its competition), and the
 * final leaderboard's positions as medal-table input (`medalStandings`
 * `fieldResults`). Pure (no storage / network) so tests run it directly.
 *
 * Golf stroke play / Stableford rounds are field events: their stat lines
 * carry `eventId` (no `matchId`), written when a round is finished
 * (`completeRound`). The tournament loaders add the lines whose event belongs
 * to the tournament (hooks.ts `useLeagueData`).
 */
import type { FieldEntry, FieldEvent, GolfCourse, StatLine, TournamentScoring } from '../core/types.ts';
import { buildLeaderboard, golfFormatOf } from './golfLeaderboard.ts';
import { eventAwards, DEFAULT_EVENT_POINTS, type FieldResultInput } from './results/medals.ts';
import type { RankedEntry } from './results/model.ts';

/** A tournament's stat lines (GEN-18): match lines of its matches, plus
 *  field-event lines (no match) whose event — a golf round, a results-engine
 *  phase — belongs to it. Used by `useLeagueData`. */
export function scopeTournamentLines(lines: StatLine[], matchIds: Set<string>, eventIds: Set<string>): StatLine[] {
  return lines.filter((l) => (l.eventId ? eventIds.has(l.eventId) : matchIds.has(l.matchId)));
}

/** Leader categories that only stroke play / Stableford rounds produce. */
export const GOLF_STROKE_LEADERS = ['lowRound', 'lowRound9', 'scoringAvg', 'puttsPerRound', 'girPct'] as const;

/** Is this golf tournament played as match play? (format `competition`) */
export const isGolfMatchPlay = (format?: Record<string, unknown>) => String(format?.competition ?? 'stroke') === 'match';

/**
 * The golf categories for a tournament's competition, in golf order. Stroke
 * play / Stableford: low round first, then scoring average, birdies, eagles,
 * putts, greens — and no "Holes won" (a match-play figure). Match play keeps
 * the schema order (birdies, holes won). Categories with no leaders are
 * already dropped by `categoryLeaders`.
 */
export function golfLeaderCategories<T extends { key: string }>(cats: T[], format?: Record<string, unknown>): T[] {
  if (isGolfMatchPlay(format)) return cats;
  const order = ['lowRound', 'lowRound9', 'scoringAvg', 'birdies', 'eagles', 'puttsPerRound', 'girPct'];
  const rank = (k: string) => { const i = order.indexOf(k); return i < 0 ? order.length : i; };
  return cats.filter((c) => c.key !== 'holesWon').sort((a, b) => rank(a.key) - rank(b.key));
}

/** The team a golfer scores for in a multi-sport table. */
export interface GolfTeamRef { id?: string; name: string; colorHex?: string }

export interface GolfFieldOptions {
  /** the entry's contingent: its `teamId`'s team, else the player's house.
   *  Undefined = the player scores for nobody (medalStandings skips them). */
  teamOf: (entry: FieldEntry) => GolfTeamRef | undefined;
  nameOf: (playerId: string) => string;
  /** points for 1st, 2nd, … (default 8-7-6-5-4-3-2-1); ties share */
  positionPoints?: number[];
}

/** Points table for golf in a medal table: the golf format's own
 *  `positionPoints`, else the meet's (a position-points tournament), else
 *  8-7-6-5-4-3-2-1. */
export function golfPositionPoints(format?: Record<string, unknown>, scoring?: TournamentScoring): number[] {
  const own = format?.positionPoints;
  if (Array.isArray(own) && own.length && own.every((n) => typeof n === 'number' && n >= 0)) return own as number[];
  if (scoring?.mode === 'position' && scoring.positionPoints?.length) return scoring.positionPoints;
  return DEFAULT_EVENT_POINTS;
}

/**
 * A golf tournament's final positions as one medal-table event — only once
 * every round is finished (no medals off a live leaderboard), and not while a
 * playoff for first is still to be played. MC / WD / DQ / DNS players have no
 * position and score nothing; tied players share the places' points. Returns
 * [] when there is nothing final yet (or nobody scores for a team).
 */
export function golfFieldResults(events: FieldEvent[], entries: FieldEntry[], courses: GolfCourse[], opts: GolfFieldOptions): FieldResultInput[] {
  const rounds = events.filter((e) => e.sport === 'golf');
  if (!rounds.length || rounds.some((e) => e.status !== 'completed')) return [];
  const board = buildLeaderboard(rounds, entries, courses);
  if (board.some((r) => r.playoff === 'pending')) return [];
  const ids = new Set(rounds.map((e) => e.id));
  const order = new Map(rounds.map((e) => [e.id, e.roundNo] as const));
  // the player's entry in their latest round decides their team
  const latest = new Map<string, FieldEntry>();
  for (const en of entries) {
    if (!ids.has(en.eventId)) continue;
    const prev = latest.get(en.playerId);
    if (!prev || (order.get(en.eventId) ?? 0) >= (order.get(prev.eventId) ?? 0)) latest.set(en.playerId, en);
  }
  const ranked = board
    .filter((r) => r.position != null)
    .map((r) => {
      const en = latest.get(r.id);
      const team = en ? opts.teamOf(en) : undefined;
      return { id: r.id, position: r.position, entry: { name: opts.nameOf(r.id), ...(team ? { team } : {}) } } as unknown as RankedEntry;
    });
  if (!ranked.length) return [];
  const awards = eventAwards(ranked, { positionPoints: opts.positionPoints });
  if (!awards.some((a) => a.team?.name)) return [];
  const last = golfFormatOf([...rounds].sort((a, b) => a.roundNo - b.roundNo)[rounds.length - 1]);
  const kind = last.scoring === 'stableford' ? 'Stableford' : last.net ? 'net stroke play' : 'stroke play';
  return [{ sport: 'golf', event: `Golf — ${kind}`, awards }];
}
