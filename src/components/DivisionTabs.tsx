/** A horizontal division (category) selector for tournament views — schedule,
 *  standings, bracket, fixtures. Renders nothing when the tournament has no
 *  divisions, so callers can drop it in unconditionally. */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { SelectChip } from './ui';
import type { TournamentCategory } from '../core/types';

export function DivisionTabs({
  categories,
  activeCat,
  onChange,
  label = 'Division',
}: {
  categories: TournamentCategory[];
  activeCat: string | null;
  onChange: (id: string) => void;
  label?: string;
}) {
  if (categories.length === 0) return null;
  return (
    <View style={{ gap: theme.spacing(2) }}>
      <Text style={st.label}>{label}</Text>
      <View style={st.chips}>
        {categories.map((c) => (
          <SelectChip key={c.id} label={c.label} active={activeCat === c.id} onPress={() => onChange(c.id)} />
        ))}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  label: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
});
