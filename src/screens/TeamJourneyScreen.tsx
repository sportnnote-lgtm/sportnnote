/** SD-138 — one entrant's tournament journey: where they finished in their
 *  group (live while it plays, "final" after), every knockout round with the
 *  score and how it was decided, and the final place. Opened from a standings
 *  row, a bracket side, the team page and the player's sport profile. */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Button, EmptyState, LoadingState, ScreenTitle, SelectChip, textStyles } from '../components/ui';
import { JourneyView, journeyFor, useLiveRefresh } from '../components/TournamentHistory';
import { getSport } from '../sports/registry';
import { useLeagueData, useTournamentById } from '../data/hooks';
import { openMatchViewer } from '../navigation/openMatch';
import { readSeriesMeta } from '../data/series';
import type { SportId } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

export default function TeamJourneyScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'TeamJourney'>>();
  const { tournamentId, teamId } = params;
  const tournament = useTournamentById(tournamentId);
  const [nonce, setNonce] = useState(0);
  const { matches, loading } = useLeagueData(tournamentId, nonce);
  const mine = useMemo(() => matches.filter((m) => m.homeTeam.id === teamId || m.awayTeam.id === teamId || (m.byes ?? []).includes(teamId)), [matches, teamId]);
  const sports = useMemo(() => [...new Set(mine.map((m) => m.sport))], [mine]);
  const [picked, setPicked] = useState<SportId | undefined>(params.sport);
  const sport = picked && sports.includes(picked) ? picked : sports[0];
  const journey = useMemo(() => (sport ? journeyFor(tournament ?? undefined, matches, sport, teamId) : null), [matches, sport, teamId, tournament]);
  // Live matches in this sport → refresh every 30 s while the screen is open.
  const anyLive = useMemo(() => matches.some((m) => m.sport === sport && m.status === 'live'), [matches, sport]);
  const bump = useCallback(() => setNonce((x) => x + 1), []);
  useLiveRefresh(anyLive, bump);

  useEffect(() => {
    if (tournament) nav.setOptions({ title: tournament.name });
  }, [nav, tournament?.name]);

  const openMatch = (id: string) => {
    const m = matches.find((x) => x.id === id);
    if (!m) return;
    // A team tie opens as the tie (its rubbers); anything else as the match.
    const meta = readSeriesMeta(m);
    if (meta?.format === 'rubbers') nav.navigate('Series', { seriesId: meta.id });
    else openMatchViewer(nav, m);
  };

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content}>
        <ScreenTitle title="Tournament journey" subtitle={tournament?.name} />
        {sports.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chips}>
            {sports.map((s) => (
              <SelectChip key={s} label={`${getSport(s).icon} ${getSport(s).name}`} active={sport === s} onPress={() => setPicked(s)} />
            ))}
          </ScrollView>
        )}
        {loading && !matches.length ? <LoadingState /> : !journey ? (
          <EmptyState icon="🧭" title="No matches here yet" hint="The journey fills in once this entrant has a fixture in the tournament." compact />
        ) : (
          <JourneyView
            j={journey}
            onGroup={() => nav.navigate('Standings', { tournamentId, sport })}
            onMatch={openMatch}
            onOpponent={(id) => nav.setParams({ teamId: id })}
          />
        )}
        {anyLive && <Text style={textStyles.muted}>Live — updates every 30 seconds.</Text>}
        <View style={{ gap: theme.spacing(2) }}>
          <Button label="🏆 Knockout bracket" variant="ghost" onPress={() => nav.navigate('Bracket', { tournamentId, sport })} />
          <Button label="📊 Standings" variant="ghost" onPress={() => nav.navigate('Standings', { tournamentId, sport })} />
          <Button label="👥 Team page" variant="ghost" onPress={() => nav.navigate('Team', { teamId })} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  chips: { gap: theme.spacing(2), paddingVertical: theme.spacing(1) },
});
