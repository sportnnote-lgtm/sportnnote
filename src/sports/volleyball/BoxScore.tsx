/** Volleyball player stats — points & aces per player, one table per side,
 *  derived from the point log. A set toggle (Overall / Set 1 / Set 2 …) re-tallies
 *  over just that set — the analogue of basketball's per-quarter box score and
 *  kabaddi's per-half table. An ace is also a point, so it counts in both columns. */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { SelectChip } from '../../components/ui';
import type { Player } from '../../core/types';
import type { LiveEvent } from '../liveEvents';
import { playerLink, idByName } from '../playerLink';

interface Line { name: string; points: number; aces: number; blocks: number }

/** Tally points, aces & blocks per player for one side; `scope` limits to one set. */
export function tally(events: LiveEvent[], side: 'home' | 'away', scope: 'all' | number = 'all'): Line[] {
  const byName = new Map<string, Line>();
  const ensure = (name: string) => {
    if (!byName.has(name)) byName.set(name, { name, points: 0, aces: 0, blocks: 0 });
    return byName.get(name)!;
  };
  for (const e of events) {
    if (e.side !== side || !e.playerName || (e.kind !== 'point' && e.kind !== 'ace' && e.kind !== 'block')) continue;
    if (scope !== 'all' && e.set !== scope) continue;
    const l = ensure(e.playerName);
    l.points += 1;            // every scored point counts…
    if (e.kind === 'ace') l.aces += 1; // …an ace also lands in the ace column
    if (e.kind === 'block') l.blocks += 1; // …a winning block in the block column
  }
  return [...byName.values()].sort((a, b) => b.points - a.points || b.aces - a.aces);
}

function Table({ title, color, lines, roster, onPlayer }: { title: string; color: string; lines: Line[]; roster?: Player[]; onPlayer?: (playerId: string) => void }) {
  return (
    <View style={st.table}>
      <View style={st.titleRow}>
        <View style={[st.dot, { backgroundColor: color }]} />
        <Text style={st.title}>{title}</Text>
        <View style={{ flex: 1 }} />
        <Text style={st.head}>PTS</Text>
        <Text style={st.head}>ACE</Text>
        <Text style={st.head}>BLK</Text>
      </View>
      {lines.length === 0 ? (
        <Text style={st.empty}>No points yet.</Text>
      ) : (
        lines.map((l) => (
          <View key={l.name} style={st.row}>
            <Text style={st.name} numberOfLines={1} {...playerLink(idByName(l.name, roster), l.name, onPlayer)}>{l.name}</Text>
            <Text style={[st.cell, st.total]}>{l.points}</Text>
            <Text style={st.cell}>{l.aces}</Text>
            <Text style={st.cell}>{l.blocks}</Text>
          </View>
        ))
      )}
    </View>
  );
}

export function VolleyballBoxScore({
  events, homeName, awayName, homeColor = theme.colors.home, awayColor = theme.colors.away, periods = [], homeRoster, awayRoster, onPlayer,
}: {
  events: LiveEvent[];
  homeName: string;
  awayName: string;
  homeColor?: string;
  awayColor?: string;
  /** Sets played so far, e.g. [{value:1,label:'Set 1'},…]. The toggle only shows
   *  once two or more sets exist. */
  periods?: { value: number; label: string }[];
  homeRoster?: Player[];
  awayRoster?: Player[];
  /** tap a player's name → their profile */
  onPlayer?: (playerId: string) => void;
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
      <Table title={homeName} color={homeColor} lines={tally(events, 'home', active)} roster={homeRoster} onPlayer={onPlayer} />
      <Table title={awayName} color={awayColor} lines={tally(events, 'away', active)} roster={awayRoster} onPlayer={onPlayer} />
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
