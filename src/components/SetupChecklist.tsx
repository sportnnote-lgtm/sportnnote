/** "Finish setting up · 1 of 3" (parity #08): teams → format → schedule, ticked
 *  from the tournament's real data. Hide is remembered per device. */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { Card, textStyles } from './ui';
import type { SetupStep } from '../data/setupChecklist';

export function SetupChecklist({ steps, hidden, onHide, onStep }: {
  steps: SetupStep[]; hidden: boolean; onHide: () => void; onStep: (key: SetupStep['key']) => void;
}) {
  const done = steps.filter((s) => s.done).length;
  if (hidden || !steps.length || done === steps.length) return null;
  const next = steps.find((s) => !s.done)?.key;
  return (
    <Card style={{ gap: theme.spacing(2) }}>
      <View style={st.head}>
        <Text style={[textStyles.h3, { flex: 1 }]}>{done === 0 ? `Tournament created — ${steps.length} quick steps` : `Finish setting up · ${done} of ${steps.length}`}</Text>
        <Text style={st.hide} accessibilityRole="button" onPress={onHide}>Hide</Text>
      </View>
      {steps.map((s, i) => (
        <TouchableOpacity key={s.key} accessibilityRole="button" accessibilityLabel={s.label} activeOpacity={0.8} onPress={() => onStep(s.key)} style={st.row}>
          <View style={[st.badge, s.done && st.badgeDone, s.key === next && st.badgeNext]}>
            <Text style={[st.badgeText, (s.done || s.key === next) && { color: '#06120D' }]}>{s.done ? '✓' : i + 1}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[textStyles.body, s.key === next && { color: theme.colors.primary, fontWeight: '800' }, s.done && st.doneText]}>{s.label}</Text>
            {!s.done ? <Text style={textStyles.muted}>{s.hint}</Text> : null}
          </View>
          {!s.done ? <Text style={st.chev}>›</Text> : null}
        </TouchableOpacity>
      ))}
    </Card>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  hide: { color: theme.colors.textMuted, fontWeight: '700', fontSize: theme.font.small },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3), paddingVertical: theme.spacing(1) },
  badge: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.border },
  badgeDone: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  badgeNext: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  badgeText: { color: theme.colors.text, fontWeight: '800', fontSize: theme.font.small },
  doneText: { color: theme.colors.textMuted, textDecorationLine: 'line-through' },
  chev: { color: theme.colors.textMuted, fontSize: theme.font.h3 },
});
