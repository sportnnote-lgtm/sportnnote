/** SD-147 — the American football field (shared CourtMap) and one side's
 *  line-up: flag 5-on-5 (centre, quarterback, three receivers) and tackle
 *  11-a-side (an offensive set: QB, RB, WR / TE, the line).
 *  x: 0 left → 1 right; y: 0 own goal line → 1 midfield. */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { CourtMap, COURT_LINE, type CourtProps } from '../../components/CourtMap';
import type { LineupSlot } from '../../core/types';

type Slot = Omit<LineupSlot, 'playerId' | 'playerName'>;

const FLAG: Slot[] = [
  { position: 'C', x: 0.5, y: 0.72 }, { position: 'QB', x: 0.5, y: 0.5 },
  { position: 'WR', x: 0.12, y: 0.74 }, { position: 'WR', x: 0.88, y: 0.74 }, { position: 'RB', x: 0.68, y: 0.5 },
];
const TACKLE: Slot[] = [
  { position: 'LT', x: 0.3, y: 0.78 }, { position: 'LG', x: 0.4, y: 0.78 }, { position: 'C', x: 0.5, y: 0.78 }, { position: 'RG', x: 0.6, y: 0.78 }, { position: 'RT', x: 0.7, y: 0.78 },
  { position: 'TE', x: 0.8, y: 0.76 }, { position: 'QB', x: 0.5, y: 0.62 }, { position: 'RB', x: 0.5, y: 0.44 },
  { position: 'WR', x: 0.06, y: 0.76 }, { position: 'WR', x: 0.94, y: 0.76 }, { position: 'WR', x: 0.18, y: 0.7 },
];

export function afFormation(perSide = 5): LineupSlot[] {
  const base = perSide <= 7 ? FLAG : TACKLE;
  const out = base.slice(0, Math.max(1, Math.min(base.length, perSide))).map((s) => ({ ...s }));
  // 6- / 7-a-side flag: extra receivers
  for (let i = out.length; i < Math.min(perSide, 11); i++) out.push({ position: 'WR', x: 0.25 + 0.1 * i, y: 0.6 });
  return out;
}

export const AFField: React.FC<CourtProps> = (props) => (
  <CourtMap {...props} surfaceColor="#2e7d32" aspectRatio={0.6}>
    <View style={m.half} />
    {[0.1, 0.3, 0.7, 0.9].map((t) => <View key={t} style={[m.line, { top: `${t * 100}%` }]} />)}
  </CourtMap>
);

const m = StyleSheet.create({
  half: { position: 'absolute', top: '50%', left: 0, right: 0, height: 2, backgroundColor: COURT_LINE },
  // goal lines (10 %) and the 20 / 15-yard marks
  line: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: COURT_LINE, opacity: 0.7 },
});
