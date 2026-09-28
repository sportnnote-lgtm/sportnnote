/** The catalogue of sport-specific PLAYER roles for a team's sport profile.
 *  Roles are determined by the sport — there is deliberately no single universal
 *  list. A player can hold more than one role in a sport (e.g. cricket
 *  "Wicketkeeper + Batter"), and their role in one sport never implies a role in
 *  another. Racket/individual sports (badminton, tennis, padel, squash) have no
 *  team roles — singles/doubles is handled by match setup, not squad roles — so
 *  they return an empty list and the roles UI is simply hidden for them. */
import type { SportId } from '../core/types';

export const TEAM_ROLES: Partial<Record<SportId, string[]>> = {
  cricket: ['Wicketkeeper', 'Batter', 'Bowler', 'All-rounder'],
  football: ['Goalkeeper', 'Defender', 'Midfielder', 'Forward'],
  basketball: ['Point Guard', 'Shooting Guard', 'Small Forward', 'Power Forward', 'Center'],
  volleyball: ['Setter', 'Outside Hitter', 'Middle Blocker', 'Opposite', 'Libero'],
  kabaddi: ['Raider', 'Defender', 'All-rounder'],
};

/** Valid roles for a sport (empty when the sport has no squad-role concept). */
export function rolesForSport(sport: SportId): string[] {
  return TEAM_ROLES[sport] ?? [];
}

/** Whether a sport defines squad roles at all (drives whether the roles UI shows). */
export function sportHasRoles(sport: SportId): boolean {
  return (TEAM_ROLES[sport]?.length ?? 0) > 0;
}
