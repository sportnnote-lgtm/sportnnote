/** Tournament hub: overview, follow, the overall house table, a per-sport
 *  league table + statistics rail, and participating teams. For a single-sport
 *  tournament the sport selector is skipped and its table shown directly. */
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Card, Pill, Button, SelectChip, ScreenTitle, textStyles } from '../components/ui';
import { LeagueTable } from '../components/LeagueTable';
import { StatLeaderRail } from '../components/StatLeaderRail';
import { HostsCard } from '../components/HostsCard';
import { LogoPicker } from '../components/LogoPicker';
import { MatchCard } from '../components/MatchCard';
import { SectionHeader, SECTION_CAP } from '../components/SectionHeader';
import { getSport } from '../sports/registry';
import { tournamentStatus, matchProgress } from '../core/tournament';
import { useAuth } from '../core/auth';
import { useTournamentById, useTeamSummaries, useFollow, useLeagueData, usePlayers, useOrganizations } from '../data/hooks';
import { getMyPlayerId, setTournamentHosts, setTournamentLogo, setTournamentReminderLeads } from '../data/repos';
import { LEAD_OPTIONS, DEFAULT_LEAD_MINUTES } from '../data/reminderPrefs';
import { canManageTournament, tournamentHostPlayerIds, isAcademicCommunity, standardAt, membersOnDate } from '../core/org';
import { notify } from '../core/notifications';
import { overallStandings, teamStandings, categoryLeaders } from '../data/standings';
import type { SportId } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function TournamentProfileScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'Tournament'>>();
  const { profile } = useAuth();
  const tournament = useTournamentById(params.tournamentId);
  const teams = useTeamSummaries();
  const { isFollowing, toggle } = useFollow(profile?.id);
  const { matches, lines, players } = useLeagueData(params.tournamentId);
  const allPlayers = usePlayers();
  const orgs = useOrganizations();

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
  const playerName = (id: string) => allPlayers.find((p) => p.id === id)?.fullName;
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
  // Open tournaments: a non-host can request to register, notifying the hosts.
  const [requested, setRequested] = useState(false);
  const requestToJoin = () => {
    if (!tournament) return;
    const myName = (myId && playerName(myId)) || 'A player';
    for (const hid of tournamentHostPlayerIds(tournament, orgs)) {
      void notify({
        title: `📝 Registration request — ${tournament.name}`,
        body: `${myName} wants to register a team. Tap to view & follow up.`,
        playerId: myId ?? undefined,
      });
    }
    setRequested(true);
  };

  const sports = tournament?.sports ?? [];
  const [sport, setSport] = useState<SportId | null>(null);
  const activeSport = sport ?? sports[0];

  // This tournament's matches, split into upcoming & completed for history,
  // optionally filtered to one of the tournament's sports.
  const [matchTab, setMatchTab] = useState<'upcoming' | 'completed'>('upcoming');
  const [matchSport, setMatchSport] = useState<SportId | 'all'>('all');
  // "Top 5 + See all" expand toggles for the variable-length record-list sections.
  const [showMatches, setShowMatches] = useState(false);
  const [showClasses, setShowClasses] = useState(false);
  const [showOverall, setShowOverall] = useState(false);
  const [showTeams, setShowTeams] = useState(false);
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

  const openMatch = (m: (typeof matches)[number]) =>
    nav.navigate('LiveScoring', {
      matchId: m.id, sport: m.sport,
      homeName: m.homeTeam.shortName, awayName: m.awayTeam.shortName,
      homeTeamName: m.homeTeam.name, awayTeamName: m.awayTeam.name,
      homeColor: m.homeTeam.colorHex, awayColor: m.awayTeam.colorHex,
      canScore: false,
    });

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

  const overall = useMemo(() => overallStandings(matches, sports), [matches, sports]);
  const table = useMemo(() => (activeSport ? teamStandings(matches, activeSport) : []), [matches, activeSport]);
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
  const following = isFollowing('tournament', tournament.id);
  const singleSport = sports.length === 1;
  // Teams in this tournament (house ids appear in its matches).
  const teamIds = new Set(matches.flatMap((m) => [m.homeTeam.id, m.awayTeam.id]));
  const tourneyTeams = teams.filter((t) => teamIds.has(t.id));

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content}>
        <View style={st.titleRow}>
          <LogoPicker
            logoUrl={tournament.logoUrl}
            canManage={canManageHosts}
            onPick={(uri) => setTournamentLogo(tournament.id, uri)}
            size={56}
          />
          <View style={{ flex: 1 }}>
            <ScreenTitle title={tournament.name} subtitle={`${tournament.hostName} · ${tournament.startDate} → ${tournament.endDate}`} />
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

        {tournament.isOpen && !canManageHosts && (
          <Button
            label={requested ? '✓ Registration request sent' : '📝 Request to join'}
            variant={requested ? 'ghost' : 'primary'}
            onPress={requestToJoin}
          />
        )}

        <View style={st.tags}>
          {sports.map((s) => (
            <TouchableOpacity key={s} activeOpacity={0.8} onPress={() => nav.navigate('SportHub', { tournamentId: tournament.id, sport: s, tournamentName: tournament.name })}>
              <Pill label={`${getSport(s).icon} ${getSport(s).name} ›`} />
            </TouchableOpacity>
          ))}
        </View>

        <Button
          label={following ? '✓ Following' : '+ Follow tournament'}
          variant={following ? 'ghost' : 'primary'}
          onPress={() => toggle('tournament', tournament.id)}
        />
        <Button
          label="📊 Standings & leaders"
          variant="ghost"
          onPress={() => nav.navigate('Standings', { tournamentId: tournament.id, ...(singleSport ? { sport: sports[0] } : {}) })}
        />
        {tournament.structure !== 'league' && (
          <Button
            label="🏆 Knockout bracket"
            variant="ghost"
            onPress={() => nav.navigate('Bracket', singleSport ? { sport: sports[0] } : {})}
          />
        )}
        {tournament.structure && (
          <Text style={textStyles.muted}>
            Format: {tournament.structure.replace('_', ' + ')}
            {sports.map((s) => {
              const f = tournament.formats?.[s];
              return f ? ` · ${getSport(s).name} ${Object.values(f).join('/')}` : '';
            }).join('')}
          </Text>
        )}

        {hostOrg ? (
          <TouchableOpacity activeOpacity={0.85} onPress={() => nav.navigate('Organization', { orgId: hostOrg.id })}>
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
          <HostsCard
            hostIds={hostIds}
            nameOf={(id) => playerName(id)}
            candidates={allPlayers.map((p) => ({ id: p.id, name: p.fullName }))}
            canManage={canManageHosts}
            onChange={saveHosts}
            subtitle="Everyone who runs this tournament. Any host can manage matches and gets reminders to assign scorers."
          />
        )}

        {canManageHosts && (
          <View style={{ gap: theme.spacing(2) }}>
            <Button label="📅 Schedule a match" variant="ghost" onPress={() => nav.navigate('ScheduleMatch', { tournamentId: tournament.id })} />
            <Button label="⚡ Auto-generate fixtures" variant="ghost" onPress={() => nav.navigate('GenerateFixtures', { tournamentId: tournament.id })} />
          </View>
        )}

        {canManageHosts && (
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

        {/* This tournament's matches — upcoming & completed, for tracking history. */}
        <SectionHeader
          title="📅 Matches"
          count={(matchTab === 'upcoming' ? upcomingMatches : completedMatches).length}
          onSeeAll={(matchTab === 'upcoming' ? upcomingMatches : completedMatches).length > SECTION_CAP ? () => setShowMatches((v) => !v) : undefined}
          expanded={showMatches}
        />
        <View style={st.segment}>
          {(['upcoming', 'completed'] as const).map((k) => (
            <TouchableOpacity
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
          <Text style={textStyles.muted}>{matchTab === 'upcoming' ? 'No upcoming matches.' : 'No completed matches yet.'}</Text>
        ) : (
          (() => {
            const list = matchTab === 'upcoming' ? upcomingMatches : completedMatches;
            return (showMatches ? list : list.slice(0, SECTION_CAP)).map((m) => (
              <MatchCard key={m.id} match={m} onPress={() => openMatch(m)} />
            ));
          })()
        )}

        {/* Overall (cross-sport) house table — only when there's >1 sport. */}
        {!singleSport && overall.length > 0 && (
          <>
            <SectionHeader
              title="🏆 Overall standings"
              count={overall.length}
              onSeeAll={overall.length > SECTION_CAP ? () => setShowOverall((v) => !v) : undefined}
              expanded={showOverall}
            />
            <Text style={textStyles.muted}>Points across every sport.</Text>
            <Card style={{ gap: theme.spacing(1) }}>
              {(showOverall ? overall : overall.slice(0, SECTION_CAP)).map((o, i) => (
                <TouchableOpacity key={o.teamId} activeOpacity={0.8} onPress={() => nav.navigate('Team', { teamId: o.teamId })}>
                  <View style={[st.oRow, i > 0 && st.divider]}>
                    <Text style={st.rank}>{i + 1}</Text>
                    <View style={[st.dot, { backgroundColor: o.colorHex ?? theme.colors.surfaceAlt }]} />
                    <Text style={[textStyles.body, { flex: 1 }]} numberOfLines={1}>{o.name}</Text>
                    <Text style={textStyles.muted}>{o.played} pld</Text>
                    <Text style={st.oPts}>{o.points}</Text>
                  </View>
                </TouchableOpacity>
              ))}
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
        {activeSport && (
          <LeagueTable
            teams={table}
            onTeam={(teamId) => nav.navigate('Team', { teamId })}
            emptyLabel={`No completed ${getSport(activeSport).name.toLowerCase()} matches yet.`}
          />
        )}

        {activeSport && categories.length > 0 && (
          <>
            <Text style={[textStyles.h3, st.section]}>📈 {getSport(activeSport).name} leaders</Text>
            <Text style={textStyles.muted}>Swipe for more →</Text>
            <StatLeaderRail categories={categories} onPlayer={(id) => nav.navigate('PlayerProfile', { playerId: id })} />
          </>
        )}

        <SectionHeader
          title="Teams"
          count={tourneyTeams.length}
          onSeeAll={tourneyTeams.length > SECTION_CAP ? () => setShowTeams((v) => !v) : undefined}
          expanded={showTeams}
        />
        {(showTeams ? tourneyTeams : tourneyTeams.slice(0, SECTION_CAP)).map((t) => (
          <TouchableOpacity key={t.id} activeOpacity={0.85} onPress={() => nav.navigate('Team', { teamId: t.id })}>
            <Card style={st.teamRow}>
              <View style={[st.dot, { backgroundColor: t.colorHex ?? theme.colors.surfaceAlt }]} />
              <View style={{ flex: 1 }}>
                <Text style={textStyles.body}>{t.name}</Text>
                <Text style={textStyles.muted}>{t.sports.map((s) => getSport(s).icon).join(' ')}</Text>
              </View>
              <Text style={st.chevron}>›</Text>
            </Card>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
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
  section: { marginTop: theme.spacing(2) },
  oRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3), paddingVertical: theme.spacing(2) },
  divider: { borderTopWidth: 1, borderTopColor: theme.colors.border },
  rank: { color: theme.colors.textMuted, fontSize: theme.font.body, fontWeight: '800', width: 18, textAlign: 'center' },
  dot: { width: 14, height: 14, borderRadius: 7 },
  oPts: { color: theme.colors.primary, fontSize: theme.font.h3, fontWeight: '900', minWidth: 30, textAlign: 'right' },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  chevron: { color: theme.colors.textMuted, fontSize: theme.font.h2, fontWeight: '700' },
  classGroup: { flexDirection: 'row', gap: theme.spacing(3), alignItems: 'flex-start' },
  classStd: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '800', minWidth: 72 },
});
