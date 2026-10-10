/**
 * The post-create setup checklist (parity #08): teams → format → schedule,
 * computed from the tournament's real data (nothing stored but "Hide"). Pure.
 */
import type { Tournament } from '../core/types';
import { EVENT_SPORTS as EVENTS } from '../sports/eventSports.ts';

export type SetupStep = { key: 'teams' | 'format' | 'schedule' | 'events'; label: string; hint: string; done: boolean };

/** Sports run as timed events (no league / knockout format, no fixtures) — SD-90. */
const EVENT_SPORTS = new Set<string>(EVENTS);

export function setupChecklist(t: Pick<Tournament, 'sports' | 'formats' | 'participation'>, teamCount: number, matchCount: number, eventCount = 0): SetupStep[] {
  const individual = t.participation === 'individual';
  const formats = (t.formats ?? {}) as Record<string, Record<string, unknown> | undefined>;
  // SD-90: an athletics-only meet: houses / teams, then its events.
  if (t.sports.length > 0 && t.sports.every((s) => EVENT_SPORTS.has(s))) {
    return [
      { key: 'teams', label: 'Add teams or houses', hint: t.sports.every((s) => s === 'weightlifting') ? 'Lifters score for them.' : t.sports.every((s) => s === 'shooting') ? 'Shooters score for them.' : 'Athletes score for them; relay teams come from them.', done: teamCount >= 2 },
      { key: 'events', label: 'Add the events', hint: t.sports.every((s) => s === 'weightlifting') ? 'Each bodyweight category with its lifters.' : t.sports.every((s) => s === 'shooting') ? 'Each event (10 m Air Rifle, 10 m Air Pistol …) with its shooters and final.' : `Each race with its category, ${t.sports.every((s) => s === 'swimming') ? 'swimmers' : 'athletes'}, rounds and lanes.`, done: eventCount > 0 },
    ];
  }
  const matchSports = t.sports.filter((s) => !EVENT_SPORTS.has(s));
  const formatDone = matchCount > 0 || (matchSports.length > 0 && matchSports.every((s) => !!formats[s]?.structShape));
  return [
    { key: 'teams', label: individual ? 'Add players' : 'Add teams', hint: individual ? 'At least 2 players take part.' : 'At least 2 teams take part.', done: teamCount >= 2 },
    { key: 'format', label: 'Choose the format — league, groups or knockout', hint: 'Sets the points table and how fixtures are drawn.', done: formatDone },
    { key: 'schedule', label: 'Schedule matches', hint: 'Auto-generate fixtures, import a spreadsheet, or add matches one by one.', done: matchCount > 0 },
  ];
}

/** The first sport still missing a format (the "format" step opens it). */
export function firstSportWithoutFormat(t: Pick<Tournament, 'sports' | 'formats'>): string | undefined {
  const formats = (t.formats ?? {}) as Record<string, Record<string, unknown> | undefined>;
  return t.sports.find((s) => !EVENT_SPORTS.has(s) && !formats[s]?.structShape) ?? t.sports.find((s) => !EVENT_SPORTS.has(s)) ?? t.sports[0];
}
