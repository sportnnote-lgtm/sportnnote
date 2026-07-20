/** Horizontal swipe rail of leaderboard cards — one card per stat category
 *  (Goals, Assists, Clean sheets, …). Each card ranks the top players; tapping
 *  a player opens their profile. Swipe sideways to see more categories. */
import React from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { theme } from '../core/theme';
import { textStyles } from './ui';
import type { LeaderCategory } from '../data/standings';

const MEDAL = ['🥇', '🥈', '🥉'];

export function StatLeaderRail({
  categories,
  onPlayer,
  topN = 5,
}: {
  categories: LeaderCategory[];
  onPlayer?: (playerId: string) => void;
  topN?: number;
}) {
  const { width } = useWindowDimensions();
  const cardW = Math.min(300, Math.max(240, width - theme.spacing(14)));

  if (categories.length === 0) {
    return <Text style={textStyles.muted}>No statistics recorded yet.</Text>;
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
      snapToInterval={cardW + theme.spacing(3)}
      contentContainerStyle={st.rail}
    >
      {categories.map((cat) => (
        <View key={cat.key} style={[st.card, { width: cardW }]}>
          <Text style={st.cardTitle}>{cat.label}</Text>
          {cat.leaders.slice(0, topN).map((l, i) => (
            <TouchableOpacity
              key={l.playerId}
              activeOpacity={onPlayer ? 0.8 : 1}
              onPress={() => onPlayer?.(l.playerId)}
              style={[st.row, i > 0 && st.divider]}
            >
              <Text style={st.rankCell}>{MEDAL[i] ?? i + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={textStyles.body} numberOfLines={1}>{l.name}</Text>
                {l.houseName ? <Text style={st.house} numberOfLines={1}>{l.houseName}</Text> : null}
                {l.trackedGames != null && l.totalGames != null && l.trackedGames < l.totalGames ? (
                  <Text style={st.coverage} numberOfLines={1}>☁ {l.trackedGames} of {l.totalGames} games</Text>
                ) : null}
              </View>
              <Text style={st.value}>{l.value}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  rail: { gap: theme.spacing(3), paddingVertical: theme.spacing(1), paddingRight: theme.spacing(2) },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing(4),
    gap: theme.spacing(1),
  },
  cardTitle: { color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '800', marginBottom: theme.spacing(2) },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3), paddingVertical: theme.spacing(2) },
  divider: { borderTopWidth: 1, borderTopColor: theme.colors.border },
  rankCell: { width: 24, textAlign: 'center', fontSize: theme.font.body, fontWeight: '800', color: theme.colors.textMuted },
  house: { color: theme.colors.textMuted, fontSize: theme.font.tiny, marginTop: 1 },
  coverage: { color: theme.colors.accent, fontSize: theme.font.tiny, fontWeight: '700', marginTop: 1 },
  value: { color: theme.colors.primary, fontSize: theme.font.h3, fontWeight: '900' },
});
