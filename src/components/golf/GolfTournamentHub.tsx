/** Golf inside a tournament (stroke play / Stableford): its rounds and the
 *  cumulative leaderboard across them, plus "set up a round". Match-play golf
 *  tournaments use the normal matches/bracket hub instead. */
import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../../core/theme';
import { Button, Pill, textStyles } from '../ui';
import { SectionHeader } from '../SectionHeader';
import { GolfLeaderboard } from './GolfLeaderboard';
import { useGolfRounds } from '../../data/useGolf';
import { buildLeaderboard, golfFormatOf } from '../../data/golf';
import type { RootStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function GolfTournamentHub({ tournamentId, format, canOrganize }: { tournamentId: string; format?: Record<string, unknown>; canOrganize: boolean }) {
  const nav = useNavigation<Nav>();
  const { events, entries, courses, players, loading } = useGolfRounds({ tournamentId });
  const rows = useMemo(() => buildLeaderboard(events, entries, courses), [events, entries, courses]);
  const scoring = events.length ? golfFormatOf(events[events.length - 1]).scoring : (format?.competition === 'stableford' ? 'stableford' : 'stroke');
  const last = events[events.length - 1];
  const nameOf = (pid: string) => players.get(pid)?.fullName ?? 'Player';

  return (
    <View style={{ gap: theme.spacing(3) }}>
      {canOrganize && (
        last && last.status === 'completed'
          ? <Button label={`＋ Set up round ${last.roundNo + 1}`} variant="ghost" onPress={() => nav.navigate('GolfRoundSetup', { tournamentId, nextOf: last.id })} />
          : !last && <Button label="⛳ Set up round 1" onPress={() => nav.navigate('GolfRoundSetup', { tournamentId, competition: String(format?.competition ?? 'stroke'), holes: String(format?.holes ?? '18') })} />
      )}

      <SectionHeader title="⛳ Rounds" count={events.length} />
      {loading ? <Text style={textStyles.muted}>Loading…</Text> : events.length === 0 ? (
        <Text style={textStyles.muted}>No rounds yet.</Text>
      ) : events.map((e) => (
        <TouchableOpacity key={e.id} accessibilityRole="button" activeOpacity={0.85} onPress={() => nav.navigate('GolfRound', { eventId: e.id })}>
          <View style={st.round}>
            <View style={{ flex: 1 }}>
              <Text style={[textStyles.body, st.bold]}>{e.title}</Text>
              <Text style={textStyles.muted}>{new Date(e.startsAt).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} · {entries.filter((x) => x.eventId === e.id).length} players</Text>
            </View>
            <Pill
              label={e.status === 'live' ? 'LIVE' : e.status === 'completed' ? 'FINAL' : 'UPCOMING'}
              color={e.status === 'live' ? theme.colors.danger : theme.colors.surfaceAlt}
              textColor={e.status === 'live' ? '#fff' : theme.colors.textMuted}
            />
          </View>
        </TouchableOpacity>
      ))}

      <SectionHeader title={events.length > 1 ? '🏆 Leaderboard (all rounds)' : '🏆 Leaderboard'} count={rows.length} />
      <GolfLeaderboard rows={rows} scoring={scoring} nameOf={nameOf} />
    </View>
  );
}

const st = StyleSheet.create({
  round: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3) },
  bold: { fontWeight: '800' },
});
