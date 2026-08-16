/**
 * Data-access layer. Screens call these — never Supabase directly — so the
 * demo-mode fallback lives in exactly one place. Each function returns the same
 * domain shapes whether the data came from Postgres or the local mock.
 */
import { supabase, isSupabaseConfigured } from '../core/supabase';
import { normalizePhone, samePhone, isValidPhone } from '../core/phone';
import { MATCHES } from '../core/mockData';
import {
  demo,
  genId,
  addTournament,
  addTeam,
  addMatch,
  recordStat,
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
  removeTournamentTeamDemo,
} from './demoStore';
import { emptyFormation } from '../sports/football/formation';
import { isSoleActiveAdmin } from '../core/org';
import { getSport } from '../sports/registry';
import type {
  AcademicYear,
  FootballProfile,
  Listing,
  Match,
  MatchEventRecord,
  Organization,
  OrgRole,
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
  Team,
  TeamInvite,
  TeamLeadership,
  TeamSummary,
  Tournament,
} from '../core/types';

/** A teams row joined into a match. */
interface TeamRow {
  id: string;
  name: string;
  short_name: string;
  sport: string;
  color_hex: string | null;
  org_id?: string | null;
  roster?: string[] | null;
  adhoc?: boolean | null;
}
interface MatchRow {
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
  roster: r.roster ?? undefined,
  adhoc: r.adhoc ?? undefined,
});

function toMatch(r: MatchRow): Match {
  const home = one(r.home_team);
  const away = one(r.away_team);
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
    winner: r.winner ?? undefined,
    hostIds: r.host_ids ?? undefined,
    logoUrl: r.logo_url ?? undefined,
    scorerId: r.scorer_id ?? undefined,
    homeTeam: home ? toTeam(home) : (MATCHES[0].homeTeam as Team),
    awayTeam: away ? toTeam(away) : (MATCHES[0].awayTeam as Team),
    state: r.state ?? null,
  };
}

const MATCH_SELECT =
  'id, tournament_id, group_label, stage, byes, sport, status, starts_at, venue_id, venue_name, venue_maps_url, stream_url, winner, host_ids, logo_url, scorer_id, state,' +
  ' home_team:teams!matches_home_team_id_fkey(id,name,short_name,sport,color_hex),' +
  ' away_team:teams!matches_away_team_id_fkey(id,name,short_name,sport,color_hex)';

export async function getTournament(): Promise<Tournament> {
  if (!isSupabaseConfigured || !supabase) return demo.tournaments[0];
  const { data, error } = await supabase
    .from('tournaments')
    .select(TOURNAMENT_SELECT)
    .order('start_date', { ascending: true })
    .limit(1)
    .single();
  if (error || !data) return demo.tournaments[0];
  return toTournament(data);
}

const toTournament = (data: any): Tournament => ({
  id: data.id,
  name: data.name,
  hostName: data.host_name,
  hostOrgId: data.host_org_id ?? undefined,
  logoUrl: data.logo_url ?? undefined,
  // prefer the multi-host array; fall back to the legacy single organizer_id
  hostIds: data.host_ids ?? (data.organizer_id ? [data.organizer_id] : undefined),
  isOpen: data.is_open ?? undefined,
  sports: (data.sports ?? []) as SportId[],
  startDate: data.start_date,
  endDate: data.end_date,
  formats: data.formats ?? undefined,
  structure: data.structure ?? undefined,
  knockoutFormat: data.knockout_format ?? undefined,
  reminderLeadMinutes: data.reminder_lead_minutes ?? undefined,
});

const TOURNAMENT_SELECT = 'id, name, host_name, host_org_id, logo_url, organizer_id, host_ids, is_open, sports, start_date, end_date, formats, structure, knockout_format, reminder_lead_minutes';

/** Every tournament, newest first. */
export async function getTournaments(): Promise<Tournament[]> {
  if (!isSupabaseConfigured || !supabase) return demo.tournaments;
  const { data, error } = await supabase.from('tournaments').select(TOURNAMENT_SELECT).order('start_date', { ascending: false });
  if (error || !data) return [];
  return data.map(toTournament);
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
    ? await supabase.from('tournaments').select(TOURNAMENT_SELECT).contains('host_ids', [myPlayerId])
    : { data: [] as unknown[] };
  const mine = (data ?? []).map(toTournament);
  const ids = new Set([...mine.map((t) => t.id), ...followedIds]);
  const scoped = all.filter((t) => ids.has(t.id));
  return scoped.length ? scoped : all;
}

export async function getMatches(filter?: SportId): Promise<Match[]> {
  if (!isSupabaseConfigured || !supabase) {
    const all = [...demo.matches].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return filter ? all.filter((m) => m.sport === filter) : all;
  }
  let q = supabase.from('matches').select(MATCH_SELECT).order('starts_at', { ascending: true });
  if (filter) q = q.eq('sport', filter);
  const { data, error } = await q;
  if (error || !data) return [];
  return (data as unknown as MatchRow[]).map(toMatch);
}

export async function getMatch(id: string): Promise<Match | null> {
  if (!isSupabaseConfigured || !supabase) return demo.matches.find((m) => m.id === id) ?? null;
  const { data, error } = await supabase.from('matches').select(MATCH_SELECT).eq('id', id).single();
  if (error || !data) return null;
  return toMatch(data as unknown as MatchRow);
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
  return null;
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
  if (!isSupabaseConfigured || !supabase) return demo.teamLeaders[teamId] ?? {};
  const { data } = await supabase.from('teams').select('captain_id, vice_captain_id').eq('id', teamId).maybeSingle();
  return { captainId: data?.captain_id ?? undefined, viceCaptainId: data?.vice_captain_id ?? undefined };
}

export async function setTeamLeaders(teamId: string, leaders: TeamLeadership): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    demoSetTeamLeaders(teamId, leaders);
    return;
  }
  await supabase.from('teams').update({ captain_id: leaders.captainId ?? null, vice_captain_id: leaders.viceCaptainId ?? null }).eq('id', teamId);
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
});

const PLAYER_SELECT = 'id, profile_id, full_name, jersey_no, sports, house_name, house_color, city, gender, bio, phone, email, phone_verified, email_verified, photo_url, sport_details, dob, guardian, verification';

export async function getPlayers(): Promise<Player[]> {
  if (!isSupabaseConfigured || !supabase) return demo.players;
  const { data, error } = await supabase.from('players').select(PLAYER_SELECT).order('full_name');
  if (error || !data) return [];
  return (data as PlayerRow[]).map(toPlayer);
}

export async function getPlayer(id: string): Promise<Player | null> {
  if (!isSupabaseConfigured || !supabase) return demo.players.find((p) => p.id === id) ?? null;
  const { data, error } = await supabase.from('players').select(PLAYER_SELECT).eq('id', id).single();
  if (error || !data) return null;
  return toPlayer(data as PlayerRow);
}

interface StatLineRow {
  id: string;
  match_id: string | null;
  player_id: string;
  sport: string;
  stats: Record<string, number> | null;
  won: boolean | null;
  opponent: string | null;
  recorded_at: string | null;
}
export async function getPlayerStatLines(playerId: string): Promise<StatLine[]> {
  if (!isSupabaseConfigured || !supabase) {
    return demo.statLines.filter((l) => l.playerId === playerId);
  }
  const { data, error } = await supabase
    .from('stat_lines')
    .select('id, match_id, player_id, sport, stats, won, opponent, recorded_at')
    .eq('player_id', playerId);
  if (error || !data) return [];
  return (data as StatLineRow[]).map((r) => ({
    id: r.id,
    matchId: r.match_id ?? '',
    playerId: r.player_id,
    sport: r.sport as SportId,
    stats: r.stats ?? {},
    won: r.won ?? false,
    opponent: r.opponent ?? undefined,
    date: r.recorded_at ?? undefined,
  }));
}

/** All stat lines recorded for one match — powers the match Summary ratings. */
export async function getMatchStatLines(matchId: string): Promise<StatLine[]> {
  if (!isSupabaseConfigured || !supabase) {
    return demo.statLines.filter((l) => l.matchId === matchId);
  }
  const { data, error } = await supabase
    .from('stat_lines')
    .select('id, match_id, player_id, sport, stats, won, opponent, recorded_at')
    .eq('match_id', matchId);
  if (error || !data) return [];
  return (data as StatLineRow[]).map((r) => ({
    id: r.id,
    matchId: r.match_id ?? '',
    playerId: r.player_id,
    sport: r.sport as SportId,
    stats: r.stats ?? {},
    won: r.won ?? false,
    opponent: r.opponent ?? undefined,
    date: r.recorded_at ?? undefined,
  }));
}

/** Server-side player search: filtering happens in the DB (or the demo store),
 *  not by loading every player into the client. */
export async function searchPlayers(opts: { query?: string; sport?: SportId; city?: string }): Promise<Player[]> {
  const { query, sport, city } = opts;
  if (!isSupabaseConfigured || !supabase) {
    const q = (query ?? '').trim().toLowerCase();
    return demo.players.filter(
      (p) =>
        (!q || p.fullName.toLowerCase().includes(q)) &&
        (!sport || p.sports.includes(sport)) &&
        (!city || p.city === city)
    );
  }
  let req = supabase.from('players').select(PLAYER_SELECT).order('full_name').limit(50);
  if (query?.trim()) req = req.ilike('full_name', `%${query.trim()}%`);
  if (sport) req = req.contains('sports', [sport]);
  if (city) req = req.eq('city', city);
  const { data, error } = await req;
  if (error || !data) return [];
  return (data as PlayerRow[]).map(toPlayer);
}

/** Distinct cities for the discovery filter. */
export async function getCities(): Promise<string[]> {
  if (!isSupabaseConfigured || !supabase) {
    return Array.from(new Set(demo.players.map((p) => p.city).filter(Boolean))).sort() as string[];
  }
  const { data, error } = await supabase.from('players').select('city');
  if (error || !data) return [];
  return Array.from(new Set(data.map((r) => r.city).filter(Boolean))).sort() as string[];
}

/** Stat lines for a specific set of players (one query, not all of them). */
export async function getStatLinesForPlayers(playerIds: string[]): Promise<StatLine[]> {
  if (playerIds.length === 0) return [];
  if (!isSupabaseConfigured || !supabase) {
    const set = new Set(playerIds);
    return demo.statLines.filter((l) => set.has(l.playerId));
  }
  const { data, error } = await supabase
    .from('stat_lines')
    .select('id, match_id, player_id, sport, stats, won, opponent, recorded_at')
    .in('player_id', playerIds);
  if (error || !data) return [];
  return (data as StatLineRow[]).map((r) => ({
    id: r.id,
    matchId: r.match_id ?? '',
    playerId: r.player_id,
    sport: r.sport as SportId,
    stats: r.stats ?? {},
    won: r.won ?? false,
    opponent: r.opponent ?? undefined,
    date: r.recorded_at ?? undefined,
  }));
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
    supabase.from('stat_lines').select('id, match_id, player_id, sport, stats, won, opponent, recorded_at'),
    supabase.from('match_disputes').select('match_id, player_id').eq('status', 'open'),
  ]);
  if (error || !data) return [];
  const openKeys = new Set((dis.data ?? []).map((r: { match_id: string; player_id: string }) => `${r.match_id}:${r.player_id}`));
  const lines = (data as StatLineRow[]).map((r) => ({
    id: r.id,
    matchId: r.match_id ?? '',
    playerId: r.player_id,
    sport: r.sport as SportId,
    stats: r.stats ?? {},
    won: r.won ?? false,
    opponent: r.opponent ?? undefined,
    date: r.recorded_at ?? undefined,
  }));
  return heldOut(lines, openKeys);
}

/* ----------------------- Team invites & captaincy -------------------------- */

/** Create a shareable invite token for a captain/coach to claim a team. */
export async function createInvite(teamId: string, teamName: string, role: 'captain' | 'coach' = 'captain'): Promise<TeamInvite> {
  const token = nextInviteToken();
  const invite: TeamInvite = { token, teamId, teamName, role };
  if (!isSupabaseConfigured || !supabase) {
    addDemoInvite(invite);
    return invite;
  }
  await supabase.from('team_invites').insert({ token, team_id: teamId, role });
  return invite;
}

/** Resolve an invite token to its team (or null if the code is invalid). */
export async function getInvite(token: string): Promise<TeamInvite | null> {
  const t = token.trim().toUpperCase();
  if (!isSupabaseConfigured || !supabase) return demo.invites[t] ?? null;
  const { data } = await supabase.from('team_invites').select('token, team_id, role').eq('token', t).maybeSingle();
  if (!data) return null;
  const team = await getTeamSummary(data.team_id as string);
  return { token: t, teamId: data.team_id as string, teamName: team?.name ?? 'Team', role: data.role as 'captain' | 'coach' };
}

/** Claim an invite: record the signed-in user as captain of the team. */
export async function claimInvite(token: string, profileId?: string): Promise<TeamInvite | null> {
  const invite = await getInvite(token);
  if (!invite) return null;
  if (!isSupabaseConfigured || !supabase) {
    addDemoCaptainTeam(invite.teamId);
    return invite;
  }
  if (profileId) {
    await supabase.from('team_staff').upsert({ team_id: invite.teamId, profile_id: profileId, role: invite.role });
  }
  return invite;
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
  const { data, error } = await supabase
    .from('match_events')
    .select('seq, type, side, payload, attribution')
    .eq('match_id', matchId)
    .order('seq', { ascending: true });
  if (error || !data) return [];
  return data as MatchEventRecord[];
}

export async function appendMatchEvent(matchId: string, rec: MatchEventRecord): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    appendDemoMatchEvent(matchId, rec);
    return;
  }
  await supabase.from('match_events').insert({
    match_id: matchId,
    seq: rec.seq,
    type: rec.type,
    side: rec.side ?? null,
    payload: rec.payload ?? {},
    attribution: rec.attribution ?? null,
  });
}

/** Remove & return the most recent event for a match — powers undo. */
export async function popMatchEvent(matchId: string): Promise<MatchEventRecord | null> {
  if (!isSupabaseConfigured || !supabase) return popDemoMatchEvent(matchId);
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
export async function setMatchScorer(matchId: string, scorerId: string | null): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    const m = demo.matches.find((x) => x.id === matchId);
    if (m) m.scorerId = scorerId ?? undefined;
    return;
  }
  await supabase.from('matches').update({ scorer_id: scorerId }).eq('id', matchId);
}

/** Replace the set of hosts for a match (any current host can add/remove). */
export async function setMatchHosts(matchId: string, hostIds: string[]): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    const m = demo.matches.find((x) => x.id === matchId);
    if (m) m.hostIds = hostIds;
    return;
  }
  await supabase.from('matches').update({ host_ids: hostIds }).eq('id', matchId);
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

/** Set a match's logo/banner image. */
export async function setMatchLogo(matchId: string, logoUrl: string | null): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    const m = demo.matches.find((x) => x.id === matchId);
    if (m) m.logoUrl = logoUrl ?? undefined;
    return;
  }
  await supabase.from('matches').update({ logo_url: logoUrl }).eq('id', matchId);
}

/** Set a tournament's logo/banner image. */
export async function setTournamentLogo(tournamentId: string, logoUrl: string | null): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    const t = demo.tournaments.find((x) => x.id === tournamentId);
    if (t) t.logoUrl = logoUrl ?? undefined;
    return;
  }
  await supabase.from('tournaments').update({ logo_url: logoUrl }).eq('id', tournamentId);
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
export async function findPlayerByPhone(phone: string): Promise<Player | null> {
  if (!isValidPhone(phone)) return null;
  if (!isSupabaseConfigured || !supabase) {
    return demo.players.find((p) => samePhone(p.phone, phone)) ?? null;
  }
  const { data } = await supabase.from('players').select(PLAYER_SELECT).eq('phone', normalizePhone(phone)).limit(1);
  const row = (data as PlayerRow[] | null)?.[0];
  return row ? toPlayer(row) : null;
}

/** Identity lookup by email (secondary to phone) — the one player who registered
 *  this email, or null. Case-insensitive. */
export async function findPlayerByEmail(email: string): Promise<Player | null> {
  const e = email.trim().toLowerCase();
  if (!e.includes('@')) return null;
  if (!isSupabaseConfigured || !supabase) return demo.players.find((p) => (p.email ?? '').toLowerCase() === e) ?? null;
  const { data } = await supabase.from('players').select(PLAYER_SELECT).ilike('email', e).limit(1);
  const row = (data as PlayerRow[] | null)?.[0];
  return row ? toPlayer(row) : null;
}

/** People search for the co-host picker: name substring + an exact phone/email
 *  identity match, merged and de-duplicated (best few). */
export async function lookupPeople(query: string): Promise<Player[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const results = new Map<string, Player>();
  for (const p of await searchPlayers({ query: q })) results.set(p.id, p);
  if (q.includes('@')) { const p = await findPlayerByEmail(q); if (p) results.set(p.id, p); }
  else if (q.replace(/[^0-9]/g, '').length >= 7) { const p = await findPlayerByPhone(q); if (p) results.set(p.id, p); }
  return [...results.values()].slice(0, 8);
}

export interface InvitePlayerResult { player: Player; status: 'existing' | 'invited'; }

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
    .select(PLAYER_SELECT)
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Could not create the invite');
  return { player: toPlayer(data as PlayerRow), status: 'invited' };
}

/** Add a player to a team by name + phone (the invite-to-install growth loop).
 *  If the number belongs to a registered player, they're added directly (confirmed).
 *  Otherwise a PENDING player is created + added to the team sheet as "invited" —
 *  confirmed only once they install & register. The caller sends the WhatsApp
 *  invite (see openWhatsApp) and refetches the roster. */
export async function invitePlayer(args: { teamId: string; teamName: string; name: string; phone: string; sport: SportId }): Promise<InvitePlayerResult> {
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
    // Live getRoster is houseName-based; a new invited player already carries
    // house_name = the team name, so they're picked up without a roster write.
  };

  // One number ⇒ one identity: reuse whoever already owns this number (their name
  // is pulled up, never duplicated). A confirmed account → 'existing'; a still-
  // pending invite → re-added as 'invited'.
  const existing = await findPlayerByPhone(args.phone);
  if (existing) {
    await appendRoster(existing.id);
    return { player: existing, status: existing.invited ? 'invited' : 'existing' };
  }
  // New number → create a pending invited player (phone stored normalised).
  if (!isSupabaseConfigured || !supabase) {
    const player = addPlayer({ fullName: args.name.trim(), sports: [args.sport], houseName: args.teamName, phone: normalizePhone(args.phone), phoneVerified: false, invited: true });
    await appendRoster(player.id);
    return { player, status: 'invited' };
  }
  const { data, error } = await supabase.from('players')
    .insert({ full_name: args.name.trim(), sports: [args.sport], house_name: args.teamName, phone: normalizePhone(args.phone), phone_verified: false })
    .select(PLAYER_SELECT).single();
  if (error || !data) throw new Error(error?.message ?? 'Could not add player');
  const p = toPlayer(data as PlayerRow);
  await appendRoster(p.id);
  return { player: p, status: 'invited' };
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

export async function updateMatchSnapshot(matchId: string, state: object, completed: boolean): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    const m = demo.matches.find((x) => x.id === matchId);
    if (m) {
      m.state = state;
      m.status = completed ? 'completed' : 'live';
    }
    return;
  }
  await supabase
    .from('matches')
    .update({ state, status: completed ? 'completed' : 'live', updated_at: new Date().toISOString() })
    .eq('id', matchId);
}

/* ----------------------------- Lineups (football) -------------------------- */

export async function getLineup(matchId: string, sport?: SportId): Promise<MatchLineup> {
  // Blank formation comes from the sport's plugin (football's pitch by default).
  const fresh = () => (sport ? getSport(sport).formation?.() ?? emptyFormation() : emptyFormation());
  const blank: MatchLineup = { home: fresh(), away: fresh(), homeFormation: '4-3-3', awayFormation: '4-3-3' };
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

export async function savePushToken(token: string, profileId?: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase || !profileId) return;
  await supabase.from('push_tokens').upsert({ profile_id: profileId, token });
}

/** Players eligible to play a given sport for a given house/team. A team with an
 *  explicit roster (created within a community) uses that; otherwise the roster
 *  is derived from players whose house matches the team name. */
export async function getRoster(teamName: string, sport: SportId): Promise<Player[]> {
  if (!isSupabaseConfigured || !supabase) {
    const team = demo.teams.find((t) => t.name === teamName && t.sport === sport && t.roster?.length);
    if (team?.roster?.length) {
      const ids = new Set(team.roster);
      return demo.players.filter((p) => ids.has(p.id));
    }
    return demo.players.filter((p) => p.houseName === teamName && p.sports.includes(sport));
  }
  const { data, error } = await supabase
    .from('players')
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
      if (merged.length !== (existing.sports ?? []).length) await updatePlayer(existing.id, { sports: merged });
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
    .select(PLAYER_SELECT)
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Could not create profile');
  return toPlayer(data as PlayerRow);
}

export type PlayerPatch = Partial<
  Pick<Player, 'fullName' | 'city' | 'gender' | 'bio' | 'houseName' | 'jerseyNo' | 'sports' | 'phone' | 'email' | 'phoneVerified' | 'emailVerified' | 'photoUrl' | 'sportDetails' | 'dob' | 'guardian' | 'verification'>
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

/** Update a player's own profile details. */
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
  if (patch.photoUrl !== undefined) row.photo_url = patch.photoUrl || null;
  if (patch.sportDetails !== undefined) row.sport_details = patch.sportDetails;
  if (patch.dob !== undefined) row.dob = patch.dob || null;
  if (patch.guardian !== undefined) row.guardian = patch.guardian ?? null;
  if (patch.verification !== undefined) row.verification = patch.verification ?? null;
  await supabase.from('players').update(row).eq('id', id);
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
export async function beginContactVerification(playerId: string, channel: 'phone' | 'email'): Promise<{ sent: boolean; demoCode?: string }> {
  if (isSupabaseConfigured && supabase && channel === 'email') {
    try {
      const { data, error } = await supabase.functions.invoke('send-contact-otp', { body: { playerId, channel } });
      const d = data as { sent?: boolean; reason?: string; detail?: string } | null;
      if (!error && d?.sent) return { sent: true };
      // Not delivered — log why (unverified sender domain, etc.) for debugging; the
      // UI just falls back to the on-screen code.
      console.warn('send-contact-otp not delivered:', error?.message ?? d?.reason, d?.detail ?? '');
    } catch (e) {
      console.warn('send-contact-otp failed:', e);
    }
  }
  return { sent: false, demoCode: String(Math.floor(100000 + Math.random() * 900000)) };
}

/** Verify an emailed OTP server-side; on success the edge function flips the
 *  player's email_verified flag. Returns whether the code matched. */
export async function verifyContactOtp(playerId: string, channel: 'phone' | 'email', code: string): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;
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
 *  support team to review. Marks the profile "pending"; a real build emails the
 *  file to SUPPORT_EMAIL, where support approves or rejects it. */
export async function submitVerificationDoc(id: string, docName: string): Promise<void> {
  const p = await getPlayer(id);
  const at = Date.now();
  // Fresh pending cycle, but the full history is carried forward (append-only).
  await updatePlayer(id, {
    verification: {
      status: 'pending',
      docName,
      submittedAt: at,
      history: [...(p?.verification?.history ?? []), { action: 'submitted', at, docName }],
    },
  });
}

/** Profiles awaiting verification review (support console). */
export async function getPendingVerifications(): Promise<Player[]> {
  if (!isSupabaseConfigured || !supabase) {
    return demo.players.filter((p) => p.verification?.status === 'pending');
  }
  const { data } = await supabase.from('players').select(PLAYER_SELECT).eq('verification->>status', 'pending');
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
  const { data: prof } = await supabase.from('profiles').select('full_name, phone, dob, guardian').eq('id', profileId).single();
  const { data, error } = await supabase
    .from('players')
    .insert({ profile_id: profileId, full_name: prof?.full_name ?? 'Player', sports: [], phone: prof?.phone ?? null, dob: prof?.dob ?? null, guardian: prof?.guardian ?? null })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Could not create your profile');
  return data.id as string;
}

/* ----------------------------- Organizer writes ---------------------------- */

export interface NewTournament {
  name: string;
  hostName: string;
  /** when an organization hosts; otherwise the creator is the individual host */
  hostOrgId?: string;
  /** open for registration (discoverable) */
  isOpen?: boolean;
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
}

export async function createTournament(input: NewTournament): Promise<Tournament> {
  const me = demo.players[0]?.id;
  // Org-hosted → no individual hostIds (the org's members are the hosts);
  // otherwise the creator is the sole individual host.
  if (!isSupabaseConfigured || !supabase)
    return addTournament({ ...input, isOpen: input.isOpen, hostIds: [...new Set([...(input.hostOrgId ? [] : me ? [me] : []), ...(input.coHostIds ?? [])])] });
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
      host_ids: [...new Set([...(input.hostOrgId ? [] : myPlayerId ? [myPlayerId] : []), ...(input.coHostIds ?? [])])],
      is_open: input.isOpen ?? false,
      reminder_lead_minutes: input.reminderLeadMinutes ?? null,
    })
    .select(TOURNAMENT_SELECT)
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Could not create tournament');
  return toTournament(data);
}

/* ------------------------------ Organizations ------------------------------ */

const toOrganization = (r: any): Organization => ({
  id: r.id,
  name: r.name,
  type: r.type ?? undefined,
  logoUrl: r.logo_url ?? undefined,
  city: r.city ?? undefined,
  email: r.email ?? undefined,
  phone: r.phone ?? undefined,
  bio: r.bio ?? undefined,
  members: r.members ?? [],
  academicYears: r.academic_years ?? undefined,
  graduatingStandard: r.graduating_standard ?? undefined,
});
const ORG_SELECT = 'id, name, type, logo_url, city, email, phone, bio, members, academic_years, graduating_standard';

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
  const members: Organization['members'] = creatorPlayerId
    ? [{ playerId: creatorPlayerId, role: 'Admin', since: todayISO() }]
    : [];
  let org: Organization;
  if (!isSupabaseConfigured || !supabase) {
    org = addOrganization({ ...input, members });
  } else {
    const { data, error } = await supabase
      .from('organizations')
      .insert({ name: input.name, type: input.type ?? null, city: input.city ?? null, email: input.email ?? null, phone: input.phone ?? null, members })
      .select(ORG_SELECT)
      .single();
    if (error || !data) throw new Error(error?.message ?? 'Could not create community');
    org = toOrganization(data);
  }
  if (creatorPlayerId) await joinOrg(org.id, creatorPlayerId, 'Admin');
  return (await getOrganization(org.id)) ?? org;
}

export async function getOrganizations(): Promise<Organization[]> {
  if (!isSupabaseConfigured || !supabase) return demo.organizations;
  const { data, error } = await supabase.from('organizations').select(ORG_SELECT).order('name');
  if (error || !data) return [];
  return data.map(toOrganization);
}

export async function getOrganization(id: string): Promise<Organization | null> {
  if (!isSupabaseConfigured || !supabase) return demo.organizations.find((o) => o.id === id) ?? null;
  const { data } = await supabase.from('organizations').select(ORG_SELECT).eq('id', id).maybeSingle();
  return data ? toOrganization(data) : null;
}

/** Replace an org's member list (add/remove/role changes) — admins only. */
export async function setOrgMembers(orgId: string, members: Organization['members']): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    demoSetOrgMembers(orgId, members);
    return;
  }
  await supabase.from('organizations').update({ members }).eq('id', orgId);
}

const todayISO = () => new Date().toISOString().slice(0, 10);

/** Add (or re-activate) a player in a community, enforcing the rule that a
 *  player can be active in only one community per category at a time. Joining a
 *  community ends any other *active* membership of the same category (sets its
 *  `until` to today, moving it to the player's "past communities"). Memberships
 *  in communities of *different* categories are left untouched. */
export async function joinOrg(orgId: string, playerId: string, role: OrgRole = 'Member'): Promise<void> {
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
    const orphaned = sameCat.find((o) => isSoleActiveAdmin(o, playerId));
    if (orphaned) {
      throw new Error(`You're the only admin of ${orphaned.name}. Add another admin there before joining a new ${category}.`);
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
}

/** End a player's active membership in a community (moves it to "past"). A sole
 *  admin can't leave until another admin is appointed. */
export async function leaveOrg(orgId: string, playerId: string): Promise<void> {
  const org = await getOrganization(orgId);
  if (!org) return;
  if (isSoleActiveAdmin(org, playerId)) {
    throw new Error(`You're the only admin of ${org.name}. Add another admin before leaving.`);
  }
  await setOrgMembers(
    orgId,
    org.members.map((m) => (m.playerId === playerId && !m.until ? { ...m, until: todayISO() } : m))
  );
}

/** Set an organization's logo image — admins only. */
export async function setOrgLogo(orgId: string, logoUrl: string | null): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    const o = demo.organizations.find((x) => x.id === orgId);
    if (o) o.logoUrl = logoUrl ?? undefined;
    return;
  }
  await supabase.from('organizations').update({ logo_url: logoUrl }).eq('id', orgId);
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
  /** initial roster (player ids) */
  roster?: string[];
  /** created on the fly (a one-off side for a friendly) — de-emphasised in Manage teams */
  adhoc?: boolean;
}

export async function createTeam(input: NewTeam): Promise<Team> {
  if (!isSupabaseConfigured || !supabase) return addTeam(input);
  const { data, error } = await supabase
    .from('teams')
    .insert({ name: input.name, short_name: input.shortName, sport: input.sport, color_hex: input.colorHex, org_id: input.orgId ?? null, roster: input.roster ?? null, adhoc: input.adhoc ?? false })
    .select('id,name,short_name,sport,color_hex,org_id,roster,adhoc')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Could not create team');
  return toTeam(data as TeamRow);
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
  await supabase.from('teams').update({ roster }).eq('id', teamId);
}

/* -------------------------- Tournament participants ------------------------ */
// The teams an organizer registers into a tournament — the roster that drives
// format decisions (how many teams → groups / bracket size). Distinct from the
// teams merely appearing in a tournament's matches. See migration 0003.

/** The teams registered to a tournament (optionally narrowed to one sport). */
export async function getTournamentTeams(tournamentId: string, sport?: SportId): Promise<Team[]> {
  if (!isSupabaseConfigured || !supabase) {
    const ids = new Set(demo.tournamentTeams.filter((r) => r.tournamentId === tournamentId).map((r) => r.teamId));
    return demo.teams.filter((t) => ids.has(t.id) && (!sport || t.sport === sport));
  }
  const { data, error } = await supabase
    .from('tournament_teams')
    .select('teams(id,name,short_name,sport,color_hex,org_id,roster)')
    .eq('tournament_id', tournamentId);
  if (error || !data) return [];
  // The joined `teams` relation may come back as an object or a single-element
  // array depending on the client's inference — normalise both to a row.
  const teams = (data as unknown as { teams: TeamRow | TeamRow[] | null }[])
    .map((r) => (Array.isArray(r.teams) ? r.teams[0] : r.teams))
    .filter((t): t is TeamRow => !!t)
    .map(toTeam);
  return sport ? teams.filter((t) => t.sport === sport) : teams;
}

/** Register one or more teams as tournament participants (idempotent). */
export async function addTournamentTeams(tournamentId: string, teamIds: string[]): Promise<void> {
  if (!teamIds.length) return;
  if (!isSupabaseConfigured || !supabase) {
    addTournamentTeamsDemo(tournamentId, teamIds);
    return;
  }
  await supabase
    .from('tournament_teams')
    .upsert(teamIds.map((teamId) => ({ tournament_id: tournamentId, team_id: teamId })), { onConflict: 'tournament_id,team_id' });
}

/** Drop a team from a tournament's participant list. */
export async function removeTournamentTeam(tournamentId: string, teamId: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    removeTournamentTeamDemo(tournamentId, teamId);
    return;
  }
  await supabase.from('tournament_teams').delete().eq('tournament_id', tournamentId).eq('team_id', teamId);
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
