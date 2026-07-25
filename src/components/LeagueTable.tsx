/** A compact, two-line league table that fits a phone: the headline line shows
 *  rank · team · points; the muted second line shows P/W/D/L and for/against/
 *  difference. Tapping a row opens the team. */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { Card, textStyles } from './ui';
import type { TeamStanding } from '../data/standings';

const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);

export function LeagueTable({
  teams,
  onTeam,
  emptyLabel = 'No completed matches yet.',
}: {
  teams: TeamStanding[];
  onTeam?: (teamId: string) => void;
  emptyLabel?: string;
}) {
  if (teams.length === 0) return <Text style={textStyles.muted}>{emptyLabel}</Text>;
  return (
    <Card style={{ gap: theme.spacing(1) }}>
      {teams.map((t, i) => (
        <TouchableOpacity accessibilityRole="button" key={t.teamId} activeOpacity={onTeam ? 0.8 : 1} onPress={() => onTeam?.(t.teamId)}>
          <View style={[st.row, i > 0 && st.divider]}>
            <Text style={st.rank}>{i + 1}</Text>
            <View style={[st.dot, { backgroundColor: t.colorHex ?? theme.colors.surfaceAlt }]} />
            <View style={{ flex: 1 }}>
              <Text style={textStyles.body} numberOfLines={1}>{t.name}</Text>
              <Text style={st.meta} numberOfLines={1}>
                {t.played}P · {t.won}W {t.drawn}D {t.lost}L · {t.for}:{t.against} ({sign(t.diff)})
              </Text>
            </View>
            <View style={st.ptsCol}>
              <Text style={st.pts}>{t.points}</Text>
              <Text style={st.ptsLabel}>PTS</Text>
            </View>
          </View>
        </TouchableOpacity>
      ))}
    </Card>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3), paddingVertical: theme.spacing(2) },
  divider: { borderTopWidth: 1, borderTopColor: theme.colors.border },
  rank: { color: theme.colors.textMuted, fontSize: theme.font.body, fontWeight: '800', width: 18, textAlign: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6 },
  meta: { color: theme.colors.textMuted, fontSize: theme.font.tiny, marginTop: 2 },
  ptsCol: { alignItems: 'center', minWidth: 34 },
  pts: { color: theme.colors.primary, fontSize: theme.font.h3, fontWeight: '900' },
  ptsLabel: { color: theme.colors.textMuted, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
});
