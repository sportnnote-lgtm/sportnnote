/** Basketball play-by-play, newest first, stamped with quarter + minute. */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { BB_META, type BBEvent } from './events';

function describe(e: BBEvent): string {
  const who = e.playerName ?? 'Team';
  if (e.type === 'score') return `+${e.points ?? 0}  ${who}`;
  return who;
}

export function Timeline({
  events,
  homeColor = theme.colors.home,
  awayColor = theme.colors.away,
}: {
  events: BBEvent[];
  homeColor?: string;
  awayColor?: string;
}) {
  if (events.length === 0) {
    return <Text style={st.empty}>No plays yet — updates appear here as the game unfolds.</Text>;
  }
  const ordered = [...events].sort((a, b) => b.quarter - a.quarter || b.minute - a.minute || b.id - a.id);
  return (
    <View style={st.wrap}>
      {ordered.map((e) => {
        const meta = BB_META[e.type];
        const color = e.side === 'home' ? homeColor : awayColor;
        return (
          <View key={e.id} style={st.row}>
            <Text style={[st.q, { color }]}>Q{e.quarter} {e.minute}&apos;</Text>
            <Text style={st.icon}>{meta.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={st.label}>{meta.label}</Text>
              <Text style={st.detail}>{describe(e)}</Text>
            </View>
            <View style={[st.sideDot, { backgroundColor: color }]} />
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
  q: { fontSize: theme.font.small, fontWeight: '800', width: 56 },
  icon: { fontSize: 18 },
  label: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  detail: { color: theme.colors.textMuted, fontSize: theme.font.small },
  sideDot: { width: 10, height: 10, borderRadius: 5 },
});
