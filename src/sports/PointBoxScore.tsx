/** Per-player points table for the rally sports that don't ship their own box
 *  score (pickleball, squash, padel). Tallies each side's players from the point
 *  log, with an optional per-game/per-set toggle — the analogue of the volleyball
 *  and badminton box scores, on the shared LiveEvent shape. */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { SelectChip } from '../components/ui';
import type { Player } from '../core/types';
import type { LiveEvent } from './liveEvents';

interface Line { name: string; points: number }

/** Points per player for one side; `scope` limits to one period (game/set). */
export function tally(events: LiveEvent[], side: 'home' | 'away', periodOf: (e: LiveEvent) => number | undefined, scope: 'all' | number, roster: Player[]): Line[] {
  const byName = new Map<string, Line>();
  const ensure = (name: string) => (byName.get(name) ?? byName.set(name, { name, points: 0 }).get(name)!);
  roster.forEach((p) => ensure(p.fullName));
  for (const e of events) {
    if (e.side !== side || !e.playerName || e.kind !== 'point') continue;
    if (scope !== 'all' && periodOf(e) !== scope) continue;
    ensure(e.playerName).points += 1;
  }
  return [...byName.values()].sort((a, b) => b.points - a.points);
}

function Table({ title, color, lines }: { title: string; color: string; lines: Line[] }) {
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
            <Text style={st.name} numberOfLines={1}>{l.name}</Text>
            <Text style={st.cell}>{l.points}</Text>
          </View>
        ))
      )}
    </View>
  );
}

export function PointBoxScore({
  events, homeName, awayName, homeRoster = [], awayRoster = [],
  homeColor = theme.colors.home, awayColor = theme.colors.away,
  periods = [], periodLabel = 'Game',
}: {
  events: LiveEvent[];
  homeName: string;
  awayName: string;
  homeRoster?: Player[];
  awayRoster?: Player[];
  homeColor?: string;
  awayColor?: string;
  /** the games/sets played so far, e.g. [1,2,3] */
  periods?: number[];
  /** word for a period: 'Game' (rally) or 'Set' */
  periodLabel?: string;
}) {
  const [scope, setScope] = useState<'all' | number>('all');
  // A rally point carries its period in `game`; a set-based one in `set`.
  const periodOf = (e: LiveEvent) => e.game ?? e.set;
  const active = scope !== 'all' && !periods.includes(scope) ? 'all' : scope;
  return (
    <View style={{ gap: theme.spacing(3) }}>
      {periods.length >= 2 && (
        <View style={st.scopeRow}>
          <SelectChip label="Overall" active={active === 'all'} onPress={() => setScope('all')} />
          {periods.map((n) => (
            <SelectChip key={n} label={`${periodLabel} ${n}`} active={active === n} onPress={() => setScope(n)} />
          ))}
        </View>
      )}
      <Table title={homeName} color={homeColor} lines={tally(events, 'home', periodOf, active, homeRoster)} />
      <Table title={awayName} color={awayColor} lines={tally(events, 'away', periodOf, active, awayRoster)} />
    </View>
  );
}

const st = StyleSheet.create({
  scopeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  table: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3), gap: theme.spacing(1) },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), marginBottom: theme.spacing(1) },
  dot: { width: 10, height: 10, borderRadius: 5 },
  title: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  head: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '700', width: 40, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: theme.spacing(1) },
  name: { color: theme.colors.text, fontSize: theme.font.small, flex: 1 },
  cell: { color: theme.colors.text, fontSize: theme.font.small, width: 40, textAlign: 'center', fontWeight: '700' },
  empty: { color: theme.colors.textMuted, fontSize: theme.font.small },
});
