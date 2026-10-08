/**
 * The post-create setup checklist (parity #08): teams → format → schedule,
 * computed from the tournament's real data (nothing stored but "Hide"). Pure.
 */
import type { Tournament } from '../core/types';

export type SetupStep = { key: 'teams' | 'format' | 'schedule'; label: string; hint: string; done: boolean };

export function setupChecklist(t: Pick<Tournament, 'sports' | 'formats' | 'participation'>, teamCount: number, matchCount: number): SetupStep[] {
  const individual = t.participation === 'individual';
  const formats = (t.formats ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const formatDone = matchCount > 0 || (t.sports.length > 0 && t.sports.every((s) => !!formats[s]?.structShape));
  return [
    { key: 'teams', label: individual ? 'Add players' : 'Add teams', hint: individual ? 'At least 2 players take part.' : 'At least 2 teams take part.', done: teamCount >= 2 },
    { key: 'format', label: 'Choose the format — league, groups or knockout', hint: 'Sets the points table and how fixtures are drawn.', done: formatDone },
    { key: 'schedule', label: 'Schedule matches', hint: 'Auto-generate fixtures or add matches one by one.', done: matchCount > 0 },
  ];
}

/** The first sport still missing a format (the "format" step opens it). */
export function firstSportWithoutFormat(t: Pick<Tournament, 'sports' | 'formats'>): string | undefined {
  const formats = (t.formats ?? {}) as Record<string, Record<string, unknown> | undefined>;
  return t.sports.find((s) => !formats[s]?.structShape) ?? t.sports[0];
}
