/** Per-sport standings: a league table (P/W/L/Pts) plus the individual stat
 *  leaders. A sport selector appears for multi-sport meets; a single-sport
 *  tournament just shows that sport. */
import React, { useEffect, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Card, SelectChip, ScreenTitle, EmptyState, textStyles } from '../components/ui';
import { RankBadge, podiumColor } from '../components/Rank';
import { SectionHeader, SECTION_CAP } from '../components/SectionHeader';
import { getSport } from '../sports/registry';
import { useTournament, useTournamentById, useStandings } from '../data/hooks';
import { leaderStat } from '../data/standings';
import type { SportId } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function StandingsScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'Standings'>>();
  // Opened from a specific tournament? Scope to it; otherwise use the one
  // currently selected on Home.
  const selected = useTournament();
  const opened = useTournamentById(params?.tournamentId);
  const tournament = params?.tournamentId ? opened : selected;
  const sports = tournament?.sports ?? [];
  const [sport, setSport] = useState<SportId>(params?.sport ?? 'football');
  // Clamp the shown sport to one this tournament actually has (a generic open
  // defaults to football, which the meet may not include).
  const activeSport = sports.includes(sport) ? sport : sports[0] ?? sport;
  const { teams, leaders } = useStandings(activeSport, params?.tournamentId);
  const lead = leaderStat(activeSport);
  const [showTeams, setShowTeams] = useState(false);
  const [showLeaders, setShowLeaders] = useState(false);
  // Draws only matter for sports that can draw (football, cricket) — hide the
  // column for basketball/tennis/etc. where every result has a winner.
  const hasDraws = teams.some((t) => t.drawn > 0);

  // Breadcrumb: name the nav bar after the tournament; the in-content title is "Standings".
  useEffect(() => {
    if (tournament) nav.setOptions({ title: tournament.name });
  }, [nav, tournament?.name]);

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content}>
        <ScreenTitle title="Standings" />

        {sports.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chips}>
            {sports.map((s) => (
              <SelectChip key={s} label={`${getSport(s).icon} ${getSport(s).name}`} active={activeSport === s} onPress={() => setSport(s)} />
            ))}
          </ScrollView>
        )}

        <SectionHeader
          title={`${getSport(activeSport).icon} Team standings`}
          count={teams.length}
          onSeeAll={teams.length > SECTION_CAP ? () => setShowTeams((v) => !v) : undefined}
          expanded={showTeams}
        />
        <Card style={{ gap: theme.spacing(1) }}>
          <View style={[st.row, st.head]}>
            <View style={st.posCell}><Text style={st.headText}>#</Text></View>
            <Text style={[st.teamCol, st.headText]}>Team</Text>
            <Text style={[st.num, st.headText]}>P</Text>
            <Text style={[st.num, st.headText]}>W</Text>
            {hasDraws && <Text style={[st.num, st.headText]}>D</Text>}
            <Text style={[st.num, st.headText]}>L</Text>
            <Text style={[st.num, st.headText]}>Pts</Text>
          </View>
          {teams.length === 0 ? (
            <EmptyState icon="🏁" title={`No completed ${getSport(activeSport).name.toLowerCase()} matches yet`} hint="The table fills in as results come in." compact />
          ) : (
            (showTeams ? teams : teams.slice(0, SECTION_CAP)).map((t, i) => {
              const tier = podiumColor(i);
              return (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`${i + 1}. ${t.name}, ${t.points} points, played ${t.played}, won ${t.won}${hasDraws ? `, drawn ${t.drawn}` : ''}, lost ${t.lost}`}
                  key={t.teamId}
                  activeOpacity={0.8}
                  onPress={() => nav.navigate('Team', { teamId: t.teamId })}
                >
                  <View style={[st.row, tier ? { backgroundColor: tier + '14', borderRadius: theme.radius.sm } : i > 3 && st.rowDivider]}>
                    <RankBadge index={i} />
                    <View style={[st.teamCol, st.teamCell]}>
                      <View style={[st.dot, { backgroundColor: t.colorHex ?? theme.colors.surfaceAlt }]} />
                      <Text style={[textStyles.body, i === 0 && { fontWeight: '700' }]} numberOfLines={1}>{t.name}</Text>
                    </View>
                    <Text style={st.num}>{t.played}</Text>
                    <Text style={st.num}>{t.won}</Text>
                    {hasDraws && <Text style={st.num}>{t.drawn}</Text>}
                    <Text style={st.num}>{t.lost}</Text>
                    <Text style={[st.num, st.pts]}>{t.points}</Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </Card>

        <SectionHeader
          title={`Top performers · ${lead.label}`}
          count={leaders.length}
          onSeeAll={leaders.length > SECTION_CAP ? () => setShowLeaders((v) => !v) : undefined}
          expanded={showLeaders}
        />
        {leaders.length === 0 ? (
          <Card><EmptyState icon="⭐" title={`No ${lead.label} recorded yet`} hint="Leaders appear here once players are scored." compact /></Card>
        ) : (
          (showLeaders ? leaders : leaders.slice(0, SECTION_CAP)).map((l, i) => {
            const tier = podiumColor(i);
            return (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`${i + 1}. ${l.name}, ${l.value} ${lead.label}`}
                key={l.playerId}
                activeOpacity={0.85}
                onPress={() => nav.navigate('PlayerProfile', { playerId: l.playerId })}
              >
                <Card style={[st.leaderRow, tier ? { borderColor: tier + '66' } : null]}>
                  <RankBadge index={i} />
                  <View style={{ flex: 1 }}>
                    <Text style={[textStyles.body, i === 0 && { fontWeight: '700' }]}>{l.name}</Text>
                    {l.houseName ? <Text style={textStyles.muted}>{l.houseName}</Text> : null}
                  </View>
                  <Text style={st.leaderVal}>{l.value}</Text>
                  <Text style={textStyles.muted}> {lead.label}</Text>
                </Card>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  chips: { gap: theme.spacing(2), paddingVertical: theme.spacing(1) },
  section: { marginTop: theme.spacing(2) },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(1) },
  rowDivider: { borderTopWidth: 1, borderTopColor: theme.colors.border },
  head: { borderBottomWidth: 1, borderBottomColor: theme.colors.border, paddingBottom: theme.spacing(2) },
  headText: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800' },
  posCell: { width: 28, alignItems: 'center', justifyContent: 'center' },
  teamCol: { flex: 1 },
  teamCell: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  dot: { width: 12, height: 12, borderRadius: 6 },
  num: { width: 32, textAlign: 'center', color: theme.colors.text, fontSize: theme.font.small },
  pts: { fontWeight: '900', color: theme.colors.primary },
  leaderRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  leaderVal: { color: theme.colors.primary, fontSize: theme.font.h3, fontWeight: '900' },
});
