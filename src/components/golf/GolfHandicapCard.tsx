/** SD-84 (GF-09) — the golf profile's handicap block: the player's own
 *  Handicap Index, each finished 18-hole round's Score Differential (WHS Rule
 *  5.1) as a bar trend over the last 20 (the counting ones highlighted), and
 *  an "unofficial index estimate" (Rule 5.2: best 8 of 20). Never presented
 *  as an official index — only an authorised association issues one. */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { textStyles } from '../ui';
import { handicapHistory, showHcp } from '../../sports/golf/handicap';

const BAR_H = 72;

export function GolfHandicapCard({ index, lines }: {
  /** the player's own Handicap Index (profile) */
  index?: number;
  lines: Array<{ stats: Record<string, number>; date?: string; opponent?: string }>;
}) {
  const { recent, counting, estimate, snapshots } = handicapHistory(lines);
  const [pick, setPick] = useState<number | null>(null);
  if (index == null && !recent.length && !snapshots.length) return null;
  const max = Math.max(1, ...recent.map((d) => d.differential));
  const min = Math.min(0, ...recent.map((d) => d.differential));
  const span = max - min || 1;
  const sel = pick != null ? recent[pick] : recent[recent.length - 1];
  const day = (d?: string) => (d ? new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short', year: '2-digit' }) : '');
  const firstSnap = snapshots[0], lastSnap = snapshots[snapshots.length - 1];
  return (
    <View style={st.box}>
      <Text style={st.title}>Handicap</Text>
      <View style={st.tiles}>
        <View style={st.tile}>
          <Text style={st.value}>{index != null ? showHcp(index) : '–'}</Text>
          <Text style={st.label}>Handicap Index</Text>
          <Text style={st.note}>{index != null ? 'self-entered on the profile' : 'not entered — Edit profile'}</Text>
        </View>
        <View style={st.tile}>
          <Text style={[st.value, st.muted]}>{estimate ? showHcp(estimate.value) : '–'}</Text>
          <Text style={st.label}>Unofficial index estimate</Text>
          <Text style={st.note}>{estimate ? `best ${estimate.used} of ${estimate.of}${estimate.adjust ? ` ${estimate.adjust}` : ''}` : `needs 3 differentials (${recent.length} so far)`}</Text>
        </View>
      </View>
      {recent.length > 0 && (
        <>
          <Text style={st.label}>Score differentials · last {recent.length}{estimate ? ` · ■ counts in the estimate` : ''}</Text>
          <View style={st.chart} accessibilityLabel={`Score differentials, oldest to newest: ${recent.map((d) => showHcp(d.differential)).join(', ')}`}>
            {recent.map((d, i) => {
              const h = Math.max(3, ((d.differential - min) / span) * BAR_H);
              return (
                <TouchableOpacity key={i} style={st.barHit} onPress={() => setPick(pick === i ? null : i)} accessibilityRole="button"
                  accessibilityLabel={`${day(d.date)} ${d.course ?? ''}: differential ${showHcp(d.differential)}${counting.has(i) ? ', counts' : ''}`}>
                  <View style={[st.bar, { height: h }, counting.has(i) ? st.barCount : st.barOther, (pick ?? recent.length - 1) === i && st.barSel]} />
                </TouchableOpacity>
              );
            })}
          </View>
          {sel ? <Text style={st.detail}>{day(sel.date)}{sel.course ? ` · ${sel.course}` : ''} · adjusted gross {sel.adjGross} · differential {showHcp(sel.differential)}</Text> : null}
        </>
      )}
      {snapshots.length > 1 && firstSnap.index !== lastSnap.index ? (
        <Text style={st.detail}>Index you played off: {showHcp(firstSnap.index)} ({day(firstSnap.date)}) → {showHcp(lastSnap.index)} ({day(lastSnap.date)})</Text>
      ) : null}
      <Text style={st.note}>Unofficial. Differential = 113 ÷ Slope × (adjusted gross − Course Rating), with net double bogey per hole (WHS Rules 3.1, 5.1); 18-hole rounds on a rated tee only. No PCC, caps or exceptional-score reduction — only your club or the IGU issues an official Handicap Index.</Text>
    </View>
  );
}

const st = StyleSheet.create({
  box: { gap: theme.spacing(2), padding: theme.spacing(3), borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  title: { ...textStyles.h3 },
  tiles: { flexDirection: 'row', gap: theme.spacing(2) },
  tile: { flex: 1, gap: 2 },
  value: { color: theme.colors.text, fontSize: 24, fontWeight: '900' },
  muted: { color: theme.colors.textMuted },
  label: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  note: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  detail: { color: theme.colors.text, fontSize: theme.font.small },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: BAR_H + 4, gap: 2, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  barHit: { flex: 1, maxWidth: 18, height: BAR_H + 4, justifyContent: 'flex-end' },
  bar: { borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  barCount: { backgroundColor: theme.colors.primary },
  barOther: { backgroundColor: theme.colors.textMuted, opacity: 0.45 },
  barSel: { opacity: 1, borderWidth: 1, borderColor: theme.colors.text },
});
