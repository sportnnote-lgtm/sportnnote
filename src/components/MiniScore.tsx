/** Compact one-row live-score strip, driven by any sport's ScoreSummary. Pinned
 *  at the top of the scorer's controls so the running score is always in view
 *  while scoring — no tab-hop to the scoreboard/scorecard. Especially for sports
 *  that hide the big board (cricket). Sport-agnostic: reads the same
 *  `plugin.summary(state)` projection the full <Scoreboard/> uses. */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { ensureContrast } from '../core/contrast';
import { RedBadges } from './Scoreboard';
import type { ScoreSummary } from '../sports/types';

export function MiniScore({
  summary,
  homeName,
  awayName,
  homeColor = theme.colors.home,
  awayColor = theme.colors.away,
  live,
  clockNode,
}: {
  summary: ScoreSummary;
  homeName: string;
  awayName: string;
  homeColor?: string;
  awayColor?: string;
  live?: boolean;
  /** the sport's running clock (self-ticking) — e.g. football's mm:ss, cricket's overs */
  clockNode?: React.ReactNode;
}) {
  const detail = [summary.statusLine, summary.detailLine].filter(Boolean).join(' · ');
  // Top → bottom: status ("1st Half") · running clock · scoreline. The scoreline
  // centres the score (HOME : away) with the team short-names pushed to the ends.
  const reds = (n?: number) => (n ? `, ${n} red card${n === 1 ? '' : 's'}` : '');
  // SD-155: read as one sentence ("1st Half. Lions 2. Tigers 1"), not 6 fragments.
  const label = [detail, `${homeName} ${summary.homeScore}${reds(summary.homeReds)}`, `${awayName} ${summary.awayScore}${reds(summary.awayReds)}`].filter(Boolean).join('. ');
  const hc = ensureContrast(homeColor, theme.colors.surfaceAlt, 3);
  const ac = ensureContrast(awayColor, theme.colors.surfaceAlt, 3);
  return (
    <View style={s.wrap} accessible={!clockNode} accessibilityRole="summary" accessibilityLabel={label}>
      {(detail || (live && !clockNode)) ? (
        <View style={s.statusRow}>
          {live && !clockNode ? <View style={s.dot} /> : null}
          {detail ? <Text style={s.detail} numberOfLines={1}>{detail}</Text> : null}
        </View>
      ) : null}
      {clockNode ? <View style={s.clock}>{clockNode}</View> : null}
      <View style={s.row}>
        <View style={[s.nameWrap, s.nameLeftWrap]}>
          <Text style={[s.name, s.nameLeft]} numberOfLines={1}>{homeName}</Text>
          <RedBadges count={summary.homeReds} />
        </View>
        <View style={s.scoreGroup}>
          <Text style={[s.score, { color: hc }]} numberOfLines={1} maxFontSizeMultiplier={1.6}>{summary.homeScore}</Text>
          <Text style={s.colon}>:</Text>
          <Text style={[s.score, { color: ac }]} numberOfLines={1} maxFontSizeMultiplier={1.6}>{summary.awayScore}</Text>
        </View>
        <View style={[s.nameWrap, s.nameRightWrap]}>
          <RedBadges count={summary.awayReds} />
          <Text style={[s.name, s.nameRight]} numberOfLines={1}>{awayName}</Text>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: theme.spacing(2),
    paddingHorizontal: theme.spacing(3),
    gap: theme.spacing(1),
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing(2) },
  clock: { alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.primary },
  row: { flexDirection: 'row', alignItems: 'center' },
  scoreGroup: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  score: { fontSize: 26, fontWeight: '900' },
  colon: { color: theme.colors.textMuted, fontSize: 22, fontWeight: '800' },
  nameWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1) },
  nameLeftWrap: { justifyContent: 'flex-start' },
  nameRightWrap: { justifyContent: 'flex-end' },
  name: { color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '800', flexShrink: 1 },
  nameLeft: { textAlign: 'left' },
  nameRight: { textAlign: 'right' },
  detail: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700', textAlign: 'center' },
});
