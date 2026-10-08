/**
 * Who may manage a team's squad (add/remove players, captain/VC, roles, invite
 * link). The server decides (SQL `can_manage_team`); this pure rule is the demo
 * and offline fallback, mirroring it: organisers/support, the captain or VC,
 * anyone the captain store marks as captain, or a club admin.
 */
import type { Role, TeamLeadership } from './types';

export function canManageTeamLocal(ctx: {
  role?: Role;
  myPlayerId?: string | null;
  leaders?: TeamLeadership;
  isCaptainStore?: boolean;
  isClubAdmin?: boolean;
}): boolean {
  if (ctx.role === 'organizer' || ctx.role === 'support') return true;
  if (ctx.isCaptainStore || ctx.isClubAdmin) return true;
  const me = ctx.myPlayerId;
  if (!me) return false;
  return ctx.leaders?.captainId === me || ctx.leaders?.viceCaptainId === me;
}

/** Tapping "Make captain" / "Make vice-captain": toggles that role for the
 *  player; one person can't be both, so taking one clears the other. */
export function nextLeaders(leaders: TeamLeadership, role: 'captainId' | 'viceCaptainId', playerId: string): TeamLeadership {
  const next: TeamLeadership = { ...leaders, [role]: leaders[role] === playerId ? undefined : playerId };
  if (role === 'captainId' && next.captainId === playerId && next.viceCaptainId === playerId) next.viceCaptainId = undefined;
  if (role === 'viceCaptainId' && next.viceCaptainId === playerId && next.captainId === playerId) next.captainId = undefined;
  return next;
}
