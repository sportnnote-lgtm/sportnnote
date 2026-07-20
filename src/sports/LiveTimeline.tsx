/** Generic newest-first event timeline shared by the net/raid sports. */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { useMask } from '../core/disputeMask';
import type { LiveEvent } from './liveEvents';

export function LiveTimeline({
  events,
  emptyText = 'No events yet — updates appear here as play unfolds.',
  homeColor = theme.colors.home,
  awayColor = theme.colors.away,
  max = 60,
}: {
  events: LiveEvent[];
  emptyText?: string;
  homeColor?: string;
  awayColor?: string;
  max?: number;
}) {
  const mask = useMask();
  if (events.length === 0) return <Text style={st.empty}>{emptyText}</Text>;
  const ordered = [...events].sort((a, b) => b.id - a.id).slice(0, max);
  return (
    <View style={st.wrap}>
      {ordered.map((e) => {
        const color = e.side === 'away' ? awayColor : e.side === 'home' ? homeColor : theme.colors.textMuted;
        return (
          <View key={e.id} style={st.row}>
            <Text style={[st.stamp, { color }]} numberOfLines={1}>{e.stamp}</Text>
            <Text style={st.icon}>{e.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={st.label}>{e.label}</Text>
              {e.detail ? <Text style={st.detail}>{mask.text(e.detail)}</Text> : null}
            </View>
            {e.side ? <View style={[st.sideDot, { backgroundColor: color }]} /> : null}
          </View>
        );
      })}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { gap: theme.spacing(2) },
  empty: { color: theme.colors.textMuted, fontSize: theme.font.small, fontStyle: 'italic' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3),
    paddingVertical: theme.spacing(2), borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  stamp: { fontSize: theme.font.small, fontWeight: '800', width: 52 },
  icon: { fontSize: 18 },
  label: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  detail: { color: theme.colors.textMuted, fontSize: theme.font.small },
  sideDot: { width: 10, height: 10, borderRadius: 5 },
});
