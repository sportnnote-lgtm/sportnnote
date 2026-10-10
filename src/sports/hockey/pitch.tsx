/** SD-101 — the hockey pitch (shared CourtMap) and one side's formation:
 *  keeper, defence, midfield, forwards — sized to the players a side fields
 *  (11, indoor 6, Hockey5s 5). x: 0 left → 1 right; y: 0 own goal → 1 halfway. */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { CourtMap, COURT_LINE, type CourtProps } from '../../components/CourtMap';
import type { LineupSlot } from '../../core/types';

type Slot = Omit<LineupSlot, 'playerId' | 'playerName'>;

const ELEVEN: Slot[] = [
  { position: 'GK', x: 0.5, y: 0.04 },
  { position: 'LB', x: 0.18, y: 0.24 },
  { position: 'CB', x: 0.38, y: 0.2 },
  { position: 'CB', x: 0.62, y: 0.2 },
  { position: 'RB', x: 0.82, y: 0.24 },
  { position: 'LM', x: 0.22, y: 0.52 },
  { position: 'CM', x: 0.5, y: 0.48 },
  { position: 'RM', x: 0.78, y: 0.52 },
  { position: 'LF', x: 0.22, y: 0.82 },
  { position: 'CF', x: 0.5, y: 0.86 },
  { position: 'RF', x: 0.78, y: 0.82 },
];
const SIX: Slot[] = [
  { position: 'GK', x: 0.5, y: 0.04 },
  { position: 'LB', x: 0.3, y: 0.3 },
  { position: 'RB', x: 0.7, y: 0.3 },
  { position: 'CM', x: 0.5, y: 0.56 },
  { position: 'LF', x: 0.3, y: 0.84 },
  { position: 'RF', x: 0.7, y: 0.84 },
];
const FIVE: Slot[] = [
  { position: 'GK', x: 0.5, y: 0.04 },
  { position: 'LB', x: 0.3, y: 0.34 },
  { position: 'RB', x: 0.7, y: 0.34 },
  { position: 'LF', x: 0.3, y: 0.8 },
  { position: 'RF', x: 0.7, y: 0.8 },
];

export function hockeyFormation(perSide = 11): LineupSlot[] {
  const base = perSide <= 5 ? FIVE : perSide <= 6 ? SIX : ELEVEN;
  return base.slice(0, Math.max(1, perSide)).map((s) => ({ ...s }));
}

export const HockeyPitch: React.FC<CourtProps> = (props) => (
  <CourtMap {...props} surfaceColor="#1f5a99" aspectRatio={0.64}>
    <View style={m.half} />
    <View style={[m.line23, { top: '25%' }]} />
    <View style={[m.line23, { bottom: '25%' }]} />
    <View style={[m.circle, m.circleTop]} />
    <View style={[m.circle, m.circleBottom]} />
  </CourtMap>
);

const m = StyleSheet.create({
  half: { position: 'absolute', top: '50%', left: 0, right: 0, height: 1, backgroundColor: COURT_LINE },
  line23: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: COURT_LINE, opacity: 0.6 },
  // the shooting circles (D) at each end
  circle: { position: 'absolute', left: '25%', width: '50%', height: '17%', borderWidth: 1, borderColor: COURT_LINE, borderTopLeftRadius: 90, borderTopRightRadius: 90 },
  circleTop: { top: 0, transform: [{ rotate: '180deg' }] },
  circleBottom: { bottom: 0 },
});
