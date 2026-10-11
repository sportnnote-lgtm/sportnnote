/** SD-47 — a last-5 form strip (W / D / L / T / NR dots, latest first). */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { textStyles } from './ui';
import type { LineResult } from '../core/types';
import type { FormEntry } from '../data/headToHead';

const COLOR: Record<LineResult, string> = { W: theme.colors.primary, D: theme.colors.textMuted, T: theme.colors.textMuted, NR: theme.colors.border, L: theme.colors.danger };
const WORD: Record<LineResult, string> = { W: 'Won', D: 'Drew', T: 'Tied', NR: 'No result', L: 'Lost' };

/** The dots alone. */
export function FormStrip({ form, onPress }: { form: FormEntry[]; onPress?: (matchId: string) => void }) {
  return (
    <View style={st.row} accessibilityLabel={`Form: ${form.map((f) => WORD[f.result]).join(', ')}`}>
      {form.map((f) => (
        <Text
          key={f.matchId}
          accessibilityRole={onPress ? 'button' : undefined}
          accessibilityLabel={`${WORD[f.result]}${f.opponent ? ` vs ${f.opponent}` : ''}`}
          onPress={onPress ? () => onPress(f.matchId) : undefined}
          style={[st.dot, { backgroundColor: COLOR[f.result] }, f.result === 'NR' && st.nr]}
        >{f.result}</Text>
      ))}
    </View>
  );
}

/** A side's name + its strip ("Asha  W W L D W"). */
export function FormRow({ name, form }: { name: string; form: FormEntry[] }) {
  return (
    <View style={st.row}>
      <Text style={[textStyles.body, { flex: 1 }]} numberOfLines={1}>{name}</Text>
      {form.length === 0 ? <Text style={textStyles.muted}>No results yet</Text> : <FormStrip form={form} />}
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1) },
  dot: {
    width: 26, height: 26, borderRadius: 13, overflow: 'hidden', textAlign: 'center', lineHeight: 26,
    color: '#06120D', fontWeight: '900', fontSize: theme.font.small,
  },
  nr: { fontSize: 10 },
});
