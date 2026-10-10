/** Schedule-conflict detection — the engine behind the "⚠️ clash" warnings shown
 *  when an organizer picks a time + venue for a match.
 *
 *  Two things a real fixture list must never do:
 *    • book one ground/court for two overlapping games (a venue clash), and
 *    • ask one team to be in two places at once (a team clash).
 *
 *  Matches only carry a kickoff time, not an end time, so we treat each game as
 *  occupying a nominal window (its sport's typical length). The windows are
 *  deliberately generous — better to flag a tight back-to-back the organizer can
 *  wave off than to miss a genuine double-booking. Pure + dependency-free so it
 *  runs identically in demo and live, and is unit-testable under `node --test`. */
import type { Match, SportId } from '../core/types';

/** Nominal match durations in minutes — rough windows for overlap detection, not
 *  exact rules. Includes a buffer for warm-up / turnaround on the same ground. */
const DURATION_MIN: Partial<Record<SportId, number>> = {
  football: 120,
  cricket: 210,
  basketball: 120,
  kabaddi: 60,
  volleyball: 90,
  tennis: 120,
  badminton: 75,
  pickleball: 60,
  squash: 60,
  padel: 75,
  tabletennis: 45,
  chess: 120, // rapid/blitz rounds are shorter; classical can run 4h+
  carrom: 60,
  golf: 300, // an 18-hole round + turnaround
  athletics: 240, // a session of track events
  hockey: 105, // 4 × 15 + breaks + turnaround
  swimming: 240, // a session of swimming events
  handball: 90, // 2 × 30 + half-time + time-outs + turnaround
  weightlifting: 150, // one bodyweight category's session (snatch + C&J) + turnaround
};

/** The nominal on-ground window for a sport (minutes). Falls back to 2 hours. */
export function matchDurationMinutes(sport: SportId): number {
  return DURATION_MIN[sport] ?? 120;
}

/** Only these statuses actually occupy a slot. A postponed, cancelled or
 *  completed game has released its ground and its teams, so it never clashes. */
const OCCUPIES_SLOT = new Set(['scheduled', 'live']);

export type ScheduleConflict =
  | { kind: 'venue'; other: Match }
  | { kind: 'team'; other: Match; teamName: string };

/** A match being scheduled or edited. `id` is absent for a not-yet-created one
 *  (so it can never clash with "itself"). */
export interface ConflictCandidate {
  id?: string;
  sport: SportId;
  startsAt: string;
  venueName?: string | null;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  homeTeamName?: string | null;
  awayTeamName?: string | null;
}

const norm = (s?: string | null) => (s ?? '').trim().toLowerCase();

/** [start, end) window of a match in epoch-ms. */
function windowOf(startsAt: string, sport: SportId): [number, number] {
  const start = new Date(startsAt).getTime();
  return [start, start + matchDurationMinutes(sport) * 60_000];
}

/** Do two [start,end) windows overlap at all? Touching edges (one ends exactly
 *  as the other begins) is not a clash. */
function windowsOverlap(aStart: string, aSport: SportId, bStart: string, bSport: SportId): boolean {
  const [as, ae] = windowOf(aStart, aSport);
  const [bs, be] = windowOf(bStart, bSport);
  return as < be && bs < ae;
}

/** Every clash the candidate would create against the given matches. A single
 *  other match can yield both a venue clash and a team clash (listed separately).
 *  Ordered venue-first, then team, so the caller can show the most concrete
 *  ("that ground is taken") reason first. */
export function findScheduleConflicts(cand: ConflictCandidate, others: Match[]): ScheduleConflict[] {
  if (!cand.startsAt) return [];
  const start = new Date(cand.startsAt).getTime();
  if (Number.isNaN(start)) return [];

  const venueClashes: ScheduleConflict[] = [];
  const teamClashes: ScheduleConflict[] = [];
  const candVenue = norm(cand.venueName);

  for (const m of others) {
    if (cand.id && m.id === cand.id) continue; // never clash with itself
    if (!OCCUPIES_SLOT.has(m.status)) continue;
    if (!m.startsAt) continue;
    if (!windowsOverlap(cand.startsAt, cand.sport, m.startsAt, m.sport)) continue;

    // Same-named ground, overlapping windows → the venue is double-booked.
    if (candVenue && candVenue === norm(m.venueName)) {
      venueClashes.push({ kind: 'venue', other: m });
    }

    // Either of the candidate's teams already playing in the other match.
    if (cand.homeTeamId && (m.homeTeam?.id === cand.homeTeamId || m.awayTeam?.id === cand.homeTeamId)) {
      teamClashes.push({ kind: 'team', other: m, teamName: cand.homeTeamName || m.homeTeam?.name || 'A team' });
    }
    if (cand.awayTeamId && (m.homeTeam?.id === cand.awayTeamId || m.awayTeam?.id === cand.awayTeamId)) {
      teamClashes.push({ kind: 'team', other: m, teamName: cand.awayTeamName || m.awayTeam?.name || 'A team' });
    }
  }

  return [...venueClashes, ...teamClashes];
}

/** The distinct venue names already used across a set of matches, most-recently
 *  used first — the pool an organizer picks from so grounds are named
 *  consistently (which is what makes venue-clash detection meaningful). */
export function knownVenueNames(matches: Match[]): string[] {
  const seen = new Map<string, string>(); // normalized → original casing
  const sorted = [...matches].sort((a, b) => (b.startsAt ?? '').localeCompare(a.startsAt ?? ''));
  for (const m of sorted) {
    const name = m.venueName?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (!seen.has(key)) seen.set(key, name);
  }
  return Array.from(seen.values());
}
