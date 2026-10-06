/** Live golf rounds for Home's "Live now": one card per round with the current
 *  leader. Renders nothing when no round is live. */
import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../../core/theme';
import { textStyles } from '../ui';
import { getLiveGolfRounds, getFieldEntries, getGolfCourses, buildLeaderboard, golfFormatOf } from '../../data/golf';
import { getPlayers } from '../../data/repos';
import { toParLabel } from '../../sports/golf/engine';
import type { RootStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
interface Row { id: string; title: string; leader?: string; score?: string; players: number }

export function LiveGolfCards({ tournamentId }: { tournamentId?: string | null }) {
  const nav = useNavigation<Nav>();
  const [rows, setRows] = useState<Row[]>([]);
  useFocusEffect(useCallback(() => {
    let on = true;
    (async () => {
      const evs = (await getLiveGolfRounds()).filter((e) => !tournamentId || e.tournamentId === tournamentId);
      if (!evs.length) { if (on) setRows([]); return; }
      const [ens, cs, ps] = await Promise.all([getFieldEntries(evs.map((e) => e.id)), getGolfCourses(), getPlayers()]);
      const names = new Map(ps.map((p) => [p.id, p.fullName]));
      const out = evs.map((e) => {
        const board = buildLeaderboard([e], ens.filter((x) => x.eventId === e.id), cs);
        const top = board.find((r) => r.position === 1);
        const fmt = golfFormatOf(e);
        return {
          id: e.id, title: e.title, players: ens.filter((x) => x.eventId === e.id).length,
          leader: top ? names.get(top.id) : undefined,
          score: top ? (fmt.scoring === 'stableford' ? `${top.total} pts` : `${toParLabel(top.total)} thru ${top.thru}`) : undefined,
        };
      });
      if (on) setRows(out);
    })();
    return () => { on = false; };
  }, [tournamentId]));
  if (!rows.length) return null;
  return (
    <View style={{ gap: theme.spacing(2) }}>
      {rows.map((r) => (
        <TouchableOpacity key={r.id} accessibilityRole="button" accessibilityLabel={`Golf: ${r.title}, live${r.leader ? `, leader ${r.leader}` : ''}`} activeOpacity={0.85} onPress={() => nav.navigate('GolfRound', { eventId: r.id })}>
          <View style={st.card}>
            <Text style={st.icon}>⛳</Text>
            <View style={{ flex: 1 }}>
              <Text style={[textStyles.body, st.bold]} numberOfLines={1}>{r.title}</Text>
              <Text style={textStyles.muted} numberOfLines={1}>{r.leader ? `Leader: ${r.leader} · ${r.score}` : `${r.players} players`}</Text>
            </View>
            <Text style={st.live}>LIVE</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3) },
  icon: { fontSize: 24 },
  bold: { fontWeight: '800' },
  live: { color: theme.colors.danger, fontWeight: '900', fontSize: theme.font.tiny },
});
