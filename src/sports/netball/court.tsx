/** SD-146 — the netball court (shared CourtMap) and one side's line-up: the
 *  seven positions GS, GA, WA, C, WD, GD, GK. A schematic, defenders nearest
 *  their own goal (x: 0 left → 1 right; y: 0 own goal → 1 halfway). */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { CourtMap, COURT_LINE, type CourtProps } from '../../components/CourtMap';
import type { LineupSlot } from '../../core/types';

type Slot = Omit<LineupSlot, 'playerId' | 'playerName'>;

const SEVEN: Slot[] = [
  { position: 'GK', x: 0.5, y: 0.06 },
  { position: 'GD', x: 0.3, y: 0.24 },
  { position: 'WD', x: 0.78, y: 0.4 },
  { position: 'C', x: 0.5, y: 0.58 },
  { position: 'WA', x: 0.22, y: 0.74 },
  { position: 'GA', x: 0.68, y: 0.86 },
  { position: 'GS', x: 0.4, y: 0.98 },
];

export function netballFormation(): LineupSlot[] {
  return SEVEN.map((s) => ({ ...s }));
}

export const NetballCourt: React.FC<CourtProps> = (props) => (
  <CourtMap {...props} surfaceColor="#3b5b8f" aspectRatio={0.55}>
    {/* the transverse lines (thirds), the centre circle and the goal circles */}
    <View style={[m.line, { top: '33.3%' }]} />
    <View style={[m.line, { top: '66.6%' }]} />
    <View style={m.centre} />
    <View style={[m.circle, m.top]} />
    <View style={[m.circle, m.bottom]} />
  </CourtMap>
);

const m = StyleSheet.create({
  line: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: COURT_LINE },
  centre: { position: 'absolute', top: '48%', left: '46%', width: '8%', aspectRatio: 1, borderWidth: 1, borderColor: COURT_LINE, borderRadius: 40 },
  circle: { position: 'absolute', left: '25%', width: '50%', height: '20%', borderWidth: 1, borderColor: COURT_LINE, borderRadius: 160 },
  top: { top: '-10%' },
  bottom: { bottom: '-10%' },
});
