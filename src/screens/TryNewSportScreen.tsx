/** "Try a new sport" — pick one of the sports the user hasn't played yet, then
 *  choose how to get started: organize a game, organize a tournament, or watch
 *  the upcoming games of the teams/tournaments they follow in that sport. */
import React, { useMemo, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { EmptyState, Card, ScreenTitle, textStyles } from '../components/ui';
import { MatchCard } from '../components/MatchCard';
import { SectionHeader, SECTION_CAP } from '../components/SectionHeader';
import { SPORT_LIST, getSport } from '../sports/registry';
import { useAuth } from '../core/auth';
import { canScoreByRole } from '../core/roles';
import { useMyTournaments, useMatches, useFollow } from '../data/hooks';
import type { Match, SportId } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function TryNewSportScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'TryNewSport'>>();
  const { profile } = useAuth();
  const tournaments = useMyTournaments(profile?.id);
  const { matches } = useMatches();
  const { idsOfType } = useFollow(profile?.id);

  // Sports to offer: those passed in (the user's unplayed sports), else all.
  const options: SportId[] = params?.sports?.length ? params.sports : SPORT_LIST.map((s) => s.id);
  const [chosen, setChosen] = useState<SportId | null>(null);
  const [showFollowedGames, setShowFollowedGames] = useState(false);

  const followedTeams = idsOfType('team');
  const followedTours = idsOfType('tournament');
  const followedGames = useMemo(() => {
    if (!chosen) return [];
    return matches.filter(
      (m) =>
        m.sport === chosen &&
        m.status !== 'completed' &&
        ((m.tournamentId != null && followedTours.includes(m.tournamentId)) ||
          followedTeams.includes(m.homeTeam.id) ||
          followedTeams.includes(m.awayTeam.id))
    );
  }, [matches, chosen, followedTeams, followedTours]);

  const canScore = canScoreByRole(profile?.role);
  const openScorer = (m: Match) =>
    nav.navigate('LiveScoring', {
      matchId: m.id, sport: m.sport,
      homeName: m.homeTeam.shortName, awayName: m.awayTeam.shortName,
      homeTeamName: m.homeTeam.name, awayTeamName: m.awayTeam.name,
      homeColor: m.homeTeam.colorHex, awayColor: m.awayTeam.colorHex,
      canScore,
    });

  const organize = () => {
    if (!chosen) return;
    const t = tournaments.find((x) => x.sports.includes(chosen)) ?? tournaments[0];
    if (t) nav.navigate('ScheduleMatch', { tournamentId: t.id, sport: chosen });
  };

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content}>
        <ScreenTitle
          title="Try a new sport"
          subtitle={chosen ? `Get started with ${getSport(chosen).name}` : 'Pick a sport you haven’t played yet'}
        />

        {/* Step 1 — choose the sport */}
        <View style={st.grid}>
          {options.map((s) => {
            const active = chosen === s;
            return (
              <TouchableOpacity accessibilityRole="button"
                key={s}
                activeOpacity={0.85}
                style={[st.tile, active && st.tileActive]}
                accessibilityState={{ selected: active }}
                onPress={() => setChosen(active ? null : s)}
              >
                <Text style={st.tileIcon}>{getSport(s).icon}</Text>
                <Text style={[textStyles.body, active && st.tileTextActive]} numberOfLines={1}>{getSport(s).name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Step 2 — what to do with the chosen sport */}
        {chosen && (
          <>
            <Text style={[textStyles.h3, st.section]}>Get started</Text>

            <ActionRow
              icon="🗓️"
              title="Organize a game"
              subtitle={`Schedule a ${getSport(chosen).name} match`}
              onPress={organize}
            />
            <ActionRow
              icon="🏆"
              title="Organize a tournament"
              subtitle={`Set up a ${getSport(chosen).name} competition`}
              onPress={() => nav.navigate('CreateTournament', { sport: chosen })}
            />

            <SectionHeader
              title="👀 From people you follow"
              count={followedGames.length}
              onSeeAll={followedGames.length > SECTION_CAP ? () => setShowFollowedGames((v) => !v) : undefined}
              expanded={showFollowedGames}
            />
            {followedGames.length > 0 ? (
              (showFollowedGames ? followedGames : followedGames.slice(0, SECTION_CAP)).map((m) => (
                <MatchCard key={m.id} match={m} onPress={() => openScorer(m)} />
              ))
            ) : (
              <Card>
                <EmptyState
                  icon={getSport(chosen).icon}
                  title={`No upcoming ${getSport(chosen).name.toLowerCase()} games yet`}
                  hint="Follow teams or tournaments from Discover to see their fixtures here."
                  compact
                />
              </Card>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ActionRow({ icon, title, subtitle, onPress }: { icon: string; title: string; subtitle: string; onPress: () => void }) {
  return (
    <TouchableOpacity accessibilityRole="button" activeOpacity={0.85} onPress={onPress}>
      <Card style={st.actionRow}>
        <Text style={st.actionIcon}>{icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={textStyles.body}>{title}</Text>
          <Text style={textStyles.muted}>{subtitle}</Text>
        </View>
        <Text style={st.chevron}>›</Text>
      </Card>
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  tile: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2),
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.colors.border,
    paddingVertical: theme.spacing(3), paddingHorizontal: theme.spacing(3), width: '48%',
  },
  tileActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary + '18' },
  tileIcon: { fontSize: 22 },
  tileTextActive: { fontWeight: '800' },
  section: { marginTop: theme.spacing(2) },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  actionIcon: { fontSize: 24 },
  chevron: { color: theme.colors.textMuted, fontSize: theme.font.h2, fontWeight: '700' },
});
