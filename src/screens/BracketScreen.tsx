/** Knockout bracket view for a sport — rounds laid out with seeded teams and
 *  byes. Generated from the participating teams. */
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { SelectChip, ScreenTitle, textStyles } from '../components/ui';
import { PODIUM } from '../components/Rank';
import { getSport } from '../sports/registry';
import { useTournament, useTeamSummaries, useMatches } from '../data/hooks';
import { knockoutBracket, bracketChampion, type BracketSlot, type BracketMatch, type DecideFn } from '../data/bracket';
import type { SportId } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

type SlotState = 'won' | 'lost' | 'neutral';

function Slot({ slot, state = 'neutral' }: { slot: BracketSlot; state?: SlotState }) {
  const dim = slot.bye || slot.tbd || state === 'lost';
  return (
    <View style={st.slot}>
      {slot.color ? <View style={[st.dot, { backgroundColor: slot.color }]} /> : <View style={st.dotGap} />}
      <Text style={[st.slotName, dim && st.muted, state === 'won' && st.winnerName]} numberOfLines={1}>{slot.name}</Text>
      {state === 'won' && <Text style={st.check}>✓</Text>}
    </View>
  );
}

export default function BracketScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'Bracket'>>();
  const tournament = useTournament();
  const sports = tournament?.sports ?? [];
  const [sport, setSport] = useState<SportId>(params?.sport ?? 'football');
  const teams = useTeamSummaries().filter((t) => t.sports.includes(sport));
  const { matches } = useMatches();

  // Breadcrumb: name the nav bar after the tournament; the in-content title
  // stays "Knockout bracket".
  useEffect(() => {
    if (tournament) nav.setOptions({ title: tournament.name });
  }, [nav, tournament?.name]);

  // A pairing is decided if those two teams played a completed match in this sport.
  const decide = useMemo<DecideFn>(() => {
    return (a, b) => {
      const m = matches.find(
        (x) =>
          x.sport === sport && x.status === 'completed' && x.winner && x.winner !== 'draw' &&
          ((x.homeTeam.name === a && x.awayTeam.name === b) || (x.homeTeam.name === b && x.awayTeam.name === a))
      );
      if (!m) return undefined;
      return m.winner === 'home' ? m.homeTeam.name : m.awayTeam.name;
    };
  }, [matches, sport]);

  const rounds = useMemo(
    () => knockoutBracket(teams.map((t) => ({ name: t.name, color: t.colorHex })), decide),
    [teams, decide]
  );
  const champion = useMemo(() => bracketChampion(rounds, decide), [rounds, decide]);

  // The winner of a real, decided contest (not a bye or a still-pending pairing),
  // so we can emphasise it with the app's green = win language.
  const decidedWinner = (m: BracketMatch): string | undefined => {
    const { home, away } = m;
    if (home.bye || away.bye || home.tbd || away.tbd) return undefined;
    return decide(home.name, away.name);
  };
  const slotState = (winner: string | undefined, name: string): SlotState =>
    !winner ? 'neutral' : winner === name ? 'won' : 'lost';

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content}>
        <ScreenTitle title="Knockout bracket" subtitle={`${teams.length} teams`} />

        {sports.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chips}>
            {sports.map((s) => (
              <SelectChip key={s} label={`${getSport(s).icon} ${getSport(s).name}`} active={sport === s} onPress={() => setSport(s)} />
            ))}
          </ScrollView>
        )}

        {champion && (
          <View style={st.champ}>
            {champion.color ? <View style={[st.dot, { backgroundColor: champion.color }]} /> : null}
            <Text style={st.champText}>🏆 Champion: {champion.name}</Text>
          </View>
        )}

        {rounds.length === 0 ? (
          <Text style={textStyles.muted}>Not enough teams for a bracket yet.</Text>
        ) : (
          rounds.map((round, ri) => (
            <View key={ri} style={{ gap: theme.spacing(2) }}>
              <Text style={textStyles.h3}>{round.name}</Text>
              {round.matches.map((m, mi) => {
                const winner = decidedWinner(m);
                return (
                  <View key={mi} style={st.matchCard}>
                    <Slot slot={m.home} state={slotState(winner, m.home.name)} />
                    <View style={st.vsRow}><Text style={st.vs}>vs</Text></View>
                    <Slot slot={m.away} state={slotState(winner, m.away.name)} />
                  </View>
                );
              })}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  chips: { gap: theme.spacing(2), paddingVertical: theme.spacing(1) },
  matchCard: {
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1,
    borderColor: theme.colors.border, padding: theme.spacing(3), gap: theme.spacing(2),
  },
  slot: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  dot: { width: 12, height: 12, borderRadius: 6 },
  dotGap: { width: 12, height: 12 },
  slotName: { flex: 1, color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600' },
  winnerName: { color: theme.colors.text, fontWeight: '800' },
  check: { color: theme.colors.primary, fontSize: theme.font.body, fontWeight: '800' },
  muted: { color: theme.colors.textMuted, fontWeight: '400' },
  vsRow: { alignItems: 'center' },
  vs: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  champ: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2),
    backgroundColor: PODIUM[0] + '1F', borderRadius: theme.radius.md, padding: theme.spacing(3),
    borderWidth: 1, borderColor: PODIUM[0] + '66',
  },
  champText: { color: PODIUM[0], fontSize: theme.font.body, fontWeight: '800' },
});
