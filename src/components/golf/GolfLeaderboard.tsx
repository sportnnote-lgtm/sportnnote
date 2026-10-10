/** Golf leaderboard: position (T3), player, total (to-par or Stableford points),
 *  today, thru. Tap a row to expand that player's card hole by hole. Players who
 *  missed the cut sit below a "cut" line, labelled MC, with their total so far. */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { textStyles } from '../ui';
import { toParLabel, type GolfCard, type Hole, type RankRow, type GolfScoring } from '../../sports/golf/engine';

export interface LeaderboardCard { holes: Hole[]; card: GolfCard; received: number[] }

export function GolfLeaderboard({
  rows, scoring, nameOf, cards, holesInRound, cutAfter, emptyLabel = 'No scores yet.',
}: {
  rows: RankRow[];
  scoring: GolfScoring;
  nameOf: (playerId: string) => string;
  /** latest-round card per player, for the expandable detail */
  cards?: Map<string, LeaderboardCard>;
  /** holes in the current round — "F" once a player has completed them */
  holesInRound?: number;
  /** draw a cut line below this position (multi-round events) */
  cutAfter?: number;
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  if (!rows.length) return <Text style={textStyles.muted}>{emptyLabel}</Text>;
  const fmt = (n: number) => (scoring === 'stableford' ? `${n} pts` : toParLabel(n));
  return (
    <View style={st.table}>
      <View style={[st.row, st.head]}>
        <Text style={[st.pos, st.headTxt]}>Pos</Text>
        <Text style={[st.name, st.headTxt]}>Player</Text>
        <Text style={[st.num, st.headTxt]}>{scoring === 'stableford' ? 'Pts' : 'Total'}</Text>
        <Text style={[st.num, st.headTxt]}>Today</Text>
        <Text style={[st.num, st.headTxt]}>Thru</Text>
      </View>
      {rows.map((r, i) => {
        const c = cards?.get(r.id);
        const thru = r.missedCut ? '–' : holesInRound && r.thru >= holesInRound ? 'F' : String(r.thru);
        const showCut = cutAfter != null && r.position != null && i > 0 && (rows[i - 1].position ?? 0) <= cutAfter && r.position > cutAfter;
        return (
          <View key={r.id}>
            {showCut && <Text style={st.cut}>— projected cut —</Text>}
            {r.missedCut && !rows[i - 1]?.missedCut && <Text style={st.cut}>— cut —</Text>}
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${nameOf(r.id)}, ${r.positionLabel}, ${fmt(r.total)}`} activeOpacity={0.8} onPress={() => setOpen(open === r.id ? null : r.id)}>
              <View style={st.row}>
                <Text style={st.pos}>{r.positionLabel}</Text>
                <Text style={[textStyles.body, st.name]} numberOfLines={1}>{nameOf(r.id)}</Text>
                <Text style={[st.num, st.total, r.position === 1 && st.leader, r.missedCut && st.mcTotal]}>{r.position == null && !r.missedCut ? '–' : fmt(r.total)}</Text>
                <Text style={st.num}>{r.position == null ? '–' : fmt(r.today)}</Text>
                <Text style={st.num}>{thru}</Text>
              </View>
            </TouchableOpacity>
            {open === r.id && c && <CardDetail {...c} />}
          </View>
        );
      })}
    </View>
  );
}

/** A compact hole-by-hole card: hole, par, score (birdie ◯ / bogey □ style colours). */
export function CardDetail({ holes, card, received }: LeaderboardCard) {
  return (
    <View style={st.detail}>
      {holes.map((h, i) => {
        const s = card.strokes[i];
        const d = typeof s === 'number' ? s - h.par : null;
        return (
          <View key={h.n} style={st.cell}>
            <Text style={st.cellHole}>{h.n}</Text>
            <Text style={st.cellPar}>P{h.par}{received[i] > 0 ? ` ${'•'.repeat(received[i])}` : ''}</Text>
            <Text style={[st.cellScore, d != null && d < 0 && st.under, d != null && d > 0 && st.over]}>{s == null ? '·' : s === 'P' ? 'P' : s}</Text>
          </View>
        );
      })}
    </View>
  );
}

const st = StyleSheet.create({
  table: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(3), borderTopWidth: 1, borderTopColor: theme.colors.border, gap: theme.spacing(2) },
  head: { borderTopWidth: 0, backgroundColor: theme.colors.surfaceAlt },
  headTxt: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', textTransform: 'uppercase' },
  pos: { width: 34, color: theme.colors.text, fontWeight: '800', fontSize: theme.font.small },
  name: { flex: 1 },
  num: { width: 52, textAlign: 'right', color: theme.colors.text, fontSize: theme.font.small },
  total: { fontWeight: '800' },
  leader: { color: theme.colors.primary },
  mcTotal: { fontWeight: '600', color: theme.colors.textMuted },
  cut: { textAlign: 'center', color: theme.colors.danger, fontSize: theme.font.tiny, fontWeight: '800', paddingVertical: 2 },
  detail: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, padding: theme.spacing(3), backgroundColor: theme.colors.surfaceAlt },
  cell: { width: 44, alignItems: 'center', paddingVertical: 4, borderRadius: 6, backgroundColor: theme.colors.surface },
  cellHole: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '700' },
  cellPar: { color: theme.colors.textMuted, fontSize: 9 },
  cellScore: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  under: { color: theme.colors.primary },
  over: { color: theme.colors.accent },
});
