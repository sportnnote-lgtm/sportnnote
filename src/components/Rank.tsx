/** Shared podium treatment for every standings table — one source of truth so
 *  the Standings screen, the LeagueTable and the tournament overall table all
 *  celebrate their top three identically. */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';

// Gold · silver · bronze.
export const PODIUM = ['#FFD54A', '#C0C7D0', '#E8A15D'] as const;
const MEDALS = ['🥇', '🥈', '🥉'];

/** Tier colour for a 0-based rank, or null outside the top three. */
export const podiumColor = (index: number): string | null => (index < 3 ? PODIUM[index] : null);

/** A rank cell: a medal for the top three, otherwise the plain number. */
export function RankBadge({ index, width = 28 }: { index: number; width?: number }) {
  const tier = podiumColor(index);
  return (
    <View style={[rk.cell, { width }]}>
      {tier ? (
        <Text style={rk.medal} accessibilityLabel={`Rank ${index + 1}`}>{MEDALS[index]}</Text>
      ) : (
        <Text style={rk.num}>{index + 1}</Text>
      )}
    </View>
  );
}

const rk = StyleSheet.create({
  cell: { alignItems: 'center', justifyContent: 'center' },
  medal: { fontSize: 18, textAlign: 'center' },
  num: { color: theme.colors.textMuted, fontWeight: '800', fontSize: theme.font.small, textAlign: 'center' },
});
