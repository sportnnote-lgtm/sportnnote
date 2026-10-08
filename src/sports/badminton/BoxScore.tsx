/** Badminton player stats — points per player, one table per side, derived from
 *  the rally log. A game toggle (Overall / Game 1 / Game 2 …) re-tallies over just
 *  that game — the analogue of volleyball's per-set box score. Most meaningful in
 *  doubles, where it splits a pair's contribution. */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { SelectChip } from '../../components/ui';
import type { Player } from '../../core/types';
import type { LiveEvent } from '../liveEvents';
import { playerLink, idByName } from '../playerLink';

interface Line { name: string; points: number }

/** Tally points per player for one side; `scope` limits to one game. */
export function tally(events: LiveEvent[], side: 'home' | 'away', scope: 'all' | number = 'all'): Line[] {
  const byName = new Map<string, Line>();
  for (const e of events) {
    if (e.side !== side || !e.playerName || e.kind !== 'point') continue;
    if (scope !== 'all' && e.game !== scope) continue;
    const l = byName.get(e.playerName) ?? { name: e.playerName, points: 0 };
    l.points += 1;
    byName.set(e.playerName, l);
  }
  return [...byName.values()].sort((a, b) => b.points - a.points);
}

function Table({ title, color, lines, roster, onPlayer }: { title: string; color: string; lines: Line[]; roster?: Player[]; onPlayer?: (playerId: string) => void }) {
  return (
    <View style={st.table}>
      <View style={st.titleRow}>
        <View style={[st.dot, { backgroundColor: color }]} />
        <Text style={st.title}>{title}</Text>
        <View style={{ flex: 1 }} />
        <Text style={st.head}>PTS</Text>
      </View>
      {lines.length === 0 ? (
        <Text style={st.empty}>No points yet.</Text>
      ) : (
        lines.map((l) => (
          <View key={l.name} style={st.row}>
            <Text style={st.name} numberOfLines={1} {...playerLink(idByName(l.name, roster), l.name, onPlayer)}>{l.name}</Text>
            <Text style={[st.cell, st.total]}>{l.points}</Text>
          </View>
        ))
      )}
    </View>
  );
}

export function BadmintonBoxScore({
  events, homeName, awayName, homeColor = theme.colors.home, awayColor = theme.colors.away, periods = [], homeRoster, awayRoster, onPlayer,
}: {
  events: LiveEvent[];
  homeName: string;
  awayName: string;
  homeColor?: string;
  awayColor?: string;
  /** Games played so far, e.g. [{value:1,label:'Game 1'},…]. The toggle only shows
   *  once two or more games exist. */
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
