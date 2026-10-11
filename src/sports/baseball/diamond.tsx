/** SD-144 — the baseball field (shared CourtMap, for the line-up editor) and
 *  the small live diamond: which bases are occupied, the count and the outs.
 *  Positions use the scorer's numbers (1 P … 9 RF; 10 = slow pitch's extra
 *  fielder). x: 0 left → 1 right; y: 0 home plate → 1 the outfield fence. */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CourtMap, COURT_LINE, type CourtProps } from '../../components/CourtMap';
import { theme } from '../../core/theme';
import type { LineupSlot } from '../../core/types';

type Slot = Omit<LineupSlot, 'playerId' | 'playerName'>;

const NINE: Slot[] = [
  { position: 'C', x: 0.5, y: 0.04 },
  { position: 'P', x: 0.5, y: 0.3 },
  { position: '1B', x: 0.78, y: 0.36 },
  { position: '2B', x: 0.64, y: 0.55 },
  { position: 'SS', x: 0.36, y: 0.55 },
  { position: '3B', x: 0.22, y: 0.36 },
  { position: 'LF', x: 0.14, y: 0.82 },
  { position: 'CF', x: 0.5, y: 0.96 },
  { position: 'RF', x: 0.86, y: 0.82 },
];
const EF: Slot = { position: 'EF', x: 0.32, y: 0.9 };

export function baseballFormation(perSide?: number): LineupSlot[] {
  const base = NINE.map((s) => ({ ...s }));
  if ((perSide ?? 9) >= 10) { base[7] = { ...base[7], x: 0.66 }; base.push({ ...EF }); }
  return base;
}

export const BaseballField: React.FC<CourtProps> = (props) => (
  <CourtMap {...props} surfaceColor="#2f5d34" aspectRatio={0.7}>
    <View style={m.infield} />
  </CourtMap>
);

/** The live diamond: 1B / 2B / 3B lit when a runner is on. */
export function Diamond({ bases, size = 64, color = theme.colors.accent }: { bases: [unknown, unknown, unknown]; size?: number; color?: string }) {
  const on = bases.map(Boolean);
  const names = ['first', 'second', 'third'].filter((_, i) => on[i]);
  const label = names.length === 3 ? 'Bases loaded' : names.length ? `Runner${names.length > 1 ? 's' : ''} on ${names.join(' and ')}` : 'Bases empty';
  const b = size * 0.28;
  const pos = [
    { left: size - b - 2, top: size / 2 - b / 2 }, // 1B
    { left: size / 2 - b / 2, top: 2 }, // 2B
    { left: 2, top: size / 2 - b / 2 }, // 3B
  ];
  return (
    <View style={{ width: size, height: size }} accessible accessibilityRole="image" accessibilityLabel={label}>
      {pos.map((p, i) => (
        <View key={i} style={[m.base, { width: b, height: b, left: p.left, top: p.top, borderColor: on[i] ? color : theme.colors.textMuted, backgroundColor: on[i] ? color : 'transparent' }]} />
      ))}
      <View style={[m.base, m.plate, { width: b * 0.7, height: b * 0.7, left: size / 2 - (b * 0.7) / 2, top: size - b * 0.7 - 3 }]} />
    </View>
  );
}

/** Balls / strikes / outs as dots ("B ●●○ S ●○ O ●○"). */
export function CountDots({ balls, strikes, outs, maxBalls = 4, maxStrikes = 3 }: { balls: number; strikes: number; outs: number; maxBalls?: number; maxStrikes?: number }) {
  const row = (label: string, n: number, max: number, color: string) => (
    <View style={m.dotRow}>
      <Text style={m.dotLabel}>{label}</Text>
      {Array.from({ length: max - 1 }, (_, i) => <View key={i} style={[m.dot, { borderColor: color, backgroundColor: i < n ? color : 'transparent' }]} />)}
    </View>
  );
  return (
    <View style={m.dots} accessible accessibilityLabel={`${balls} ball${balls === 1 ? '' : 's'}, ${strikes} strike${strikes === 1 ? '' : 's'}, ${outs} out${outs === 1 ? '' : 's'}`}>
      {row('B', balls, maxBalls, theme.colors.primary)}
      {row('S', strikes, maxStrikes, theme.colors.accent)}
      {row('O', outs, 4, theme.colors.danger)}
    </View>
  );
}

const m = StyleSheet.create({
  infield: { position: 'absolute', left: '30%', bottom: '8%', width: '40%', aspectRatio: 1, borderWidth: 1, borderColor: COURT_LINE, transform: [{ rotate: '45deg' }] },
  base: { position: 'absolute', borderWidth: 2, transform: [{ rotate: '45deg' }], borderRadius: 2 },
  plate: { borderColor: theme.colors.textMuted, backgroundColor: theme.colors.textMuted },
  dots: { gap: 4 },
  dotRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dotLabel: { width: 12, color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800' },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5 },
});
