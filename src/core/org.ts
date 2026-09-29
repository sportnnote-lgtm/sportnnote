/** Organization helpers: roles, membership checks, and resolving who hosts a
 *  tournament (an individual's ids, or every member of the hosting org). */
import type { AcademicYear, GradeStint, House, HouseStint, Organization, OrgMember, OrgRole, Tournament } from './types';

export const ORG_ROLES: OrgRole[] = ['Owner', 'Admin', 'Organizer', 'Scorer', 'Referee', 'Member'];

/** One-line description of what each org role can do (shown in the role picker). */
export const ORG_ROLE_BLURB: Record<OrgRole, string> = {
  Owner: 'Full control — everything an Admin can do, plus manage Owners & transfer ownership',
  Admin: 'Manage members, teams, tournaments & settings (but not Owners)',
  Organizer: 'Create & schedule tournaments and matches; manage teams in them',
  Scorer: 'Eligible to be assigned to score matches',
  Referee: 'Eligible to be assigned to officiate matches',
  Member: 'View the community’s tournaments and their own matches',
};

/** Communities where members are students who progress through classes/standards
 *  year on year — these get the class-timeline features. */
export const isAcademicCommunity = (type?: string): boolean =>
  type === 'School' || type === 'College';

/** The class/standard a member was in on a given date (defaults to today/"now").
 *  Stints are half-open [since, until); the open stint is the current class. */
export const standardAt = (m: OrgMember | undefined, date?: string): string | undefined => {
  if (!m?.grades?.length) return undefined;
  const d = date ?? '9999-12-31';
  const hit = m.grades.find((g) => g.since <= d && (!g.until || d < g.until));
  if (hit) return hit.standard;
  // Before the first recorded class → use the earliest; otherwise the latest.
  const sorted = [...m.grades].sort((a, b) => a.since.localeCompare(b.since));
  return d < sorted[0].since ? sorted[0].standard : sorted[sorted.length - 1].standard;
};

/** The member's current class/standard. */
export const currentStandard = (m: OrgMember | undefined): string | undefined => standardAt(m, undefined);

/** Short label for a grade stint, e.g. "Grade 9 · since 2024" or "Grade 8 · 2023–2024". */
export const gradePeriod = (g: GradeStintLike): string => {
  const yr = (d?: string) => (d ? d.slice(0, 4) : '');
  return g.until ? `${yr(g.since)}–${yr(g.until)}` : `since ${yr(g.since)}`;
};
type GradeStintLike = { since: string; until?: string };

/** India default: schooling completes at Grade 10, after which students graduate. */
export const DEFAULT_GRADUATING_STANDARD = 'Grade 10';

/** The class after which students of this community graduate. Schools default to
 *  Grade 10; other academic communities must set their own. */
export const graduatingStandardOf = (org: Organization | undefined): string | undefined =>
  org?.graduatingStandard ?? (org?.type === 'School' ? DEFAULT_GRADUATING_STANDARD : undefined);

/** Whether a student in `standard` would graduate (rather than be promoted). */
export const isGraduatingStandard = (org: Organization | undefined, standard?: string): boolean =>
  !!standard && standard === graduatingStandardOf(org);

/* ───────────────────────────── Academic years ───────────────────────────── */

/** The community's academic years, earliest first. */
export const academicYearsOf = (org: Organization | undefined): AcademicYear[] =>
  [...(org?.academicYears ?? [])].sort((a, b) => a.start.localeCompare(b.start));

/** The academic year that contains `date` (the currently running one). */
export const currentAcademicYear = (org: Organization | undefined, date: string): AcademicYear | undefined =>
  academicYearsOf(org).find((y) => y.start <= date && date <= y.end);

/** The earliest academic year — when the community started running events here. */
export const firstAcademicYear = (org: Organization | undefined): AcademicYear | undefined =>
  academicYearsOf(org)[0];

/** The most recently-ending academic year on record. */
export const latestAcademicYear = (org: Organization | undefined): AcademicYear | undefined => {
  const ys = academicYearsOf(org);
  return ys[ys.length - 1];
};

/** A label like "2025–26" from a start/end date pair. */
export const academicYearLabel = (start: string, end: string): string =>
  `${start.slice(0, 4)}–${end.slice(2, 4)}`;

/** The next academic year's dates, derived from the latest one's month-days +1
 *  year (undefined when there's no prior year to extrapolate from). */
export const nextAcademicYearDates = (org: Organization | undefined): AcademicYear | undefined => {
  const last = latestAcademicYear(org);
  if (!last) return undefined;
  const start = `${Number(last.start.slice(0, 4)) + 1}${last.start.slice(4)}`;
  const end = `${Number(last.end.slice(0, 4)) + 1}${last.end.slice(4)}`;
  return { start, end, label: academicYearLabel(start, end) };
};

/** True when the running year is over and the next one hasn't been recorded —
 *  the cue to prompt admins to set up the new academic year. */
export const academicYearEnded = (org: Organization | undefined, date: string): boolean => {
  const last = latestAcademicYear(org);
  return !!last && date > last.end && !currentAcademicYear(org, date);
};

/** Best guess at the next class up — increments the last number in the label
 *  ("Grade 9" → "Grade 10", "Year 1" → "Year 2", "10" → "11"). Labels with no
 *  number (e.g. roman "Class X") are returned unchanged for manual entry. */
export const nextStandard = (standard: string): string => {
  const m = standard.match(/(\d+)(\D*)$/);
  if (!m || m.index === undefined) return standard;
  return standard.slice(0, m.index) + String(parseInt(m[1], 10) + 1) + m[2];
};

/** Add (or promote to) a new class for a member as of `since`, closing the
 *  previously-open class at that date so the timeline stays non-overlapping. */
export const promoteGrade = (grades: GradeStint[] | undefined, standard: string, since: string): GradeStint[] => {
  const list = (grades ?? []).map((g) => (!g.until ? { ...g, until: since } : g));
  return [...list, { standard, since }].sort((a, b) => a.since.localeCompare(b.since));
};

/* ─────────────────────────────── Houses (schools) ────────────────────────── */

/** The Houses a school has defined (empty if none). */
export const housesOf = (org: Organization | undefined): House[] => org?.houses ?? [];

/** The House a student was in on a given date (defaults to now). Half-open stints,
 *  same resolution rule as classes — so a past tournament shows the House at the time. */
export const houseAt = (m: OrgMember | undefined, date?: string): string | undefined => {
  if (!m?.houses?.length) return undefined;
  const d = date ?? '9999-12-31';
  const hit = m.houses.find((h) => h.since <= d && (!h.until || d < h.until));
  if (hit) return hit.house;
  const sorted = [...m.houses].sort((a, b) => a.since.localeCompare(b.since));
  return d < sorted[0].since ? sorted[0].house : sorted[sorted.length - 1].house;
};

/** The student's current House. */
export const currentHouse = (m: OrgMember | undefined): string | undefined => houseAt(m, undefined);

/** Assign a student to a House as of `since`, closing the previously-open House
 *  stint at that date so the timeline stays non-overlapping (mirrors promoteGrade).
 *  Re-assigning to the same current House is a no-op. */
export const assignHouse = (houses: HouseStint[] | undefined, house: string, since: string): HouseStint[] => {
  const list = houses ?? [];
  const open = list.find((h) => !h.until);
  if (open && open.house === house) return list; // already in this House
  const closed = list.map((h) => (!h.until ? { ...h, until: since } : h));
  return [...closed, { house, since }].sort((a, b) => a.since.localeCompare(b.since));
};

/** The color a school assigned to a House (for chips/dots), if any. */
export const houseColorOf = (org: Organization | undefined, house?: string): string | undefined =>
  house ? housesOf(org).find((h) => h.name === house)?.colorHex : undefined;

/** Members who belonged to the org on a given date (membership covered it). */
export const membersOnDate = (org: Organization, date: string): OrgMember[] =>
  org.members.filter((m) => (m.since ?? '0000') <= date && (!m.until || date < m.until));

/** Standard community kinds offered when creating one (plus a custom option). */
export const COMMUNITY_TYPES = [
  'School',
  'College',
  'Company',
  'Housing society',
  'Hospital chain',
  'Sports club',
  'NGO',
];

export const isOrgMember = (org: Organization | undefined, playerId?: string | null): boolean =>
  !!org && !!playerId && org.members.some((m) => m.playerId === playerId);

export const isOrgAdmin = (org: Organization | undefined, playerId?: string | null): boolean =>
  hasOrgRole(org, playerId, ['Owner', 'Admin']);

/** An Owner — the top role; only Owners may manage other Owners. */
export const isOrgOwner = (org: Organization | undefined, playerId?: string | null): boolean =>
  hasOrgRole(org, playerId, ['Owner']);

export const roleInOrg = (org: Organization, playerId: string): OrgRole | undefined =>
  org.members.find((m) => m.playerId === playerId)?.role;

/** Whether the player is an *active* member of the org with one of the given
 *  roles (a membership that has ended no longer grants any capability). */
export const hasOrgRole = (
  org: Organization | undefined,
  playerId: string | null | undefined,
  roles: OrgRole[]
): boolean =>
  !!org && !!playerId &&
  org.members.some((m) => m.playerId === playerId && !m.until && roles.includes(m.role));

/** Owner/Admin: can change anything about the community & its events (an Admin can
 *  do everything except manage Owners — see canManageOwners). */
export const canManageOrg = (org: Organization | undefined, playerId?: string | null): boolean =>
  hasOrgRole(org, playerId, ['Owner', 'Admin']);

/** Only Owners may add/remove/demote Owners or transfer ownership. */
export const canManageOwners = (org: Organization | undefined, playerId?: string | null): boolean =>
  isOrgOwner(org, playerId);

/** Active owners of an org. Every community must always keep at least one. */
export const activeOwners = (org: Organization | undefined) =>
  org ? org.members.filter((m) => !m.until && m.role === 'Owner') : [];

/** Active admins of an org (Owners are administrators too). */
export const activeAdmins = (org: Organization | undefined) =>
  org ? org.members.filter((m) => !m.until && (m.role === 'Admin' || m.role === 'Owner')) : [];

/** Whether removing/demoting/ending this player would leave the org with no
 *  Owner — i.e. they are the one and only active Owner. The hard safeguard: an
 *  org must never have zero Owners. */
export const isSoleActiveOwner = (org: Organization | undefined, playerId?: string | null): boolean => {
  const owners = activeOwners(org);
  return !!playerId && owners.length === 1 && owners[0].playerId === playerId;
};

/** Whether this player is the org's only remaining administrator (Owner or Admin).
 *  Retained for existing console guards; the true never-zero invariant is on
 *  Owners (isSoleActiveOwner). */
export const isSoleActiveAdmin = (org: Organization | undefined, playerId?: string | null): boolean => {
  const admins = activeAdmins(org);
  return !!playerId && admins.length === 1 && admins[0].playerId === playerId;
};

/** Owner/Admin/Organizer: can create & schedule the community's tournaments/matches. */
export const canOrganizeEvents = (org: Organization | undefined, playerId?: string | null): boolean =>
  hasOrgRole(org, playerId, ['Owner', 'Admin', 'Organizer']);

/** Orgs where the player can create/host events (Admin or Organizer). */
export const organizableOrgsForPlayer = (orgs: Organization[], playerId?: string | null): Organization[] =>
  orgs.filter((o) => canOrganizeEvents(o, playerId));

/** Orgs a player belongs to (active or past). */
export const orgsForPlayer = (orgs: Organization[], playerId?: string | null): Organization[] =>
  playerId ? orgs.filter((o) => o.members.some((m) => m.playerId === playerId)) : [];

/** The player's membership entry in an org, if any. */
export const memberEntry = (org: Organization, playerId?: string | null) =>
  playerId ? org.members.find((m) => m.playerId === playerId) : undefined;

/** A membership is active until it is given an end date. */
export const isActiveMember = (org: Organization, playerId?: string | null): boolean => {
  const m = memberEntry(org, playerId);
  return !!m && !m.until;
};

/** Communities the player is currently a member of. */
export const activeOrgsForPlayer = (orgs: Organization[], playerId?: string | null): Organization[] =>
  orgsForPlayer(orgs, playerId).filter((o) => isActiveMember(o, playerId));

/** Communities the player has left (their membership has ended). */
export const pastOrgsForPlayer = (orgs: Organization[], playerId?: string | null): Organization[] =>
  orgsForPlayer(orgs, playerId).filter((o) => !isActiveMember(o, playerId));

/** A short human label for a membership's time period, e.g. "since 2023",
 *  "2019 – 2023", or "" when no dates are recorded. */
export const membershipPeriod = (m?: { since?: string; until?: string }): string => {
  if (!m) return '';
  const yr = (d?: string) => (d ? d.slice(0, 4) : '');
  if (m.until) return m.since ? `${yr(m.since)} – ${yr(m.until)}` : `left ${yr(m.until)}`;
  return m.since ? `since ${yr(m.since)}` : '';
};

/** Whether the player already has an active membership in another community of
 *  the same category — the case the one-per-category rule forbids. */
export const activeOrgInCategory = (
  orgs: Organization[],
  playerId: string | null | undefined,
  category: string | undefined,
  exceptOrgId?: string
): Organization | undefined =>
  category
    ? activeOrgsForPlayer(orgs, playerId).find((o) => o.type === category && o.id !== exceptOrgId)
    : undefined;

/** Everyone responsible for a tournament: for an org-hosted event, the org's
 *  Admins & Organizers (Scorers and plain Members don't run events); otherwise
 *  the listed individual host ids. */
export function tournamentHostPlayerIds(t: Tournament, orgs: Organization[]): string[] {
  if (t.hostOrgId) {
    const org = orgs.find((o) => o.id === t.hostOrgId);
    return org
      ? org.members
          .filter((m) => !m.until && (m.role === 'Owner' || m.role === 'Admin' || m.role === 'Organizer'))
          .map((m) => m.playerId)
      : [];
  }
  return t.hostIds ?? [];
}

/** Can this player manage the tournament (assign scorers, edit hosts/logo)? */
export const canManageTournament = (t: Tournament, orgs: Organization[], playerId?: string | null): boolean =>
  !!playerId && tournamentHostPlayerIds(t, orgs).includes(playerId);
