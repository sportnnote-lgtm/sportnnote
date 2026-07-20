/** Universal scoreboard — renders any sport from a plugin's ScoreSummary. */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import type { ScoreSummary } from '../sports/types';

export function Scoreboard({
  summary,
  homeName,
  awayName,
  homeColor = theme.colors.home,
  awayColor = theme.colors.away,
  live,
  centerNode,
}: {
  summary: ScoreSummary;
  homeName: string;
  awayName: string;
  homeColor?: string;
  awayColor?: string;
  live?: boolean;
  /** optional widget shown between the status line and the score (e.g. a clock) */
  centerNode?: React.ReactNode;
}) {
  return (
    <View style={s.wrap}>
      <View style={s.statusRow}>
        {live ? <View style={s.liveDot} /> : null}
        <Text style={s.status}>{summary.statusLine}</Text>
      </View>
      {centerNode ? <View style={s.center}>{centerNode}</View> : null}
      <View style={s.row}>
        <Side name={homeName} score={summary.homeScore} color={homeColor} reds={summary.homeReds} />
        <Text style={s.colon}>:</Text>
        <Side name={awayName} score={summary.awayScore} color={awayColor} reds={summary.awayReds} />
      </View>
      {summary.detailLine ? <Text style={s.detail}>{summary.detailLine}</Text> : null}
    </View>
  );
}

/** A little stack of red-card rectangles — one per red the team has been shown. */
export function RedBadges({ count }: { count?: number }) {
  if (!count || count <= 0) return null;
  return (
    <View style={s.reds}>
      {Array.from({ length: count }).map((_, i) => <View key={i} style={s.redCard} />)}
    </View>
  );
}

function Side({ name, score, color, reds }: { name: string; score: string; color: string; reds?: number }) {
  return (
    <View style={s.side}>
      <Text style={[s.score, { color }]} numberOfLines={1}>
        {score}
      </Text>
      <View style={s.teamRow}>
        <Text style={s.team} numberOfLines={1}>
          {name}
        </Text>
        <RedBadges count={reds} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: theme.spacing(5),
    paddingHorizontal: theme.spacing(4),
    alignItems: 'center',
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), marginBottom: theme.spacing(2) },
  center: { marginBottom: theme.spacing(2), alignItems: 'center' },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.danger },
  status: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  side: { flex: 1, alignItems: 'center' },
  score: { fontSize: 52, fontWeight: '900' },
  team: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600', marginTop: theme.spacing(1) },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1), marginTop: theme.spacing(1) },
  reds: { flexDirection: 'row', gap: 2 },
  redCard: { width: 8, height: 11, borderRadius: 1.5, backgroundColor: theme.colors.danger },
  colon: { color: theme.colors.textMuted, fontSize: 40, fontWeight: '300', marginHorizontal: theme.spacing(2) },
  detail: { color: theme.colors.textMuted, fontSize: theme.font.small, marginTop: theme.spacing(3) },
});
