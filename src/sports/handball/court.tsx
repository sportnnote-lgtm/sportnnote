/** SD-102 — the handball court (shared CourtMap) and one side's line-up: the
 *  goalkeeper and six court players (left wing, left back, centre back, right
 *  back, right wing, pivot). x: 0 left → 1 right; y: 0 own goal → 1 halfway. */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { CourtMap, COURT_LINE, type CourtProps } from '../../components/CourtMap';
import type { LineupSlot } from '../../core/types';

type Slot = Omit<LineupSlot, 'playerId' | 'playerName'>;

const SEVEN: Slot[] = [
  { position: 'GK', x: 0.5, y: 0.05 },
  { position: 'LW', x: 0.1, y: 0.62 },
  { position: 'LB', x: 0.28, y: 0.48 },
  { position: 'CB', x: 0.5, y: 0.52 },
  { position: 'RB', x: 0.72, y: 0.48 },
  { position: 'RW', x: 0.9, y: 0.62 },
  { position: 'P', x: 0.5, y: 0.8 },
];

export function handballFormation(perSide = 7): LineupSlot[] {
  return SEVEN.slice(0, Math.max(1, Math.min(7, perSide))).map((s) => ({ ...s }));
}

export const HandballCourt: React.FC<CourtProps> = (props) => (
  <CourtMap {...props} surfaceColor="#2b6cb0" aspectRatio={0.5}>
    <View style={m.half} />
    {/* the 6 m goal-area lines and 9 m free-throw lines at each end */}
    <View style={[m.arc6, m.top]} />
    <View style={[m.arc9, m.top]} />
    <View style={[m.arc6, m.bottom]} />
    <View style={[m.arc9, m.bottom]} />
  </CourtMap>
);

const m = StyleSheet.create({
  half: { position: 'absolute', top: '50%', left: 0, right: 0, height: 1, backgroundColor: COURT_LINE },
  arc6: { position: 'absolute', left: '20%', width: '60%', height: '15%', borderWidth: 1, borderColor: COURT_LINE, borderRadius: 120 },
  arc9: { position: 'absolute', left: '10%', width: '80%', height: '22.5%', borderWidth: 1, borderColor: COURT_LINE, borderStyle: 'dashed', borderRadius: 160, opacity: 0.6 },
  top: { top: '-7.5%' },
  bottom: { bottom: '-7.5%' },
});
