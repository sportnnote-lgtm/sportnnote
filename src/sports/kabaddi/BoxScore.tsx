/** Kabaddi player stats — raid / tackle / total points per player, one table
 *  per side, derived from the timeline. A period toggle (Overall / 1st half …)
 *  re-tallies over just that half — the analogue of football's per-half Stats
 *  and basketball's per-quarter box score. */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { SelectChip } from '../../components/ui';
import type { LiveEvent } from '../liveEvents';

interface Line { name: string; raid: number; tackle: number }

/** Tally raid/tackle points per player for one side; `scope` limits to one half. */
export function tally(events: LiveEvent[], side: 'home' | 'away', scope: 'all' | number = 'all'): Line[] {
  const byName = new Map<string, Line>();
  const ensure = (name: string) => {
    if (!byName.has(name)) byName.set(name, { name, raid: 0, tackle: 0 });
    return byName.get(name)!;
  };
  for (const e of events) {
    if (e.side !== side || !e.playerName || !e.points) continue;
    if (scope !== 'all' && e.half !== scope) continue;
    const l = ensure(e.playerName);
    if (e.kind === 'raid') l.raid += e.points;
    else if (e.kind === 'tackle') l.tackle += e.points;
  }
  return [...byName.values()].sort((a, b) => (b.raid + b.tackle) - (a.raid + a.tackle));
}

function Table({ title, color, lines }: { title: string; color: string; lines: Line[] }) {
  return (
    <View style={st.table}>
      <View style={st.titleRow}>
        <View style={[st.dot, { backgroundColor: color }]} />
        <Text style={st.title}>{title}</Text>
        <View style={{ flex: 1 }} />
        <Text style={st.head}>RAID</Text>
        <Text style={st.head}>TCKL</Text>
        <Text style={st.head}>PTS</Text>
      </View>
      {lines.length === 0 ? (
        <Text style={st.empty}>No points yet.</Text>
      ) : (
        lines.map((l) => (
          <View key={l.name} style={st.row}>
            <Text style={st.name} numberOfLines={1}>{l.name}</Text>
            <Text style={st.cell}>{l.raid}</Text>
            <Text style={st.cell}>{l.tackle}</Text>
            <Text style={[st.cell, st.total]}>{l.raid + l.tackle}</Text>
          </View>
        ))
      )}
    </View>
  );
}

export function KabaddiBoxScore({
  events, homeName, awayName, homeColor = theme.colors.home, awayColor = theme.colors.away, periods = [],
}: {
  events: LiveEvent[];
  homeName: string;
  awayName: string;
  homeColor?: string;
  awayColor?: string;
  /** Halves played so far, e.g. [{value:1,label:'1st half'},…]. The toggle only
   *  shows once two or more halves exist. */
  periods?: { value: number; label: string }[];
}) {
  const [scope, setScope] = useState<'all' | number>('all');
  const active = scope !== 'all' && !periods.some((p) => p.value === scope) ? 'all' : scope;
  return (
    <View style={{ gap: theme.spacing(3) }}>
      {periods.length >= 2 && (
        <View style={st.scopeRow}>
          <SelectChip label="Overall" active={active === 'all'} onPress={() => setScope('all')} />
          {periods.map((p) => (
            <SelectChip key={p.value} label={p.label} active={active === p.value} onPress={() => setScope(p.value)} />
          ))}
        </View>
      )}
      <Table title={homeName} color={homeColor} lines={tally(events, 'home', active)} />
      <Table title={awayName} color={awayColor} lines={tally(events, 'away', active)} />
    </View>
  );
}

const st = StyleSheet.create({
  scopeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  table: {
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3), gap: theme.spacing(1),
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), marginBottom: theme.spacing(1) },
  dot: { width: 10, height: 10, borderRadius: 5 },
  title: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  head: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '700', width: 38, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: theme.spacing(1) },
  name: { color: theme.colors.text, fontSize: theme.font.small, flex: 1 },
  cell: { color: theme.colors.text, fontSize: theme.font.small, width: 38, textAlign: 'center' },
  total: { fontWeight: '800', color: theme.colors.primary },
  empty: { color: theme.colors.textMuted, fontSize: theme.font.small },
});
