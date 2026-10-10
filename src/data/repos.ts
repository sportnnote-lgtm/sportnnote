/**
 * Data-access layer. Screens call these — never Supabase directly — so the
 * demo-mode fallback lives in exactly one place. Each function returns the same
 * domain shapes whether the data came from Postgres or the local mock.
 */
import { ageOf } from '../core/age';
import { firebasePhoneAvailable, sendPhoneCode, confirmPhoneCode } from '../core/firebasePhone';
import { serializePrefs, type FollowPrefs } from './followPrefs';
import { supabase, isSupabaseConfigured } from '../core/supabase';
import type { PickedDoc } from '../core/document';
import type { PickedImage } from '../core/photo';
import { isLocalImageUri, mediaPath, extForMime, type ImageKind } from '../core/imageUrl';
import { normalizePhone, samePhone, isValidPhone } from '../core/phone';
import { canManageTeamLocal } from '../core/teamPermissions';
import { editAccess, type EditAccess } from '../core/playerEditAccess';
import { parseTournamentToken } from '../core/tournamentInvite';
import { getDeviceId } from '../core/deviceId';
import { snapshotOutcome } from '../core/matchResult';
import { followDisputes } from './eventLog';
import { planStatSync, applyStatWrites, type MatchTotals } from './statSync';
import { planAppearances, sideResults, subsCameOn, type AppearanceWrite } from './appearances';
import { mergeSportFormat } from './formatPatch';
import { isLiveTournament } from './tournamentForm';
import {
  orSafe, parseVsQuery, rankByName, filterByName, capIds, collapseTeams, liveOnly, selectMatchHits, matchNames, narrowBySports,
  isSearchable, SEARCH_LIMIT, SEARCH_ID_CAP, type TeamHit, type SearchResults, type SearchKind,
} from './search';
import { normalizeOfficials, type MatchOfficial } from './matchOfficials';
import { readBreak, type MatchBreak } from './matchHousekeeping';
import type { PointsAdjustment } from './standings';
import { newTournamentFormats } from './standings';
import type { ScoringLock } from '../core/scoringLock';
import { MATCHES } from '../core/mockData';
import {
  demo,
  genId,
  addTournament,
  addTeam,
  addMatch,
  recordStat,
  newDemoStatLine,
  setLineup as demoSetLineup,
  setFootballProfile as demoSetFootballProfile,
  appendDemoMatchEvent,
  popDemoMatchEvent,
  addPlayer,
  setDemoMatchSquad,
  nextInviteToken,
  addDemoInvite,
  addDemoCaptainTeam,
  addListing as demoAddListing,
  removeListing as demoRemoveListing,
  setOrgMembers as demoSetOrgMembers,
  setTeamLeaders as demoSetTeamLeaders,
  addOrganization,
  addTournamentTeamsDemo,
  setTournamentTeamStatusDemo,
  setTournamentTeamCheckInDemo,
  removeTournamentTeamDemo,
  getTournamentCategoriesDemo,
  addTournamentCategoriesDemo,
  removeTournamentCategoryDemo,
  setTournamentTeamCategoryDemo,
} from './demoStore';
import { emptyFormation, defaultFormationFor } from '../sports/football/formation';
import { isSoleActiveOwner } from '../core/org';
import { joinBlockReason } from '../core/registration';
import { getSport } from '../sports/registry';
import { replayLog } from '../sports/amend';
import type { StatTotalsContext } from '../sports/types';
import { mergeMatchConfig } from '../core/matchConfig';
import { seriesLegFormat, readSeriesMeta, type SeriesFormat } from './series';
import type {
  Role,
  MatchResult,
  AcademicYear,
  Club,
  ClubInvite,
  ClubMember,
  ClubMemberRole,
  ClubMemberView,
  FootballProfile,
  Listing,
  Match,
  MatchEventRecord,
  Organization,
  OrgRole,
  OrgMember,
  OrgRequest,
  GradeStint,
  House,
  MatchDispute,
  DisputeEvent,
  MatchLineup,
  MatchSquad,
  MatchSquads,
  MatchStatus,
  Player,
  SportFormat,
  SportId,
  StatLine,
  LineResult,
  Team,
  TeamInvite,
  TeamLeadership,
  TeamPlayerRoles,
  TeamSummary,
  NewClub,
  Tournament,
  OwnershipEvent,
  OwnerRef,
  TournamentOfficial,
  OfficialRole,
  ActivityEvent,
  TournamentAwards,
  MatchPotm,
  TournamentCategory,
  TournamentEntry,
  TournamentEntryStatus,
  NewTournamentCategory,
} from '../core/types';

/** A teams row joined into a match. */
interface TeamRow {
  id: string;
  name: string;
  short_name: string;
  sport: string;
  color_hex: string | null;
  org_id?: string | null;
  club_id?: string | null;
  roster?: string[] | null;
  adhoc?: boolean | null;
}
interface MatchRow {
  /** manual result (migration 0040) — absent on older databases */
  result?: MatchResult | null;
  id: string;
  tournament_id: string;
  group_label: string | null;
  stage: string | null;
  byes: string[] | null;
  sport: string;
  status: MatchStatus;
  starts_at: string;
  venue_id: string | null;
  venue_name: string | null;
  venue_maps_url: string | null;
  stream_url: string | null;
  winner: 'home' | 'away' | 'draw' | null;
  host_ids: string[] | null;
  logo_url: string | null;
  scorer_id: string | null;
  scorer_ids: string[] | null;
  format: SportFormat | null;
  state: unknown;
  home_team: TeamRow | TeamRow[] | null;
  away_team: TeamRow | TeamRow[] | null;
}

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

const toTeam = (r: TeamRow): Team => ({
  id: r.id,
  name: r.name,
  shortName: r.short_name,
  sport: r.sport as SportId,
  colorHex: r.color_hex ?? undefined,
  orgId: r.org_id ?? undefined,
  clubId: r.club_id ?? undefined,
  roster: r.roster ?? undefined,
  adhoc: r.adhoc ?? undefined,
});

/** A completed match's result, derived from its stored sport state via the sport
 *  plugin — the source of truth for winner + score. Defensive: a malformed state
 *  must never break a match read (returns null). Null while in progress/undecided. */
function deriveResult(sport: string, state: unknown): { winner: 'home' | 'away' | 'draw'; home: number; away: number } | null {
  if (!state) return null;
  try { return getSport(sport as SportId).result?.(state as never) ?? null; } catch { return null; }
}

function toMatch(r: MatchRow): Match {
  const home = one(r.home_team);
  const away = one(r.away_team);
  const res = deriveResult(r.sport, r.state);
  return {
    id: r.id,
    tournamentId: r.tournament_id,
    group: r.group_label ?? undefined,
    stage: r.stage ?? undefined,
    byes: r.byes ?? undefined,
    sport: r.sport as SportId,
    status: r.status,
    startsAt: r.starts_at,
    venueId: r.venue_id ?? undefined,
    venueName: r.venue_name ?? undefined,
    venueMapsUrl: r.venue_maps_url ?? undefined,
    streamUrl: r.stream_url ?? undefined,
    // Prefer the result derived from live state; fall back to the stored column
    // (seed/archived matches with a winner but no state). Score has no column —
    // it's always derived from state, so for/against works in standings.
    // A result closed by hand (abandoned, conceded…) beats what the state derives.
    winner: r.result ? (r.result.winner ?? (r.result.kind === 'draw' || r.result.kind === 'tie' ? 'draw' : undefined)) : res?.winner ?? r.winner ?? undefined,
    score: r.result?.score ?? (res ? { home: res.home, away: res.away } : undefined),
    result: r.result ?? undefined,
    walkover: (r.format as Record<string, unknown> | null)?.__walkover === true,
    onBreak: readBreak(r.format as Record<string, unknown> | null),
    hostIds: r.host_ids ?? undefined,
    logoUrl: r.logo_url ?? undefined,
    scorerId: r.scorer_id ?? undefined,
    scorerIds: (r.scorer_ids && r.scorer_ids.length ? r.scorer_ids : (r.scorer_id ? [r.scorer_id] : [])) as string[],
    // Empty `{}` counts as "no per-match format" so the tournament's format is
    // still inherited (the DB defaults the column to {}). A non-empty format —
    // a friendly's rules, or series metadata — is kept.
    format: r.format && Object.keys(r.format).length > 0 ? r.format : undefined,
    homeTeam: home ? toTeam(home) : (MATCHES[0].homeTeam as Team),
    awayTeam: away ? toTeam(away) : (MATCHES[0].awayTeam as Team),
    state: r.state ?? null,
  };
}

const MATCH_SELECT_BASE =
  'id, tournament_id, group_label, stage, byes, sport, status, starts_at, venue_id, venue_name, venue_maps_url, stream_url, winner, host_ids, logo_url, scorer_id, scorer_ids, format, state,' +
  ' home_team:teams!matches_home_team_id_fkey(id,name,short_name,sport,color_hex),' +
  ' away_team:teams!matches_away_team_id_fkey(id,name,short_name,sport,color_hex)';
const MATCH_SELECT = MATCH_SELECT_BASE + ', result';

/** Read matches with the newest columns, retrying without them on a database
 *  that hasn't run their migration yet (`result`: 0040). */
async function withMatchCols<T>(build: (cols: string) => PromiseLike<{ data: T | null; error: unknown }>): Promise<{ data: T | null; error: unknown }> {
  const full = await build(MATCH_SELECT);
  if (!full.error) return full;
  return build(MATCH_SELECT_BASE);
}

export async function getTournament(): Promise<Tournament> {
  if (!isSupabaseConfigured || !supabase) return demo.tournaments.find(isLiveTournament) ?? demo.tournaments[0];
  // First not-deleted tournament (parity #09 soft delete).
  const live = (await getTournaments()).slice().sort((x, y) => (x.startDate ?? '').localeCompare(y.startDate ?? ''));
  return live[0] ?? demo.tournaments[0];
}

const toTournament = (data: any): Tournament => ({
  id: data.id,
  name: data.name,
  // Early tournaments saved the placeholder "You" as host name — never show it to others.
  hostName: data.host_name === 'You' ? 'Organiser' : data.host_name,
  hostOrgId: data.host_org_id ?? undefined,
  createdBy: data.created_by ?? undefined,
  participation: data.participation ?? undefined,
  logoUrl: data.logo_url ?? undefined,
  // prefer the multi-host array; fall back to the legacy single organizer_id
  hostIds: data.host_ids ?? (data.organizer_id ? [data.organizer_id] : undefined),
  isOpen: data.is_open ?? undefined,
  registrationDeadline: data.registration_deadline ?? undefined,
  minTeams: data.min_teams ?? undefined,
  maxTeams: data.max_teams ?? undefined,
  scoring: data.scoring ?? undefined,
  sports: (data.sports ?? []) as SportId[],
  startDate: data.start_date,
  endDate: data.end_date,
  formats: data.formats ?? undefined,
  structure: data.structure ?? undefined,
  knockoutFormat: data.knockout_format ?? undefined,
  reminderLeadMinutes: data.reminder_lead_minutes ?? undefined,
  bannerUrl: data.banner_url ?? undefined,
  city: data.city ?? undefined,
  grounds: data.grounds ?? undefined,
  eventCategory: data.event_category ?? undefined,
  about: data.about ?? undefined,
  organiserPhone: data.organiser_phone ?? undefined,
  organiserEmail: data.organiser_email ?? undefined,
  deletedAt: data.deleted_at ?? undefined,
});

// The registration columns (registration_deadline / min_teams / max_teams) need
// migration 0014. Keep a base column set so every tournament read still works
// before it's applied, and a full set that includes them.
const TOURNAMENT_COLS_BASE = 'id, name, host_name, host_org_id, logo_url, organizer_id, host_ids, is_open, sports, start_date, end_date, formats, structure, knockout_format, reminder_lead_minutes';
const TOURNAMENT_SELECT = `${TOURNAMENT_COLS_BASE}, registration_deadline, min_teams, max_teams, scoring, created_by, participation`;
// Tournament details + soft delete (0041) and the banner (0038).
const TOURNAMENT_PROFILE_COLS = 'banner_url, city, grounds, event_category, about, organiser_phone, organiser_email, deleted_at';

/** Run a tournaments query with the full column set; if the registration columns
 *  aren't in the live DB yet, transparently retry with the base set. */
async function withTournamentCols<T>(build: (cols: string) => PromiseLike<{ data: T | null; error: unknown }>): Promise<{ data: T | null; error: unknown }> {
  const profile = await build(`${TOURNAMENT_SELECT}, ${TOURNAMENT_PROFILE_COLS}`);
  if (!profile.error) return profile;
  const full = await build(TOURNAMENT_SELECT);
  if (!full.error) return full;
  return build(TOURNAMENT_COLS_BASE);
}

/** Every tournament, newest first. */
export async function getTournaments(opts: { includeDeleted?: boolean } = {}): Promise<Tournament[]> {
  if (!isSupabaseConfigured || !supabase) return opts.includeDeleted ? demo.tournaments : demo.tournaments.filter(isLiveTournament);
  const { data, error } = await withTournamentCols<any[]>((cols) =>
    supabase!.from('tournaments').select(cols).order('start_date', { ascending: false }));
  if (error || !data) return [];
  const all = data.map(toTournament);
  return opts.includeDeleted ? all : all.filter(isLiveTournament);
}

/** Tournaments the user plays in or follows (organizer-owned + followed). In
 *  demo mode the local user runs the sample meets, so all are returned. */
export async function getMyTournaments(profileId?: string, followedIds: string[] = []): Promise<Tournament[]> {
  const all = await getTournaments();
  if (!isSupabaseConfigured || !supabase || !profileId) return all;
  // host_ids hold player ids (the same identity the host UI checks), so resolve
  // the signed-in player first.
  const myPlayerId = await getMyPlayerId(profileId);
  const { data } = myPlayerId
    ? await withTournamentCols<any[]>((cols) => supabase!.from('tournaments').select(cols).contains('host_ids', [myPlayerId]))
    : { data: [] as unknown[] };
  const mine = ((data as any[]) ?? []).map(toTournament);
  const ids = new Set([...mine.map((t) => t.id), ...followedIds]);
  const scoped = all.filter((t) => ids.has(t.id));
  return scoped.length ? scoped : all;
}

/** Ids of soft-deleted tournaments (parity #09); none before migration 0041. */
async function deletedTournamentIds(): Promise<Set<string>> {
  if (!isSupabaseConfigured || !supabase) return new Set(demo.tournaments.filter((t) => !isLiveTournament(t)).map((t) => t.id));
  const { data, error } = await supabase.from('tournaments').select('id').not('deleted_at', 'is', null);
  if (error || !data) return new Set();
  return new Set((data as { id: string }[]).map((r) => r.id));
}
/** A deleted tournament's matches drop out of feeds — except finished ones, whose
 *  results stay on players' profiles and records. */
const visibleAfterDelete = (deleted: Set<string>) => (m: Match) =>
  !(m.tournamentId && deleted.has(m.tournamentId) && m.status !== 'completed');

export async function getMatches(filter?: SportId): Promise<Match[]> {
  const deleted = await deletedTournamentIds();
  if (!isSupabaseConfigured || !supabase) {
    const all = [...demo.matches].sort((a, b) => a.startsAt.localeCompare(b.startsAt)).filter(visibleAfterDelete(deleted));
    return filter ? all.filter((m) => m.sport === filter) : all;
  }
  const { data, error } = await withMatchCols<unknown[]>((cols) => {
    let q = supabase!.from('matches').select(cols).order('starts_at', { ascending: true });
    if (filter) q = q.eq('sport', filter);
    return q;
  });
  if (error || !data) return [];
  return (data as unknown as MatchRow[]).map(toMatch).filter(visibleAfterDelete(deleted));
}

export async function getMatch(id: string): Promise<Match | null> {
  if (!isSupabaseConfigured || !supabase) return demo.matches.find((m) => m.id === id) ?? null;
  const { data, error } = await withMatchCols<unknown>((cols) => supabase!.from('matches').select(cols).eq('id', id).single());
  if (error || !data) return null;
  return toMatch(data as unknown as MatchRow);
}

/** Player rosters for a set of teams (teamId → player ids), merging the explicit
 *  `roster` list, `team_members`, and (demo) house-name derivation. Used to map
 *  players ↔ teams for the Home feed / "my matches" scoping. */
export async function getTeamRosters(teamIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!teamIds.length) return out;
  if (!isSupabaseConfigured || !supabase) {
    for (const id of teamIds) {
      const t = demo.teams.find((x) => x.id === id);
      const roster = (t?.roster && t.roster.length)
        ? t.roster
        : t ? demo.players.filter((p) => p.houseName === t.name).map((p) => p.id) : [];
      out.set(id, [...roster]);
    }
    return out;
  }
  const [{ data: teamsData }, { data: memberData }] = await Promise.all([
    supabase.from('teams').select('id, roster').in('id', teamIds),
    supabase.from('team_members').select('team_id, player_id').in('team_id', teamIds),
  ]);
  for (const r of (teamsData ?? []) as { id: string; roster: string[] | null }[]) out.set(r.id, [...(r.roster ?? [])]);
  for (const r of (memberData ?? []) as { team_id: string; player_id: string }[]) {
    const arr = out.get(r.team_id) ?? [];
    if (!arr.includes(r.player_id)) arr.push(r.player_id);
    out.set(r.team_id, arr);
  }
  return out;
}

/** Split all matches into the signed-in user's two views:
 *  - `mine`: matches they play in (a team they're on) or organize/score (a match
 *    or tournament they host, or are the designated scorer of).
 *  - `feed`: `mine` PLUS matches from any player / team / tournament they follow
 *    (following a player resolves to that player's team's matches).
 *  Used by the Home page (feed) and the Matches tab (mine). */
export async function getScopedMatches(profileId?: string): Promise<{ mine: Match[]; feed: Match[] }> {
  const [matches, myPlayerId, followKeys, tournaments] = await Promise.all([
    getMatches(), getMyPlayerId(profileId), getFollows(profileId), getTournaments(),
  ]);
  const followTeams = new Set<string>(), followTours = new Set<string>(), followPlayers = new Set<string>();
  for (const k of followKeys) {
    const [type, id] = k.split(':');
    if (type === 'team') followTeams.add(id);
    else if (type === 'tournament') followTours.add(id);
    else if (type === 'player') followPlayers.add(id);
  }
  const teamIds = new Set<string>();
  for (const m of matches) { if (m.homeTeam?.id) teamIds.add(m.homeTeam.id); if (m.awayTeam?.id) teamIds.add(m.awayTeam.id); }
  const rosters = await getTeamRosters([...teamIds]);
  const myTeams = new Set<string>(), followPlayerTeams = new Set<string>();
  for (const [teamId, players] of rosters) {
    if (myPlayerId && players.includes(myPlayerId)) myTeams.add(teamId);
    if (players.some((p) => followPlayers.has(p))) followPlayerTeams.add(teamId);
  }
  const myTours = new Set(tournaments.filter((t) => myPlayerId && t.hostIds?.includes(myPlayerId)).map((t) => t.id));

  const isMine = (m: Match) =>
    !!(myPlayerId && (m.hostIds?.includes(myPlayerId) || m.scorerId === myPlayerId || m.scorerIds?.includes(myPlayerId))) ||
    (!!m.homeTeam && myTeams.has(m.homeTeam.id)) || (!!m.awayTeam && myTeams.has(m.awayTeam.id)) ||
    (!!m.tournamentId && myTours.has(m.tournamentId));
  const isFollowed = (m: Match) =>
    (!!m.tournamentId && followTours.has(m.tournamentId)) ||
    (!!m.homeTeam && (followTeams.has(m.homeTeam.id) || followPlayerTeams.has(m.homeTeam.id))) ||
    (!!m.awayTeam && (followTeams.has(m.awayTeam.id) || followPlayerTeams.has(m.awayTeam.id)));

  return { mine: matches.filter(isMine), feed: matches.filter((m) => isMine(m) || isFollowed(m)) };
}

/** House-level teams (one per house, across sports) — the unit for follows,
 *  team profiles and standings. Derived from the match schedule so ids match. */
export async function getTeamSummaries(): Promise<TeamSummary[]> {
  const matches = await getMatches();
  const map = new Map<string, TeamSummary>();
  for (const m of matches) {
    for (const t of [m.homeTeam, m.awayTeam]) {
      const ts = map.get(t.id) ?? { id: t.id, name: t.name, colorHex: t.colorHex, sports: [] };
      if (!ts.sports.includes(m.sport)) ts.sports.push(m.sport);
      map.set(t.id, ts);
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getTeamSummary(id: string): Promise<TeamSummary | null> {
  const all = await getTeamSummaries();
  const exact = all.find((t) => t.id === id);
  if (exact) return exact;
  // Two id spaces exist: match data keys a team by its raw id, while the team
  // pickers mint a per-sport id (`${sport}-${shortName}`, see demoStore
  // deriveTeams). Resolve that alias so a team opened from the Teams screen
  // finds its profile instead of hanging on "loading".
  const matches = await getMatches();
  for (const m of matches) {
    for (const t of [m.homeTeam, m.awayTeam]) {
      if (`${m.sport}-${t.shortName}` === id) return all.find((s) => s.id === t.id) ?? null;
    }
  }
  // A team that hasn't played yet (just created) isn't in any match — read the
  // team itself, so its profile and squad page open (and players can be added).
  const team = (await getTeams()).find((t) => t.id === id);
  return team ? { id: team.id, name: team.name, colorHex: team.colorHex, sports: [team.sport] } : null;
}

export async function getTeams(sport?: SportId): Promise<Team[]> {
  if (!isSupabaseConfigured || !supabase) {
    return sport ? demo.teams.filter((t) => t.sport === sport) : demo.teams;
  }
  let q = supabase.from('teams').select('id,name,short_name,sport,color_hex,org_id,roster').order('name');
  if (sport) q = q.eq('sport', sport);
  const { data, error } = await q;
  if (error || !data) return [];
  return (data as TeamRow[]).map(toTeam);
}

/** A team's captain & vice-captain (responsible for the matchday squad). */
export async function getTeamLeaders(teamId: string): Promise<TeamLeadership> {
  if (!isSupabaseConfigured || !supabase) {
    const l = demo.teamLeaders[teamId] ?? {};
    return { ...l, adminIds: l.adminIds ?? [] };
  }
  // admin_ids arrives with migration 0042 — before it, adminIds stays undefined.
  const full = await supabase.from('teams').select('captain_id, vice_captain_id, admin_ids').eq('id', teamId).maybeSingle();
  if (!full.error) {
    const d = full.data as { captain_id: string | null; vice_captain_id: string | null; admin_ids: string[] | null } | null;
    return { captainId: d?.captain_id ?? undefined, viceCaptainId: d?.vice_captain_id ?? undefined, adminIds: d ? (d.admin_ids ?? []) : undefined };
  }
  const { data } = await supabase.from('teams').select('captain_id, vice_captain_id').eq('id', teamId).maybeSingle();
  return { captainId: data?.captain_id ?? undefined, viceCaptainId: data?.vice_captain_id ?? undefined };
}

/** A team change the server refused (not a captain / VC / admin of it). */
export class TeamPermissionError extends Error {
  constructor() { super('Only this team’s captain, vice-captain or admins can change that.'); this.name = 'TeamPermissionError'; }
}

/** Throw for a refused team write: RLS denies an UPDATE silently (no error, 0
 *  rows); the guard trigger raises 42501. `expectRows` is false for deletes,
 *  where 0 rows can simply mean "nothing to delete". */
function assertTeamWrite(res: { error: { code?: string; message: string } | null; data?: unknown[] | null }, expectRows = true): void {
  if (res.error?.code === '42501') throw new TeamPermissionError();
  if (res.error) throw new Error(res.error.message);
  if (expectRows && (!res.data || res.data.length === 0)) throw new TeamPermissionError();
}

/** May the current user manage this team's squad? The server decides
 *  (`can_manage_team`); the local rule covers demo mode and RPC failures. */
export async function canManageTeam(teamId: string, ctx: { profileId?: string; myPlayerId?: string | null; role?: Role; isCaptainStore?: boolean; isClubAdmin?: boolean }): Promise<boolean> {
  const local = async () => canManageTeamLocal({ ...ctx, leaders: await getTeamLeaders(teamId) });
  if (!isSupabaseConfigured || !supabase) return local();
  const { data, error } = await supabase.rpc('can_manage_team', { p_team: teamId });
  if (error) return local();
  return data === true;
}

export async function setTeamLeaders(teamId: string, leaders: TeamLeadership): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    demoSetTeamLeaders(teamId, leaders);
    return;
  }
  assertTeamWrite(await supabase.from('teams').update({ captain_id: leaders.captainId ?? null, vice_captain_id: leaders.viceCaptainId ?? null }).eq('id', teamId).select('id'));
}

/* ---------------- Team edit / admins / delete (parity #10, 0042) ----------- */

/** The database predates the migration a feature needs. The UI shows the muted
 *  line "Needs the latest database update" (the error's message) and hides only
 *  that affordance. Test with `isNeedsDbUpdate(e)`. */
export class NeedsDbUpdateError extends Error {
  constructor() { super('Needs the latest database update'); this.name = 'NeedsDbUpdateError'; }
}
export const isNeedsDbUpdate = (e: unknown): e is NeedsDbUpdateError => e instanceof NeedsDbUpdateError;

/** Missing column (42703 / PGRST204), function (42883 / PGRST202) or table (42P01 / PGRST205). */
const isMissingSchema = (err: { code?: string } | null | undefined): boolean =>
  !!err && ['42703', 'PGRST204', '42883', 'PGRST202', '42P01', 'PGRST205'].includes(err.code ?? '');

export interface TeamPatch { name?: string; shortName?: string; colorHex?: string | null; logoUrl?: string | null; city?: string | null }

/** Edit a team's identity. Throws TeamPermissionError when the server refuses
 *  (not a manager / 0 rows), NeedsDbUpdateError when logoUrl / city are passed
 *  before migration 0042 (name / short / colour still work pre-migration). */
export async function updateTeam(teamId: string, patch: TeamPatch): Promise<void> {
  if (patch.name !== undefined && !patch.name.trim()) throw new Error('Give the team a name.');
  const name = patch.name?.trim();
  const shortName = patch.shortName?.trim().toUpperCase();
  if (patch.shortName !== undefined && !shortName) throw new Error('Give the team a short name.');
  const city = patch.city === undefined ? undefined : (patch.city?.trim() || null);
  if (!isSupabaseConfigured || !supabase) {
    const t = demo.teams.find((x) => x.id === teamId);
    if (!t) throw new Error('Team not found.');
    if (name !== undefined) t.name = name;
    if (shortName !== undefined) t.shortName = shortName;
    if (patch.colorHex !== undefined) t.colorHex = patch.colorHex ?? undefined;
    if (patch.logoUrl !== undefined) t.logoUrl = patch.logoUrl ?? undefined;
    if (city !== undefined) t.city = city ?? undefined;
    return;
  }
  if (patch.logoUrl !== undefined) assertPersistable(patch.logoUrl);
  const row: Record<string, unknown> = {};
  if (name !== undefined) row.name = name;
  if (shortName !== undefined) row.short_name = shortName;
  if (patch.colorHex !== undefined) row.color_hex = patch.colorHex;
  if (patch.logoUrl !== undefined) row.logo_url = patch.logoUrl;
  if (city !== undefined) row.city = city;
  if (!Object.keys(row).length) return;
  const res = await supabase.from('teams').update(row).eq('id', teamId).select('id');
  if (isMissingSchema(res.error) && ('logo_url' in row || 'city' in row)) throw new NeedsDbUpdateError();
  assertTeamWrite(res);
}

export interface TeamDetails {
  /** false ⇒ the database predates 0042: hide logo / city / Make admin */
  supported: boolean;
  logoUrl?: string;
  city?: string;
  /** undefined pre-migration */
  adminIds?: string[];
}

/** A team's logo, city and admins. Never throws: pre-0042 (or on any read
 *  error) it returns { supported: false }. */
export async function getTeamDetails(teamId: string): Promise<TeamDetails> {
  if (!isSupabaseConfigured || !supabase) {
    const t = demo.teams.find((x) => x.id === teamId);
    return { supported: true, logoUrl: t?.logoUrl, city: t?.city, adminIds: demo.teamLeaders[teamId]?.adminIds ?? [] };
  }
  const { data, error } = await supabase.from('teams').select('logo_url, city, admin_ids').eq('id', teamId).maybeSingle();
  if (error) return { supported: false };
  const d = data as { logo_url: string | null; city: string | null; admin_ids: string[] | null } | null;
  return { supported: true, logoUrl: d?.logo_url ?? undefined, city: d?.city ?? undefined, adminIds: d?.admin_ids ?? [] };
}

/** Replace a team's admins (player ids). Throws TeamPermissionError when
 *  refused, NeedsDbUpdateError pre-0042. */
export async function setTeamAdmins(teamId: string, adminIds: string[]): Promise<void> {
  const ids = [...new Set(adminIds)];
  if (!isSupabaseConfigured || !supabase) {
    demoSetTeamLeaders(teamId, { ...(demo.teamLeaders[teamId] ?? {}), adminIds: ids });
    return;
  }
  const res = await supabase.from('teams').update({ admin_ids: ids }).eq('id', teamId).select('id');
  if (isMissingSchema(res.error)) throw new NeedsDbUpdateError();
  assertTeamWrite(res);
}

/** Per team: is there a captain, and how many players are in its squad — for the
 *  next-step subtitle ("No captain yet" / "No players yet"). Never throws; a
 *  team that can't be read is reported as { hasCaptain: false, players: 0 }. */
export async function getTeamsSetup(teamIds: string[]): Promise<Record<string, { hasCaptain: boolean; players: number }>> {
  const out: Record<string, { hasCaptain: boolean; players: number }> = {};
  if (!teamIds.length) return out;
  const rosters = await getTeamRosters(teamIds);
  let captains = new Set<string>();
  if (!isSupabaseConfigured || !supabase) {
    captains = new Set(teamIds.filter((id) => !!demo.teamLeaders[id]?.captainId));
  } else {
    const { data } = await supabase.from('teams').select('id, captain_id').in('id', teamIds);
    captains = new Set(((data ?? []) as { id: string; captain_id: string | null }[]).filter((r) => r.captain_id).map((r) => r.id));
  }
  for (const id of teamIds) out[id] = { hasCaptain: captains.has(id), players: rosters.get(id)?.length ?? 0 };
  return out;
}

/** Delete a team outright — only when it has never been in a match. Throws
 *  'This team has matches…' otherwise, TeamPermissionError when refused. Removing
 *  a team from a tournament is removeTournamentTeam, not this. */
export async function deleteTeam(teamId: string): Promise<void> {
  const HAS_MATCHES = 'This team has matches, so it can’t be deleted. Remove it from the tournament instead.';
  if (!isSupabaseConfigured || !supabase) {
    if (demo.matches.some((m) => m.homeTeam?.id === teamId || m.awayTeam?.id === teamId)) throw new Error(HAS_MATCHES);
    demo.teams = demo.teams.filter((t) => t.id !== teamId);
    demo.tournamentTeams = demo.tournamentTeams.filter((r) => r.teamId !== teamId);
    delete demo.teamLeaders[teamId];
    return;
  }
  const { count, error } = await supabase.from('matches').select('id', { count: 'exact', head: true })
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`);
  if (error) throw new Error('Couldn’t check this team’s matches — try again.');
  if ((count ?? 0) > 0) throw new Error(HAS_MATCHES);
  assertTeamWrite(await supabase.from('teams').delete().eq('id', teamId).select('id'));
}

/* -------------------------------- Players ---------------------------------- */

interface PlayerRow {
  id: string;
  profile_id: string | null;
  full_name: string;
  jersey_no: number | null;
  sports: string[] | null;
  house_name: string | null;
  house_color: string | null;
  city: string | null;
  gender: string | null;
  bio: string | null;
  phone: string | null;
  email: string | null;
  phone_verified: boolean | null;
  email_verified: boolean | null;
  photo_url: string | null;
  sport_details: Player['sportDetails'] | null;
  dob?: string | null;
  guardian?: Player['guardian'] | null;
  verification?: Player['verification'] | null;
  reported_at?: string | null;
  /** players_view (migration 0026): derived age + privacy opt-ins */
  age?: number | null;
  show_phone?: boolean | null;
  show_email?: boolean | null;
  findable_by_contact?: boolean | null;
  guardian_linked?: boolean | null;
}
const toPlayer = (r: PlayerRow): Player => ({
  id: r.id,
  profileId: r.profile_id ?? undefined,
  fullName: r.full_name,
  jerseyNo: r.jersey_no ?? undefined,
  sports: (r.sports ?? []) as SportId[],
  houseName: r.house_name ?? undefined,
  houseColor: r.house_color ?? undefined,
  city: r.city ?? undefined,
  gender: r.gender ?? undefined,
  bio: r.bio ?? undefined,
  phone: r.phone ?? undefined,
  email: r.email ?? undefined,
  phoneVerified: r.phone_verified ?? undefined,
  emailVerified: r.email_verified ?? undefined,
  photoUrl: r.photo_url ?? undefined,
  sportDetails: r.sport_details ?? undefined,
  dob: r.dob ?? undefined,
  guardian: r.guardian ?? undefined,
  verification: r.verification ?? undefined,
  reported: r.reported_at ? true : undefined,
  age: r.age ?? undefined,
  showPhone: r.show_phone ?? undefined,
  showEmail: r.show_email ?? undefined,
  findableByContact: r.findable_by_contact ?? undefined,
  guardianLinked: r.guardian_linked ?? undefined,
});

/** Live player reads go through `players_view` (migration 0026): phone / email /
 *  DOB / guardian contact come back only when the viewer may see them (themselves,
 *  support, an opted-in adult's public contact, or a provisional teammate's number
 *  for their team's managers) — otherwise null, with a derived `age` + guardian
 *  status flags so eligibility checks still work. The base `players` table no
 *  longer lets clients read those columns at all; WRITES still go to `players`. */
const PLAYERS_READ = 'players_view';
const PLAYER_SELECT = 'id, profile_id, full_name, jersey_no, sports, house_name, house_color, city, gender, bio, phone, email, phone_verified, email_verified, photo_url, sport_details, dob, guardian, verification, age, show_phone, show_email, guardian_linked, findable_by_contact';

export async function getPlayers(): Promise<Player[]> {
  if (!isSupabaseConfigured || !supabase) return demo.players;
  const { data, error } = await supabase.from(PLAYERS_READ).select(PLAYER_SELECT).order('full_name');
  if (error || !data) return [];
  return (data as PlayerRow[]).map(toPlayer);
}

export async function getPlayer(id: string): Promise<Player | null> {
  if (!isSupabaseConfigured || !supabase) return demo.players.find((p) => p.id === id) ?? null;
  const { data, error } = await supabase.from(PLAYERS_READ).select(PLAYER_SELECT).eq('id', id).single();
  if (error || !data) return null;
  return toPlayer(data as PlayerRow);
}

interface StatLineRow {
  id: string;
  match_id: string | null;
  /** field events (golf rounds) — migration 0028 */
  event_id?: string | null;
  player_id: string;
  sport: string;
  stats: Record<string, number> | null;
  won: boolean | null;
  /** SD-11 — migration 0050; absent before it */
  result?: LineResult | null;
  opponent: string | null;
  recorded_at: string | null;
}
function rowToStatLine(r: StatLineRow): StatLine {
  return {
    id: r.id,
    matchId: r.match_id ?? '',
    eventId: r.event_id ?? undefined,
    playerId: r.player_id,
    sport: r.sport as SportId,
    stats: r.stats ?? {},
    won: r.won ?? false,
    ...(r.result ? { result: r.result } : {}),
    opponent: r.opponent ?? undefined,
    date: r.recorded_at ?? undefined,
  };
}
const STAT_LINE_COLS = 'id, match_id, event_id, player_id, sport, stats, won, opponent, recorded_at';
/** SD-11: false once the database says `stat_lines.result` doesn't exist yet
 *  (before migration 0050) — reads and writes then leave it out. */
let statLineResultColumn = true;
/** Read stat lines with `result` when the column exists; before migration 0050
 *  the same query runs without it (the result is then derived at read time). */
async function selectStatLines(
  run: (cols: string) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>,
): Promise<{ data: StatLineRow[] | null; error: { code?: string; message?: string } | null }> {
  if (statLineResultColumn) {
    const res = await run(`${STAT_LINE_COLS}, result`);
    if (!isMissingResultColumn(res.error)) return res as { data: StatLineRow[] | null; error: null };
    statLineResultColumn = false;
  }
  return (await run(STAT_LINE_COLS)) as { data: StatLineRow[] | null; error: null };
}
const isMissingResultColumn = (err: { code?: string; message?: string } | null | undefined): boolean =>
  !!err && (['42703', 'PGRST204'].includes(err.code ?? '') || /column .*result/i.test(err.message ?? ''));
export async function getPlayerStatLines(playerId: string): Promise<StatLine[]> {
  if (!isSupabaseConfigured || !supabase) {
    return demo.statLines.filter((l) => l.playerId === playerId);
  }
  const { data, error } = await selectStatLines((cols) => supabase!.from('stat_lines').select(cols).eq('player_id', playerId));
  if (error || !data) return [];
  return (data as StatLineRow[]).map(rowToStatLine);
}

/** All stat lines recorded for one match — powers the match Summary ratings. */
export async function getMatchStatLines(matchId: string): Promise<StatLine[]> {
  if (!isSupabaseConfigured || !supabase) {
    return demo.statLines.filter((l) => l.matchId === matchId);
  }
  const { data, error } = await selectStatLines((cols) => supabase!.from('stat_lines').select(cols).eq('match_id', matchId));
  if (error || !data) return [];
  return (data as StatLineRow[]).map(rowToStatLine);
}

/** SD-24 — every stat line of a set of matches (one query): a doubles
 *  career pairs each line with its partner's line of the same match + side. */
export async function getStatLinesForMatches(matchIds: string[]): Promise<StatLine[]> {
  if (matchIds.length === 0) return [];
  if (!isSupabaseConfigured || !supabase) {
    const set = new Set(matchIds);
    return demo.statLines.filter((l) => set.has(l.matchId));
  }
  const { data, error } = await selectStatLines((cols) => supabase!.from('stat_lines').select(cols).in('match_id', matchIds));
  if (error || !data) return [];
  return (data as StatLineRow[]).map(rowToStatLine);
}

/** SD-24 — id → full name for a few players (partner rows), one query. */
export async function getPlayerNames(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  if (!isSupabaseConfigured || !supabase) {
    const set = new Set(ids);
    return new Map(demo.players.filter((p) => set.has(p.id)).map((p) => [p.id, p.fullName]));
  }
  const { data, error } = await supabase.from(PLAYERS_READ).select('id, full_name').in('id', ids);
  if (error || !data) return new Map();
  return new Map((data as { id: string; full_name: string }[]).map((r) => [r.id, r.full_name]));
}

/** Server-side player search: filtering happens in the DB (or the demo store),
 *  not by loading every player into the client. */
/** Discover filters. Every field is optional; arrays mean "any of". */
export interface PlayerSearch {
  query?: string;
  sports?: SportId[];
  cities?: string[];
  gender?: 'male' | 'female';
  /** age band: under 14 / 16 / 18, 18–34, 35+ */
  age?: 'u14' | 'u16' | 'u18' | 'adult' | '35plus';
  verifiedOnly?: boolean;
}
const AGE_RANGE: Record<NonNullable<PlayerSearch['age']>, [number, number]> = {
  u14: [0, 13], u16: [0, 15], u18: [0, 17], adult: [18, 34], '35plus': [35, 200],
};

export { looksLikeContact } from '../core/contactQuery';
import { looksLikeContact } from '../core/contactQuery';

const sameCity = (a?: string, b?: string) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

export async function searchPlayers(opts: PlayerSearch): Promise<Player[]> {
  const q = (opts.query ?? '').trim();
  const contact = looksLikeContact(q);
  const ageOk = (age?: number) => {
    if (!opts.age) return true;
    if (age === undefined) return false;
    const [lo, hi] = AGE_RANGE[opts.age];
    return age >= lo && age <= hi;
  };
  if (!isSupabaseConfigured || !supabase) {
    const digits = q.replace(/\D/g, '');
    return demo.players.filter((p) => {
      const nameHit = !q || p.fullName.toLowerCase().includes(q.toLowerCase());
      const contactHit = contact === 'email' ? p.email?.toLowerCase() === q.toLowerCase()
        : contact === 'phone' ? !!p.phone && p.phone.replace(/\D/g, '').endsWith(digits.slice(-10)) : false;
      return (contact ? contactHit : nameHit)
        && (!opts.sports?.length || opts.sports.some((s) => p.sports.includes(s)))
        && (!opts.cities?.length || opts.cities.some((c) => sameCity(c, p.city)))
        && (!opts.gender || p.gender === opts.gender)
        && ageOk(ageOf(p))
        && (!opts.verifiedOnly || p.verification?.status === 'approved');
    });
  }
  let ids: string[] | null = null;
  if (contact) {
    const { data, error } = await withTimeout(supabase.rpc('discover_player_by_contact', { p_query: q }));
    if (error) throw new Error(error.message.includes('Too many') ? 'Too many contact searches — try again in an hour.' : 'Couldn’t search by contact just now.');
    ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
    if (!ids.length) return [];
  }
  let req = supabase.from(PLAYERS_READ).select(PLAYER_SELECT).order('full_name').limit(50);
  if (ids) req = req.in('id', ids);
  else if (q) req = req.ilike('full_name', `%${q}%`);
  if (opts.sports?.length) req = req.overlaps('sports', opts.sports);
  if (opts.cities?.length) req = req.or(opts.cities.map((c) => `city.ilike.${c.replace(/[,()]/g, ' ').trim()}`).join(','));
  if (opts.gender) req = req.eq('gender', opts.gender);
  if (opts.age) { const [lo, hi] = AGE_RANGE[opts.age]; req = req.gte('age', lo).lte('age', hi); }
  if (opts.verifiedOnly) req = req.eq('verification->>status', 'approved');
  const { data, error } = await req;
  if (error || !data) return [];
  return (data as PlayerRow[]).map(toPlayer);
}

/* ------------------------- Global search (parity #22) ------------------------
 * One box over players, teams, matches and tournaments. `ilike` per type, 20
 * hits each, every list ranked by `rankByName`. Teams, matches and tournaments
 * are publicly readable; players stay on the privacy-safe players view. */

/** Demo team rows keyed like match data: the mock gives each house one id across
 *  sports, so that id doubles as the club id (one hit per house, and its match
 *  ids line up). Teams that haven't played keep their own id. */
function demoSearchTeamRows(): Team[] {
  const raw = new Map<string, Team>();
  for (const m of demo.matches) for (const t of [m.homeTeam, m.awayTeam]) if (t) raw.set(`${t.sport}-${t.shortName}`, t);
  return demo.teams.map((t) => {
    const r = raw.get(t.id);
    return r ? { ...t, id: r.id, clubId: t.clubId ?? r.id } : t;
  });
}

const TEAM_SEARCH_COLS = 'id,name,short_name,sport,color_hex,org_id';

/** Team rows whose name or short name contains `q`, best-ranked first. */
async function searchTeamRows(q: string, limit: number): Promise<Team[]> {
  const s = orSafe(q);
  if (!s) return [];
  const names = (t: Team) => [t.name, t.shortName];
  if (!isSupabaseConfigured || !supabase) return filterByName(demoSearchTeamRows(), s, names).slice(0, limit);
  const run = (cols: string) => supabase!.from('teams').select(cols)
    .or(`name.ilike.%${s}%,short_name.ilike.%${s}%`).order('name').limit(limit);
  // club_id arrives with migration 0018 — read it when it's there, so club teams collapse.
  let res = await run(`${TEAM_SEARCH_COLS},club_id`);
  if (res.error) res = await run(TEAM_SEARCH_COLS);
  if (res.error) throw new Error('Couldn’t search teams just now.');
  return rankByName(((res.data ?? []) as unknown as TeamRow[]).map(toTeam), s, names);
}

/** Teams matching `q` (name or short name). A Club's per-sport rows collapse
 *  into one hit listing every sport. */
export async function searchTeams(q: string, limit = SEARCH_LIMIT): Promise<TeamHit[]> {
  if (!isSearchable(q) || looksLikeContact(q)) return [];
  return collapseTeams(await searchTeamRows(q, SEARCH_ID_CAP)).slice(0, limit);
}

/** Tournaments matching `q` by name or host, newest first, never a deleted one. */
export async function searchTournaments(q: string, limit = SEARCH_LIMIT): Promise<Tournament[]> {
  const s = orSafe(q);
  if (!isSearchable(q) || looksLikeContact(q) || !s) return [];
  const names = (t: Tournament) => [t.name, t.hostName];
  if (!isSupabaseConfigured || !supabase) {
    const newest = [...demo.tournaments].sort((x, y) => (y.startDate ?? '').localeCompare(x.startDate ?? ''));
    return filterByName(liveOnly(newest), s, names).slice(0, limit);
  }
  const { data, error } = await withTournamentCols<any[]>((cols) => supabase!.from('tournaments').select(cols)
    .or(`name.ilike.%${s}%,host_name.ilike.%${s}%`).order('start_date', { ascending: false }).limit(SEARCH_ID_CAP));
  if (error) throw new Error('Couldn’t search tournaments just now.');
  return rankByName(liveOnly((data ?? []).map(toTournament)), s, names).slice(0, limit);
}

/** Matches by team ("Red", or "Red vs Blue" for that pairing only) or by
 *  tournament name. Newest first; a deleted tournament's matches never show. */
export async function searchMatches(q: string, limit = SEARCH_LIMIT): Promise<Match[]> {
  if (!isSearchable(q) || looksLikeContact(q)) return [];
  const [a, b] = parseVsQuery(q);
  const [aRows, bRows, tours] = await Promise.all([
    searchTeamRows(a, SEARCH_ID_CAP),
    b ? searchTeamRows(b, SEARCH_ID_CAP) : Promise.resolve([] as Team[]),
    // "A vs B" is a pairing — tournament names don't widen it.
    b ? Promise.resolve([] as Tournament[]) : searchTournaments(a, SEARCH_ID_CAP),
  ]);
  const aIds = capIds(aRows.map((t) => t.id));
  const bIds = b ? capIds(bRows.map((t) => t.id)) : undefined;
  const tIds = capIds(tours.map((t) => t.id));
  if (b && (!aIds.length || !bIds!.length)) return [];
  if (!aIds.length && !tIds.length) return [];
  const deleted = await deletedTournamentIds();
  let pool: Match[];
  if (!isSupabaseConfigured || !supabase) pool = demo.matches;
  else {
    const list = (ids: string[]) => `(${ids.map((id) => `"${id}"`).join(',')})`;
    const ors = aIds.length ? [`home_team_id.in.${list(aIds)}`, `away_team_id.in.${list(aIds)}`] : [];
    if (tIds.length) ors.push(`tournament_id.in.${list(tIds)}`);
    const { data, error } = await withMatchCols<unknown[]>((cols) => supabase!.from('matches').select(cols)
      .or(ors.join(',')).order('starts_at', { ascending: false }).limit(200));
    if (error) throw new Error('Couldn’t search matches just now.');
    pool = ((data ?? []) as unknown as MatchRow[]).map(toMatch);
  }
  const hits = selectMatchHits(pool, { a: aIds, b: bIds, tournamentIds: tIds, deletedTournamentIds: deleted });
  return rankByName(hits, a, matchNames).slice(0, limit);
}

/** Every type at once. A failed type contributes [] (and its message in
 *  `errors`) — the others still show. Under 2 letters searches nothing, unless
 *  it's a whole phone number or email (players only). */
export async function searchAll(q: string, filters: Omit<PlayerSearch, 'query'> = {}): Promise<SearchResults<Player> & { errors: Partial<Record<SearchKind, string>> }> {
  const empty = { players: [], teams: [], matches: [], tournaments: [], errors: {} };
  if (!isSearchable(q)) return empty;
  const query = q.trim();
  const settled = await Promise.allSettled([
    searchPlayers({ ...filters, query }),
    searchTeams(query),
    searchMatches(query),
    searchTournaments(query),
  ]);
  const errors: Partial<Record<SearchKind, string>> = {};
  const pick = <T,>(i: number, kind: SearchKind): T[] => {
    const r = settled[i];
    if (r.status === 'fulfilled') return r.value as T[];
    errors[kind] = r.reason instanceof Error ? r.reason.message : 'Search failed';
    return [];
  };
  const out = narrowBySports<Player>({
    players: rankByName(pick<Player>(0, 'players'), query, (p) => p.fullName),
    teams: pick<TeamHit>(1, 'teams'),
    matches: pick<Match>(2, 'matches'),
    tournaments: pick<Tournament>(3, 'tournaments'),
  }, filters.sports);
  return { ...out, errors };
}

/** Cities for the discovery filter, most players first. Case/spacing variants
 *  ("hyderabad", "Hyderabad ") merge into one, shown in Title Case. */
export async function getCities(): Promise<string[]> {
  let raw: (string | null | undefined)[];
  if (!isSupabaseConfigured || !supabase) raw = demo.players.map((p) => p.city);
  else {
    const { data, error } = await supabase.from('players').select('city').not('city', 'is', null).limit(5000);
    if (error || !data) return [];
    raw = data.map((r) => r.city as string | null);
  }
  const counts = new Map<string, { label: string; n: number }>();
  for (const c of raw) {
    const t = (c ?? '').trim().replace(/\s+/g, ' ');
    if (!t) continue;
    const key = t.toLowerCase();
    const label = t.replace(/\b\w/g, (ch) => ch.toUpperCase());
    const cur = counts.get(key);
    counts.set(key, { label: cur?.label ?? label, n: (cur?.n ?? 0) + 1 });
  }
  return [...counts.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label)).map((c) => c.label);
}

/** Stat lines for a specific set of players (one query, not all of them). */
export async function getStatLinesForPlayers(playerIds: string[]): Promise<StatLine[]> {
  if (playerIds.length === 0) return [];
  if (!isSupabaseConfigured || !supabase) {
    const set = new Set(playerIds);
    return demo.statLines.filter((l) => set.has(l.playerId));
  }
  const { data, error } = await selectStatLines((cols) => supabase!.from('stat_lines').select(cols).in('player_id', playerIds));
  if (error || !data) return [];
  return (data as StatLineRow[]).map(rowToStatLine);
}

export async function getAllStatLines(): Promise<StatLine[]> {
  // Contested performances are held OUT of cross-match aggregates (profiles,
  // leaderboards, discover) while a dispute is open — they don't count for anyone
  // until the captains agree who actually played. (The live match still shows them
  // masked as "X".)
  const heldOut = (lines: StatLine[], openKeys: Set<string>) =>
    openKeys.size === 0 ? lines : lines.filter((l) => !openKeys.has(`${l.matchId}:${l.playerId}`));
  if (!isSupabaseConfigured || !supabase) {
    const openKeys = new Set(demo.disputes.filter((d) => d.status === 'open').map((d) => `${d.matchId}:${d.playerId}`));
    return heldOut(demo.statLines, openKeys);
  }
  const [{ data, error }, dis] = await Promise.all([
    selectStatLines((cols) => supabase!.from('stat_lines').select(cols)),
    supabase.from('match_disputes').select('match_id, player_id').eq('status', 'open'),
  ]);
  if (error || !data) return [];
  const openKeys = new Set((dis.data ?? []).map((r: { match_id: string; player_id: string }) => `${r.match_id}:${r.player_id}`));
  const lines = (data as StatLineRow[]).map(rowToStatLine);
  return heldOut(lines, openKeys);
}

/* ----------------------- Team invites & captaincy -------------------------- */

/** Create a shareable invite token for a captain/coach to claim a team. */
export async function createInvite(teamId: string, teamName: string, role: 'captain' | 'coach' = 'captain'): Promise<TeamInvite> {
  if (!isSupabaseConfigured || !supabase) {
    const invite: TeamInvite = { token: nextInviteToken(), teamId, teamName, role };
    addDemoInvite(invite);
    return invite;
  }
  // Live: the server mints a random, unguessable token and checks the caller
  // manages the team (migration 0025).
  const { data, error } = await supabase.rpc('create_team_invite', { p_team: teamId, p_role: role });
  if (error || !data) throw new Error(error?.message ?? 'Could not create the invite');
  return { token: data as string, teamId, teamName, role };
}

/** Resolve an invite token to its team (or null if the code is invalid). Live
 *  lookups are rate-limited server-side, so this throws once a user hits the cap. */
export async function getInvite(token: string): Promise<TeamInvite | null> {
  const t = token.trim().toUpperCase();
  if (!isSupabaseConfigured || !supabase) return demo.invites[t] ?? null;
  const { data, error } = await supabase.rpc('get_team_invite', { p_token: t });
  if (error) throw new Error(error.message);
  const row = (data as { team_id: string; role: 'captain' | 'coach' }[] | null)?.[0];
  if (!row) return null;
  const team = await getTeamSummary(row.team_id);
  return { token: t, teamId: row.team_id, teamName: team?.name ?? 'Team', role: row.role };
}

/** Claim an invite: record the signed-in user as captain/coach of the team. Live
 *  invites are single-use — the server consumes the token as it records the claim. */
export async function claimInvite(token: string, profileId?: string): Promise<TeamInvite | null> {
  if (!isSupabaseConfigured || !supabase) {
    const invite = await getInvite(token);
    if (!invite) return null;
    addDemoCaptainTeam(invite.teamId);
    return invite;
  }
  if (!profileId) return null;
  const t = token.trim().toUpperCase();
  const { data, error } = await supabase.rpc('claim_team_invite', { p_token: t });
  if (error) throw new Error(error.message);
  const row = (data as { team_id: string; role: 'captain' | 'coach' }[] | null)?.[0];
  if (!row) return null;
  const team = await getTeamSummary(row.team_id);
  return { token: t, teamId: row.team_id, teamName: team?.name ?? 'Team', role: row.role };
}

/** Teams the signed-in user captains. */
export async function getCaptainTeams(profileId?: string): Promise<string[]> {
  if (!isSupabaseConfigured || !supabase) return [...demo.captainTeams];
  if (!profileId) return [];
  const { data } = await supabase.from('team_staff').select('team_id').eq('profile_id', profileId).eq('role', 'captain');
  return (data ?? []).map((r) => r.team_id as string);
}

/* --------------------------- Match event log ------------------------------- */

/** Replayable scoring log for a match (newest reducers rebuild state from it). */
export async function getMatchEvents(matchId: string): Promise<MatchEventRecord[]> {
  if (!isSupabaseConfigured || !supabase) return demo.matchEvents[matchId] ?? [];
  const read = (cols: string) => supabase!.from('match_events').select(cols).eq('match_id', matchId).order('seq', { ascending: true });
  let { data, error } = await read('seq, type, side, payload, attribution, created_at, client_id');
  // Before migration 0039 there's no client_id column — read without it.
  if (error && /client_id/.test(error.message)) ({ data, error } = await read('seq, type, side, payload, attribution, created_at'));
  if (error || !data) return [];
  return (data as unknown as (MatchEventRecord & { client_id?: string | null })[]).map(({ client_id, ...e }) => ({ ...e, clientId: client_id ?? undefined }));
}

/* ------------------------- Scoring lock (parity #03) ----------------------- */
// One active scorer at a time (migration 0039). scorer_ids = who MAY score; the
// lock = who IS scoring (player + device). Demo mode keeps locks in memory; the
// dev hook `__sportfolioScoring.takeover(matchId, name)` fakes another device.

const demoLocks: Record<string, { holderId: string | null; holderName: string | null; device: string | null; at: string }> = {};
let lockRpcMissing = false; // pre-migration database → today's behaviour

const isMissingFn = (e?: { code?: string; message?: string } | null) =>
  !!e && (e.code === 'PGRST202' || e.code === '42883' || /could not find the function/i.test(e.message ?? ''));

export async function getScoringLock(matchId: string): Promise<ScoringLock> {
  if (!isSupabaseConfigured || !supabase) {
    const l = demoLocks[matchId];
    return { supported: true, holderId: l?.holderId ?? null, holderName: l?.holderName ?? null, device: l?.device ?? null, at: l?.at ?? null };
  }
  const { data, error } = await supabase.from('matches').select('active_scorer_id, active_scorer_device, active_scorer_at').eq('id', matchId).maybeSingle();
  if (error) return { supported: false };
  const row = data as { active_scorer_id: string | null; active_scorer_device: string | null; active_scorer_at: string | null } | null;
  let holderName: string | null = null;
  if (row?.active_scorer_id) {
    const { data: p } = await supabase.from(PLAYERS_READ).select('full_name').eq('id', row.active_scorer_id).maybeSingle();
    holderName = (p as { full_name?: string } | null)?.full_name ?? null;
  }
  return { supported: true, holderId: row?.active_scorer_id ?? null, holderName, device: row?.active_scorer_device ?? null, at: row?.active_scorer_at ?? null };
}

/** Take the lock if it's free or already mine; `takeover` takes it from whoever
 *  holds it. Returns who holds it when refused. */
export async function claimScoring(matchId: string, opts: { takeover?: boolean; playerId?: string | null; playerName?: string } = {}): Promise<{ ok: boolean; holderId?: string; holderName?: string; at?: string }> {
  const device = await getDeviceId();
  if (!isSupabaseConfigured || !supabase) {
    const l = demoLocks[matchId];
    if (!l?.holderId || l.device === device || opts.takeover) {
      demoLocks[matchId] = { holderId: opts.playerId ?? 'me', holderName: opts.playerName ?? 'You', device, at: new Date().toISOString() };
      // As claim_scoring does: whoever takes the lock (e.g. a host scoring by
      // default) joins the allowed scorer list.
      const m = demo.matches.find((x) => x.id === matchId);
      if (m && opts.playerId) {
        const ids = m.scorerIds?.length ? m.scorerIds : m.scorerId ? [m.scorerId] : [];
        if (!ids.includes(opts.playerId)) { m.scorerIds = [...ids, opts.playerId]; m.scorerId = m.scorerIds[0]; }
      }
      return { ok: true, holderId: opts.playerId ?? undefined };
    }
    return { ok: false, holderId: l.holderId, holderName: l.holderName ?? undefined, at: l.at };
  }
  const { data, error } = await supabase.rpc('claim_scoring', { p_match: matchId, p_device: device, p_takeover: !!opts.takeover });
  if (isMissingFn(error)) { lockRpcMissing = true; return { ok: true }; }
  if (error) throw new Error(error.message);
  const r = data as { ok: boolean; holder_id?: string; holder_name?: string; at?: string };
  return { ok: r.ok, holderId: r.holder_id, holderName: r.holder_name, at: r.at };
}

/** Give scoring to another allowed scorer (they take over on their next tap). */
export async function handoverScoring(matchId: string, toPlayerId: string, toName?: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    demoLocks[matchId] = { holderId: toPlayerId, holderName: toName ?? null, device: null, at: new Date().toISOString() };
    return;
  }
  const { error } = await supabase.rpc('handover_scoring', { p_match: matchId, p_to: toPlayerId });
  if (error) throw new Error(isMissingFn(error) ? 'Handing over needs a database update first.' : error.message);
}

export async function releaseScoring(matchId: string): Promise<void> {
  const device = await getDeviceId();
  if (!isSupabaseConfigured || !supabase) {
    if (demoLocks[matchId]?.device === device) delete demoLocks[matchId];
    return;
  }
  await supabase.rpc('release_scoring', { p_match: matchId, p_device: device });
}

if (typeof __DEV__ !== 'undefined' && __DEV__ && typeof window !== 'undefined') {
  (window as unknown as { __sportfolioScoring?: object }).__sportfolioScoring = {
    /** Pretend someone on another phone took over this match's scoring. */
    takeover(matchId: string, name = 'Another scorer') {
      demoLocks[matchId] = { holderId: 'demo-other', holderName: name, device: 'demo-other-device', at: new Date().toISOString() };
      return `${name} is now scoring ${matchId}`;
    },
    release(matchId: string) { delete demoLocks[matchId]; return 'lock cleared'; },
  };
}

/** Server timestamp of a match's first event = when scoring actually began (kickoff).
 *  Null if nothing scored yet. Used to gate the "restart within N minutes" window. */
export async function getMatchKickoffAt(matchId: string): Promise<number | null> {
  if (!isSupabaseConfigured || !supabase) {
    const first = (demo.matchEvents[matchId] ?? [])[0] as (MatchEventRecord & { created_at?: string }) | undefined;
    return first?.created_at ? new Date(first.created_at).getTime() : null;
  }
  const { data } = await supabase
    .from('match_events')
    .select('created_at')
    .eq('match_id', matchId)
    .order('seq', { ascending: true })
    .limit(1);
  const first = (data ?? [])[0] as { created_at?: string } | undefined;
  return first?.created_at ? new Date(first.created_at).getTime() : null;
}

/** Wipe a match back to "not started": delete its event log, blank its stat lines
 *  (no delete policy on stat_lines — an empty stats map contributes nothing), and
 *  reset the match row to scheduled. For the "started by mistake" restart; callers
 *  gate WHO may do it and the time window. */
export async function resetMatch(matchId: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    demo.matchEvents[matchId] = [];
    demo.statLines = demo.statLines.filter((l) => l.matchId !== matchId);
    const m = demo.matches.find((x) => x.id === matchId) as (Match & { potm?: unknown }) | undefined;
    if (m) {
      m.state = {}; m.status = 'scheduled'; m.winner = undefined; m.score = undefined;
      // Parity #13: everything derived goes too — result, POTM, break.
      m.result = undefined; m.walkover = undefined; m.onBreak = undefined; delete m.potm;
      delete demo.potm[matchId];
      if (m.format && '__break' in m.format) {
        const { __break: _b, ...rest } = m.format as Record<string, unknown>;
        m.format = (Object.keys(rest).length ? rest : undefined) as Match['format'];
      }
    }
    delete demoLocks[matchId];
    return;
  }
  // Back to not-started FIRST: that clears the scoring lock (migration 0039), so a
  // host who isn't the current scorer can still wipe the log.
  await supabase.from('matches').update({ state: {}, status: 'scheduled', winner: null, updated_at: new Date().toISOString() }).eq('id', matchId);
  // Parity #13 — clear what's derived from the play, each tolerant of a database
  // that lacks the column (result 0040, potm #21, lock 0039): a failed optional
  // update is ignored, never fatal.
  const clear = async (patch: Record<string, unknown>) => {
    try { await supabase!.from('matches').update(patch).eq('id', matchId); } catch { /* column absent */ }
  };
  await clear({ result: null });
  await clear({ potm: null });
  await clear({ active_scorer_id: null, active_scorer_device: null, active_scorer_at: null });
  const { data: f } = await supabase.from('matches').select('format').eq('id', matchId).maybeSingle();
  const fmt = (f?.format as Record<string, unknown> | null) ?? {};
  if ('__break' in fmt) {
    const { __break: _b, ...rest } = fmt;
    await supabase.from('matches').update({ format: rest }).eq('id', matchId);
  }
  await supabase.from('match_events').delete().eq('match_id', matchId);
  await supabase.from('stat_lines').update({ stats: {}, won: false }).eq('match_id', matchId);
  // SD-11: the line's result goes too (no-op before migration 0050 — no column).
  if (statLineResultColumn) {
    const { error } = await supabase.from('stat_lines').update({ result: null }).eq('match_id', matchId);
    if (isMissingResultColumn(error)) statLineResultColumn = false;
  }
}

/** When this match last saw scoring activity: its latest event, else the match
 *  row's own last update. Drives the "delete within 30 min" window (parity #13);
 *  the server re-checks it in the delete policy. Null if unknown. */
export async function getMatchLastActivityAt(matchId: string): Promise<number | null> {
  if (!isSupabaseConfigured || !supabase) {
    const evs = (demo.matchEvents[matchId] ?? []) as (MatchEventRecord & { created_at?: string })[];
    const last = evs.reduce<number | null>((mx, e) => {
      const t = e.created_at ? new Date(e.created_at).getTime() : NaN;
      return Number.isFinite(t) && (mx == null || t > mx) ? t : mx;
    }, null);
    if (last != null) return last;
    const m = demo.matches.find((x) => x.id === matchId) as (Match & { updatedAt?: string }) | undefined;
    return m?.updatedAt ? new Date(m.updatedAt).getTime() : null;
  }
  const { data } = await supabase.from('match_events').select('created_at').eq('match_id', matchId)
    .order('created_at', { ascending: false }).limit(1);
  const at = (data ?? [])[0] as { created_at?: string } | undefined;
  if (at?.created_at) return new Date(at.created_at).getTime();
  const { data: row } = await supabase.from('matches').select('updated_at').eq('id', matchId).maybeSingle();
  const u = (row as { updated_at?: string } | null)?.updated_at;
  return u ? new Date(u).getTime() : null;
}

/** Pause (or, with null, resume) play: writes `format.__break` like the
 *  `__walkover` precedent — no scoring event, so undo stays clean. Read back as
 *  `Match.onBreak`. Other format keys are kept. */
export async function setMatchBreak(matchId: string, info: { kind: string; note?: string } | null): Promise<void> {
  const value: MatchBreak | null = info
    ? { kind: info.kind as MatchBreak['kind'], ...(info.note?.trim() ? { note: info.note.trim() } : {}), since: new Date().toISOString() }
    : null;
  if (!isSupabaseConfigured || !supabase) {
    const m = demo.matches.find((x) => x.id === matchId);
    if (!m) return;
    const fmt = { ...((m.format as Record<string, unknown>) ?? {}) };
    if (value) fmt.__break = value; else delete fmt.__break;
    m.format = (Object.keys(fmt).length ? fmt : undefined) as Match['format'];
    m.onBreak = value ?? undefined;
    return;
  }
  const { data } = await supabase.from('matches').select('format').eq('id', matchId).maybeSingle();
  const fmt = { ...((data?.format as Record<string, unknown>) ?? {}) };
  if (value) fmt.__break = value; else delete fmt.__break;
  const { error } = await supabase.from('matches').update({ format: fmt }).eq('id', matchId);
  if (error) throw new Error(error.message);
}

/** Save one scoring event. The server numbers it (and ignores a retried
 *  clientId); only the scoring-lock holder may write while the match is played.
 *  THROWS on any failure, so the outbox keeps the tap instead of dropping it. */
export async function appendMatchEvent(matchId: string, rec: MatchEventRecord): Promise<void> {
  const device = await getDeviceId();
  if (!isSupabaseConfigured || !supabase) {
    const l = demoLocks[matchId];
    if (l?.holderId && l.device && l.device !== device) throw new Error('not_active_scorer');
    if (!l?.holderId) demoLocks[matchId] = { holderId: 'me', holderName: 'You', device, at: new Date().toISOString() };
    else demoLocks[matchId] = { ...l, device: l.device ?? device, at: new Date().toISOString() };
    const arr = demo.matchEvents[matchId] ?? [];
    if (rec.clientId && arr.some((e) => e.clientId === rec.clientId)) return;
    appendDemoMatchEvent(matchId, { ...rec, seq: arr.reduce((m, e) => Math.max(m, e.seq), 0) + 1 });
    return;
  }
  if (!lockRpcMissing) {
    const { error } = await supabase.rpc('append_match_event', {
      p_match: matchId, p_device: device, p_client_id: rec.clientId ?? null, p_type: rec.type,
      p_side: rec.side ?? null, p_payload: rec.payload ?? {}, p_attribution: rec.attribution ?? null,
    });
    if (!error) return;
    if (!isMissingFn(error)) throw new Error(error.message);
    lockRpcMissing = true; // pre-migration: plain insert below
  }
  const { error } = await supabase.from('match_events').insert({
    match_id: matchId,
    seq: rec.seq,
    type: rec.type,
    side: rec.side ?? null,
    payload: rec.payload ?? {},
    attribution: rec.attribution ?? null,
  });
  if (error) throw new Error(error.message);
}

/** Remove & return the most recent event for a match — powers undo. */
export async function popMatchEvent(matchId: string): Promise<MatchEventRecord | null> {
  if (!isSupabaseConfigured || !supabase) {
    const l = demoLocks[matchId];
    if (l?.holderId && l.device && l.device !== (await getDeviceId())) throw new Error('not_active_scorer');
    return popDemoMatchEvent(matchId);
  }
  if (!lockRpcMissing) {
    const { data, error } = await supabase.rpc('pop_match_event', { p_match: matchId, p_device: await getDeviceId() });
    if (!error) {
      const r = data as (MatchEventRecord & { client_id?: string | null }) | null;
      return r ? { seq: r.seq, type: r.type, side: r.side, payload: r.payload, attribution: r.attribution, clientId: r.client_id ?? undefined } : null;
    }
    if (!isMissingFn(error)) throw new Error(error.message);
    lockRpcMissing = true;
  }
  const { data } = await supabase
    .from('match_events')
    .select('seq, type, side, payload, attribution')
    .eq('match_id', matchId)
    .order('seq', { ascending: false })
    .limit(1);
  const last = (data ?? [])[0] as MatchEventRecord | undefined;
  if (!last) return null;
  await supabase.from('match_events').delete().eq('match_id', matchId).eq('seq', last.seq);
  return last;
}

/** Snapshot the latest reduced state on the match row for fast list reads. */
/** Designate (or clear) the single device/person allowed to score this match.
 *  Set by the organizer before kickoff. */
/** Set the full list of scorers (player ids) allowed to score this match. The first
 *  is kept as the primary `scorer_id` for reminders/notifications. Throws on a failed
 *  write so the caller can surface it — a silent failure here is what made assigning a
 *  scorer look like it "didn't save". */
export async function setMatchScorers(matchId: string, playerIds: string[]): Promise<void> {
  const ids = Array.from(new Set(playerIds.filter(Boolean)));
  if (!isSupabaseConfigured || !supabase) {
    const m = demo.matches.find((x) => x.id === matchId);
    if (m) { m.scorerIds = ids; m.scorerId = ids[0] ?? undefined; }
    // Taking the active scorer off the list ends their turn (as the server does).
    const l = demoLocks[matchId];
    if (l?.holderId && l.holderId !== 'me' && l.holderId !== 'demo-other' && !ids.includes(l.holderId)) delete demoLocks[matchId];
    return;
  }
  const { error } = await supabase
    .from('matches')
    .update({ scorer_ids: ids, scorer_id: ids[0] ?? null })
    .eq('id', matchId);
  if (error) throw new Error(error.message);
}

/** Save a bulk scorer plan (`planScorerAssignments`) match by match. Goes
 *  through `setMatchScorers`, so taking the current lock holder off a match's
 *  list also ends their turn (#03). Never throws — failures are returned. */
export async function bulkSetMatchScorers(plan: Record<string, string[]>): Promise<{ ok: string[]; failed: string[] }> {
  const ok: string[] = [];
  const failed: string[] = [];
  for (const [matchId, ids] of Object.entries(plan)) {
    try { await setMatchScorers(matchId, ids); ok.push(matchId); } catch { failed.push(matchId); }
  }
  return { ok, failed };
}

/** Shown when the self-join RPC isn't deployed yet (or the server refuses). */
export const JOIN_AS_SCORER_FALLBACK = 'Ask the organiser to add you as this match’s scorer';

/** A tournament scorer adds themself to this match's scorers (parity #11,
 *  `join_match_as_scorer`). Returns the player id that joined. Throws — the
 *  message is user-facing. */
export async function joinMatchAsScorer(matchId: string, myPlayerId?: string | null): Promise<string> {
  if (!isSupabaseConfigured || !supabase) {
    const m = demo.matches.find((x) => x.id === matchId);
    const pid = myPlayerId ?? demo.players[0]?.id;
    const isScorer = !!m?.tournamentId && !!pid && demo.tournamentOfficials.some((o) => o.tournamentId === m.tournamentId && o.role === 'scorer' && o.playerId === pid);
    if (!m || !pid || !isScorer || (m.status !== 'scheduled' && m.status !== 'live')) throw new Error('Only this tournament’s scorers can do that');
    const ids = m.scorerIds?.length ? m.scorerIds : m.scorerId ? [m.scorerId] : [];
    m.scorerIds = ids.includes(pid) ? ids : [...ids, pid];
    m.scorerId = m.scorerId ?? pid;
    return pid;
  }
  const { data, error } = await supabase.rpc('join_match_as_scorer', { p_match: matchId });
  if (isMissingFn(error)) throw new Error(JOIN_AS_SCORER_FALLBACK);
  if (error) throw new Error(error.message);
  return data as string;
}

/** Per-match officials (umpires, referees, commentator). Read separately — never
 *  part of MATCH_SELECT — so the app keeps working before migration 0043:
 *  `available: false` then, and the officials card stays hidden. */
export async function getMatchOfficials(matchId: string): Promise<{ available: boolean; list: MatchOfficial[] }> {
  if (!isSupabaseConfigured || !supabase) {
    const m = demo.matches.find((x) => x.id === matchId);
    return { available: true, list: normalizeOfficials(m?.officials ?? [], m?.sport) };
  }
  const { data, error } = await supabase.from('matches').select('sport, officials').eq('id', matchId).maybeSingle();
  if (error) return { available: false, list: [] };
  const row = data as { sport?: string; officials?: unknown } | null;
  return { available: true, list: normalizeOfficials(row?.officials ?? [], row?.sport) };
}

/** Replace a match's officials. Throws on a failed write. */
export async function setMatchOfficials(matchId: string, list: MatchOfficial[]): Promise<void> {
  const clean = normalizeOfficials(list);
  if (!isSupabaseConfigured || !supabase) {
    const m = demo.matches.find((x) => x.id === matchId);
    if (m) m.officials = clean;
    return;
  }
  const { error } = await supabase.from('matches').update({ officials: clean }).eq('id', matchId);
  if (error) throw new Error(error.message);
}

/** Back-compat single-scorer setter (used by the create-match flow). */
export async function setMatchScorer(matchId: string, scorerId: string | null): Promise<void> {
  return setMatchScorers(matchId, scorerId ? [scorerId] : []);
}

/** Replace the set of hosts for a match (any current host can add/remove). Throws on
 *  a failed write so the caller can surface it rather than silently reverting. */
export async function setMatchHosts(matchId: string, hostIds: string[]): Promise<void> {
  const ids = Array.from(new Set(hostIds.filter(Boolean)));
  if (!isSupabaseConfigured || !supabase) {
    const m = demo.matches.find((x) => x.id === matchId);
    if (m) m.hostIds = ids;
    return;
  }
  const { error } = await supabase.from('matches').update({ host_ids: ids }).eq('id', matchId);
  if (error) throw new Error(error.message);
}

/** Replace the set of hosts for a tournament. */
export async function setTournamentHosts(tournamentId: string, hostIds: string[]): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    const t = demo.tournaments.find((x) => x.id === tournamentId);
    if (t) t.hostIds = hostIds;
    return;
  }
  await supabase.from('tournaments').update({ host_ids: hostIds }).eq('id', tournamentId);
}

/** Set (or clear, with undefined) a tournament's per-tournament reminder lead
 *  times. Persists to the `reminder_lead_minutes` column live; in-memory in demo. */
export async function setTournamentReminderLeads(tournamentId: string, minutes: number[] | undefined): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    const t = demo.tournaments.find((x) => x.id === tournamentId);
    if (t) t.reminderLeadMinutes = minutes;
    return;
  }
  await supabase.from('tournaments').update({ reminder_lead_minutes: minutes ?? null }).eq('id', tournamentId);
}

/* ------------------------------ Images ---------------------------------- */

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Upload a picked image to the public `media` bucket (migration 0038) and return
 *  its public URL — the only kind of image URL other devices can open. Demo mode
 *  is single-device, so the local URI is returned as-is. */
export async function uploadImage(img: PickedImage, kind: ImageKind): Promise<string> {
  if (!isSupabaseConfigured || !supabase) return img.uri;
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error('Sign in to add photos.');
  if (img.fileSize && img.fileSize > MAX_IMAGE_BYTES) throw new Error('That image is over 5 MB — pick a smaller one.');
  // ArrayBuffer, not Blob: a Blob from fetch() uploads 0 bytes on Android.
  const bytes = await (await fetch(img.uri)).arrayBuffer();
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error('That image is over 5 MB — pick a smaller one.');
  const path = mediaPath(uid, kind, extForMime(img.mimeType), Date.now(), Math.random().toString(36).slice(2, 8));
  const { error } = await supabase.storage.from('media').upload(path, bytes, { contentType: img.mimeType ?? 'image/jpeg', upsert: false });
  if (error) {
    if (/bucket not found/i.test(error.message)) throw new Error('Photo uploads aren’t switched on yet.');
    throw new Error(error.message);
  }
  return supabase.storage.from('media').getPublicUrl(path).data.publicUrl;
}

/** Live mode never saves a device-local image URI: nobody else could open it. */
function assertPersistable(url?: string | null): void {
  if (isSupabaseConfigured && isLocalImageUri(url)) throw new Error('That image wasn’t uploaded — try again.');
}

/** An update that RLS silently filtered out returns no error and 0 rows. */
function assertUpdated(res: { error: { message: string } | null; data: unknown[] | null }, what: string): void {
  if (res.error) throw new Error(res.error.message);
  if (!res.data || res.data.length === 0) throw new Error(`You can’t change this ${what}.`);
}

/** Set a match's logo/banner image. */
export async function setMatchLogo(matchId: string, logoUrl: string | null): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    const m = demo.matches.find((x) => x.id === matchId);
    if (m) m.logoUrl = logoUrl ?? undefined;
    return;
  }
  assertPersistable(logoUrl);
  assertUpdated(await supabase.from('matches').update({ logo_url: logoUrl }).eq('id', matchId).select('id'), 'match');
}

/** Set a tournament's logo image. */
export async function setTournamentLogo(tournamentId: string, logoUrl: string | null): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    const t = demo.tournaments.find((x) => x.id === tournamentId);
    if (t) t.logoUrl = logoUrl ?? undefined;
    return;
  }
  assertPersistable(logoUrl);
  assertUpdated(await supabase.from('tournaments').update({ logo_url: logoUrl }).eq('id', tournamentId).select('id'), 'tournament');
}

/** Set a tournament's wide banner image (migration 0038 adds the column). */
export async function setTournamentBanner(tournamentId: string, url: string | null): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    const t = demo.tournaments.find((x) => x.id === tournamentId);
    if (t) t.bannerUrl = url ?? undefined;
    return;
  }
  assertPersistable(url);
  const res = await supabase.from('tournaments').update({ banner_url: url }).eq('id', tournamentId).select('id');
  if (res.error && (res.error.code === '42703' || res.error.code === 'PGRST204')) throw new Error('Banners aren’t switched on yet.');
  assertUpdated(res, 'tournament');
}

/** A tournament's banner, read on its own so a database without the column
 *  (before migration 0038) just means "no banner". */
export async function getTournamentBanner(tournamentId: string): Promise<string | undefined> {
  if (!isSupabaseConfigured || !supabase) return demo.tournaments.find((x) => x.id === tournamentId)?.bannerUrl;
  const { data, error } = await supabase.from('tournaments').select('banner_url').eq('id', tournamentId).maybeSingle();
  if (error) return undefined;
  return (data as { banner_url?: string | null } | null)?.banner_url ?? undefined;
}

/* ---------------- Tournament awards + POTM override (parity #21) ----------- */

/** The migration that adds tournaments.awards and matches.potm. */
export const AWARDS_MIGRATION = '20261019122100_awards_and_potm.sql';
export const AWARDS_DB_MESSAGE = `Awards need a database update (migration ${AWARDS_MIGRATION})`;
/** Thrown by setMatchPotm when the POTM was already changed once. */
export const POTM_ONCE_MESSAGE = 'Player of the Match can only be changed once.';

/** A tournament's awards (draft + published), read on its own select so a
 *  database without the column just means "none yet". */
export async function getTournamentAwards(tournamentId: string): Promise<TournamentAwards | undefined> {
  if (!isSupabaseConfigured || !supabase) {
    const a = demo.awards[tournamentId];
    return a ? { ...a, items: a.items.map((i) => ({ ...i })) } : undefined;
  }
  const { data, error } = await supabase.from('tournaments').select('awards').eq('id', tournamentId).maybeSingle();
  if (error) return undefined;
  const a = (data as { awards?: TournamentAwards | null } | null)?.awards;
  return a && Array.isArray(a.items) ? a : undefined;
}

/** Save a tournament's awards (hosts — the "manage tourneys" policy). Throws
 *  AWARDS_DB_MESSAGE before the migration. */
export async function saveTournamentAwards(tournamentId: string, awards: TournamentAwards): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    demo.awards[tournamentId] = { ...awards, items: awards.items.map((i) => ({ ...i })) };
    return;
  }
  const res = await supabase.from('tournaments').update({ awards }).eq('id', tournamentId).select('id');
  if (isMissingSchema(res.error)) throw new Error(AWARDS_DB_MESSAGE);
  assertUpdated(res, 'tournament');
}

/** A match's stored Player of the Match override (own select; none pre-migration). */
export async function getMatchPotm(matchId: string): Promise<MatchPotm | undefined> {
  if (!isSupabaseConfigured || !supabase) {
    const p = demo.potm[matchId];
    return p ? { ...p } : undefined;
  }
  const { data, error } = await supabase.from('matches').select('potm').eq('id', matchId).maybeSingle();
  if (error) return undefined;
  const p = (data as { potm?: MatchPotm | null } | null)?.potm;
  return p && p.name ? p : undefined;
}

/** Change the Player of the Match — ONCE: throws POTM_ONCE_MESSAGE when the
 *  stored value already carries `by` (REVIEW 05/21: client/repo-enforced only).
 *  Throws AWARDS_DB_MESSAGE before the migration. */
export async function setMatchPotm(matchId: string, potm: MatchPotm): Promise<void> {
  if (!potm.by) throw new Error('Who changed the Player of the Match is required.');
  const current = await getMatchPotm(matchId);
  if (current?.by) throw new Error(POTM_ONCE_MESSAGE);
  if (!isSupabaseConfigured || !supabase) {
    demo.potm[matchId] = { ...potm };
    return;
  }
  const res = await supabase.from('matches').update({ potm }).eq('id', matchId).select('id');
  if (isMissingSchema(res.error)) throw new Error(AWARDS_DB_MESSAGE);
  assertUpdated(res, 'match');
}

/** Persist a per-match format override (scoring-aspect toggles, half length…),
 *  merged onto any existing format. Lets organizers/scorers adjust a single game
 *  last-minute (e.g. shorten halves, switch off tracking they can't keep up with). */
export async function setMatchFormat(matchId: string, patch: Record<string, number | string | boolean>): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    const m = demo.matches.find((x) => x.id === matchId);
    if (m) m.format = { ...(m.format ?? {}), ...patch };
    return;
  }
  const { data } = await supabase.from('matches').select('format').eq('id', matchId).maybeSingle();
  const merged = { ...((data?.format as object) ?? {}), ...patch };
  await supabase.from('matches').update({ format: merged }).eq('id', matchId);
}

/** Set (or clear, with null) the optional live-stream link for a match. The
 *  organizer/scorer can update this any time before/at the match. */
export async function setMatchStream(matchId: string, url: string | null): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    const m = demo.matches.find((x) => x.id === matchId);
    if (m) m.streamUrl = url ?? undefined;
    return;
  }
  await supabase.from('matches').update({ stream_url: url }).eq('id', matchId);
}

/* --------------------- participation disputes ---------------------------- */

function rowToDispute(r: Record<string, any>): MatchDispute {
  return {
    id: r.id, matchId: r.match_id, side: r.side, playerId: r.player_id, playerName: r.player_name,
    reason: r.reason ?? undefined, kind: r.kind ?? 'objection', status: r.status,
    raisedBy: r.raised_by, raisedByName: r.raised_by_name ?? undefined, raisedAt: r.raised_at,
    replacementId: r.replacement_id ?? undefined, replacementName: r.replacement_name ?? undefined,
    homeCaptainOk: r.home_captain_ok ?? false, awayCaptainOk: r.away_captain_ok ?? false,
    resolvedAt: r.resolved_at ?? undefined,
    history: (r.history as DisputeEvent[]) ?? [],
  };
}

/** Who performed a dispute action, for the audit trail (name resolved locally in demo). */
export interface DisputeActor { id?: string; name?: string }
const actorNameOf = (actor?: DisputeActor) =>
  actor?.name ?? (actor?.id ? demo.players.find((p) => p.id === actor.id)?.fullName : undefined);

/** Append one entry to a dispute's audit trail (read-modify-write in live mode). */
async function appendDisputeHistory(id: string, event: DisputeEvent): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    const d = demo.disputes.find((x) => x.id === id);
    if (d) d.history = [...(d.history ?? []), event];
    return;
  }
  const { data } = await supabase.from('match_disputes').select('history').eq('id', id).maybeSingle();
  const history = [...(((data?.history as DisputeEvent[]) ?? [])), event];
  await supabase.from('match_disputes').update({ history }).eq('id', id);
}

export async function getMatchDisputes(matchId: string): Promise<MatchDispute[]> {
  if (!isSupabaseConfigured || !supabase) return demo.disputes.filter((d) => d.matchId === matchId);
  const { data } = await supabase.from('match_disputes').select('*').eq('match_id', matchId);
  return (data ?? []).map(rowToDispute);
}

/** The player whose stat line now holds this player's stats in this match
 *  (after resolved disputes) — the ONE shared helper for corrections (#05) and
 *  the completion stat sync (#19). */
export async function mapThroughDisputes(matchId: string, playerId: string): Promise<string> {
  return (await disputeMapper(matchId))(playerId);
}
/** `mapThroughDisputes` for many ids with ONE disputes read (the #19 sync). */
export async function disputeMapper(matchId: string): Promise<(playerId: string) => string> {
  const disputes = await getMatchDisputes(matchId);
  return (playerId) => followDisputes(disputes, playerId);
}

/** Parity #19 — write a sport's ABSOLUTE match figures (`plugin.statTotals`)
 *  to the match's stat lines: ids mapped through resolved disputes, values set
 *  (not added), missing lines inserted with the opponent's name, and only rows
 *  whose stats change are written (the follower-push webhook fires per write).
 *  Run at completion and after a correction; then `updateMatchSnapshot` so
 *  `won` covers inserted lines. Returns how many rows were written. */
export async function syncMatchStatLines(
  matchId: string, sport: SportId, totals: MatchTotals, names: { home?: string; away?: string } = {},
): Promise<number> {
  const mapId = await disputeMapper(matchId);
  const existing = (await getMatchStatLines(matchId)).filter((l) => l.sport === sport && !l.eventId);
  const writes = planStatSync(existing, totals, mapId, names);
  if (!writes.length) return 0;
  if (!isSupabaseConfigured || !supabase) {
    applyStatWrites(demo.statLines, writes, (w) => newDemoStatLine({ matchId, playerId: w.playerId, sport, stats: w.stats, opponent: w.opponent }));
    return writes.length;
  }
  for (const w of writes) {
    if (w.kind === 'update') await supabase.from('stat_lines').update({ stats: w.stats }).eq('id', w.id);
    else await supabase.from('stat_lines').insert({ match_id: matchId, player_id: w.playerId, sport, stats: w.stats, opponent: w.opponent ?? null });
  }
  return writes.length;
}

/** SD-19 — the players each side fielded, for a sport whose `statTotals`
 *  needs them (`statTotalsNeedsPlayers`, the racket sports): the matchday
 *  squad's starters, else a 1–2 player entry's roster (as SD-11's appearance
 *  lines), with names so name-only events resolve. Never throws. */
export async function statTotalsContext(matchId: string, match?: Match | null): Promise<StatTotalsContext> {
  try {
    const m = match ?? await getMatch(matchId);
    if (!m) return {};
    const [squads, rosters] = await Promise.all([getMatchSquads(matchId), getTeamRosters([m.homeTeam.id, m.awayTeam.id])]);
    const perSide = Number((m.format as Record<string, unknown> | undefined)?.playersPerSide) || 0;
    const pick = (side: 'home' | 'away', teamId: string): string[] => {
      const starters = squads[side]?.starters ?? [];
      if (starters.length) return starters;
      const roster = rosters.get(teamId) ?? [];
      return roster.length && roster.length <= Math.max(2, perSide) ? roster : [];
    };
    const ids = { home: pick('home', m.homeTeam.id), away: pick('away', m.awayTeam.id) };
    const names = new Map((await getPlayersByIds([...ids.home, ...ids.away])).map((p) => [p.id, p.fullName]));
    const of = (list: string[]) => list.map((id) => ({ id, name: names.get(id) }));
    return { players: { home: of(ids.home), away: of(ids.away) } };
  } catch {
    return {};
  }
}

/** SD-19 — `plugin.statTotals` for a match, with the players loaded first when
 *  the sport needs them. Cricket / football: exactly `statTotals(state)` as
 *  before. Null when the sport has no totals. */
export async function matchStatTotals(matchId: string, sport: SportId, state: unknown, match?: Match | null): Promise<MatchTotals | null> {
  const plugin = getSport(sport);
  if (!plugin.statTotals) return null;
  if (!plugin.statTotalsNeedsPlayers) return plugin.statTotals(state as never);
  return plugin.statTotals(state as never, await statTotalsContext(matchId, match));
}

/** SD-19 (founder decision D2) — the BACKFILL: re-derive the absolute totals of
 *  completed `sport` matches from their stored event logs and write the stat
 *  lines that change (ids through resolved disputes; values set, not added).
 *  Touches stat_lines ONLY — never the match row / snapshot, tournament
 *  settings or published awards. Not run automatically: call it by hand, e.g.
 *  in the web app's console `await __sportnnoteAdmin.resyncSportLines('tennis')`
 *  (see docs/sport-depth/PROGRESS.md, SD-19). `dryRun` reports without writing.
 *  Matches with no stored log fall back to the saved snapshot. */
export async function resyncSportLines(
  sport: SportId,
  matchIds?: string[],
  opts: { dryRun?: boolean } = {},
): Promise<{ matches: number; rowsWritten: number; perMatch: { matchId: string; rows: number; source: 'log' | 'snapshot' | 'skipped' }[] }> {
  const plugin = getSport(sport);
  const out = { matches: 0, rowsWritten: 0, perMatch: [] as { matchId: string; rows: number; source: 'log' | 'snapshot' | 'skipped' }[] };
  if (!plugin.statTotals) return out;
  const all = matchIds?.length
    ? (await Promise.all(matchIds.map((id) => getMatch(id)))).filter((m): m is Match => !!m)
    : await getMatches(sport);
  const done = all.filter((m) => m.sport === sport && m.status === 'completed');
  const tours = done.some((m) => m.tournamentId) ? await getTournaments({ includeDeleted: true }) : [];
  for (const m of done) {
    out.matches += 1;
    const tour = tours.find((t) => t.id === m.tournamentId);
    const config = mergeMatchConfig(tour?.formats?.[sport] as Record<string, unknown> | undefined, m.format as Record<string, unknown> | undefined);
    const raw = await getMatchEvents(m.id);
    let state: unknown;
    let source: 'log' | 'snapshot' | 'skipped' = 'log';
    if (raw.length) state = replayLog(plugin, config, raw);
    else if (m.state) { state = m.state; source = 'snapshot'; }
    else { out.perMatch.push({ matchId: m.id, rows: 0, source: 'skipped' }); continue; }
    const totals = await matchStatTotals(m.id, sport, state, m);
    if (!totals) continue;
    let rows = 0;
    if (opts.dryRun) {
      const mapId = await disputeMapper(m.id);
      const existing = (await getMatchStatLines(m.id)).filter((l) => l.sport === sport && !l.eventId);
      rows = planStatSync(existing, totals, mapId, { home: m.homeTeam.name, away: m.awayTeam.name }).length;
    } else {
      rows = await syncMatchStatLines(m.id, sport, totals, { home: m.homeTeam.name, away: m.awayTeam.name });
    }
    out.rowsWritten += rows;
    out.perMatch.push({ matchId: m.id, rows, source });
  }
  return out;
}

// SD-19: the founder's console handle for the D2 backfill (web: devtools).
(globalThis as unknown as Record<string, unknown>).__sportnnoteAdmin = {
  ...(((globalThis as unknown as Record<string, unknown>).__sportnnoteAdmin as object | undefined) ?? {}),
  resyncSportLines,
};

/** SD-11 (GEN-01) — at completion: an appearance line for every player who
 *  took part (squad starters + subs who came on, or a 1–2 player entry's
 *  roster) and each line's `result` (W/D/L/T/NR) + `won` from that player's
 *  side. Ids go through resolved disputes; idempotent (only changed rows are
 *  written). Before migration 0050 `result` is left out of the writes and
 *  profiles derive it from the match. Never throws — returns rows written. */
export async function syncMatchAppearances(matchId: string, stateArg?: unknown): Promise<number> {
  try {
    const m = await getMatch(matchId);
    if (!m) return 0;
    const outcome = sideResults({ sport: m.sport, status: m.status, winner: m.winner ?? null, result: m.result ?? null });
    if (!outcome) return 0;
    const state = stateArg ?? m.state;
    const plugin = getSport(m.sport);
    const [squads, lineup, rosters, lines, mapId] = await Promise.all([
      getMatchSquads(matchId),
      getLineup(matchId, m.sport).catch(() => undefined),
      getTeamRosters([m.homeTeam.id, m.awayTeam.id]),
      getMatchStatLines(matchId),
      disputeMapper(matchId),
    ]);
    const cameOn = subsCameOn(state);
    let involved: string[] = [];
    try { involved = state && plugin.involvedPlayerIds ? plugin.involvedPlayerIds(state as never) : []; } catch { involved = []; }
    // Name-only sub events (basketball / kabaddi) → match them to bench players.
    const benchIds = [...squads.home.subs, ...squads.away.subs];
    const playerNames: Record<string, string> = {};
    if (cameOn.names.length && benchIds.length) {
      for (const p of await getPlayersByIds(benchIds)) playerNames[p.id] = p.fullName;
    }
    const perSide = Number((m.format as Record<string, unknown> | undefined)?.playersPerSide) || undefined;
    const writes = planAppearances({
      sport: m.sport, outcome,
      names: { home: m.homeTeam.name, away: m.awayTeam.name },
      squads, lineup,
      rosters: { home: rosters.get(m.homeTeam.id) ?? [], away: rosters.get(m.awayTeam.id) ?? [] },
      perSide, cameOn, playerNames, involved,
      existing: lines.filter((l) => l.sport === m.sport && !l.eventId),
      mapId,
    });
    if (!writes.length) return 0;
    await applyAppearanceWrites(matchId, m.sport, writes);
    return writes.length;
  } catch {
    return 0;
  }
}

async function getPlayersByIds(ids: string[]): Promise<{ id: string; fullName: string }[]> {
  if (!ids.length) return [];
  if (!isSupabaseConfigured || !supabase) return demo.players.filter((p) => ids.includes(p.id));
  const { data } = await supabase.from(PLAYERS_READ).select('id, full_name').in('id', ids);
  return ((data ?? []) as { id: string; full_name: string }[]).map((r) => ({ id: r.id, fullName: r.full_name }));
}

async function applyAppearanceWrites(matchId: string, sport: SportId, writes: AppearanceWrite[]): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    const now = new Date().toISOString();
    for (const w of writes) {
      if (w.kind === 'insert') {
        demo.statLines.push({ ...newDemoStatLine({ matchId, playerId: w.playerId, sport, stats: w.stats, opponent: w.opponent }), won: w.won, result: w.result, date: now });
      } else {
        const l = demo.statLines.find((x) => x.id === w.id);
        if (!l) continue;
        if (w.patch.stats) l.stats = { ...w.patch.stats };
        if (w.patch.result) l.result = w.patch.result;
        if (w.patch.won !== undefined) l.won = w.patch.won;
      }
    }
    return;
  }
  const sb = supabase;
  // Write with `result`; if the column isn't there yet (pre-0050), again without.
  const tolerant = async (write: (withResult: boolean) => PromiseLike<{ error: { code?: string; message?: string } | null }>) => {
    if (statLineResultColumn) {
      const r = await write(true);
      if (!isMissingResultColumn(r.error)) return r.error;
      statLineResultColumn = false;
    }
    return (await write(false)).error;
  };
  const inserts = writes.filter((w): w is Extract<AppearanceWrite, { kind: 'insert' }> => w.kind === 'insert');
  const rowOf = (w: Extract<AppearanceWrite, { kind: 'insert' }>, withResult: boolean) => ({
    match_id: matchId, player_id: w.playerId, sport, stats: w.stats, won: w.won, opponent: w.opponent ?? null,
    ...(withResult ? { result: w.result } : {}),
  });
  if (inserts.length) {
    const err = await tolerant((wr) => sb.from('stat_lines').insert(inserts.map((w) => rowOf(w, wr))));
    // One row clashed (a live stat landed first — one line per match+player+sport):
    // insert one by one, skipping the duplicates; the next sync labels them.
    if (err) for (const w of inserts) await tolerant((wr) => sb.from('stat_lines').insert(rowOf(w, wr)));
  }
  for (const w of writes) {
    if (w.kind !== 'update') continue;
    const { result, ...rest } = w.patch;
    const base: Record<string, unknown> = { ...rest };
    if (!Object.keys(base).length && result && !statLineResultColumn) continue;
    await tolerant((wr) => sb.from('stat_lines').update({ ...base, ...(wr && result ? { result } : {}) }).eq('id', w.id));
  }
}

/** The public "Score edits" log of a match (parity #05): every published
 *  correction, newest first. */
export async function getScoreEdits(matchId: string): Promise<{ at: string; byName: string; lines: string[] }[]> {
  const events = await getMatchEvents(matchId);
  return events
    .filter((e) => e.type === 'AMEND')
    .map((e) => {
      const p = (e.payload ?? {}) as { byName?: string; lines?: string[] };
      return { at: e.created_at ?? '', byName: p.byName ?? 'A scorer', lines: p.lines ?? [] };
    })
    .reverse();
}

export interface NewDispute {
  matchId: string; side: 'home' | 'away'; playerId: string; playerName: string; reason?: string;
  raisedBy: string; raisedByName?: string;
  /** objection (self, masks now) or report (a peer flags someone, organizer triages) */
  kind: 'objection' | 'report';
}
/** Raise a participation dispute. An objection (the player themselves) starts
 *  'open' and masks immediately; a report (a peer) starts 'reported' for the
 *  organizer to triage. */
export async function raiseDispute(input: NewDispute): Promise<MatchDispute> {
  const status: MatchDispute['status'] = input.kind === 'report' ? 'reported' : 'open';
  const raisedAt = new Date().toISOString();
  const first: DisputeEvent = {
    action: input.kind === 'report' ? 'reported' : 'raised',
    at: raisedAt, byId: input.raisedBy, byName: input.raisedByName,
    note: input.kind === 'report' ? `reported ${input.playerName}` : 'objected to being credited',
  };
  const d: MatchDispute = {
    id: genId('disp'), matchId: input.matchId, side: input.side, playerId: input.playerId, playerName: input.playerName,
    reason: input.reason, kind: input.kind, status, raisedBy: input.raisedBy, raisedByName: input.raisedByName,
    raisedAt, homeCaptainOk: false, awayCaptainOk: false, history: [first],
  };
  if (!isSupabaseConfigured || !supabase) { demo.disputes.push(d); return d; }
  await supabase.from('match_disputes').insert({
    id: d.id, match_id: d.matchId, side: d.side, player_id: d.playerId, player_name: d.playerName,
    reason: d.reason ?? null, kind: d.kind, status, raised_by: d.raisedBy, raised_by_name: d.raisedByName ?? null,
    raised_at: d.raisedAt, home_captain_ok: false, away_captain_ok: false, history: d.history,
  });
  return d;
}

/** Organizer accepts a peer report → it becomes an open (masking) dispute that
 *  then goes through the same captain-confirmed reassignment as an objection. */
export async function escalateDispute(id: string, actor?: DisputeActor): Promise<void> {
  const event: DisputeEvent = {
    action: 'escalated', at: new Date().toISOString(), byId: actor?.id, byName: actorNameOf(actor),
    note: 'accepted the report — captains to confirm who played',
  };
  if (!isSupabaseConfigured || !supabase) {
    const d = demo.disputes.find((x) => x.id === id);
    if (d && d.status === 'reported') { d.status = 'open'; d.history = [...(d.history ?? []), event]; }
    return;
  }
  await supabase.from('match_disputes').update({ status: 'open' }).eq('id', id);
  await appendDisputeHistory(id, event);
}

/** Create a brand-new player (not already in the system) to reassign a disputed
 *  slot to — e.g. the substitute who actually played. They join that team's pool. */
export async function createReplacementPlayer(name: string, sport: SportId, houseName?: string): Promise<Player> {
  const fullName = name.trim();
  if (!isSupabaseConfigured || !supabase) {
    return addPlayer({ fullName, sports: [sport], houseName });
  }
  const { data, error } = await supabase
    .from('players')
    .insert({ full_name: fullName, sports: [sport], house_name: houseName ?? null })
    .select('id, full_name, sports, house_name')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Could not add player');
  return { id: data.id, fullName: data.full_name, sports: (data.sports ?? [sport]) as SportId[], houseName: data.house_name ?? undefined };
}

/** The canonical identity lookup: the one person a contact number belongs to
 *  (or null). Phone is the primary key across the platform — one number ⇒ one
 *  person — so every profile-creating path resolves through here first. */
/** A lookup a person is waiting on must never spin forever (weak signal): give
 *  up after `ms` so the screen can move on. */
function withTimeout<T>(p: PromiseLike<T>, ms = 8000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Lookup timed out')), ms);
    Promise.resolve(p).then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

export async function findPlayerByPhone(phone: string): Promise<Player | null> {
  if (!isValidPhone(phone)) return null;
  if (!isSupabaseConfigured || !supabase) {
    return demo.players.find((p) => samePhone(p.phone, phone)) ?? null;
  }
  // Live: phone is a private column — an exact-match server lookup returns just
  // the person's id (rate-limited), then we read their public profile.
  const { data, error } = await withTimeout(supabase.rpc('find_player_by_phone', { p_phone: normalizePhone(phone) }));
  if (error) throw new Error(error.message);
  const id = (data as { id: string }[] | null)?.[0]?.id;
  return id ? getPlayer(id) : null;
}

/** Identity lookup by email (secondary to phone) — the one player who registered
 *  this email, or null. Case-insensitive. */
/** Which of the given players have reported "not me" (migration 0009). Fetched
 *  separately from PLAYER_SELECT so it degrades gracefully before 0009 is run
 *  (missing column → returns an empty set rather than breaking player reads). */
export async function getReportedPlayerIds(ids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (!ids.length) return out;
  if (!isSupabaseConfigured || !supabase) {
    for (const id of ids) if (demo.players.find((p) => p.id === id)?.reported) out.add(id);
    return out;
  }
  const { data, error } = await supabase.from('players').select('id').in('id', ids).not('reported_at', 'is', null);
  if (error) return out; // pre-0009: column absent ⇒ no reports surfaced
  for (const r of (data ?? []) as { id: string }[]) out.add(r.id);
  return out;
}

export async function findPlayerByEmail(email: string): Promise<Player | null> {
  const e = email.trim().toLowerCase();
  if (!e.includes('@')) return null;
  if (!isSupabaseConfigured || !supabase) return demo.players.find((p) => (p.email ?? '').toLowerCase() === e) ?? null;
  const { data, error } = await withTimeout(supabase.rpc('find_player_by_email', { p_email: e }));
  if (error) throw new Error(error.message);
  const id = (data as { id: string }[] | null)?.[0]?.id;
  return id ? getPlayer(id) : null;
}

/** People search for the co-host picker: name substring + an exact phone/email
 *  identity match, merged and de-duplicated (best few). */
export async function lookupPeople(query: string): Promise<Player[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const results = new Map<string, Player>();
  for (const p of await searchPlayers({ query: q })) results.set(p.id, p);
  // Exact-identity lookups are rate-limited server-side — a search box must never
  // break on that, so fall back to the name matches.
  if (q.includes('@')) { const p = await findPlayerByEmail(q).catch(() => null); if (p) results.set(p.id, p); }
  else if (q.replace(/[^0-9]/g, '').length >= 7) { const p = await findPlayerByPhone(q).catch(() => null); if (p) results.set(p.id, p); }
  return [...results.values()].slice(0, 8);
}

export interface InvitePlayerResult { player: Player; status: 'existing' | 'invited'; /** true when this add made them the team's captain (first player on a captain-less team) */ madeCaptain?: boolean; }

/** Find a person by phone/email, or create a PENDING player for them (not tied
 *  to any team) so they can be added as a co-host and invited to install. Mirrors
 *  invitePlayer's model: one number/email ⇒ one identity; new ⇒ a pending row the
 *  invitee claims by registering. The caller sends the actual invite message. */
export async function invitePerson(args: { name: string; phone?: string; email?: string }): Promise<InvitePlayerResult> {
  const name = args.name.trim() || 'Guest';
  const phone = args.phone?.trim();
  const email = args.email?.trim().toLowerCase();
  const existing = (phone ? await findPlayerByPhone(phone) : null) ?? (email ? await findPlayerByEmail(email) : null);
  if (existing) return { player: existing, status: 'existing' };
  if (!isSupabaseConfigured || !supabase) {
    const p = addPlayer({ fullName: name, sports: [], phone: phone ? normalizePhone(phone) : undefined, email: email || undefined, invited: true });
    return { player: p, status: 'invited' };
  }
  const { data, error } = await supabase
    .from('players')
    .insert({ full_name: name, sports: [], phone: phone ? normalizePhone(phone) : null, email: email ?? null, phone_verified: false })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Could not create the invite');
  const created = await getPlayer(data.id as string);
  if (!created) throw new Error('Could not create the invite');
  return { player: created, status: 'invited' };
}

/** Add a player to a team by name + phone (the invite-to-install growth loop).
 *  If the number belongs to a registered player, they're added directly (confirmed).
 *  Otherwise a PENDING player is created + added to the team sheet as "invited" —
 *  confirmed only once they install & register. The caller sends the WhatsApp
 *  invite (see openWhatsApp) and refetches the roster. */
/** The team(s) a player may NOT already be on when being added to `targetTeamId`:
 *  in a TOURNAMENT, every other team in it for this sport (incl. this match's
 *  opponent) — one person, one team per tournament. A FRIENDLY has none: friends
 *  often split one shared pool into two teams on the day, so the same person can
 *  be in both squads; the matchday squad picker keeps them to one side per match. */
async function conflictTeamsForAdd(targetTeamId: string, sport: SportId, matchId?: string): Promise<{ id: string; name: string }[]> {
  if (!matchId) return [];
  const out = new Map<string, string>();
  // The match gives us the opponent + (if any) the tournament this game belongs to.
  let homeId: string | undefined, awayId: string | undefined, tournamentId: string | undefined;
  if (!isSupabaseConfigured || !supabase) {
    const m = demo.matches.find((x) => x.id === matchId);
    homeId = m?.homeTeam?.id; awayId = m?.awayTeam?.id; tournamentId = m?.tournamentId;
  } else {
    const { data } = await supabase.from('matches').select('home_team_id, away_team_id, tournament_id').eq('id', matchId).maybeSingle();
    homeId = (data?.home_team_id as string) ?? undefined; awayId = (data?.away_team_id as string) ?? undefined; tournamentId = (data?.tournament_id as string) ?? undefined;
  }
  if (!tournamentId) return []; // friendly — shared squads are fine
  const opponent = targetTeamId === homeId ? awayId : targetTeamId === awayId ? homeId : undefined;
  if (opponent) out.set(opponent, '');
  {
    for (const t of await getTournamentTeams(tournamentId, sport)) if (t.id !== targetTeamId) out.set(t.id, t.name);
  }
  out.delete(targetTeamId);
  // Fill any missing names (e.g. the opponent) from a summary lookup.
  const result: { id: string; name: string }[] = [];
  for (const [id, name] of out) result.push({ id, name: name || (await getTeamSummary(id))?.name || 'the other team' });
  return result;
}

export async function invitePlayer(args: {
  teamId: string; teamName: string; name: string; sport: SportId; matchId?: string;
  /** a NEW person is always added by mobile number (their identity) */
  phone?: string;
  /** someone already on SportnNote, found by number / name / email */
  player?: Player;
  /** optional shirt number for a new (pending) player */
  jerseyNo?: number;
}): Promise<InvitePlayerResult> {
  const appendRoster = async (playerId: string) => {
    if (!isSupabaseConfigured || !supabase) {
      const t = demo.teams.find((x) => x.id === args.teamId);
      if (!t) return;
      // getRoster returns an explicit roster INSTEAD of the houseName-derived one,
      // so materialize the currently-derived squad first — otherwise adding one
      // player would silently drop everyone else on a house team.
      const base = (t.roster && t.roster.length > 0)
        ? t.roster
        : demo.players.filter((p) => p.houseName === args.teamName && p.sports.includes(args.sport) && p.id !== playerId).map((p) => p.id);
      t.roster = [...new Set([...base, playerId])];
      return;
    }
    // Live: persist an explicit roster on the team so BOTH new invitees AND
    // existing players are actually linked (house_name alone doesn't cover an
    // existing player added to an ad-hoc team). Materialize the current squad
    // first so house-derived members aren't dropped.
    const { data: teamRow } = await supabase.from('teams').select('roster').eq('id', args.teamId).maybeSingle();
    let base = (teamRow?.roster ?? null) as string[] | null;
    if (!base || base.length === 0) {
      const { data: house } = await supabase.from('players').select('id').eq('house_name', args.teamName).contains('sports', [args.sport]);
      base = (house as { id: string }[] | null)?.map((r) => r.id) ?? [];
    }
    await supabase.from('teams').update({ roster: [...new Set([...base, playerId])] }).eq('id', args.teamId);
  };

  // First player on a captain-less team becomes the captain, so they can build the
  // rest of the squad themselves (and get reminded to set the matchday XI).
  const maybeSetCaptain = async (playerId: string): Promise<boolean> => {
    const leaders = await getTeamLeaders(args.teamId);
    if (leaders.captainId || leaders.viceCaptainId) return false;
    // Only a manager may set a captain — anyone else still adds the player.
    try { await setTeamLeaders(args.teamId, { captainId: playerId }); } catch { return false; }
    return true;
  };

  // One number ⇒ one identity: reuse whoever already owns this number (their name
  // is pulled up, never duplicated). A confirmed account → 'existing'; a still-
  // pending invite → re-added as 'invited'.
  const existing = args.player ?? (args.phone ? await findPlayerByPhone(args.phone) : null);
  if (!existing && !args.phone) throw new Error('Add a new player by their mobile number.');
  const phone = args.phone ?? '';
  const newName = args.name.trim() || `Invited (…${phone.replace(/\D/g, '').slice(-4)})`;
  // One person, one team per tournament: block adding someone already rostered on
  // another team in the same tournament+sport (friendlies allow shared squads). (A brand-new number
  // can't clash — they're on no team yet — so we only check a known person.)
  if (existing) {
    const conflicts = await conflictTeamsForAdd(args.teamId, args.sport, args.matchId);
    if (conflicts.length) {
      const rosters = await getTeamRosters(conflicts.map((c) => c.id));
      const clash = conflicts.find((c) => (rosters.get(c.id) ?? []).includes(existing.id));
      if (clash) {
        throw new Error(`${existing.fullName} is already playing for ${clash.name} in this tournament. One person can’t play for two teams in the same tournament.`);
      }
    }
    await appendRoster(existing.id);
    const madeCaptain = await maybeSetCaptain(existing.id);
    return { player: existing, status: existing.invited ? 'invited' : 'existing', madeCaptain };
  }
  // New number → create a pending invited player (phone stored normalised).
  if (!isSupabaseConfigured || !supabase) {
    const player = addPlayer({ fullName: newName, sports: [args.sport], houseName: args.teamName, phone: normalizePhone(phone), phoneVerified: false, invited: true, jerseyNo: args.jerseyNo });
    await appendRoster(player.id);
    const madeCaptain = await maybeSetCaptain(player.id);
    return { player, status: 'invited', madeCaptain };
  }
  const { data, error } = await supabase.from('players')
    .insert({ full_name: newName, sports: [args.sport], house_name: args.teamName, phone: normalizePhone(phone), phone_verified: false, jersey_no: args.jerseyNo ?? null })
    .select('id').single();
  if (error || !data) throw new Error(error?.message ?? 'Could not add player');
  const p = await getPlayer(data.id as string);
  if (!p) throw new Error('Could not add player');
  await appendRoster(p.id);
  const madeCaptain = await maybeSetCaptain(p.id);
  return { player: p, status: 'invited', madeCaptain };
}

/** Remove a player from a team — added by mistake, left the team, etc. Drops them
 *  from the team's roster (so they stop appearing in the squad picker / scoring
 *  roster) and clears their captaincy if they held it. Optionally also strips them
 *  from a specific match's saved matchday squad + positional lineup. Does not delete
 *  the person's account/player record — only their membership of THIS team. */
export async function removePlayerFromTeam(teamId: string, playerId: string, matchId?: string): Promise<void> {
  const clearLeadIfNeeded = async () => {
    const leaders = await getTeamLeaders(teamId);
    const patch: TeamLeadership = { captainId: leaders.captainId, viceCaptainId: leaders.viceCaptainId };
    let changed = false;
    if (patch.captainId === playerId) { patch.captainId = undefined; changed = true; }
    if (patch.viceCaptainId === playerId) { patch.viceCaptainId = undefined; changed = true; }
    if (changed) await setTeamLeaders(teamId, patch);
  };
  const stripFromMatch = async () => {
    if (!matchId) return;
    const squads = await getMatchSquads(matchId);
    for (const sd of ['home', 'away'] as const) {
      const s = squads[sd];
      if (s.starters.includes(playerId) || s.subs.includes(playerId)) {
        await setMatchSquad(matchId, sd, { starters: s.starters.filter((x) => x !== playerId), subs: s.subs.filter((x) => x !== playerId) });
      }
    }
    // Clear them from the positional lineup too (both sides, harmless if absent).
    const lu = await getLineup(matchId);
    const scrub = (slots: typeof lu.home) => slots.map((sl) => (sl.playerId === playerId ? { ...sl, playerId: undefined, playerName: undefined } : sl));
    await setLineup(matchId, { ...lu, home: scrub(lu.home), away: scrub(lu.away) });
  };

  if (!isSupabaseConfigured || !supabase) {
    const t = demo.teams.find((x) => x.id === teamId);
    if (t) {
      const base = (t.roster && t.roster.length > 0) ? t.roster : demo.players.filter((pl) => pl.houseName === t.name).map((pl) => pl.id);
      t.roster = base.filter((id) => id !== playerId);
    }
    await clearLeadIfNeeded();
    await stripFromMatch();
    return;
  }
  const { data: teamRow } = await supabase.from('teams').select('roster').eq('id', teamId).maybeSingle();
  const roster = ((teamRow?.roster ?? []) as string[]).filter((id) => id !== playerId);
  await supabase.from('teams').update({ roster }).eq('id', teamId);
  await supabase.from('team_members').delete().eq('team_id', teamId).eq('player_id', playerId);
  await clearLeadIfNeeded();
  await stripFromMatch();
}

/** DEMO helper: simulate an invited player completing install + registration —
 *  flips them from pending to a confirmed, eligible member. In production this
 *  happens for real when they register against the invite link. */
export async function markPlayerRegistered(playerId: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    const p = demo.players.find((x) => x.id === playerId);
    if (p) { p.invited = false; p.phoneVerified = true; p.emailVerified = true; p.dob = p.dob ?? '1998-01-01'; }
    return;
  }
  // live: real registration claims the record — nothing to simulate.
}

/** Update the proposed replacement or a captain's confirmation on an open dispute. */
export async function updateDispute(
  id: string,
  patch: Partial<Pick<MatchDispute, 'replacementId' | 'replacementName' | 'homeCaptainOk' | 'awayCaptainOk'>>,
  actor?: DisputeActor,
): Promise<void> {
  const now = new Date().toISOString();
  const by = { byId: actor?.id, byName: actorNameOf(actor) };
  const events: DisputeEvent[] = [];
  if (patch.replacementId) events.push({ action: 'proposed', at: now, ...by, note: `proposed ${patch.replacementName ?? 'a replacement'}` });
  if (patch.homeCaptainOk) events.push({ action: 'confirmed', at: now, ...by, note: 'home captain confirmed' });
  if (patch.awayCaptainOk) events.push({ action: 'confirmed', at: now, ...by, note: 'away captain confirmed' });

  if (!isSupabaseConfigured || !supabase) {
    const d = demo.disputes.find((x) => x.id === id);
    if (d) { Object.assign(d, patch); if (events.length) d.history = [...(d.history ?? []), ...events]; }
    return;
  }
  const row: Record<string, unknown> = {};
  if ('replacementId' in patch) row.replacement_id = patch.replacementId ?? null;
  if ('replacementName' in patch) row.replacement_name = patch.replacementName ?? null;
  if ('homeCaptainOk' in patch) row.home_captain_ok = patch.homeCaptainOk;
  if ('awayCaptainOk' in patch) row.away_captain_ok = patch.awayCaptainOk;
  await supabase.from('match_disputes').update(row).eq('id', id);
  for (const e of events) await appendDisputeHistory(id, e);
}

export async function dismissDispute(id: string, actor?: DisputeActor): Promise<void> {
  const event: DisputeEvent = { action: 'dismissed', at: new Date().toISOString(), byId: actor?.id, byName: actorNameOf(actor) };
  if (!isSupabaseConfigured || !supabase) {
    const d = demo.disputes.find((x) => x.id === id);
    if (d) { d.status = 'dismissed'; d.history = [...(d.history ?? []), event]; }
    return;
  }
  await supabase.from('match_disputes').update({ status: 'dismissed' }).eq('id', id);
  await appendDisputeHistory(id, event);
}

/** Apply an agreed reassignment — requires a replacement plus BOTH captains'
 *  confirmation. Moves the disputed match's stats, squad slot and lineup entry to
 *  the correct player, then closes the dispute. */
export async function resolveDispute(id: string, actor?: DisputeActor): Promise<void> {
  const nameOf = (pid: string) => demo.players.find((p) => p.id === pid)?.fullName;
  if (!isSupabaseConfigured || !supabase) {
    const d = demo.disputes.find((x) => x.id === id);
    if (!d || d.status !== 'open') return;
    if (!d.replacementId || !d.homeCaptainOk || !d.awayCaptainOk)
      throw new Error('Pick a replacement and get both captains to confirm first.');
    const replId = d.replacementId;
    demo.statLines.forEach((l) => { if (l.matchId === d.matchId && l.playerId === d.playerId) l.playerId = replId; });
    const sq = demo.matchSquads[d.matchId];
    if (sq) (['home', 'away'] as const).forEach((s) => {
      sq[s].starters = sq[s].starters.map((x) => (x === d.playerId ? replId : x));
      sq[s].subs = sq[s].subs.map((x) => (x === d.playerId ? replId : x));
    });
    const lu = demo.lineups[d.matchId];
    if (lu) (['home', 'away'] as const).forEach((s) => {
      lu[s]?.forEach((slot) => { if (slot.playerId === d.playerId) { slot.playerId = replId; slot.playerName = nameOf(replId) ?? d.replacementName; } });
    });
    const resolvedName = nameOf(replId) ?? d.replacementName;
    d.status = 'resolved'; d.resolvedAt = new Date().toISOString(); d.replacementName = resolvedName;
    d.history = [...(d.history ?? []), { action: 'resolved', at: d.resolvedAt, byId: actor?.id, byName: actorNameOf(actor), note: `reassigned to ${resolvedName ?? 'the correct player'}` }];
    return;
  }
  const { data } = await supabase.from('match_disputes').select('*').eq('id', id).maybeSingle();
  if (!data) return;
  const d = rowToDispute(data);
  if (!d.replacementId || !d.homeCaptainOk || !d.awayCaptainOk) throw new Error('Pick a replacement and get both captains to confirm first.');
  await supabase.from('stat_lines').update({ player_id: d.replacementId }).eq('match_id', d.matchId).eq('player_id', d.playerId);
  const resolvedAt = new Date().toISOString();
  await supabase.from('match_disputes').update({ status: 'resolved', resolved_at: resolvedAt }).eq('id', id);
  await appendDisputeHistory(id, { action: 'resolved', at: resolvedAt, byId: actor?.id, byName: actorNameOf(actor), note: `reassigned to ${d.replacementName ?? 'the correct player'}` });
}

// Test/inspection hook (parity with the other __sportfolio* engines): drive the
// dispute lifecycle deterministically and read the resulting audit trail.
(globalThis as unknown as Record<string, unknown>).__sportfolioDisputes = {
  raiseDispute, escalateDispute, updateDispute, resolveDispute, dismissDispute, getMatchDisputes,
};

/** Set a team's manager/coach for a match (optional — local games often have none). */
export async function setMatchManagers(matchId: string, managers: { home?: string; away?: string }): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    const m = demo.matches.find((x) => x.id === matchId);
    if (m) m.managers = { ...(m.managers ?? {}), ...managers };
    return;
  }
  const { data } = await supabase.from('matches').select('managers').eq('id', matchId).maybeSingle();
  await supabase.from('matches').update({ managers: { ...((data?.managers as object) ?? {}), ...managers } }).eq('id', matchId);
}

type MatchMeta = { sport: string; home_team_id: string; away_team_id: string };
export async function updateMatchSnapshot(matchId: string, state: object, completed: boolean): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    const m = demo.matches.find((x) => x.id === matchId);
    if (!m) return;
    m.state = state;
    // A match closed by hand keeps its result: never re-derived, never back to live.
    const out = snapshotOutcome(m.result, completed);
    m.status = out.status;
    if (out.rederive) {
      const res = deriveResult(m.sport, state);
      m.winner = res?.winner;
      m.score = res ? { home: res.home, away: res.away } : undefined;
      const winTeam = res && res.winner !== 'draw' ? (res.winner === 'home' ? m.homeTeam : m.awayTeam) : null;
      const winRoster = winTeam
        ? (winTeam.roster && winTeam.roster.length ? winTeam.roster : demo.players.filter((p) => p.houseName === winTeam.name).map((p) => p.id))
        : [];
      for (const l of demo.statLines) if (l.matchId === matchId) l.won = !!winTeam && winRoster.includes(l.playerId);
    }
    // SD-11: appearance lines + W/D/L/T/NR (a manual result too — a correction
    // may have changed who came on).
    if (completed || m.result) await syncMatchAppearances(matchId, state);
    return;
  }

  // On completion, derive the result (winner + score) from the sport plugin and
  // persist it: the winner column drives standings/records, and each player's
  // stat line gets its `won` flag set so career wins/win-rate are correct.
  // A match closed by hand (parity #04) keeps its result: a later snapshot — a
  // correction, or a stale second device — only refreshes the state.
  const { data: manual, error: manualErr } = await supabase.from('matches').select('result').eq('id', matchId).maybeSingle();
  const manualResult = manualErr ? null : (manual as { result?: MatchResult | null } | null)?.result;
  if (manualResult) {
    await supabase.from('matches').update({ state, status: snapshotOutcome(manualResult, completed).status, updated_at: new Date().toISOString() }).eq('id', matchId);
    await syncMatchAppearances(matchId, state);
    return;
  }
  let winner: 'home' | 'away' | 'draw' | null = null;
  let meta: MatchMeta | null = null;
  if (completed) {
    const { data } = await supabase.from('matches').select('sport, home_team_id, away_team_id').eq('id', matchId).single();
    meta = (data as MatchMeta | null) ?? null;
    winner = meta ? (deriveResult(meta.sport, state)?.winner ?? null) : null;
  }
  await supabase
    .from('matches')
    .update({ state, status: completed ? 'completed' : 'live', winner, updated_at: new Date().toISOString() })
    .eq('id', matchId);

  if (completed && meta) {
    // Reset, then flag the winning side's players (handles draws + re-completion).
    await supabase.from('stat_lines').update({ won: false }).eq('match_id', matchId);
    if (winner && winner !== 'draw') {
      const winTeamId = winner === 'home' ? meta.home_team_id : meta.away_team_id;
      const winners = (await getTeamRosters([winTeamId])).get(winTeamId) ?? [];
      if (winners.length) await supabase.from('stat_lines').update({ won: true }).eq('match_id', matchId).in('player_id', winners);
    }
    // SD-11: appearance lines + each line's W/D/L/T/NR (and `won` from the squad).
    await syncMatchAppearances(matchId, state);
  }
}

/** End a match early with an EXPLICIT winner — a retirement, walkover, or default
 *  (an opponent conceding), where the sport's normal end condition was never met.
 *  Keeps whatever score is on the board and stamps the winner + completed status
 *  directly (toMatch falls back to this stored winner when the state isn't a
 *  natural completion). `reason` is for the caller's log/UX; not persisted yet. */
/** Set each player's `won` flag for a finished match (winning side's roster →
 *  true, everyone else false; no winner → all false). */
async function flagWinners(matchId: string, winner: 'home' | 'away' | 'draw' | null): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    const m = demo.matches.find((x) => x.id === matchId);
    if (!m) return;
    const winTeam = winner === 'home' ? m.homeTeam : winner === 'away' ? m.awayTeam : null;
    const winRoster = !winTeam ? [] : winTeam.roster && winTeam.roster.length
      ? winTeam.roster
      : demo.players.filter((p) => p.houseName === winTeam.name).map((p) => p.id);
    for (const l of demo.statLines) if (l.matchId === matchId) l.won = winRoster.includes(l.playerId);
    return;
  }
  await supabase.from('stat_lines').update({ won: false }).eq('match_id', matchId);
  if (winner !== 'home' && winner !== 'away') return;
  const { data } = await supabase.from('matches').select('home_team_id, away_team_id').eq('id', matchId).single();
  const meta = data as { home_team_id: string; away_team_id: string } | null;
  if (!meta) return;
  const winTeamId = winner === 'home' ? meta.home_team_id : meta.away_team_id;
  const winners = (await getTeamRosters([winTeamId])).get(winTeamId) ?? [];
  if (winners.length) await supabase.from('stat_lines').update({ won: true }).eq('match_id', matchId).in('player_id', winners);
}

/** Close a match by hand — abandoned, no result, draw/tie, conceded, awarded —
 *  with the reason (parity #04). `matches.result` is the ONLY result store
 *  (REVIEW Decision 1); a correction (#05) calls this again. Returns 'legacy' when
 *  the database has no `result` column yet (migration 0040): the outcome is saved
 *  the old way and the reason isn't. */
export async function endMatchManually(matchId: string, r: MatchResult): Promise<'full' | 'legacy'> {
  const winner: 'home' | 'away' | 'draw' | null =
    r.kind === 'draw' || r.kind === 'tie' ? 'draw' : r.kind === 'no_result' || r.kind === 'abandoned' ? null : r.winner ?? null;
  if (!isSupabaseConfigured || !supabase) {
    const m = demo.matches.find((x) => x.id === matchId);
    if (!m) return 'full';
    m.status = 'completed';
    m.result = r;
    m.winner = winner ?? undefined;
    if (r.score) m.score = r.score;
    await flagWinners(matchId, winner);
    await syncMatchAppearances(matchId);
    return 'full';
  }
  const now = new Date().toISOString();
  const lockCleared = { active_scorer_id: null, active_scorer_device: null, active_scorer_at: null };
  let res = await supabase.from('matches').update({ status: 'completed', result: r, winner, updated_at: now, ...lockCleared }).eq('id', matchId).select('id');
  // No scoring-lock columns yet (0039) → without them.
  if (res.error && /active_scorer/.test(res.error.message)) res = await supabase.from('matches').update({ status: 'completed', result: r, winner, updated_at: now }).eq('id', matchId).select('id');
  if (res.error && /result/.test(res.error.message)) {
    // Before migration 0040: keep the outcome, lose the reason.
    if (r.kind === 'no_result' || r.kind === 'abandoned') {
      // A direct update — setMatchStatus only handles pre-match statuses.
      const c = await supabase.from('matches').update({ status: 'cancelled', winner: null, updated_at: now }).eq('id', matchId).select('id');
      if (c.error) throw new Error(c.error.message);
    } else {
      const c = await supabase.from('matches').update({ status: 'completed', winner, updated_at: now }).eq('id', matchId).select('id');
      if (c.error) throw new Error(c.error.message);
    }
    await flagWinners(matchId, winner);
    await syncMatchAppearances(matchId);
    return 'legacy';
  }
  if (res.error) throw new Error(res.error.message);
  if (!res.data?.length) throw new Error('You can’t end this match.');
  await flagWinners(matchId, winner);
  await syncMatchAppearances(matchId);
  return 'full';
}

/** End early with a winner (retirement / injury) — an awarded manual result. */
export async function retireMatch(matchId: string, winner: 'home' | 'away', reason: string): Promise<void> {
  await endMatchManually(matchId, { kind: 'awarded', winner, reason: reason || 'Retired', at: new Date().toISOString() });
}

/** Move a scheduled match — new date/time and/or venue — without recreating it.
 *  Only the provided fields change. (Kept separate from updateMatchSnapshot, which
 *  owns live state/status.) */
export async function rescheduleMatch(
  matchId: string,
  patch: { startsAt?: string; venueName?: string | null; venueMapsUrl?: string | null }
): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    const m = demo.matches.find((x) => x.id === matchId);
    if (!m) return;
    if (patch.startsAt !== undefined) m.startsAt = patch.startsAt;
    if (patch.venueName !== undefined) m.venueName = patch.venueName ?? undefined;
    if (patch.venueMapsUrl !== undefined) m.venueMapsUrl = patch.venueMapsUrl ?? undefined;
    return;
  }
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.startsAt !== undefined) row.starts_at = patch.startsAt;
  if (patch.venueName !== undefined) row.venue_name = patch.venueName;
  if (patch.venueMapsUrl !== undefined) row.venue_maps_url = patch.venueMapsUrl;
  await supabase.from('matches').update(row).eq('id', matchId).eq('status', 'scheduled');
}

/** Postpone / cancel a scheduled match, or restore a postponed one to scheduled.
 *  Guarded to the pre-match states so this never clobbers a live/completed game. */
export async function setMatchStatus(matchId: string, status: 'scheduled' | 'postponed' | 'cancelled'): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    const m = demo.matches.find((x) => x.id === matchId);
    if (m && (m.status === 'scheduled' || m.status === 'postponed' || m.status === 'cancelled')) m.status = status;
    return;
  }
  await supabase
    .from('matches')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', matchId)
    .in('status', ['scheduled', 'postponed', 'cancelled']);
}

/** The pre-match states — the only ones a match can be hard-deleted from. A live
 *  or completed game has real scoring data (events, stat lines, standings impact)
 *  and can only be Cancelled, never deleted. */
const DELETABLE_STATUSES = ['scheduled', 'postponed', 'cancelled'] as const;
const isDeletableStatus = (s: MatchStatus): boolean => (DELETABLE_STATUSES as readonly string[]).includes(s);

/** Permanently delete a match — allowed ONLY for a pre-match fixture (never a
 *  live/completed one, so scoring data can't be destroyed). Child rows (events,
 *  stat lines, lineups, squads, disputes) cascade-delete in the DB. */
export async function deleteMatch(matchId: string, opts?: { played?: boolean }): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    const idx = demo.matches.findIndex((x) => x.id === matchId);
    if (idx < 0) return;
    const m = demo.matches[idx];
    if (!isDeletableStatus(m.status)) {
      // A played delete (parity #13): friendlies only, live or inside the window.
      if (!opts?.played) throw new Error('Only a match that has not started can be deleted.');
      const at = await getMatchLastActivityAt(matchId);
      const ok = !m.tournamentId && (m.status === 'live' || (m.status === 'completed' && at != null && Date.now() - at < 30 * 60000));
      if (!ok) throw new Error('Couldn’t delete — past the window, or the server update isn’t installed yet.');
    }
    demo.matches.splice(idx, 1);
    delete demo.potm[matchId];
    delete demo.lineups[matchId];
    delete demo.matchEvents[matchId];
    delete demo.matchSquads[matchId];
    demo.statLines = demo.statLines.filter((l) => l.matchId !== matchId);
    demo.disputes = demo.disputes.filter((d) => d.matchId !== matchId);
    return;
  }
  if (opts?.played) {
    // A live / just-played friendly. The WHERE clause pins it to the current
    // status and a friendly; the "delete match" policy (0045) enforces hosts
    // only and the 30-minute window. Zero rows = refused.
    const { data: cur } = await supabase.from('matches').select('status').eq('id', matchId).maybeSingle();
    const status = (cur as { status?: string } | null)?.status;
    if (!status) throw new Error('Match not found.');
    const { data, error } = await supabase
      .from('matches').delete().eq('id', matchId).eq('status', status).is('tournament_id', null).select('id');
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) throw new Error('Couldn’t delete — past the window, or the server update isn’t installed yet.');
    return;
  }
  // The status guard lives in the WHERE clause, so a direct call can never delete
  // a live/completed match (it just matches zero rows). `.select()` returns the
  // deleted row(s) — an empty result means nothing was removed (RLS blocked it, or
  // the match isn't pre-match), which we surface instead of a false success.
  const { data, error } = await supabase
    .from('matches').delete().eq('id', matchId).in('status', DELETABLE_STATUSES as unknown as string[]).select('id');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Could not delete this match — it may have already started, or you may not have permission.');
}

/** Delete a whole series/tie — but only when every leg is still pre-match. If any
 *  leg has been played the series is preserved (delete the stray legs by hand). */
export async function deleteSeries(seriesId: string): Promise<void> {
  const legs = (await getMatches()).filter((m) => readSeriesMeta(m)?.id === seriesId);
  if (legs.length === 0) return;
  if (legs.some((m) => !isDeletableStatus(m.status))) {
    throw new Error('This series has matches that have already started — it can’t be deleted.');
  }
  for (const m of legs) await deleteMatch(m.id);
}

/* ----------------------------- Lineups (football) -------------------------- */

export async function getLineup(matchId: string, sport?: SportId, perSide?: number): Promise<MatchLineup> {
  // Blank formation comes from the sport's plugin (football's pitch by default),
  // sized to the team's players-per-side (7-a-side → 7 slots, etc.).
  const fresh = () => (sport ? getSport(sport).formation?.(perSide) ?? emptyFormation(perSide) : emptyFormation(perSide));
  const def = defaultFormationFor(perSide);
  const blank: MatchLineup = { home: fresh(), away: fresh(), homeFormation: def, awayFormation: def };
  if (!isSupabaseConfigured || !supabase) return demo.lineups[matchId] ?? blank;
  const { data } = await supabase
    .from('match_lineups')
    .select('home, away, home_formation, away_formation')
    .eq('match_id', matchId)
    .maybeSingle();
  if (!data) return blank;
  return {
    home: data.home ?? blank.home,
    away: data.away ?? blank.away,
    homeFormation: data.home_formation ?? blank.homeFormation,
    awayFormation: data.away_formation ?? blank.awayFormation,
  };
}

export async function setLineup(matchId: string, lineup: MatchLineup): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    demoSetLineup(matchId, lineup);
    return;
  }
  await supabase
    .from('match_lineups')
    .upsert({ match_id: matchId, home: lineup.home, away: lineup.away, home_formation: lineup.homeFormation ?? null, away_formation: lineup.awayFormation ?? null });
}

/* ------------------------- Matchday squads (XI + subs) --------------------- */

const blankSquads = (): MatchSquads => ({ home: { starters: [], subs: [] }, away: { starters: [], subs: [] } });

export async function getMatchSquads(matchId: string): Promise<MatchSquads> {
  if (!isSupabaseConfigured || !supabase) return demo.matchSquads[matchId] ?? blankSquads();
  const { data } = await supabase.from('match_squads').select('side, starters, subs, keeper_id').eq('match_id', matchId);
  const out = blankSquads();
  for (const r of data ?? []) out[r.side as 'home' | 'away'] = { starters: r.starters ?? [], subs: r.subs ?? [], keeperId: r.keeper_id ?? undefined };
  return out;
}

export async function setMatchSquad(matchId: string, side: 'home' | 'away', squad: MatchSquad): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    setDemoMatchSquad(matchId, side, squad);
    return;
  }
  // NOTE: `keeper_id` column is demo-first — add it to the match_squads table to persist live.
  await supabase.from('match_squads').upsert({ match_id: matchId, side, starters: squad.starters, subs: squad.subs, keeper_id: squad.keeperId ?? null });
}

/** The matchday squad this team fielded in its most recent OTHER match, so the
 *  picker can offer a one-tap "copy last XI". Returns null if the team has no
 *  prior match with a set squad. (Demo-first; live is a post-pilot follow-up.) */
export async function getLastSquadForTeam(
  teamName: string, sport: SportId, excludeMatchId: string,
): Promise<{ starters: string[]; subs: string[] } | null> {
  // Works in both demo and live: getMatches() and getMatchSquads() each own the
  // demo↔live split, so we just compose them — the team's most recent prior match
  // in this sport that has a saved squad wins. (Previously demo-only; the live
  // branch returned null, so "Copy last match's XI" never offered anything once
  // pointed at Supabase.)
  const all = await getMatches();
  const past = all
    .filter((m) => m.id !== excludeMatchId && m.sport === sport && (m.homeTeam.name === teamName || m.awayTeam.name === teamName))
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  for (const m of past) {
    const sq = await getMatchSquads(m.id);
    const s = sq[m.homeTeam.name === teamName ? 'home' : 'away'];
    if (s && (s.starters.length || s.subs.length)) return { starters: s.starters, subs: s.subs };
  }
  return null;
}

/* ------------------------ Sport-specific player profile -------------------- */

export async function getFootballProfile(playerId: string): Promise<FootballProfile> {
  if (!isSupabaseConfigured || !supabase) return demo.footballProfiles[playerId] ?? {};
  const { data } = await supabase
    .from('player_sport_profiles')
    .select('data')
    .eq('player_id', playerId)
    .eq('sport', 'football')
    .maybeSingle();
  return (data?.data as FootballProfile) ?? {};
}

export async function setFootballProfile(playerId: string, profile: FootballProfile): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    demoSetFootballProfile(playerId, profile);
    return;
  }
  await supabase
    .from('player_sport_profiles')
    .upsert({ player_id: playerId, sport: 'football', data: profile });
}

/* -------------------------------- Follows ---------------------------------- */

export type FollowTargetType = 'player' | 'team' | 'tournament';

/** All of a user's follows as `"<type>:<id>"` keys (for the follow store). */
export async function getFollows(profileId?: string): Promise<string[]> {
  if (!isSupabaseConfigured || !supabase || !profileId) return [];
  const { data, error } = await supabase
    .from('follows')
    .select('target_type, target_id')
    .eq('follower_id', profileId);
  if (error || !data) return [];
  return data.map((r) => `${r.target_type}:${r.target_id}`);
}

export async function setFollow(
  targetType: FollowTargetType,
  targetId: string,
  follow: boolean,
  profileId?: string
): Promise<void> {
  if (!isSupabaseConfigured || !supabase || !profileId) return; // demo: followStore only
  if (follow) {
    await supabase.from('follows').upsert({ follower_id: profileId, target_type: targetType, target_id: targetId });
  } else {
    await supabase
      .from('follows')
      .delete()
      .eq('follower_id', profileId)
      .eq('target_type', targetType)
      .eq('target_id', targetId);
  }
}

/** Alert choices of every follow (#23), keyed "<type>:<id>". Only rows with OFF
 *  switches are returned. Any error (e.g. the follow_prefs migration isn't run
 *  yet) → {} so every alert stays on. */
export async function getFollowPrefs(profileId?: string): Promise<Record<string, FollowPrefs>> {
  if (!isSupabaseConfigured || !supabase || !profileId) return {};
  try {
    const { data, error } = await supabase
      .from('follows')
      .select('target_type, target_id, prefs')
      .eq('follower_id', profileId)
      .not('prefs', 'is', null);
    if (error || !data) return {};
    const out: Record<string, FollowPrefs> = {};
    for (const r of data as { target_type: string; target_id: string; prefs: unknown }[]) {
      const p = serializePrefs(r.prefs as FollowPrefs);
      if (p) out[`${r.target_type}:${r.target_id}`] = p;
    }
    return out;
  } catch {
    return {};
  }
}

/** Save a follow's alert choices. All on is stored as null. Demo: the store only
 *  (returns true). Returns false when the write fails (no migration, offline). */
export async function setFollowPrefs(
  targetType: FollowTargetType,
  targetId: string,
  prefs: FollowPrefs,
  profileId?: string
): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase || !profileId) return true; // demo: followStore only
  try {
    const { error } = await supabase
      .from('follows')
      .update({ prefs: serializePrefs(prefs) })
      .eq('follower_id', profileId)
      .eq('target_type', targetType)
      .eq('target_id', targetId);
    return !error;
  } catch {
    return false;
  }
}

export async function savePushToken(token: string, profileId?: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase || !profileId) return;
  await supabase.from('push_tokens').upsert({ profile_id: profileId, token });
}

/** Deliver a REMOTE push to other users (by player id) so it lands even when their
 *  app is closed / phone locked. RLS hides other users' push tokens from the client,
 *  so the actual token lookup + Expo send happens server-side in the `push-send`
 *  edge function (service role). Best-effort & demo-safe: no-ops without Supabase. */
export async function pushToPlayers(
  playerIds: string[],
  msg: { title: string; body: string; matchId?: string }
): Promise<void> {
  const ids = Array.from(new Set(playerIds.filter(Boolean)));
  if (!isSupabaseConfigured || !supabase || ids.length === 0) return;
  try {
    await supabase.functions.invoke('push-send', {
      body: { playerIds: ids, title: msg.title, body: msg.body, matchId: msg.matchId ?? null },
    });
  } catch {
    // best-effort — never let a failed push break the calling action
  }
}

/** Players eligible to play a given sport for a given house/team. A team with an
 *  explicit roster (created within a community) uses that; otherwise the roster
 *  is derived from players whose house matches the team name. */
/** A team's squad. Pass `teamId` whenever it's known: two teams can share a
 *  name (e.g. the same friendly side created twice), and a name lookup would
 *  then show the other one's players. */
export async function getRoster(teamName: string, sport: SportId, teamId?: string): Promise<Player[]> {
  if (!isSupabaseConfigured || !supabase) {
    const byId = teamId ? demo.teams.find((t) => t.id === teamId) : undefined;
    if (byId) {
      if (byId.roster?.length) { const ids = new Set(byId.roster); return demo.players.filter((p) => ids.has(p.id)); }
      return demo.players.filter((p) => p.houseName === byId.name && p.sports.includes(sport));
    }
    const team = demo.teams.find((t) => t.name === teamName && t.sport === sport && t.roster?.length);
    if (team?.roster?.length) {
      const ids = new Set(team.roster);
      return demo.players.filter((p) => ids.has(p.id));
    }
    return demo.players.filter((p) => p.houseName === teamName && p.sports.includes(sport));
  }
  // Live: an explicit team roster (ad-hoc friendly teams, or existing players
  // added by phone) takes precedence over the house-name-derived squad — mirrors
  // demo. Fall back to house-name only when no explicit roster is set (house teams).
  const { data: teamRows } = teamId
    ? await supabase.from('teams').select('id, roster').eq('id', teamId).limit(1)
    : await supabase.from('teams').select('id, roster').eq('name', teamName).eq('sport', sport).limit(1);
  const explicit = (teamRows?.[0]?.roster ?? null) as string[] | null;
  if (explicit && explicit.length) {
    const { data } = await supabase.from(PLAYERS_READ).select(PLAYER_SELECT).in('id', explicit);
    return (data as PlayerRow[] | null)?.map(toPlayer) ?? [];
  }
  const { data, error } = await supabase
    .from(PLAYERS_READ)
    .select(PLAYER_SELECT)
    .eq('house_name', teamName)
    .contains('sports', [sport]);
  if (error || !data) return [];
  return (data as PlayerRow[]).map(toPlayer);
}

/** Credit `by` of `stat` to a player for a match — the live-scoring → profile
 *  bridge. Read-modify-write keeps one stat line per (match, player, sport). */
export async function recordStatLine(args: {
  matchId: string;
  playerId: string;
  sport: SportId;
  stat: string;
  by: number;
  opponent?: string;
  /** stat keys tracked this match (for per-stat game coverage on profiles) */
  tracked?: string[];
}): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    recordStat({ ...args, date: undefined });
    return;
  }
  const { data: existing } = await supabase
    .from('stat_lines')
    .select('id, stats')
    .eq('match_id', args.matchId)
    .eq('player_id', args.playerId)
    .eq('sport', args.sport)
    .maybeSingle();
  if (existing) {
    const stats = { ...(existing.stats ?? {}) } as Record<string, number>;
    stats[args.stat] = (stats[args.stat] ?? 0) + args.by;
    await supabase.from('stat_lines').update({ stats, ...(args.tracked ? { tracked: args.tracked } : {}) }).eq('id', existing.id);
  } else {
    await supabase.from('stat_lines').insert({
      match_id: args.matchId,
      player_id: args.playerId,
      sport: args.sport,
      stats: { [args.stat]: args.by },
      opponent: args.opponent ?? null,
      tracked: args.tracked ?? null,
    });
  }
}

export interface NewPlayer {
  fullName: string;
  /** contact number — the person's primary identity key (one number ⇒ one person) */
  phone?: string;
  city?: string;
  houseName?: string;
  houseColor?: string;
  sports: SportId[];
  jerseyNo?: number;
}

/** Create an open community player profile, optionally linked to the signed-in account. */
export async function createPlayer(input: NewPlayer, profileId?: string): Promise<Player> {
  // Identity is the number: if it already belongs to someone, reuse that person
  // (merging in the sport) rather than making a second record for the same number.
  if (isValidPhone(input.phone)) {
    const existing = await findPlayerByPhone(input.phone!);
    if (existing) {
      const merged = [...new Set([...(existing.sports ?? []), ...input.sports])];
      // Best-effort: we may not be allowed to edit someone else's record.
      if (merged.length !== (existing.sports ?? []).length) await updatePlayer(existing.id, { sports: merged }).catch(() => {});
      return { ...existing, sports: merged };
    }
  }
  const phone = input.phone ? normalizePhone(input.phone) : undefined;
  if (!isSupabaseConfigured || !supabase) return addPlayer({ ...input, phone });
  const { data, error } = await supabase
    .from('players')
    .insert({
      full_name: input.fullName,
      phone: phone ?? null,
      sports: input.sports,
      house_name: input.houseName ?? null,
      house_color: input.houseColor ?? null,
      city: input.city ?? null,
      jersey_no: input.jerseyNo ?? null,
      profile_id: profileId ?? null,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Could not create profile');
  const created = await getPlayer(data.id as string);
  if (!created) throw new Error('Could not create profile');
  return created;
}

export type PlayerPatch = Partial<
  Pick<Player, 'fullName' | 'city' | 'gender' | 'bio' | 'houseName' | 'jerseyNo' | 'sports' | 'phone' | 'email' | 'phoneVerified' | 'emailVerified' | 'photoUrl' | 'sportDetails' | 'dob' | 'guardian' | 'verification' | 'showPhone' | 'showEmail' | 'findableByContact'>
>;

/** Where verification documents and support cases are routed for the support team.
 *  Kept in sync with SUPPORT_EMAIL in supabase/functions/support-escalate. */
export const SUPPORT_EMAIL = 'sportnnote@gmail.com';

/** Details of an escalated support case (see data/supportKB.ts SupportCaseContext). */
export interface SupportCaseInput {
  question: string;
  tried?: string;
  handle?: string;
  appVersion?: string;
}

/**
 * Escalate a support case to the human support team.
 * - Live mode: records the case + emails SUPPORT_EMAIL via the `support-escalate`
 *   edge function; returns { delivered } (delivered=false if email isn't wired yet).
 * - Demo mode (or on any failure): returns { delivered: false } so the caller
 *   falls back to opening a pre-filled email (buildSupportMailto).
 */
export async function submitSupportCase(input: SupportCaseInput): Promise<{ delivered: boolean }> {
  if (!isSupabaseConfigured || !supabase) return { delivered: false };
  try {
    const { data, error } = await supabase.functions.invoke('support-escalate', {
      body: { question: input.question, tried: input.tried, handle: input.handle, appVersion: input.appVersion },
    });
    if (error) return { delivered: false };
    return { delivered: data?.delivered === true };
  } catch {
    return { delivered: false };
  }
}

/** Delete the signed-in user's account (Settings → Delete my account).
 *  Server side: delete-account edge function → migration 0030. Returns an
 *  error message, or null on success (the caller then signs out). */
export async function deleteMyAccount(): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) return 'Account deletion isn’t available in demo mode.';
  try {
    const { data, error } = await supabase.functions.invoke('delete-account', { body: { confirm: 'DELETE' } });
    if (error) {
      const ctx = (error as { context?: Response }).context;
      const body = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) : null;
      return (body as { error?: string } | null)?.error ?? 'Couldn’t delete your account just now — check your connection and try again.';
    }
    return data?.deleted ? null : 'Couldn’t delete your account just now — please try again.';
  } catch {
    return 'Couldn’t delete your account just now — check your connection and try again.';
  }
}

/** Update a player's details — your own, or (parity #12) an unclaimed player you
 *  manage. Throws a friendly error when the server refused or matched no row. */
export async function updatePlayer(id: string, patch: PlayerPatch): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    const p = demo.players.find((x) => x.id === id);
    if (p) Object.assign(p, patch);
    return;
  }
  const row: Record<string, unknown> = {};
  if (patch.fullName !== undefined) row.full_name = patch.fullName;
  if (patch.city !== undefined) row.city = patch.city || null;
  if (patch.gender !== undefined) row.gender = patch.gender || null;
  if (patch.bio !== undefined) row.bio = patch.bio || null;
  if (patch.houseName !== undefined) row.house_name = patch.houseName || null;
  if (patch.jerseyNo !== undefined) row.jersey_no = patch.jerseyNo ?? null;
  if (patch.sports !== undefined) row.sports = patch.sports;
  if (patch.phone !== undefined) row.phone = patch.phone || null;
  if (patch.email !== undefined) row.email = patch.email || null;
  if (patch.phoneVerified !== undefined) row.phone_verified = patch.phoneVerified;
  if (patch.emailVerified !== undefined) row.email_verified = patch.emailVerified;
  if (patch.photoUrl !== undefined) { assertPersistable(patch.photoUrl); row.photo_url = patch.photoUrl || null; }
  if (patch.sportDetails !== undefined) row.sport_details = patch.sportDetails;
  if (patch.dob !== undefined) row.dob = patch.dob || null;
  if (patch.guardian !== undefined) row.guardian = patch.guardian ?? null;
  if (patch.verification !== undefined) row.verification = patch.verification ?? null;
  if (patch.showPhone !== undefined) row.show_phone = patch.showPhone;
  if (patch.showEmail !== undefined) row.show_email = patch.showEmail;
  if (patch.findableByContact !== undefined) row.findable_by_contact = patch.findableByContact;
  // .select('id'): an RLS-filtered update (a claimed player, or no right to it)
  // returns no error and no rows — surface that instead of a silent "Saved".
  const { data, error } = await supabase.from('players').update(row).eq('id', id).select('id');
  if (error) throw new Error(error.code === '42501' ? PLAYER_EDIT_REFUSED : error.message);
  if (!data || data.length === 0) throw new Error(PLAYER_EDIT_REFUSED);
}

const PLAYER_EDIT_REFUSED = 'You can’t edit this player any more — they may have joined and now manage their own profile';

/** May I edit this player — my own ('self'), an unclaimed player on a team /
 *  club / tournament I run ('admin', parity #12), or not at all? Live: the
 *  server's can_edit_player (before migration 0044 it only answers for the
 *  creator, so other managers simply don't see Edit). Demo: the demo user
 *  organises everything, so any unclaimed player on a demo team is 'admin'. */
export async function getPlayerEditAccess(playerId: string, meId?: string | null): Promise<EditAccess> {
  const player = await getPlayer(playerId);
  if (!player) return 'none';
  if (meId && meId === playerId) return 'self';
  if (!isSupabaseConfigured || !supabase) {
    const onTeam = demo.teams.some((t) => (t.roster && t.roster.length ? t.roster.includes(playerId) : player.houseName === t.name));
    return editAccess({ meId, player, canAdmin: onTeam });
  }
  const { data, error } = await supabase.rpc('can_edit_player', { p_player: playerId });
  return editAccess({ meId, player, canAdmin: !error && data === true });
}

/** Mark a contact channel verified (after a successful OTP check). */
export async function verifyContact(id: string, channel: 'phone' | 'email'): Promise<void> {
  await updatePlayer(id, channel === 'phone' ? { phoneVerified: true } : { emailVerified: true });
}

/**
 * Start verifying a player's own contact channel. For **email** in a live build
 * this emails a real 6-digit code (generated + stored hashed server-side) and
 * returns `{ sent: true }`. Otherwise — phone (no SMS provider yet), or email
 * when the edge function isn't deployed/keyed, or demo mode — there's no real
 * delivery, so it returns a client-side `demoCode` the UI shows and checks
 * locally (clearly labelled as temporary). */
export type OtpChannel = 'phone' | 'email' | 'guardian_phone';

/** How a verification code was delivered (drives the "we sent a code…" copy). */
export type OtpVia = 'email' | 'whatsapp' | 'sms';

// A phone verification currently in flight through Firebase SMS (web).
let firebasePending: { playerId: string; channel: OtpChannel } | null = null;

export async function beginContactVerification(playerId: string, channel: OtpChannel): Promise<{ sent: boolean; via?: OtpVia; demoCode?: string; reason?: string }> {
  // Phones on the web: an SMS through Firebase (no DLT needed — Google sends it).
  if (isSupabaseConfigured && supabase && channel !== 'email' && firebasePhoneAvailable()) {
    const p = await getPlayer(playerId);
    const number = channel === 'guardian_phone' ? p?.guardian?.phone : p?.phone;
    if (!number) return { sent: false, reason: 'Add the mobile number first.' };
    try {
      await sendPhoneCode(number);
      firebasePending = { playerId, channel };
      return { sent: true, via: 'sms' };
    } catch (e) {
      return { sent: false, reason: e instanceof Error ? e.message : 'Couldn’t send the SMS just now.' };
    }
  }
  if (isSupabaseConfigured && supabase) {
    // Live: only a REAL delivered code can verify (the server owns the verified
    // flags since migration 0025) — never fall back to an on-screen code here.
    let why: string | undefined;
    try {
      const { data, error } = await supabase.functions.invoke('send-contact-otp', { body: { playerId, channel } });
      const d = data as { sent?: boolean; reason?: string; detail?: string } | null;
      if (!error && d?.sent) return { sent: true, via: channel === 'email' ? 'email' : 'whatsapp' };
      why = d?.reason ?? error?.message;
      console.warn('send-contact-otp not delivered:', why, d?.detail ?? '');
    } catch (e) {
      console.warn('send-contact-otp failed:', e);
    }
    const reason = why === 'too-many' ? 'Too many codes requested — try again in an hour.'
      : why === 'no-whatsapp-config' ? 'Phone verification over WhatsApp is coming soon — it isn’t switched on yet.'
      : channel === 'email' ? 'Couldn’t email a code just now — try again in a few minutes.'
      : 'Couldn’t send a code to this number just now — try again later.';
    return { sent: false, reason };
  }
  return { sent: false, demoCode: String(Math.floor(100000 + Math.random() * 900000)) };
}

/** Verify an emailed OTP server-side; on success the edge function flips the
 *  player's email_verified flag. Returns whether the code matched. */
export async function verifyContactOtp(playerId: string, channel: OtpChannel, code: string): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;
  // Firebase SMS: confirm the code with Firebase, then let OUR server check
  // Google's signed token against the profile's number and set the flag.
  // Throws (with a user-facing message) on a wrong/expired code.
  if (firebasePending && firebasePending.playerId === playerId && firebasePending.channel === channel) {
    const idToken = await confirmPhoneCode(code);
    const { data, error } = await supabase.functions.invoke('verify-phone-firebase', { body: { playerId, channel, idToken } });
    const d = data as { verified?: boolean; reason?: string } | null;
    if (error || !d?.verified) throw new Error(d?.reason ?? 'Couldn’t verify the number — try again.');
    firebasePending = null;
    return true;
  }
  try {
    const { data, error } = await supabase.functions.invoke('verify-contact-otp', { body: { playerId, channel, code } });
    return !error && !!(data as { verified?: boolean } | null)?.verified;
  } catch {
    return false;
  }
}

/** Mark a guardian's contact channel verified (same OTP flow as the player's own). */
export async function verifyGuardianContact(id: string, channel: 'phone' | 'email'): Promise<void> {
  const p = await getPlayer(id);
  if (!p?.guardian) return;
  const guardian = { ...p.guardian, [channel === 'phone' ? 'phoneVerified' : 'emailVerified']: true };
  await updatePlayer(id, { guardian });
}

/** Submit a document (image/PDF) proving age & guardian relationship for the
 *  support team to review. In live mode the actual file is uploaded to the
 *  private `verification-docs` bucket and a signed link is emailed to
 *  SUPPORT_EMAIL (via the verification-submit edge function); the profile is
 *  marked "pending" either way. In demo mode only the metadata is recorded. */
export async function submitVerificationDoc(id: string, doc: PickedDoc): Promise<void> {
  const p = await getPlayer(id);
  const at = Date.now();
  let docPath: string | undefined;

  // Live mode: upload the real bytes, keyed by the uploader's auth id so Storage
  // RLS only lets them write into their own folder.
  if (isSupabaseConfigured && supabase) {
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (uid) {
        const ext = (doc.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
        const path = `${uid}/${id}/${at}.${ext}`;
        const blob = await (await fetch(doc.uri)).blob();
        const { error } = await supabase.storage.from('verification-docs').upload(path, blob, {
          contentType: doc.mimeType || blob.type || 'application/octet-stream',
          upsert: true,
        });
        if (error) console.warn('verification upload failed:', error.message);
        else docPath = path;
      }
    } catch (e) {
      console.warn('verification upload error:', e);
    }
  }

  // Fresh pending cycle, but the full history is carried forward (append-only).
  await updatePlayer(id, {
    verification: {
      status: 'pending',
      docName: doc.name,
      docPath,
      submittedAt: at,
      history: [...(p?.verification?.history ?? []), { action: 'submitted', at, docName: doc.name }],
    },
  });

  // Email the reviewer a signed link (best-effort — the row is already pending,
  // and the in-app review queue works regardless of whether email is wired up).
  if (isSupabaseConfigured && supabase && docPath) {
    try {
      await supabase.functions.invoke('verification-submit', { body: { playerId: id } });
    } catch (e) {
      console.warn('verification-submit invoke failed:', e);
    }
  }
}

/** A short-lived (1-hour) signed URL to a submitted verification document, for
 *  the reviewer console to open. Null in demo mode or when no file was stored. */
export async function verificationDocUrl(docPath?: string): Promise<string | null> {
  if (!docPath || !isSupabaseConfigured || !supabase) return null;
  const { data } = await supabase.storage.from('verification-docs').createSignedUrl(docPath, 60 * 60);
  return data?.signedUrl ?? null;
}

/** Profiles awaiting verification review (support console). */
export async function getPendingVerifications(): Promise<Player[]> {
  if (!isSupabaseConfigured || !supabase) {
    return demo.players.filter((p) => p.verification?.status === 'pending');
  }
  const { data } = await supabase.from(PLAYERS_READ).select(PLAYER_SELECT).eq('verification->>status', 'pending');
  return (data as PlayerRow[] | null)?.map(toPlayer) ?? [];
}

/** Support approves or rejects a submitted verification, recording who decided
 *  and when (audit trail). */
export async function reviewVerification(
  id: string,
  status: 'approved' | 'rejected',
  note?: string,
  reviewer?: { id?: string; name?: string }
): Promise<void> {
  const p = await getPlayer(id);
  const at = Date.now();
  await updatePlayer(id, {
    verification: {
      ...(p?.verification ?? {}),
      status,
      note,
      reviewedAt: at,
      reviewedById: reviewer?.id,
      reviewedByName: reviewer?.name,
      history: [...(p?.verification?.history ?? []), { action: status, at, byId: reviewer?.id, byName: reviewer?.name, note }],
    },
  });
}

/* ------------------------------ Connect board ------------------------------ */

const toListing = (r: any): Listing => ({
  id: r.id,
  kind: r.kind,
  sport: r.sport as SportId,
  authorId: r.author_id ?? undefined,
  authorName: r.author_name,
  teamName: r.team_name ?? undefined,
  position: r.position ?? undefined,
  city: r.city ?? undefined,
  details: r.details ?? '',
  preferredDate: r.preferred_date ?? undefined,
  level: r.level ?? undefined,
  contactPhone: r.contact_phone ?? undefined,
  contactVerified: r.contact_verified ?? undefined,
  createdAt: r.created_at,
});
const LISTING_SELECT = 'id, kind, sport, author_id, author_name, team_name, position, city, details, preferred_date, level, contact_phone, contact_verified, created_at';

/** Noticeboard posts, newest first, optionally filtered by kind and/or sport. */
export async function getListings(filter?: { kind?: Listing['kind']; sport?: SportId }): Promise<Listing[]> {
  if (!isSupabaseConfigured || !supabase) {
    return demo.listings.filter(
      (l) => (!filter?.kind || l.kind === filter.kind) && (!filter?.sport || l.sport === filter.sport)
    );
  }
  let q = supabase.from('listings').select(LISTING_SELECT).order('created_at', { ascending: false });
  if (filter?.kind) q = q.eq('kind', filter.kind);
  if (filter?.sport) q = q.eq('sport', filter.sport);
  const { data, error } = await q;
  if (error || !data) return [];
  return data.map(toListing);
}

export type NewListing = Omit<Listing, 'id' | 'createdAt'>;

export async function createListing(input: NewListing): Promise<Listing> {
  if (!isSupabaseConfigured || !supabase) {
    return demoAddListing({ ...input, createdAt: new Date().toISOString() });
  }
  const { data, error } = await supabase
    .from('listings')
    .insert({
      kind: input.kind,
      sport: input.sport,
      author_id: input.authorId ?? null,
      author_name: input.authorName,
      team_name: input.teamName ?? null,
      position: input.position ?? null,
      city: input.city ?? null,
      details: input.details,
      preferred_date: input.preferredDate ?? null,
      level: input.level ?? null,
      contact_phone: input.contactPhone ?? null,
      contact_verified: input.contactVerified ?? false,
    })
    .select(LISTING_SELECT)
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Could not post listing');
  return toListing(data);
}

export async function deleteListing(id: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    demoRemoveListing(id);
    return;
  }
  await supabase.from('listings').delete().eq('id', id);
}

/** The player linked to the signed-in profile (demo: the first sample player). */
export async function getMyPlayerId(profileId?: string): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) return demo.players[0]?.id ?? null;
  if (!profileId) return null;
  const { data } = await supabase.from('players').select('id').eq('profile_id', profileId).single();
  return data?.id ?? null;
}

/** Create the signed-in account's own player profile (once), linked via
 *  profile_id and seeded from the sign-up details (name/phone/dob/guardian).
 *  Idempotent — returns the existing player's id if one is already linked. */
export async function createMyPlayer(profileId: string): Promise<string> {
  if (!isSupabaseConfigured || !supabase) return demo.players[0]?.id ?? addPlayer({ fullName: 'You', sports: [] }).id;
  const existing = await getMyPlayerId(profileId);
  if (existing) return existing;
  // phone / dob / guardian are private profile columns (migration 0026) — read
  // our own through the RPC; the name is public.
  const [{ data: pub }, { data: priv }] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', profileId).single(),
    supabase.rpc('my_profile_private'),
  ]);
  const privRow = (priv as { phone: string | null; dob: string | null; guardian: Player['guardian'] | null }[] | null)?.[0];
  const prof = { full_name: (pub?.full_name as string | undefined) ?? null, phone: privRow?.phone ?? null, dob: privRow?.dob ?? null, guardian: privRow?.guardian ?? null };
  // The sign-in email is already proven (confirmation link), so seed it as the
  // player's contact email + mark it verified — no need to re-verify it later.
  const { data: authData } = await supabase.auth.getUser();
  // Mobile sign-ups have an internal placeholder address — not a real email.
  const rawEmail = authData.user?.email ?? null;
  const authEmail = rawEmail && !/@phone\.sportnnote\.in$/i.test(rawEmail) ? rawEmail : null;
  const emailVerified = !!(authEmail && authData.user?.email_confirmed_at);

  // If someone already added this person by phone (a provisional/invited player —
  // e.g. an invited captain), CLAIM that exact row instead of creating a fresh,
  // unlinked one. This is what puts an invitee straight into the team/captain slot
  // they were invited to, and it prevents two player rows sharing one number. RLS
  // ("players update scoped") permits setting profile_id on an unclaimed row.
  // The match runs server-side on OUR OWN number / confirmed email (phone is a
  // private column), skipping rows the person flagged as "not me".
  {
    const { data: claimable } = await supabase.rpc('my_claimable_player');
    const claimId = (claimable as string | null) ?? null;
    if (claimId) {
      const { data: claimed, error: claimErr } = await supabase
        .from('players')
        .update({
          profile_id: profileId,
          full_name: prof?.full_name ?? undefined,
          dob: prof?.dob ?? undefined,
          guardian: prof?.guardian ?? undefined,
          email: authEmail,
          email_verified: emailVerified,
        })
        .eq('id', claimId)
        .is('profile_id', null) // guard against a race — only claim if still unclaimed
        .select('id')
        .maybeSingle();
      if (!claimErr && claimed) return claimed.id as string;
      // else fall through and create a fresh player
    }
  }

  const { data, error } = await supabase
    .from('players')
    .insert({ profile_id: profileId, full_name: prof?.full_name ?? 'Player', sports: [], phone: prof?.phone ? normalizePhone(prof.phone) : null, dob: prof?.dob ?? null, guardian: prof?.guardian ?? null, email: authEmail, email_verified: emailVerified })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Could not create your profile');
  return data.id as string;
}

/* ----------------------------- Organizer writes ---------------------------- */

/** Tournament details (parity #09): images, where, what kind, who to call, rules. */
export interface TournamentDetails {
  logoUrl?: string | null;
  bannerUrl?: string | null;
  city?: string | null;
  grounds?: string[];
  eventCategory?: Tournament['eventCategory'] | null;
  about?: string | null;
  organiserPhone?: string | null;
  organiserEmail?: string | null;
}

/** Save tournament details. false = the database doesn't have the columns yet
 *  (migration 0041) — the rest of the tournament still saved. */
export async function saveTournamentDetails(id: string, d: TournamentDetails): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) {
    const t = demo.tournaments.find((x) => x.id === id);
    if (t) {
      for (const [k, v] of Object.entries(d)) if (v !== undefined) (t as unknown as Record<string, unknown>)[k] = v ?? undefined;
    }
    return true;
  }
  const row: Record<string, unknown> = {};
  if (d.logoUrl !== undefined) { assertPersistable(d.logoUrl); row.logo_url = d.logoUrl; }
  if (d.bannerUrl !== undefined) { assertPersistable(d.bannerUrl); row.banner_url = d.bannerUrl; }
  if (d.city !== undefined) row.city = d.city?.trim() || null;
  if (d.grounds !== undefined) row.grounds = d.grounds;
  if (d.eventCategory !== undefined) row.event_category = d.eventCategory;
  if (d.about !== undefined) row.about = d.about ? d.about.slice(0, 4000) : null;
  if (d.organiserPhone !== undefined) row.organiser_phone = d.organiserPhone?.trim() || null;
  if (d.organiserEmail !== undefined) row.organiser_email = d.organiserEmail?.trim() || null;
  if (!Object.keys(row).length) return true;
  const res = await supabase.from('tournaments').update(row).eq('id', id).select('id');
  if (res.error && (res.error.code === '42703' || res.error.code === 'PGRST204')) {
    // No detail columns yet: keep at least the logo (an older column).
    if (row.logo_url !== undefined) await supabase.from('tournaments').update({ logo_url: row.logo_url }).eq('id', id);
    return false;
  }
  if (res.error) throw new Error(res.error.message);
  return true;
}

/** Soft-delete a tournament (parity #09): hidden everywhere, its upcoming matches
 *  cancelled, completed results kept on players' profiles. Not while a match is live. */
export async function deleteTournament(id: string, by?: { playerId?: string; name?: string }): Promise<void> {
  const matches = (await getMatches()).filter((m) => m.tournamentId === id);
  if (matches.some((m) => m.status === 'live')) throw new Error('A match is live right now — finish or end it first.');
  const upcoming = matches.filter((m) => m.status === 'scheduled' || m.status === 'postponed');
  if (!isSupabaseConfigured || !supabase) {
    const t = demo.tournaments.find((x) => x.id === id);
    if (t) t.deletedAt = new Date().toISOString();
    for (const m of upcoming) { const dm = demo.matches.find((x) => x.id === m.id); if (dm) dm.status = 'cancelled'; }
    return;
  }
  const res = await supabase.from('tournaments').update({ deleted_at: new Date().toISOString() }).eq('id', id).select('id');
  if (res.error && (res.error.code === '42703' || res.error.code === 'PGRST204')) throw new Error('Deleting tournaments needs a database update first.');
  if (res.error) throw new Error(res.error.message);
  if (!res.data?.length) throw new Error('You can’t delete this tournament.');
  for (const m of upcoming) await supabase.from('matches').update({ status: 'cancelled' }).eq('id', m.id);
  await logActivity({ scope: 'tournament', refId: id, action: 'tournament.deleted', detail: `${upcoming.length} upcoming match${upcoming.length === 1 ? '' : 'es'} cancelled`, byPlayerId: by?.playerId, byName: by?.name }).catch(() => {});
}

export interface NewTournament extends TournamentDetails {
  name: string;
  hostName: string;
  /** when an organization hosts; otherwise the creator is the individual host */
  hostOrgId?: string;
  /** open for registration (discoverable) */
  isOpen?: boolean;
  /** registration deadline (ISO) + field-size bounds */
  registrationDeadline?: string;
  minTeams?: number;
  maxTeams?: number;
  /** medal/position scoring for a multi-sport meet */
  scoring?: Tournament['scoring'];
  /** who the tournament is contested by (spec §25); defaults to 'open' */
  participation?: Tournament['participation'];
  sports: SportId[];
  startDate: string;
  endDate: string;
  formats?: Partial<Record<SportId, Record<string, number | string | boolean>>>;
  structure?: 'league' | 'knockout' | 'league_knockout';
  knockoutFormat?: Tournament['knockoutFormat'];
  /** organizer's per-tournament reminder lead times (minutes before kickoff); absent ⇒ players use their own */
  reminderLeadMinutes?: number[];
  /** additional individual co-hosts (player ids) to add alongside the creator */
  coHostIds?: string[];
  /** divisions (age × gender) to create for this tournament, if any */
  categories?: NewTournamentCategory[];
}

export async function createTournament(input: NewTournament): Promise<Tournament & { profileSaved?: boolean }> {
  // D1: a new tournament stores each sport's international points system
  // (basketball FIBA win 2 / loss 1) unless the organiser already chose points.
  input = { ...input, formats: newTournamentFormats(input.sports, input.formats) };
  const me = demo.players[0]?.id;
  // Org-hosted → no individual hostIds (the org's members are the hosts);
  // otherwise the creator is the sole individual host.
  if (!isSupabaseConfigured || !supabase) {
    const t = addTournament({ ...(input as Omit<NewTournament, keyof TournamentDetails>), ...(Object.fromEntries(Object.entries(pickDetails(input)).map(([k, v]) => [k, v ?? undefined])) as Partial<Tournament>), isOpen: input.isOpen, createdBy: me, hostIds: [...new Set([...(input.hostOrgId ? [] : me ? [me] : []), ...(input.coHostIds ?? [])])] });
    if (input.categories?.length) addTournamentCategoriesDemo(t.id, input.categories);
    await recordOwnershipCreated(t, me);
    return t;
  }
  const { data: auth } = await supabase.auth.getUser();
  // Hosts are tracked by player id (what the host UI checks), so the creator's
  // player id — not the auth/profile id — becomes the first host.
  const myPlayerId = auth.user?.id ? await getMyPlayerId(auth.user.id) : null;
  const { data, error } = await supabase
    .from('tournaments')
    .insert({
      name: input.name,
      host_name: input.hostName,
      host_org_id: input.hostOrgId ?? null,
      sports: input.sports,
      start_date: input.startDate,
      end_date: input.endDate,
      formats: input.formats ?? {},
      structure: input.structure ?? null,
      knockout_format: input.knockoutFormat ?? null,
      organizer_id: auth.user?.id ?? null,
      ...(myPlayerId ? { created_by: myPlayerId } : {}),
      host_ids: [...new Set([...(input.hostOrgId ? [] : myPlayerId ? [myPlayerId] : []), ...(input.coHostIds ?? [])])],
      is_open: input.isOpen ?? false,
      reminder_lead_minutes: input.reminderLeadMinutes ?? null,
      // Registration columns need migration 0014 — include only when actually set,
      // so creating a tournament still works before the migration is applied.
      ...(input.registrationDeadline != null ? { registration_deadline: input.registrationDeadline } : {}),
      ...(input.minTeams != null ? { min_teams: input.minTeams } : {}),
      ...(input.maxTeams != null ? { max_teams: input.maxTeams } : {}),
      ...(input.scoring != null ? { scoring: input.scoring } : {}),
      ...(input.participation != null ? { participation: input.participation } : {}),
    })
    .select(TOURNAMENT_COLS_BASE) // reg columns (0014) aren't set at creation
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Could not create tournament');
  // created_by isn't in the base select (kept narrow for pre-0021 safety) — merge it.
  const tournament = { ...toTournament(data), createdBy: myPlayerId ?? undefined };
  // Attach divisions, if any (best-effort — needs migration 0008; a tournament
  // without categories is valid, so don't fail creation if this can't be stored).
  if (input.categories?.length) {
    try { await addTournamentCategories(tournament.id, input.categories); } catch { /* pre-0008 or transient */ }
  }
  await recordOwnershipCreated(tournament, myPlayerId);
  // Details (banner, city, grounds, contact…) — migration 0041; degrade if absent.
  const details = pickDetails(input);
  const profileSaved = Object.keys(details).length ? await saveTournamentDetails(tournament.id, details) : true;
  return { ...tournament, ...details, profileSaved } as Tournament & { profileSaved: boolean };
}

const DETAIL_KEYS = ['logoUrl', 'bannerUrl', 'city', 'grounds', 'eventCategory', 'about', 'organiserPhone', 'organiserEmail'] as const;
function pickDetails(x: TournamentDetails): TournamentDetails {
  const out: Record<string, unknown> = {};
  for (const k of DETAIL_KEYS) if (x[k] !== undefined) out[k] = x[k];
  return out as TournamentDetails;
}

/* ------------------------- Tournament ownership & transfer ----------------- */
// Ownership is individual (host_ids) or org (host_org_id). Transfers move between
// the two and are recorded in tournament_ownership_events with snapshotted names,
// so the audit trail survives renames/deletes. The creator (created_by) is retained.

const toOwnershipEvent = (r: any): OwnershipEvent => ({
  id: r.id,
  tournamentId: r.tournament_id,
  action: r.action,
  fromKind: r.from_kind ?? undefined,
  fromName: r.from_name ?? undefined,
  toKind: r.to_kind,
  toName: r.to_name ?? undefined,
  byPlayerId: r.by_player_id ?? undefined,
  byName: r.by_name ?? undefined,
  at: r.at,
});

/** A readable label + kind for a tournament's CURRENT owner. */
async function ownerLabelOf(t: Tournament): Promise<{ kind: 'individual' | 'org'; name: string }> {
  if (t.hostOrgId) return { kind: 'org', name: (await getOrganization(t.hostOrgId))?.name ?? 'Organization' };
  const pid = t.hostIds?.[0] ?? t.createdBy;
  const name = pid ? (await getPlayer(pid))?.fullName ?? 'Individual' : 'Individual';
  return { kind: 'individual', name };
}

/** A readable label + kind for a transfer target. */
async function ownerLabelForTarget(target: OwnerRef): Promise<{ kind: 'individual' | 'org'; name: string }> {
  if (target.kind === 'org') return { kind: 'org', name: (await getOrganization(target.orgId))?.name ?? 'Organization' };
  const pid = target.playerIds[0];
  const name = pid ? (await getPlayer(pid))?.fullName ?? 'Individual' : 'Individual';
  return { kind: 'individual', name };
}

async function insertOwnershipEvent(e: Omit<OwnershipEvent, 'id' | 'at'>): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    demo.ownershipEvents.push({ ...e, id: genId('own'), at: new Date().toISOString() });
    return;
  }
  await supabase.from('tournament_ownership_events').insert({
    tournament_id: e.tournamentId, action: e.action,
    from_kind: e.fromKind ?? null, from_name: e.fromName ?? null,
    to_kind: e.toKind, to_name: e.toName ?? null,
    by_player_id: e.byPlayerId ?? null, by_name: e.byName ?? null,
  });
}

/** Best-effort 'created' audit entry at tournament creation (never fails creation). */
async function recordOwnershipCreated(t: Tournament, byPlayerId?: string | null): Promise<void> {
  try {
    const to = await ownerLabelOf(t);
    const byName = byPlayerId ? (await getPlayer(byPlayerId))?.fullName : undefined;
    await insertOwnershipEvent({ tournamentId: t.id, action: 'created', toKind: to.kind, toName: to.name, byPlayerId: byPlayerId ?? undefined, byName });
  } catch { /* pre-0021 or transient — audit is non-critical */ }
}

/** Transfer a tournament's ownership between an individual and an organization
 *  (either direction). Records the transfer in the audit trail. The creator
 *  (created_by) is never changed. */
export async function transferTournamentOwnership(tournamentId: string, target: OwnerRef, byPlayerId?: string): Promise<void> {
  const t = (await getTournaments()).find((x) => x.id === tournamentId);
  if (!t) return;
  const from = await ownerLabelOf(t);
  const to = await ownerLabelForTarget(target);
  if (!isSupabaseConfigured || !supabase) {
    const d = demo.tournaments.find((x) => x.id === tournamentId);
    if (d) {
      d.hostOrgId = target.kind === 'org' ? target.orgId : undefined;
      d.hostIds = target.kind === 'individual' ? target.playerIds : [];
      d.hostName = to.name;
    }
    const byName = byPlayerId ? (await getPlayer(byPlayerId))?.fullName : undefined;
    await insertOwnershipEvent({ tournamentId, action: 'transferred', fromKind: from.kind, fromName: from.name, toKind: to.kind, toName: to.name, byPlayerId, byName });
    return;
  }
  // Live: one atomic server call moves ownership AND writes the audit row (the
  // actor is stamped server-side). It also clears the previous owner's implicit
  // organizer control, so a transfer really hands the tournament over.
  const { error } = await supabase.rpc('transfer_tournament_ownership', {
    p_tid: tournamentId,
    p_org: target.kind === 'org' ? target.orgId : null,
    p_player_ids: target.kind === 'individual' ? target.playerIds : [],
    p_host_name: to.name,
    p_from_kind: from.kind,
    p_from_name: from.name,
  });
  if (error) throw new Error(error.message);
}

/** A tournament's ownership audit trail (oldest first). */
export async function getOwnershipEvents(tournamentId: string): Promise<OwnershipEvent[]> {
  if (!isSupabaseConfigured || !supabase) {
    return demo.ownershipEvents.filter((e) => e.tournamentId === tournamentId).sort((a, b) => a.at.localeCompare(b.at));
  }
  const { data } = await supabase.from('tournament_ownership_events').select('*').eq('tournament_id', tournamentId).order('at', { ascending: true });
  return (data ?? []).map(toOwnershipEvent);
}

/* ---------------- Activity log (audit) + tournament officials --------------- */

/** Append an entry to the activity/audit trail (best-effort — never throws). */
export async function logActivity(e: { scope: 'org' | 'tournament'; refId: string; action: string; detail?: string; byPlayerId?: string; byName?: string }): Promise<void> {
  try {
    if (!isSupabaseConfigured || !supabase) {
      demo.activityLog.push({ ...e, id: genId('act'), at: new Date().toISOString() });
      return;
    }
    await supabase.from('activity_log').insert({
      scope: e.scope, ref_id: e.refId, action: e.action, detail: e.detail ?? null,
      by_player_id: e.byPlayerId ?? null, by_name: e.byName ?? null,
    });
  } catch { /* audit is non-critical */ }
}

/** The activity trail for an org or tournament (newest first). */
export async function getActivity(scope: 'org' | 'tournament', refId: string): Promise<ActivityEvent[]> {
  if (!isSupabaseConfigured || !supabase) {
    return demo.activityLog.filter((a) => a.scope === scope && a.refId === refId).sort((a, b) => b.at.localeCompare(a.at));
  }
  const { data } = await supabase.from('activity_log').select('*').eq('scope', scope).eq('ref_id', refId).order('at', { ascending: false });
  return (data ?? []).map((r: any) => ({ id: r.id, scope: r.scope, refId: r.ref_id, action: r.action, detail: r.detail ?? undefined, byPlayerId: r.by_player_id ?? undefined, byName: r.by_name ?? undefined, at: r.at }));
}

const toOfficial = (r: any): TournamentOfficial => ({ tournamentId: r.tournament_id, playerId: r.player_id, role: r.role, assignedBy: r.assigned_by ?? undefined, at: r.at ?? undefined });

/** The scorers & referees assigned to a tournament. */
export async function getTournamentOfficials(tournamentId: string): Promise<TournamentOfficial[]> {
  if (!isSupabaseConfigured || !supabase) return demo.tournamentOfficials.filter((o) => o.tournamentId === tournamentId);
  const { data } = await supabase.from('tournament_officials').select('*').eq('tournament_id', tournamentId);
  return (data ?? []).map(toOfficial);
}

/** Assign a person to officiate a tournament (scorer/referee). Idempotent + audited.
 *  Throws on a failed write so the caller can surface it. */
export async function assignTournamentOfficial(tournamentId: string, playerId: string, role: OfficialRole, byPlayerId?: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    if (!demo.tournamentOfficials.some((o) => o.tournamentId === tournamentId && o.playerId === playerId && o.role === role)) {
      demo.tournamentOfficials.push({ tournamentId, playerId, role, assignedBy: byPlayerId, at: new Date().toISOString() });
    }
  } else {
    const { error } = await supabase.from('tournament_officials').upsert({ tournament_id: tournamentId, player_id: playerId, role, assigned_by: byPlayerId ?? null }, { onConflict: 'tournament_id,player_id,role' });
    if (error) throw new Error(error.message);
  }
  const who = (await getPlayer(playerId))?.fullName ?? 'Someone';
  const byName = byPlayerId ? (await getPlayer(byPlayerId))?.fullName : undefined;
  await logActivity({ scope: 'tournament', refId: tournamentId, action: 'official.assigned', detail: `${who} assigned as ${role}`, byPlayerId, byName });
}

/** Remove a tournament official assignment. Audited. Throws on a failed write. */
export async function unassignTournamentOfficial(tournamentId: string, playerId: string, role: OfficialRole, byPlayerId?: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    demo.tournamentOfficials = demo.tournamentOfficials.filter((o) => !(o.tournamentId === tournamentId && o.playerId === playerId && o.role === role));
  } else {
    const { error } = await supabase.from('tournament_officials').delete().eq('tournament_id', tournamentId).eq('player_id', playerId).eq('role', role);
    if (error) throw new Error(error.message);
  }
  const who = (await getPlayer(playerId))?.fullName ?? 'Someone';
  const byName = byPlayerId ? (await getPlayer(byPlayerId))?.fullName : undefined;
  await logActivity({ scope: 'tournament', refId: tournamentId, action: 'official.unassigned', detail: `${who} removed as ${role}`, byPlayerId, byName });
}

/** Editable tournament fields (host/organizer are fixed at creation; co-hosts and
 *  divisions are managed on the tournament page). */
export interface TournamentPatch extends TournamentDetails {
  name?: string;
  sports?: SportId[];
  startDate?: string;
  endDate?: string;
  structure?: Tournament['structure'];
  knockoutFormat?: Tournament['knockoutFormat'];
  formats?: Tournament['formats'];
  isOpen?: boolean;
  registrationDeadline?: string | null;
  minTeams?: number | null;
  maxTeams?: number | null;
  scoring?: Tournament['scoring'] | null;
}

/** Update a tournament in place (RLS: only its organizer/hosts). Only the fields
 *  present in the patch are changed. */
export async function updateTournament(id: string, patch: TournamentPatch): Promise<{ profileSaved: boolean }> {
  if (!isSupabaseConfigured || !supabase) {
    const t = demo.tournaments.find((x) => x.id === id);
    if (t) Object.assign(t, patch); // demo Tournament uses these camelCase keys
    return { profileSaved: true };
  }
  const details = pickDetails(patch);
  const profileSaved = Object.keys(details).length ? await saveTournamentDetails(id, details) : true;
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.sports !== undefined) row.sports = patch.sports;
  if (patch.startDate !== undefined) row.start_date = patch.startDate;
  if (patch.endDate !== undefined) row.end_date = patch.endDate;
  if (patch.structure !== undefined) row.structure = patch.structure ?? null;
  if (patch.knockoutFormat !== undefined) row.knockout_format = patch.knockoutFormat ?? null;
  if (patch.formats !== undefined) row.formats = patch.formats ?? {};
  if (patch.isOpen !== undefined) row.is_open = patch.isOpen;
  // Registration columns need migration 0014; keep the rest of the save working
  // before it's applied by retrying without them if they aren't there yet.
  const regRow: Record<string, unknown> = {};
  if (patch.registrationDeadline !== undefined) regRow.registration_deadline = patch.registrationDeadline;
  if (patch.minTeams !== undefined) regRow.min_teams = patch.minTeams;
  if (patch.maxTeams !== undefined) regRow.max_teams = patch.maxTeams;
  if (patch.scoring !== undefined) regRow.scoring = patch.scoring; // migration 0015
  const full = { ...row, ...regRow };
  if (Object.keys(full).length) {
    const { error } = await supabase.from('tournaments').update(full).eq('id', id);
    if (error && Object.keys(regRow).length && Object.keys(row).length) {
      await supabase.from('tournaments').update(row).eq('id', id); // pre-0014 fallback
    }
  }
  return { profileSaved };
}

/** The keys `after` changes relative to `before` (removed keys → undefined), so a
 *  writer that edited a possibly-stale copy of a sport's format only sends what
 *  IT changed. */
export function formatDiff(before: Record<string, unknown> | null | undefined, after: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const b = before ?? {}, a = after ?? {};
  for (const k of new Set([...Object.keys(b), ...Object.keys(a)])) {
    if (JSON.stringify(b[k]) !== JSON.stringify(a[k])) out[k] = a[k];
  }
  return out;
}

/** Change some keys of ONE sport's tournament format: fresh read → merge → write
 *  (REVIEW Decision 5). Saving a whole `formats` object from a stale draft used to
 *  erase what others added meanwhile (points adjustments, manual rows…). */
export async function patchTournamentFormat(tournamentId: string, sport: string, patch: Record<string, unknown>): Promise<void> {
  if (!Object.keys(patch).length) return;
  if (!isSupabaseConfigured || !supabase) {
    const t = demo.tournaments.find((x) => x.id === tournamentId);
    if (t) t.formats = mergeSportFormat(t.formats as never, sport, patch) as never;
    return;
  }
  const { data, error } = await supabase.from('tournaments').select('formats').eq('id', tournamentId).maybeSingle();
  if (error) throw new Error(error.message);
  const formats = mergeSportFormat((data as { formats?: Record<string, Record<string, unknown>> } | null)?.formats, sport, patch);
  const res = await supabase.from('tournaments').update({ formats }).eq('id', tournamentId).select('id');
  if (res.error) throw new Error(res.error.message);
  if (!res.data?.length) throw new Error('You can’t change this tournament.');
}

/** Save a sport's points adjustments (parity #07) + an audit line. */
export async function savePointsAdjustments(tournamentId: string, sport: string, list: PointsAdjustment[], audit?: { detail: string; byPlayerId?: string; byName?: string }): Promise<void> {
  await patchTournamentFormat(tournamentId, sport, { pointsAdj: list.length ? JSON.stringify(list) : undefined });
  if (audit) await logActivity({ scope: 'tournament', refId: tournamentId, action: 'points.adjusted', detail: audit.detail, byPlayerId: audit.byPlayerId, byName: audit.byName }).catch(() => {});
}

/* ------------------------------ Organizations ------------------------------ */

// Membership now lives in the org_members join table (migration 0020); we assemble
// Organization.members from it so app code that reads org.members is unchanged.
const toOrganization = (r: any, members: OrgMember[]): Organization => ({
  id: r.id,
  name: r.name,
  type: r.type ?? undefined,
  logoUrl: r.logo_url ?? undefined,
  city: r.city ?? undefined,
  email: r.email ?? undefined,
  phone: r.phone ?? undefined,
  bio: r.bio ?? undefined,
  members,
  houses: r.houses ?? undefined,
  academicYears: r.academic_years ?? undefined,
  graduatingStandard: r.graduating_standard ?? undefined,
});
// houses (migration 0022) is optional in the select so reads still work pre-migration.
const ORG_SELECT = 'id, name, type, logo_url, city, email, phone, bio, academic_years, graduating_standard';
const ORG_SELECT_FULL = `${ORG_SELECT}, houses`;
async function withOrgCols<T>(build: (cols: string) => PromiseLike<{ data: T | null; error: unknown }>): Promise<{ data: T | null; error: unknown }> {
  const full = await build(ORG_SELECT_FULL);
  if (!full.error) return full;
  return build(ORG_SELECT);
}

const toOrgMember = (r: any): OrgMember => ({
  playerId: r.player_id,
  role: r.role,
  since: r.since ?? undefined,
  until: r.until ?? undefined,
  grades: (r.grades as GradeStint[] | null) ?? undefined,
  houses: (r.houses as any[] | null) ?? undefined,
});

const MEMBER_COLS = 'org_id, player_id, role, since, until, grades';
const MEMBER_COLS_FULL = `${MEMBER_COLS}, houses`;

/** Load org_members rows, grouped by org id (optionally for specific orgs). */
async function loadOrgMembers(orgIds?: string[]): Promise<Map<string, OrgMember[]>> {
  const map = new Map<string, OrgMember[]>();
  if (!isSupabaseConfigured || !supabase) return map;
  const run = (cols: string) => {
    let q = supabase!.from('org_members').select(cols);
    if (orgIds && orgIds.length) q = q.in('org_id', orgIds);
    return q;
  };
  let res = await run(MEMBER_COLS_FULL); // houses needs migration 0022
  if (res.error) res = await run(MEMBER_COLS);
  for (const r of (res.data ?? []) as any[]) {
    const arr = map.get(r.org_id) ?? [];
    arr.push(toOrgMember(r));
    map.set(r.org_id, arr);
  }
  return map;
}

const toOrgRequest = (r: any): OrgRequest => ({
  id: r.id,
  orgId: r.org_id,
  playerId: r.player_id,
  direction: r.direction,
  role: r.role,
  status: r.status,
  by: r.created_by ?? undefined,
  message: r.message ?? undefined,
  createdAt: r.created_at,
  decidedAt: r.decided_at ?? undefined,
  decidedBy: r.decided_by ?? undefined,
});

export interface NewOrganization {
  name: string;
  type?: string;
  city?: string;
  email?: string;
  phone?: string;
}

/** Create a community/organization; the creator becomes its first Admin. The
 *  creator joins via joinOrg so the one-active-community-per-category rule is
 *  enforced (any prior active community of the same category is ended). */
export async function createOrganization(input: NewOrganization, creatorPlayerId?: string): Promise<Organization> {
  // The creator becomes the first OWNER (an org must always keep ≥1 Owner).
  const members: Organization['members'] = creatorPlayerId
    ? [{ playerId: creatorPlayerId, role: 'Owner', since: todayISO() }]
    : [];
  let org: Organization;
  if (!isSupabaseConfigured || !supabase) {
    org = addOrganization({ ...input, members });
  } else {
    const { data, error } = await supabase
      .from('organizations')
      .insert({ name: input.name, type: input.type ?? null, city: input.city ?? null, email: input.email ?? null, phone: input.phone ?? null, members: [] })
      .select(ORG_SELECT)
      .single();
    if (error || !data) throw new Error(error?.message ?? 'Could not create community');
    org = toOrganization(data, []);
  }
  if (creatorPlayerId) await joinOrg(org.id, creatorPlayerId, 'Owner');
  return (await getOrganization(org.id)) ?? org;
}

export async function getOrganizations(): Promise<Organization[]> {
  if (!isSupabaseConfigured || !supabase) return demo.organizations;
  const { data, error } = await withOrgCols<any[]>((cols) => supabase!.from('organizations').select(cols).order('name'));
  if (error || !data) return [];
  const byOrg = await loadOrgMembers();
  return data.map((r: any) => toOrganization(r, byOrg.get(r.id) ?? []));
}

export async function getOrganization(id: string): Promise<Organization | null> {
  if (!isSupabaseConfigured || !supabase) return demo.organizations.find((o) => o.id === id) ?? null;
  const { data } = await withOrgCols<any>((cols) => supabase!.from('organizations').select(cols).eq('id', id).maybeSingle());
  if (!data) return null;
  const byOrg = await loadOrgMembers([id]);
  return toOrganization(data as any, byOrg.get(id) ?? []);
}

/** Replace an org's member list (add/remove/role changes). Keeps the "set the
 *  whole list" semantics callers use, but only WRITES the rows that actually
 *  changed (plus deletes for removed members): the server authorises each row
 *  change separately (migration 0025), so e.g. a member leaving may end their own
 *  row without touching anyone else's. Throws if the server rejects a change. */
export async function setOrgMembers(orgId: string, members: Organization['members']): Promise<void> {
  const current = (await getOrganization(orgId))?.members ?? [];
  // Invariant (enforced here so NO caller/UI can violate it): an org that already
  // has an Owner must never be reduced to zero active Owners.
  const isActiveOwner = (m: Organization['members'][number]) => !m.until && m.role === 'Owner';
  if (!members.some(isActiveOwner) && current.some(isActiveOwner)) {
    throw new Error('An organization must always have at least one owner. Make someone else an owner first.');
  }
  if (!isSupabaseConfigured || !supabase) {
    demoSetOrgMembers(orgId, members);
    return;
  }
  const toRow = (m: Organization['members'][number]) => ({
    org_id: orgId, player_id: m.playerId, role: m.role,
    since: m.since ?? null, until: m.until ?? null, grades: m.grades ?? [], houses: m.houses ?? [],
  });
  const before = new Map(current.map((m) => [m.playerId, JSON.stringify(toRow(m))] as const));
  const changed = members.filter((m) => before.get(m.playerId) !== JSON.stringify(toRow(m)));
  // New Owners first, so an owner hand-over never passes through a zero-owner state.
  changed.sort((a, b) => Number(isActiveOwner(b)) - Number(isActiveOwner(a)));
  const rows = changed.map(toRow);
  if (rows.length) {
    const up = await supabase.from('org_members').upsert(rows, { onConflict: 'org_id,player_id' });
    if (up.error) {
      // houses needs migration 0022 — retry without it if the column isn't there yet.
      const retry = await supabase.from('org_members').upsert(rows.map(({ houses, ...r }) => r), { onConflict: 'org_id,player_id' });
      if (retry.error) throw new Error(retry.error.message);
    }
  }
  const keep = new Set(members.map((m) => m.playerId));
  const removed = current.filter((m) => !keep.has(m.playerId)).map((m) => m.playerId);
  if (removed.length) {
    const { error } = await supabase.from('org_members').delete().eq('org_id', orgId).in('player_id', removed);
    if (error) throw new Error(error.message);
  }
}

const todayISO = () => new Date().toISOString().slice(0, 10);

/** Add (or re-activate) a player in a community, enforcing the rule that a
 *  player can be active in only one community per category at a time. Joining a
 *  community ends any other *active* membership of the same category (sets its
 *  `until` to today, moving it to the player's "past communities"). Memberships
 *  in communities of *different* categories are left untouched. */
export async function joinOrg(orgId: string, playerId: string, role: OrgRole = 'Member', byPlayerId?: string): Promise<void> {
  const orgs = await getOrganizations();
  const target = orgs.find((o) => o.id === orgId);
  if (!target) return;
  const today = todayISO();
  const category = target.type;
  // 1. End other active memberships in the same category — but a community must
  // never be left without an admin, so block if the player is the sole admin of
  // one (they must hand over admin there first).
  if (category) {
    const sameCat = orgs.filter(
      (o) => o.id !== orgId && o.type === category && o.members.some((m) => m.playerId === playerId && !m.until)
    );
    const orphaned = sameCat.find((o) => isSoleActiveOwner(o, playerId));
    if (orphaned) {
      throw new Error(`You're the only owner of ${orphaned.name}. Add another owner there before joining a new ${category}.`);
    }
    for (const o of sameCat) {
      await setOrgMembers(
        o.id,
        o.members.map((m) => (m.playerId === playerId && !m.until ? { ...m, until: today } : m))
      );
    }
  }
  // 2. Add the player to the target (or re-activate an ended membership).
  const exists = target.members.some((m) => m.playerId === playerId);
  const next = exists
    ? target.members.map((m) =>
        m.playerId === playerId ? { ...m, role, until: undefined, since: m.since ?? today } : m
      )
    : [...target.members, { playerId, role, since: today }];
  await setOrgMembers(orgId, next);
  const who = (await getPlayer(playerId))?.fullName ?? 'Someone';
  const byName = byPlayerId ? (await getPlayer(byPlayerId))?.fullName : undefined;
  await logActivity({ scope: 'org', refId: orgId, action: exists ? 'member.role' : 'member.joined', detail: exists ? `${who} → ${role}` : `${who} joined as ${role}`, byPlayerId, byName });
}

/** End a player's active membership in a community (moves it to "past"). A sole
 *  admin can't leave until another admin is appointed. */
export async function leaveOrg(orgId: string, playerId: string, byPlayerId?: string): Promise<void> {
  const org = await getOrganization(orgId);
  if (!org) return;
  if (isSoleActiveOwner(org, playerId)) {
    throw new Error(`You're the only owner of ${org.name}. Add another owner before leaving.`);
  }
  await setOrgMembers(
    orgId,
    org.members.map((m) => (m.playerId === playerId && !m.until ? { ...m, until: todayISO() } : m))
  );
  const who = (await getPlayer(playerId))?.fullName ?? 'Someone';
  await logActivity({ scope: 'org', refId: orgId, action: 'member.left', detail: `${who} left`, byPlayerId: byPlayerId ?? playerId });
}

/** Change a member's role (audited). Owner-invariant is still enforced in
 *  setOrgMembers; callers should apply their own UI guards first. */
export async function changeOrgMemberRole(orgId: string, playerId: string, role: OrgRole, byPlayerId?: string): Promise<void> {
  const org = await getOrganization(orgId);
  if (!org) return;
  const prev = org.members.find((m) => m.playerId === playerId)?.role;
  if (prev === role) return;
  await setOrgMembers(orgId, org.members.map((m) => (m.playerId === playerId ? { ...m, role } : m)));
  const who = (await getPlayer(playerId))?.fullName ?? 'Someone';
  const byName = byPlayerId ? (await getPlayer(byPlayerId))?.fullName : undefined;
  await logActivity({ scope: 'org', refId: orgId, action: 'member.role', detail: `${who}: ${prev ?? '—'} → ${role}`, byPlayerId, byName });
}

/* --------------------- Organization membership requests -------------------- */
// Invites (org → person) and join-requests (person → org). Membership is created
// only when a request is accepted (via joinOrg). Mirrors the club-invite pattern.

/** Invite a person to join an org with a given role (pending until they accept). */
export async function inviteToOrg(orgId: string, playerId: string, role: OrgRole = 'Member', byPlayerId?: string, message?: string): Promise<OrgRequest> {
  return createOrgRequest({ orgId, playerId, direction: 'invite', role, by: byPlayerId, message });
}

/** A person requests to join a discoverable org (pending until an admin accepts).
 *  Requests always ask for plain membership; admins set a higher role on accept. */
export async function requestToJoinOrg(orgId: string, playerId: string, message?: string): Promise<OrgRequest> {
  return createOrgRequest({ orgId, playerId, direction: 'request', role: 'Member', by: playerId, message });
}

async function createOrgRequest(args: { orgId: string; playerId: string; direction: 'invite' | 'request'; role: OrgRole; by?: string; message?: string }): Promise<OrgRequest> {
  const now = new Date().toISOString();
  if (!isSupabaseConfigured || !supabase) {
    // Reuse an existing pending row for the same (org, person, direction).
    const existing = demo.orgRequests.find((r) => r.orgId === args.orgId && r.playerId === args.playerId && r.direction === args.direction && r.status === 'pending');
    if (existing) { existing.role = args.role; existing.message = args.message; return existing; }
    const req: OrgRequest = { id: genId('oreq'), orgId: args.orgId, playerId: args.playerId, direction: args.direction, role: args.role, status: 'pending', by: args.by, message: args.message, createdAt: now };
    demo.orgRequests.push(req);
    return req;
  }
  // Uniqueness is a PARTIAL index (one *pending* row per org/person/direction),
  // which Postgres can't use as an ON CONFLICT target — so refresh an existing
  // pending row, else insert a new one.
  const { data: existing } = await supabase
    .from('org_requests').select('id')
    .eq('org_id', args.orgId).eq('player_id', args.playerId).eq('direction', args.direction).eq('status', 'pending')
    .maybeSingle();
  const { data, error } = existing
    ? await supabase.from('org_requests')
        .update({ role: args.role, message: args.message ?? null })
        .eq('id', existing.id).select('*').single()
    : await supabase.from('org_requests')
        .insert({ org_id: args.orgId, player_id: args.playerId, direction: args.direction, role: args.role, status: 'pending', created_by: args.by ?? null, message: args.message ?? null })
        .select('*').single();
  if (error || !data) throw new Error(error?.message ?? 'Could not create the request');
  return toOrgRequest(data);
}

/** An org's requests (default: pending only) — the admin review queue. */
export async function getOrgRequests(orgId: string, status: OrgRequest['status'] | 'all' = 'pending'): Promise<OrgRequest[]> {
  if (!isSupabaseConfigured || !supabase) {
    return demo.orgRequests.filter((r) => r.orgId === orgId && (status === 'all' || r.status === status));
  }
  let q = supabase.from('org_requests').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
  if (status !== 'all') q = q.eq('status', status);
  const { data } = await q;
  return (data ?? []).map(toOrgRequest);
}

/** A person's own requests — pending invites TO them + their pending join-requests. */
export async function getMyOrgRequests(playerId: string, status: OrgRequest['status'] | 'all' = 'pending'): Promise<OrgRequest[]> {
  if (!playerId) return [];
  if (!isSupabaseConfigured || !supabase) {
    return demo.orgRequests.filter((r) => r.playerId === playerId && (status === 'all' || r.status === status));
  }
  let q = supabase.from('org_requests').select('*').eq('player_id', playerId).order('created_at', { ascending: false });
  if (status !== 'all') q = q.eq('status', status);
  const { data } = await q;
  return (data ?? []).map(toOrgRequest);
}

/** Accept or decline a request/invite. On accept, the membership is created via
 *  joinOrg with the request's role; either way the row is marked decided. */
export async function respondToOrgRequest(requestId: string, accept: boolean, byPlayerId?: string): Promise<void> {
  const now = new Date().toISOString();
  let req: OrgRequest | undefined;
  if (!isSupabaseConfigured || !supabase) {
    req = demo.orgRequests.find((r) => r.id === requestId);
  } else {
    const { data } = await supabase.from('org_requests').select('*').eq('id', requestId).maybeSingle();
    req = data ? toOrgRequest(data) : undefined;
  }
  if (!req || req.status !== 'pending') return;
  if (accept) await joinOrg(req.orgId, req.playerId, req.role, byPlayerId);
  const status: OrgRequest['status'] = accept ? 'accepted' : 'rejected';
  if (!isSupabaseConfigured || !supabase) {
    req.status = status; req.decidedAt = now; req.decidedBy = byPlayerId;
    return;
  }
  await supabase.from('org_requests').update({ status, decided_at: now, decided_by: byPlayerId ?? null }).eq('id', requestId);
}

/** Cancel a still-pending request/invite (the creator withdraws it). */
export async function cancelOrgRequest(requestId: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    const req = demo.orgRequests.find((r) => r.id === requestId);
    if (req && req.status === 'pending') req.status = 'cancelled';
    return;
  }
  await supabase.from('org_requests').update({ status: 'cancelled' }).eq('id', requestId).eq('status', 'pending');
}

/** Set a school's House list (define/rename/recolour Houses) — admins only. Needs
 *  migration 0022; a pre-migration DB silently no-ops (the feature is unavailable). */
export async function setOrgHouses(orgId: string, houses: House[]): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    const o = demo.organizations.find((x) => x.id === orgId);
    if (o) o.houses = houses;
    return;
  }
  await supabase.from('organizations').update({ houses }).eq('id', orgId);
}

/** Set an organization's logo image — admins only. */
export async function setOrgLogo(orgId: string, logoUrl: string | null): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    const o = demo.organizations.find((x) => x.id === orgId);
    if (o) o.logoUrl = logoUrl ?? undefined;
    return;
  }
  assertPersistable(logoUrl);
  assertUpdated(await supabase.from('organizations').update({ logo_url: logoUrl }).eq('id', orgId).select('id'), 'community');
}

/** Editable community details (admins only via UI). */
export interface OrgPatch {
  name?: string;
  type?: string;
  city?: string;
  email?: string;
  phone?: string;
  bio?: string;
  academicYears?: AcademicYear[];
  graduatingStandard?: string;
}

/** Update a community's profile fields. */
export async function updateOrganization(orgId: string, patch: OrgPatch): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    const o = demo.organizations.find((x) => x.id === orgId);
    if (o) Object.assign(o, patch);
    return;
  }
  await supabase
    .from('organizations')
    .update({
      name: patch.name, type: patch.type ?? null, city: patch.city ?? null,
      email: patch.email ?? null, phone: patch.phone ?? null, bio: patch.bio ?? null,
      academic_years: patch.academicYears ?? null,
      graduating_standard: patch.graduatingStandard ?? null,
    })
    .eq('id', orgId);
}

export interface NewTeam {
  name: string;
  shortName: string;
  sport: SportId;
  colorHex: string;
  /** the community that owns the team, when created inside one */
  orgId?: string;
  /** the multi-sport club this row is a sport profile of (see Club) */
  clubId?: string;
  /** initial roster (player ids) */
  roster?: string[];
  /** created on the fly (a one-off side for a friendly) — de-emphasised in Manage teams */
  adhoc?: boolean;
}

export async function createTeam(input: NewTeam): Promise<Team> {
  if (!isSupabaseConfigured || !supabase) return addTeam(input);
  // Only include club_id when set, so existing ad-hoc/friendly creates keep working
  // on a DB that hasn't run migration 0018 yet (the column is club-feature only).
  const row: Record<string, unknown> = {
    name: input.name, short_name: input.shortName, sport: input.sport,
    color_hex: input.colorHex, org_id: input.orgId ?? null,
    roster: input.roster ?? null, adhoc: input.adhoc ?? false,
  };
  if (input.clubId) row.club_id = input.clubId;
  const { data, error } = await supabase
    .from('teams')
    .insert(row)
    .select('id,name,short_name,sport,color_hex,org_id,roster,adhoc')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Could not create team');
  // club_id isn't in the select (kept narrow for pre-migration safety) — merge it back.
  return { ...toTeam(data as TeamRow), clubId: input.clubId ?? undefined };
}

/** Teams owned by a community. */
export async function getTeamsForOrg(orgId: string): Promise<Team[]> {
  if (!isSupabaseConfigured || !supabase) return demo.teams.filter((t) => t.orgId === orgId);
  const { data, error } = await supabase
    .from('teams')
    .select('id,name,short_name,sport,color_hex,org_id,roster')
    .eq('org_id', orgId)
    .order('name');
  if (error || !data) return [];
  return (data as TeamRow[]).map(toTeam);
}

/** Replace a team's explicit roster (player ids). */
export async function setTeamRoster(teamId: string, roster: string[]): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    const t = demo.teams.find((x) => x.id === teamId);
    if (t) t.roster = roster;
    return;
  }
  assertTeamWrite(await supabase.from('teams').update({ roster }).eq('id', teamId).select('id'));
}

/* -------------------------------- Clubs ("teams") -------------------------- */
// A club is one real-world team that plays many sports (the UI calls it a "Team").
// It parents the per-sport `teams` rows: each sport it plays has its own team row
// (its sport profile) linked by teams.club_id, carrying that sport's captain/VC,
// squad (roster) and player roles. Team-level membership (admin/member) lives in
// club_members; the FIRST member added becomes an admin. See migration 0018.

interface ClubRow {
  id: string;
  name: string;
  short_name: string;
  logo_url?: string | null;
  color_hex?: string | null;
  city?: string | null;
  about?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  org_id?: string | null;
  created_by?: string | null;
}
const CLUB_COLS = 'id,name,short_name,logo_url,color_hex,city,about,contact_phone,contact_email,org_id,created_by';
const toClub = (r: ClubRow): Club => ({
  id: r.id,
  name: r.name,
  shortName: r.short_name,
  logoUrl: r.logo_url ?? undefined,
  colorHex: r.color_hex ?? undefined,
  city: r.city ?? undefined,
  about: r.about ?? undefined,
  contactPhone: r.contact_phone ?? undefined,
  contactEmail: r.contact_email ?? undefined,
  orgId: r.org_id ?? undefined,
  createdBy: r.created_by ?? undefined,
});

/** A four-letter code from a club name, e.g. "Hyderabad Warriors" → "HW" / "HYDE". */
const clubShort = (name: string): string => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = words.map((w) => w[0]).join('').toUpperCase();
  return ((initials.length >= 2 ? initials : name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()) || 'TM').slice(0, 4);
};

/** Create a club, optionally seeding its first member (who becomes an admin) and
 *  the sports it plays (a per-sport team row is minted for each). Returns the club. */
export async function createClub(input: NewClub): Promise<Club> {
  const shortName = (input.shortName || clubShort(input.name)).slice(0, 6);
  let club: Club;
  if (!isSupabaseConfigured || !supabase) {
    club = {
      id: genId('club'), name: input.name.trim(), shortName,
      logoUrl: input.logoUrl, colorHex: input.colorHex, city: input.city,
      about: input.about, contactPhone: input.contactPhone, contactEmail: input.contactEmail,
      orgId: input.orgId, createdBy: input.createdBy,
    };
    demo.clubs.push(club);
  } else {
    assertPersistable(input.logoUrl);
    const { data, error } = await supabase
      .from('clubs')
      .insert({
        name: input.name.trim(), short_name: shortName, logo_url: input.logoUrl ?? null,
        color_hex: input.colorHex ?? null, city: input.city ?? null, about: input.about ?? null,
        contact_phone: input.contactPhone ?? null, contact_email: input.contactEmail ?? null,
        org_id: input.orgId ?? null, created_by: input.createdBy ?? null,
      })
      .select(CLUB_COLS)
      .single();
    if (error || !data) throw new Error(error?.message ?? 'Could not create team');
    club = toClub(data as ClubRow);
  }
  // Add the creator as the first member — an admin — when they choose to join. This
  // takes a PLAYER id (club_members.player_id), distinct from created_by (a profile
  // id), so the caller passes it explicitly rather than reusing createdBy.
  if (input.firstMemberPlayerId) await addClubMember(club.id, input.firstMemberPlayerId, 'admin');
  // Mint a per-sport team row for each sport the club plays.
  for (const sport of input.sports ?? []) await addClubSport(club.id, sport);
  return club;
}

/** All clubs (multi-sport teams). */
export async function getClubs(): Promise<Club[]> {
  if (!isSupabaseConfigured || !supabase) return [...demo.clubs];
  const { data, error } = await supabase.from('clubs').select(CLUB_COLS).order('name');
  if (error || !data) return [];
  return (data as ClubRow[]).map(toClub);
}

/** One club by id, or null. */
export async function getClub(clubId: string): Promise<Club | null> {
  if (!isSupabaseConfigured || !supabase) return demo.clubs.find((c) => c.id === clubId) ?? null;
  const { data, error } = await supabase.from('clubs').select(CLUB_COLS).eq('id', clubId).single();
  if (error || !data) return null;
  return toClub(data as ClubRow);
}

/** The clubs a person belongs to (any role) — their "my teams" set, used to let
 *  them enter one of their teams into a game or tournament. */
export async function getClubsForPlayer(playerId: string): Promise<Club[]> {
  if (!playerId) return [];
  if (!isSupabaseConfigured || !supabase) {
    const ids = new Set(demo.clubMembers.filter((m) => m.playerId === playerId).map((m) => m.clubId));
    return demo.clubs.filter((c) => ids.has(c.id));
  }
  const { data, error } = await supabase.from('club_members').select('club_id').eq('player_id', playerId);
  if (error || !data) return [];
  const ids = [...new Set((data as { club_id: string }[]).map((r) => r.club_id))];
  if (!ids.length) return [];
  const res = await supabase.from('clubs').select(CLUB_COLS).in('id', ids).order('name');
  if (res.error || !res.data) return [];
  return (res.data as ClubRow[]).map(toClub);
}

/** Clubs owned by a community. */
export async function getClubsForOrg(orgId: string): Promise<Club[]> {
  if (!isSupabaseConfigured || !supabase) return demo.clubs.filter((c) => c.orgId === orgId);
  const { data, error } = await supabase.from('clubs').select(CLUB_COLS).eq('org_id', orgId).order('name');
  if (error || !data) return [];
  return (data as ClubRow[]).map(toClub);
}

/** Patch a club's editable fields (name, logo, city, about, contact). */
export async function updateClub(clubId: string, patch: Partial<Omit<Club, 'id' | 'createdBy'>>): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    const c = demo.clubs.find((x) => x.id === clubId);
    if (c) Object.assign(c, patch);
    return;
  }
  if (patch.logoUrl !== undefined) assertPersistable(patch.logoUrl);
  const res = await supabase.from('clubs').update({
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.shortName !== undefined ? { short_name: patch.shortName } : {}),
    ...(patch.logoUrl !== undefined ? { logo_url: patch.logoUrl } : {}),
    ...(patch.colorHex !== undefined ? { color_hex: patch.colorHex } : {}),
    ...(patch.city !== undefined ? { city: patch.city } : {}),
    ...(patch.about !== undefined ? { about: patch.about } : {}),
    ...(patch.contactPhone !== undefined ? { contact_phone: patch.contactPhone } : {}),
    ...(patch.contactEmail !== undefined ? { contact_email: patch.contactEmail } : {}),
  }).eq('id', clubId).select('id');
  assertUpdated(res, 'team');
}

/* --------------------------- Club membership ------------------------------ */

/** A club's members, joined to their player records (admins first, then by name). */
export async function getClubMembers(clubId: string): Promise<ClubMemberView[]> {
  const players = await getPlayers();
  const byId = new Map(players.map((p) => [p.id, p] as const));
  let rows: ClubMember[];
  if (!isSupabaseConfigured || !supabase) {
    rows = demo.clubMembers.filter((m) => m.clubId === clubId);
  } else {
    const { data, error } = await supabase
      .from('club_members').select('club_id, player_id, role, joined_at').eq('club_id', clubId);
    if (error || !data) return [];
    rows = (data as { club_id: string; player_id: string; role: ClubMemberRole; joined_at?: string }[])
      .map((r) => ({ clubId: r.club_id, playerId: r.player_id, role: r.role, joinedAt: r.joined_at ?? undefined }));
  }
  return rows
    .map((m) => ({ ...m, player: byId.get(m.playerId) }))
    .filter((m): m is ClubMemberView => !!m.player)
    .sort((a, b) => (a.role === b.role ? a.player.fullName.localeCompare(b.player.fullName) : a.role === 'admin' ? -1 : 1));
}

/** Add a person to a club. The first member of a club always becomes an admin,
 *  regardless of the requested role; later members default to 'member'. Idempotent
 *  (re-adding an existing member leaves their role unchanged unless overridden). */
export async function addClubMember(clubId: string, playerId: string, role?: ClubMemberRole): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    const existing = demo.clubMembers.find((m) => m.clubId === clubId && m.playerId === playerId);
    const isFirst = !demo.clubMembers.some((m) => m.clubId === clubId);
    const finalRole: ClubMemberRole = isFirst ? 'admin' : role ?? 'member';
    if (existing) { if (role) existing.role = role; return; }
    demo.clubMembers.push({ clubId, playerId, role: finalRole, joinedAt: new Date().toISOString() });
    return;
  }
  const { count } = await supabase.from('club_members').select('player_id', { count: 'exact', head: true }).eq('club_id', clubId);
  const isFirst = (count ?? 0) === 0;
  const finalRole: ClubMemberRole = isFirst ? 'admin' : role ?? 'member';
  await supabase.from('club_members').upsert(
    { club_id: clubId, player_id: playerId, role: finalRole },
    { onConflict: 'club_id,player_id', ignoreDuplicates: !role },
  );
}

/** Remove a member from a club. Does not touch any sport-squad membership — a
 *  person can still be in a sport's squad if re-added — but sport captaincy that
 *  named them is the caller's concern. */
export async function removeClubMember(clubId: string, playerId: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    demo.clubMembers = demo.clubMembers.filter((m) => !(m.clubId === clubId && m.playerId === playerId));
    return;
  }
  await supabase.from('club_members').delete().eq('club_id', clubId).eq('player_id', playerId);
}

/** Promote/demote a member (admin ↔ member). */
export async function setClubMemberRole(clubId: string, playerId: string, role: ClubMemberRole): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    const m = demo.clubMembers.find((x) => x.clubId === clubId && x.playerId === playerId);
    if (m) m.role = role;
    return;
  }
  await supabase.from('club_members').update({ role }).eq('club_id', clubId).eq('player_id', playerId);
}

/* --------------------------- Club invites (join link) --------------------- */

/** Create a shareable invite token that lets someone join this club as a member. */
export async function createClubInvite(clubId: string): Promise<ClubInvite> {
  const club = await getClub(clubId);
  if (!isSupabaseConfigured || !supabase) {
    const invite: ClubInvite = { token: nextInviteToken(), clubId, clubName: club?.name };
    demo.clubInvites[invite.token] = invite;
    return invite;
  }
  // Live: server-minted random token; only the club's admins may create one.
  const { data, error } = await supabase.rpc('create_club_invite', { p_club: clubId });
  if (error || !data) throw new Error(error?.message ?? 'Could not create the invite');
  return { token: data as string, clubId, clubName: club?.name };
}

/** Resolve a club invite token (or null if invalid). Rate-limited server-side. */
export async function getClubInvite(token: string): Promise<ClubInvite | null> {
  const t = token.trim().toUpperCase();
  if (!isSupabaseConfigured || !supabase) return demo.clubInvites[t] ?? null;
  const { data, error } = await supabase.rpc('get_club_invite', { p_token: t });
  if (error) throw new Error(error.message);
  if (!data) return null;
  const club = await getClub(data as string);
  return { token: t, clubId: data as string, clubName: club?.name };
}

/** Redeem a club invite: add the given player to the club as a member. Returns the
 *  club id joined, or null if the code was invalid. */
export async function claimClubInvite(token: string, playerId: string): Promise<string | null> {
  if (!playerId) return null;
  if (!isSupabaseConfigured || !supabase) {
    const invite = await getClubInvite(token);
    if (!invite) return null;
    await addClubMember(invite.clubId, playerId);
    return invite.clubId;
  }
  const { data, error } = await supabase.rpc('claim_club_invite', { p_token: token.trim().toUpperCase(), p_player: playerId });
  if (error) throw new Error(error.message);
  return (data as string | null) ?? null;
}

/* --------------------------- Club sports & profiles ----------------------- */

/** The per-sport team rows that make up a club's sport profiles. */
export async function getClubTeams(clubId: string): Promise<Team[]> {
  if (!isSupabaseConfigured || !supabase) return demo.teams.filter((t) => t.clubId === clubId);
  const { data, error } = await supabase
    .from('teams').select('id,name,short_name,sport,color_hex,org_id,club_id,roster,adhoc').eq('club_id', clubId);
  if (error || !data) return [];
  return (data as TeamRow[]).map(toTeam);
}

/** The sports a club plays (derived from its per-sport team rows). */
export async function getClubSports(clubId: string): Promise<SportId[]> {
  const teams = await getClubTeams(clubId);
  return [...new Set(teams.map((t) => t.sport))];
}

/** A club's team row for one sport, or null if it doesn't play that sport yet. */
export async function getClubTeam(clubId: string, sport: SportId): Promise<Team | null> {
  return (await getClubTeams(clubId)).find((t) => t.sport === sport) ?? null;
}

/** Add a sport to a club: mint its per-sport team row (sharing the club's name /
 *  short code / colour) if one doesn't already exist. Returns that team row —
 *  the club's sport profile for this sport. Idempotent. */
export async function addClubSport(clubId: string, sport: SportId): Promise<Team> {
  const existing = await getClubTeam(clubId, sport);
  if (existing) return existing;
  const club = await getClub(clubId);
  if (!club) throw new Error('Club not found');
  return createTeam({
    name: club.name, shortName: club.shortName, sport,
    colorHex: club.colorHex ?? '#2E7D6B', orgId: club.orgId, clubId,
  });
}

/** Remove a sport from a club. The per-sport team row is UNLINKED (club_id → null)
 *  rather than deleted, so any match history that references it survives. */
export async function removeClubSport(clubId: string, sport: SportId): Promise<void> {
  const team = await getClubTeam(clubId, sport);
  if (!team) return;
  if (!isSupabaseConfigured || !supabase) {
    const t = demo.teams.find((x) => x.id === team.id);
    if (t) t.clubId = undefined;
    return;
  }
  await supabase.from('teams').update({ club_id: null }).eq('id', team.id);
}

/* --------------------------- Sport-specific player roles ------------------- */

/** A team (sport profile)'s player roles, as { playerId → roles[] }. */
export async function getTeamPlayerRoles(teamId: string): Promise<Record<string, string[]>> {
  let rows: TeamPlayerRoles[];
  if (!isSupabaseConfigured || !supabase) {
    rows = demo.teamPlayerRoles.filter((r) => r.teamId === teamId);
  } else {
    const { data, error } = await supabase.from('team_player_roles').select('team_id, player_id, roles').eq('team_id', teamId);
    if (error || !data) return {};
    rows = (data as { team_id: string; player_id: string; roles: string[] | null }[])
      .map((r) => ({ teamId: r.team_id, playerId: r.player_id, roles: r.roles ?? [] }));
  }
  const out: Record<string, string[]> = {};
  for (const r of rows) out[r.playerId] = r.roles;
  return out;
}

/** Set a player's roles within one team's sport profile (replaces the set; an
 *  empty array clears the row). */
export async function setTeamPlayerRoles(teamId: string, playerId: string, roles: string[]): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    demo.teamPlayerRoles = demo.teamPlayerRoles.filter((r) => !(r.teamId === teamId && r.playerId === playerId));
    if (roles.length) demo.teamPlayerRoles.push({ teamId, playerId, roles });
    return;
  }
  if (!roles.length) {
    assertTeamWrite(await supabase.from('team_player_roles').delete().eq('team_id', teamId).eq('player_id', playerId).select('team_id'), false);
    return;
  }
  assertTeamWrite(await supabase.from('team_player_roles').upsert({ team_id: teamId, player_id: playerId, roles }, { onConflict: 'team_id,player_id' }).select('team_id'));
}

/* -------------------------- Tournament participants ------------------------ */
// The teams an organizer registers into a tournament — the roster that drives
// format decisions (how many teams → groups / bracket size). Distinct from the
// teams merely appearing in a tournament's matches. See migration 0003.

/** The CONFIRMED teams of a tournament (optionally narrowed to one sport) — the
 *  roster that drives format planning + fixtures. Invited / pending entries are
 *  excluded here; use getTournamentEntries for the full lifecycle view. */
export async function getTournamentTeams(tournamentId: string, sport?: SportId): Promise<Team[]> {
  const entries = await getTournamentEntries(tournamentId, sport);
  return entries.filter((e) => e.status === 'confirmed').map((e) => e.team);
}

/** Every team entry for a tournament with its lifecycle status (confirmed /
 *  invited / pending). The organizer's management view; the captain-facing
 *  screens use it to know whether their team is already in / invited. */
export async function getTournamentEntries(tournamentId: string, sport?: SportId): Promise<TournamentEntry[]> {
  if (!isSupabaseConfigured || !supabase) {
    const rows = demo.tournamentTeams.filter((r) => r.tournamentId === tournamentId);
    return rows
      .map((r) => ({ team: demo.teams.find((t) => t.id === r.teamId), status: r.status, categoryId: r.categoryId, checkedInAt: r.checkedInAt }))
      .filter((e) => !!e.team && (!sport || e.team!.sport === sport))
      .map((e) => ({ team: e.team as Team, status: e.status, categoryId: e.categoryId, checkedInAt: e.checkedInAt }));
  }
  // Read with the widest column set, then degrade gracefully if a column isn't in
  // the live DB yet: category_id needs migration 0008, status needs 0007. Falling
  // back keeps the existing participants feature working before each migration
  // (missing category ⇒ no division; missing status ⇒ treated as confirmed).
  const TEAM_COLS = 'teams(id,name,short_name,sport,color_hex,org_id,roster)';
  const attempts = [`status, category_id, checked_in_at, ${TEAM_COLS}`, `status, category_id, ${TEAM_COLS}`, `status, ${TEAM_COLS}`, TEAM_COLS];
  let res: { data: unknown; error: unknown } = { data: null, error: true };
  for (const cols of attempts) {
    res = await supabase.from('tournament_teams').select(cols).eq('tournament_id', tournamentId);
    if (!res.error) break;
  }
  const { data, error } = res;
  if (error || !data) return [];
  // The joined `teams` relation may come back as an object or a single-element
  // array depending on the client's inference — normalise both to a row.
  const entries = (data as unknown as { status?: TournamentEntryStatus; category_id?: string | null; checked_in_at?: string | null; teams: TeamRow | TeamRow[] | null }[])
    .map((r) => ({ team: Array.isArray(r.teams) ? r.teams[0] : r.teams, status: (r.status ?? 'confirmed') as TournamentEntryStatus, categoryId: r.category_id ?? undefined, checkedInAt: r.checked_in_at ?? undefined }))
    .filter((e) => !!e.team)
    .map((e) => ({ team: toTeam(e.team as TeamRow), status: e.status, categoryId: e.categoryId, checkedInAt: e.checkedInAt }));
  return sport ? entries.filter((e) => e.team.sport === sport) : entries;
}

/** Register one or more teams as tournament participants (idempotent). Status
 *  defaults to 'confirmed' (a direct add); pass 'invited' to invite a team the
 *  captain must accept. Re-adding an existing team bumps it to the given status. */
export async function addTournamentTeams(tournamentId: string, teamIds: string[], status: TournamentEntryStatus = 'confirmed', categoryId?: string): Promise<void> {
  if (!teamIds.length) return;
  if (!isSupabaseConfigured || !supabase) {
    addTournamentTeamsDemo(tournamentId, teamIds, status, categoryId);
    return;
  }
  const base = (teamId: string) => ({ tournament_id: tournamentId, team_id: teamId });
  const full = teamIds.map((id) => ({ ...base(id), status, ...(categoryId ? { category_id: categoryId } : {}) }));
  const { error } = await supabase.from('tournament_teams').upsert(full, { onConflict: 'tournament_id,team_id' });
  if (!error) return;
  // Degrade if a column is missing: category_id needs 0008, status needs 0007. A
  // plain confirmed add still works without either; invited/pending truly need 0007.
  const withStatus = teamIds.map((id) => ({ ...base(id), status }));
  const retry = await supabase.from('tournament_teams').upsert(withStatus, { onConflict: 'tournament_id,team_id' });
  if (!retry.error) return;
  if (status !== 'confirmed') throw new Error(retry.error.message);
  await supabase.from('tournament_teams').upsert(teamIds.map(base), { onConflict: 'tournament_id,team_id' });
}

/* --------------------------- Tournament categories ------------------------- */
// Divisions (age × gender) within a tournament — the backbone of school meets.
// A separate table (migration 0008) so it never affects the main tournament read.

const toCategory = (r: { id: string; tournament_id: string; label: string; age_group: string | null; gender: string | null; sort: number | null }): TournamentCategory => ({
  id: r.id,
  tournamentId: r.tournament_id,
  label: r.label,
  ageGroup: r.age_group ?? undefined,
  gender: (r.gender ?? undefined) as TournamentCategory['gender'],
  sort: r.sort ?? undefined,
});

/** The divisions a tournament defines (display order). Empty if none / pre-0008. */
export async function getTournamentCategories(tournamentId: string): Promise<TournamentCategory[]> {
  if (!isSupabaseConfigured || !supabase) return getTournamentCategoriesDemo(tournamentId);
  const { data, error } = await supabase
    .from('tournament_categories')
    .select('id, tournament_id, label, age_group, gender, sort')
    .eq('tournament_id', tournamentId)
    .order('sort', { ascending: true });
  if (error || !data) return []; // table absent (pre-0008) ⇒ no divisions
  return (data as Parameters<typeof toCategory>[0][]).map(toCategory);
}

/** Attach one or more divisions to a tournament; returns the created rows. */
export async function addTournamentCategories(tournamentId: string, cats: NewTournamentCategory[]): Promise<TournamentCategory[]> {
  if (!cats.length) return [];
  if (!isSupabaseConfigured || !supabase) return addTournamentCategoriesDemo(tournamentId, cats);
  const { data, error } = await supabase
    .from('tournament_categories')
    .insert(cats.map((c, i) => ({ tournament_id: tournamentId, label: c.label, age_group: c.ageGroup ?? null, gender: c.gender ?? null, sort: c.sort ?? i })))
    .select('id, tournament_id, label, age_group, gender, sort');
  if (error || !data) throw new Error(error?.message ?? 'Could not add divisions');
  return (data as Parameters<typeof toCategory>[0][]).map(toCategory);
}

/** Remove a division; its team entries fall back to no division (FK on delete set null). */
export async function removeTournamentCategory(categoryId: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) { removeTournamentCategoryDemo(categoryId); return; }
  await supabase.from('tournament_categories').delete().eq('id', categoryId);
}

/** Move a team's entry into a division (or clear it with null). */
export async function setTournamentTeamCategory(tournamentId: string, teamId: string, categoryId: string | null): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    setTournamentTeamCategoryDemo(tournamentId, teamId, categoryId ?? undefined);
    return;
  }
  await supabase.from('tournament_teams').update({ category_id: categoryId }).eq('tournament_id', tournamentId).eq('team_id', teamId);
}

/** A captain self-registers one of their teams — creates a 'pending' entry the
 *  organizer approves. Idempotent; a team already in stays as it is. */
export async function requestJoinTournament(tournamentId: string, teamId: string): Promise<void> {
  // Gate self-registration on the organizer's controls (open / deadline / cap).
  // Organizer-added teams (addTournamentTeams) bypass this — they can override.
  const [tours, entries] = await Promise.all([getTournaments(), getTournamentEntries(tournamentId)]);
  const tour = tours.find((t) => t.id === tournamentId);
  if (tour) {
    const reason = joinBlockReason(tour, entries, Date.now());
    if (reason) throw new Error(reason);
  }
  await addTournamentTeams(tournamentId, [teamId], 'pending');
}

/** Move a team's entry to a new lifecycle status (organizer approve/decline, or
 *  a captain accepting an invite → 'confirmed'). */
export async function setTournamentTeamStatus(tournamentId: string, teamId: string, status: TournamentEntryStatus): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    setTournamentTeamStatusDemo(tournamentId, teamId, status);
    return;
  }
  await supabase.from('tournament_teams').update({ status }).eq('tournament_id', tournamentId).eq('team_id', teamId);
}

/** Match-day check-in: mark an entry as arrived at the venue (or undo). */
export async function setTournamentTeamCheckIn(tournamentId: string, teamId: string, checkedIn: boolean): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    setTournamentTeamCheckInDemo(tournamentId, teamId, checkedIn);
    return;
  }
  const { error } = await supabase.from('tournament_teams')
    .update({ checked_in_at: checkedIn ? new Date().toISOString() : null })
    .eq('tournament_id', tournamentId).eq('team_id', teamId);
  if (error) throw new Error('Couldn’t update check-in — try again.');
}

/** Drop a team from a tournament's participant list. */
export async function removeTournamentTeam(tournamentId: string, teamId: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    removeTournamentTeamDemo(tournamentId, teamId);
    return;
  }
  const res = await supabase.from('tournament_teams').delete().eq('tournament_id', tournamentId).eq('team_id', teamId).select('team_id');
  if (res.error) throw new Error(res.error.code === '42501' ? 'Only the organiser can remove this team.' : 'Couldn’t remove the team — try again.');
  if (!res.data?.length) {
    // RLS filters a refused delete silently — tell that apart from "already gone".
    const { data } = await supabase.from('tournament_teams').select('team_id').eq('tournament_id', tournamentId).eq('team_id', teamId).limit(1);
    if (data?.length) throw new Error('Only the organiser can remove this team.');
  }
}

/* ---------------------- Tournament join link (parity #10) ------------------ */
// One link per tournament (`T-XXXXXX`, migration 0042). While ON, a team's
// manager enters their team with it and the entry is confirmed at once.

const demoTournamentInvites = new Map<string, { tournamentId: string; active: boolean }>();
const demoInviteToken = (): string => {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let t = 'T-';
  for (let i = 0; i < 6; i++) t += A[Math.floor(Math.random() * A.length)];
  return t;
};

/** The tournament's live join code, for its organiser: a token, null when the
 *  link is OFF, or undefined pre-0042 (hide the invite card). Never throws. */
export async function getLiveTournamentInvite(tournamentId: string): Promise<string | null | undefined> {
  if (!isSupabaseConfigured || !supabase) {
    for (const [tok, v] of demoTournamentInvites) if (v.tournamentId === tournamentId && v.active) return tok;
    return null;
  }
  const { data, error } = await supabase.from('tournament_invites').select('token').eq('tournament_id', tournamentId).eq('active', true).limit(1);
  if (error) return isMissingSchema(error) ? undefined : null;
  return (data?.[0] as { token: string } | undefined)?.token ?? null;
}

/** Turn the join link ON (returns the live code — the same one if it's already
 *  on) or OFF (returns null; a later ON mints a new code). Organiser only.
 *  Throws NeedsDbUpdateError pre-0042. */
export async function setTournamentInvite(tournamentId: string, on: boolean): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) {
    const live = [...demoTournamentInvites].find(([, v]) => v.tournamentId === tournamentId && v.active);
    if (!on) { if (live) live[1].active = false; return null; }
    if (live) return live[0];
    const tok = demoInviteToken();
    demoTournamentInvites.set(tok, { tournamentId, active: true });
    return tok;
  }
  const { data, error } = await supabase.rpc('tournament_invite', { p_tid: tournamentId, p_on: on });
  if (isMissingSchema(error)) throw new NeedsDbUpdateError();
  if (error) throw new Error(error.code === '42501' ? 'Only the organiser can change the join link.' : error.message);
  return (data as string | null) ?? null;
}

export interface TournamentInviteInfo { tournamentId: string; name: string; sports: SportId[]; active: boolean }

/** Resolve a typed / pasted code or link. null = not a tournament code, or no
 *  such code; `active: false` = "This link is turned off". Throws
 *  NeedsDbUpdateError pre-0042, or the server's message (e.g. rate limit). */
export async function getTournamentInvite(tokenOrLink: string): Promise<TournamentInviteInfo | null> {
  const token = parseTournamentToken(tokenOrLink);
  if (!token) return null;
  if (!isSupabaseConfigured || !supabase) {
    const inv = demoTournamentInvites.get(token);
    const t = inv && demo.tournaments.find((x) => x.id === inv.tournamentId);
    return inv && t ? { tournamentId: t.id, name: t.name, sports: [...(t.sports ?? [])], active: inv.active } : null;
  }
  const { data, error } = await supabase.rpc('get_tournament_invite', { p_token: token });
  if (isMissingSchema(error)) throw new NeedsDbUpdateError();
  if (error) throw new Error(error.message);
  const r = ((data ?? []) as { tournament_id: string; name: string; sports: string[] | null; active: boolean }[])[0];
  return r ? { tournamentId: r.tournament_id, name: r.name, sports: (r.sports ?? []) as SportId[], active: r.active } : null;
}

/** Enter a team you manage through the live link → 'joined' (confirmed now) or
 *  'already' (it was already in). Throws the server's message for: invalid code,
 *  "This link is turned off", not your team, sport not in the tournament, wrong
 *  division, full, deadline passed, withdrawn; NeedsDbUpdateError pre-0042. */
export async function redeemTournamentInvite(tokenOrLink: string, teamId: string, categoryId?: string): Promise<'joined' | 'already'> {
  const token = parseTournamentToken(tokenOrLink);
  if (!token) throw new Error('This invite code isn’t valid');
  if (!isSupabaseConfigured || !supabase) {
    const inv = demoTournamentInvites.get(token);
    const t = inv && demo.tournaments.find((x) => x.id === inv.tournamentId);
    if (!inv || !t) throw new Error('This invite code isn’t valid');
    if (!inv.active) throw new Error('This link is turned off');
    const team = demo.teams.find((x) => x.id === teamId);
    if (!team) throw new Error('You can only enter a team you manage');
    if (t.sports?.length && !t.sports.includes(team.sport)) throw new Error('This team’s sport isn’t played in this tournament');
    const cur = demo.tournamentTeams.find((r) => r.tournamentId === t.id && r.teamId === teamId);
    if (cur?.status === 'confirmed') return 'already';
    if (cur?.status === 'withdrawn') throw new Error('This team was withdrawn — ask the organiser to add it back');
    if (cur?.status !== 'invited') {
      const block = joinBlockReason({ ...t, isOpen: true }, demo.tournamentTeams.filter((r) => r.tournamentId === t.id).map((r) => ({ status: r.status }) as TournamentEntry), Date.now());
      if (block) throw new Error(block);
    }
    addTournamentTeamsDemo(t.id, [teamId], 'confirmed', categoryId);
    return 'joined';
  }
  const { data, error } = await supabase.rpc('redeem_tournament_invite', { p_token: token, p_team: teamId, p_category: categoryId ?? null });
  if (isMissingSchema(error)) throw new NeedsDbUpdateError();
  if (error) throw new Error(error.message);
  return data === 'already' ? 'already' : 'joined';
}

/* ------------------------- Multi-sport contingents ------------------------ */

/** A contingent (team / house / nation) in a multi-sport meet — one identity that
 *  competes across every sport, with the sports it's in and any it sits out. */
export interface Contingent { name: string; colorHex?: string; sports: SportId[]; absentSports: SportId[]; }

const contingentShort = (name: string): string => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = words.map((w) => w[0]).join('').toUpperCase();
  return ((initials.length >= 2 ? initials : name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()) || 'TM').slice(0, 4);
};

/** Add a contingent to a multi-sport meet: entered into every listed sport,
 *  reusing an existing same-named team per sport or creating one — all sharing
 *  the name + colour, so the medal table merges them into one row. */
/** Enter a school's Houses as the participating teams of a sport in a tournament —
 *  the connective tissue for an inter-house event (spec §21, §25). Each House becomes
 *  (or reuses) a team of that sport, coloured to match, and is confirmed in. Returns
 *  how many Houses were entered. */
export async function enterOrgHousesAsTeams(tournamentId: string, orgId: string, sport: SportId): Promise<number> {
  const org = await getOrganization(orgId);
  const houses = org?.houses ?? [];
  if (!houses.length) return 0;
  const existingTeams = await getTeams(sport);
  for (const h of houses) {
    const key = h.name.trim().toLowerCase();
    const existing = existingTeams.find((t) => t.name.trim().toLowerCase() === key);
    const teamId = existing?.id ?? (await createTeam({ name: h.name.trim(), shortName: contingentShort(h.name), sport, colorHex: h.colorHex ?? '#4DA3FF', orgId, adhoc: true })).id;
    await addTournamentTeams(tournamentId, [teamId], 'confirmed');
  }
  return houses.length;
}

export async function addContingent(tournamentId: string, name: string, colorHex: string, sports: SportId[]): Promise<void> {
  const key = name.trim().toLowerCase();
  for (const sport of sports) {
    const existing = (await getTeams(sport)).find((t) => t.name.trim().toLowerCase() === key);
    const teamId = existing?.id ?? (await createTeam({ name: name.trim(), shortName: contingentShort(name), sport, colorHex, adhoc: true })).id;
    await addTournamentTeams(tournamentId, [teamId], 'confirmed');
  }
}

/** Every contingent in a meet, with the sports it plays and the ones it sits out. */
export async function getContingents(tournamentId: string, sports: SportId[]): Promise<Contingent[]> {
  const byName = new Map<string, Contingent>();
  for (const sport of sports) {
    const entries = await getTournamentEntries(tournamentId, sport);
    for (const e of entries) {
      const k = e.team.name.trim().toLowerCase();
      const c = byName.get(k) ?? { name: e.team.name, colorHex: e.team.colorHex, sports: [], absentSports: [] };
      if (e.status === 'withdrawn') c.absentSports.push(sport);
      else c.sports.push(sport);
      byName.set(k, c);
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Mark a contingent present/absent in a sport (absent ⇒ its team for that sport
 *  is withdrawn, so opponents can be given walkovers and it ranks last). */
export async function setContingentParticipation(tournamentId: string, name: string, sport: SportId, present: boolean): Promise<void> {
  const entry = (await getTournamentEntries(tournamentId, sport)).find((e) => e.team.name.trim().toLowerCase() === name.trim().toLowerCase());
  if (!entry) return;
  await setTournamentTeamStatus(tournamentId, entry.team.id, present ? 'confirmed' : 'withdrawn');
  if (!present) {
    // A team pulling out of a sport hands any not-yet-played fixture to its
    // opponent as a walkover (its future draw is handled by being withdrawn).
    const mine = (await getMatches(sport)).filter(
      (m) => m.tournamentId === tournamentId && m.status !== 'completed' && m.status !== 'live' &&
        (m.homeTeam.id === entry.team.id || m.awayTeam.id === entry.team.id),
    );
    for (const m of mine) await walkoverMatch(m.id, m.homeTeam.id === entry.team.id ? 'away' : 'home');
  }
}

/** Complete a match as a walkover — `winner` takes it without play (the other side
 *  didn't participate). The flag rides on the match format (zero-migration). */
export async function walkoverMatch(matchId: string, winner: 'home' | 'away'): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    const mm = demo.matches.find((x) => x.id === matchId);
    if (mm) { mm.status = 'completed'; mm.winner = winner; mm.walkover = true; mm.result = { kind: 'conceded', winner, reason: 'Walkover', at: new Date().toISOString() }; mm.format = { ...(mm.format ?? {}), __walkover: true }; }
    return;
  }
  // The result (with its reason) lives in matches.result; `__walkover` stays only
  // as the marker older builds read to show "w/o" instead of a score.
  await endMatchManually(matchId, { kind: 'conceded', winner, reason: 'Walkover', at: new Date().toISOString() });
  const { data } = await supabase.from('matches').select('format').eq('id', matchId).maybeSingle();
  const format = { ...((data?.format as Record<string, unknown>) ?? {}), __walkover: true };
  await supabase.from('matches').update({ status: 'completed', winner, format }).eq('id', matchId);
}

export interface NewMatch {
  /** omit for an ad-hoc friendly (a match with no tournament) */
  tournamentId?: string;
  /** grouped-tournament group label (e.g. "A") + phase ('group' | 'r16' | 'qf' | 'sf' | 'final') */
  group?: string;
  stage?: string;
  /** play-in round: top-seed team ids that bye this round (see Match.byes) */
  byes?: string[];
  sport: SportId;
  homeTeamId: string;
  awayTeamId: string;
  startsAt: string;
  venueName?: string;
  venueMapsUrl?: string;
  /** the players hosting the match — its creator becomes the first host */
  hostIds?: string[];
  /** optional per-match rules (scoring system, points, match length…) */
  format?: SportFormat;
  /** optional live-stream link shown atop the live match */
  streamUrl?: string;
}

export async function createMatch(input: NewMatch): Promise<Match> {
  if (!isSupabaseConfigured || !supabase) {
    const home = demo.teams.find((t) => t.id === input.homeTeamId)!;
    const away = demo.teams.find((t) => t.id === input.awayTeamId)!;
    return addMatch({
      tournamentId: input.tournamentId,
      group: input.group,
      stage: input.stage,
      byes: input.byes,
      sport: input.sport,
      status: 'scheduled',
      startsAt: input.startsAt,
      venueName: input.venueName,
      venueMapsUrl: input.venueMapsUrl,
      hostIds: input.hostIds,
      homeTeam: home,
      awayTeam: away,
      format: input.format,
      streamUrl: input.streamUrl,
      state: null,
    });
  }
  const { data, error } = await supabase
    .from('matches')
    .insert({
      tournament_id: input.tournamentId ?? null,
      group_label: input.group ?? null,
      stage: input.stage ?? null,
      byes: input.byes ?? null,
      sport: input.sport,
      home_team_id: input.homeTeamId,
      away_team_id: input.awayTeamId,
      starts_at: input.startsAt,
      venue_name: input.venueName ?? null,
      venue_maps_url: input.venueMapsUrl ?? null,
      host_ids: input.hostIds ?? [],
      format: input.format ?? {},
      stream_url: input.streamUrl ?? null,
      status: 'scheduled',
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Could not schedule match');
  const full = await getMatch(data.id);
  if (!full) throw new Error('Match created but could not be loaded');
  return full;
}

/* -------------------------------- Series / ties --------------------------- */

export interface NewSeries {
  tournamentId?: string;
  sport: SportId;
  teamAId: string;
  teamBId: string;
  format: SeriesFormat;
  /** total legs/games — forced to 2 for aggregate (two-legged) */
  legs: number;
  name?: string;
  /** aggregate: break a level tie on away goals before the 2nd-leg result */
  awayGoals?: boolean;
  /** for a bracket-integrated tie (a knockout stage played as a series) */
  stage?: string;
  /** first leg kickoff; later legs are spaced `intervalDays` apart */
  startsAt: string;
  intervalDays?: number;
  hostIds?: string[];
  venueName?: string;
  venueMapsUrl?: string;
  /** per-match sport rules (overs, players/side…) applied to every leg */
  matchFormat?: SportFormat;
}

/** Create a series/tie: N child matches that share a `__seriesId` and carry the
 *  series config on their `format`, so `deriveSeries` can reconstruct the tie and
 *  the bracket can treat it as one pairing. Legs alternate home/away so each side
 *  hosts (a two-legged tie is home-and-away by construction). */
export async function createSeries(input: NewSeries): Promise<{ seriesId: string; matches: Match[] }> {
  const seriesId = `series-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const legsCount = input.format === 'aggregate' ? 2 : Math.max(1, Math.floor(input.legs));
  const gapMs = Math.max(0, input.intervalDays ?? 3) * 24 * 60 * 60 * 1000;
  const base = new Date(input.startsAt).getTime();
  const matches: Match[] = [];
  for (let i = 0; i < legsCount; i++) {
    const aHome = i % 2 === 0; // A hosts the odd legs; B the even ones
    const seriesFmt = seriesLegFormat({
      id: seriesId, format: input.format, legs: legsCount, leg: i + 1,
      teamAId: input.teamAId, name: input.name, awayGoals: input.awayGoals,
    });
    const m = await createMatch({
      tournamentId: input.tournamentId,
      sport: input.sport,
      stage: input.stage,
      homeTeamId: aHome ? input.teamAId : input.teamBId,
      awayTeamId: aHome ? input.teamBId : input.teamAId,
      startsAt: new Date(base + i * gapMs).toISOString(),
      hostIds: input.hostIds,
      venueName: input.venueName,
      venueMapsUrl: input.venueMapsUrl,
      format: { ...(input.matchFormat ?? {}), ...seriesFmt },
    });
    matches.push(m);
  }
  return { seriesId, matches };
}
