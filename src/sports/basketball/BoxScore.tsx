/** Live box score — per-player tallies (PTS/REB/AST/PF) derived from the
 *  play-by-play, one table per team. The basketball analogue of the pitch map. */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import type { Player } from '../../core/types';
import type { BBEvent } from './events';

interface Line { name: string; pts: number; reb: number; ast: number; pf: number }

function tally(events: BBEvent[], side: 'home' | 'away', roster: Player[]): Line[] {
  const byName = new Map<string, Line>();
  const ensure = (name: string) => {
    if (!byName.has(name)) byName.set(name, { name, pts: 0, reb: 0, ast: 0, pf: 0 });
    return byName.get(name)!;
  };
  roster.forEach((p) => ensure(p.fullName));
  for (const e of events) {
    if (e.side !== side || !e.playerName) continue;
    const l = ensure(e.playerName);
    if (e.type === 'score') l.pts += e.points ?? 0;
    else if (e.type === 'rebound') l.reb += 1;
    else if (e.type === 'assist') l.ast += 1;
    else if (e.type === 'foul') l.pf += 1;
  }
  return [...byName.values()].sort((a, b) => b.pts - a.pts);
}

function Table({ title, color, lines }: { title: string; color: string; lines: Line[] }) {
  return (
    <View style={st.table}>
      <View style={st.titleRow}>
        <View style={[st.dot, { backgroundColor: color }]} />
        <Text style={st.title}>{title}</Text>
        <View style={{ flex: 1 }} />
        <Text style={st.head}>PTS</Text>
        <Text style={st.head}>REB</Text>
        <Text style={st.head}>AST</Text>
        <Text style={st.head}>PF</Text>
      </View>
      {lines.length === 0 ? (
        <Text style={st.empty}>No players.</Text>
      ) : (
        lines.map((l) => (
          <View key={l.name} style={st.row}>
            <Text style={st.name} numberOfLines={1}>{l.name}</Text>
            <Text style={st.cell}>{l.pts}</Text>
            <Text style={st.cell}>{l.reb}</Text>
            <Text style={st.cell}>{l.ast}</Text>
            <Text style={st.cell}>{l.pf}</Text>
          </View>
        ))
      )}
    </View>
  );
}

export function BoxScore({
  events,
  homeName,
  awayName,
  homeRoster = [],
  awayRoster = [],
  homeColor = theme.colors.home,
  awayColor = theme.colors.away,
}: {
  events: BBEvent[];
  homeName: string;
  awayName: string;
  homeRoster?: Player[];
  awayRoster?: Player[];
  homeColor?: string;
  awayColor?: string;
}) {
  return (
    <View style={{ gap: theme.spacing(3) }}>
      <Table title={homeName} color={homeColor} lines={tally(events, 'home', homeRoster)} />
      <Table title={awayName} color={awayColor} lines={tally(events, 'away', awayRoster)} />
    </View>
  );
}

const st = StyleSheet.create({
  table: {
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3), gap: theme.spacing(1),
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), marginBottom: theme.spacing(1) },
  dot: { width: 10, height: 10, borderRadius: 5 },
  title: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  head: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '700', width: 34, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: theme.spacing(1) },
  name: { color: theme.colors.text, fontSize: theme.font.small, flex: 1 },
  cell: { color: theme.colors.text, fontSize: theme.font.small, width: 34, textAlign: 'center' },
  empty: { color: theme.colors.textMuted, fontSize: theme.font.small },
});
