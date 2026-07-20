/** Team affiliations a player has had, aggregated across every sport. Teams are
 *  recorded per-sport as TeamStints on sportDetails; the same club represented
 *  in several sports collapses to one row here, tagging each sport. A team is
 *  "current" while at least one of its stints has no end date, otherwise it's a
 *  past team. */
import type { Player, SportId } from './types';

export interface TeamAffiliation {
  name: string;
  /** sports the player represented this team in */
  sports: SportId[];
  /** a representative jersey number (the first one recorded) */
  jersey?: number;
  /** earliest start across the team's stints */
  since?: string;
  /** latest end across the team's stints (only meaningful when not active) */
  until?: string;
  /** true while any stint for this team is still open (no `until`) */
  active: boolean;
}

const year = (d?: string) => (d ? d.slice(0, 4) : '');

/** Short period label for a team row, e.g. "since 2023" (current) or
 *  "2021 – 2022" / "until 2022" (past). */
export const teamPeriod = (t: TeamAffiliation): string => {
  if (t.active) return t.since ? `since ${year(t.since)}` : '';
  if (t.until) return t.since ? `${year(t.since)} – ${year(t.until)}` : `until ${year(t.until)}`;
  return '';
};

/** All teams the player has represented, deduped by name (case-insensitive). */
export function teamAffiliations(player: Player | null | undefined): TeamAffiliation[] {
  const details = player?.sportDetails ?? {};
  const map = new Map<string, TeamAffiliation>();
  for (const [sport, d] of Object.entries(details)) {
    for (const stint of d?.teams ?? []) {
      const name = stint.name?.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const cur =
        map.get(key) ?? { name, sports: [] as SportId[], active: false };
      if (!cur.sports.includes(sport as SportId)) cur.sports.push(sport as SportId);
      if (cur.jersey == null && stint.jersey != null) cur.jersey = stint.jersey;
      if (stint.since && (!cur.since || stint.since < cur.since)) cur.since = stint.since;
      if (!stint.until) cur.active = true;
      else if (!cur.until || stint.until > cur.until) cur.until = stint.until;
      map.set(key, cur);
    }
  }
  return [...map.values()];
}

/** All teams the player has represented, most recent first. A player can return
 *  to a team at any time, so there's no current/past split — currently-active
 *  teams (no end date) simply sort to the top, then the rest by when they were
 *  last represented. */
export const teamsByRecency = (player: Player | null | undefined): TeamAffiliation[] =>
  teamAffiliations(player).sort((a, b) => recencyKey(b).localeCompare(recencyKey(a)));

// Active teams have no end date → treat as "now" so they rank above past teams;
// otherwise rank by when the player last played for them.
const recencyKey = (t: TeamAffiliation): string => (t.active ? '9999' : t.until ?? t.since ?? '');
