/** Derive a tournament's lifecycle status. Dates give the baseline, but when we
 *  know the match progress it overrides the calendar — a meet isn't "Completed"
 *  while games are still live or unplayed, and it IS complete once every match is
 *  played even if that's before the listed end date. */
import { theme } from './theme';
import type { MatchStatus, Tournament } from './types';

export type TournamentStatusKind = 'live' | 'upcoming' | 'completed';

export interface TournamentStatus {
  kind: TournamentStatusKind;
  label: string;
  color: string;
}

/** How far along a tournament's matches are — pass to tournamentStatus so the
 *  badge reflects reality, not just the dates. */
export interface MatchProgress {
  total: number;
  live: number;
  completed: number;
}

const today = () => new Date().toISOString().slice(0, 10);

export function matchProgress(matches: { status: MatchStatus }[]): MatchProgress {
  return {
    total: matches.length,
    live: matches.filter((m) => m.status === 'live').length,
    completed: matches.filter((m) => m.status === 'completed').length,
  };
}

export function tournamentStatus(
  t: Pick<Tournament, 'startDate' | 'endDate'>,
  progress?: MatchProgress,
): TournamentStatus {
  const LIVE: TournamentStatus = { kind: 'live', label: 'Live now', color: theme.colors.danger };
  const UPCOMING: TournamentStatus = { kind: 'upcoming', label: 'Upcoming', color: theme.colors.accent };
  const COMPLETED: TournamentStatus = { kind: 'completed', label: 'Completed', color: theme.colors.textMuted };
  const now = today();

  // Match reality wins when we have fixtures to judge by.
  if (progress && progress.total > 0) {
    if (progress.live > 0) return LIVE; // a game is in progress right now
    if (progress.completed >= progress.total) return COMPLETED; // every match played
    // Games still to play → not completed, even past the end date.
    return t.startDate && t.startDate > now ? UPCOMING : LIVE;
  }

  // No fixtures / no data → fall back to the calendar.
  if (t.endDate && t.endDate < now) return COMPLETED;
  if (t.startDate && t.startDate > now) return UPCOMING;
  return LIVE;
}
