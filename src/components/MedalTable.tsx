/** The overall medal table for a multi-sport meet: each contingent's total
 *  position points across all sports, its 🥇/🥈/🥉 count, and a per-sport
 *  breakdown of where it placed and the points it earned. */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { Card, EmptyState } from './ui';
import { RankBadge, podiumColor } from './Rank';
import { getSport } from '../sports/registry';
import type { MedalRow } from '../data/medalStandings';
import type { SportId } from '../core/types';

const ord = (n?: number): string => {
  if (!n) return '—';
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
};

export function MedalTable({ rows, emptyLabel = 'No results yet.' }: { rows: MedalRow[]; emptyLabel?: string }) {
  if (rows.length === 0) return <EmptyState icon="🏅" title={emptyLabel} compact />;
  return (
    <Card style={{ gap: theme.spacing(1) }}>
      {rows.map((r, i) => {
        const tier = podiumColor(i);
        return (
          <View key={r.teamId} style={[st.row, tier ? { backgroundColor: tier + '14', borderRadius: theme.radius.sm } : i > 3 && st.divider]}>
            <View style={st.top}>
              <RankBadge index={i} width={22} />
              <View style={[st.dot, { backgroundColor: r.colorHex ?? theme.colors.surfaceAlt }]} />
              <Text style={[st.name, i === 0 && st.bold]} numberOfLines={1}>{r.name}</Text>
              <Text style={st.medals}>{r.golds}🥇 {r.silvers}🥈 {r.bronzes}🥉</Text>
              <View style={st.ptsCol}>
                <Text style={st.pts}>{r.total}</Text>
                <Text style={st.ptsLabel}>PTS</Text>
              </View>
            </View>
            <View style={st.sportRow}>
              {r.perSport.map((p) => (
                <Text key={p.sport} style={st.chip} numberOfLines={1}>
                  {getSport(p.sport as SportId).icon} {ord(p.position)} · {p.points}
                </Text>
              ))}
              {/* SD-90: timed / measured events — placings and points per sport. */}
              {[...new Set((r.perEvent ?? []).map((e) => e.sport))].map((sp) => {
                const evs = (r.perEvent ?? []).filter((e) => e.sport === sp);
                const pts = Math.round(evs.reduce((a, e) => a + e.points, 0) * 100) / 100;
                return (
                  <Text key={`ev-${sp}`} style={st.chip} numberOfLines={1}>
                    {getSport(sp as SportId)?.icon ?? '🏅'} {evs.length} {evs.length === 1 ? 'placing' : 'placings'} · {pts}
                  </Text>
                );
              })}
            </View>
          </View>
        );
      })}
    </Card>
  );
}

const st = StyleSheet.create({
  row: { paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(1), gap: theme.spacing(1) },
  divider: { borderTopWidth: 1, borderTopColor: theme.colors.border },
  top: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  dot: { width: 12, height: 12, borderRadius: 6 },
  name: { flex: 1, color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600' },
  bold: { fontWeight: '800' },
  medals: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '700' },
  ptsCol: { alignItems: 'center', minWidth: 34 },
  pts: { color: theme.colors.primary, fontSize: theme.font.h3, fontWeight: '900' },
  ptsLabel: { color: theme.colors.textMuted, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  sportRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2), paddingLeft: theme.spacing(6) },
  chip: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '700', backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing(2), paddingVertical: 2 },
});
