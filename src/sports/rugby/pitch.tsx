/** SD-143 — the rugby pitch (shared CourtMap) and one side's line-up by shirt
 *  number: 15s (1–3 front row, 4–5 locks, 6–8 back row, 9 scrum-half, 10
 *  fly-half, 11–14 wings and centres, 15 full-back), tens and sevens.
 *  x: 0 left → 1 right; y: 0 own try line → 1 halfway. */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { CourtMap, COURT_LINE, type CourtProps } from '../../components/CourtMap';
import type { LineupSlot } from '../../core/types';

type Slot = Omit<LineupSlot, 'playerId' | 'playerName'>;

const FIFTEEN: Slot[] = [
  { position: '1 LHP', x: 0.38, y: 0.86 }, { position: '2 HK', x: 0.5, y: 0.86 }, { position: '3 THP', x: 0.62, y: 0.86 },
  { position: '4 LK', x: 0.44, y: 0.76 }, { position: '5 LK', x: 0.56, y: 0.76 },
  { position: '6 BF', x: 0.32, y: 0.72 }, { position: '7 OF', x: 0.68, y: 0.72 }, { position: '8 N8', x: 0.5, y: 0.66 },
  { position: '9 SH', x: 0.36, y: 0.58 }, { position: '10 FH', x: 0.5, y: 0.5 },
  { position: '11 LW', x: 0.08, y: 0.4 }, { position: '12 IC', x: 0.38, y: 0.42 }, { position: '13 OC', x: 0.62, y: 0.38 }, { position: '14 RW', x: 0.92, y: 0.4 },
  { position: '15 FB', x: 0.5, y: 0.14 },
];
const TEN: Slot[] = [
  { position: '1 P', x: 0.38, y: 0.84 }, { position: '2 HK', x: 0.5, y: 0.84 }, { position: '3 P', x: 0.62, y: 0.84 },
  { position: '4 F', x: 0.32, y: 0.72 }, { position: '5 F', x: 0.68, y: 0.72 },
  { position: '6 SH', x: 0.4, y: 0.6 }, { position: '7 FH', x: 0.5, y: 0.5 },
  { position: '8 C', x: 0.62, y: 0.42 }, { position: '9 W', x: 0.9, y: 0.36 }, { position: '10 FB', x: 0.5, y: 0.16 },
];
const SEVEN: Slot[] = [
  { position: '1 P', x: 0.38, y: 0.82 }, { position: '2 HK', x: 0.5, y: 0.82 }, { position: '3 P', x: 0.62, y: 0.82 },
  { position: '4 SH', x: 0.4, y: 0.62 }, { position: '5 FH', x: 0.5, y: 0.5 }, { position: '6 C', x: 0.66, y: 0.42 }, { position: '7 W', x: 0.9, y: 0.32 },
];

export function rugbyFormation(perSide = 15): LineupSlot[] {
  const base = perSide <= 7 ? SEVEN : perSide <= 10 ? TEN : FIFTEEN;
  return base.slice(0, Math.max(1, Math.min(base.length, perSide))).map((s) => ({ ...s }));
}

export const RugbyPitch: React.FC<CourtProps> = (props) => (
  <CourtMap {...props} surfaceColor="#2f7d32" aspectRatio={0.66}>
    <View style={m.half} />
    <View style={[m.line, { top: '22%' }]} />
    <View style={[m.line, { bottom: '22%' }]} />
    <View style={[m.dash, { top: '40%' }]} />
    <View style={[m.dash, { bottom: '40%' }]} />
  </CourtMap>
);

const m = StyleSheet.create({
  half: { position: 'absolute', top: '50%', left: 0, right: 0, height: 1, backgroundColor: COURT_LINE },
  // the 22 m lines and (dashed) 10 m lines
  line: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: COURT_LINE, opacity: 0.7 },
  dash: { position: 'absolute', left: 0, right: 0, height: 0, borderTopWidth: 1, borderColor: COURT_LINE, borderStyle: 'dashed', opacity: 0.5 },
});
