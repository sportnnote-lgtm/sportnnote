/**
 * SD-29 — the small live line under a sport's clock: who is serving a timed
 * suspension and how long is left ("⏱️ Suspended: Ravi (1:24)"), and, when a
 * side is short, how many each side has on the field ("10 v 11 on the pitch").
 * Fed by the sport's on-field adapter; renders nothing when there's nothing
 * to say. The parent's clock tick re-renders it every second.
 */
import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { theme } from '../core/theme';

export function FieldBanner({ suspended, onField, unit = 'on the field' }: {
  suspended: { side: 'home' | 'away'; name: string; left: string }[];
  onField?: { home: number; away: number } | null;
  unit?: string;
}) {
  if (!suspended.length && !onField) return null;
  return (
    <View style={st.wrap} accessibilityRole="text">
      {suspended.length > 0 && (
        <Text style={st.susp} numberOfLines={2}>
          ⏱️ Suspended: {suspended.map((x) => `${x.name} (${x.left} left)`).join(' · ')}
        </Text>
      )}
      {onField && <Text style={st.count}>{onField.home} v {onField.away} {unit}</Text>}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 2 },
  susp: { color: theme.colors.accent, fontSize: theme.font.tiny, fontWeight: '800', textAlign: 'center' },
  count: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '700' },
});
