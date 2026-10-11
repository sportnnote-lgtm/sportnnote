/** SD-145 — the ice rink (shared CourtMap) and one side's starting six: the
 *  goalie (G), two defence (LD, RD) and three forwards (LW, C, RW). x: 0 left
 *  → 1 right; y: 0 own goal → 1 the red line. */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { CourtMap, COURT_LINE, type CourtProps } from '../../components/CourtMap';
import type { LineupSlot } from '../../core/types';

type Slot = Omit<LineupSlot, 'playerId' | 'playerName'>;

const SIX: Slot[] = [
  { position: 'G', x: 0.5, y: 0.06 },
  { position: 'LD', x: 0.3, y: 0.32 },
  { position: 'RD', x: 0.7, y: 0.32 },
  { position: 'LW', x: 0.18, y: 0.72 },
  { position: 'C', x: 0.5, y: 0.66 },
  { position: 'RW', x: 0.82, y: 0.72 },
];

export function iceHockeyFormation(perSide = 6): LineupSlot[] {
  return SIX.slice(0, Math.max(1, Math.min(6, perSide))).map((s) => ({ ...s }));
}

const RED = '#d64545';
const BLUE = '#2f6fd6';

export const IceRink: React.FC<CourtProps> = (props) => (
  <CourtMap {...props} surfaceColor="#5b8db8" aspectRatio={0.43}>
    <View style={[m.line, { top: '50%', backgroundColor: RED, height: 2 }]} />
    <View style={[m.line, { top: '33%', backgroundColor: BLUE, height: 2 }]} />
    <View style={[m.line, { bottom: '33%', backgroundColor: BLUE, height: 2 }]} />
    <View style={[m.line, { top: '6%', backgroundColor: RED, opacity: 0.7 }]} />
    <View style={[m.line, { bottom: '6%', backgroundColor: RED, opacity: 0.7 }]} />
    <View style={m.centre} />
  </CourtMap>
);

const m = StyleSheet.create({
  line: { position: 'absolute', left: 0, right: 0, height: 1 },
  centre: { position: 'absolute', top: '44%', left: '40%', width: '20%', height: '12%', borderWidth: 1, borderColor: COURT_LINE, borderRadius: 60 },
});
