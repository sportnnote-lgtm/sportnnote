/** A single sport within a tournament: its schedule, a shortcut to organize a
 *  game, the league table, and the statistics rail. Reached from the Home sport
 *  chips and from a tournament's sport list. */
import React, { useMemo } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Button, ScreenTitle, EmptyState, textStyles } from '../components/ui';
import { MatchCard } from '../components/MatchCard';
import { SectionHeader, SECTION_CAP } from '../components/SectionHeader';
import { LeagueTable } from '../components/LeagueTable';
import { StatLeaderRail } from '../components/StatLeaderRail';
import { getSport } from '../sports/registry';
import { useLeagueData } from '../data/hooks';
import { useAuth } from '../core/auth';
import { canScoreByRole, canOrganize } from '../core/roles';
import { teamStandings, categoryLeaders } from '../data/standings';
import type { Match } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function SportHubScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'SportHub'>>();
  const { tournamentId, sport, tournamentName } = params;
  const { profile } = useAuth();
  const plugin = getSport(sport);
  const { matches, lines, players } = useLeagueData(tournamentId);

  const sportMatches = useMemo(() => matches.filter((m) => m.sport === sport), [matches, sport]);
  const live = sportMatches.filter((m) => m.status === 'live');
  const upcoming = sportMatches.filter((m) => m.status === 'scheduled');
  const results = sportMatches.filter((m) => m.status === 'completed');
  const table = useMemo(() => teamStandings(matches, sport), [matches, sport]);
  const categories = useMemo(() => categoryLeaders(lines, players, sport), [lines, players, sport]);

  const canScore = canScoreByRole(profile?.role);
  // "See all" opens the full Matches browser filtered to this sport + section.
  const seeAll = (initialTab: 'live' | 'upcoming' | 'completed') =>
    nav.navigate('Tabs', { screen: 'Matches', params: { initialTab, initialSport: sport } });
  const openScorer = (m: Match) =>
    nav.navigate('LiveScoring', {
      matchId: m.id, sport: m.sport,
      homeName: m.homeTeam.shortName, awayName: m.awayTeam.shortName,
      homeTeamName: m.homeTeam.name, awayTeamName: m.awayTeam.name,
      homeColor: m.homeTeam.colorHex, awayColor: m.awayTeam.colorHex,
      canScore,
    });

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content}>
        <ScreenTitle title={`${plugin.icon} ${plugin.name}`} subtitle={tournamentName} />

        {canOrganize(profile?.role) && (
          <Button label="＋ Organize a game" variant="ghost" onPress={() => nav.navigate('ScheduleMatch', { tournamentId })} />
        )}

        {live.length > 0 && (
          <>
            <SectionHeader title="🔴 Live now" count={live.length} onSeeAll={live.length > SECTION_CAP ? () => seeAll('live') : undefined} />
            {live.slice(0, SECTION_CAP).map((m) => <MatchCard key={m.id} match={m} onPress={() => openScorer(m)} />)}
          </>
        )}

        <SectionHeader title="📅 Schedule" count={upcoming.length} onSeeAll={upcoming.length > SECTION_CAP ? () => seeAll('upcoming') : undefined} />
        {upcoming.length === 0 ? (
          <EmptyState icon="📅" title={`No upcoming ${plugin.name.toLowerCase()} matches`} compact />
        ) : (
          upcoming.slice(0, SECTION_CAP).map((m) => <MatchCard key={m.id} match={m} onPress={() => openScorer(m)} />)
        )}

        <View style={st.section}>
          <SectionHeader
            title="🏆 Standings"
            count={table.length}
            onSeeAll={table.length > 0 ? () => nav.navigate('Standings', { sport, tournamentId }) : undefined}
          />
        </View>
        <LeagueTable
          teams={table}
          onTeam={(teamId) => nav.navigate('Team', { teamId })}
          emptyLabel={`No completed ${plugin.name.toLowerCase()} matches yet.`}
        />

        <Text style={[textStyles.h3, st.section]}>📊 Statistics</Text>
        <Text style={textStyles.muted}>Swipe for more leaderboards →</Text>
        <StatLeaderRail categories={categories} onPlayer={(id) => nav.navigate('PlayerProfile', { playerId: id })} />

        {results.length > 0 && (
          <>
            <SectionHeader title="✅ Results" count={results.length} onSeeAll={results.length > SECTION_CAP ? () => seeAll('completed') : undefined} />
            {results.slice(0, SECTION_CAP).map((m) => (
              <TouchableOpacity accessibilityRole="button" key={m.id} activeOpacity={0.85} onPress={() => openScorer(m)}>
                <View style={st.resultRow}>
                  <View style={[st.dot, { backgroundColor: m.homeTeam.colorHex }]} />
                  <Text style={[textStyles.body, st.rTeam]} numberOfLines={1}>{m.homeTeam.name}</Text>
                  <Text style={st.score}>{m.score ? `${m.score.home} – ${m.score.away}` : 'vs'}</Text>
                  <Text style={[textStyles.body, st.rTeamRight]} numberOfLines={1}>{m.awayTeam.name}</Text>
                  <View style={[st.dot, { backgroundColor: m.awayTeam.colorHex }]} />
                </View>
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  section: { marginTop: theme.spacing(2) },
  resultRow: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2),
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3),
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rTeam: { flex: 1 },
  rTeamRight: { flex: 1, textAlign: 'right' },
  score: { color: theme.colors.text, fontWeight: '900', fontSize: theme.font.body, paddingHorizontal: theme.spacing(2) },
});
