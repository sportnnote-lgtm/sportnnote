/**
 * SD-50 — the "Game flow" block: biggest lead (and when), lead changes, times
 * tied, largest run per team and — basketball, once the starters are known —
 * bench points. Derived from the event log by src/sports/gameFlow.ts; renders
 * nothing for sports without a running score or before anything is scored.
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import type { LineupSlot } from '../core/types';
import { gameFlowFor, type FlowMark, type Starters } from '../sports/gameFlow';

const startersOf = (slots?: LineupSlot[]) => {
  const placed = (slots ?? []).filter((s) => s.playerId || s.playerName);
  return placed.length
    ? { ids: placed.map((s) => s.playerId).filter((x): x is string => !!x), names: placed.map((s) => s.playerName).filter((x): x is string => !!x) }
    : undefined;
};

export function GameFlowCard({
  sport, state, homeName, awayName, homeColor = theme.colors.home, awayColor = theme.colors.away, homeLineup, awayLineup,
}: {
  sport: string;
  state: unknown;
  homeName: string;
  awayName: string;
  homeColor?: string;
  awayColor?: string;
  /** the match lineup — basketball's starters when no five was set on court */
  homeLineup?: LineupSlot[];
  awayLineup?: LineupSlot[];
}) {
  const starters: Starters | undefined = sport === 'basketball' ? { home: startersOf(homeLineup), away: startersOf(awayLineup) } : undefined;
  const flow = useMemo(() => gameFlowFor(sport, state, starters), [sport, state, homeLineup, awayLineup]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!flow) return null;
  const goals = flow.unit === 'goals';
  const lead = (m: FlowMark | null) => (m ? `+${m.value}` : '—');
  const run = (m: FlowMark | null) => (m ? `${m.value}-0` : '—');
  const when = (m: FlowMark | null) => (m?.at ? `${m.at} · ${m.home}-${m.away}` : '');
  const rows: { key: string; label: string; home: string; away: string; hv: number; av: number; hs?: string; as?: string }[] = [
    { key: 'lead', label: 'Biggest lead', home: lead(flow.biggestLead.home), away: lead(flow.biggestLead.away), hv: flow.biggestLead.home?.value ?? 0, av: flow.biggestLead.away?.value ?? 0, hs: when(flow.biggestLead.home), as: when(flow.biggestLead.away) },
    { key: 'run', label: goals ? 'Most goals in a row' : 'Largest run', home: run(flow.largestRun.home), away: run(flow.largestRun.away), hv: flow.largestRun.home?.value ?? 0, av: flow.largestRun.away?.value ?? 0, hs: flow.largestRun.home?.at, as: flow.largestRun.away?.at },
  ];
  if (flow.bench) {
    const b = flow.bench;
    rows.push({ key: 'bench', label: 'Bench points', home: b.home != null ? String(b.home) : '—', away: b.away != null ? String(b.away) : '—', hv: b.home ?? 0, av: b.away ?? 0 });
  }
  return (
    <View style={{ gap: theme.spacing(2) }}>
      <Text style={g.title}>Game flow</Text>
      <View style={g.card} accessibilityLabel="Game flow">
        <View style={g.head}>
          <View style={g.side}><View style={[g.dot, { backgroundColor: homeColor }]} /><Text style={g.team} numberOfLines={1}>{homeName}</Text></View>
          <View style={[g.side, { justifyContent: 'flex-end' }]}><Text style={g.team} numberOfLines={1}>{awayName}</Text><View style={[g.dot, { backgroundColor: awayColor }]} /></View>
        </View>
        {rows.map((r) => (
          <View key={r.key} style={g.row} accessibilityLabel={`${r.label}: ${homeName} ${r.home}, ${awayName} ${r.away}`}>
            <View style={g.vals}>
              <Text style={[g.val, r.hv > r.av && g.lead]}>{r.home}</Text>
              <Text style={g.label}>{r.label}</Text>
              <Text style={[g.val, g.right, r.av > r.hv && g.lead]}>{r.away}</Text>
            </View>
            {(r.hs || r.as) ? (
              <View style={g.vals}>
                <Text style={g.sub} numberOfLines={1}>{r.hs ?? ''}</Text>
                <Text style={[g.sub, g.right]} numberOfLines={1}>{r.as ?? ''}</Text>
              </View>
            ) : null}
          </View>
        ))}
        <View style={g.pills}>
          <View style={g.pill} accessibilityLabel={`Lead changes ${flow.leadChanges}`}><Text style={g.pillVal}>{flow.leadChanges}</Text><Text style={g.pillLabel}>Lead changes</Text></View>
          <View style={g.pill} accessibilityLabel={`Times tied ${flow.timesTied}`}><Text style={g.pillVal}>{flow.timesTied}</Text><Text style={g.pillLabel}>Times tied</Text></View>
        </View>
        <Text style={g.note}>
          From the {goals ? 'goals' : 'scoring plays'} logged{flow.bench ? ' · bench = scored by players who didn’t start' : ''}.
        </Text>
      </View>
    </View>
  );
}

const g = StyleSheet.create({
  title: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3), gap: theme.spacing(2) },
  head: { flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing(2) },
  side: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1.5), flex: 1, minWidth: 0 },
  team: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800', flexShrink: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  row: { gap: 2, paddingVertical: 2 },
  vals: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1) },
  val: { color: theme.colors.text, fontSize: theme.font.small, width: 72, fontVariant: ['tabular-nums'] },
  right: { textAlign: 'right' },
  lead: { fontWeight: '800' },
  label: { flex: 1, color: theme.colors.textMuted, fontSize: theme.font.tiny, textAlign: 'center' },
  sub: { flex: 1, color: theme.colors.textMuted, fontSize: theme.font.tiny },
  pills: { flexDirection: 'row', gap: theme.spacing(2) },
  pill: { flex: 1, alignItems: 'center', backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.sm, paddingVertical: theme.spacing(2) },
  pillVal: { color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '900', fontVariant: ['tabular-nums'] },
  pillLabel: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  note: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
});
