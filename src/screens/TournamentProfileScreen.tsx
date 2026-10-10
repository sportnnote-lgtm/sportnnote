/** Tournament hub: overview, follow, the overall house table, a per-sport
 *  league table + statistics rail, and participating teams. For a single-sport
 *  tournament the sport selector is skipped and its table shown directly. */
import { notice } from '../core/confirm';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, Platform, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { FollowBell } from '../components/FollowBell';
import { EmptyState, Card, Pill, Button, SelectChip, ScreenTitle, textStyles } from '../components/ui';
import { LeagueTable } from '../components/LeagueTable';
import { columnsConfig } from '../data/standingsColumns';
import { RankBadge, podiumColor } from '../components/Rank';
import { StatLeaderRail } from '../components/StatLeaderRail';
import { HostsCard } from '../components/HostsCard';
import { PersonPicker } from '../components/PersonPicker';
import { LogoPicker } from '../components/LogoPicker';
import { MatchCard } from '../components/MatchCard';
import { SectionHeader, SECTION_CAP } from '../components/SectionHeader';
import { getSport } from '../sports/registry';
import { shareMessage } from '../core/share';
import { tournamentShareText, tournamentLink } from '../core/shareText';
import { fixturesPrintHtml, fixturesShareText, type FixtureRow } from '../core/fixturesText';
import { formatDate, formatTime, zoneAbbrev } from '../core/time';
import { tournamentStatus, matchProgress } from '../core/tournament';
import { useAuth } from '../core/auth';
import { useTournamentById, useTeamSummaries, useFollow, useLeagueData, usePlayers, useOrganizations, useTournamentTeams, useTournamentEntries, useCaptainships } from '../data/hooks';
import { getMyPlayerId, setTournamentHosts, setTournamentLogo, setTournamentBanner, getTournamentBanner, setTournamentReminderLeads, requestJoinTournament, setTournamentTeamStatus, transferTournamentOwnership, getOwnershipEvents, getTournamentOfficials, assignTournamentOfficial, unassignTournamentOfficial, getTournamentAwards } from '../data/repos';
import { TournamentAwardsTab } from '../components/TournamentAwardsTab';
import { LEAD_OPTIONS, DEFAULT_LEAD_MINUTES } from '../data/reminderPrefs';
import { canManageTournament, tournamentHostPlayerIds, isAcademicCommunity, standardAt, membersOnDate, organizableOrgsForPlayer, hasOrgRole } from '../core/org';
import type { OwnershipEvent, OwnerRef, TournamentOfficial, OfficialRole, TournamentAwards } from '../core/types';
import { notify } from '../core/notifications';
import { overallStandings, teamStandings, categoryLeaders, standingsConfigFromFormat, pointsSystemLabel } from '../data/standings';
import { structureFromFormat, describeStructure } from '../data/structureConfig';
import { medalStandings } from '../data/medalStandings';
import { MedalTable } from '../components/MedalTable';
import { groupTables, superPhaseLabel, standingsPhases } from '../data/groups';
import type { SportId } from '../core/types';
import type { RootStackParamList } from '../navigation/types';
import { useParamState } from '../navigation/useParamState';
import { openMatchViewer } from '../navigation/openMatch';
import { RemindInstall } from '../components/RemindInstall';
import { realName } from '../core/invite';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setupChecklist, firstSportWithoutFormat, type SetupStep } from '../data/setupChecklist';
import { SetupChecklist } from '../components/SetupChecklist';
import { Markdown } from '../components/Markdown';
import { EVENT_CATEGORIES, inlineFieldKeys } from '../data/tournamentForm';
import { assignableMatches } from '../data/scorerAssign';
import { openVenue } from '../core/venue';
import { openWhatsApp } from '../core/connect';
import type { Tournament } from '../core/types';

/** "🏏 T20 · Leather · Turf" — the sport's inline basics (preset + onCreate
 *  fields) that the tournament actually set; empty when none are set. */
function basicsLine(t: Tournament, sport: SportId): string {
  const plugin = getSport(sport);
  const fmt = (t.formats as Record<string, Record<string, unknown>> | undefined)?.[sport];
  if (!fmt) return '';
  const parts = inlineFieldKeys(plugin.formatFields).flatMap((k) => {
    const field = plugin.formatFields?.find((f) => f.key === k);
    const v = fmt[k];
    if (!field || v === undefined || v === 'custom') return [];
    const label = field.options?.find((o) => o.value === v)?.label;
    return label ? [label.replace(/\s*\(.*\)\s*$/, '')] : [];
  });
  return parts.length ? `${plugin.icon} ${parts.join(' · ')}` : '';
}

type Nav = NativeStackNavigationProp<RootStackParamList>;

const PARTICIPATION_LABEL: Record<string, string> = {
  inter_house: '🏠 Inter-house (Houses compete)',
  school_team: '🏫 School team',
  individual: '👤 Individuals',
  open: 'Open teams',
};

export default function TournamentProfileScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'Tournament'>>();
  const { profile } = useAuth();
  const tournament = useTournamentById(params.tournamentId);
  const teams = useTeamSummaries();
  const { isFollowing, toggle } = useFollow(profile?.id);
  const { matches, lines, players } = useLeagueData(params.tournamentId);
  const participants = useTournamentTeams(params.tournamentId);
  const allPlayers = usePlayers();
  const orgs = useOrganizations();
  // The banner is read on its own (tolerates a database without the column yet).
  const [banner, setBanner] = useState<string | undefined>(undefined);
  useEffect(() => {
    let on = true;
    void getTournamentBanner(params.tournamentId).then((b) => on && setBanner(b));
    return () => { on = false; };
  }, [params.tournamentId]);
  // Awards (parity #21) — read on their own select (none before the migration).
  const [awards, setAwards] = useState<TournamentAwards | undefined>(undefined);
  useEffect(() => {
    let on = true;
    void getTournamentAwards(params.tournamentId).then((a) => on && setAwards(a));
    return () => { on = false; };
  }, [params.tournamentId]);

  // Individual-host list (managed in-place); org-hosted tournaments manage hosts
  // through the organization instead.
  const [hostIds, setHostIds] = useState<string[]>([]);
  useEffect(() => setHostIds(tournament?.hostIds ?? []), [tournament?.id, tournament?.hostIds]);
  const [myId, setMyId] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    getMyPlayerId(profile?.id).then((id) => on && setMyId(id));
    return () => { on = false; };
  }, [profile?.id]);
  // ⚙ Manage in the header (managers only) — set once the tab state exists below.
  const [headerManage, setHeaderManage] = useState<(() => void) | null>(null);
  // Title the nav bar after the tournament, not a generic "Tournament".
  useEffect(() => {
    if (!tournament) return;
    const share = () => void shareMessage(tournamentShareText({
      name: tournament.name,
      sportLine: tournament.sports.map((sp) => `${getSport(sp).icon} ${getSport(sp).name}`).join(' · '),
      tournamentId: tournament.id,
    }), 'tournament');
    nav.setOptions({
      title: tournament.name,
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {headerManage && !tournament.deletedAt ? (
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Manage this tournament" onPress={headerManage} hitSlop={10} style={{ paddingHorizontal: theme.spacing(2) }}>
              <Text style={{ color: theme.colors.primary, fontWeight: '800', fontSize: theme.font.body }}>⚙ Manage</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Share this tournament" onPress={share} hitSlop={10} style={{ paddingHorizontal: theme.spacing(2) }}>
            <Text style={{ color: theme.colors.primary, fontWeight: '800', fontSize: theme.font.body }}>Share</Text>
          </TouchableOpacity>
        </View>
      ),
    });
  }, [nav, tournament, headerManage]);
  // People added as hosts from outside the loaded players (PersonPicker).
  const [extraPeople, setExtraPeople] = useState<Record<string, string>>({});
  const hostInvite = (name?: string) => `Hi${name ? ` ${name}` : ''}! ${profile?.fullName ?? 'A friend'} added you as a host of ${tournament?.name ?? 'a tournament'} on SportnNote 🏆\n\n`
    + `Open this link and sign in with this mobile number to help run it:\n${tournament ? tournamentLink(tournament.id) : 'https://app.sportnnote.in'}`;
  const playerName = (id: string) => allPlayers.find((p) => p.id === id)?.fullName ?? extraPeople[id];
  const hostOrg = tournament?.hostOrgId ? orgs.find((o) => o.id === tournament.hostOrgId) : undefined;
  // Manage = an individual host, or any member of the hosting org.
  const canManageHosts = tournament ? canManageTournament(tournament, orgs, myId) : false;
  const saveHosts = (ids: string[]) => {
    setHostIds(ids);
    if (tournament) void setTournamentHosts(tournament.id, ids);
  };

  // Per-tournament reminder override (undefined ⇒ players use their own settings).
  const [reminderMins, setReminderMins] = useState<number[] | undefined>(undefined);
  useEffect(() => setReminderMins(tournament?.reminderLeadMinutes), [tournament?.id, tournament?.reminderLeadMinutes]);
  const customReminders = reminderMins !== undefined;
  const saveReminders = (mins: number[] | undefined) => {
    setReminderMins(mins);
    if (tournament) void setTournamentReminderLeads(tournament.id, mins);
  };
  // Captain self-service: enter one of your teams into this tournament (a
  // 'pending' entry the organizer approves), or accept an invite for your team.
  const { ids: captainIds } = useCaptainships();
  const [entryTick, setEntryTick] = useState(0);
  const entries = useTournamentEntries(params.tournamentId, undefined, entryTick);
  const [entryNote, setEntryNote] = useState<string | null>(null);
  const statusByTeam = new Map(entries.map((e) => [e.team.id, e.status]));
  const myEligibleTeams = teams.filter(
    (t) => captainIds.includes(t.id) && t.sports.some((s) => (tournament?.sports ?? []).includes(s)),
  );
  const notifyHosts = (title: string, body: string) => {
    if (!tournament) return;
    for (const hid of tournamentHostPlayerIds(tournament, orgs)) void notify({ title, body, playerId: hid });
  };
  const requestEnter = async (teamId: string, teamName: string) => {
    await requestJoinTournament(params.tournamentId, teamId);
    notifyHosts(`📝 Entry request — ${tournament?.name ?? ''}`, `${teamName} requested to join. Review it in Participating teams.`);
    setEntryNote(`Requested — ${teamName} is awaiting the organizer’s approval.`);
    setEntryTick((n) => n + 1);
  };
  const acceptInvite = async (teamId: string, teamName: string) => {
    await setTournamentTeamStatus(params.tournamentId, teamId, 'confirmed');
    notifyHosts(`✅ Invite accepted — ${tournament?.name ?? ''}`, `${teamName} accepted your invite.`);
    setEntryNote(`${teamName} is in! 🎉`);
    setEntryTick((n) => n + 1);
  };

  const sports = tournament?.sports ?? [];
  const [sport, setSport] = useState<SportId | null>(null);
  const activeSport = sport ?? sports[0];

  // The page is split into tabs so it never becomes an endless scroll: Info (the
  // overview + how to enter), Manage (key 'Settings'; organizer-only), Matches, Stats
  // (standings + leaders), Awards and Teams. Manage only exists for people who
  // can manage; Awards for them always, for everyone else once published (#21).
  type Tab = 'Info' | 'Settings' | 'Matches' | 'Stats' | 'Awards' | 'Teams';
  const [tab, setTab] = useParamState<Tab>('tab', 'Info');
  // Admin hub (parity #08): one inline panel open at a time; the gear jumps here.
  const [panel, setPanel] = useParamState<string>('panel', '');
  useEffect(() => {
    setHeaderManage(() => (canManageHosts ? () => setTab('Settings') : null));
  }, [canManageHosts, setTab]);
  const [setupHidden, setSetupHidden] = useState(false);
  useEffect(() => {
    let on = true;
    void AsyncStorage.getItem(`setupHidden:${params.tournamentId}`).then((v) => on && setSetupHidden(v === '1')).catch(() => {});
    return () => { on = false; };
  }, [params.tournamentId]);
  const hideSetup = () => {
    setSetupHidden(true);
    void AsyncStorage.setItem(`setupHidden:${params.tournamentId}`, '1').catch(() => {});
  };
  const setupSteps = tournament ? setupChecklist(tournament, participants.length, matches.length) : [];
  const openSetupStep = (key: SetupStep['key']) => {
    if (!tournament) return;
    if (key === 'teams') nav.navigate('TournamentTeams', { tournamentId: tournament.id });
    else if (key === 'format') nav.navigate('SportSettings', { sport: firstSportWithoutFormat(tournament) as SportId, tournamentId: tournament.id });
    else {
      const amSport = tournament.sports.find((sp) => structureFromFormat(tournament.formats?.[sp])?.shape === 'americano');
      if (amSport) nav.navigate('Americano', { tournamentId: tournament.id, sport: amSport });
      else nav.navigate('GenerateFixtures', { tournamentId: tournament.id });
    }
  };
  // Reset the content scroll to the top when switching tabs, so a new tab never
  // opens part-way down where the previous tab was scrolled.
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => { scrollRef.current?.scrollTo({ y: 0, animated: false }); }, [tab]);

  // This tournament's matches, split into upcoming & completed for history,
  // optionally filtered to one of the tournament's sports.
  const [matchTab, setMatchTab] = useState<'upcoming' | 'completed'>('upcoming');
  const [matchSport, setMatchSport] = useState<SportId | 'all'>('all');
  // "Top 5 + See all" expand toggles for the variable-length record-list sections.
  const [showMatches, setShowMatches] = useState(false);
  const [showClasses, setShowClasses] = useState(false);
  const [showOverall, setShowOverall] = useState(false);
  const [showTeams, setShowTeams] = useState(false);
  // Ownership: the audit trail + the transfer panel.
  const [ownershipEvents, setOwnershipEvents] = useState<OwnershipEvent[]>([]);
  const [ownTick, setOwnTick] = useState(0);
  const [showTransfer, setShowTransfer] = useState(false);
  useEffect(() => { getOwnershipEvents(params.tournamentId).then(setOwnershipEvents); }, [params.tournamentId, ownTick]);
  // Officials (scorers/referees) assigned to this tournament.
  const [officials, setOfficials] = useState<TournamentOfficial[]>([]);
  const [offTick, setOffTick] = useState(0);
  useEffect(() => { getTournamentOfficials(params.tournamentId).then(setOfficials); }, [params.tournamentId, offTick]);
  const bySportFilter = (list: typeof matches) =>
    matchSport === 'all' ? list : list.filter((m) => m.sport === matchSport);
  const upcomingMatches = useMemo(
    () => bySportFilter(matches.filter((m) => m.status !== 'completed').sort((a, b) => a.startsAt.localeCompare(b.startsAt))),
    [matches, matchSport]
  );
  const completedMatches = useMemo(
    () => bySportFilter(matches.filter((m) => m.status === 'completed').sort((a, b) => b.startsAt.localeCompare(a.startsAt))),
    [matches, matchSport]
  );

  // Organiser: broadcast the upcoming fixtures (WhatsApp) or print them / save a PDF (web).
  const fixtureRows = (): FixtureRow[] => upcomingMatches.map((m) => ({
    startsAt: m.startsAt ?? '',
    day: m.startsAt ? formatDate(m.startsAt) : '',
    time: m.startsAt ? formatTime(m.startsAt) : '',
    home: m.homeTeam.name,
    away: m.awayTeam.name,
    sportIcon: (tournament?.sports.length ?? 0) > 1 ? getSport(m.sport).icon : undefined,
    venue: m.venueName,
    stage: m.group ? `Group ${m.group}` : m.stage ? String(m.stage) : undefined,
  }));
  const zone = zoneAbbrev().replace('GMT+5:30', 'IST');
  const shareFixtures = () => {
    if (!tournament) return;
    void shareMessage(fixturesShareText({ tournament: `${tournament.name} (times ${zone})`, rows: fixtureRows(), link: tournamentLink(tournament.id) }), 'tournament');
  };
  const printFixtures = () => {
    if (!tournament || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(fixturesPrintHtml({ tournament: tournament.name, rows: fixtureRows(), subtitle: `Fixtures · times ${zone}` }));
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

  const openMatch = (m: (typeof matches)[number]) => openMatchViewer(nav, m);

  // For a school/college host: which class each member was in during this event
  // (resolved from each student's class timeline at the tournament's start date).
  const classGroups = useMemo(() => {
    if (!tournament || !hostOrg || !isAcademicCommunity(hostOrg.type)) return [];
    const date = tournament.startDate;
    const groups = new Map<string, string[]>();
    for (const m of membersOnDate(hostOrg, date)) {
      const std = standardAt(m, date);
      if (!std) continue;
      const name = allPlayers.find((p) => p.id === m.playerId)?.fullName ?? 'Player';
      (groups.get(std) ?? groups.set(std, []).get(std)!).push(name);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [tournament, hostOrg, allPlayers]);

  // SD-18: with the sport's column units (sets / games / rally points) filled in.
  const stCfg = useMemo(() => (activeSport ? columnsConfig(activeSport, standingsConfigFromFormat(activeSport, tournament?.formats?.[activeSport])) : undefined), [activeSport, tournament]);
  // SD-12: each sport scored by the organiser's points config (and adjustments).
  const overall = useMemo(() => overallStandings(matches, sports, tournament?.formats), [matches, sports, tournament?.formats]);
  // A medal meet ranks the overall table by position points, not match points.
  const isMedal = tournament?.scoring?.mode === 'position';
  const medal = useMemo(
    () => (isMedal ? medalStandings(matches, sports, tournament?.scoring, tournament?.formats) : []),
    [isMedal, matches, sports, tournament?.scoring, tournament?.formats],
  );
  const table = useMemo(() => (activeSport ? teamStandings(matches, activeSport, stCfg, undefined, participants) : []), [matches, activeSport, stCfg, participants]);
  // Grouped tournaments show a table per group instead of one flat league table.
  const groups = useMemo(() => (activeSport ? groupTables(matches, activeSport, stCfg) : []), [matches, activeSport, stCfg]);
  // A Super round-robin phase (Asia-Cup style), if the tournament has one — its
  // own league table, separate from the group stage.
  const superMatches = useMemo(() => (activeSport ? matches.filter((m) => m.stage === 'super' && m.sport === activeSport) : []), [matches, activeSport]);
  const superTable = useMemo(() => (activeSport ? teamStandings(superMatches, activeSport, stCfg) : []), [superMatches, activeSport, stCfg]);
  const phases = useMemo(() => (activeSport ? standingsPhases(matches, activeSport, stCfg, participants) : []), [matches, activeSport, stCfg, participants]);
  const superName = superPhaseLabel(new Set(superMatches.flatMap((m) => [m.homeTeam.id, m.awayTeam.id])).size);
  const categories = useMemo(
    () => (activeSport ? categoryLeaders(lines, players, activeSport) : []),
    [lines, players, activeSport]
  );

  if (!tournament) {
    return (
      <SafeAreaView style={st.safe} edges={['bottom']}>
        <Text style={[textStyles.muted, { padding: theme.spacing(4) }]}>Loading…</Text>
      </SafeAreaView>
    );
  }
  // Soft-deleted (parity #09): a deep link lands here — say so, nothing else.
  if (tournament.deletedAt) {
    return (
      <SafeAreaView style={st.safe} edges={['bottom']}>
        <EmptyState icon="🗑️" title="This tournament was deleted by the organiser." />
      </SafeAreaView>
    );
  }
  const following = isFollowing('tournament', tournament.id);
  const singleSport = sports.length === 1;
  // Teams in this tournament (house ids appear in its matches).
  const teamIds = new Set(matches.flatMap((m) => [m.homeTeam.id, m.awayTeam.id]));
  const tourneyTeams = teams.filter((t) => teamIds.has(t.id));

  // Ownership: creator (retained), current owner, and where it can be transferred.
  const creatorName = tournament.createdBy ? (playerName(tournament.createdBy) ?? 'Someone') : undefined;
  const currentOwnerLabel = hostOrg ? hostOrg.name : (canManageHosts ? 'You (individual)' : 'Individual');
  const myOrgs = organizableOrgsForPlayer(orgs, myId);
  // Transfer targets: to an individual (you), or to any org you can organize for —
  // excluding the current owner.
  const transferToIndividual: OwnerRef | null = tournament.hostOrgId && myId ? { kind: 'individual', playerIds: [myId] } : null;
  const transferOrgs = myOrgs.filter((o) => o.id !== tournament.hostOrgId);
  async function transferOwnership(target: OwnerRef) {
    try {
      await transferTournamentOwnership(tournament!.id, target, myId ?? undefined);
    } catch (e) {
      notice('Couldn’t transfer ownership', e instanceof Error ? e.message : 'Please try again.');
      return;
    }
    setShowTransfer(false);
    setOwnTick((n) => n + 1);
  }

  // Officials: who's assigned, and who's eligible to be assigned. Org role
  // Scorer/Referee = eligibility; assignment here is the actual per-event duty (§9).
  const assignedIds = (role: OfficialRole) => officials.filter((o) => o.role === role).map((o) => o.playerId);
  const eligibleFor = (role: OfficialRole): string[] => {
    const orgRole = role === 'scorer' ? 'Scorer' : 'Referee';
    if (hostOrg) return hostOrg.members.filter((m) => !m.until && m.role === orgRole).map((m) => m.playerId);
    return tournament!.hostIds ?? []; // individual host: the hosts can officiate
  };
  async function assignOfficial(pid: string, role: OfficialRole) {
    try {
      await assignTournamentOfficial(tournament!.id, pid, role, myId ?? undefined);
    } catch (e) {
      notice('Couldn’t add them', e instanceof Error ? e.message : 'Please try again.');
      throw e; // PersonPicker shows its own "try again" too
    } finally {
      setOffTick((n) => n + 1);
    }
  }
  async function removeOfficial(pid: string, role: OfficialRole) {
    try {
      await unassignTournamentOfficial(tournament!.id, pid, role, myId ?? undefined);
    } catch (e) {
      notice('Couldn’t remove them', e instanceof Error ? e.message : 'Please try again.');
    }
    setOffTick((n) => n + 1);
  }
  const officialInvite = (role: OfficialRole) => (name?: string) => `Hi${name ? ` ${name}` : ''}! ${profile?.fullName ?? 'A friend'} added you as a ${role} for ${tournament?.name ?? 'a tournament'} on SportnNote 🏆\n\n`
    + `Open this link and sign in with this mobile number:\n${tournament ? tournamentLink(tournament.id) : 'https://app.sportnnote.in'}`;
  // Fixtures still waiting for a scorer (drives "Assign scorers to fixtures").
  const unscoredCount = assignableMatches(matches).length;

  const showAwards = canManageHosts || !!awards?.publishedAt;
  const TABS: Tab[] = [
    'Info', ...(canManageHosts ? ['Settings' as const] : []), 'Matches', 'Stats', ...(showAwards ? ['Awards' as const] : []), 'Teams',
  ];
  // The admin tab is labelled "Manage" (same as the header's ⚙ Manage); its
  // param key stays 'Settings' so old links keep working, and 'Manage' works too.
  const tabKey: Tab = (tab as string) === 'Manage' ? 'Settings' : tab;
  const activeTab: Tab = TABS.includes(tabKey) ? tabKey : 'Info';
  const tabLabel = (t: Tab) => (t === 'Settings' ? 'Manage' : t);

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      {/* Persistent header: identity + status stay visible across tabs. */}
      <View style={st.header}>
        {/* Banner: viewers see it only when set; hosts get "＋ Add banner". */}
        <LogoPicker
          shape="banner" kind="tournament-banner" aspect={[3, 1]} label="Add banner"
          logoUrl={banner}
          canManage={canManageHosts}
          onPick={async (url) => { await setTournamentBanner(tournament.id, url); setBanner(url); }}
        />
        <View style={st.titleRow}>
          <LogoPicker
            logoUrl={tournament.logoUrl}
            canManage={canManageHosts}
            kind="tournament-logo"
            onPick={(url) => setTournamentLogo(tournament.id, url)}
            size={44}
          />
          <View style={{ flex: 1 }}>
            <Text style={textStyles.h2} numberOfLines={1}>{tournament.name}</Text>
            <Text style={textStyles.muted} numberOfLines={1}>{tournament.hostName} · {tournament.startDate} → {tournament.endDate}</Text>
          </View>
        </View>
        {(() => {
          const s = tournamentStatus(tournament, matchProgress(matches));
          return (
            <View style={st.tags}>
              <Pill label={s.label} color={s.color + '22'} textColor={s.color} />
              {tournament.isOpen && <Pill label="🔓 Open for registration" color={theme.colors.primary + '22'} textColor={theme.colors.primary} />}
            </View>
          );
        })()}
        {/* Tab bar */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.tabBar}>
          {TABS.map((t) => (
            <TouchableOpacity accessibilityRole="tab" accessibilityState={{ selected: activeTab === t }} key={t} onPress={() => setTab(t)} style={[st.tabBtn, activeTab === t && st.tabBtnActive]} activeOpacity={0.8}>
              <Text style={[st.tabText, activeTab === t && st.tabTextActive]}>{tabLabel(t)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ------------------------------ AWARDS ------------------------------ */}
      {activeTab === 'Awards' ? (
        <TournamentAwardsTab
          tournament={tournament} matches={matches} lines={lines} players={players}
          canManage={canManageHosts} myId={myId} myName={profile?.fullName}
          activeSport={activeSport} onSport={setSport}
          awards={awards} onSaved={setAwards}
          onPlayer={(id) => nav.navigate('PlayerProfile', { playerId: id })}
        />
      ) : (
      <ScrollView ref={scrollRef} contentContainerStyle={st.content}>
        {/* ------------------------------- INFO ------------------------------- */}
        {activeTab === 'Info' && (
          <>
            {canManageHosts && !setupHidden && setupSteps.some((x) => !x.done) && (
              <Text style={st.link} accessibilityRole="button" onPress={() => setTab('Settings')}>
                Setup {setupSteps.filter((x) => x.done).length}/{setupSteps.length} · Continue ›
              </Text>
            )}
            {myEligibleTeams.length > 0 && (() => {
              const invitedMine = myEligibleTeams.filter((t) => statusByTeam.get(t.id) === 'invited');
              const requestable = tournament.isOpen ? myEligibleTeams.filter((t) => !statusByTeam.has(t.id)) : [];
              const pendingMine = myEligibleTeams.filter((t) => statusByTeam.get(t.id) === 'pending');
              if (!invitedMine.length && !requestable.length && !pendingMine.length) return null;
              return (
                <Card style={{ gap: theme.spacing(2) }}>
                  <Text style={textStyles.h3}>Enter a team</Text>
                  {invitedMine.map((t) => (
                    <View key={t.id} style={st.entryRow}>
                      <Text style={[textStyles.body, st.flex1]} numberOfLines={1}>{t.name} · invited</Text>
                      <Button label="Accept invite" onPress={() => acceptInvite(t.id, t.name)} />
                    </View>
                  ))}
                  {requestable.map((t) => (
                    <View key={t.id} style={st.entryRow}>
                      <Text style={[textStyles.body, st.flex1]} numberOfLines={1}>{t.name}</Text>
                      <Button label="Request to enter" variant="ghost" onPress={() => requestEnter(t.id, t.name)} />
                    </View>
                  ))}
                  {pendingMine.map((t) => (
                    <Text key={t.id} style={textStyles.muted}>{t.name} · requested — awaiting approval</Text>
                  ))}
                  {entryNote ? <Text style={st.entryNote}>{entryNote}</Text> : null}
                </Card>
              );
            })()}

            {sports.length > 0 && (
              <View style={st.tags}>
                {sports.map((s) => (
                  <TouchableOpacity accessibilityRole="button" key={s} activeOpacity={0.8} onPress={() => nav.navigate('SportHub', { tournamentId: tournament.id, sport: s, tournamentName: tournament.name })}>
                    <Pill label={`${getSport(s).icon} ${getSport(s).name} ›`} />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={st.followRow}>
              <Button
                label={following ? '✓ Following' : '+ Follow tournament'}
                variant={following ? 'ghost' : 'primary'}
                onPress={() => toggle('tournament', tournament.id)}
                style={{ flex: 1 }}
              />
              <FollowBell type="tournament" id={tournament.id} name={tournament.name} />
            </View>

            <Text style={textStyles.muted}>
              Organized by {currentOwnerLabel}{creatorName ? ` · Created by ${creatorName}` : ''}
            </Text>
            {tournament.participation && tournament.participation !== 'open' && (
              <Text style={textStyles.muted}>Contested by: {PARTICIPATION_LABEL[tournament.participation]}</Text>
            )}

            {tournament.structure && (
              <View style={{ gap: theme.spacing(1) }}>
                {sports.map((s) => {
                  const cfg = structureFromFormat(tournament.formats?.[s]);
                  return (
                    <Text key={s} style={textStyles.muted}>
                      {sports.length > 1 ? `${getSport(s).icon} ${getSport(s).name}: ` : 'Format: '}
                      {cfg ? describeStructure(cfg) : tournament.structure!.replace('_', ' + ')}
                    </Text>
                  );
                })}
              </View>
            )}

            {/* Details (parity #09): place, category, sport basics, about, contact. */}
            {(tournament.city || (tournament.grounds?.length ?? 0) > 0 || tournament.eventCategory) && (
              <View style={st.tags}>
                {tournament.eventCategory && (
                  <Pill label={EVENT_CATEGORIES.find((c) => c.key === tournament.eventCategory)?.label ?? tournament.eventCategory} />
                )}
                {tournament.city ? <Text style={[textStyles.muted, { alignSelf: 'center', color: theme.colors.text }]}>📍 {tournament.city}</Text> : null}
                {(tournament.grounds ?? []).map((g) => (
                  <TouchableOpacity key={g} accessibilityRole="link" accessibilityLabel={`Open ${g} in maps`} activeOpacity={0.8}
                    onPress={() => openVenue(tournament.city ? `${g}, ${tournament.city}` : g)}>
                    <Pill label={`📍 ${g} ›`} color={theme.colors.primary + '22'} textColor={theme.colors.primary} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {(() => {
              const lines = sports.map((s) => basicsLine(tournament, s)).filter(Boolean);
              return lines.length ? <View style={{ gap: theme.spacing(1) }}>{lines.map((l) => <Text key={l} style={textStyles.muted}>{l}</Text>)}</View> : null;
            })()}
            {tournament.about ? (
              <Card style={{ gap: theme.spacing(2) }}>
                <Text style={textStyles.h3}>About & rules</Text>
                <Markdown content={tournament.about} />
              </Card>
            ) : null}
            {(tournament.organiserPhone || tournament.organiserEmail) ? (
              <Card style={{ gap: theme.spacing(2) }}>
                <Text style={textStyles.h3}>Contact organiser</Text>
                <Text style={textStyles.muted}>
                  {[tournament.hostName, tournament.organiserPhone, tournament.organiserEmail].filter(Boolean).join(' · ')}
                </Text>
                <View style={st.tags}>
                  {tournament.organiserPhone ? (
                    <>
                      <Button label="📞 Call" variant="ghost" onPress={() => void Linking.openURL(`tel:${tournament.organiserPhone!.replace(/[^0-9+]/g, '')}`)} />
                      <Button label="💬 WhatsApp" variant="ghost" onPress={() => openWhatsApp(tournament.organiserPhone)} />
                    </>
                  ) : null}
                  {tournament.organiserEmail ? (
                    <Button label="✉️ Email" variant="ghost" onPress={() => void Linking.openURL(`mailto:${tournament.organiserEmail}`)} />
                  ) : null}
                </View>
              </Card>
            ) : null}

            {hostOrg ? (
              <TouchableOpacity accessibilityRole="button" activeOpacity={0.85} onPress={() => nav.navigate('Organization', { orgId: hostOrg.id })}>
                <Card style={st.hostOrgRow}>
                  <Text style={st.hostOrgIcon}>🏛️</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={textStyles.muted}>Hosted by organization</Text>
                    <Text style={textStyles.body}>{hostOrg.name}</Text>
                    <Text style={textStyles.muted}>
                      {hostOrg.members.length} member{hostOrg.members.length === 1 ? '' : 's'} · admins & organizers manage
                    </Text>
                  </View>
                  <Text style={st.chevron}>›</Text>
                </Card>
              </TouchableOpacity>
            ) : (
              <View style={{ gap: theme.spacing(3) }}>
                <HostsCard
                  hostIds={hostIds}
                  nameOf={(id) => playerName(id)}
                  candidates={[]}
                  canManage={canManageHosts}
                  onChange={saveHosts}
                  renderExtra={(id) => {
                    const p = allPlayers.find((x) => x.id === id);
                    return canManageHosts && p?.invited
                      ? <RemindInstall playerId={id} name={p.fullName} phone={p.phone} message={hostInvite(realName(p.fullName))} />
                      : null;
                  }}
                  subtitle="Everyone who runs this tournament. Any host can manage matches and gets reminders to assign scorers."
                />
                {canManageHosts && (
                  <View style={{ gap: theme.spacing(2) }}>
                    <Text style={textStyles.muted}>Add a host — by mobile number or name:</Text>
                    <PersonPicker
                      role="host"
                      excludeIds={hostIds}
                      onPick={(p) => { setExtraPeople((m) => ({ ...m, [p.id]: p.fullName })); saveHosts([...new Set([...hostIds, p.id])]); }}
                      inviteText={hostInvite}
                    />
                  </View>
                )}
              </View>
            )}

            {classGroups.length > 0 && (
              <Card style={{ gap: theme.spacing(2) }}>
                <SectionHeader
                  title="🎓 Classes during this tournament"
                  count={classGroups.length}
                  onSeeAll={classGroups.length > SECTION_CAP ? () => setShowClasses((v) => !v) : undefined}
                  expanded={showClasses}
                />
                <Text style={textStyles.muted}>{hostOrg?.name} students, by their class as of {tournament.startDate}.</Text>
                {(showClasses ? classGroups : classGroups.slice(0, SECTION_CAP)).map(([std, names]) => (
                  <View key={std} style={st.classGroup}>
                    <Text style={st.classStd}>{std}</Text>
                    <Text style={[textStyles.muted, { flex: 1 }]}>{names.join(', ')}</Text>
                  </View>
                ))}
              </Card>
            )}
          </>
        )}

        {/* ----------------------------- SETTINGS ----------------------------- */}
        {activeTab === 'Settings' && canManageHosts && (
          <>
            {/* Admin hub (parity #08): the setup checklist, then grouped rows. */}
            <SetupChecklist steps={setupSteps} hidden={setupHidden} onHide={hideSetup} onStep={openSetupStep} />

            <SectionHeader title="Tournament" />
            <HubRow icon="✎" title="Edit details" status="Name, dates, sports, registration" onPress={() => nav.navigate('EditTournament', { tournamentId: tournament.id })} />
            {tournament.sports.map((sp) => {
              const fmt = tournament.formats?.[sp] as Record<string, unknown> | undefined;
              const cfg = structureFromFormat(fmt);
              return (
                <HubRow key={sp} icon={getSport(sp).icon} title={`${getSport(sp).name} — format & points`}
                  status={`${cfg ? describeStructure(cfg) : 'Not set yet'} · ${pointsSystemLabel(sp, fmt)}`}
                  onPress={() => nav.navigate('SportSettings', { sport: sp, tournamentId: tournament.id })} />
              );
            })}
            <HubRow icon="🏆" title="Points table" status="Adjust points, view groups" onPress={() => nav.navigate('Standings', { tournamentId: tournament.id })} />

            <SectionHeader title="Teams" />
            <HubRow icon="👥" title="Participating teams" status={participants.length ? `${participants.length} team${participants.length === 1 ? '' : 's'}` : 'None yet — add them'} onPress={() => nav.navigate('TournamentTeams', { tournamentId: tournament.id })} />
            {isMedal && <HubRow icon="🏅" title="Contingents" status="One squad across every sport" onPress={() => nav.navigate('Contingents', { tournamentId: tournament.id })} />}

            <SectionHeader title="Matches" />
            {(() => {
              // Americano sports run their own rotate-partners flow instead of fixtures.
              const amSport = tournament.sports.find((s) => structureFromFormat(tournament.formats?.[s])?.shape === 'americano');
              return amSport
                ? <HubRow icon="🎾" title={`Americano — ${getSport(amSport).name}`} status="Rounds and partners" onPress={() => nav.navigate('Americano', { tournamentId: tournament.id, sport: amSport })} />
                : (
                  <>
                    <HubRow icon="📅" title="Schedule a match" status="One fixture at a time" onPress={() => nav.navigate('ScheduleMatch', { tournamentId: tournament.id })} />
                    <HubRow icon="⚡" title="Auto-generate fixtures" status="League, groups or knockout" onPress={() => nav.navigate('GenerateFixtures', { tournamentId: tournament.id })} />
                    <HubRow icon="📥" title="Import schedule (spreadsheet)" status="Paste from Excel / Sheets or a CSV" onPress={() => nav.navigate('ImportSchedule', { tournamentId: tournament.id })} />
                  </>
                );
            })()}
            <HubRow icon="🔁" title="New series / tie" status="Several matches between two teams" onPress={() => nav.navigate('CreateSeries', { tournamentId: tournament.id, sport: tournament.sports[0] })} />
            {upcomingMatches.length > 0 && (
              <>
                <HubRow icon="📤" title="Share fixtures on WhatsApp" status={`${upcomingMatches.length} upcoming`} onPress={shareFixtures} />
                {Platform.OS === 'web' && <HubRow icon="🖨" title="Print fixtures" status="Or save as PDF" onPress={printFixtures} />}
              </>
            )}

            <SectionHeader title="People" />
            <HubRow icon="🎽" title="Scorers & officials" status={`${assignedIds('scorer').length + assignedIds('referee').length} assigned`} open={panel === 'officials'} onPress={() => setPanel(panel === 'officials' ? '' : 'officials')} />
            {panel === 'officials' && (
            <Card style={{ gap: theme.spacing(3) }}>
              <Text style={textStyles.h3}>🎽 Scorers & officials</Text>
              <Text style={textStyles.muted}>
                {hostOrg ? 'Pick from this organization’s scorers & referees, or add anyone by mobile number or name.' : 'Pick from the tournament’s hosts, or add anyone by mobile number or name.'} Any tournament scorer can take over one of its matches.
              </Text>
              {(['scorer', 'referee'] as OfficialRole[]).map((role) => {
                const assigned = assignedIds(role);
                const eligible = eligibleFor(role).filter((id) => !assigned.includes(id));
                return (
                  <View key={role} style={{ gap: theme.spacing(1) }}>
                    <Text style={st.groupHead}>{role === 'scorer' ? 'Scorers' : 'Referees'}</Text>
                    {assigned.length === 0 && <Text style={textStyles.muted}>None assigned yet.</Text>}
                    {assigned.map((id) => (
                      <View key={id} style={st.entryRow}>
                        <Text style={[textStyles.body, st.flex1]} numberOfLines={1}>{playerName(id) ?? 'Player'}</Text>
                        <Text style={st.link} onPress={() => void removeOfficial(id, role)}>Remove</Text>
                      </View>
                    ))}
                    {eligible.length > 0 && (
                      <View style={st.chips}>
                        {eligible.map((id) => (
                          <SelectChip key={id} label={`+ ${playerName(id) ?? 'Player'}`} active={false} onPress={() => void assignOfficial(id, role)} />
                        ))}
                      </View>
                    )}
                    <PersonPicker
                      role={role}
                      excludeIds={assigned}
                      onPick={async (p) => { setExtraPeople((m) => ({ ...m, [p.id]: p.fullName })); await assignOfficial(p.id, role); }}
                      inviteText={officialInvite(role)}
                    />
                    {role === 'scorer' && (
                      <Button
                        label={`🎯 Assign scorers to fixtures · ${unscoredCount} without a scorer`}
                        variant="ghost"
                        onPress={() => nav.navigate('AssignScorers', { tournamentId: tournament.id })}
                      />
                    )}
                  </View>
                );
              })}
            </Card>
            )}
            <HubRow icon="🤝" title="Hosts" status={`${hostIds.length} host${hostIds.length === 1 ? '' : 's'}`} onPress={() => setTab('Info')} />

            <SectionHeader title="More" />
            <HubRow icon="🔔" title="Player reminders" status={customReminders ? `Custom: ${(reminderMins ?? []).length} reminder${(reminderMins ?? []).length === 1 ? '' : 's'}` : 'Players’ own settings'} open={panel === 'reminders'} onPress={() => setPanel(panel === 'reminders' ? '' : 'reminders')} />
            {panel === 'reminders' && (
            <Card style={{ gap: theme.spacing(2) }}>
              <Text style={textStyles.h3}>🔔 Player reminders</Text>
              <View style={st.tags}>
                <SelectChip label="Each player's own settings" active={!customReminders} onPress={() => saveReminders(undefined)} />
                <SelectChip label="Custom for this tournament" active={customReminders} onPress={() => saveReminders(reminderMins ?? [...DEFAULT_LEAD_MINUTES])} />
              </View>
              {customReminders && (
                <View style={st.tags}>
                  {LEAD_OPTIONS.map((o) => {
                    const on = (reminderMins ?? []).includes(o.minutes);
                    return (
                      <SelectChip
                        key={o.key}
                        label={o.label}
                        active={on}
                        onPress={() => saveReminders(on ? (reminderMins ?? []).filter((x) => x !== o.minutes) : [...(reminderMins ?? []), o.minutes])}
                      />
                    );
                  })}
                </View>
              )}
              <Text style={textStyles.muted}>
                {customReminders
                  ? 'Everyone playing in this tournament is reminded before kickoff on these times.'
                  : 'Each player is reminded using their own settings from Profile.'}
              </Text>
            </Card>
            )}
            <HubRow icon="🔑" title="Ownership & history" status={currentOwnerLabel} open={panel === 'ownership'} onPress={() => setPanel(panel === 'ownership' ? '' : 'ownership')} />
            {panel === 'ownership' && (
            <Card style={{ gap: theme.spacing(2) }}>
              <Text style={textStyles.h3}>🔑 Ownership</Text>
              <Text style={textStyles.muted}>Organized by <Text style={textStyles.body}>{currentOwnerLabel}</Text>{creatorName ? ` · Created by ${creatorName}` : ''}</Text>

              {(transferToIndividual || transferOrgs.length > 0) && (
                showTransfer ? (
                  <View style={{ gap: theme.spacing(2) }}>
                    <Text style={textStyles.muted}>Transfer ownership to:</Text>
                    {transferToIndividual && (
                      <Button label="🙋 Me (individual)" variant="ghost" onPress={() => void transferOwnership(transferToIndividual)} />
                    )}
                    {transferOrgs.map((o) => (
                      <Button key={o.id} label={`🏛️ ${o.name}`} variant="ghost" onPress={() => void transferOwnership({ kind: 'org', orgId: o.id })} />
                    ))}
                    <Text style={st.link} onPress={() => setShowTransfer(false)}>Cancel</Text>
                    <Text style={textStyles.muted}>The creator stays on record; the tournament moves to the new owner and stays accessible if you leave.</Text>
                  </View>
                ) : (
                  <Text style={st.link} onPress={() => setShowTransfer(true)}>Transfer ownership →</Text>
                )
              )}

              {ownershipEvents.length > 0 && (
                <View style={{ gap: theme.spacing(1), marginTop: theme.spacing(1) }}>
                  <Text style={textStyles.muted}>History</Text>
                  {ownershipEvents.map((e) => (
                    <Text key={e.id} style={st.histLine}>
                      {e.action === 'created'
                        ? `Created${e.toName ? ` under ${e.toName}` : ''}${e.byName ? ` by ${e.byName}` : ''}`
                        : `Transferred ${e.fromName ?? ''} → ${e.toName ?? ''}${e.byName ? ` by ${e.byName}` : ''}`}
                      {` · ${e.at.slice(0, 10)}`}
                    </Text>
                  ))}
                </View>
              )}
            </Card>
            )}
          </>
        )}

        {/* ----------------------------- MATCHES ------------------------------ */}
        {activeTab === 'Matches' && (
          <>
            <View style={st.segment}>
              {(['upcoming', 'completed'] as const).map((k) => (
                <TouchableOpacity accessibilityRole="button"
                  key={k}
                  style={[st.segBtn, matchTab === k && st.segBtnActive]}
                  activeOpacity={0.8}
                  onPress={() => setMatchTab(k)}
                >
                  <Text style={[st.segText, matchTab === k && st.segTextActive]}>
                    {k === 'upcoming' ? `Upcoming (${upcomingMatches.length})` : `Completed (${completedMatches.length})`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {!singleSport && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chips}>
                <SelectChip label="All sports" active={matchSport === 'all'} onPress={() => setMatchSport('all')} />
                {sports.map((s) => (
                  <SelectChip key={s} label={`${getSport(s).icon} ${getSport(s).name}`} active={matchSport === s} onPress={() => setMatchSport(s)} />
                ))}
              </ScrollView>
            )}
            {(matchTab === 'upcoming' ? upcomingMatches : completedMatches).length === 0 ? (
              <EmptyState icon={matchTab === 'upcoming' ? '📅' : '🏁'} title={matchTab === 'upcoming' ? 'No upcoming matches' : 'No completed matches yet'} compact />
            ) : (
              (() => {
                const list = matchTab === 'upcoming' ? upcomingMatches : completedMatches;
                return (showMatches ? list : list.slice(0, SECTION_CAP)).map((m) => (
                  <MatchCard key={m.id} match={m} onPress={() => openMatch(m)} />
                ));
              })()
            )}
            {(matchTab === 'upcoming' ? upcomingMatches : completedMatches).length > SECTION_CAP && (
              <Button label={showMatches ? 'Show less' : 'Show all'} variant="ghost" onPress={() => setShowMatches((v) => !v)} />
            )}
          </>
        )}

        {/* ------------------------------ STATS ------------------------------- */}
        {activeTab === 'Stats' && (
          <>
            <Button
              label="📊 Standings & leaders"
              variant="ghost"
              onPress={() => nav.navigate('Standings', { tournamentId: tournament.id, ...(singleSport ? { sport: sports[0] } : {}) })}
            />
            {tournament.structure !== 'league' && (
              <Button
                label="🏆 Knockout bracket"
                variant="ghost"
                onPress={() => nav.navigate('Bracket', { tournamentId: tournament.id, ...(singleSport ? { sport: sports[0] } : {}) })}
              />
            )}

            {/* Medal meet — overall ranked by position points across every sport. */}
            {!singleSport && isMedal && (
              <>
                <SectionHeader title="🏅 Medal table" count={medal.length} />
                <Text style={textStyles.muted}>Position points from every sport, added up.</Text>
                <MedalTable rows={medal} emptyLabel="No sport has a final table yet." />
              </>
            )}

            {/* Overall (cross-sport) house table — match-points sum, when not a medal meet. */}
            {!singleSport && !isMedal && overall.length > 0 && (
              <>
                <SectionHeader
                  title="🏆 Overall standings"
                  count={overall.length}
                  onSeeAll={overall.length > SECTION_CAP ? () => setShowOverall((v) => !v) : undefined}
                  expanded={showOverall}
                />
                <Text style={textStyles.muted}>Points across every sport.</Text>
                <Card style={{ gap: theme.spacing(1) }}>
                  {(showOverall ? overall : overall.slice(0, SECTION_CAP)).map((o, i) => {
                    const tier = podiumColor(i);
                    return (
                      <TouchableOpacity accessibilityRole="button" key={o.teamId} activeOpacity={0.8} onPress={() => nav.navigate('Team', { teamId: o.teamId })}>
                        <View style={[st.oRow, tier ? { backgroundColor: tier + '14', borderRadius: theme.radius.sm } : i > 3 && st.divider]}>
                          <RankBadge index={i} width={22} />
                          <View style={[st.dot, { backgroundColor: o.colorHex ?? theme.colors.surfaceAlt }]} />
                          <Text style={[textStyles.body, { flex: 1 }, i === 0 && { fontWeight: '700' }]} numberOfLines={1}>{o.name}</Text>
                          <Text style={textStyles.muted}>{o.played} pld</Text>
                          <Text style={st.oPts}>{o.points}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </Card>
              </>
            )}

            {/* Per-sport standings + statistics */}
            <Text style={[textStyles.h3, st.section]}>{singleSport ? '🏆 Standings' : '📊 By sport'}</Text>
            {!singleSport && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chips}>
                {sports.map((s) => (
                  <SelectChip key={s} label={`${getSport(s).icon} ${getSport(s).name}`} active={activeSport === s} onPress={() => setSport(s)} />
                ))}
              </ScrollView>
            )}
            {/* One table per league phase (parity #07) — groups, Super phase, Swiss;
                knockouts are never in a table (the bracket shows them). */}
            {activeSport && phases.length > 0 ? (
              phases.map((ph) => (
                <View key={ph.key} style={{ gap: theme.spacing(1) }}>
                  {phases.length > 1 || ph.key !== 'league' ? <Text style={st.groupHead}>{ph.key === 'super' ? '🔁 ' : ''}{ph.title}</Text> : null}
                  <LeagueTable sport={activeSport} cfg={stCfg} teams={ph.rows} onTeam={(teamId) => nav.navigate('Team', { teamId })} emptyLabel="No results yet." />
                </View>
              ))
            ) : activeSport ? (
              <LeagueTable
                teams={[]}
                onTeam={(teamId) => nav.navigate('Team', { teamId })}
                emptyLabel={`No completed ${getSport(activeSport).name.toLowerCase()} matches yet.`}
              />
            ) : null}

            {activeSport && categories.length > 0 && (
              <>
                <Text style={[textStyles.h3, st.section]}>📈 {getSport(activeSport).name} leaders</Text>
                <Text style={textStyles.muted}>Swipe for more →</Text>
                <StatLeaderRail categories={categories} onPlayer={(id) => nav.navigate('PlayerProfile', { playerId: id })} />
              </>
            )}
          </>
        )}

        {/* ------------------------------ TEAMS ------------------------------- */}
        {activeTab === 'Teams' && (
          <>
            <SectionHeader
              title="Teams"
              count={tourneyTeams.length}
              onSeeAll={tourneyTeams.length > SECTION_CAP ? () => setShowTeams((v) => !v) : undefined}
              expanded={showTeams}
            />
            {tourneyTeams.length === 0 ? (
              <EmptyState icon="🛡️" title="No teams yet" hint={canManageHosts ? 'Add participating teams from the Manage tab.' : undefined} compact />
            ) : (
              (showTeams ? tourneyTeams : tourneyTeams.slice(0, SECTION_CAP)).map((t) => (
                <TouchableOpacity accessibilityRole="button" key={t.id} activeOpacity={0.85} onPress={() => nav.navigate('Team', { teamId: t.id })}>
                  <Card style={st.teamRow}>
                    <View style={[st.dot, { backgroundColor: t.colorHex ?? theme.colors.surfaceAlt }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={textStyles.body}>{t.name}</Text>
                      <Text style={textStyles.muted}>{t.sports.map((s) => getSport(s).icon).join(' ')}</Text>
                    </View>
                    <Text style={st.chevron}>›</Text>
                  </Card>
                </TouchableOpacity>
              ))
            )}
          </>
        )}
      </ScrollView>
      )}
    </SafeAreaView>
  );
}

/** One admin-hub row: icon, title, a one-line status, › (or ▾ when it opens inline). */
function HubRow({ icon, title, status, onPress, open }: { icon: string; title: string; status?: string; onPress: () => void; open?: boolean }) {
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={title} activeOpacity={0.85} onPress={onPress}>
      <Card style={st.hubRow}>
        <Text style={st.hubIcon}>{icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={textStyles.body} numberOfLines={1}>{title}</Text>
          {status ? <Text style={textStyles.muted} numberOfLines={1}>{status}</Text> : null}
        </View>
        <Text style={st.chevron}>{open === undefined ? '›' : open ? '▴' : '▾'}</Text>
      </Card>
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  followRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  hubRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  hubIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  header: { paddingHorizontal: theme.spacing(4), paddingTop: theme.spacing(3), gap: theme.spacing(2), borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  tabBar: { gap: theme.spacing(2), paddingVertical: theme.spacing(1) },
  tabBtn: { paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(3), borderRadius: theme.radius.pill },
  tabBtnActive: { backgroundColor: theme.colors.primary },
  tabText: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  tabTextActive: { color: '#06120D', fontWeight: '800' },
  flex1: { flex: 1 },
  entryRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  entryNote: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '600' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing(3) },
  segment: { flexDirection: 'row', backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill, padding: 3 },
  segBtn: { flex: 1, paddingVertical: theme.spacing(2), borderRadius: theme.radius.pill, alignItems: 'center' },
  segBtnActive: { backgroundColor: theme.colors.primary },
  segText: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  segTextActive: { color: '#06120D', fontWeight: '800' },
  hostOrgRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  hostOrgIcon: { fontSize: 24 },
  tags: { flexDirection: 'row', gap: theme.spacing(2), flexWrap: 'wrap' },
  chips: { gap: theme.spacing(2), paddingVertical: theme.spacing(1) },
  link: { color: theme.colors.primary, fontWeight: '700' },
  histLine: { color: theme.colors.textMuted, fontSize: theme.font.small },
  section: { marginTop: theme.spacing(2) },
  groupHead: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: theme.spacing(2) },
  oRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3), paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(1) },
  divider: { borderTopWidth: 1, borderTopColor: theme.colors.border },
  dot: { width: 14, height: 14, borderRadius: 7 },
  oPts: { color: theme.colors.primary, fontSize: theme.font.h3, fontWeight: '900', minWidth: 30, textAlign: 'right' },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  chevron: { color: theme.colors.textMuted, fontSize: theme.font.h2, fontWeight: '700' },
  classGroup: { flexDirection: 'row', gap: theme.spacing(3), alignItems: 'flex-start' },
  classStd: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '800', minWidth: 72 },
});
