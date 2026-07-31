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
  const hidden = events.length - ordered.length;
  return (
    <View style={st.wrap}>
      {ordered.map((e, i) => {
        const color = e.side === 'away' ? awayColor : e.side === 'home' ? homeColor : theme.colors.textMuted;
        const latest = i === 0;
        return (
          <View key={e.id} style={st.row}>
            {/* Timeline spine: a continuous rail with a team-coloured node per event.
                The newest event's node gets a ring so the eye lands on it first. */}
            <View style={st.rail}>
              <View style={[st.railLine, i === 0 && st.railLineFirst, i === ordered.length - 1 && st.railLineLast]} />
              {latest ? <View style={[st.nodeHalo, { borderColor: color }]} /> : null}
              <View style={[st.node, { backgroundColor: color }]} />
            </View>
            <Text style={[st.stamp, { color }]} numberOfLines={1}>{e.stamp}</Text>
            <Text style={st.icon}>{e.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={st.label}>{e.label}</Text>
              {e.detail ? <Text style={st.detail}>{mask.text(e.detail)}</Text> : null}
            </View>
            {latest ? <Text style={st.latestTag}>LATEST</Text> : null}
          </View>
        );
      })}
      {hidden > 0 ? <Text style={st.moreNote}>＋ {hidden} earlier {hidden === 1 ? 'event' : 'events'}</Text> : null}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: {},
  empty: { color: theme.colors.textMuted, fontSize: theme.font.small, fontStyle: 'italic' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3),
    paddingVertical: theme.spacing(2.5),
  },
  rail: { width: 14, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  railLine: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: theme.colors.border },
  railLineFirst: { top: '50%' },
  railLineLast: { bottom: '50%' },
  node: { width: 11, height: 11, borderRadius: 6, borderWidth: 2, borderColor: theme.colors.bg },
  nodeHalo: { position: 'absolute', width: 20, height: 20, borderRadius: 10, borderWidth: 2, opacity: 0.5 },
  stamp: { fontSize: theme.font.small, fontWeight: '800', width: 48 },
  icon: { fontSize: 18 },
  label: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  detail: { color: theme.colors.textMuted, fontSize: theme.font.small },
  latestTag: { color: theme.colors.primary, fontSize: theme.font.tiny, fontWeight: '900', letterSpacing: 0.5 },
  moreNote: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700', marginTop: theme.spacing(2), marginLeft: theme.spacing(5) },
});
