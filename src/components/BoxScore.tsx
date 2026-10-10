/**
 * SD-23 (GEN-10) — the shared box score and team comparison panel, drawn from
 * the pure model in src/sports/boxScore.ts and a sport's source
 * (src/sports/boxSources.ts). One component for basketball, volleyball,
 * kabaddi, football, the racket sports and carrom; cricket keeps its innings
 * scorecard.
 *
 *  - period toggle (Overall / Q1 … / 1st half … / Set 1 …) once two periods exist;
 *  - team comparison: two-column bars (shots, fouls, FT%, aces, raid points …);
 *  - per team: the schema's columns (untracked ones hidden, D8), a team totals
 *    row, starters marked (*), the live on-court dot, the bench on request;
 *  - at phone width the name column stays put and the numbers scroll sideways
 *    (`boxLayout`) — the page itself never overflows.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { SelectChip } from './ui';
import type { SportId } from '../core/types';
import { statSchema } from '../sports/statSchemas';
import {
  barShares, boxLayout, buildBoxTable, comparisonRows, leaderOf, rowLabel,
  type BoxScope, type BoxTable, type BoxTableRow, type CompareRow, type MatchBoxSource,
} from '../sports/boxScore';
import { playerLink } from '../sports/playerLink';

const ROW_H = 30;

export interface MatchBoxScoreProps {
  sport: SportId;
  source: MatchBoxSource;
  homeName: string;
  awayName: string;
  homeColor?: string;
  awayColor?: string;
  /** which parts to draw — default both (comparison first, then the tables) */
  show?: 'both' | 'box' | 'compare';
  /** tap a player's name → their profile */
  onPlayer?: (playerId: string) => void;
}

export function MatchBoxScore({
  sport, source, homeName, awayName, homeColor = theme.colors.home, awayColor = theme.colors.away, show = 'both', onPlayer,
}: MatchBoxScoreProps) {
  const schema = statSchema(sport);
  const [scope, setScope] = useState<BoxScope>('all');
  const [bench, setBench] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!source.tickMs) return;
    const id = setInterval(() => tick((n) => n + 1), source.tickMs);
    return () => clearInterval(id);
  }, [source.tickMs]);
  // Guard against a stale selection if the shown periods shrink (e.g. reload).
  const active: BoxScope = scope !== 'all' && !source.periods.some((p) => p.value === scope) ? 'all' : scope;
  const data = source.data(active);
  if (!schema) return null;
  const table = buildBoxTable(schema, data, { scope: active, showDnp: bench });
  const cmp = comparisonRows(schema, data, active);
  const hasBench = [...data.home.rows, ...data.away.rows].some((r) => r.dnp);
  const drawBox = show !== 'compare' && source.players !== false && table.columns.length > 0;
  const drawCompare = show !== 'box' && cmp.rows.length > 0;
  const starters = drawBox && [...table.home.rows, ...table.away.rows].some((r) => r.starter);
  return (
    <View style={{ gap: theme.spacing(3) }}>
      {source.periods.length >= 2 && (
        <View style={st.scopeRow}>
          <SelectChip label="Overall" active={active === 'all'} onPress={() => setScope('all')} />
          {source.periods.map((p) => (
            <SelectChip key={p.value} label={p.label} active={active === p.value} onPress={() => setScope(p.value)} />
          ))}
        </View>
      )}
      {drawCompare && (
        <TeamComparison rows={cmp.rows} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor}
          untracked={source.untrackedHint ? cmp.untracked : []} untrackedHint={source.untrackedHint} />
      )}
      {drawBox && (
        <>
          <TeamTable title={homeName} color={homeColor} table={table} side="home" emptyText={source.emptyText} onPlayer={onPlayer} />
          <TeamTable title={awayName} color={awayColor} table={table} side="away" emptyText={source.emptyText} onPlayer={onPlayer} />
          <Text style={st.legend}>
            {table.columns.map((c) => `${c.abbr} ${c.label}`).join(' · ')}{starters ? ' · * starter' : ''}
          </Text>
          {(source.notes?.() ?? []).map((n) => <Text key={n} style={st.legend}>{n}</Text>)}
          {hasBench && (
            <View style={st.scopeRow}>
              <SelectChip label={bench ? 'Hide bench' : 'Show bench'} active={bench} onPress={() => setBench(!bench)} />
            </View>
          )}
        </>
      )}
    </View>
  );
}

/** One team's table: name column + the numbers (+ totals row). */
function TeamTable({ title, color, table, side, emptyText = 'No players.', onPlayer }: {
  title: string; color: string; table: BoxTable; side: 'home' | 'away'; emptyText?: string; onPlayer?: (playerId: string) => void;
}) {
  const [w, setW] = useState(0);
  const t = table[side];
  const layout = useMemo(() => boxLayout(table, w || 320), [table, w]);
  const players = t.rows;
  const nameCell = (r: BoxTableRow, extra?: object) => (
    <Text
      style={[st.name, r.team && st.teamName, r.dnp && st.muted, extra]}
      numberOfLines={1}
      {...playerLink(r.playerId, r.name, onPlayer)}
    >
      {r.on ? <Text style={[st.onDot, { color }]} accessibilityLabel="on court">● </Text> : null}
      {r.name}{r.starter ? <Text style={st.muted}> *</Text> : null}{r.dnp ? <Text style={st.muted}> · DNP</Text> : null}
    </Text>
  );
  const nums = (cells: string[], bold?: boolean) => table.columns.map((c, i) => (
    <Text key={c.key} style={[st.cell, { width: layout.widths[i] }, c.spec.emphasis && st.emph, bold && st.bold]} numberOfLines={1}>{cells[i]}</Text>
  ));
  const heads = table.columns.map((c, i) => (
    <Text key={c.key} style={[st.head, { width: layout.widths[i] }]} accessibilityLabel={c.label} numberOfLines={1}>{c.abbr}</Text>
  ));
  const totalsName = <Text style={[st.name, st.bold]} numberOfLines={1}>Totals</Text>;
  return (
    <View style={st.table} onLayout={(e) => { const x = Math.round(e.nativeEvent.layout.width) - 2 * theme.spacing(3) - 2; if (x > 0 && x !== w) setW(x); }}>
      <View style={st.titleRow}>
        <View style={[st.dot, { backgroundColor: color }]} />
        <Text style={st.title} numberOfLines={1}>{title}</Text>
      </View>
      {players.length === 0 ? (
        <Text style={st.empty}>{emptyText}</Text>
      ) : layout.sticky ? (
        // Pinned names on the left; the numbers scroll sideways on the right.
        <View style={{ flexDirection: 'row' }}>
          <View style={{ width: layout.nameWidth }}>
            <View style={[st.row, st.headRow]}><Text style={[st.head, { textAlign: 'left' }]}>Player</Text></View>
            {players.map((r) => (
              <View key={r.name} style={st.row} accessibilityLabel={rowLabel(table.columns, r)}>{nameCell(r)}</View>
            ))}
            <View style={[st.row, st.totalsRow]}>{totalsName}</View>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator style={{ flex: 1 }} contentContainerStyle={{ minWidth: '100%' }}>
            <View>
              <View style={[st.row, st.headRow]}>{heads}</View>
              {players.map((r) => (
                <View key={r.name} style={st.row} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{nums(r.cells)}</View>
              ))}
              <View style={[st.row, st.totalsRow]}>{nums(t.totals, true)}</View>
            </View>
          </ScrollView>
        </View>
      ) : (
        <View>
          <View style={[st.row, st.headRow]}>
            <Text style={[st.head, st.nameHead]}>Player</Text>
            {heads}
          </View>
          {players.map((r) => (
            <View key={r.name} style={st.row} accessibilityLabel={rowLabel(table.columns, r)}>
              {nameCell(r, { flex: 1 })}
              {nums(r.cells)}
            </View>
          ))}
          <View style={[st.row, st.totalsRow]}>
            <View style={{ flex: 1 }}>{totalsName}</View>
            {nums(t.totals, true)}
          </View>
        </View>
      )}
    </View>
  );
}

/** Home-vs-away bars: each row's two values, the leader highlighted, and a
 *  bar split by each side's share. */
export function TeamComparison({ rows, homeName, awayName, homeColor, awayColor, untracked = [], untrackedHint }: {
  rows: CompareRow[]; homeName: string; awayName: string; homeColor: string; awayColor: string;
  untracked?: string[]; untrackedHint?: string;
}) {
  return (
    <View style={{ gap: theme.spacing(2) }}>
      <View style={sv.head}>
        <Text style={[sv.headTeam, { color: homeColor }]} numberOfLines={1}>{homeName}</Text>
        <Text style={sv.headTitle}>TEAM STATS</Text>
        <Text style={[sv.headTeam, { color: awayColor, textAlign: 'right' }]} numberOfLines={1}>{awayName}</Text>
      </View>
      {rows.map((r) => {
        const lead = leaderOf(r);
        const share = barShares(r);
        const empty = r.h <= 0 && r.a <= 0;
        const Cell = ({ v, side }: { v: string; side: 'home' | 'away' }) => (
          <View style={[sv.cell, lead === side && { backgroundColor: side === 'home' ? homeColor : awayColor }]}>
            <Text style={[sv.cellText, lead === side && sv.cellTextLead]}>{v}</Text>
          </View>
        );
        return (
          <View key={r.key} style={sv.statBlock} accessibilityLabel={`${r.label}: ${homeName} ${r.home}, ${awayName} ${r.away}`}>
            <View style={sv.statRow}>
              <Cell v={r.home} side="home" />
              <Text style={sv.statLabel}>{r.label}</Text>
              <Cell v={r.away} side="away" />
            </View>
            <View style={sv.bar}>
              {empty ? <View style={{ flex: 1, backgroundColor: theme.colors.surfaceAlt }} /> : (
                <>
                  <View style={{ flex: share.home, backgroundColor: homeColor }} />
                  <View style={{ flex: share.away, backgroundColor: awayColor }} />
                </>
              )}
            </View>
          </View>
        );
      })}
      {untracked.length > 0 && (
        <Text style={sv.coverageHint}>☁ Not tracked: {untracked.join(', ')}{untrackedHint ? ` — ${untrackedHint}` : ''}</Text>
      )}
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
  title: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800', flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', height: ROW_H },
  headRow: { height: 22, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  totalsRow: { borderTopWidth: 1, borderTopColor: theme.colors.border },
  head: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '700', textAlign: 'center' },
  nameHead: { flex: 1, textAlign: 'left' },
  name: { color: theme.colors.text, fontSize: theme.font.small, paddingRight: theme.spacing(1) },
  teamName: { fontStyle: 'italic', color: theme.colors.textMuted },
  cell: { color: theme.colors.text, fontSize: theme.font.small, textAlign: 'center' },
  emph: { fontWeight: '800', color: theme.colors.primary },
  bold: { fontWeight: '800' },
  muted: { color: theme.colors.textMuted },
  empty: { color: theme.colors.textMuted, fontSize: theme.font.small },
  legend: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  onDot: { fontSize: theme.font.tiny },
});

const sv = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing(2), marginBottom: theme.spacing(1) },
  headTeam: { flex: 1, fontSize: theme.font.small, fontWeight: '800' },
  headTitle: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', letterSpacing: 0.5 },
  statBlock: { gap: theme.spacing(1), paddingVertical: theme.spacing(1.5) },
  statRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bar: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: theme.colors.surfaceAlt },
  statLabel: { flex: 1, textAlign: 'center', color: theme.colors.text, fontSize: theme.font.small },
  cell: { minWidth: 48, paddingVertical: 4, paddingHorizontal: 10, borderRadius: theme.radius.pill, alignItems: 'center' },
  cellText: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  cellTextLead: { color: '#06120D', fontWeight: '900' },
  coverageHint: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontStyle: 'italic', marginTop: theme.spacing(2), textAlign: 'center' },
});
