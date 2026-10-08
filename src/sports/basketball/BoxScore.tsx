/** Live box score — per-player tallies (PTS/REB/AST/PF) derived from the
 *  play-by-play, one table per team. The basketball analogue of the pitch map.
 *  A period toggle (Overall / Q1 / Q2 …) re-tallies over just that quarter — the
 *  analogue of football's per-half Stats split. */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { SelectChip } from '../../components/ui';
import type { Player } from '../../core/types';
import { pointsOf, type BBEvent } from './events';
import { playerLink, idByName } from '../playerLink';

interface Line { name: string; pts: number; reb: number; ast: number; stl: number; blk: number; to: number; pf: number }

/** Tally a side's players; `scope` limits to one quarter, or 'all' for the game. */
export function tally(events: BBEvent[], side: 'home' | 'away', roster: Player[], scope: 'all' | number = 'all'): Line[] {
  const byName = new Map<string, Line>();
  const ensure = (name: string) => {
    if (!byName.has(name)) byName.set(name, { name, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0, pf: 0 });
    return byName.get(name)!;
  };
  roster.forEach((p) => ensure(p.fullName));
  for (const e of events) {
    if (e.side !== side || !e.playerName) continue;
    if (scope !== 'all' && e.quarter !== scope) continue;
    const l = ensure(e.playerName);
    l.pts += pointsOf(e); // field goals + made free throws
    if (e.type === 'rebound') l.reb += 1;
    else if (e.type === 'assist') l.ast += 1;
    else if (e.type === 'steal') l.stl += 1;
    else if (e.type === 'block') l.blk += 1;
    else if (e.type === 'turnover') l.to += 1;
    else if (e.type === 'foul') l.pf += 1;
  }
  return [...byName.values()].sort((a, b) => b.pts - a.pts);
}

function Table({ title, color, lines, roster, onPlayer }: { title: string; color: string; lines: Line[]; roster: Player[]; onPlayer?: (playerId: string) => void }) {
  return (
    <View style={st.table}>
      <View style={st.titleRow}>
        <View style={[st.dot, { backgroundColor: color }]} />
        <Text style={st.title}>{title}</Text>
        <View style={{ flex: 1 }} />
        <Text style={st.head}>PTS</Text>
        <Text style={st.head}>REB</Text>
        <Text style={st.head}>AST</Text>
        <Text style={st.head}>STL</Text>
        <Text style={st.head}>BLK</Text>
        <Text style={st.head}>TO</Text>
        <Text style={st.head}>PF</Text>
      </View>
      {lines.length === 0 ? (
        <Text style={st.empty}>No players.</Text>
      ) : (
        lines.map((l) => (
          <View key={l.name} style={st.row}>
            <Text style={st.name} numberOfLines={1} {...playerLink(idByName(l.name, roster), l.name, onPlayer)}>{l.name}</Text>
            <Text style={st.cell}>{l.pts}</Text>
            <Text style={st.cell}>{l.reb}</Text>
            <Text style={st.cell}>{l.ast}</Text>
            <Text style={st.cell}>{l.stl}</Text>
            <Text style={st.cell}>{l.blk}</Text>
            <Text style={st.cell}>{l.to}</Text>
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
  periods = [],
  onPlayer,
}: {
  events: BBEvent[];
  homeName: string;
  awayName: string;
  homeRoster?: Player[];
  awayRoster?: Player[];
  homeColor?: string;
  awayColor?: string;
  /** The quarters played so far, e.g. [{value:1,label:'Q1'},…]. The period
   *  toggle only shows once two or more periods exist (before that, Overall
   *  and the single quarter are identical). */
  periods?: { value: number; label: string }[];
  /** tap a player's name → their profile */
  onPlayer?: (playerId: string) => void;
}) {
  const [scope, setScope] = useState<'all' | number>('all');
  // Guard against a stale selection if the shown periods shrink (e.g. reload).
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
      <Table title={homeName} color={homeColor} lines={tally(events, 'home', homeRoster, active)} roster={homeRoster} onPlayer={onPlayer} />
      <Table title={awayName} color={awayColor} lines={tally(events, 'away', awayRoster, active)} roster={awayRoster} onPlayer={onPlayer} />
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
  head: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '700', width: 28, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: theme.spacing(1) },
  name: { color: theme.colors.text, fontSize: theme.font.small, flex: 1, minWidth: 72 },
  cell: { color: theme.colors.text, fontSize: theme.font.small, width: 28, textAlign: 'center' },
  empty: { color: theme.colors.textMuted, fontSize: theme.font.small },
});
