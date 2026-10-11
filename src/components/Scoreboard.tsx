/** Universal scoreboard — renders any sport from a plugin's ScoreSummary. */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { ensureContrast } from '../core/contrast';
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
  // SD-155: one screen-reader stop that reads the whole board, in order.
  const reds = (n?: number) => (n ? `, ${n} red card${n === 1 ? '' : 's'}` : '');
  const label = [
    summary.statusLine,
    `${homeName} ${summary.homeScore}${reds(summary.homeReds)}`,
    `${awayName} ${summary.awayScore}${reds(summary.awayReds)}`,
    summary.detailLine,
  ].filter(Boolean).join('. ');
  return (
    <View style={s.wrap} accessible accessibilityRole="summary" accessibilityLabel={label}>
      <View style={s.statusRow}>
        {live ? <View style={s.liveDot} /> : null}
        <Text style={s.status}>{summary.statusLine}</Text>
      </View>
      {centerNode ? <View style={s.center}>{centerNode}</View> : null}
      <View style={s.row}>
        <Side name={homeName} score={summary.homeScore} color={homeColor} reds={summary.homeReds} />
        <Text style={s.colon} maxFontSizeMultiplier={1.5} importantForAccessibility="no">:</Text>
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
    <View style={s.reds} accessible accessibilityLabel={`${count} red card${count === 1 ? '' : 's'}`}>
      {Array.from({ length: count }).map((_, i) => <View key={i} style={s.redCard} />)}
    </View>
  );
}

function Side({ name, score, color, reds }: { name: string; score: string; color: string; reds?: number }) {
  return (
    <View style={s.side}>
      {/* Team colour as text: lifted to ≥3:1 on the card (large text) when a kit is dark.
          Already 52pt, so cap OS scaling at 1.5× rather than clip the digits. */}
      <Text style={[s.score, { color: ensureContrast(color, theme.colors.surface, 3) }]} numberOfLines={1} maxFontSizeMultiplier={1.5} adjustsFontSizeToFit>
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
  // alignSelf stretch is required: the `wrap` centers its children, which would
  // otherwise shrink this row to its content width and squeeze each flex:1 side
  // so narrow that a wide 2-digit score ("14") clips to "1…". Stretching lets the
  // sides split the full card width.
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  side: { flex: 1, alignItems: 'center' },
  score: { fontSize: 52, fontWeight: '900' },
  team: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600', marginTop: theme.spacing(1) },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1), marginTop: theme.spacing(1) },
  reds: { flexDirection: 'row', gap: 2 },
  redCard: { width: 8, height: 11, borderRadius: 1.5, backgroundColor: theme.colors.danger },
  colon: { color: theme.colors.textMuted, fontSize: 40, fontWeight: '300', marginHorizontal: theme.spacing(2) },
  detail: { color: theme.colors.textMuted, fontSize: theme.font.small, marginTop: theme.spacing(3) },
});
