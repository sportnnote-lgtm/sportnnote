/** Knockout bracket view for a sport — rounds laid out with seeded teams and
 *  byes. Generated from the participating teams. */
import React, { useMemo, useState } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { theme } from '../core/theme';
import { SelectChip, ScreenTitle, textStyles } from '../components/ui';
import { getSport } from '../sports/registry';
import { useTournament, useTeamSummaries, useMatches } from '../data/hooks';
import { knockoutBracket, bracketChampion, type BracketSlot, type DecideFn } from '../data/bracket';
import type { SportId } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

function Slot({ slot }: { slot: BracketSlot }) {
  return (
    <View style={st.slot}>
      {slot.color ? <View style={[st.dot, { backgroundColor: slot.color }]} /> : <View style={st.dotGap} />}
      <Text style={[st.slotName, (slot.bye || slot.tbd) && st.muted]} numberOfLines={1}>{slot.name}</Text>
    </View>
  );
}

export default function BracketScreen() {
  const { params } = useRoute<RouteProp<RootStackParamList, 'Bracket'>>();
  const tournament = useTournament();
  const sports = tournament?.sports ?? [];
  const [sport, setSport] = useState<SportId>(params?.sport ?? 'football');
  const teams = useTeamSummaries().filter((t) => t.sports.includes(sport));
  const { matches } = useMatches();

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
              {round.matches.map((m, mi) => (
                <View key={mi} style={st.matchCard}>
                  <Slot slot={m.home} />
                  <Text style={st.vs}>vs</Text>
                  <Slot slot={m.away} />
                </View>
              ))}
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
  slotName: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600' },
  muted: { color: theme.colors.textMuted, fontWeight: '400' },
  vs: { color: theme.colors.textMuted, fontSize: theme.font.tiny, marginLeft: theme.spacing(5) },
  champ: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md, padding: theme.spacing(3) },
  champText: { color: theme.colors.primary, fontSize: theme.font.body, fontWeight: '800' },
});
