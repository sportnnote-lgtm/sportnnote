/**
 * Broadcast-style line-score scoreboard — the layout global TV graphics use for
 * set/game and quarter/half sports. A leading emphasized column (the headline
 * number: tennis POINTS · volleyball SETS · badminton GAMES · basketball/kabaddi
 * TOTAL) followed by one column per period (set/game/quarter/half). The period in
 * progress is highlighted, mirroring how live scoreboards read.
 *
 * Sports feed it via their own `plugin.Scoreboard`; the generic <Scoreboard/>
 * still serves the "home : away" total sports (football).
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { theme } from '../core/theme';

export interface LineCol { label: string; highlight?: boolean }
export interface LineRow { name: string; color: string; lead: string; cells: string[] }

export function LineScoreboard({
  status, live, clock, leadLabel, columns, home, away,
}: {
  status: string;
  live?: boolean;
  clock?: React.ReactNode;
  /** header over the emphasized leading column (POINTS/SETS/GAMES/TOTAL) */
  leadLabel: string;
  /** one entry per period (set/game/quarter/half); mark the live one `highlight` */
  columns: LineCol[];
  home: LineRow;
  away: LineRow;
}) {
  const rows = [home, away];
  return (
    <View style={st.wrap}>
      <View style={st.statusRow}>
        {live ? <View style={st.liveDot} /> : null}
        <Text style={st.status}>{status}</Text>
        {clock ? <View style={st.clock}>{clock}</View> : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.grid}>
        <View>
          {/* Header: name spacer · lead label · period labels */}
          <View style={st.headRow}>
            <View style={st.nameCell} />
            <Text style={st.leadHead}>{leadLabel}</Text>
            {columns.map((c, i) => (
              <View key={i} style={st.colHead}>
                {c.highlight ? (
                  <View style={st.colPill}><Text style={st.colPillText}>{c.label}</Text></View>
                ) : (
                  <Text style={st.colHeadText}>{c.label}</Text>
                )}
              </View>
            ))}
          </View>

          {rows.map((r, ri) => (
            <View key={ri} style={st.row}>
              <Text style={[st.name, { color: r.color }]} numberOfLines={1}>{r.name}</Text>
              <View style={st.leadCell}><Text style={st.leadText}>{r.lead}</Text></View>
              {r.cells.map((cell, ci) => (
                <View key={ci} style={[st.cell, columns[ci]?.highlight && st.cellHi]}>
                  <Text style={[st.cellText, columns[ci]?.highlight && st.cellTextHi]}>{cell}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const CELL = 34;
const st = StyleSheet.create({
  wrap: {
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg,
    borderWidth: 1, borderColor: theme.colors.border,
    paddingVertical: theme.spacing(4), paddingHorizontal: theme.spacing(4),
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing(2), marginBottom: theme.spacing(3) },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.danger },
  status: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  clock: { marginLeft: theme.spacing(2) },
  grid: { minWidth: '100%', justifyContent: 'center' },

  headRow: { flexDirection: 'row', alignItems: 'center', marginBottom: theme.spacing(2) },
  nameCell: { width: 120 },
  leadHead: { width: 52, textAlign: 'center', color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', letterSpacing: 0.5 },
  colHead: { width: CELL, alignItems: 'center' },
  colHeadText: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  colPill: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  colPillText: { color: '#0B0F14', fontSize: theme.font.small, fontWeight: '900' },

  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: theme.spacing(2) },
  name: { width: 120, fontSize: theme.font.h3, fontWeight: '900' },
  leadCell: { width: 52, height: 40, borderRadius: theme.radius.sm, backgroundColor: theme.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  leadText: { color: theme.colors.accent, fontSize: theme.font.h2, fontWeight: '900' },
  cell: { width: CELL, height: 40, alignItems: 'center', justifyContent: 'center' },
  cellHi: { borderRadius: theme.radius.sm, backgroundColor: 'rgba(61,220,151,0.12)' },
  cellText: { color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '800' },
  cellTextHi: { color: theme.colors.primary },
});
