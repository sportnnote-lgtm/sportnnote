/** Team (house) profile: record per sport, squad, matches — and a follow toggle. */
import React, { useEffect, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { EmptyState, Card, Pill, Button, LoadingState, ScreenTitle, textStyles } from '../components/ui';
import { MatchCard } from '../components/MatchCard';
import { SectionHeader, SECTION_CAP } from '../components/SectionHeader';
import { getSport } from '../sports/registry';
import { useAuth } from '../core/auth';
import { canScoreByRole } from '../core/roles';
import { useTeamSummary, useMatches, usePlayers, useFollow } from '../data/hooks';
import { teamStandings } from '../data/standings';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function TeamProfileScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'Team'>>();
  const { teamId } = params;
  const { profile } = useAuth();
  const { team, loading } = useTeamSummary(teamId);
  const { matches } = useMatches();
  const players = usePlayers();
  const { isFollowing, toggle } = useFollow(profile?.id);
  const [showSquad, setShowSquad] = useState(false);
  const [showMatches, setShowMatches] = useState(false);

  // Title the nav bar after the team, not a generic "Team" (breadcrumb).
  useEffect(() => {
    if (team) nav.setOptions({ title: team.name });
  }, [nav, team?.name]);

  if (loading) {
    return (
      <SafeAreaView style={st.safe} edges={['bottom']}>
        <LoadingState label="Loading team…" />
      </SafeAreaView>
    );
  }

  // Resolved, but there's no such team — say so instead of spinning forever.
  if (!team) {
    return (
      <SafeAreaView style={st.safe} edges={['bottom']}>
        <View style={{ padding: theme.spacing(4), gap: theme.spacing(3) }}>
          <Text style={textStyles.h3}>Team not found</Text>
          <Text style={textStyles.muted}>This team may have been removed, or the link is out of date.</Text>
          <Button label="← Go back" variant="ghost" onPress={() => nav.goBack()} />
        </View>
      </SafeAreaView>
    );
  }

  const following = isFollowing('team', team.id);
  const squad = players.filter((p) => p.houseName === team.name);
  const teamMatches = matches.filter((m) => m.homeTeam.id === team.id || m.awayTeam.id === team.id);
  const records = team.sports
    .map((sp) => ({ sport: sp, row: teamStandings(matches, sp).find((t) => t.teamId === team.id) }))
    .filter((r) => r.row);
  // Aggregate record across every sport, for the at-a-glance headline (mirrors
  // the player profile's Matches / Wins / Win-rate tiles).
  const totalPlayed = records.reduce((n, r) => n + r.row!.played, 0);
  const totalWon = records.reduce((n, r) => n + r.row!.won, 0);
  const teamWinRate = totalPlayed ? Math.round((totalWon / totalPlayed) * 100) : 0;

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content}>
        <View style={st.headerRow}>
          <View style={[st.crest, { backgroundColor: (team.colorHex ?? theme.colors.surfaceAlt) + '33', borderColor: team.colorHex ?? theme.colors.border }]}>
            <Text style={[st.crestText, { color: team.colorHex ?? theme.colors.text }]}>
              {team.name.split(' ').map((w) => w[0]).join('').slice(0, 3).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={textStyles.h2}>{team.name}</Text>
            <View style={st.tags}>
              {team.sports.map((s) => (
                <Pill key={s} label={`${getSport(s).icon} ${getSport(s).name}`} />
              ))}
            </View>
          </View>
        </View>

        <Button
          label={following ? '✓ Following' : '+ Follow team'}
          variant={following ? 'ghost' : 'primary'}
          onPress={() => toggle('team', team.id)}
        />
        <Button label="👥 Squad · ＋ Add players" variant="ghost" onPress={() => nav.navigate('Squad', { teamId: team.id })} />

        {totalPlayed > 0 && (
          <View style={st.statGrid}>
            <Stat value={String(totalPlayed)} label="Played" />
            <Stat value={String(totalWon)} label="Won" />
            <Stat value={`${teamWinRate}%`} label="Win rate" />
          </View>
        )}

        {records.length > 0 && (
          <>
            <Text style={[textStyles.h3, st.section]}>Record by sport</Text>
            {records.map(({ sport, row }) => (
              <Card key={sport} style={st.recordRow}>
                <Text style={st.recordIcon}>{getSport(sport).icon}</Text>
                <Text style={[textStyles.body, { flex: 1 }]}>{getSport(sport).name}</Text>
                <Text style={textStyles.muted}>{row!.won}W {row!.lost}L {row!.drawn}D</Text>
                <Text style={st.recordPts}>{row!.points} pts</Text>
              </Card>
            ))}
          </>
        )}

        <SectionHeader
          title={`Squad (${squad.length})`}
          count={squad.length}
          onSeeAll={squad.length > SECTION_CAP ? () => setShowSquad((v) => !v) : undefined}
          expanded={showSquad}
        />
        {squad.length === 0 ? (
          <EmptyState icon="👥" title="No players listed for this team" compact />
        ) : (
          (showSquad ? squad : squad.slice(0, SECTION_CAP)).map((p) => (
            <TouchableOpacity accessibilityRole="button" key={p.id} activeOpacity={0.85} onPress={() => nav.navigate('PlayerProfile', { playerId: p.id })}>
              <Card style={st.playerRow}>
                <View style={[st.avatar, { backgroundColor: (team.colorHex ?? theme.colors.surfaceAlt) + '33' }]}>
                  <Text style={[st.avatarText, { color: team.colorHex ?? theme.colors.primary }]}>
                    {p.fullName.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={textStyles.body}>{p.fullName}{p.jerseyNo ? ` · #${p.jerseyNo}` : ''}</Text>
                  <Text style={textStyles.muted}>{p.sports.map((s) => getSport(s).icon).join(' ')}</Text>
                </View>
              </Card>
            </TouchableOpacity>
          ))
        )}

        {teamMatches.length > 0 && (
          <>
            <SectionHeader
              title="Matches"
              count={teamMatches.length}
              onSeeAll={teamMatches.length > SECTION_CAP ? () => setShowMatches((v) => !v) : undefined}
              expanded={showMatches}
            />
            {(showMatches ? teamMatches : teamMatches.slice(0, SECTION_CAP)).map((m) => (
              <MatchCard
                key={m.id}
                match={m}
                onPress={() =>
                  nav.navigate('LiveScoring', {
                    matchId: m.id, sport: m.sport,
                    homeName: m.homeTeam.shortName, awayName: m.awayTeam.shortName,
                    homeTeamName: m.homeTeam.name, awayTeamName: m.awayTeam.name,
                    homeColor: m.homeTeam.colorHex, awayColor: m.awayTeam.colorHex,
                    canScore: canScoreByRole(profile?.role),
                  })
                }
              />
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** One headline record tile (Played / Won / Win rate) — same treatment as the
 *  player profile, so a team's record reads at a glance and the two pages match. */
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <Card style={st.statCard}>
      <Text style={st.statValue}>{value}</Text>
      <Text style={textStyles.muted}>{label}</Text>
    </Card>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  headerRow: { flexDirection: 'row', gap: theme.spacing(3), alignItems: 'center' },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(3) },
  statCard: { width: '30%', alignItems: 'center', gap: theme.spacing(1), flexGrow: 1 },
  statValue: { color: theme.colors.primary, fontSize: theme.font.h1, fontWeight: '900' },
  crest: { width: 64, height: 64, borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center', ...theme.shadow.card },
  crestText: { fontSize: 20, fontWeight: '800', letterSpacing: 0.5 },
  tags: { flexDirection: 'row', gap: theme.spacing(2), flexWrap: 'wrap', marginTop: theme.spacing(2) },
  section: { marginTop: theme.spacing(2) },
  recordRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  recordIcon: { fontSize: 22 },
  recordPts: { color: theme.colors.primary, fontSize: theme.font.h3, fontWeight: '900' },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '800' },
});
