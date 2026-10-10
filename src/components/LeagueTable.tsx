/** A compact, two-line league table that fits a phone: the headline line shows
 *  rank · team · points; the muted second line shows P/W/D/L and for/against/
 *  difference (plus no results, only when some team has one). Cricket: W/T/L/NR
 *  and NRR, no run difference (SD-12). Tapping a row opens the team. */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { Card, EmptyState, textStyles } from './ui';
import { RankBadge, podiumColor } from './Rank';
import { tableLabels, type TeamStanding } from '../data/standings';
import type { SportId } from '../core/types';

const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const signRate = (n: number) => (n > 0 ? `+${n.toFixed(2)}` : n.toFixed(2));
/** Unplayed rounds (SD-10): Swiss byes and chess forfeits score points but
 *  aren't in P / W / D / L, so a second line says where those points came from
 *  (its own line so it never truncates at phone width). */
export const unplayed = (t: TeamStanding) => {
  const parts: string[] = [];
  if (t.byes) parts.push(`${t.byes} bye${t.byes === 1 ? '' : 's'}`);
  if (t.forfeitWins) parts.push(`${t.forfeitWins} won by forfeit`);
  if (t.forfeitLosses) parts.push(`${t.forfeitLosses} lost by forfeit`);
  return parts.join(' · ');
};

export function LeagueTable({
  teams,
  onTeam,
  emptyLabel = 'No completed matches yet.',
  sport,
}: {
  teams: TeamStanding[];
  /** the table's sport — cricket labels a tie "T", always shows NR and shows
   *  NRR instead of a run difference (SD-12) */
  sport?: SportId;
  onTeam?: (teamId: string) => void;
  emptyLabel?: string;
}) {
  if (teams.length === 0) return <EmptyState icon="🏁" title={emptyLabel} compact />;
  // NR only earns its place once a match has been washed out / abandoned.
  const labels = tableLabels(sport);
  const showNr = labels.alwaysNr || teams.some((t) => (t.nr ?? 0) > 0);
  return (
    <Card style={{ gap: theme.spacing(1) }}>
      {teams.map((t, i) => {
        const tier = podiumColor(i);
        return (
          <TouchableOpacity accessibilityRole="button" key={t.teamId} activeOpacity={onTeam ? 0.8 : 1} onPress={() => onTeam?.(t.teamId)}>
            <View style={[st.row, tier ? { backgroundColor: tier + '14', borderRadius: theme.radius.sm } : i > 3 && st.divider]}>
              <RankBadge index={i} width={22} />
              <View style={[st.dot, { backgroundColor: t.colorHex ?? theme.colors.surfaceAlt }]} />
              <View style={{ flex: 1 }}>
                <Text style={[textStyles.body, i === 0 && { fontWeight: '700' }]} numberOfLines={1}>{t.name}</Text>
                <Text style={st.meta} numberOfLines={1}>
                  {t.played}P · {t.won}W {t.drawn}{labels.draw} {t.lost}L{showNr ? ` ${t.nr ?? 0}NR` : ''}{labels.showDiff ? ` · ${t.for}:${t.against} (${sign(t.diff)})` : ''}
                  {t.nrr !== undefined ? ` · NRR ${signRate(t.nrr)}` : ''}
                </Text>
                {!!unplayed(t) && <Text style={st.meta} numberOfLines={1}>{unplayed(t)}</Text>}
              </View>
              <View style={st.ptsCol}>
                <Text style={st.pts}>{t.points}{t.adjust ? '*' : ''}</Text>
                <Text style={st.ptsLabel}>PTS</Text>
              </View>
            </View>
          </TouchableOpacity>
        );
      })}
    </Card>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3), paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(1) },
  divider: { borderTopWidth: 1, borderTopColor: theme.colors.border },
  dot: { width: 12, height: 12, borderRadius: 6 },
  meta: { color: theme.colors.textMuted, fontSize: theme.font.tiny, marginTop: 2 },
  ptsCol: { alignItems: 'center', minWidth: 34 },
  pts: { color: theme.colors.primary, fontSize: theme.font.h3, fontWeight: '900' },
  ptsLabel: { color: theme.colors.textMuted, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
});
