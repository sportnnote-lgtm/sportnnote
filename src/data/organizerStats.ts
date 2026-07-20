/**
 * Pure roll-ups for the organizer dashboard — "what's left to run." Given the
 * tournaments an organizer manages and every match, derive per-tournament
 * progress (how much is scored, what needs a scorer, what's ready to close) plus
 * a top-line summary. No I/O, so it's deterministic and testable.
 */
import type { Match, Tournament } from '../core/types';

export interface TournamentDash {
  tournament: Tournament;
  total: number;
  completed: number;
  live: number;
  scheduled: number;
  /** scheduled matches with no scorer assigned yet — the organizer's to-do */
  noScorer: number;
  hasFixtures: boolean;
  /** every match played → standings are final, safe to wrap up */
  readyToClose: boolean;
  /** 0..1 share of matches completed */
  scoredPct: number;
}

export interface OrganizerDashboard {
  perTournament: TournamentDash[];
  totals: { tournaments: number; matches: number; completed: number; live: number; noScorer: number; scoredPct: number };
}

export function computeOrganizerDashboard(hosted: Tournament[], allMatches: Match[]): OrganizerDashboard {
  const perTournament: TournamentDash[] = hosted.map((t) => {
    const ms = allMatches.filter((m) => m.tournamentId === t.id);
    const total = ms.length;
    const completed = ms.filter((m) => m.status === 'completed').length;
    const live = ms.filter((m) => m.status === 'live').length;
    const scheduled = ms.filter((m) => m.status === 'scheduled').length;
    const noScorer = ms.filter((m) => m.status === 'scheduled' && !m.scorerId).length;
    return {
      tournament: t,
      total, completed, live, scheduled, noScorer,
      hasFixtures: total > 0,
      readyToClose: total > 0 && completed === total,
      scoredPct: total ? completed / total : 0,
    };
  });

  const sum = (pick: (d: TournamentDash) => number) => perTournament.reduce((s, d) => s + pick(d), 0);
  const matches = sum((d) => d.total);
  const completed = sum((d) => d.completed);
  return {
    perTournament,
    totals: {
      tournaments: hosted.length,
      matches,
      completed,
      live: sum((d) => d.live),
      noScorer: sum((d) => d.noScorer),
      scoredPct: matches ? completed / matches : 0,
    },
  };
}

// Test/inspection hook (parity with the other engines).
(globalThis as unknown as Record<string, unknown>).__sportfolioOrganizer = { computeOrganizerDashboard };
